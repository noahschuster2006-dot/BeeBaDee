// Player preferences (graphics, controls, audio), saved in the browser.

import { useSyncExternalStore } from "react";

export interface Settings {
  sensitivity: number; // 0.2 - 3
  fov: number; // 60 - 100
  invertY: boolean;
  headBob: boolean;
  outlines: boolean; // ink outlines (costs a second render pass)
  hatching: boolean; // pen hatching in shadows
  quality: "high" | "balanced" | "low";
  music: number; // 0 - 1
  sfx: number; // 0 - 1
  firstPerson: boolean;
}

const KEY = "bbd.settings";
const DEFAULTS: Settings = { sensitivity: 1, fov: 78, invertY: false, headBob: true, outlines: true, hatching: true, quality: "high", music: 0.6, sfx: 0.8, firstPerson: true };

function load(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { ...DEFAULTS }; }
}

let current = load();
const subs = new Set<() => void>();

export const settings = {
  get: () => current,
  set(p: Partial<Settings>) {
    current = { ...current, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode */ }
    subs.forEach((f) => f());
  },
  reset() { settings.set(DEFAULTS); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};

export function useSettings() {
  return useSyncExternalStore(settings.subscribe, () => current);
}
