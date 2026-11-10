import type { Ability, CampaignId, Item, Skill, TimeOfDay, Weather } from "../types";

/** What a non-tile character in a scene map stands for. */
export type MarkDef =
  | { type: "start" }
  | {
      type: "enemy";
      /** One monster id, or several: one is rolled at random each playthrough. */
      monster: string | string[];
      group?: string;
      dormant?: boolean;
      name?: string;
      /** Chance (0-1) this foe is present at all. */
      chance?: number;
    }
  | {
      type: "npc"; name: string; glyph: string; color: string; persona: string; group?: string;
      /** Combat stats if the party decides to fight them. Key NPCs can be killed — scenes react via "killed" triggers. */
      monster?: string;
      /** Only appears if this flag is set / not set. */
      ifFlag?: string;
      unlessFlag?: string;
    }
  | { type: "prop"; kind: string; name: string; interact?: string; blocks?: boolean; shop?: "basic" | "town" | "city" | "elite" };

export type Rect = [number, number, number, number]; // x0, y0, x1, y1 inclusive

export interface ChoiceOption { label: string; actions: ActionDef[] }
export interface RandomOutcome { min: number; max: number; actions: ActionDef[] }

export type ActionDef =
  | { do: "narrate"; text: string }
  | { do: "say"; npc: string; text: string }
  | { do: "spawn"; group: string }
  | { do: "hostile"; group: string }
  | { do: "befriend"; group: string }
  | { do: "remove"; group: string }
  | { do: "combat" }
  | { do: "reveal"; rect: Rect }
  | { do: "env"; weather?: Weather; time?: TimeOfDay; preset?: string }
  | { do: "check"; skill: Skill | Ability; dc: number; reason: string; success: ActionDef[]; fail: ActionDef[] }
  | { do: "loot"; item?: Item; itemId?: string; relic?: string; qty?: number; gold?: number }
  | { do: "milestone"; level: number }
  | { do: "xp"; amount: number }
  | { do: "heal"; amount: string }
  | { do: "trap"; damage: string; type: string; save: Ability; dc: number; text: string }
  | { do: "setTile"; x: number; y: number; tile: string }
  | { do: "scene"; id: string; /** skip the travel roll (used when leaving an encounter) */ direct?: boolean }
  | { do: "flag"; key: string; value: boolean | number | string }
  | { do: "addFlag"; key: string; amount: number } // numeric counters: reputation, body count, debts
  | { do: "if"; flag: string; equals?: boolean | number | string; atLeast?: number; then?: ActionDef[]; else?: ActionDef[] }
  /** The party votes. Every option should change something: an ally, an item, a path, a death. */
  | { do: "choice"; prompt: string; options: ChoiceOption[] }
  /** Roll dice in front of everyone and branch on the result. The heart of replayability. */
  | { do: "random"; dice: string; label: string; outcomes: RandomOutcome[] }
  | { do: "revive"; cost: number } // a priest/medic brings back the fallen — for a price
  | { do: "ai"; direction: string; fallback?: ActionDef[] } // fallback runs when no AI GM is configured
  | { do: "trigger"; id: string }
  | { do: "objective"; text: string }
  | { do: "end"; text: string };

export type TriggerWhen =
  | { type: "start" }
  | { type: "enter"; rect: Rect }
  | { type: "cleared"; group?: string } // all hostiles (in group) down
  | { type: "interact" } // fired by props
  | { type: "killed"; name: string } // a named creature (often a key NPC) dies, however it happened
  | { type: "manual" }; // only the AI GM (or other triggers) fire it

export interface TriggerDef {
  id: string;
  when: TriggerWhen;
  actions: ActionDef[];
  repeat?: boolean;
  requiresFlag?: string;
  unlessFlag?: string;
  /** Short description for the AI GM so it knows what this trigger is for. */
  note?: string;
}

export interface SceneDef {
  id: string;
  title: string;
  act?: string; // chapter title shown in the HUD
  safe?: boolean; // a hub: long rests are always allowed
  env: { preset: string; weather: Weather; time: TimeOfDay };
  map: string[];
  marks: Record<string, MarkDef>;
  intro: string;
  objective: string;
  gmNotes: string; // secret information the AI GM may reveal gradually
  /** Dangerous ground ('%' tiles): anyone starting a turn or ending a move there must save. */
  hazard?: { name: string; damage: string; type: string; save: Ability; dc: number };
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
  levels: string; // e.g. "1-10"
  acts: { title: string; scenes: string[] }[];
  /** Named story flags and what they mean — shared with the AI GM so improvised choices hook into the script. */
  flagGuide: Record<string, string>;
  scenes: Record<string, SceneDef>;
  /** Legendary items unique to this world. */
  relics: Item[];
  pregens: { name: string; cls: import("../types").ClassId; ancestry: import("../types").AncestryId; backstory: string }[];
}
