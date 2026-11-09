// Items, shops and magic loot. Names are reskinned per campaign; the math is shared.

import type { CampaignId, Item } from "./types";

interface ItemDef extends Omit<Item, "name" | "qty"> { names: Record<CampaignId, string> }

const D: ItemDef[] = [
  { id: "potion", kind: "consumable", heal: "2d4+2", price: 50, desc: "Heals 2d4+2.", names: { realm: "Healing Potion", hollow: "Lifeblood Bead", neon: "Stim Shot" } },
  { id: "greaterpotion", kind: "consumable", heal: "4d4+4", price: 150, desc: "Heals 4d4+4.", names: { realm: "Greater Healing Potion", hollow: "Lifeblood Cocoon", neon: "Trauma Kit" } },
  { id: "superiorpotion", kind: "consumable", heal: "8d4+8", price: 450, desc: "Heals 8d4+8.", names: { realm: "Superior Healing Potion", hollow: "Queen's Nectar", neon: "Full-Body Nanite Flush" } },
  { id: "weapon1", kind: "weapon", attackBonus: 1, price: 500, desc: "+1 to attack and damage rolls (and spell DCs).", names: { realm: "+1 Silvered Weapon", hollow: "Pale-Ore Needle (+1)", neon: "Smartlink Upgrade (+1)" } },
  { id: "weapon2", kind: "weapon", attackBonus: 2, price: 2000, desc: "+2 to attack and damage rolls (and spell DCs).", names: { realm: "+2 Runeblade", hollow: "Kingsmould Needle (+2)", neon: "Military Smartlink (+2)" } },
  { id: "armor1", kind: "armor", acBonus: 1, price: 600, desc: "+1 AC.", names: { realm: "+1 Enchanted Armour", hollow: "Lacquered Carapace (+1 AC)", neon: "Subdermal Plating (+1 AC)" } },
  { id: "armor2", kind: "armor", acBonus: 2, price: 2500, desc: "+2 AC.", names: { realm: "+2 Dwarven Plate", hollow: "Crystal Carapace (+2 AC)", neon: "Dermal Weave Mk II (+2 AC)" } },
  { id: "cloak", kind: "gear", saveBonus: 1, acBonus: 1, price: 900, desc: "+1 AC and +1 to saving throws.", names: { realm: "Cloak of Protection", hollow: "Moth-Silk Mantle", neon: "Reflex Booster" } },
  { id: "amulet", kind: "gear", saveBonus: 2, price: 2200, desc: "+2 to saving throws.", names: { realm: "Amulet of the Bell", hollow: "Lantern Charm", neon: "Neural Firewall" } },
  { id: "rope", kind: "gear", price: 2, desc: "Fifty feet of strong rope.", names: { realm: "Rope (50 ft)", hollow: "Silk Line", neon: "Grapple Line" } },
  { id: "torch", kind: "gear", price: 1, desc: "Light in dark places.", names: { realm: "Torches", hollow: "Lumafly Jar", neon: "Glowstick Pack" } },
];

const BY_ID = Object.fromEntries(D.map((d) => [d.id, d]));

export function makeItem(id: string, campaign: CampaignId | null, qty = 1): Item {
  const d = BY_ID[id];
  if (!d) throw new Error(`Unknown item ${id}`);
  const { names, ...rest } = d;
  return { ...rest, name: names[campaign ?? "realm"], qty };
}

export const ITEM_IDS = Object.keys(BY_ID);

/** What each shop tier sells. Scenes reference a tier on their shop props. */
export const SHOP_TIERS: Record<string, string[]> = {
  basic: ["potion", "rope", "torch"],
  town: ["potion", "greaterpotion", "weapon1", "armor1", "rope", "torch"],
  city: ["potion", "greaterpotion", "superiorpotion", "weapon1", "armor1", "cloak", "rope"],
  elite: ["greaterpotion", "superiorpotion", "weapon2", "armor2", "cloak", "amulet"],
};
