import type { BoardAction, ClientMsg, ServerMsg } from "../shared/protocol";
import type { Ability, AvatarLook, Character, Emote, Skill, Transform } from "../shared/types";
import { CHAR_KEY, LOOK_KEY, NAME_KEY, local, loadLocalRaw, saveLocal, store, transforms } from "./store";

type Listener = (m: ServerMsg) => void;

/** Anything that can carry messages to the table: a WebSocket to the game server, or a peer-to-peer link. */
export interface Transport { send(data: string): void; close(): void }

let transport: Transport | null = null;
let hello: Extract<ClientMsg, { t: "hello" }> | null = null;
let retry = 0;
let mode: "server" | "p2p" | null = null;
const listeners = new Set<Listener>();

export function onServer(f: Listener) { listeners.add(f); return () => listeners.delete(f); }

function tokenKey(room: string) { return `bbd.token.${room}`; }

/** Is this page served by the BeeBaDee game server, or by a static host like GitHub Pages? */
async function detectServer(): Promise<boolean> {
  try {
    const r = await fetch("./health", { cache: "no-store" });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return false;
    const j = await r.json();
    return j?.ok === true;
  } catch {
    return false;
  }
}

export async function connect(name: string, room: string) {
  const code = room.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "tavern";
  saveLocal(NAME_KEY, name);
  hello = {
    t: "hello", name, room: code, look: local.look,
    character: loadLocalRaw<Character>(CHAR_KEY),
    resume: localStorage.getItem(tokenKey(code)) ?? undefined,
  };
  store.set({ room: code });
  mode = (await detectServer()) ? "server" : "p2p";
  store.set({ netMode: mode });
  open();
}

/** Called by transports when a message from the table arrives. */
export function receive(data: string) {
  const m = JSON.parse(data) as ServerMsg;
  handle(m);
  listeners.forEach((f) => f(m));
}

function onOpen(t: Transport) {
  retry = 0;
  transport = t;
  store.set({ connected: true });
  hello!.look = local.look;
  hello!.resume = localStorage.getItem(tokenKey(hello!.room)) ?? undefined;
  t.send(JSON.stringify(hello));
}

function onClose(t: Transport, reason?: string) {
  if (transport && transport !== t) return;
  transport = null;
  store.set({ connected: false });
  if (reason) store.toast(reason, "error");
  const wait = Math.min(8000, 500 * 2 ** retry++);
  setTimeout(open, wait);
}

function open() {
  if (!hello) return;
  if (mode === "p2p") {
    void import("./p2p").then(({ openP2P }) => openP2P(hello!.room, { onOpen, onClose, receive }));
    return;
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const sock = new WebSocket(`${proto}://${location.host}/ws`);
  const t: Transport = { send: (d) => sock.readyState === 1 && sock.send(d), close: () => sock.close() };
  sock.onopen = () => onOpen(t);
  sock.onclose = () => onClose(t);
  sock.onmessage = (ev) => receive(String(ev.data));
}

function handle(m: ServerMsg) {
  switch (m.t) {
    case "welcome":
      try { localStorage.setItem(tokenKey(store.get().room), m.token); } catch { /* ignore */ }
      store.set({ joined: true, you: m.you, state: m.state, chat: m.chat, aiEnabled: m.aiEnabled });
      persistCharacter(m.state.players[m.you]?.character ?? null);
      break;
    case "state": {
      store.set({ state: m.state });
      persistCharacter(m.state.players[store.get().you]?.character ?? null);
      break;
    }
    case "transforms":
      for (const k of Object.keys(transforms)) if (!m.tr[k]) delete transforms[k];
      Object.assign(transforms, m.tr);
      break;
    case "chat":
      store.set((s) => ({ chat: [...s.chat.slice(-250), m.msg] }));
      break;
    case "error":
      store.toast(m.message, "error");
      break;
  }
}

let lastSaved = "";
function persistCharacter(c: Character | null) {
  if (!c) return;
  const s = JSON.stringify(c);
  if (s === lastSaved) return;
  lastSaved = s;
  saveLocal(CHAR_KEY, c);
}

export function send(m: ClientMsg) {
  transport?.send(JSON.stringify(m));
}

export const net = {
  move: (tr: Transform) => send({ t: "move", tr }),
  look: (look: AvatarLook) => { local.look = look; saveLocal(LOOK_KEY, look); send({ t: "look", look }); },
  character: (c: Character | null) => { if (c) saveLocal(CHAR_KEY, c); send({ t: "character", character: c }); },
  chat: (text: string, channel?: "ic" | "ooc") => send({ t: "chat", text, channel }),
  emote: (emote: Emote) => send({ t: "emote", emote }),
  board: (action: BoardAction) => send({ t: "board", action }),
  roll: (expr: string, label?: string) => send({ t: "roll", expr, label }),
  rollCheck: (checkId: string) => send({ t: "rollCheck", checkId }),
  choose: (choiceId: string, option: number, force = false) => send({ t: "choose", choiceId, option, force }),
  skillRoll: (skill: Skill | Ability, save = false) => send({ t: "skillRoll", skill, save }),
  vote: (campaign: "hollow" | "neon" | "realm") => send({ t: "vote", campaign }),
  start: (campaign: "hollow" | "neon" | "realm", resume = false) => send({ t: "startCampaign", campaign, resume }),
  returnToPub: () => send({ t: "returnToPub" }),
  rest: (kind: "short" | "long") => send({ t: "rest", kind }),
  ping: (x: number, y: number) => send({ t: "ping", x, y }),
  talking: (talking: boolean) => send({ t: "talking", talking }),
  rtc: (to: string, data: unknown) => send({ t: "rtc", to, data }),
};
