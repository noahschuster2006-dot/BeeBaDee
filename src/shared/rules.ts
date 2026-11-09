// Simplified 5th-edition-compatible rules built on the SRD 5.1 (CC-BY-4.0) core:
// d20 + modifier vs AC/DC, advantage/disadvantage, proficiency, six classes from level 1 to 10.
// Spell slots are a single pool; each spell you know has a level and needs a slot of that level available.
// Each campaign reskins names and flavour but shares the same math.

import type { Ability, AncestryId, CampaignId, Character, ClassId, Condition, Item, Skill, Token } from "./types";
export { MONSTERS, type MonsterDef } from "./monsters";

export const SKILL_ABILITY: Record<Skill, Ability> = {
  acrobatics: "dex", animal: "wis", arcana: "int", athletics: "str", deception: "cha",
  history: "int", insight: "wis", intimidation: "cha", investigation: "int", medicine: "wis",
  nature: "int", perception: "wis", performance: "cha", persuasion: "cha", religion: "int",
  sleight: "dex", stealth: "dex", survival: "wis",
};

export const SKILL_LABEL: Record<Skill, string> = {
  acrobatics: "Acrobatics", animal: "Animal Handling", arcana: "Arcana", athletics: "Athletics",
  deception: "Deception", history: "History", insight: "Insight", intimidation: "Intimidation",
  investigation: "Investigation", medicine: "Medicine", nature: "Nature", perception: "Perception",
  performance: "Performance", persuasion: "Persuasion", religion: "Religion",
  sleight: "Sleight of Hand", stealth: "Stealth", survival: "Survival",
};

export const ABILITY_LABEL: Record<Ability, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const profBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
/** XP needed to reach each level (index = level). */
export const XP_FOR_LEVEL = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000];
export const MAX_LEVEL = 10;
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

// ---------- Attacks & spells ----------

export interface AttackDef {
  id: string;
  name: string;
  ability: Ability | "finesse" | "spell";
  damage: string;
  type: string;
  range: number; // squares (1 = melee reach)
  addMod?: boolean;
}

export type SpellKind = "attack" | "save" | "auto" | "heal" | "buff" | "massheal" | "aura" | "teleport";

export interface SpellDef {
  id: string;
  name: string;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  kind: SpellKind;
  range: number;
  damage?: string;
  heal?: string;
  type?: string;
  save?: Ability;
  area?: number; // radius in squares
  rays?: number; // separate attack rolls
  condition?: Condition;
  bonusAction?: boolean;
  halfOnSave?: boolean;
  desc: string;
}

export const SPELLS: Record<string, SpellDef> = {
  // cantrips
  firebolt: { id: "firebolt", name: "Fire Bolt", level: 0, kind: "attack", range: 24, damage: "1d10", type: "fire", desc: "Hurl a mote of fire." },
  rayfrost: { id: "rayfrost", name: "Ray of Frost", level: 0, kind: "attack", range: 12, damage: "1d8", type: "cold", desc: "A frigid beam that slows the target." },
  sacredflame: { id: "sacredflame", name: "Sacred Flame", level: 0, kind: "save", save: "dex", range: 12, damage: "1d8", type: "radiant", desc: "Radiant flame descends on a creature (DEX save negates)." },
  // 1st
  magicmissile: { id: "magicmissile", name: "Magic Missile", level: 1, kind: "auto", range: 24, damage: "3d4+3", type: "force", desc: "Three darts that never miss." },
  burninghands: { id: "burninghands", name: "Burning Hands", level: 1, kind: "save", save: "dex", range: 3, area: 1, damage: "3d6", type: "fire", halfOnSave: true, desc: "A sheet of flame (DEX save for half)." },
  sleep: { id: "sleep", name: "Sleep", level: 1, kind: "save", save: "wis", range: 18, area: 2, condition: "unconscious", desc: "Creatures in the area may fall asleep (WIS save)." },
  curewounds: { id: "curewounds", name: "Cure Wounds", level: 1, kind: "heal", range: 1, heal: "1d8", desc: "Touch a creature to restore hit points." },
  healingword: { id: "healingword", name: "Healing Word", level: 1, kind: "heal", range: 12, heal: "1d4", bonusAction: true, desc: "A word of power heals at range (bonus action)." },
  bless: { id: "bless", name: "Bless", level: 1, kind: "buff", range: 6, condition: "blessed", desc: "An ally adds 1d4 to attacks and saves." },
  guidingbolt: { id: "guidingbolt", name: "Guiding Bolt", level: 1, kind: "attack", range: 24, damage: "4d6", type: "radiant", desc: "A flash of light streaks toward a creature." },
  huntersmark: { id: "huntersmark", name: "Hunter's Mark", level: 1, kind: "buff", range: 18, condition: "marked", bonusAction: true, desc: "Mark a foe: your party's hits deal +1d6." },
  // 2nd
  scorchingray: { id: "scorchingray", name: "Scorching Ray", level: 2, kind: "attack", range: 24, rays: 3, damage: "2d6", type: "fire", desc: "Three rays of fire, each a separate attack." },
  mistystep: { id: "mistystep", name: "Misty Step", level: 2, kind: "teleport", range: 6, bonusAction: true, desc: "Teleport up to 30 ft to a square you can see (bonus action)." },
  spiritualweapon: { id: "spiritualweapon", name: "Spiritual Weapon", level: 2, kind: "attack", range: 12, damage: "1d8+3", type: "force", bonusAction: true, desc: "A spectral weapon strikes (bonus action)." },
  spikegrowth: { id: "spikegrowth", name: "Spike Growth", level: 2, kind: "save", save: "dex", range: 30, area: 2, damage: "4d4", type: "piercing", halfOnSave: true, desc: "The ground sprouts thorns (DEX save for half)." },
  // 3rd
  fireball: { id: "fireball", name: "Fireball", level: 3, kind: "save", save: "dex", range: 30, area: 3, damage: "8d6", type: "fire", halfOnSave: true, desc: "A roaring explosion (DEX save for half)." },
  spiritguardians: { id: "spiritguardians", name: "Spirit Guardians", level: 3, kind: "aura", range: 0, area: 3, damage: "3d8", type: "radiant", save: "wis", condition: "guardians", desc: "Spirits circle you; foes starting their turn within 15 ft take 3d8 (WIS half)." },
  masshealingword: { id: "masshealingword", name: "Mass Healing Word", level: 3, kind: "massheal", range: 12, area: 6, heal: "1d4", bonusAction: true, desc: "Heal every ally within 30 ft of the target (bonus action)." },
  conjurebarrage: { id: "conjurebarrage", name: "Conjure Barrage", level: 3, kind: "save", save: "dex", range: 12, area: 2, damage: "3d8", type: "piercing", halfOnSave: true, desc: "A hail of missiles (DEX save for half)." },
  lightningarrow: { id: "lightningarrow", name: "Lightning Arrow", level: 3, kind: "attack", range: 30, damage: "4d8", type: "lightning", desc: "Your shot becomes a bolt of lightning." },
  // 4th
  icestorm: { id: "icestorm", name: "Ice Storm", level: 4, kind: "save", save: "dex", range: 30, area: 3, damage: "2d8+4d6", type: "cold", halfOnSave: true, desc: "Hail pounds an area (DEX save for half)." },
  deathward: { id: "deathward", name: "Death Ward", level: 4, kind: "buff", range: 1, condition: "warded", desc: "The first time the ally would drop to 0 HP, they drop to 1 instead." },
  // 5th
  coneofcold: { id: "coneofcold", name: "Cone of Cold", level: 5, kind: "save", save: "con", range: 6, area: 3, damage: "8d8", type: "cold", halfOnSave: true, desc: "A blast of freezing air (CON save for half)." },
  flamestrike: { id: "flamestrike", name: "Flame Strike", level: 5, kind: "save", save: "dex", range: 12, area: 2, damage: "8d6", type: "radiant", halfOnSave: true, desc: "A column of holy fire (DEX save for half)." },
  masscurewounds: { id: "masscurewounds", name: "Mass Cure Wounds", level: 5, kind: "massheal", range: 12, area: 6, heal: "3d8", desc: "Heal every ally near the target." },
};

export interface FeatureDef { id: string; name: string; desc: string; bonusAction?: boolean; minLevel: number; passive?: boolean }

export interface ClassDef {
  id: ClassId;
  name: string;
  hitDie: number;
  primary: Ability;
  saves: Ability[];
  skillChoices: Skill[];
  skillCount: number;
  baseAc: (c: Character) => number;
  attacks: AttackDef[];
  spells: string[];
  caster: "full" | "half" | "none";
  features: FeatureDef[];
  startItems: Item[];
  blurb: string;
}

const item = (id: string, name: string, kind: Item["kind"], extra: Partial<Item> = {}): Item => ({ id, name, kind, ...extra });
const potion = () => item("potion", "Healing Potion", "consumable", { qty: 2, heal: "2d4+2", desc: "Drink to heal 2d4+2." });

export const CLASSES: Record<ClassId, ClassDef> = {
  fighter: {
    id: "fighter", name: "Fighter", hitDie: 10, primary: "str", saves: ["str", "con"],
    skillChoices: ["athletics", "acrobatics", "intimidation", "perception", "survival", "history"], skillCount: 2,
    baseAc: () => 16, caster: "none", spells: [],
    attacks: [
      { id: "longsword", name: "Longsword", ability: "str", damage: "1d8", type: "slashing", range: 1 },
      { id: "javelin", name: "Javelin", ability: "str", damage: "1d6", type: "piercing", range: 6 },
    ],
    features: [
      { id: "secondwind", name: "Second Wind", desc: "Bonus action: heal 1d10 + level. Recharges on a short rest.", bonusAction: true, minLevel: 1 },
      { id: "actionsurge", name: "Action Surge", desc: "Take one extra action this turn. Recharges on a short rest.", minLevel: 2 },
      { id: "champion", name: "Improved Critical", desc: "Your weapon attacks score a critical hit on 19 or 20.", minLevel: 3, passive: true },
      { id: "extraattack", name: "Extra Attack", desc: "Attack twice whenever you take the Attack action.", minLevel: 5, passive: true },
      { id: "indomitable", name: "Indomitable", desc: "Once per day, automatically reroll a failed saving throw.", minLevel: 9 },
    ],
    startItems: [item("chain", "Chain Mail", "armor"), potion()],
    blurb: "Master of arms and armour. Hard to kill, hits hard.",
  },
  rogue: {
    id: "rogue", name: "Rogue", hitDie: 8, primary: "dex", saves: ["dex", "int"],
    skillChoices: ["stealth", "sleight", "acrobatics", "deception", "perception", "investigation", "insight", "persuasion"], skillCount: 4,
    baseAc: (c) => 11 + mod(c.abilities.dex), caster: "none", spells: [],
    attacks: [
      { id: "shortsword", name: "Shortsword", ability: "finesse", damage: "1d6", type: "piercing", range: 1 },
      { id: "shortbow", name: "Shortbow", ability: "dex", damage: "1d6", type: "piercing", range: 16 },
    ],
    features: [
      { id: "sneak", name: "Sneak Attack", desc: "Once per turn, +1d6 per two levels when you have advantage or an ally is next to the target.", minLevel: 1, passive: true },
      { id: "cunning", name: "Cunning Action", desc: "Dash, Disengage or Hide as a bonus action.", minLevel: 2, passive: true },
      { id: "uncanny", name: "Uncanny Dodge", desc: "Your reaction halves the damage of the first attack that hits you each round.", minLevel: 5, passive: true },
      { id: "evasion", name: "Evasion", desc: "Area effects that allow a DEX save deal no damage on a success, half on a failure.", minLevel: 7, passive: true },
    ],
    startItems: [item("leather", "Leather Armor", "armor"), item("picks", "Thieves' Tools", "gear"), potion()],
    blurb: "Quick, sneaky and precise. Big damage from the shadows.",
  },
  wizard: {
    id: "wizard", name: "Wizard", hitDie: 6, primary: "int", saves: ["int", "wis"],
    skillChoices: ["arcana", "history", "investigation", "insight", "medicine", "religion"], skillCount: 2,
    baseAc: (c) => 10 + mod(c.abilities.dex), caster: "full",
    attacks: [{ id: "quarterstaff", name: "Quarterstaff", ability: "str", damage: "1d6", type: "bludgeoning", range: 1 }],
    spells: ["firebolt", "rayfrost", "magicmissile", "burninghands", "sleep", "scorchingray", "mistystep", "fireball", "icestorm", "coneofcold"],
    features: [{ id: "arcanerecovery", name: "Arcane Recovery", desc: "Once per day, regain spell slots on a short rest.", minLevel: 1, passive: true }],
    startItems: [item("spellbook", "Spellbook", "gear"), potion()],
    blurb: "Fragile scholar of the arcane. Rains fire on the battlefield.",
  },
  cleric: {
    id: "cleric", name: "Cleric", hitDie: 8, primary: "wis", saves: ["wis", "cha"],
    skillChoices: ["religion", "medicine", "insight", "history", "persuasion"], skillCount: 2,
    baseAc: () => 16, caster: "full",
    attacks: [{ id: "mace", name: "Mace", ability: "str", damage: "1d6", type: "bludgeoning", range: 1 }],
    spells: ["sacredflame", "curewounds", "healingword", "bless", "guidingbolt", "spiritualweapon", "spiritguardians", "masshealingword", "deathward", "flamestrike", "masscurewounds"],
    features: [
      { id: "channel", name: "Turn the Wicked", desc: "Frighten hostile foes within 30 ft (WIS save). Recharges on a short rest.", minLevel: 2 },
      { id: "intervention", name: "Divine Intervention", desc: "Once per day, restore every ally to full health.", minLevel: 10 },
    ],
    startItems: [item("scale", "Scale Mail & Shield", "armor"), item("symbol", "Holy Symbol", "gear"), potion()],
    blurb: "Divine healer and protector. Keeps the party standing.",
  },
  ranger: {
    id: "ranger", name: "Ranger", hitDie: 10, primary: "dex", saves: ["str", "dex"],
    skillChoices: ["survival", "nature", "perception", "stealth", "animal", "athletics", "insight"], skillCount: 3,
    baseAc: (c) => 14 + Math.min(2, mod(c.abilities.dex)), caster: "half",
    attacks: [
      { id: "longbow", name: "Longbow", ability: "dex", damage: "1d8", type: "piercing", range: 30 },
      { id: "shortsword", name: "Shortsword", ability: "finesse", damage: "1d6", type: "piercing", range: 1 },
    ],
    spells: ["huntersmark", "curewounds", "spikegrowth", "conjurebarrage", "lightningarrow"],
    features: [{ id: "extraattack", name: "Extra Attack", desc: "Attack twice whenever you take the Attack action.", minLevel: 5, passive: true }],
    startItems: [item("scalemail", "Scale Mail", "armor"), item("rope", "Rope (50 ft)", "gear"), potion()],
    blurb: "Hunter and tracker. Deadly at range.",
  },
  barbarian: {
    id: "barbarian", name: "Barbarian", hitDie: 12, primary: "str", saves: ["str", "con"],
    skillChoices: ["athletics", "intimidation", "survival", "perception", "nature", "animal"], skillCount: 2,
    baseAc: (c) => 10 + mod(c.abilities.dex) + mod(c.abilities.con), caster: "none", spells: [],
    attacks: [
      { id: "greataxe", name: "Greataxe", ability: "str", damage: "1d12", type: "slashing", range: 1 },
      { id: "handaxe", name: "Handaxe", ability: "str", damage: "1d6", type: "slashing", range: 4 },
    ],
    features: [
      { id: "rage", name: "Rage", desc: "Bonus action: +2 melee damage (+3 at level 9), resist physical damage, advantage on melee attacks.", bonusAction: true, minLevel: 1 },
      { id: "extraattack", name: "Extra Attack", desc: "Attack twice whenever you take the Attack action.", minLevel: 5, passive: true },
      { id: "fastmove", name: "Fast Movement", desc: "+10 ft of speed.", minLevel: 5, passive: true },
      { id: "brutal", name: "Brutal Critical", desc: "Roll one extra weapon die on a critical hit.", minLevel: 9, passive: true },
    ],
    startItems: [item("furs", "Furs & Trophies", "gear"), potion()],
    blurb: "A storm of fury. Shrugs off blows that would fell others.",
  },
};

export interface AncestryDef { id: AncestryId; name: string; bonus: Partial<Record<Ability, number>>; speed: number; vision: number; trait: string }

export const ANCESTRIES: Record<AncestryId, AncestryDef> = {
  human: { id: "human", name: "Human", bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 6, vision: 8, trait: "Versatile: +1 to every ability." },
  elf: { id: "elf", name: "Elf", bonus: { dex: 2, int: 1 }, speed: 6, vision: 12, trait: "Keen senses and darkvision." },
  dwarf: { id: "dwarf", name: "Dwarf", bonus: { con: 2, str: 1 }, speed: 5, vision: 12, trait: "Sturdy; darkvision." },
  halfling: { id: "halfling", name: "Halfling", bonus: { dex: 2, cha: 1 }, speed: 5, vision: 8, trait: "Lucky and nimble." },
  orc: { id: "orc", name: "Orc", bonus: { str: 2, con: 1 }, speed: 6, vision: 12, trait: "Relentless; darkvision." },
  gnome: { id: "gnome", name: "Gnome", bonus: { int: 2, wis: 1 }, speed: 5, vision: 12, trait: "Clever tinkerer; darkvision." },
};

/** Per-campaign display names, so the same rules feel native in each world. */
export const RESKIN: Record<CampaignId, { classes: Record<ClassId, string>; ancestries: Record<AncestryId, string>; currency: string; hp: string }> = {
  realm: {
    classes: { fighter: "Knight", rogue: "Rogue", wizard: "Wizard", cleric: "Cleric", ranger: "Ranger", barbarian: "Barbarian" },
    ancestries: { human: "Human", elf: "Elf", dwarf: "Dwarf", halfling: "Halfling", orc: "Orc", gnome: "Gnome" },
    currency: "gold", hp: "Hit Points",
  },
  hollow: {
    classes: { fighter: "Needle Knight", rogue: "Shadecrawler", wizard: "Soul Weaver", cleric: "Lantern Keeper", ranger: "Thornstalker", barbarian: "Carapace Brute" },
    ancestries: { human: "Pillbug", elf: "Mothkin", dwarf: "Beetlefolk", halfling: "Mite", orc: "Mantid", gnome: "Snailfolk" },
    currency: "shell", hp: "Masks",
  },
  neon: {
    classes: { fighter: "Solo", rogue: "Fixer", wizard: "Netrunner", cleric: "Medtech", ranger: "Sniper", barbarian: "Chromed Bruiser" },
    ancestries: { human: "Baseline", elf: "Uplinked", dwarf: "Heavy-Frame", halfling: "Street Kid", orc: "Borg", gnome: "Techie" },
    currency: "cred", hp: "Integrity",
  },
};

export const NAME_RESKIN: Record<CampaignId, Record<string, string>> = {
  realm: {},
  hollow: {
    longsword: "Needle", javelin: "Thrown Barb", shortsword: "Stinger", shortbow: "Dart Spitter", quarterstaff: "Walking Stalk",
    mace: "Lantern Flail", longbow: "Thornbow", greataxe: "Mandible Cleaver", handaxe: "Shell Shard",
    firebolt: "Soul Spark", rayfrost: "Frost Sigh", magicmissile: "Soul Darts", burninghands: "Ember Bloom",
    sleep: "Dreamdust", sacredflame: "Lumen Flare", curewounds: "Mending Glow", healingword: "Hymn of Mending",
    bless: "Lantern's Grace", guidingbolt: "Pale Beacon", huntersmark: "Scent Mark",
    scorchingray: "Soul Lances", mistystep: "Shade Dash", spiritualweapon: "Ghost Needle", spikegrowth: "Thornbed",
    fireball: "Soulburst", spiritguardians: "Lantern Wisps", masshealingword: "Choir of Mending", conjurebarrage: "Barb Storm",
    lightningarrow: "Storm Barb", icestorm: "Frost Hail", deathward: "Last Lantern", coneofcold: "Winter Sigh",
    flamestrike: "Pillar of Light", masscurewounds: "Great Mending",
  },
  neon: {
    longsword: "Mono-Katana", javelin: "Throwing Spike", shortsword: "Combat Knife", shortbow: "Smart Pistol", quarterstaff: "Shock Baton",
    mace: "Stun Rod", longbow: "Rail Rifle", greataxe: "Chainblade", handaxe: "Frag Grenade",
    firebolt: "Overheat", rayfrost: "Cryo Ping", magicmissile: "Seeker Swarm", burninghands: "Short Circuit",
    sleep: "System Lockout", sacredflame: "Neural Spike", curewounds: "Nano-Patch", healingword: "Remote Stim",
    bless: "Combat Uplink", guidingbolt: "Laser Designator", huntersmark: "Target Lock",
    scorchingray: "Triple Burst", mistystep: "Blink Implant", spiritualweapon: "Combat Drone", spikegrowth: "Caltrop Mines",
    fireball: "Thermite Charge", spiritguardians: "Defense Grid", masshealingword: "Med-Drone Swarm", conjurebarrage: "Bullet Hose",
    lightningarrow: "EMP Round", icestorm: "Cryo Barrage", deathward: "Trauma Implant", coneofcold: "Liquid Nitrogen Spray",
    flamestrike: "Orbital Strike", masscurewounds: "Nanite Flood",
  },
};

export const displayName = (campaign: CampaignId | null | undefined, id: string, base: string) =>
  (campaign && NAME_RESKIN[campaign][id]) || base;

// ---------- Character math ----------

export const abilityMod = (c: Character, a: Ability) => mod(c.abilities[a]);

/** Best bonus granted by carried magic items. */
export function itemBonus(c: Character, key: "attackBonus" | "acBonus" | "saveBonus") {
  return c.inventory.reduce((best, i) => Math.max(best, i[key] ?? 0), 0);
}

export const armorClass = (c: Character) => CLASSES[c.cls].baseAc(c) + itemBonus(c, "acBonus");
export const skillBonus = (c: Character, s: Skill) => abilityMod(c, SKILL_ABILITY[s]) + (c.skills.includes(s) ? profBonus(c.level) : 0);
export const saveBonus = (c: Character, a: Ability) =>
  abilityMod(c, a) + (CLASSES[c.cls].saves.includes(a) ? profBonus(c.level) : 0) + itemBonus(c, "saveBonus");
export const spellAbility = (c: Character): Ability => (c.cls === "ranger" ? "wis" : CLASSES[c.cls].primary);
export const spellDC = (c: Character) => 8 + profBonus(c.level) + abilityMod(c, spellAbility(c)) + itemBonus(c, "attackBonus");
export const spellAttackBonus = (c: Character) => abilityMod(c, spellAbility(c)) + profBonus(c.level) + itemBonus(c, "attackBonus");

export function attackBonus(c: Character, atk: AttackDef) {
  let ab: Ability;
  if (atk.ability === "finesse") ab = c.abilities.dex >= c.abilities.str ? "dex" : "str";
  else if (atk.ability === "spell") ab = spellAbility(c);
  else ab = atk.ability;
  const magic = itemBonus(c, "attackBonus");
  return { bonus: abilityMod(c, ab) + profBonus(c.level) + magic, dmgMod: (atk.addMod === false ? 0 : abilityMod(c, ab)) + magic };
}

export const hasFeature = (c: Character, id: string) => CLASSES[c.cls].features.some((f) => f.id === id && c.level >= f.minLevel);
export const attacksPerAction = (c: Character) => (hasFeature(c, "extraattack") ? 2 : 1);
export const critRange = (c: Character) => (hasFeature(c, "champion") ? 19 : 20);
export const rageDamage = (c: Character) => (c.level >= 9 ? 3 : 2);
export const speedBonus = (c: Character) => (hasFeature(c, "fastmove") ? 2 : 0);

/** Highest spell level the character can cast. */
export function maxSpellLevel(c: Character) {
  const k = CLASSES[c.cls].caster;
  if (k === "full") return Math.min(5, Math.ceil(c.level / 2));
  if (k === "half") return c.level < 2 ? 0 : c.level < 5 ? 1 : c.level < 9 ? 2 : 3;
  return 0;
}

const FULL_SLOTS = [0, 2, 3, 6, 7, 9, 10, 11, 12, 14, 15];
const HALF_SLOTS = [0, 0, 2, 3, 3, 6, 6, 7, 7, 9, 9];
export function slotsFor(cls: ClassId, level: number) {
  const k = CLASSES[cls].caster;
  return k === "full" ? FULL_SLOTS[level] : k === "half" ? HALF_SLOTS[level] : 0;
}

export const knownSpells = (c: Character) => CLASSES[c.cls].spells.filter((id) => SPELLS[id].level <= maxSpellLevel(c));

export function maxHpFor(cls: ClassId, level: number, con: number) {
  const hd = CLASSES[cls].hitDie;
  const avg = Math.floor(hd / 2) + 1;
  return Math.max(1, hd + mod(con) + (level - 1) * (avg + mod(con)));
}

export const sneakDice = (level: number) => Math.ceil(level / 2);
export const cantripDice = (level: number) => (level >= 11 ? 3 : level >= 5 ? 2 : 1);

export function featureUses(cls: ClassId, level: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of CLASSES[cls].features) {
    if (level < f.minLevel || f.passive) continue;
    out[f.id] = f.id === "rage" ? (level >= 6 ? 4 : level >= 3 ? 3 : 2) : f.id === "channel" ? (level >= 6 ? 2 : 1) : 1;
  }
  if (cls === "wizard") out.arcanerecovery = 1;
  return out;
}

export function newCharacter(opts: {
  id: string; name: string; cls: ClassId; ancestry: AncestryId; campaign: CampaignId | "any";
  scores?: Record<Ability, number>; skills?: Skill[]; backstory?: string;
}): Character {
  const cls = CLASSES[opts.cls];
  const anc = ANCESTRIES[opts.ancestry];
  if (!cls || !anc) throw new Error("Unknown class or ancestry");
  const base = opts.scores ?? suggestedScores(opts.cls);
  const abilities = { ...base };
  for (const [a, b] of Object.entries(anc.bonus)) abilities[a as Ability] += b!;
  const picked = [...new Set((opts.skills ?? []).filter((k) => cls.skillChoices.includes(k)))];
  for (const k of cls.skillChoices) if (picked.length < cls.skillCount && !picked.includes(k)) picked.push(k);
  const maxHp = maxHpFor(opts.cls, 1, abilities.con);
  return {
    id: opts.id, name: opts.name.slice(0, 32) || "Adventurer", campaign: opts.campaign,
    ancestry: opts.ancestry, cls: opts.cls, level: 1, xp: 0, abilities, skills: picked.slice(0, cls.skillCount),
    maxHp, hp: maxHp, tempHp: 0,
    inventory: cls.startItems.map((i) => ({ ...i })),
    gold: 15, spellSlots: slotsFor(opts.cls, 1), maxSpellSlots: slotsFor(opts.cls, 1),
    features: featureUses(opts.cls, 1), deathSaves: { success: 0, fail: 0 }, backstory: opts.backstory,
  };
}

export function suggestedScores(cls: ClassId): Record<Ability, number> {
  const order: Record<ClassId, Ability[]> = {
    fighter: ["str", "con", "dex", "wis", "cha", "int"],
    rogue: ["dex", "con", "wis", "int", "cha", "str"],
    wizard: ["int", "con", "dex", "wis", "cha", "str"],
    cleric: ["wis", "con", "str", "cha", "dex", "int"],
    ranger: ["dex", "wis", "con", "str", "int", "cha"],
    barbarian: ["str", "con", "dex", "wis", "cha", "int"],
  };
  const out = {} as Record<Ability, number>;
  order[cls].forEach((a, i) => (out[a] = STANDARD_ARRAY[i]));
  return out;
}

/** Ability score improvement at levels 4 and 8: +2 to the class's main ability (max 20), else CON. */
function applyAsi(c: Character) {
  const p = CLASSES[c.cls].primary;
  const target: Ability = c.abilities[p] <= 18 ? p : "con";
  c.abilities[target] = Math.min(20, c.abilities[target] + 2);
}

/** Applies XP; returns the new level if the character levelled up. */
export function grantXp(c: Character, xp: number): number | null {
  c.xp += xp;
  let leveled: number | null = null;
  while (c.level < MAX_LEVEL && c.xp >= XP_FOR_LEVEL[c.level + 1]) {
    c.level += 1;
    leveled = c.level;
    if (c.level === 4 || c.level === 8) applyAsi(c);
    const newMax = maxHpFor(c.cls, c.level, c.abilities.con);
    c.hp = Math.max(1, c.hp + (newMax - c.maxHp));
    c.maxHp = newMax;
    c.maxSpellSlots = slotsFor(c.cls, c.level);
    c.spellSlots = c.maxSpellSlots;
    c.features = featureUses(c.cls, c.level);
  }
  return leveled;
}

/** Story milestone: brings the character up to at least `level`. */
export function reachLevel(c: Character, level: number) {
  const need = XP_FOR_LEVEL[Math.min(MAX_LEVEL, level)] - c.xp;
  return need > 0 ? grantXp(c, need) : null;
}

export function longRest(c: Character) {
  c.hp = c.maxHp;
  c.spellSlots = c.maxSpellSlots;
  c.features = featureUses(c.cls, c.level);
  c.deathSaves = { success: 0, fail: 0 };
}

export function shortRest(c: Character, rollHitDie: () => number) {
  let heal = 0;
  for (let i = 0; i < Math.max(1, Math.ceil(c.level / 2)); i++) heal += Math.max(1, rollHitDie() + abilityMod(c, "con"));
  c.hp = Math.min(c.maxHp, c.hp + heal);
  const fresh = featureUses(c.cls, c.level);
  for (const k of ["secondwind", "actionsurge", "channel"]) if (fresh[k] !== undefined) c.features[k] = fresh[k];
  if (c.cls === "wizard" && (c.features.arcanerecovery ?? 0) > 0 && c.spellSlots < c.maxSpellSlots) {
    c.features.arcanerecovery -= 1;
    c.spellSlots = Math.min(c.maxSpellSlots, c.spellSlots + Math.max(1, Math.ceil(c.level / 2)));
  }
  return heal;
}

export const isHostile = (t: Token) => t.kind === "enemy" || t.disposition === "hostile";
export const isDown = (t: Token) => t.conditions.includes("dead") || t.conditions.includes("unconscious");
