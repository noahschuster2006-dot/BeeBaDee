// Authoritative game state for one room: rules resolution, scenes and the scripted director.
// Networking lives in room.ts; the AI game master in gm/ai.ts drives this through the same API.

import { CAMPAIGNS, type ActionDef, type SceneDef, type TriggerDef } from "../shared/campaigns";
import {
  canStand, dist, hasLos, parseMap, partyVision, pathTo, revealRect, tokenDist, updateExplored, occupied,
} from "../shared/board";
import { critExpr, defaultRng, naturalD20, roll, type Rng } from "../shared/dice";
import type { BoardAction } from "../shared/protocol";
import {
  ANCESTRIES, CLASSES, MONSTERS, RESKIN, SKILL_ABILITY, SKILL_LABEL, ABILITY_LABEL, SPELLS,
  armorClass, attackBonus, cantripDice, displayName, grantXp, isDown, isHostile, mod, profBonus,
  saveBonus, skillBonus, sneakDice, spellAttackBonus, spellDC, shortRest, longRest, type MonsterDef,
} from "../shared/rules";
import type {
  Ability, BoardState, CampaignId, Character, ChatMessage, Condition, Item, PendingCheck, PlayerInfo,
  RollResult, RoomState, Skill, Token, TurnBudget,
} from "../shared/types";

export interface GameEvents {
  chat(msg: Omit<ChatMessage, "id" | "ts">): void;
  fx(kind: "hit" | "miss" | "heal" | "spell" | "death" | "levelup" | "scene", tokenId?: string, text?: string): void;
  dice(by: string, r: RollResult): void;
  /** Something happened that the AI game master should hear about. */
  gmEvent(text: string, opts?: { urgent?: boolean; direction?: string }): void;
  changed(): void;
}

let idSeq = 0;
export const uid = (p = "id") => `${p}${Date.now().toString(36)}${(idSeq++).toString(36)}`;

const PUB_BOARD: BoardState = {
  sceneId: "pub", title: "The Gilded Mug", width: 0, height: 0, tiles: [], explored: "", tokens: [], props: [], theme: "pub",
};

export function emptyRoom(id: string): RoomState {
  return {
    id, phase: "pub", campaign: null, campaignVote: null, players: {},
    board: structuredClone(PUB_BOARD),
    combat: { active: false, round: 0, order: [], turn: 0 },
    env: { preset: "pub", weather: "clear", time: "night", seed: 1 },
    checks: [], gm: { mode: "scripted", thinking: false, objective: "Gather your party at the Gilded Mug." }, flags: {},
  };
}

interface DormantSpawn { group: string; token: Token }

interface CheckBranch { success: ActionDef[]; fail: ActionDef[] }

export class Game {
  state: RoomState;
  rng: Rng;
  aiEnabled = false;
  private dormant: DormantSpawn[] = [];
  private branches = new Map<string, CheckBranch>();
  private fired = new Set<string>();
  private ev: GameEvents;
  private actionDepth = 0;

  constructor(state: RoomState, ev: GameEvents, rng: Rng = defaultRng) {
    this.state = state;
    this.ev = ev;
    this.rng = rng;
  }

  // ---------- helpers ----------

  get board() { return this.state.board; }
  get campaign() { return this.state.campaign ? CAMPAIGNS[this.state.campaign] : null; }
  get scene(): SceneDef | null { return this.campaign?.scenes[this.board.sceneId] ?? null; }

  token(id: string) { return this.board.tokens.find((t) => t.id === id); }
  tokenByName(name: string) {
    const n = name.toLowerCase();
    return this.board.tokens.find((t) => t.name.toLowerCase() === n)
      ?? this.board.tokens.find((t) => t.name.toLowerCase().includes(n));
  }
  playerFor(t: Token): PlayerInfo | undefined { return t.ownerId ? this.state.players[t.ownerId] : undefined; }
  charFor(t: Token): Character | null { return this.playerFor(t)?.character ?? null; }
  pcTokens() { return this.board.tokens.filter((t) => t.kind === "pc"); }
  livingPcs() { return this.pcTokens().filter((t) => !isDown(t)); }
  hostiles() { return this.board.tokens.filter((t) => isHostile(t) && !isDown(t)); }
  current(): Token | undefined {
    const c = this.state.combat;
    return c.active ? this.token(c.order[c.turn]) : undefined;
  }
  name(id: string | undefined, base: string) { return displayName(this.state.campaign, id ?? "", base); }

  private say(text: string, channel: ChatMessage["channel"] = "system", extra: Partial<ChatMessage> = {}) {
    this.ev.chat({ channel, from: channel === "gm" ? "Game Master" : "Table", text, ...extra });
  }

  private rollPublic(by: string, expr: string, label: string) {
    const r = roll(expr, this.rng, label);
    this.ev.dice(by, r);
    return r;
  }

  // ---------- scenes ----------

  startCampaign(id: CampaignId, resumeScene?: string) {
    const c = CAMPAIGNS[id];
    this.state.phase = "campaign";
    this.state.campaign = id;
    this.state.flags = {};
    this.fired.clear();
    for (const p of Object.values(this.state.players)) {
      if (p.character) {
        p.character.deathSaves = { success: 0, fail: 0 };
        if (p.character.hp <= 0) p.character.hp = 1;
      }
    }
    this.say(`🎲 Campaign begins: ${c.name}`);
    this.loadScene(resumeScene && c.scenes[resumeScene] ? resumeScene : c.start);
  }

  returnToPub() {
    this.syncAllChars();
    this.state.phase = "pub";
    this.state.campaign = null;
    this.state.board = structuredClone(PUB_BOARD);
    this.state.combat = { active: false, round: 0, order: [], turn: 0 };
    this.state.env = { preset: "pub", weather: "clear", time: "night", seed: Math.floor(this.rng() * 1e6) };
    this.state.checks = [];
    this.state.gm.objective = "Gather your party at the Gilded Mug.";
    this.dormant = [];
    this.branches.clear();
    for (const p of Object.values(this.state.players)) if (p.character) longRest(p.character);
    this.say("🍺 The party returns to the Gilded Mug. Everyone is rested.");
    this.ev.changed();
  }

  loadScene(sceneId: string) {
    const c = this.campaign!;
    const scene = c.scenes[sceneId];
    if (!scene) throw new Error(`No scene ${sceneId}`);
    this.syncAllChars();
    const parsed = parseMap(scene.map);
    const b: BoardState = {
      sceneId, title: scene.title, width: parsed.width, height: parsed.height, tiles: parsed.tiles,
      explored: "0".repeat(parsed.width * parsed.height), tokens: [], props: [], theme: c.id,
    };
    this.state.board = b;
    this.state.combat = { active: false, round: 0, order: [], turn: 0 };
    this.state.checks = [];
    this.state.env = { ...scene.env, seed: Math.floor(this.rng() * 1e6) };
    this.state.gm.objective = scene.objective;
    this.dormant = [];
    this.branches.clear();

    const starts = [...(Object.entries(scene.marks).filter(([, m]) => m.type === "start").flatMap(([ch]) => parsed.marks[ch] ?? []))];
    const players = Object.values(this.state.players).filter((p) => p.character);
    players.forEach((p, i) => {
      const [x, y] = starts[i % Math.max(1, starts.length)] ?? [1, 1];
      b.tokens.push(this.makePcToken(p, x, y));
    });
    // spread out PCs that ended up stacked (more players than start marks)
    for (const t of b.tokens) {
      if (b.tokens.some((o) => o !== t && o.x === t.x && o.y === t.y)) this.nudge(t);
    }

    for (const [ch, mark] of Object.entries(scene.marks)) {
      for (const [x, y] of parsed.marks[ch] ?? []) {
        if (mark.type === "enemy") {
          const t = this.makeMonsterToken(MONSTERS[mark.monster], x, y, mark.name, mark.group);
          if (mark.dormant) this.dormant.push({ group: mark.group ?? "default", token: t });
          else b.tokens.push(t);
        } else if (mark.type === "npc") {
          b.tokens.push({
            id: uid("n"), kind: "npc", name: mark.name, x, y, size: 1, hp: 20, maxHp: 20, ac: 12, speed: 6,
            color: mark.color, glyph: mark.glyph, conditions: [], vision: 8, faction: mark.group, disposition: "friendly",
            statId: mark.monster,
          });
          if (mark.monster) {
            const t = b.tokens[b.tokens.length - 1];
            const m = MONSTERS[mark.monster];
            t.hp = t.maxHp = Math.max(1, roll(m.hp, this.rng).total);
            t.ac = m.ac;
            t.speed = m.speed;
            t.disposition = "neutral";
          }
        } else if (mark.type === "prop") {
          b.props.push({ id: uid("p"), x, y, kind: mark.kind, name: mark.name, interact: mark.interact, blocks: mark.blocks });
        }
      }
    }
    updateExplored(b);
    this.ev.fx("scene", undefined, scene.title);
    this.say(`📜 ${scene.title}`, "system");
    this.say(scene.intro, "gm");
    this.say(`🎯 Objective: ${scene.objective}`);
    this.ev.gmEvent(`New scene: "${scene.title}". The intro was already narrated to the players. Welcome them in one or two lines only if you have something to add; otherwise stay quiet.`);
    for (const tr of scene.triggers) if (tr.when.type === "start") this.fire(tr);
    this.checkAutoCombat();
    this.ev.changed();
  }

  private nudge(t: Token) {
    for (let r = 1; r < 6; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (canStand(this.board, t, t.x + dx, t.y + dy) && !this.board.tokens.some((o) => o !== t && o.x === t.x + dx && o.y === t.y + dy)) {
            t.x += dx; t.y += dy; return;
          }
        }
  }

  makePcToken(p: PlayerInfo, x: number, y: number): Token {
    const c = p.character!;
    return {
      id: uid("t"), kind: "pc", name: c.name, x, y, size: 1, hp: c.hp, maxHp: c.maxHp, ac: armorClass(c),
      speed: ANCESTRIES[c.ancestry].speed, ownerId: p.id, charId: c.id, color: p.look.primary,
      glyph: p.look.head === "bug" ? "🪲" : p.look.head === "robot" ? "🤖" : classGlyph(c.cls),
      conditions: c.hp <= 0 ? ["unconscious", "prone"] : [], vision: ANCESTRIES[c.ancestry].vision,
    };
  }

  makeMonsterToken(m: MonsterDef, x: number, y: number, name?: string, group?: string): Token {
    const hp = Math.max(1, roll(m.hp, this.rng).total);
    return {
      id: uid("e"), kind: "enemy", name: name ?? m.name, x, y, size: m.size ?? 1, hp, maxHp: hp, ac: m.ac, speed: m.speed,
      statId: m.id, color: m.color, glyph: m.glyph, conditions: [], vision: m.vision ?? 12, faction: group, disposition: "hostile",
    };
  }

  /** Player joined mid-campaign or created a character: give them a token near the party. */
  ensurePcToken(p: PlayerInfo) {
    if (this.state.phase !== "campaign" || !p.character) return;
    const existing = this.board.tokens.find((t) => t.ownerId === p.id);
    if (existing) {
      existing.name = p.character.name;
      existing.color = p.look.primary;
      return;
    }
    const anchor = this.pcTokens()[0];
    const t = this.makePcToken(p, anchor?.x ?? 1, anchor?.y ?? 1);
    this.board.tokens.push(t);
    this.nudge(t);
    if (this.state.combat.active) {
      t.initiative = roll(`1d20${signed(mod(p.character.abilities.dex))}`, this.rng).total;
      this.state.combat.order.push(t.id);
    }
    updateExplored(this.board);
  }

  removePcToken(playerId: string) {
    const t = this.board.tokens.find((x) => x.ownerId === playerId);
    if (!t) return;
    this.syncChar(t);
    this.board.tokens = this.board.tokens.filter((x) => x !== t);
    const c = this.state.combat;
    const idx = c.order.indexOf(t.id);
    if (idx >= 0) {
      const wasCurrent = idx === c.turn;
      c.order.splice(idx, 1);
      if (idx < c.turn) c.turn--;
      if (c.turn >= c.order.length) c.turn = 0;
      if (wasCurrent && c.order.length) this.beginTurn();
    }
  }

  syncChar(t: Token) {
    const c = this.charFor(t);
    if (c && c.id === t.charId) c.hp = Math.max(0, t.hp);
  }
  syncAllChars() { for (const t of this.pcTokens()) this.syncChar(t); }

  // ---------- director (scripted events) ----------

  fire(tr: TriggerDef, by?: Token) {
    if (!tr.repeat && this.fired.has(tr.id)) return false;
    if (tr.requiresFlag && !this.state.flags[tr.requiresFlag]) return false;
    this.fired.add(tr.id);
    this.run(tr.actions, by);
    return true;
  }

  fireById(id: string, by?: Token) {
    const tr = this.scene?.triggers.find((t) => t.id === id);
    if (!tr) return false;
    return this.fire(tr, by);
  }

  triggerList() {
    return (this.scene?.triggers ?? []).map((t) => ({ id: t.id, type: t.when.type, note: t.note ?? "", fired: this.fired.has(t.id) }));
  }

  run(actions: ActionDef[], by?: Token) {
    this.actionDepth++;
    try {
      for (const a of actions) {
        if (this.actionDepth > 12) break;
        this.runOne(a, by);
        if (a.do === "scene" || a.do === "end") break;
      }
    } finally {
      this.actionDepth--;
    }
  }

  private runOne(a: ActionDef, by?: Token) {
    switch (a.do) {
      case "narrate": this.say(a.text, "gm"); this.ev.gmEvent(`(Narrated by script) ${a.text}`); break;
      case "say": this.say(a.text, "gm", { npc: a.npc }); this.ev.gmEvent(`(Script) ${a.npc} said: "${a.text}"`); break;
      case "spawn": this.spawnGroup(a.group); break;
      case "hostile":
        for (const t of this.board.tokens.filter((x) => x.faction === a.group)) {
          t.kind = "enemy"; t.disposition = "hostile";
        }
        this.state.flags[`spawned:${a.group}`] = true;
        break;
      case "remove":
        this.board.tokens = this.board.tokens.filter((t) => t.faction !== a.group);
        this.dormant = this.dormant.filter((d) => d.group !== a.group);
        this.cleanOrder();
        break;
      case "combat": this.startCombat(); break;
      case "reveal": revealRect(this.board, ...a.rect); break;
      case "env":
        if (a.weather) this.state.env.weather = a.weather;
        if (a.time) this.state.env.time = a.time;
        if (a.preset) this.state.env.preset = a.preset;
        break;
      case "check": {
        const pc = by && by.kind === "pc" ? by : this.livingPcs()[0];
        if (!pc?.ownerId) { this.run(a.fail, by); break; }
        this.requestCheck(pc.ownerId, a.skill, a.dc, a.reason, "script", { success: a.success, fail: a.fail });
        break;
      }
      case "loot": this.giveLoot(by, a.item, a.gold); break;
      case "xp": this.awardXp(a.amount); break;
      case "heal":
        for (const t of this.pcTokens()) if (!t.conditions.includes("dead")) this.heal(t, roll(a.amount, this.rng).total);
        break;
      case "trap": {
        this.say(a.text, "gm");
        const victim = by ?? this.livingPcs()[0];
        if (victim) this.savingThrowDamage(victim, a.save, a.dc, a.damage, a.type, true, "Trap");
        break;
      }
      case "setTile": {
        const row = this.board.tiles[a.y];
        if (row) this.board.tiles[a.y] = row.slice(0, a.x) + a.tile + row.slice(a.x + 1);
        updateExplored(this.board);
        break;
      }
      case "scene": this.loadScene(a.id); break;
      case "flag": this.state.flags[a.key] = a.value; break;
      case "objective": this.state.gm.objective = a.text; this.say(`🎯 Objective: ${a.text}`); break;
      case "ai":
        if (this.aiEnabled) this.ev.gmEvent(`Director's note: ${a.direction}`, { urgent: true, direction: a.direction });
        else if (a.fallback) this.run(a.fallback, by);
        break;
      case "trigger": this.fireById(a.id, by); break;
      case "end":
        this.endCombat(true);
        this.say(`🏆 ${a.text}`, "gm");
        this.say("The campaign is complete! Return to the pub to start another adventure.");
        this.state.flags.complete = true;
        this.awardXp(200);
        this.ev.gmEvent(`The campaign has ended: ${a.text}. Give a short, heartfelt epilogue (two or three sentences) and congratulate the players.`);
        break;
    }
    this.ev.changed();
  }

  spawnGroup(group: string) {
    const spawns = this.dormant.filter((d) => d.group === group);
    this.dormant = this.dormant.filter((d) => d.group !== group);
    for (const s of spawns) {
      this.board.tokens.push(s.token);
      if (!canStand(this.board, s.token, s.token.x, s.token.y)) this.nudge(s.token);
      if (this.state.combat.active) this.addToInitiative(s.token);
    }
    this.state.flags[`spawned:${group}`] = true;
  }

  /** The AI GM can conjure extra creatures from the monster manual. */
  spawnMonster(monsterId: string, near: Token | null, count: number, hostile: boolean, name?: string) {
    const m = MONSTERS[monsterId];
    if (!m) return [];
    const group = `ai-${monsterId}`;
    const out: Token[] = [];
    for (let i = 0; i < Math.min(4, Math.max(1, count)); i++) {
      const anchor = near ?? this.livingPcs()[0];
      const t = this.makeMonsterToken(m, anchor?.x ?? 1, anchor?.y ?? 1, name, group);
      if (!hostile) { t.kind = "npc"; t.disposition = "neutral"; }
      // place 3-5 squares away from the anchor, visible if possible
      let placed = false;
      for (let r = 4; r < 10 && !placed; r++) {
        for (let k = 0; k < 24 && !placed; k++) {
          const ang = this.rng() * Math.PI * 2;
          const x = Math.round((anchor?.x ?? 1) + Math.cos(ang) * r);
          const y = Math.round((anchor?.y ?? 1) + Math.sin(ang) * r);
          if (canStand(this.board, t, x, y)) { t.x = x; t.y = y; placed = true; }
        }
      }
      if (!placed) this.nudge(t);
      this.board.tokens.push(t);
      if (this.state.combat.active && hostile) this.addToInitiative(t);
      out.push(t);
    }
    this.state.flags[`spawned:${group}`] = true;
    this.ev.changed();
    return out;
  }

  private giveLoot(by: Token | undefined, item?: Item, gold?: number) {
    const players = Object.values(this.state.players).filter((p) => p.character);
    if (gold && players.length) {
      const share = Math.max(1, Math.floor(gold / players.length));
      for (const p of players) p.character!.gold += share;
      const cur = this.state.campaign ? RESKIN[this.state.campaign].currency : "gold";
      this.say(`💰 The party finds ${gold} ${cur} (${share} each).`);
    }
    if (item) {
      const owner = (by && this.playerFor(by)) ?? players[0];
      if (!owner?.character) return;
      const inv = owner.character.inventory;
      const existing = inv.find((i) => i.id === item.id);
      if (existing) existing.qty = (existing.qty ?? 1) + (item.qty ?? 1);
      else inv.push({ ...item, id: item.id || uid("i") });
      this.say(`🎁 ${owner.character.name} receives ${item.name}${item.qty && item.qty > 1 ? ` ×${item.qty}` : ""}.`);
    }
  }

  giveItem(playerName: string, item: Item) {
    const p = Object.values(this.state.players).find((x) => x.character?.name.toLowerCase().includes(playerName.toLowerCase()) || x.name.toLowerCase() === playerName.toLowerCase());
    const tok = p ? this.board.tokens.find((t) => t.ownerId === p.id) : undefined;
    this.giveLoot(tok ?? undefined, item);
    this.ev.changed();
  }

  giveGold(amount: number) { this.giveLoot(undefined, undefined, amount); this.ev.changed(); }

  awardXp(amount: number) {
    if (amount <= 0) return;
    this.say(`⭐ The party earns ${amount} XP.`);
    for (const p of Object.values(this.state.players)) {
      const c = p.character;
      if (!c) continue;
      const t = this.board.tokens.find((x) => x.ownerId === p.id);
      if (t) this.syncChar(t);
      const lv = grantXp(c, amount);
      if (lv) {
        if (t) { t.maxHp = c.maxHp; t.hp = c.hp; t.ac = armorClass(c); }
        this.say(`🎉 ${c.name} reaches level ${lv}!`);
        this.ev.fx("levelup", t?.id, `Level ${lv}`);
      }
    }
  }

  // ---------- checks ----------

  requestCheck(playerId: string, skill: Skill | Ability, dc: number, reason: string, source: "ai" | "script", branch?: CheckBranch) {
    const chk: PendingCheck = { id: uid("c"), playerId, skill, dc, reason, source };
    this.state.checks.push(chk);
    if (branch) this.branches.set(chk.id, branch);
    const p = this.state.players[playerId];
    const label = (SKILL_LABEL as Record<string, string>)[skill] ?? ABILITY_LABEL[skill as Ability] ?? skill;
    this.say(`🎲 ${p?.character?.name ?? p?.name ?? "Someone"}, roll ${label}: ${reason}`, "gm");
    this.ev.changed();
    return chk;
  }

  resolveCheck(playerId: string, checkId: string) {
    const chk = this.state.checks.find((c) => c.id === checkId);
    if (!chk || chk.playerId !== playerId) return;
    const p = this.state.players[playerId];
    const c = p?.character;
    if (!c) return;
    this.state.checks = this.state.checks.filter((x) => x !== chk);
    const bonus = isSkill(chk.skill) ? skillBonus(c, chk.skill) : mod(c.abilities[chk.skill as Ability]);
    const label = isSkill(chk.skill) ? SKILL_LABEL[chk.skill] : ABILITY_LABEL[chk.skill as Ability];
    const r = roll(`1d20${signed(bonus)}`, this.rng, `${label} check`);
    const ok = r.total >= chk.dc;
    r.vs = { target: chk.reason, dc: chk.dc, success: ok, kind: "dc" };
    this.ev.dice(c.name, r);
    this.say(`${c.name} — ${label}: ${r.total} vs DC ${chk.dc} → ${ok ? "success" : "failure"}`, "roll", { roll: r, fromId: playerId, from: c.name });
    const branch = this.branches.get(chk.id);
    this.branches.delete(chk.id);
    const tok = this.board.tokens.find((t) => t.ownerId === playerId);
    if (branch) this.run(ok ? branch.success : branch.fail, tok);
    else this.ev.gmEvent(`${c.name} rolled ${label} for "${chk.reason}": ${r.total} vs DC ${chk.dc} — ${ok ? "SUCCESS" : "FAILURE"}. Narrate the outcome.`, { urgent: true });
    this.ev.changed();
  }

  /** Free roll from the character sheet (no DC): shared with the table and the GM. */
  sheetRoll(playerId: string, what: Skill | Ability, save: boolean) {
    const p = this.state.players[playerId];
    const c = p?.character;
    if (!c) return;
    let bonus: number;
    let label: string;
    if (save) { bonus = saveBonus(c, what as Ability); label = `${ABILITY_LABEL[what as Ability]} save`; }
    else if (isSkill(what)) { bonus = skillBonus(c, what); label = SKILL_LABEL[what]; }
    else { bonus = mod(c.abilities[what as Ability]); label = `${ABILITY_LABEL[what as Ability]} check`; }
    const r = roll(`1d20${signed(bonus)}`, this.rng, label);
    this.ev.dice(c.name, r);
    this.say(`${c.name} rolls ${label}: ${r.total}`, "roll", { roll: r, from: c.name, fromId: playerId });
  }

  // ---------- combat flow ----------

  startCombat() {
    const c = this.state.combat;
    if (c.active) return;
    const vis = partyVision(this.board);
    const participants = this.board.tokens.filter((t) => !t.conditions.includes("dead") && (t.kind === "pc" || isHostile(t)));
    for (const t of participants) {
      if (t.kind === "enemy" && !occupiesVisible(t, vis, this.board.width) && dist(t.x, t.y, ...nearestXY(t, this.livingPcs())) > 14) continue;
      this.rollInitiative(t);
    }
    const order = participants.filter((t) => t.initiative !== undefined).sort((a, b) => (b.initiative! - a.initiative!) || (a.kind === "pc" ? -1 : 1));
    if (!order.some((t) => isHostile(t))) return;
    c.active = true;
    c.round = 1;
    c.order = order.map((t) => t.id);
    c.turn = 0;
    this.say("⚔️ Roll for initiative!", "gm");
    this.say(order.map((t, i) => `${i + 1}. ${t.name} (${t.initiative})`).join("  "));
    this.ev.gmEvent(`Combat has started against: ${[...new Set(order.filter(isHostile).map((t) => t.name))].join(", ")}. The rules engine runs the fight; you may add brief flavour.`);
    this.beginTurn();
  }

  private rollInitiative(t: Token) {
    let dex = 10;
    if (t.kind === "pc") dex = this.charFor(t)?.abilities.dex ?? 10;
    else if (t.statId) dex = MONSTERS[t.statId]?.abilities.dex ?? 10;
    t.initiative = roll(`1d20${signed(mod(dex))}`, this.rng).total;
  }

  private addToInitiative(t: Token) {
    this.rollInitiative(t);
    const c = this.state.combat;
    const cur = c.order[c.turn];
    c.order.push(t.id);
    c.order.sort((a, b) => (this.token(b)?.initiative ?? 0) - (this.token(a)?.initiative ?? 0));
    c.turn = Math.max(0, c.order.indexOf(cur));
  }

  private cleanOrder() {
    const c = this.state.combat;
    if (!c.active) return;
    const cur = c.order[c.turn];
    c.order = c.order.filter((id) => this.token(id));
    c.turn = Math.max(0, c.order.indexOf(cur));
    if (c.turn >= c.order.length) c.turn = 0;
    this.checkCombatEnd();
  }

  endCombat(silent = false) {
    const c = this.state.combat;
    if (!c.active) return;
    c.active = false;
    c.order = [];
    c.turn = 0;
    for (const t of this.board.tokens) {
      t.turn = undefined;
      t.initiative = undefined;
      t.conditions = t.conditions.filter((x) => x !== "dodging" && x !== "disengaged" && x !== "raging");
    }
    if (!silent) this.say("🕊️ Combat ends.", "system");
    this.syncAllChars();
  }

  /** Returns true if combat ended. */
  checkCombatEnd(): boolean {
    const c = this.state.combat;
    if (!c.active) return false;
    if (this.hostiles().length === 0) {
      this.endCombat();
      // stabilise downed PCs after a won fight
      for (const t of this.pcTokens()) if (t.conditions.includes("unconscious") && !t.conditions.includes("dead")) {
        const ch = this.charFor(t);
        if (ch) ch.deathSaves = { success: 3, fail: 0 };
      }
      this.checkCleared();
      this.ev.gmEvent("The party won the fight. Describe the aftermath briefly if it adds something.");
      return true;
    }
    if (this.livingPcs().length === 0 && this.pcTokens().length > 0) {
      this.endCombat(true);
      this.say("💀 The party has fallen…", "gm");
      this.ev.gmEvent("Total party knockout. Narrate how they are dragged to safety / wake later, battered but alive (the engine revives them at 1 HP at the scene start).", { urgent: true });
      for (const t of this.pcTokens()) {
        if (t.conditions.includes("dead")) continue;
        t.conditions = [];
        t.hp = 1;
        const ch = this.charFor(t);
        if (ch) { ch.hp = 1; ch.deathSaves = { success: 0, fail: 0 }; }
      }
      // return enemies to full health, as if the party fled and regrouped
      for (const e of this.board.tokens.filter(isHostile)) if (!e.conditions.includes("dead")) e.hp = e.maxHp;
      return true;
    }
    return false;
  }

  private checkCleared() {
    const scene = this.scene;
    if (!scene) return;
    for (const tr of scene.triggers) {
      if (tr.when.type !== "cleared" || this.fired.has(tr.id)) continue;
      const g = tr.when.group;
      if (g) {
        if (!this.state.flags[`spawned:${g}`] && !this.board.tokens.some((t) => t.faction === g)) continue;
        if (!this.state.flags[`killed:${g}`]) continue;
        if (this.board.tokens.some((t) => t.faction === g && isHostile(t) && !isDown(t))) continue;
        if (this.dormant.some((d) => d.group === g)) continue;
      } else if (!this.state.flags.killedAny || this.hostiles().length > 0) continue;
      this.fire(tr);
    }
  }

  beginTurn() {
    const c = this.state.combat;
    const t = this.current();
    if (!t) return;
    if (t.conditions.includes("dead")) return this.nextTurn();
    t.turn = { movement: t.speed, action: true, bonus: true, reaction: true };
    t.conditions = t.conditions.filter((x) => x !== "dodging" && x !== "disengaged");
    if (t.kind === "pc" && t.conditions.includes("unconscious")) {
      const ch = this.charFor(t);
      if (ch && ch.deathSaves.success < 3) {
        this.deathSave(t);
        if (this.state.combat.active && this.current() === t && t.conditions.includes("unconscious")) return this.nextTurn();
        return;
      }
      return this.nextTurn();
    }
    if (t.kind !== "pc" && (t.conditions.includes("unconscious") || t.conditions.includes("stunned"))) {
      t.conditions = t.conditions.filter((x) => x !== "stunned");
      this.say(`${t.name} is out of it and loses its turn.`);
      return this.nextTurn();
    }
    if (t.conditions.includes("prone")) {
      t.conditions = t.conditions.filter((x) => x !== "prone");
      t.turn.movement = Math.floor(t.speed / 2);
    }
    if (t.kind === "pc") this.say(`▶ Round ${c.round}: ${t.name}'s turn.`, "system");
    this.ev.changed();
  }

  nextTurn() {
    const c = this.state.combat;
    if (!c.active || c.order.length === 0) return;
    const prev = this.current();
    if (prev) prev.turn = undefined;
    for (let i = 0; i < c.order.length; i++) {
      c.turn++;
      if (c.turn >= c.order.length) { c.turn = 0; c.round++; }
      const t = this.current();
      if (t && !t.conditions.includes("dead")) break;
    }
    this.beginTurn();
  }

  private deathSave(t: Token) {
    const ch = this.charFor(t);
    if (!ch) return;
    const r = this.rollPublic(t.name, "1d20", "Death save");
    const v = naturalD20(r) ?? r.total;
    if (v === 20) {
      t.hp = 1;
      t.conditions = t.conditions.filter((x) => x !== "unconscious");
      ch.deathSaves = { success: 0, fail: 0 };
      this.say(`✨ ${t.name} rolls a natural 20 and surges back to consciousness!`, "roll", { roll: r });
    } else if (v >= 10) {
      ch.deathSaves.success++;
      this.say(`${t.name} death save: ${v} — success (${ch.deathSaves.success}/3)${ch.deathSaves.success >= 3 ? " — stable." : ""}`, "roll", { roll: r });
    } else {
      ch.deathSaves.fail += v === 1 ? 2 : 1;
      this.say(`${t.name} death save: ${v} — failure (${Math.min(3, ch.deathSaves.fail)}/3)`, "roll", { roll: r });
      if (ch.deathSaves.fail >= 3) this.kill(t);
    }
    this.syncChar(t);
  }

  // ---------- damage & healing ----------

  damage(t: Token, amount: number, type: string, crit = false, source = "") {
    if (amount <= 0 || t.conditions.includes("dead")) return;
    let dmg = amount;
    if (t.conditions.includes("raging") && ["slashing", "piercing", "bludgeoning"].includes(type)) dmg = Math.floor(dmg / 2);
    const ch = t.kind === "pc" ? this.charFor(t) : null;
    if (ch && ch.tempHp > 0) {
      const absorbed = Math.min(ch.tempHp, dmg);
      ch.tempHp -= absorbed;
      dmg -= absorbed;
    }
    if (t.kind === "pc" && t.conditions.includes("unconscious")) {
      if (ch) {
        ch.deathSaves.fail += crit ? 2 : 1;
        this.say(`${t.name} takes damage while down — ${crit ? "two death save failures" : "a death save failure"}!`);
        if (ch.deathSaves.fail >= 3) this.kill(t);
      }
      return;
    }
    t.hp -= dmg;
    this.ev.fx("hit", t.id, `-${dmg}`);
    if (t.kind !== "pc" && t.conditions.includes("unconscious")) t.conditions = t.conditions.filter((x) => x !== "unconscious");
    if (t.hp <= 0) {
      if (t.kind === "pc") {
        t.hp = 0;
        if (!t.conditions.includes("unconscious")) t.conditions.push("unconscious");
        if (!t.conditions.includes("prone")) t.conditions.push("prone");
        t.conditions = t.conditions.filter((x) => x !== "raging");
        if (ch) ch.deathSaves = { success: 0, fail: 0 };
        this.say(`💥 ${t.name} falls unconscious!`, "gm");
        this.ev.gmEvent(`${t.name} was knocked unconscious${source ? ` by ${source}` : ""}.`);
      } else {
        this.kill(t);
      }
    }
    this.syncChar(t);
  }

  private kill(t: Token) {
    t.hp = 0;
    t.conditions = ["dead"];
    this.ev.fx("death", t.id);
    if (t.kind === "pc") {
      this.say(`☠️ ${t.name} has died.`, "gm");
      this.ev.gmEvent(`${t.name} has DIED. Give them a moment of respect in your narration.`, { urgent: true });
    } else {
      this.say(`☠️ ${t.name} is defeated.`, "system");
      if (t.faction) this.state.flags[`killed:${t.faction}`] = true;
      this.state.flags.killedAny = true;
      const xp = t.statId ? MONSTERS[t.statId]?.xp ?? 0 : 0;
      if (xp) this.state.flags.pendingXp = Number(this.state.flags.pendingXp ?? 0) + xp;
    }
    const c = this.state.combat;
    if (c.active) {
      const ended = this.checkCombatEnd();
      if (ended && this.state.flags.pendingXp) {
        this.awardXp(Number(this.state.flags.pendingXp));
        this.state.flags.pendingXp = 0;
      }
    }
  }

  heal(t: Token, amount: number) {
    if (t.conditions.includes("dead")) return;
    const before = t.hp;
    t.hp = Math.min(t.maxHp, Math.max(0, t.hp) + amount);
    if (t.hp > 0 && t.conditions.includes("unconscious")) {
      t.conditions = t.conditions.filter((x) => x !== "unconscious");
      const ch = this.charFor(t);
      if (ch) ch.deathSaves = { success: 0, fail: 0 };
    }
    this.ev.fx("heal", t.id, `+${t.hp - before}`);
    this.syncChar(t);
  }

  savingThrowDamage(t: Token, save: Ability, dc: number, dmgExpr: string, type: string, halfOnSave: boolean, source: string) {
    const bonus = this.saveBonusOf(t, save);
    const r = this.rollPublic(t.name, `1d20${signed(bonus)}`, `${ABILITY_LABEL[save]} save`);
    const ok = r.total >= dc;
    r.vs = { target: t.name, dc, success: ok, kind: "dc" };
    const dr = roll(dmgExpr, this.rng);
    const dmg = ok ? (halfOnSave ? Math.floor(dr.total / 2) : 0) : dr.total;
    this.say(`${t.name} ${ABILITY_LABEL[save]} save ${r.total} vs DC ${dc}: ${ok ? "saved" : "failed"}${dmg ? ` — takes ${dmg} ${type}` : ""}.`, "roll", { roll: r });
    if (dmg) this.damage(t, dmg, type, false, source);
    return ok;
  }

  saveBonusOf(t: Token, a: Ability) {
    if (t.kind === "pc") {
      const ch = this.charFor(t);
      return ch ? saveBonus(ch, a) : 0;
    }
    const m = t.statId ? MONSTERS[t.statId] : undefined;
    return m ? mod(m.abilities[a]) : 0;
  }

  // ---------- player board actions ----------

  /** Validates and resolves a board action from a player. Returns an error message or null. */
  act(playerId: string, a: BoardAction): string | null {
    if (this.state.phase !== "campaign") return "No adventure is running.";
    const t = this.token(a.tokenId);
    if (!t) return "That token is gone.";
    if (t.ownerId !== playerId) return "That's not your character.";
    const c = this.state.combat;
    const inCombat = c.active;
    if (inCombat && this.current() !== t && a.type !== "useItem") return "It's not your turn.";
    if (t.conditions.includes("dead")) return "You are dead.";
    if (t.conditions.includes("unconscious") && a.type !== "endTurn") return "You are unconscious.";
    if (!inCombat) t.turn = { movement: 60, action: true, bonus: true, reaction: true };
    const budget = t.turn!;

    switch (a.type) {
      case "move": return this.doMove(t, a.x, a.y, budget, inCombat);
      case "attack": return this.doAttack(t, a.targetId, a.attack, budget);
      case "cast": return this.doCast(t, a.spell, a.targetId, a.x, a.y, budget);
      case "feature": return this.doFeature(t, a.feature, budget, a.targetId);
      case "dash":
        if (!inCombat) return null;
        if (!budget.action) return "You've already used your action.";
        budget.action = false; budget.movement += t.speed;
        this.say(`${t.name} dashes.`); break;
      case "dodge":
        if (!budget.action) return "You've already used your action.";
        budget.action = false; addCond(t, "dodging");
        this.say(`${t.name} takes the Dodge action.`); break;
      case "disengage":
        if (!budget.action && !(this.charFor(t)?.cls === "rogue" && budget.bonus)) return "No action left.";
        if (budget.action) budget.action = false; else budget.bonus = false;
        addCond(t, "disengaged"); this.say(`${t.name} disengages.`); break;
      case "hide": return this.doHide(t, budget);
      case "useItem": return this.doUseItem(t, a.itemId, budget, inCombat);
      case "interact": return this.doInteract(t, a.propId, budget, inCombat);
      case "endTurn":
        if (!inCombat) return null;
        this.nextTurn(); break;
      case "deathSave": break;
    }
    this.ev.changed();
    return null;
  }

  private doMove(t: Token, x: number, y: number, budget: TurnBudget, inCombat: boolean): string | null {
    if (t.conditions.includes("restrained")) return "You are restrained.";
    if (!canStand(this.board, t, x, y)) return "You can't stand there.";
    const p = pathTo(this.board, t, x, y, budget.movement);
    if (!p) return inCombat ? `Too far — ${budget.movement} squares of movement left.` : "No path there.";
    if (inCombat) budget.movement -= p.cost;
    const start: [number, number] = [t.x, t.y];
    if (inCombat && !t.conditions.includes("disengaged")) this.opportunityAttacks(t, start, p.path);
    if (t.conditions.includes("dead") || t.conditions.includes("unconscious")) { this.ev.changed(); return null; }
    t.x = x; t.y = y;
    if (t.conditions.includes("hidden") && inCombat) { /* stays hidden while moving */ }
    updateExplored(this.board);
    // enter triggers along the path
    const scene = this.scene;
    if (scene) {
      for (const tr of scene.triggers) {
        if (tr.when.type !== "enter" || this.fired.has(tr.id)) continue;
        const [x0, y0, x1, y1] = tr.when.rect;
        if (p.path.some(([px, py]) => px >= x0 && px <= x1 && py >= y0 && py <= y1)) {
          this.fire(tr, t);
          if (this.board.sceneId !== scene.id) return null;
        }
      }
    }
    this.checkAutoCombat();
    this.ev.changed();
    return null;
  }

  opportunityAttacks(mover: Token, start: [number, number], path: [number, number][]) {
    const foes = this.board.tokens.filter((o) => o !== mover && !isDown(o) && (isHostile(o) !== isHostile(mover)) && o.kind !== "npc" && (o.kind !== "pc" || mover.kind !== "pc"));
    for (const f of foes) {
      const startDist = tokenDist({ ...mover, x: start[0], y: start[1] }, f);
      if (startDist > 1) continue;
      if (!path.some(([x, y]) => tokenDist({ ...mover, x, y }, f) > 1)) continue;
      if (f.turn && !f.turn.reaction) continue;
      if (f.turn) f.turn.reaction = false;
      this.say(`↩️ ${f.name} makes an opportunity attack on ${mover.name}!`);
      if (f.kind === "pc") {
        const ch = this.charFor(f);
        const atk = ch && CLASSES[ch.cls].attacks.find((x) => x.range <= 1);
        if (ch && atk) this.resolveWeaponAttack(f, mover, atk.id);
      } else {
        const m = f.statId ? MONSTERS[f.statId] : undefined;
        const atk = m?.attacks.find((x) => x.range <= 1);
        if (atk) this.monsterAttack(f, mover, atk);
      }
      if (isDown(mover)) return;
    }
  }

  checkAutoCombat() {
    if (this.state.combat.active || this.state.phase !== "campaign") return;
    const vis = partyVision(this.board);
    const seen = this.board.tokens.filter((t) => isHostile(t) && !isDown(t) && occupiesVisible(t, vis, this.board.width));
    if (seen.length) {
      this.say(`👁️ The party spots ${[...new Set(seen.map((s) => s.name))].join(", ")}!`, "gm");
      this.startCombat();
    }
  }

  private advantageFor(att: Token, tgt: Token, ranged: boolean): number {
    let adv = 0;
    let dis = 0;
    if (att.conditions.some((c) => c === "poisoned" || c === "frightened" || c === "blinded" || c === "restrained" || c === "prone")) dis++;
    if (att.conditions.includes("hidden")) adv++;
    if (tgt.conditions.includes("dodging")) dis++;
    if (tgt.conditions.some((c) => c === "restrained" || c === "stunned" || c === "unconscious" || c === "blinded")) adv++;
    if (tgt.conditions.includes("prone")) { if (ranged && tokenDist(att, tgt) > 1) dis++; else adv++; }
    if (ranged && this.board.tokens.some((o) => o !== att && !isDown(o) && isHostile(o) !== isHostile(att) && o.kind !== "npc" && tokenDist(att, o) <= 1)) dis++;
    if (att.conditions.includes("raging") && !ranged) adv++;
    return adv && !dis ? 1 : dis && !adv ? -1 : 0;
  }

  private d20(adv: number, bonus: number) {
    const b = signed(bonus);
    return adv > 0 ? `2d20kh1${b}` : adv < 0 ? `2d20kl1${b}` : `1d20${b}`;
  }

  private doAttack(t: Token, targetId: string, attackId: string, budget: TurnBudget): string | null {
    const tgt = this.token(targetId);
    if (!tgt || tgt.conditions.includes("dead")) return "Invalid target.";
    if (tgt === t) return "You can't attack yourself.";
    const ch = this.charFor(t);
    const atk = ch && CLASSES[ch.cls].attacks.find((a) => a.id === attackId);
    if (!ch || !atk) return "Unknown attack.";
    if (!this.state.combat.active) {
      this.provoke(tgt);
      return this.state.combat.active && this.current() === t ? this.doAttack(t, targetId, attackId, t.turn!) : null;
    }
    if (!budget.action) return "You've already used your action.";
    const d = tokenDist(t, tgt);
    if (d > atk.range) return `Out of range (${d} squares, ${atk.range} max).`;
    if (!hasLos(this.board, t.x, t.y, tgt.x, tgt.y)) return "No line of sight.";
    budget.action = false;
    this.resolveWeaponAttack(t, tgt, atk.id);
    this.ev.changed();
    return null;
  }

  /** Attacking a neutral creature starts a fight. */
  private provoke(tgt: Token) {
    if (tgt.kind === "npc") {
      if (!tgt.statId) { this.say(`${tgt.name} is not someone you can fight.`); return; }
      const group = tgt.faction;
      for (const o of this.board.tokens.filter((x) => x === tgt || (group && x.faction === group))) { o.kind = "enemy"; o.disposition = "hostile"; }
      if (group) this.state.flags[`spawned:${group}`] = true;
      this.ev.gmEvent(`The players attacked ${tgt.name}, who was not hostile! React in character.`, { urgent: true });
    }
    this.startCombat();
  }

  resolveWeaponAttack(t: Token, tgt: Token, attackId: string) {
    const ch = this.charFor(t)!;
    const atk = CLASSES[ch.cls].attacks.find((a) => a.id === attackId)!;
    const ranged = atk.range > 1;
    const adv = this.advantageFor(t, tgt, ranged);
    const { bonus, dmgMod } = attackBonus(ch, atk);
    let expr = this.d20(adv, bonus);
    if (t.conditions.includes("blessed")) expr += "+1d4";
    const label = `${this.name(atk.id, atk.name)} → ${tgt.name}`;
    const r = roll(expr, this.rng, label);
    const nat = naturalD20(r);
    const crit = nat === 20;
    const hit = crit || (nat !== 1 && r.total >= tgt.ac);
    r.crit = crit; r.fumble = nat === 1;
    r.vs = { target: tgt.name, dc: tgt.ac, success: hit, kind: "ac" };
    if (t.conditions.includes("hidden")) t.conditions = t.conditions.filter((c) => c !== "hidden");
    let dmgExpr = `${atk.damage}${signed(dmgMod)}`;
    if (t.conditions.includes("raging") && !ranged) dmgExpr += "+2";
    if (tgt.conditions.includes("marked")) dmgExpr += "+1d6";
    let sneak = false;
    if (ch.cls === "rogue" && !t.turn?.sneakUsed && (atk.ability === "finesse" || ranged)) {
      const allyAdj = this.board.tokens.some((o) => o !== t && o.kind === "pc" && !isDown(o) && tokenDist(o, tgt) <= 1);
      if ((adv > 0 || allyAdj) && adv >= 0) {
        dmgExpr += `+${sneakDice(ch.level)}d6`;
        sneak = true;
      }
    }
    if (hit) {
      if (sneak && t.turn) t.turn.sneakUsed = true;
      const dr = roll(crit ? critExpr(dmgExpr) : dmgExpr, this.rng);
      r.damage = { total: Math.max(1, dr.total), type: atk.type, expr: dr.expr, rolls: dr.terms.flatMap((x) => x.rolls) };
    }
    this.ev.dice(ch.name, r);
    this.say(
      `${t.name} attacks ${tgt.name} with ${this.name(atk.id, atk.name)}: ${r.total} vs AC ${tgt.ac} — ${crit ? "CRITICAL HIT!" : hit ? "hit" : nat === 1 ? "fumble!" : "miss"}${r.damage ? ` for ${r.damage.total} ${atk.type}${sneak ? " (sneak attack)" : ""}` : ""}.`,
      "roll", { roll: r, from: ch.name, fromId: t.ownerId },
    );
    if (r.damage) this.damage(tgt, r.damage.total, atk.type, crit, t.name);
    else this.ev.fx("miss", tgt.id, "miss");
    if (crit) this.ev.gmEvent(`${t.name} landed a critical hit on ${tgt.name}! One punchy line of flavour.`);
  }

  monsterAttack(m: Token, tgt: Token, atk: MonsterDef["attacks"][number]) {
    const ranged = atk.range > 1;
    const adv = this.advantageFor(m, tgt, ranged);
    const r = roll(this.d20(adv, atk.bonus), this.rng, `${atk.name} → ${tgt.name}`);
    const nat = naturalD20(r);
    const crit = nat === 20;
    const hit = crit || (nat !== 1 && r.total >= tgt.ac);
    r.crit = crit;
    r.vs = { target: tgt.name, dc: tgt.ac, success: hit, kind: "ac" };
    if (hit) {
      const dr = roll(crit ? critExpr(atk.damage) : atk.damage, this.rng);
      r.damage = { total: Math.max(1, dr.total), type: atk.type, expr: dr.expr, rolls: dr.terms.flatMap((x) => x.rolls) };
    }
    this.ev.dice(m.name, r);
    this.say(`${m.name} uses ${atk.name} on ${tgt.name}: ${r.total} vs AC ${tgt.ac} — ${crit ? "CRITICAL HIT!" : hit ? "hit" : "miss"}${r.damage ? ` for ${r.damage.total} ${atk.type}` : ""}.`, "roll", { roll: r, from: m.name });
    if (r.damage) this.damage(tgt, r.damage.total, atk.type, crit, m.name);
    else this.ev.fx("miss", tgt.id, "miss");
  }

  private doCast(t: Token, spellId: string, targetId: string | undefined, x: number | undefined, y: number | undefined, budget: TurnBudget): string | null {
    const ch = this.charFor(t);
    const sp = SPELLS[spellId];
    if (!ch || !sp || !CLASSES[ch.cls].spells.includes(spellId)) return "You don't know that spell.";
    if (sp.level > 0 && ch.spellSlots <= 0) return "No spell slots left.";
    if (ch.cls === "ranger" && ch.level < 2) return "Rangers learn spells at level 2.";
    const tgt = targetId ? this.token(targetId) : undefined;
    const harmful = sp.kind === "attack" || sp.kind === "save" || sp.kind === "auto";
    if (harmful && !this.state.combat.active) {
      if (tgt) this.provoke(tgt);
      else this.startCombat();
      if (!(this.state.combat.active && this.current() === t)) return null;
      budget = t.turn!;
    }
    const useBonus = !!sp.bonusAction;
    if (useBonus ? !budget.bonus : !budget.action) return useBonus ? "Bonus action already used." : "You've already used your action.";
    const sname = this.name(sp.id, sp.name);
    // targeting
    let cx = x ?? tgt?.x;
    let cy = y ?? tgt?.y;
    if (cx === undefined || cy === undefined) {
      if (sp.kind === "heal" || sp.kind === "buff") { cx = t.x; cy = t.y; } else return "Choose a target.";
    }
    const range = dist(t.x, t.y, cx, cy);
    if (range > sp.range) return `Out of range (${range}/${sp.range} squares).`;
    if (!hasLos(this.board, t.x, t.y, cx, cy)) return "No line of sight.";
    if (useBonus) budget.bonus = false; else budget.action = false;
    if (sp.level > 0) ch.spellSlots--;
    if (t.conditions.includes("hidden")) t.conditions = t.conditions.filter((c) => c !== "hidden");
    this.ev.fx("spell", tgt?.id ?? t.id, sname);
    const dc = spellDC(ch);
    const scale = sp.level === 0 ? cantripDice(ch.level) : 1;
    const dmgDice = sp.damage ? sp.damage.replace(/^(\d+)d/, (_, n) => `${Number(n) * scale}d`) : "";
    switch (sp.kind) {
      case "attack": {
        if (!tgt) return "Choose a creature.";
        const adv = this.advantageFor(t, tgt, sp.range > 1);
        let expr = this.d20(adv, spellAttackBonus(ch));
        if (t.conditions.includes("blessed")) expr += "+1d4";
        const r = roll(expr, this.rng, `${sname} → ${tgt.name}`);
        const nat = naturalD20(r);
        const crit = nat === 20;
        const hit = crit || (nat !== 1 && r.total >= tgt.ac);
        r.crit = crit;
        r.vs = { target: tgt.name, dc: tgt.ac, success: hit, kind: "ac" };
        if (hit) {
          const dr = roll(crit ? critExpr(dmgDice) : dmgDice, this.rng);
          r.damage = { total: dr.total, type: sp.type!, expr: dr.expr, rolls: dr.terms.flatMap((q) => q.rolls) };
        }
        this.ev.dice(ch.name, r);
        this.say(`${t.name} casts ${sname} at ${tgt.name}: ${r.total} vs AC ${tgt.ac} — ${crit ? "CRITICAL!" : hit ? "hit" : "miss"}${r.damage ? ` for ${r.damage.total} ${sp.type}` : ""}.`, "roll", { roll: r, from: ch.name, fromId: t.ownerId });
        if (r.damage) this.damage(tgt, r.damage.total, sp.type!, crit, t.name);
        if (hit && spellId === "rayfrost") tgt.speed = Math.max(2, tgt.speed - 2);
        break;
      }
      case "auto": {
        if (!tgt) return "Choose a creature.";
        const dr = this.rollPublic(ch.name, dmgDice, sname);
        this.say(`${t.name} casts ${sname}: ${dr.total} ${sp.type} damage to ${tgt.name} — it never misses.`, "roll", { roll: dr, from: ch.name });
        this.damage(tgt, dr.total, sp.type!, false, t.name);
        break;
      }
      case "save": {
        const victims = sp.area
          ? this.board.tokens.filter((o) => o !== t && !o.conditions.includes("dead") && dist(o.x, o.y, cx!, cy!) <= sp.area! && hasLos(this.board, cx!, cy!, o.x, o.y))
          : tgt ? [tgt] : [];
        if (!victims.length) { this.say(`${t.name} casts ${sname}… but nothing is caught in it.`); break; }
        this.say(`${t.name} casts ${sname} (DC ${dc} ${sp.save!.toUpperCase()} save).`);
        if (sp.condition === "unconscious") {
          for (const v of victims) {
            if (v.kind === "pc") continue;
            const r = this.rollPublic(v.name, `1d20${signed(this.saveBonusOf(v, sp.save!))}`, `${ABILITY_LABEL[sp.save!]} save`);
            if (r.total < dc) { addCond(v, "unconscious"); this.say(`💤 ${v.name} falls asleep.`); }
            else this.say(`${v.name} shrugs off the spell (${r.total}).`);
          }
        } else {
          for (const v of victims) this.savingThrowDamage(v, sp.save!, dc, dmgDice, sp.type!, !!sp.area, t.name);
        }
        break;
      }
      case "heal": {
        const who = tgt ?? t;
        if (dist(t.x, t.y, who.x, who.y) > sp.range) return "Out of range.";
        const amt = roll(`${sp.heal}${signed(mod(ch.abilities[ch.cls === "ranger" ? "wis" : CLASSES[ch.cls].primary]))}`, this.rng, sname);
        this.ev.dice(ch.name, amt);
        this.heal(who, Math.max(1, amt.total));
        this.say(`${t.name} casts ${sname}: ${who.name} regains ${Math.max(1, amt.total)} HP.`, "roll", { roll: amt, from: ch.name });
        break;
      }
      case "buff": {
        const who = tgt ?? t;
        addCond(who, sp.condition!);
        this.say(`${t.name} casts ${sname} on ${who.name}.`);
        break;
      }
    }
    this.ev.changed();
    return null;
  }

  private doFeature(t: Token, feature: string, budget: TurnBudget, _targetId?: string): string | null {
    const ch = this.charFor(t);
    if (!ch || (ch.features[feature] ?? 0) <= 0) return "No uses left.";
    switch (feature) {
      case "secondwind": {
        if (!budget.bonus) return "Bonus action already used.";
        budget.bonus = false;
        ch.features[feature]--;
        const r = this.rollPublic(ch.name, `1d10+${ch.level}`, "Second Wind");
        this.heal(t, r.total);
        this.say(`${t.name} catches a second wind and recovers ${r.total} HP.`, "roll", { roll: r });
        break;
      }
      case "actionsurge":
        if (!this.state.combat.active) return "Only in combat.";
        if (budget.action) return "You still have your action.";
        ch.features[feature]--;
        budget.action = true;
        this.say(`⚡ ${t.name} surges into action!`);
        break;
      case "rage":
        if (!budget.bonus) return "Bonus action already used.";
        budget.bonus = false;
        ch.features[feature]--;
        addCond(t, "raging");
        this.say(`😤 ${t.name} flies into a RAGE!`, "gm");
        break;
      case "channel": {
        if (!budget.action) return "You've already used your action.";
        budget.action = false;
        ch.features[feature]--;
        const dc = spellDC(ch);
        this.say(`${t.name} raises a holy symbol: foes within 6 squares must make a DC ${dc} Wisdom save!`);
        for (const e of this.hostiles().filter((e) => tokenDist(t, e) <= 6)) {
          const r = this.rollPublic(e.name, `1d20${signed(this.saveBonusOf(e, "wis"))}`, "Wisdom save");
          if (r.total < dc) { addCond(e, "frightened"); this.say(`😱 ${e.name} is frightened.`); }
        }
        break;
      }
      default: return "That feature works automatically.";
    }
    this.ev.changed();
    return null;
  }

  private doHide(t: Token, budget: TurnBudget): string | null {
    const ch = this.charFor(t);
    if (!ch) return null;
    const rogueBonus = ch.cls === "rogue" && ch.level >= 2 && budget.bonus;
    if (this.state.combat.active) {
      if (rogueBonus) budget.bonus = false;
      else if (budget.action) budget.action = false;
      else return "No action left.";
    }
    const r = roll(`1d20${signed(skillBonus(ch, "stealth"))}`, this.rng, "Stealth");
    this.ev.dice(ch.name, r);
    const watchers = this.hostiles().filter((e) => hasLos(this.board, e.x, e.y, t.x, t.y) && tokenDist(e, t) <= e.vision);
    const best = Math.max(10, ...watchers.map((e) => 10 + mod(e.statId ? MONSTERS[e.statId]?.abilities.wis ?? 10 : 10)));
    const ok = r.total >= best;
    if (ok) addCond(t, "hidden");
    this.say(`${t.name} tries to hide: Stealth ${r.total} — ${ok ? "hidden!" : "spotted."}`, "roll", { roll: r });
    this.ev.changed();
    return null;
  }

  private doUseItem(t: Token, itemId: string, budget: TurnBudget, inCombat: boolean): string | null {
    const ch = this.charFor(t);
    const it = ch?.inventory.find((i) => i.id === itemId);
    if (!ch || !it) return "You don't have that.";
    if (!it.heal) return `${it.name} can't be used like that — describe what you do in chat and the GM will rule on it.`;
    if (inCombat) {
      if (this.current() !== t) return "It's not your turn.";
      if (!budget.bonus) return "Bonus action already used.";
      budget.bonus = false;
    }
    const r = this.rollPublic(ch.name, it.heal, it.name);
    this.heal(t, r.total);
    it.qty = (it.qty ?? 1) - 1;
    if (it.qty <= 0) ch.inventory = ch.inventory.filter((i) => i !== it);
    this.say(`${t.name} uses ${it.name} and regains ${r.total} HP.`, "roll", { roll: r });
    this.ev.changed();
    return null;
  }

  private doInteract(t: Token, propId: string, budget: TurnBudget, inCombat: boolean): string | null {
    const p = this.board.props.find((x) => x.id === propId);
    if (!p) return "Nothing there.";
    if (dist(t.x, t.y, p.x, p.y) > 1) return `Move next to the ${p.name} first.`;
    if (inCombat) {
      if (!budget.action) return "You've already used your action.";
      budget.action = false;
    }
    const tr = p.interact ? this.scene?.triggers.find((x) => x.id === p.interact) : undefined;
    if (!tr || (!tr.repeat && this.fired.has(tr.id))) {
      this.say(`${t.name} examines the ${p.name}.`);
      this.ev.gmEvent(`${t.name} examines the ${p.name} (it has already been used or does nothing special). Describe it briefly.`);
      return null;
    }
    this.fire(tr, t);
    p.used = true;
    this.ev.changed();
    return null;
  }

  // ---------- rests ----------

  rest(kind: "short" | "long"): string | null {
    if (this.state.combat.active) return "You can't rest during combat!";
    if (this.state.phase !== "campaign") return "Rest happens automatically in the pub.";
    const key = `rest:${this.board.sceneId}:${kind}`;
    if (this.state.flags[key]) return `The party already took a ${kind} rest here.`;
    if (kind === "long" && this.hostilesNear()) return "It's not safe to sleep here.";
    this.state.flags[key] = true;
    for (const t of this.pcTokens()) {
      if (t.conditions.includes("dead")) continue;
      const ch = this.charFor(t);
      if (!ch) continue;
      this.syncChar(t);
      if (kind === "long") longRest(ch);
      else shortRest(ch, () => roll(`1d${CLASSES[ch.cls].hitDie}`, this.rng).total);
      t.hp = Math.max(1, ch.hp);
      ch.hp = t.hp;
      t.conditions = t.conditions.filter((c) => c === "dead");
    }
    this.say(kind === "long" ? "🌙 The party makes camp and takes a long rest. HP, spells and abilities are restored." : "☕ The party takes a short rest and patches up.", "gm");
    this.ev.gmEvent(`The party took a ${kind} rest. Optionally describe the rest in one atmospheric line.`);
    this.ev.changed();
    return null;
  }

  private hostilesNear() {
    return this.hostiles().some((e) => this.livingPcs().some((p) => tokenDist(p, e) <= 12));
  }

  // ---------- summaries for the AI GM ----------

  summary(): string {
    const s = this.state;
    const lines: string[] = [];
    lines.push(`Phase: ${s.phase}${s.campaign ? ` — campaign "${CAMPAIGNS[s.campaign].name}"` : ""}`);
    if (s.phase === "campaign" && this.scene) {
      lines.push(`Scene: ${this.scene.title} (id ${this.scene.id}). Objective: ${s.gm.objective}`);
      lines.push(`Environment: ${s.env.preset}, weather ${s.env.weather}, time ${s.env.time}`);
      lines.push(`Combat: ${s.combat.active ? `round ${s.combat.round}, current turn: ${this.current()?.name}` : "no"}`);
      lines.push("Tokens on the board (x,y; map is " + `${this.board.width}x${this.board.height}):`);
      const vis = partyVision(this.board);
      for (const t of this.board.tokens) {
        const seen = occupiesVisible(t, vis, this.board.width);
        lines.push(`- ${t.name} [${t.kind}${t.disposition ? `/${t.disposition}` : ""}${t.statId ? `/${t.statId}` : ""}] at ${t.x},${t.y} HP ${t.hp}/${t.maxHp} AC ${t.ac}${t.conditions.length ? ` (${t.conditions.join(", ")})` : ""}${t.kind !== "pc" && !seen ? " — not currently seen by the party" : ""}`);
      }
      if (this.board.props.length) lines.push("Props: " + this.board.props.map((p) => `${p.name} at ${p.x},${p.y}${p.used ? " (used)" : ""}`).join("; "));
      lines.push("Scene triggers (fire_trigger): " + this.triggerList().map((t) => `${t.id} [${t.type}${t.fired ? ", already fired" : ""}] ${t.note}`).join("; "));
      if (s.checks.length) lines.push("Pending checks: " + s.checks.map((c) => `${s.players[c.playerId]?.character?.name} ${c.skill} DC ${c.dc} (${c.reason})`).join("; "));
    }
    lines.push("Players:");
    for (const p of Object.values(s.players)) {
      const c = p.character;
      if (!c) { lines.push(`- ${p.name} (no character yet)`); continue; }
      const cls = s.campaign ? RESKIN[s.campaign].classes[c.cls] : CLASSES[c.cls].name;
      const anc = s.campaign ? RESKIN[s.campaign].ancestries[c.ancestry] : ANCESTRIES[c.ancestry].name;
      lines.push(`- ${p.name} plays ${c.name}, level ${c.level} ${anc} ${cls}, HP ${c.hp}/${c.maxHp}, proficient in ${c.skills.join(", ")}, carrying ${c.inventory.map((i) => i.name).join(", ") || "nothing"}${c.backstory ? `. Backstory: ${c.backstory}` : ""}${p.connected ? "" : " (disconnected)"}`);
    }
    return lines.join("\n");
  }
}

// ---------- utils ----------

export function signed(n: number) { return n >= 0 ? `+${n}` : `${n}`; }
function addCond(t: Token, c: Condition) { if (!t.conditions.includes(c)) t.conditions.push(c); }
function isSkill(s: string): s is Skill { return s in SKILL_ABILITY; }
export function occupiesVisible(t: Token, vis: Set<number>, w: number) {
  for (let y = t.y; y < t.y + t.size; y++) for (let x = t.x; x < t.x + t.size; x++) if (vis.has(y * w + x)) return true;
  return false;
}
function nearestXY(t: Token, others: Token[]): [number, number] {
  let best: [number, number] = [9999, 9999];
  let bd = Infinity;
  for (const o of others) { const d = tokenDist(t, o); if (d < bd) { bd = d; best = [o.x, o.y]; } }
  return best;
}
function classGlyph(cls: string) {
  return ({ fighter: "🛡️", rogue: "🗡️", wizard: "🔮", cleric: "✨", ranger: "🏹", barbarian: "🪓" } as Record<string, string>)[cls] ?? "🙂";
}
export { profBonus, occupied };
