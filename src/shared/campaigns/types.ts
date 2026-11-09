import type { Ability, CampaignId, Item, Skill, TimeOfDay, Weather } from "../types";

/** What a non-tile character in a scene map stands for. */
export type MarkDef =
  | { type: "start" }
  | { type: "enemy"; monster: string; group?: string; dormant?: boolean; name?: string }
  | { type: "npc"; name: string; glyph: string; color: string; persona: string; group?: string; monster?: string }
  | { type: "prop"; kind: string; name: string; interact?: string; blocks?: boolean };

export type Rect = [number, number, number, number]; // x0, y0, x1, y1 inclusive

export type ActionDef =
  | { do: "narrate"; text: string }
  | { do: "say"; npc: string; text: string }
  | { do: "spawn"; group: string }
  | { do: "hostile"; group: string }
  | { do: "remove"; group: string }
  | { do: "combat" }
  | { do: "reveal"; rect: Rect }
  | { do: "env"; weather?: Weather; time?: TimeOfDay; preset?: string }
  | { do: "check"; skill: Skill | Ability; dc: number; reason: string; success: ActionDef[]; fail: ActionDef[] }
  | { do: "loot"; item?: Item; gold?: number }
  | { do: "xp"; amount: number }
  | { do: "heal"; amount: string }
  | { do: "trap"; damage: string; type: string; save: Ability; dc: number; text: string }
  | { do: "setTile"; x: number; y: number; tile: string }
  | { do: "scene"; id: string }
  | { do: "flag"; key: string; value: boolean | number | string }
  | { do: "ai"; direction: string; fallback?: ActionDef[] } // fallback runs when no AI GM is configured
  | { do: "trigger"; id: string }
  | { do: "objective"; text: string }
  | { do: "end"; text: string };

export type TriggerWhen =
  | { type: "start" }
  | { type: "enter"; rect: Rect }
  | { type: "cleared"; group?: string } // all hostiles (in group) down
  | { type: "interact" } // fired by props
  | { type: "manual" }; // only the AI GM (or other triggers) fire it

export interface TriggerDef {
  id: string;
  when: TriggerWhen;
  actions: ActionDef[];
  repeat?: boolean;
  requiresFlag?: string;
  /** Short description for the AI GM so it knows what this trigger is for. */
  note?: string;
}

export interface SceneDef {
  id: string;
  title: string;
  env: { preset: string; weather: Weather; time: TimeOfDay };
  map: string[];
  marks: Record<string, MarkDef>;
  intro: string;
  objective: string;
  gmNotes: string; // secret information the AI GM may reveal gradually
  triggers: TriggerDef[];
}

export interface CampaignDef {
  id: CampaignId;
  name: string;
  tagline: string;
  tone: string; // style guide for the AI GM
  color: string;
  pitch: string;
  start: string;
  scenes: Record<string, SceneDef>;
  pregens: { name: string; cls: import("../types").ClassId; ancestry: import("../types").AncestryId; backstory: string }[];
}
