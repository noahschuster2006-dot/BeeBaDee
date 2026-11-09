// One table of up to six players: connections, chat, persistence and pacing of enemy turns.
// Transport- and storage-agnostic: the Node server wraps WebSockets and files around it, and a
// browser-hosted table (GitHub Pages) wraps peer-to-peer data channels and localStorage.
import { CAMPAIGNS } from "../shared/campaigns";
import { describeRoll, roll } from "../shared/dice";
import { MAX_PLAYERS, type ClientMsg, type ServerMsg } from "../shared/protocol";
import { ANCESTRIES, STANDARD_ARRAY, grantXp, newCharacter, RESKIN } from "../shared/rules";
import { ABILITIES } from "../shared/types";
import type { AvatarLook, CampaignId, Character, ChatMessage, RoomState, Transform } from "../shared/types";
import { emptyRoom, Game, uid } from "./game";
import { AiGameMaster, type GmConfig } from "./gm/ai";
import { enemyTurn } from "./tactics";

const DROP_AFTER_MS = 120_000;
type Timer = ReturnType<typeof setTimeout>;

/** One connected client, however it's connected. */
export interface Link { send(data: string): void; close(): void; isOpen(): boolean }
export interface RoomStorage { load(id: string): string | null; save(id: string, data: string): void }
export interface RoomOptions { storage?: RoomStorage; gm?: GmConfig; stepMs?: number }

interface Conn { ws: Link; playerId: string }

function randomToken() {
  const b = new Uint8Array(12);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export class Room {
  readonly id: string;
  game: Game;
  gm: AiGameMaster;
  private conns = new Set<Conn>();
  private tokens = new Map<string, string>(); // resume token -> player id
  private transforms: Record<string, Transform> = {};
  private chat: ChatMessage[] = [];
  private dirty = false;
  private saveTimer: Timer | null = null;
  private enemyRunning = false;
  private dropTimers = new Map<string, Timer>();
  private tick: ReturnType<typeof setInterval>;
  private storage?: RoomStorage;
  private stepMs: number;
  private lastHint = 0;

  constructor(id: string, opts: RoomOptions = {}) {
    this.id = id;
    this.storage = opts.storage;
    this.stepMs = opts.stepMs ?? 750;
    const saved = this.load();
    const state = saved ?? emptyRoom(id);
    this.game = new Game(state, {
      chat: (m) => this.post(m),
      fx: (kind, tokenId, text) => this.broadcast({ t: "fx", kind, tokenId, text }),
      dice: (by, r) => this.broadcast({ t: "dice", by, label: r.label, values: r.terms.flatMap((t) => t.rolls.map((v) => ({ sides: t.sides, value: v }))) }),
      gmEvent: (text, opts) => this.gm?.push(text, !!opts?.urgent),
      changed: () => this.markDirty(),
    });
    this.gm = new AiGameMaster(this.game, {
      narrate: (text, npc) => this.post({ channel: "gm", from: npc ?? "Game Master", npc, text }),
      system: (text) => this.post({ channel: "system", from: "Table", text }),
      thinking: (on) => { this.game.state.gm.thinking = on; this.markDirty(); },
      changed: () => this.markDirty(),
    }, opts.gm);
    this.game.aiEnabled = this.gm.enabled;
    state.gm.mode = this.gm.enabled ? "ai" : "scripted";
    this.tick = setInterval(() => this.broadcastTransforms(), 1000 / 15);
  }

  get playerCount() { return Object.values(this.game.state.players).filter((p) => p.connected).length; }

  // ---------- connections ----------

  join(ws: Link, hello: Extract<ClientMsg, { t: "hello" }>) {
    const s = this.game.state;
    let pid = hello.resume ? this.tokens.get(hello.resume) : undefined;
    if (pid && !s.players[pid]) pid = undefined;
    if (!pid && this.playerCount >= MAX_PLAYERS) {
      this.send(ws, { t: "error", message: `This table is full (${MAX_PLAYERS} players). Try another room code.` });
      ws.close();
      return null;
    }
    let token = hello.resume && pid ? hello.resume : "";
    if (!pid) {
      pid = uid("pl");
      token = randomToken();
      this.tokens.set(token, pid);
      const hasHost = Object.values(s.players).some((p) => p.host && p.connected);
      s.players[pid] = {
        id: pid, name: cleanName(hello.name), look: sanitizeLook(hello.look), character: sanitizeCharacter(hello.character),
        host: !hasHost, ready: false, connected: true,
      };
      this.post({ channel: "system", from: "Table", text: `🚪 ${s.players[pid].name} walks into the ${s.phase === "pub" ? "Gilded Mug" : "game"}.` });
    } else {
      const p = s.players[pid];
      p.connected = true;
      p.name = cleanName(hello.name);
      p.look = sanitizeLook(hello.look);
      if (hello.character && !p.character) p.character = sanitizeCharacter(hello.character);
      clearTimeout(this.dropTimers.get(pid));
      this.post({ channel: "system", from: "Table", text: `🔌 ${p.name} reconnected.` });
    }
    const conn: Conn = { ws, playerId: pid };
    this.conns.add(conn);
    this.transforms[pid] ??= { x: (Math.random() - 0.5) * 3, y: 0, z: 6 + Math.random() * 2, ry: Math.PI, moving: 0, air: false, emote: "none" };
    this.game.ensurePcToken(s.players[pid]);
    this.gm.record(`[${s.players[pid].name} joined]`);
    this.ensureHost();
    this.send(ws, { t: "welcome", you: pid, token, state: s, chat: this.visibleChat(pid), aiEnabled: this.gm.enabled });
    this.markDirty();
    return conn;
  }

  leave(conn: Conn) {
    this.conns.delete(conn);
    const pid = conn.playerId;
    const p = this.game.state.players[pid];
    if (!p) return;
    if ([...this.conns].some((c) => c.playerId === pid)) return;
    p.connected = false;
    p.talking = false;
    this.post({ channel: "system", from: "Table", text: `👋 ${p.name} stepped away.` });
    this.ensureHost();
    this.dropTimers.set(pid, setTimeout(() => {
      if (this.game.state.players[pid]?.connected) return;
      this.game.removePcToken(pid);
      delete this.game.state.players[pid];
      delete this.transforms[pid];
      this.ensureHost();
      this.markDirty();
    }, DROP_AFTER_MS));
    this.markDirty();
  }

  get empty() { return this.conns.size === 0; }

  dispose() {
    clearInterval(this.tick);
    this.flushSave();
  }

  private ensureHost() {
    const ps = Object.values(this.game.state.players);
    if (ps.some((p) => p.host && p.connected)) return;
    for (const p of ps) p.host = false;
    const next = ps.find((p) => p.connected);
    if (next) next.host = true;
  }

  // ---------- messages ----------

  handle(conn: Conn, msg: ClientMsg) {
    const s = this.game.state;
    const pid = conn.playerId;
    const me = s.players[pid];
    if (!me) return;
    const err = (message: string) => this.send(conn.ws, { t: "error", message });

    switch (msg.t) {
      case "move": {
        const tr = msg.tr;
        if (![tr.x, tr.y, tr.z, tr.ry].every(Number.isFinite)) return;
        this.transforms[pid] = { ...tr, x: clamp(tr.x, -80, 80), y: clamp(tr.y, -5, 30), z: clamp(tr.z, -80, 80) };
        return;
      }
      case "look": me.look = sanitizeLook(msg.look); this.game.ensurePcToken(me); break;
      case "character": {
        if (s.combat.active && s.board.tokens.some((t) => t.ownerId === pid)) return err("You can't swap characters in the middle of a fight.");
        me.character = sanitizeCharacter(msg.character);
        if (me.character) this.game.catchUp(me);
        if (s.phase === "campaign") {
          this.game.removePcToken(pid);
          this.game.ensurePcToken(me);
        }
        break;
      }
      case "chat": return this.onChat(pid, msg.text, msg.channel);
      case "emote": if (this.transforms[pid]) this.transforms[pid].emote = msg.emote; return;
      case "ready": me.ready = !!msg.ready; break;
      case "vote":
        if (!CAMPAIGNS[msg.campaign]) return;
        s.campaignVote = msg.campaign;
        this.post({ channel: "system", from: "Table", text: `🗳️ ${me.name} suggests: ${CAMPAIGNS[msg.campaign].name}` });
        break;
      case "startCampaign": {
        if (!me.host) return err("Only the host can start an adventure.");
        const c = CAMPAIGNS[msg.campaign];
        if (!c) return;
        // anyone without a character gets a pregenerated hero for this campaign
        let i = 0;
        for (const p of Object.values(s.players)) {
          if (p.character || !p.connected) continue;
          const pre = c.pregens[i++ % c.pregens.length];
          p.character = newCharacter({ id: uid("c"), name: pre.name, cls: pre.cls, ancestry: pre.ancestry, campaign: c.id, backstory: pre.backstory });
          this.post({ channel: "system", from: "Table", text: `🎭 ${p.name} is given a ready-made hero: ${pre.name}, ${RESKIN[c.id].classes[pre.cls]}.` });
        }
        this.gm.reset();
        const resume = msg.resume ? String(s.flags[`lastScene:${c.id}`] ?? "") : undefined;
        this.game.startCampaign(c.id, resume || undefined);
        this.gm.push(`The party (${Object.values(s.players).filter((p) => p.character).map((p) => p.character!.name).join(", ")}) begins the campaign "${c.name}". The scene intro has been narrated. Greet them in character with one short atmospheric line.`, true);
        break;
      }
      case "returnToPub": {
        if (!me.host) return err("Only the host can end the session.");
        if (s.campaign && s.phase === "campaign") {
          s.flags[`lastScene:${s.campaign}`] = s.board.sceneId;
          s.flags[`story:${s.campaign}`] = JSON.stringify(this.game.storySnapshot());
        }
        const keep = Object.fromEntries(Object.entries(s.flags).filter(([k]) => k.startsWith("lastScene:") || k.startsWith("story:")));
        this.game.returnToPub();
        s.flags = keep;
        this.gm.reset();
        break;
      }
      case "board": {
        const e = this.game.act(pid, msg.action);
        if (e) return err(e);
        if (s.campaign) s.flags[`lastScene:${s.campaign}`] = s.board.sceneId;
        break;
      }
      case "rollCheck": this.game.resolveCheck(pid, msg.checkId); break;
      case "choose": this.game.vote(pid, msg.choiceId, Number(msg.option), !!msg.force); break;
      case "skillRoll": this.game.sheetRoll(pid, msg.skill, !!msg.save); break;
      case "roll": return this.doRoll(pid, msg.expr, msg.label, msg.secret);
      case "rest": { const e = this.game.rest(msg.kind); if (e) return err(e); break; }
      case "talking": me.talking = !!msg.talking; break;
      case "ping": this.broadcast({ t: "ping", from: pid, x: msg.x, y: msg.y }); return;
      case "rtc": {
        // WebRTC voice signalling relay (peer-to-peer audio between players)
        for (const c of this.conns) if (c.playerId === msg.to) this.send(c.ws, { t: "rtc", from: pid, data: msg.data });
        return;
      }
      default: return;
    }
    this.markDirty();
  }

  private onChat(pid: string, raw: string, channel?: "ic" | "ooc") {
    const s = this.game.state;
    const me = s.players[pid];
    const text = String(raw ?? "").slice(0, 500).trim();
    if (!text) return;
    const who = me.character && s.phase === "campaign" ? me.character.name : me.name;

    if (text.startsWith("/")) {
      const [cmd, ...rest] = text.slice(1).split(" ");
      const arg = rest.join(" ").trim();
      switch (cmd.toLowerCase()) {
        case "r": case "roll": return this.doRoll(pid, arg.split(" ")[0] || "1d20", arg.split(" ").slice(1).join(" ") || undefined);
        case "gr": case "sr": return this.doRoll(pid, arg || "1d20", undefined, true);
        case "w": case "whisper": {
          const [target, ...m] = rest;
          const to = Object.values(s.players).find((p) => p.name.toLowerCase() === (target ?? "").toLowerCase() || p.character?.name.toLowerCase().startsWith((target ?? "").toLowerCase()));
          if (!to || !m.length) return this.sysTo(pid, "Usage: /w <name> <message>");
          return this.post({ channel: "whisper", from: me.name, fromId: pid, to: to.id, text: m.join(" ") });
        }
        case "me": case "em":
          this.post({ channel: "emote", from: who, fromId: pid, text: `${who} ${arg}` });
          this.gm.record(`* ${who} ${arg}`);
          if (s.phase === "campaign") this.toGm(`${who} (action): ${arg}`);
          return;
        case "ooc": this.post({ channel: "ooc", from: me.name, fromId: pid, text: arg }); return;
        case "gm": case "ask":
          this.post({ channel: "ic", from: who, fromId: pid, text: `(to the GM) ${arg}` });
          this.gm.record(`${who} → GM: ${arg}`);
          return this.toGm(`${who} asks the GM directly: ${arg}`, true);
        case "help":
          return this.sysTo(pid, "Commands: /r 1d20+5 [label] · /r 2d20kh1+3 (advantage) · /gr 1d20 (secret roll) · /w name msg · /me action · /ooc msg · /gm question");
        default: return this.sysTo(pid, `Unknown command /${cmd}. Try /help.`);
      }
    }
    const ch = channel ?? (s.phase === "campaign" ? "ic" : "ooc");
    this.post({ channel: ch, from: ch === "ic" ? who : me.name, fromId: pid, text });
    this.gm.record(`${ch === "ic" ? who : `${me.name} (OOC)`}: ${text}`);
    if (ch === "ic" && s.phase === "campaign") this.toGm(`${who} says: "${text}"`);
    else if (s.phase === "pub" && /\b(mags|barkeep|bartender)\b/i.test(text)) this.toGm(`${me.name} says to you, the barkeep: "${text}"`, true);
  }

  private toGm(text: string, direct = false) {
    if (this.gm.enabled) { this.gm.push(text, true); return; }
    // scripted narrator: gentle nudges toward the objective, at most every 20 seconds
    if (!direct && Date.now() - this.lastHint < 20_000) return;
    this.lastHint = Date.now();
    const s = this.game.state;
    if (s.phase === "pub") {
      this.post({ channel: "gm", from: "Mags", npc: "Mags", text: pick(["Another round? The quest board's got three jobs that need doing, love.", "Heard the dead won't stay buried up Thornwick way…", "There's a lantern-folk tale going round about a sunken hive. Spooky stuff."]) });
      return;
    }
    const npc = s.board.tokens.find((t) => t.kind === "npc" && !t.conditions.includes("dead"));
    const hint = s.combat.active ? "The fight isn't over yet — use the board to act on your turn." : `The world waits for you. 🎯 ${s.gm.objective} (Walk your token around, click props next to you to interact${npc ? `, or talk to ${npc.name}` : ""}.)`;
    this.post({ channel: "gm", from: "Game Master", text: hint });
  }

  private doRoll(pid: string, expr: string, label?: string, secret = false) {
    const me = this.game.state.players[pid];
    try {
      const r = roll(expr, this.game.rng, label);
      const who = me.character?.name ?? me.name;
      if (secret) {
        this.sysTo(pid, `🤫 Secret roll: ${describeRoll(r)}`);
        return;
      }
      this.broadcast({ t: "dice", by: who, label, values: r.terms.flatMap((t) => t.rolls.map((v) => ({ sides: t.sides, value: v }))) });
      this.post({ channel: "roll", from: who, fromId: pid, text: `${who} rolls ${label ? `${label}: ` : ""}${r.total}`, roll: r });
      this.gm.record(`${who} rolled ${expr}${label ? ` (${label})` : ""} = ${r.total}`);
    } catch (e) {
      this.sysTo(pid, `🎲 ${e instanceof Error ? e.message : "Bad roll"}. Example: /r 1d20+5`);
    }
  }

  private sysTo(pid: string, text: string) {
    for (const c of this.conns) if (c.playerId === pid)
      this.send(c.ws, { t: "chat", msg: { id: uid("m"), ts: Date.now(), channel: "system", from: "Table", text } });
  }

  private post(m: Omit<ChatMessage, "id" | "ts">) {
    const msg: ChatMessage = { id: uid("m"), ts: Date.now(), ...m };
    this.chat.push(msg);
    if (this.chat.length > 300) this.chat.splice(0, this.chat.length - 300);
    if (msg.channel === "gm" || msg.channel === "system") this.gm?.record(`${msg.npc ? `${msg.npc}: ` : msg.channel === "gm" ? "GM: " : "* "}${msg.text}`);
    for (const c of this.conns) {
      if (msg.channel === "whisper" && c.playerId !== msg.to && c.playerId !== msg.fromId) continue;
      this.send(c.ws, { t: "chat", msg });
    }
  }

  private visibleChat(pid: string) {
    return this.chat.filter((m) => m.channel !== "whisper" || m.to === pid || m.fromId === pid).slice(-120);
  }

  // ---------- broadcasting ----------

  private markDirty() {
    if (this.dirty) return;
    this.dirty = true;
    queueMicrotask(() => {
      this.dirty = false;
      this.broadcast({ t: "state", state: this.game.state });
      this.scheduleSave();
      this.runEnemies();
    });
  }

  private broadcastTransforms() {
    if (this.conns.size < 1) return;
    const tr: Record<string, Transform> = {};
    for (const [pid, t] of Object.entries(this.transforms)) if (this.game.state.players[pid]?.connected) tr[pid] = t;
    this.broadcast({ t: "transforms", tr });
  }

  broadcast(m: ServerMsg) {
    const data = JSON.stringify(m);
    for (const c of this.conns) if (c.ws.isOpen()) c.ws.send(data);
  }

  private send(ws: Link, m: ServerMsg) {
    if (ws.isOpen()) ws.send(JSON.stringify(m));
  }

  /** Plays out enemy turns step by step so everyone can watch them happen. */
  private runEnemies() {
    if (this.enemyRunning) return;
    const cur = this.game.current();
    if (!cur || cur.kind === "pc") return;
    this.enemyRunning = true;
    const steps = enemyTurn(this.game, cur);
    const next = () => {
      const step = steps.shift();
      if (!step || !this.game.state.combat.active) {
        this.enemyRunning = false;
        this.markDirty();
        return;
      }
      try { step(); } catch (e) { console.error("[enemy]", e); }
      this.broadcast({ t: "state", state: this.game.state });
      setTimeout(next, this.stepMs);
    };
    setTimeout(next, this.stepMs);
  }

  // ---------- persistence ----------


  private load(): RoomState | null {
    try {
      const text = this.storage?.load(this.id);
      if (!text) return null;
      const raw = JSON.parse(text) as { state: RoomState; tokens: [string, string][] };
      for (const [k, v] of raw.tokens ?? []) this.tokens.set(k, v);
      const st = raw.state;
      // a restored table always starts in the pub; the host can resume the campaign from the quest board
      const fresh = emptyRoom(this.id);
      fresh.players = st.players;
      for (const p of Object.values(fresh.players)) { p.connected = false; p.talking = false; p.ready = false; }
      fresh.flags = Object.fromEntries(Object.entries(st.flags ?? {}).filter(([k]) => k.startsWith("lastScene:") || k.startsWith("story:")));
      if (st.phase === "campaign" && st.campaign) {
        fresh.flags[`lastScene:${st.campaign}`] = st.board.sceneId;
        const story = Object.fromEntries(Object.entries(st.flags ?? {}).filter(([k]) => !k.startsWith("lastScene:") && !k.startsWith("story:") && !k.startsWith("spawned:") && !k.startsWith("killed:")));
        fresh.flags[`story:${st.campaign}`] = JSON.stringify(story);
      }
      // forget players who never came back after a restart
      setTimeout(() => {
        for (const [pid, p] of Object.entries(this.game.state.players)) if (!p.connected) delete this.game.state.players[pid];
        this.markDirty();
      }, DROP_AFTER_MS);
      return fresh;
    } catch (e) {
      console.warn(`[room ${this.id}] could not load save:`, e);
      return null;
    }
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flushSave(), 3000);
  }

  private flushSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      const st = this.game.state;
      if (st.phase === "campaign" && st.campaign) st.flags[`story:${st.campaign}`] = JSON.stringify(this.game.storySnapshot());
      this.storage?.save(this.id, JSON.stringify({ state: this.game.state, tokens: [...this.tokens] }));
    } catch (e) {
      console.warn(`[room ${this.id}] save failed:`, e);
    }
  }
}

// ---------- input hygiene ----------

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const COLOR = /^#[0-9a-f]{6}$/i;

function cleanName(n: string) {
  return String(n ?? "").replace(/[^\p{L}\p{N} _'.-]/gu, "").trim().slice(0, 20) || "Wanderer";
}

const DEFAULT_LOOK: AvatarLook = {
  head: "human", height: 1, build: 1, skin: "#c99a76", hair: "short", hairColor: "#3b2a1e", outfit: "tunic",
  primary: "#6a8cff", secondary: "#2b2f45", hat: "none", accessory: "none", eyes: "#222222",
};

export function sanitizeLook(l: Partial<AvatarLook> | undefined): AvatarLook {
  const o = { ...DEFAULT_LOOK, ...(l ?? {}) };
  const opts = {
    head: ["human", "bug", "robot", "beast", "skull"], hair: ["none", "short", "long", "mohawk", "bun", "spiky"],
    outfit: ["tunic", "robe", "armor", "jacket", "hoodie", "cloak"], hat: ["none", "wizard", "hood", "crown", "visor", "horns", "antennae", "tophat"],
    accessory: ["none", "cape", "backpack", "wings", "scarf"],
  } as const;
  for (const [k, list] of Object.entries(opts)) if (!(list as readonly string[]).includes((o as Record<string, unknown>)[k] as string)) (o as Record<string, unknown>)[k] = (DEFAULT_LOOK as unknown as Record<string, unknown>)[k];
  for (const k of ["skin", "hairColor", "primary", "secondary", "eyes"] as const) if (!COLOR.test(o[k])) o[k] = DEFAULT_LOOK[k];
  o.height = clamp(Number(o.height) || 1, 0.85, 1.15);
  o.build = clamp(Number(o.build) || 1, 0.8, 1.25);
  return o;
}

/** Characters come from the client, so rebuild them from rules to stop tampering. */
export function sanitizeCharacter(c: Character | null | undefined): Character | null {
  if (!c || typeof c !== "object") return null;
  try {
    const fresh = newCharacter({
      id: String(c.id || uid("c")).slice(0, 40), name: cleanName(c.name), cls: c.cls, ancestry: c.ancestry,
      campaign: (c.campaign in CAMPAIGNS ? c.campaign : "any") as CampaignId | "any",
      scores: validScores(c.abilities, c.ancestry) ?? undefined, skills: c.skills, backstory: String(c.backstory ?? "").slice(0, 300),
    });
    // keep earned progress within sane limits
    fresh.xp = clamp(Math.floor(Number(c.xp) || 0), 0, 6500);
    const xp = fresh.xp; fresh.xp = 0; grantXp(fresh, xp);
    fresh.gold = clamp(Math.floor(Number(c.gold) || fresh.gold), 0, 5000);
    if (Array.isArray(c.inventory)) {
      fresh.inventory = c.inventory.slice(0, 30).map((i) => ({
        id: String(i.id).slice(0, 30), name: String(i.name).slice(0, 60), kind: (["weapon", "armor", "consumable", "gear", "key", "treasure"].includes(i.kind) ? i.kind : "gear"),
        desc: i.desc ? String(i.desc).slice(0, 200) : undefined, qty: clamp(Math.floor(Number(i.qty) || 1), 1, 20),
        heal: i.heal && /^[1-4]d[4-8]([+-]\d)?$/.test(i.heal) ? i.heal : undefined,
      }));
    }
    if (Number.isFinite(c.hp)) fresh.hp = clamp(Math.floor(c.hp), 0, fresh.maxHp);
    return fresh;
  } catch {
    return null;
  }
}


function validScores(a: Character["abilities"] | undefined, ancestry: Character["ancestry"]) {
  if (!a) return null;
  const anc = ANCESTRIES[ancestry];
  if (!anc) return null;
  const base = {} as Character["abilities"];
  for (const k of ABILITIES) {
    const v = Math.floor(Number(a[k]) - (anc.bonus[k] ?? 0));
    if (!Number.isFinite(v) || v < 8 || v > 15) return null;
    base[k] = v;
  }
  // point-buy (27 points) or standard array
  const cost = (v: number) => (v <= 13 ? v - 8 : v === 14 ? 7 : 9);
  const total = ABILITIES.reduce((s, k) => s + cost(base[k]), 0);
  const sorted = ABILITIES.map((k) => base[k]).sort((x, y) => y - x).join(",");
  if (total <= 27 || sorted === STANDARD_ARRAY.join(",")) return base;
  return null;
}
