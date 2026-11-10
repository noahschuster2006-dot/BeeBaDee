// Tiny reactive store shared by the React UI and the three.js world.

import { useSyncExternalStore } from "react";
import type { AvatarLook, Character, ChatMessage, RoomState, Transform } from "../shared/types";

export type Panel = null | "board" | "sheet" | "creator" | "avatar" | "quest" | "help" | "settings" | "menu" | "inventory" | "map";

export interface ClientState {
  connected: boolean;
  joined: boolean;
  you: string;
  room: string;
  state: RoomState | null;
  chat: ChatMessage[];
  aiEnabled: boolean;
  panel: Panel;
  chatFocus: boolean;
  toasts: { id: number; text: string; kind: "error" | "info" }[];
  prompt: string | null; // interaction prompt from the world
  micOn: boolean;
  firstPerson: boolean;
  selectedToken: string | null;
  musicOn: boolean;
  netMode: "server" | "p2p" | null;
  hosting: boolean; // this browser is running the table (peer-to-peer mode)
  intent: "host" | "join" | null; // what the player chose on the start menu
  fade: boolean; // brief fade when the world changes
}

export const LOOK_KEY = "bbd.look";
export const CHAR_KEY = "bbd.character";
export const NAME_KEY = "bbd.name";
export const GM_KEY = "bbd.gm"; // { apiKey, model, effort } for browser-hosted tables

export const DEFAULT_LOOK: AvatarLook = {
  head: "human", height: 1, build: 1, skin: "#c99a76", hair: "short", hairColor: "#3b2a1e", outfit: "tunic",
  primary: "#6a8cff", secondary: "#2b2f45", hat: "none", accessory: "none", eyes: "#222222",
};

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...(fallback as object), ...JSON.parse(v) } as T : fallback;
  } catch {
    return fallback;
  }
}
export function loadLocalRaw<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) as T : null;
  } catch {
    return null;
  }
}
export function saveLocal(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
}

let state: ClientState = {
  connected: false, joined: false, you: "", room: "tavern", state: null, chat: [], aiEnabled: false,
  panel: null, chatFocus: false, toasts: [], prompt: null, micOn: false, firstPerson: false, selectedToken: null, musicOn: true, netMode: null, hosting: false, fade: false, intent: null,
};
const subs = new Set<() => void>();

export const store = {
  get: () => state,
  set(patch: Partial<ClientState> | ((s: ClientState) => Partial<ClientState>)) {
    const p = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...p };
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  toast(text: string, kind: "error" | "info" = "info") {
    const id = Math.random();
    store.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },
};

export function useStore<T>(sel: (s: ClientState) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(state));
}

export function me() {
  const s = state.state;
  return s ? s.players[state.you] : undefined;
}

export function myCharacter(): Character | null {
  return me()?.character ?? null;
}

/** Live transforms of everyone (not in React state: updated 15x/sec). */
export const transforms: Record<string, Transform> = {};

/** Local look, kept in sync with the editor even before the server echoes it. */
export const local = {
  look: loadLocal<AvatarLook>(LOOK_KEY, DEFAULT_LOOK),
};
