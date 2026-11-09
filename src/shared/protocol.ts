import type {
  AvatarLook, CampaignId, Character, ChatMessage, Emote, RoomState, Transform, Skill, Ability,
} from "./types";

export const MAX_PLAYERS = 6;
export const TICK_HZ = 15; // transform broadcast rate

/** Things a player can do on the board. Resolved by the server's rules engine. */
export type BoardAction =
  | { type: "move"; tokenId: string; x: number; y: number }
  | { type: "attack"; tokenId: string; targetId: string; attack: string }
  | { type: "cast"; tokenId: string; spell: string; targetId?: string; x?: number; y?: number }
  | { type: "feature"; tokenId: string; feature: string; targetId?: string }
  | { type: "dash" | "dodge" | "disengage" | "hide"; tokenId: string }
  | { type: "useItem"; tokenId: string; itemId: string }
  | { type: "interact"; tokenId: string; propId: string }
  | { type: "buy"; tokenId: string; propId: string; itemId: string }
  | { type: "endTurn"; tokenId: string }
  | { type: "deathSave"; tokenId: string };

export type ClientMsg =
  | { t: "hello"; name: string; room: string; look: AvatarLook; character: Character | null; resume?: string }
  | { t: "move"; tr: Transform }
  | { t: "look"; look: AvatarLook }
  | { t: "character"; character: Character | null }
  | { t: "chat"; text: string; channel?: "ic" | "ooc" }
  | { t: "emote"; emote: Emote }
  | { t: "ready"; ready: boolean }
  | { t: "vote"; campaign: CampaignId }
  | { t: "startCampaign"; campaign: CampaignId; resume?: boolean }
  | { t: "returnToPub" }
  | { t: "board"; action: BoardAction }
  | { t: "rollCheck"; checkId: string }
  | { t: "choose"; choiceId: string; option: number; force?: boolean }
  | { t: "roll"; expr: string; label?: string; secret?: boolean }
  | { t: "skillRoll"; skill: Skill | Ability; save?: boolean }
  | { t: "talking"; talking: boolean }
  | { t: "rtc"; to: string; data: unknown }
  | { t: "ping"; x: number; y: number }
  | { t: "rest"; kind: "short" | "long" };

export type ServerMsg =
  | { t: "welcome"; you: string; token: string; state: RoomState; chat: ChatMessage[]; aiEnabled: boolean }
  | { t: "state"; state: RoomState }
  | { t: "transforms"; tr: Record<string, Transform> }
  | { t: "chat"; msg: ChatMessage }
  | { t: "dice"; by: string; values: { sides: number; value: number }[]; label?: string }
  | { t: "rtc"; from: string; data: unknown }
  | { t: "ping"; from: string; x: number; y: number }
  | { t: "fx"; kind: "hit" | "miss" | "heal" | "spell" | "death" | "levelup" | "scene"; tokenId?: string; text?: string }
  | { t: "error"; message: string };
