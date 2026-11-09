import type { CampaignId } from "../types";
import type { CampaignDef } from "./types";
import { realm } from "./realm";
import { hollow } from "./hollow";
import { neon } from "./neon";

export const CAMPAIGNS: Record<CampaignId, CampaignDef> = { hollow, neon, realm };
export const CAMPAIGN_ORDER: CampaignId[] = ["hollow", "neon", "realm"];
export type { CampaignDef, SceneDef, TriggerDef, ActionDef, MarkDef } from "./types";
