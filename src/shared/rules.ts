// Simplified 5th-edition-compatible rules built on the SRD 5.1 (CC-BY-4.0) core:
// d20 + modifier vs AC/DC, advantage/disadvantage, proficiency, six classes at levels 1-5.
// Each campaign reskins names and flavour but shares the same math.

import type {
  Ability, AncestryId, CampaignId, Character, ClassId, Condition, Item, Skill, Token,
} from "./types";

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
export const XP_FOR_LEVEL = [0, 0, 300, 900, 2700, 6500]; // index = level
export const MAX_LEVEL = 5;

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

// ---------- Attacks & spells ----------

export interface AttackDef {
  id: string;
  name: string;
  ability: Ability | "finesse" | "spell";
  damage: string; // dice, ability mod added automatically for weapons
  type: string; // slashing, fire...
  range: number; // squares (1 = melee reach)
  addMod?: boolean; // default true for weapons, false for cantrips
}

export interface SpellDef {
  id: string;
  name: string;
  level: 0 | 1;
  kind: "attack" | "save" | "auto" | "heal" | "buff";
  range: number;
  damage?: string;
  heal?: string;
  type?: string;
  save?: Ability;
  area?: number; // radius in squares around target point
  condition?: Condition;
  bonusAction?: boolean;
  desc: string;
}

export const SPELLS: Record<string, SpellDef> = {
  firebolt: { id: "firebolt", name: "Fire Bolt", level: 0, kind: "attack", range: 24, damage: "1d10", type: "fire", desc: "Hurl a mote of fire." },
  sacredflame: { id: "sacredflame", name: "Sacred Flame", level: 0, kind: "save", save: "dex", range: 12, damage: "1d8", type: "radiant", desc: "Radiant flame descends on a creature (DEX save negates)." },
  rayfrost: { id: "rayfrost", name: "Ray of Frost", level: 0, kind: "attack", range: 12, damage: "1d8", type: "cold", desc: "A frigid beam; also slows." },
  magicmissile: { id: "magicmissile", name: "Magic Missile", level: 1, kind: "auto", range: 24, damage: "3d4+3", type: "force", desc: "Three darts that never miss." },
  burninghands: { id: "burninghands", name: "Burning Hands", level: 1, kind: "save", save: "dex", range: 3, area: 1, damage: "3d6", type: "fire", desc: "A sheet of flame (DEX save for half) around a point within 3 squares." },
  sleep: { id: "sleep", name: "Sleep", level: 1, kind: "save", save: "wis", range: 18, area: 2, condition: "unconscious", desc: "Creatures in the area may fall asleep (WIS save)." },
  curewounds: { id: "curewounds", name: "Cure Wounds", level: 1, kind: "heal", range: 1, heal: "1d8", desc: "Touch a creature to restore hit points." },
  healingword: { id: "healingword", name: "Healing Word", level: 1, kind: "heal", range: 12, heal: "1d4", bonusAction: true, desc: "A word of power heals at range (bonus action)." },
  bless: { id: "bless", name: "Bless", level: 1, kind: "buff", range: 6, condition: "blessed", desc: "An ally adds 1d4 to attacks and saves." },
  guidingbolt: { id: "guidingbolt", name: "Guiding Bolt", level: 1, kind: "attack", range: 24, damage: "4d6", type: "radiant", desc: "A flash of light streaks toward a creature." },
  huntersmark: { id: "huntersmark", name: "Hunter's Mark", level: 1, kind: "buff", range: 18, condition: "marked", bonusAction: true, desc: "Mark a foe: your hits deal +1d6." },
};

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
  slotsByLevel: number[]; // index = level
  features: { id: string; name: string; uses: number; desc: string; bonusAction?: boolean }[];
  startItems: Item[];
  blurb: string;
}

const item = (id: string, name: string, kind: Item["kind"], extra: Partial<Item> = {}): Item => ({ id, name, kind, ...extra });
const potion = () => item("potion", "Healing Potion", "consumable", { qty: 2, heal: "2d4+2", desc: "Drink to heal 2d4+2." });

export const CLASSES: Record<ClassId, ClassDef> = {
  fighter: {
    id: "fighter", name: "Fighter", hitDie: 10, primary: "str", saves: ["str", "con"],
    skillChoices: ["athletics", "acrobatics", "intimidation", "perception", "survival", "history"], skillCount: 2,
    baseAc: () => 16,
    attacks: [
      { id: "longsword", name: "Longsword", ability: "str", damage: "1d8", type: "slashing", range: 1 },
      { id: "javelin", name: "Javelin", ability: "str", damage: "1d6", type: "piercing", range: 6 },
    ],
    spells: [], slotsByLevel: [0, 0, 0, 0, 0, 0],
    features: [
      { id: "secondwind", name: "Second Wind", uses: 1, desc: "Bonus action: heal 1d10 + level.", bonusAction: true },
      { id: "actionsurge", name: "Action Surge", uses: 1, desc: "Take one extra action this turn (level 2+)." },
    ],
    startItems: [item("chain", "Chain Mail", "armor"), potion()],
    blurb: "Master of arms and armour. Hard to kill, hits hard.",
  },
  rogue: {
    id: "rogue", name: "Rogue", hitDie: 8, primary: "dex", saves: ["dex", "int"],
    skillChoices: ["stealth", "sleight", "acrobatics", "deception", "perception", "investigation", "insight", "persuasion"], skillCount: 4,
    baseAc: (c) => 11 + mod(c.abilities.dex),
    attacks: [
      { id: "shortsword", name: "Shortsword", ability: "finesse", damage: "1d6", type: "piercing", range: 1 },
      { id: "shortbow", name: "Shortbow", ability: "dex", damage: "1d6", type: "piercing", range: 16 },
    ],
    spells: [], slotsByLevel: [0, 0, 0, 0, 0, 0],
    features: [{ id: "sneak", name: "Sneak Attack", uses: 99, desc: "Once per turn, +Xd6 when you have advantage or an ally is next to the target." }],
    startItems: [item("leather", "Leather Armor", "armor"), item("picks", "Thieves' Tools", "gear"), potion()],
    blurb: "Quick, sneaky and precise. Big damage from the shadows.",
  },
  wizard: {
    id: "wizard", name: "Wizard", hitDie: 6, primary: "int", saves: ["int", "wis"],
    skillChoices: ["arcana", "history", "investigation", "insight", "medicine", "religion"], skillCount: 2,
    baseAc: (c) => 10 + mod(c.abilities.dex),
    attacks: [{ id: "quarterstaff", name: "Quarterstaff", ability: "str", damage: "1d6", type: "bludgeoning", range: 1 }],
    spells: ["firebolt", "rayfrost", "magicmissile", "burninghands", "sleep"], slotsByLevel: [0, 2, 3, 4, 4, 5],
    features: [{ id: "arcanerecovery", name: "Arcane Recovery", uses: 1, desc: "Once per day, regain a spell slot on a short rest." }],
    startItems: [item("spellbook", "Spellbook", "gear"), potion()],
    blurb: "Fragile scholar of the arcane. Controls the battlefield.",
  },
  cleric: {
    id: "cleric", name: "Cleric", hitDie: 8, primary: "wis", saves: ["wis", "cha"],
    skillChoices: ["religion", "medicine", "insight", "history", "persuasion"], skillCount: 2,
    baseAc: () => 16,
    attacks: [{ id: "mace", name: "Mace", ability: "str", damage: "1d6", type: "bludgeoning", range: 1 }],
    spells: ["sacredflame", "curewounds", "healingword", "bless", "guidingbolt"], slotsByLevel: [0, 2, 3, 4, 4, 5],
    features: [{ id: "channel", name: "Turn the Wicked", uses: 1, desc: "Frighten nearby hostile foes (WIS save)." }],
    startItems: [item("scale", "Scale Mail & Shield", "armor"), item("symbol", "Holy Symbol", "gear"), potion()],
    blurb: "Divine healer and protector. Keeps the party standing.",
  },
  ranger: {
    id: "ranger", name: "Ranger", hitDie: 10, primary: "dex", saves: ["str", "dex"],
    skillChoices: ["survival", "nature", "perception", "stealth", "animal", "athletics", "insight"], skillCount: 3,
    baseAc: (c) => 13 + Math.min(2, mod(c.abilities.dex)) + 1,
    attacks: [
      { id: "longbow", name: "Longbow", ability: "dex", damage: "1d8", type: "piercing", range: 30 },
      { id: "shortsword", name: "Shortsword", ability: "finesse", damage: "1d6", type: "piercing", range: 1 },
    ],
    spells: ["huntersmark", "curewounds"], slotsByLevel: [0, 0, 2, 3, 3, 4],
    features: [],
    startItems: [item("scalemail", "Scale Mail", "armor"), item("rope", "Rope (50 ft)", "gear"), potion()],
    blurb: "Hunter and tracker. Deadly at range.",
  },
  barbarian: {
    id: "barbarian", name: "Barbarian", hitDie: 12, primary: "str", saves: ["str", "con"],
    skillChoices: ["athletics", "intimidation", "survival", "perception", "nature", "animal"], skillCount: 2,
    baseAc: (c) => 10 + mod(c.abilities.dex) + mod(c.abilities.con),
    attacks: [
      { id: "greataxe", name: "Greataxe", ability: "str", damage: "1d12", type: "slashing", range: 1 },
      { id: "handaxe", name: "Handaxe", ability: "str", damage: "1d6", type: "slashing", range: 4 },
    ],
    spells: [], slotsByLevel: [0, 0, 0, 0, 0, 0],
    features: [{ id: "rage", name: "Rage", uses: 2, desc: "Bonus action: +2 melee damage, resist physical damage, advantage on STR.", bonusAction: true }],
    startItems: [item("furs", "Furs & Trophies", "gear"), potion()],
    blurb: "A storm of fury. Shrugs off blows that would fell others.",
  },
};

export interface AncestryDef {
  id: AncestryId;
  name: string;
  bonus: Partial<Record<Ability, number>>;
  speed: number; // squares
  vision: number;
  trait: string;
}

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

/** Reskinned names for attacks/spells per campaign (falls back to the base name). */
export const NAME_RESKIN: Record<CampaignId, Record<string, string>> = {
  realm: {},
  hollow: {
    longsword: "Needle", javelin: "Thrown Barb", shortsword: "Stinger", shortbow: "Dart Spitter", quarterstaff: "Walking Stalk",
    mace: "Lantern Flail", longbow: "Thornbow", greataxe: "Mandible Cleaver", handaxe: "Shell Shard",
    firebolt: "Soul Spark", rayfrost: "Frost Sigh", magicmissile: "Soul Darts", burninghands: "Ember Bloom",
    sleep: "Dreamdust", sacredflame: "Lumen Flare", curewounds: "Mending Glow", healingword: "Hymn of Mending",
    bless: "Lantern's Grace", guidingbolt: "Pale Beacon", huntersmark: "Scent Mark",
  },
  neon: {
    longsword: "Mono-Katana", javelin: "Throwing Spike", shortsword: "Combat Knife", shortbow: "Smart Pistol", quarterstaff: "Shock Baton",
    mace: "Stun Rod", longbow: "Rail Rifle", greataxe: "Chainblade", handaxe: "Frag Grenade",
    firebolt: "Overheat", rayfrost: "Cryo Ping", magicmissile: "Seeker Swarm", burninghands: "Short Circuit",
    sleep: "System Lockout", sacredflame: "Neural Spike", curewounds: "Nano-Patch", healingword: "Remote Stim",
    bless: "Combat Uplink", guidingbolt: "Laser Designator", huntersmark: "Target Lock",
  },
};

export const displayName = (campaign: CampaignId | null | undefined, id: string, base: string) =>
  (campaign && NAME_RESKIN[campaign][id]) || base;

// ---------- Character math ----------

export function abilityMod(c: Character, a: Ability) {
  return mod(c.abilities[a]);
}

export function armorClass(c: Character) {
  return CLASSES[c.cls].baseAc(c);
}

export function skillBonus(c: Character, s: Skill) {
  return abilityMod(c, SKILL_ABILITY[s]) + (c.skills.includes(s) ? profBonus(c.level) : 0);
}

export function saveBonus(c: Character, a: Ability) {
  return abilityMod(c, a) + (CLASSES[c.cls].saves.includes(a) ? profBonus(c.level) : 0);
}

export function spellAbility(c: Character): Ability {
  const p = CLASSES[c.cls].primary;
  return c.cls === "ranger" ? "wis" : p;
}

export function spellDC(c: Character) {
  return 8 + profBonus(c.level) + abilityMod(c, spellAbility(c));
}

export function attackBonus(c: Character, atk: AttackDef) {
  let ab: Ability;
  if (atk.ability === "finesse") ab = c.abilities.dex >= c.abilities.str ? "dex" : "str";
  else if (atk.ability === "spell") ab = spellAbility(c);
  else ab = atk.ability;
  return { bonus: abilityMod(c, ab) + profBonus(c.level), dmgMod: atk.addMod === false ? 0 : abilityMod(c, ab) };
}

export function spellAttackBonus(c: Character) {
  return abilityMod(c, spellAbility(c)) + profBonus(c.level);
}

export function maxHpFor(cls: ClassId, level: number, con: number) {
  const hd = CLASSES[cls].hitDie;
  const avg = Math.floor(hd / 2) + 1;
  return Math.max(1, hd + mod(con) + (level - 1) * (avg + mod(con)));
}

export function sneakDice(level: number) {
  return Math.ceil(level / 2);
}

export function cantripDice(level: number) {
  return level >= 5 ? 2 : 1;
}

export function featureUses(cls: ClassId, level: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of CLASSES[cls].features) {
    if (f.id === "actionsurge" && level < 2) continue;
    out[f.id] = f.id === "rage" ? (level >= 3 ? 3 : 2) : f.uses;
  }
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
  const skills = picked.slice(0, cls.skillCount);
  const maxHp = maxHpFor(opts.cls, 1, abilities.con);
  return {
    id: opts.id, name: opts.name.slice(0, 32) || "Adventurer", campaign: opts.campaign,
    ancestry: opts.ancestry, cls: opts.cls, level: 1, xp: 0, abilities, skills,
    maxHp, hp: maxHp, tempHp: 0,
    inventory: cls.startItems.map((i) => ({ ...i })),
    gold: 15, spellSlots: cls.slotsByLevel[1], maxSpellSlots: cls.slotsByLevel[1],
    features: featureUses(opts.cls, 1), deathSaves: { success: 0, fail: 0 }, backstory: opts.backstory,
  };
}

/** Standard array assigned by class priority. */
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

/** Applies XP; returns the new level if the character levelled up. */
export function grantXp(c: Character, xp: number): number | null {
  c.xp += xp;
  let leveled: number | null = null;
  while (c.level < MAX_LEVEL && c.xp >= XP_FOR_LEVEL[c.level + 1]) {
    c.level += 1;
    leveled = c.level;
    const newMax = maxHpFor(c.cls, c.level, c.abilities.con);
    c.hp += newMax - c.maxHp;
    c.maxHp = newMax;
    c.maxSpellSlots = CLASSES[c.cls].slotsByLevel[c.level];
    c.spellSlots = c.maxSpellSlots;
    c.features = { ...featureUses(c.cls, c.level) };
  }
  return leveled;
}

export function longRest(c: Character) {
  c.hp = c.maxHp;
  c.spellSlots = c.maxSpellSlots;
  c.features = featureUses(c.cls, c.level);
  c.deathSaves = { success: 0, fail: 0 };
}

export function shortRest(c: Character, rollHitDie: () => number) {
  const heal = Math.max(1, rollHitDie() + abilityMod(c, "con"));
  c.hp = Math.min(c.maxHp, c.hp + heal);
  if (c.features.secondwind !== undefined) c.features.secondwind = 1;
  if (c.features.actionsurge !== undefined) c.features.actionsurge = 1;
  if (c.features.channel !== undefined) c.features.channel = 1;
  if (c.cls === "wizard" && c.features.arcanerecovery > 0 && c.spellSlots < c.maxSpellSlots) {
    c.features.arcanerecovery -= 1;
    c.spellSlots += 1;
  }
  return heal;
}

// ---------- Monsters ----------

export interface MonsterDef {
  id: string;
  name: string;
  hp: string; // dice expression
  ac: number;
  speed: number;
  size?: number;
  abilities: Record<Ability, number>;
  attacks: { name: string; bonus: number; damage: string; type: string; range: number }[];
  xp: number;
  glyph: string;
  color: string;
  vision?: number;
  tactics?: "brute" | "skirmisher" | "ranged" | "coward" | "caster";
  desc: string;
}

const abil = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({ str, dex, con, int, wis, cha });

export const MONSTERS: Record<string, MonsterDef> = {
  // Realm (medieval)
  goblin: { id: "goblin", name: "Goblin", hp: "2d6", ac: 15, speed: 6, abilities: abil(8, 14, 10, 10, 8, 8), attacks: [{ name: "Scimitar", bonus: 4, damage: "1d6+2", type: "slashing", range: 1 }, { name: "Shortbow", bonus: 4, damage: "1d6+2", type: "piercing", range: 16 }], xp: 50, glyph: "👺", color: "#5f8f3a", tactics: "skirmisher", desc: "Small, cruel and cunning." },
  wolf: { id: "wolf", name: "Wolf", hp: "2d8+2", ac: 13, speed: 8, abilities: abil(12, 15, 12, 3, 12, 6), attacks: [{ name: "Bite", bonus: 4, damage: "2d4+2", type: "piercing", range: 1 }], xp: 50, glyph: "🐺", color: "#7a7a80", tactics: "brute", desc: "Hunts in packs." },
  skeleton: { id: "skeleton", name: "Skeleton", hp: "2d8+4", ac: 13, speed: 6, abilities: abil(10, 14, 15, 6, 8, 5), attacks: [{ name: "Shortsword", bonus: 4, damage: "1d6+2", type: "piercing", range: 1 }, { name: "Shortbow", bonus: 4, damage: "1d6+2", type: "piercing", range: 16 }], xp: 50, glyph: "💀", color: "#d8d2bd", tactics: "brute", desc: "Animated bones bound to old orders." },
  bandit: { id: "bandit", name: "Bandit", hp: "2d8+2", ac: 12, speed: 6, abilities: abil(11, 12, 12, 10, 10, 10), attacks: [{ name: "Scimitar", bonus: 3, damage: "1d6+1", type: "slashing", range: 1 }, { name: "Crossbow", bonus: 3, damage: "1d8+1", type: "piercing", range: 16 }], xp: 25, glyph: "🗡️", color: "#8a5a3a", tactics: "skirmisher", desc: "Desperate cutthroat." },
  ogre: { id: "ogre", name: "Ogre", hp: "7d10+21", ac: 11, speed: 8, size: 2, abilities: abil(19, 8, 16, 5, 7, 7), attacks: [{ name: "Greatclub", bonus: 6, damage: "2d8+4", type: "bludgeoning", range: 1 }], xp: 450, glyph: "👹", color: "#9a7b4f", tactics: "brute", desc: "Huge, hungry and stupid." },
  necromancer: { id: "necromancer", name: "Vesk the Gravecaller", hp: "8d8+8", ac: 13, speed: 6, abilities: abil(9, 14, 12, 17, 12, 11), attacks: [{ name: "Chill Touch", bonus: 5, damage: "2d8", type: "necrotic", range: 12 }, { name: "Dagger", bonus: 4, damage: "1d4+2", type: "piercing", range: 1 }], xp: 700, glyph: "🧙", color: "#4b2a63", tactics: "caster", desc: "A disgraced court mage raising the dead." },
  // Hollow (insect kingdom)
  husk: { id: "husk", name: "Wandering Husk", hp: "2d8", ac: 12, speed: 5, abilities: abil(12, 10, 12, 3, 6, 3), attacks: [{ name: "Claw", bonus: 3, damage: "1d6+1", type: "slashing", range: 1 }], xp: 25, glyph: "🪲", color: "#9aa3ad", tactics: "brute", desc: "An empty shell still walking its old patrol." },
  spitter: { id: "spitter", name: "Acid Spitter", hp: "3d6", ac: 12, speed: 5, abilities: abil(8, 14, 10, 3, 10, 3), attacks: [{ name: "Acid Glob", bonus: 4, damage: "1d8+2", type: "acid", range: 10 }], xp: 50, glyph: "🐛", color: "#8bbf3a", tactics: "ranged", desc: "Lobs globs of burning bile from range." },
  mosquito: { id: "mosquito", name: "Blood Gnat", hp: "1d8", ac: 13, speed: 8, abilities: abil(6, 16, 10, 2, 10, 3), attacks: [{ name: "Proboscis", bonus: 5, damage: "1d4+3", type: "piercing", range: 1 }], xp: 25, glyph: "🦟", color: "#b04a4a", tactics: "skirmisher", desc: "A darting swarmling that drinks soul and blood." },
  mantisguard: { id: "mantisguard", name: "Mantis Duelist", hp: "5d8+5", ac: 15, speed: 7, abilities: abil(14, 17, 12, 11, 13, 10), attacks: [{ name: "Scythe Arms", bonus: 5, damage: "2d6+3", type: "slashing", range: 1 }], xp: 200, glyph: "🦗", color: "#5aa36a", tactics: "skirmisher", desc: "Honour-bound blade dancer of the canopy." },
  broodmother: { id: "broodmother", name: "The Pale Broodmother", hp: "10d10+20", ac: 14, speed: 6, size: 2, abilities: abil(18, 10, 15, 6, 12, 8), attacks: [{ name: "Crushing Mandibles", bonus: 6, damage: "2d10+4", type: "piercing", range: 1 }, { name: "Spore Burst", bonus: 5, damage: "2d6", type: "poison", range: 8 }], xp: 900, glyph: "🕷️", color: "#e6e1f5", tactics: "brute", desc: "A swollen queen fed by the Pale Bloom infection." },
  // Neon (cyberpunk)
  ganger: { id: "ganger", name: "Chrome Saint Ganger", hp: "2d8+2", ac: 12, speed: 6, abilities: abil(12, 13, 12, 9, 9, 10), attacks: [{ name: "Machete", bonus: 3, damage: "1d6+1", type: "slashing", range: 1 }, { name: "SMG Burst", bonus: 3, damage: "2d4+1", type: "ballistic", range: 12 }], xp: 50, glyph: "😈", color: "#d43a8a", tactics: "skirmisher", desc: "Street punk with cheap chrome." },
  drone: { id: "drone", name: "Security Drone", hp: "2d6+2", ac: 14, speed: 8, abilities: abil(6, 16, 12, 3, 12, 1), attacks: [{ name: "Taser", bonus: 5, damage: "1d8+2", type: "lightning", range: 8 }], xp: 50, glyph: "🛸", color: "#3ac8e6", tactics: "ranged", desc: "Hovering corp eye with a stun prod." },
  enforcer: { id: "enforcer", name: "Corp Enforcer", hp: "4d10+8", ac: 16, speed: 6, abilities: abil(16, 12, 14, 10, 11, 10), attacks: [{ name: "Shock Maul", bonus: 5, damage: "1d10+3", type: "lightning", range: 1 }, { name: "Rifle", bonus: 4, damage: "1d10+1", type: "ballistic", range: 20 }], xp: 200, glyph: "🤖", color: "#e6b23a", tactics: "brute", desc: "Armoured security in Halcyon Dynamics colours." },
  ice: { id: "ice", name: "Black ICE Construct", hp: "6d8+12", ac: 15, speed: 7, abilities: abil(14, 16, 14, 18, 12, 6), attacks: [{ name: "Feedback Lash", bonus: 6, damage: "2d8+3", type: "psychic", range: 6 }], xp: 450, glyph: "🧊", color: "#7a5cff", tactics: "caster", desc: "Defensive intrusion countermeasure given a hard-light body." },
  mech: { id: "mech", name: "KOMODO Security Mech", hp: "10d10+30", ac: 17, speed: 6, size: 2, abilities: abil(20, 9, 17, 6, 10, 3), attacks: [{ name: "Hydraulic Fist", bonus: 7, damage: "2d10+5", type: "bludgeoning", range: 1 }, { name: "Autocannon", bonus: 5, damage: "2d8+2", type: "ballistic", range: 24 }], xp: 900, glyph: "🦾", color: "#c84a2a", tactics: "brute", desc: "Two-legged walking tank guarding the vault." },
};

export function isHostile(t: Token) {
  return t.kind === "enemy" || t.disposition === "hostile";
}

export function isDown(t: Token) {
  return t.conditions.includes("dead") || t.conditions.includes("unconscious");
}
