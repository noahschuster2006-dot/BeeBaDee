import type { BoardAction, ClientMsg, ServerMsg } from "../shared/protocol";
import type { Ability, AvatarLook, Character, Emote, Skill, Transform } from "../shared/types";
import { CHAR_KEY, LOOK_KEY, NAME_KEY, local, loadLocalRaw, saveLocal, store, transforms } from "./store";

type Listener = (m: ServerMsg) => void;

let ws: WebSocket | null = null;
let hello: Extract<ClientMsg, { t: "hello" }> | null = null;
let retry = 0;
const listeners = new Set<Listener>();

export function onServer(f: Listener) { listeners.add(f); return () => listeners.delete(f); }

function tokenKey(room: string) { return `bbd.token.${room}`; }

export function connect(name: string, room: string) {
  const code = room.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "tavern";
  saveLocal(NAME_KEY, name);
  hello = {
    t: "hello", name, room: code, look: local.look,
    character: loadLocalRaw<Character>(CHAR_KEY),
    resume: localStorage.getItem(tokenKey(code)) ?? undefined,
  };
  store.set({ room: code });
  open();
}

function open() {
  if (!hello) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const sock = new WebSocket(`${proto}://${location.host}/ws`);
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    store.set({ connected: true });
    hello!.look = local.look;
    hello!.resume = localStorage.getItem(tokenKey(hello!.room)) ?? undefined;
    sock.send(JSON.stringify(hello));
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    store.set({ connected: false });
    const wait = Math.min(8000, 500 * 2 ** retry++);
    setTimeout(open, wait);
  };
  sock.onmessage = (ev) => {
    const m = JSON.parse(ev.data) as ServerMsg;
    handle(m);
    listeners.forEach((f) => f(m));
  };
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
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
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
  skillRoll: (skill: Skill | Ability, save = false) => send({ t: "skillRoll", skill, save }),
  vote: (campaign: "hollow" | "neon" | "realm") => send({ t: "vote", campaign }),
  start: (campaign: "hollow" | "neon" | "realm", resume = false) => send({ t: "startCampaign", campaign, resume }),
  returnToPub: () => send({ t: "returnToPub" }),
  rest: (kind: "short" | "long") => send({ t: "rest", kind }),
  ping: (x: number, y: number) => send({ t: "ping", x, y }),
  talking: (talking: boolean) => send({ t: "talking", talking }),
  rtc: (to: string, data: unknown) => send({ t: "rtc", to, data }),
};
