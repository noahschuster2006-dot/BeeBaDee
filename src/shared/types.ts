// Shared data model. The server owns the truth; clients render it.

export type CampaignId = "hollow" | "neon" | "realm";
export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

export type Skill =
  | "acrobatics" | "animal" | "arcana" | "athletics" | "deception" | "history"
  | "insight" | "intimidation" | "investigation" | "medicine" | "nature" | "perception"
  | "performance" | "persuasion" | "religion" | "sleight" | "stealth" | "survival";

// ---------- Avatar (looks only, VRChat-style) ----------

export type HeadStyle = "human" | "bug" | "robot" | "beast" | "skull";
export type HairStyle = "none" | "short" | "long" | "mohawk" | "bun" | "spiky";
export type Outfit = "tunic" | "robe" | "armor" | "jacket" | "hoodie" | "cloak";
export type Hat = "none" | "wizard" | "hood" | "crown" | "visor" | "horns" | "antennae" | "tophat";
export type Accessory = "none" | "cape" | "backpack" | "wings" | "scarf";

export interface AvatarLook {
  head: HeadStyle;
  height: number; // 0.85 - 1.15
  build: number; // 0.8 - 1.25 shoulder width
  skin: string;
  hair: HairStyle;
  hairColor: string;
  outfit: Outfit;
  primary: string;
  secondary: string;
  hat: Hat;
  accessory: Accessory;
  eyes: string;
}

export type Emote = "none" | "wave" | "dance" | "clap" | "cheer" | "sit" | "point" | "bow" | "laugh";

export interface Transform {
  x: number;
  y: number;
  z: number;
  ry: number; // yaw
  moving: number; // 0 idle, 1 walk, 2 run
  air: boolean;
  emote: Emote;
  seat?: string; // id of a seat when sitting
}

// ---------- Characters (rules, separate from looks) ----------

export type ClassId = "fighter" | "rogue" | "wizard" | "cleric" | "ranger" | "barbarian";
export type AncestryId = "human" | "elf" | "dwarf" | "halfling" | "orc" | "gnome";

export interface Item {
  id: string;
  name: string;
  kind: "weapon" | "armor" | "consumable" | "gear" | "key" | "treasure";
  desc?: string;
  qty?: number;
  heal?: string; // dice expression for potions
  attackBonus?: number; // magic weapon: + to attack, damage and spell DC
  acBonus?: number; // magic armour or ring
  saveBonus?: number; // cloak / amulet of protection
  price?: number;
  extraDamage?: { dice: string; type: string }; // relic weapons add this on every hit
  relic?: boolean;
}

export interface Character {
  id: string;
  name: string;
  campaign: CampaignId | "any";
  ancestry: AncestryId;
  cls: ClassId;
  level: number;
  xp: number;
  abilities: Record<Ability, number>;
  skills: Skill[]; // proficient skills
  maxHp: number;
  hp: number;
  tempHp: number;
  inventory: Item[];
  gold: number;
  spellSlots: number; // level 1 slots remaining (simplified)
  maxSpellSlots: number;
  features: Record<string, number>; // limited-use features: remaining uses
  deathSaves: { success: number; fail: number };
  backstory?: string;
  scars?: string[]; // lingering wounds from nearly dying
}

// ---------- Board ----------

export type TokenKind = "pc" | "npc" | "enemy" | "object";
export type Condition =
  | "prone" | "poisoned" | "frightened" | "restrained" | "stunned" | "blinded"
  | "dodging" | "raging" | "marked" | "blessed" | "unconscious" | "dead" | "hidden" | "disengaged"
  | "guardians" | "warded" | "slowed";

export interface Token {
  id: string;
  kind: TokenKind;
  name: string;
  x: number;
  y: number;
  size: number; // squares (1 = medium, 2 = large)
  hp: number;
  maxHp: number;
  ac: number;
  speed: number; // squares per turn
  ownerId?: string; // player id for pc tokens
  charId?: string;
  statId?: string; // monster stat block id
  color: string;
  glyph: string; // single emoji/char painted on token
  conditions: Condition[];
  hidden?: boolean; // invisible to players (GM-only)
  initiative?: number;
  turn?: TurnBudget;
  vision: number; // squares
  faction?: string;
  disposition?: "friendly" | "neutral" | "hostile";
  specialReady?: boolean; // monster recharge ability available
  reactionRound?: number; // round in which the reaction was last spent (uncanny dodge)
  boss?: boolean;
}

export interface TurnBudget {
  movement: number; // squares remaining
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  sneakUsed?: boolean;
}

export interface BoardProp {
  id: string;
  x: number;
  y: number;
  kind: string; // chest, door, altar, lever, terminal, statue...
  name: string;
  interact?: string; // trigger id fired when a PC interacts while adjacent
  used?: boolean;
  blocks?: boolean;
  shop?: string; // shop tier sold here
}

export interface BoardState {
  sceneId: string;
  title: string;
  width: number;
  height: number;
  tiles: string[]; // rows; see board.ts TILE legend
  explored: string; // width*height chars of "0"/"1" — party fog of war memory
  tokens: Token[];
  props: BoardProp[];
  theme: CampaignId | "pub";
}

export interface CombatState {
  active: boolean;
  round: number;
  order: string[]; // token ids sorted by initiative
  turn: number; // index into order
}

// ---------- Environment around the table ----------

export type Weather = "clear" | "rain" | "fog" | "storm" | "spores" | "embers" | "snow" | "ash";
export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

export interface EnvironmentState {
  preset: string; // environment builder id (see client/world/environments.ts)
  weather: Weather;
  time: TimeOfDay;
  tint?: string; // optional color grade
  seed: number;
}

// ---------- Chat ----------

export type ChatChannel = "ic" | "ooc" | "roll" | "gm" | "system" | "whisper" | "emote";

export interface DiceTerm {
  sides: number;
  rolls: number[];
  kept: number[]; // indexes kept
}

export interface RollResult {
  expr: string;
  total: number;
  terms: DiceTerm[];
  modifier: number;
  label?: string;
  crit?: boolean;
  fumble?: boolean;
  vs?: { target: string; dc: number; success: boolean; kind: "ac" | "dc" };
  damage?: { total: number; type: string; expr: string; rolls: number[] };
}

export interface ChatMessage {
  id: string;
  ts: number;
  channel: ChatChannel;
  from: string; // display name
  fromId?: string;
  to?: string; // whisper target player id
  text: string;
  roll?: RollResult;
  npc?: string; // npc speaker for GM lines
}

// ---------- Players / room ----------

export interface PlayerInfo {
  id: string;
  name: string;
  look: AvatarLook;
  character: Character | null;
  host: boolean;
  ready: boolean;
  connected: boolean;
  talking?: boolean;
}

export type Phase = "pub" | "campaign";

export interface PendingCheck {
  id: string;
  playerId: string;
  skill: Skill | Ability | "save";
  ability?: Ability;
  dc: number;
  reason: string;
  source: "ai" | "script";
  onSuccess?: string; // script trigger id
  onFail?: string;
}

export interface PendingChoice {
  id: string;
  prompt: string;
  options: string[];
  votes: Record<string, number>; // player id -> option index
  source: "ai" | "script";
}

export interface GmStatus {
  mode: "ai" | "scripted";
  thinking: boolean;
  objective: string;
}

export interface RoomState {
  id: string;
  phase: Phase;
  campaign: CampaignId | null;
  campaignVote: CampaignId | null;
  players: Record<string, PlayerInfo>;
  board: BoardState;
  combat: CombatState;
  env: EnvironmentState;
  checks: PendingCheck[];
  choices: PendingChoice[];
  gm: GmStatus;
  flags: Record<string, boolean | number | string>;
}
