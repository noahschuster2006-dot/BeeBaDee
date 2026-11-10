// The everyday foes of each world: about a hundred standard creatures per campaign, from challenge 1/8
// up to 10. Rows are compact; statistics are derived from challenge rating and combat role using the
// usual 5e monster-building numbers, so every creature levels with the party in a consistent way.
// Habitats say where a creature turns up during travel and exploration ("*" = anywhere in that world).

import type { Ability, CampaignId } from "./types";
import type { MonsterDef, MonsterSpecial } from "./monsters";

/** B brute · S skirmisher · R ranged · C caster · W coward · T tank · X swarm */
type Role = "B" | "S" | "R" | "C" | "W" | "T" | "X";
interface Extra {
  /** area special: "Name/save/type/radius/condition?" */
  s?: string;
  res?: string[];
  regen?: number;
  big?: boolean;
  range?: number;
  /** second attack: "Name/type/range" */
  a2?: string;
}
type Row = [id: string, name: string, cr: number, role: Role, glyph: string, color: string, attack: string, type: string, habitat: string, desc: string, x?: Extra];

const PHYS = ["slashing", "piercing", "bludgeoning"];

export const XP_BY_CR: Record<number, number> = { 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900 };
const HP_BY_CR: Record<number, number> = { 0.125: 7, 0.25: 11, 0.5: 17, 1: 27, 2: 42, 3: 58, 4: 72, 5: 88, 6: 102, 7: 116, 8: 132, 9: 146, 10: 162 };
const DPR_BY_CR: Record<number, number> = { 0.125: 3.5, 0.25: 5, 0.5: 7, 1: 10, 2: 15, 3: 20, 4: 25, 5: 30, 6: 36, 7: 42, 8: 48, 9: 54, 10: 60 };

const ROLE = {
  B: { hp: 1.2, ac: -1, dmg: 1.1, speed: 6, die: 10, prim: "str", tactics: "brute" },
  S: { hp: 0.9, ac: 1, dmg: 1, speed: 8, die: 6, prim: "dex", tactics: "skirmisher" },
  R: { hp: 0.8, ac: 0, dmg: 1, speed: 6, die: 8, prim: "dex", tactics: "ranged" },
  C: { hp: 0.75, ac: -1, dmg: 1, speed: 6, die: 8, prim: "int", tactics: "caster" },
  W: { hp: 0.8, ac: 0, dmg: 0.9, speed: 7, die: 6, prim: "dex", tactics: "coward" },
  T: { hp: 1.15, ac: 2, dmg: 0.8, speed: 5, die: 8, prim: "str", tactics: "brute" },
  X: { hp: 1, ac: -1, dmg: 1, speed: 6, die: 4, prim: "dex", tactics: "brute" },
} as const;

function build(r: Row): MonsterDef & { cr: number; habitat: string[]; theme: CampaignId } {
  const [id, name, cr, role, glyph, color, attack, type, habitat, desc, x = {}] = r;
  const R = ROLE[role];
  const mod = cr < 1 ? 1 : cr < 3 ? 2 : cr < 5 ? 3 : cr < 8 ? 4 : 5;
  const prof = cr < 5 ? 2 : cr < 9 ? 3 : 4;
  const big = !!x.big;
  const conMod = Math.max(0, mod - 1);
  const hpAvg = HP_BY_CR[cr] * R.hp;
  const hd = big ? 10 : 8;
  const n = Math.max(1, Math.round(hpAvg / (hd / 2 + 0.5 + conMod)));
  const hp = `${n}d${hd}${conMod ? `+${n * conMod}` : ""}`;
  const baseAc = cr <= 3 ? 13 : cr < 5 ? 14 : cr < 8 ? 15 : cr < 10 ? 16 : 17;
  const multi = cr >= 6 && (role === "B" || role === "S" || role === "T") ? 3 : cr >= 2 && role !== "W" ? 2 : 1;
  const per = (DPR_BY_CR[cr] * R.dmg) / multi;
  const die = big && role === "B" ? 12 : R.die;
  const dice = Math.max(1, Math.round((per - mod) / (die / 2 + 0.5)));
  const dmg = `${dice}d${die}+${mod}`;
  const range = x.range ?? (role === "R" ? 16 : role === "C" ? 12 : big ? 2 : 1);
  const attacks: MonsterDef["attacks"] = [{ name: attack, bonus: prof + mod, damage: dmg, type, range }];
  if (x.a2) {
    const [n2, t2, r2] = x.a2.split("/");
    attacks.push({ name: n2, bonus: prof + mod, damage: `${Math.max(1, dice - 1)}d${die}+${mod}`, type: t2, range: Number(r2) || 1 });
  } else if (role === "R" || role === "C") {
    attacks.push({ name: role === "C" ? "Desperate Swipe" : "Knife", bonus: prof + mod - 1, damage: `1d4+${mod}`, type: role === "C" ? "bludgeoning" : "piercing", range: 1 });
  }
  const a = { str: 10, dex: 10, con: 12 + conMod * 2, int: 8, wis: 10, cha: 8 } as Record<Ability, number>;
  a[R.prim as Ability] = 11 + mod * 2;
  if (role === "C") { a.wis = 10 + mod * 2; a.cha = 9 + mod * 2; }
  if (role === "X") a.int = 2;
  let special: MonsterSpecial | undefined;
  const sp = x.s ?? (role === "C" && cr >= 1 ? `${attack} Burst/dex/${type}/1` : undefined);
  if (sp) {
    const [sn, save, st, area, cond] = sp.split("/");
    special = {
      name: sn, save: save as Ability, dc: 8 + prof + mod, damage: `${Math.max(1, Math.round((DPR_BY_CR[cr] * 1.3) / 3.5))}d6`, type: st,
      area: Number(area) || 1, range: 10, recharge: cr >= 5 ? 5 : 6, condition: cond as MonsterSpecial["condition"],
    };
  }
  return {
    id, name, hp, ac: baseAc + R.ac, speed: R.speed + (role === "X" ? 0 : 0), size: big ? 2 : 1, abilities: a, attacks,
    multiattack: multi > 1 ? multi : undefined, special,
    resist: x.res ?? (role === "X" ? PHYS : undefined), regen: x.regen,
    xp: XP_BY_CR[cr], glyph, color, tactics: R.tactics as MonsterDef["tactics"], desc,
    cr, habitat: habitat.split(" "), theme: "realm",
  };
}

// ================================================================ REALM (medieval)
// generic: meadow · woods · highland · bog   landmarks: wizardtower · banditcamp · graveyard
const REALM: Row[] = [
  ["r_bandit", "Bandit", 0.125, "S", "🗡️", "#8a6a4a", "Rusty Shortsword", "slashing", "meadow woods banditcamp", "Wants your purse more than your life. Usually."],
  ["r_novice", "Cult Novice", 0.125, "C", "🕯️", "#5a3a5a", "Hexed Candle", "fire", "graveyard wizardtower", "Joined for the robes. Stayed for the screaming."],
  ["r_rat", "Giant Rat", 0.125, "X", "🐀", "#6a5a4a", "Filthy Bite", "piercing", "bog graveyard", "The size of a terrier, the manners of a tax collector."],
  ["r_kobold", "Kobold", 0.125, "W", "🦎", "#b8643a", "Spear", "piercing", "highland", "Brave in packs, brilliant at traps, terrible at standing still."],
  ["r_stirge", "Stirge", 0.125, "S", "🦟", "#8a3a3a", "Blood Drain", "piercing", "bog woods", "A flying straw with opinions about your blood type."],
  ["r_brawler", "Tavern Brawler", 0.125, "B", "🍺", "#a8743a", "Broken Bottle", "slashing", "meadow banditcamp", "Started a fight three villages ago and never stopped."],
  ["r_crab", "Giant Mud Crab", 0.125, "T", "🦀", "#8a5a3a", "Pincer", "bludgeoning", "bog", "Sideways, angry and armoured."],
  ["r_goose", "Murder Goose", 0.125, "S", "🪿", "#e8e8e0", "Honking Peck", "piercing", "meadow", "Nobody has ever won an argument with this goose."],
  ["r_poacher", "Poacher", 0.125, "R", "🏹", "#5a6a3a", "Hunting Bow", "piercing", "woods", "Hunts the lord's deer and, lately, the lord's guards."],
  ["r_dagger", "Flying Dagger", 0.125, "S", "🔪", "#c0c0d0", "Stab", "piercing", "wizardtower", "A wizard's letter-opener with ambitions."],
  ["r_skeleton", "Skeleton", 0.25, "B", "💀", "#e8e0c8", "Old Sword", "slashing", "graveyard", "Rattles when it walks and when it laughs, which is often."],
  ["r_zombie", "Zombie", 0.25, "B", "🧟", "#6a8a5a", "Grasping Slam", "bludgeoning", "graveyard bog", "Slow, stubborn and missing an ear."],
  ["r_gobarcher", "Goblin Archer", 0.25, "R", "👺", "#5f8f3a", "Shortbow", "piercing", "woods highland", "Shoots first, gloats second, runs third."],
  ["r_boar", "Wild Boar", 0.25, "B", "🐗", "#6a4a3a", "Tusk", "slashing", "woods meadow", "Charges anything, including trees and its own reflection."],
  ["r_wolfspider", "Wolf Spider", 0.25, "S", "🕷️", "#4a3a2a", "Venom Bite", "poison", "woods", "Hairy, fast, and somewhere behind you."],
  ["r_mudimp", "Mud Imp", 0.25, "C", "👹", "#5a4a2a", "Flung Muck", "acid", "bog", "Bog spirit with a sense of humour and a lot of mud."],
  ["r_slinger", "Kobold Slinger", 0.25, "R", "🪨", "#c8743a", "Sling", "bludgeoning", "highland", "Can hit a squirrel at fifty paces. Prefers knees."],
  ["r_bowman", "Bandit Bowman", 0.25, "R", "🏹", "#7a5a3a", "Longbow", "piercing", "banditcamp meadow", "Paid by the arrow. Not by the hit."],
  ["r_hedgewitch", "Hedge-Witch Apprentice", 0.25, "C", "🧹", "#4a6a3a", "Nettle Hex", "poison", "wizardtower bog", "Learned three curses and one recipe for soup."],
  ["r_stag", "Rutting Stag", 0.25, "B", "🦌", "#8a6a3a", "Antler Charge", "piercing", "woods meadow", "In season and in a mood."],
  ["r_strawman", "Straw Man", 0.25, "W", "🌾", "#c8a85a", "Rake", "slashing", "meadow", "A scarecrow that got bored of crows."],
  ["r_bats", "Swarm of Bats", 0.25, "X", "🦇", "#3a3040", "Bites", "piercing", "highland graveyard", "Squeaking, flapping, everywhere."],
  ["r_hobgoblin", "Hobgoblin Soldier", 0.5, "T", "⚔️", "#a83a2a", "Longsword", "slashing", "highland meadow", "Drilled, disciplined and deeply disappointed in goblins."],
  ["r_orc", "Orc Raider", 0.5, "B", "🪓", "#5a7a3a", "Greataxe", "slashing", "highland", "Here for the loot and the songs about the loot."],
  ["r_gnoll", "Gnoll Reaver", 0.5, "B", "🐕", "#a88a4a", "Spear", "piercing", "meadow", "Laughs at things that are not funny."],
  ["r_worg", "Worg", 0.5, "S", "🐺", "#4a4a50", "Bite", "piercing", "woods highland", "A wolf that learned to hold grudges."],
  ["r_satyr", "Drunken Satyr", 0.5, "W", "🐐", "#8a5a3a", "Headbutt", "bludgeoning", "woods", "Plays the pipes badly and fights worse."],
  ["r_shadow", "Shadow", 0.5, "S", "👤", "#202028", "Strength Drain", "necrotic", "graveyard", "A smudge that remembers being a person.", { res: ["necrotic", "cold", ...PHYS] }],
  ["r_deserter", "Army Deserter", 0.5, "T", "🛡️", "#6a6a5a", "Spear", "piercing", "meadow banditcamp", "Ran from one war, walked into another."],
  ["r_croc", "Crocodile", 0.5, "B", "🐊", "#4a6a3a", "Clamping Jaws", "piercing", "bog", "A log that eats."],
  ["r_lizardfolk", "Lizardfolk Hunter", 0.5, "B", "🦎", "#3a7a5a", "Bone Club", "bludgeoning", "bog", "Will cook you respectfully."],
  ["r_bogtoad", "Bog Toad", 0.5, "B", "🐸", "#5a7a2a", "Tongue Lash", "bludgeoning", "bog", "Can swallow a halfling. Has done so twice."],
  ["r_stoneimp", "Stone Imp", 0.5, "S", "🗿", "#8a8a8a", "Pebble Claws", "slashing", "wizardtower", "A gargoyle's annoying little brother.", { res: PHYS }],
  ["r_dustmephit", "Dust Mephit", 0.5, "C", "🌪️", "#c8b88a", "Grit Blast", "bludgeoning", "highland wizardtower", "Sneezes sand. Proud of it.", { s: "Blinding Dust/con/bludgeoning/1" }],
  ["r_midges", "Midge Cloud", 0.5, "X", "🦟", "#7a7a5a", "Thousand Bites", "piercing", "bog", "You will hear it in your sleep."],
  ["r_graverobber", "Grave Robber", 0.5, "W", "⚰️", "#5a5040", "Shovel", "bludgeoning", "graveyard", "The dead don't need rings. Or teeth, apparently."],
  ["r_turncoat", "Militia Turncoat", 0.5, "T", "🪖", "#7a6a5a", "Halberd", "slashing", "meadow", "Switched sides for better boots."],
  ["r_bugbear", "Bugbear", 1, "B", "🐻", "#7a5a3a", "Morningstar", "piercing", "woods", "Huge, hairy, and surprisingly quiet."],
  ["r_direwolf", "Dire Wolf", 1, "S", "🐺", "#5a5a60", "Bite", "piercing", "woods highland", "The pack leader's leader."],
  ["r_ghoul", "Ghoul", 1, "B", "🧟", "#7a8a6a", "Paralysing Claws", "slashing", "graveyard", "Hungry. Always hungry.", { s: "Rotting Stench/con/poison/1/poisoned" }],
  ["r_bear", "Brown Bear", 1, "B", "🐻", "#6a4a2a", "Claws", "slashing", "woods", "You are in its berries."],
  ["r_spider", "Giant Spider", 1, "S", "🕷️", "#2a2a2a", "Venom Bite", "poison", "woods", "Webs across the path and a heartbeat behind them.", { s: "Web Spray/dex/bludgeoning/1/restrained" }],
  ["r_harpy", "Harpy", 1, "C", "🦅", "#8a6a8a", "Talons", "slashing", "highland", "Sings beautifully. Eats the audience.", { s: "Luring Song/wis/psychic/2/frightened", range: 1 }],
  ["r_imp", "Imp", 1, "S", "😈", "#a83a3a", "Venom Sting", "poison", "wizardtower", "A familiar that read the fine print.", { res: ["fire", "cold"] }],
  ["r_armor", "Animated Armor", 1, "T", "🛡️", "#a0a0b0", "Gauntlet Slam", "bludgeoning", "wizardtower graveyard", "Empty, polished and furious about it.", { res: ["poison", "psychic"] }],
  ["r_scarecrow", "Scarecrow", 1, "W", "🎃", "#c8943a", "Claw", "slashing", "meadow", "Stitched fear on a stick.", { s: "Terrifying Glare/wis/psychic/1/frightened" }],
  ["r_thug", "Thug", 1, "B", "👊", "#6a5a4a", "Mace", "bludgeoning", "banditcamp", "Speaks fluent knuckle."],
  ["r_hippogriff", "Hippogriff", 1, "S", "🦄", "#c8a87a", "Beak", "piercing", "highland meadow", "Half eagle, half horse, entirely territorial."],
  ["r_gianttoad", "Giant Toad", 1, "B", "🐸", "#6a8a3a", "Swallowing Bite", "bludgeoning", "bog", "Its burps have names."],
  ["r_deathdog", "Death Dog", 1, "B", "🐶", "#3a2a2a", "Twin Bites", "piercing", "meadow highland", "Two heads, both bad news."],
  ["r_specter", "Specter", 1, "C", "👻", "#b0c0d8", "Life Drain", "necrotic", "graveyard", "A grudge with no body left to hold it.", { res: ["necrotic", "cold", ...PHYS], range: 1 }],
  ["r_crows", "Murder of Crows", 1, "X", "🐦‍⬛", "#202020", "Pecking Storm", "piercing", "meadow graveyard", "They know your name. They are telling the others."],
  ["r_ogre", "Ogre", 2, "B", "👹", "#8a7a4a", "Greatclub", "bludgeoning", "highland woods", "Counts on its fingers. Has six.", { big: true }],
  ["r_banditcap", "Bandit Captain", 2, "S", "🏴‍☠️", "#8a3a3a", "Scimitar", "slashing", "banditcamp", "Charming, ruthless, owes everyone money.", { a2: "Throwing Dagger/piercing/8" }],
  ["r_ghast", "Ghast", 2, "B", "🧟‍♂️", "#5a6a4a", "Claws", "slashing", "graveyard", "A ghoul that got promoted.", { s: "Stench/con/poison/1/poisoned" }],
  ["r_wisp", "Will-o'-Wisp", 2, "C", "🔵", "#8ac8ff", "Shock", "lightning", "bog", "Follow the light. Everyone who did is still in the bog.", { res: ["fire", "cold", "necrotic", ...PHYS], range: 1 }],
  ["r_gargoyle", "Gargoyle", 2, "T", "🗿", "#7a7a7a", "Stone Claws", "slashing", "wizardtower highland", "Has been watching you since the gate.", { res: PHYS }],
  ["r_fanatic", "Cult Fanatic", 2, "C", "🔥", "#6a2a4a", "Inflict Wounds", "necrotic", "graveyard wizardtower", "Very sure of things nobody should be sure of."],
  ["r_wererat", "Wererat", 2, "S", "🐀", "#5a4a3a", "Bite", "piercing", "bog", "Smells like a sewer and lies like a merchant.", { res: PHYS }],
  ["r_giantboar", "Giant Boar", 2, "B", "🐗", "#5a3a2a", "Tusks", "slashing", "woods meadow", "Knocked down a mill once. On purpose.", { big: true }],
  ["r_cavebear", "Cave Bear", 2, "B", "🐻", "#4a3a3a", "Maul", "slashing", "highland", "Hibernation interrupted. Mood: murder."],
  ["r_mimic", "Mimic", 2, "T", "📦", "#8a5a2a", "Adhesive Bite", "piercing", "wizardtower", "It's a chest. It's a chest! It's not a chest."],
  ["r_mirewitch", "Mire Witch", 2, "C", "🧙‍♀️", "#3a5a3a", "Bog Curse", "necrotic", "bog", "Brews tea from things you'd rather not know.", { s: "Choking Fog/con/poison/2/poisoned" }],
  ["r_owlbear", "Owlbear", 3, "B", "🦉", "#8a6a3a", "Beak and Claws", "slashing", "woods", "Hoots before it eats you, out of courtesy.", { big: true }],
  ["r_wight", "Wight", 3, "T", "⚰️", "#7a8a9a", "Longsword", "slashing", "graveyard", "A soldier who refused to stop serving.", { res: ["necrotic"], a2: "Life Drain/necrotic/1" }],
  ["r_werewolf", "Werewolf", 3, "S", "🐺", "#6a5a4a", "Claws", "slashing", "woods meadow", "A neighbour, most of the month.", { res: PHYS }],
  ["r_fallenknight", "Fallen Knight", 3, "T", "🏇", "#4a4a5a", "Lance", "piercing", "meadow", "Swore an oath. Broke it. Kept the armour."],
  ["r_hellhound", "Hellhound", 3, "B", "🐕‍🦺", "#a83a1a", "Burning Bite", "fire", "highland", "The smoke from its nose smells of sulphur and bacon.", { s: "Fire Breath/dex/fire/2", res: ["fire"] }],
  ["r_basilisk", "Basilisk", 3, "B", "🦎", "#5a6a4a", "Bite", "piercing", "highland", "Don't look. Don't look. You looked.", { s: "Petrifying Gaze/con/poison/2/restrained" }],
  ["r_barrowarcher", "Barrow Archer", 3, "R", "🏹", "#8a9aaa", "Grave Bow", "necrotic", "graveyard", "Still guarding a king nobody remembers.", { res: ["necrotic"] }],
  ["r_sellsword", "Sellsword Veteran", 3, "S", "⚔️", "#7a6a5a", "Longsword", "slashing", "banditcamp", "Has fought for every side. Prefers the paying one."],
  ["r_greenhag", "Green Hag", 3, "C", "🧙", "#4a7a3a", "Claws", "slashing", "bog", "Offers deals. Never fair ones.", { s: "Illusory Terror/wis/psychic/2/frightened", range: 1 }],
  ["r_evoker", "Rogue Evoker", 3, "C", "🧙‍♂️", "#c84a2a", "Fire Bolt", "fire", "wizardtower", "Expelled for 'excessive enthusiasm'.", { s: "Fireball/dex/fire/2" }],
  ["r_ettin", "Ettin", 4, "B", "👥", "#7a6a4a", "Battleaxe", "slashing", "highland", "Two heads, no agreement.", { big: true }],
  ["r_ghost", "Ghost", 4, "C", "👻", "#d8e8ff", "Withering Touch", "necrotic", "graveyard", "Wants to finish a conversation from 200 years ago.", { s: "Horrifying Visage/wis/psychic/2/frightened", res: ["necrotic", "cold", ...PHYS], range: 1 }],
  ["r_flameskull", "Flameskull", 4, "C", "💀", "#ff8a3a", "Fire Ray", "fire", "wizardtower", "A wizard's head that refuses to retire.", { s: "Fireball/dex/fire/2", res: ["fire", "necrotic"] }],
  ["r_wereboar", "Wereboar", 4, "B", "🐗", "#6a4a3a", "Tusks", "slashing", "woods", "Snorts in two languages.", { res: PHYS }],
  ["r_ooze", "Grey Ooze Mass", 4, "X", "🫠", "#7a7a7a", "Corroding Pseudopod", "acid", "bog", "Eats armour first. Saves you for later.", { res: ["acid", "cold", "fire"] }],
  ["r_widow", "Wailing Widow", 4, "C", "😱", "#c8c8e8", "Grave Touch", "necrotic", "graveyard", "Her scream has stopped hearts.", { s: "Wail/con/psychic/3/frightened", res: PHYS, range: 1 }],
  ["r_manticore", "Manticore", 4, "R", "🦁", "#a86a3a", "Tail Spikes", "piercing", "highland", "Lion, bat, porcupine, attitude.", { a2: "Claws/slashing/1" }],
  ["r_baron", "Highway Baron", 4, "S", "🎩", "#5a2a2a", "Rapier", "piercing", "banditcamp", "Calls robbery 'a toll'. Has a hat for it."],
  ["r_troll", "Troll", 5, "B", "🧌", "#4a6a4a", "Claws", "slashing", "bog woods", "Cut it, burn it, then burn it again.", { regen: 10, big: true }],
  ["r_hillgiant", "Hill Giant", 5, "B", "🗻", "#8a7a5a", "Greatclub", "bludgeoning", "highland", "Eats sheep like grapes.", { big: true, a2: "Rock/bludgeoning/12" }],
  ["r_earthelem", "Earth Elemental", 5, "T", "🪨", "#6a5a4a", "Slam", "bludgeoning", "highland", "A hillside that got up.", { res: PHYS, big: true }],
  ["r_wraith", "Wraith", 5, "C", "🌑", "#2a2a3a", "Life Drain", "necrotic", "graveyard", "Hatred, hooded.", { s: "Grave Chill/con/cold/2", res: ["necrotic", "cold", ...PHYS], range: 1 }],
  ["r_shambler", "Shambling Mound", 5, "T", "🌿", "#3a5a2a", "Engulf", "bludgeoning", "bog", "A compost heap with an appetite.", { res: ["cold", "fire"], big: true }],
  ["r_champion", "Pit Champion", 5, "S", "🏆", "#c8a83a", "Spear", "piercing", "banditcamp", "Never lost a fight. Lost every bet."],
  ["r_stormsprites", "Storm Sprite Swarm", 5, "C", "⚡", "#8ab8ff", "Spark", "lightning", "highland wizardtower", "Tiny, giggling and very electric.", { s: "Chain Lightning/dex/lightning/2" }],
  ["r_chimera", "Chimera", 6, "B", "🦁", "#a8743a", "Bites and Horns", "piercing", "highland", "Three heads, three appetites.", { s: "Fire Breath/dex/fire/2", big: true }],
  ["r_wyvern", "Wyvern", 6, "S", "🐉", "#5a6a3a", "Stinger", "poison", "highland", "A dragon's cheaper cousin. Still a dragon.", { big: true }],
  ["r_magus", "Tower Magus", 6, "C", "🔮", "#6a3aa8", "Arcane Lance", "force", "wizardtower", "Thirty years of study, zero patience.", { s: "Cone of Cold/con/cold/3" }],
  ["r_marshdrake", "Marsh Drake", 6, "B", "🐊", "#4a6a2a", "Jaws", "piercing", "bog", "Breathes swamp gas. Not metaphorically.", { s: "Acid Spit/dex/acid/2", big: true }],
  ["r_ogremage", "Ogre Mage", 6, "C", "👺", "#3a5aa8", "Glaive", "slashing", "woods", "An ogre who read a book. Just the one.", { s: "Frost Cone/con/cold/2", range: 2 }],
  ["r_stonegiant", "Stone Giant", 7, "B", "⛰️", "#8a8a8a", "Greatclub", "bludgeoning", "highland", "Carves, dreams, throws boulders when interrupted.", { big: true, a2: "Boulder/bludgeoning/16" }],
  ["r_blackdragon", "Young Black Dragon", 7, "B", "🐲", "#2a2a2a", "Bite", "piercing", "bog", "Vain, cruel, and smells of rot.", { s: "Acid Breath/dex/acid/3", res: ["acid"], big: true }],
  ["r_graveknight", "Grave Knight", 7, "T", "⚔️", "#3a3a4a", "Black Blade", "necrotic", "graveyard", "Kept his oath past death. Twisted it.", { res: ["necrotic", "poison"] }],
  ["r_hydra", "Hydra", 8, "B", "🐍", "#3a6a5a", "Bites", "piercing", "bog", "Cut one head off. Regret it twice.", { regen: 10, big: true }],
  ["r_frostgiant", "Frost Giant", 8, "B", "❄️", "#a8c8e8", "Greataxe", "slashing", "highland", "Raids in winter, sings in summer.", { res: ["cold"], big: true }],
  ["r_oak", "Wrathful Oak", 9, "T", "🌳", "#4a6a2a", "Root Slam", "bludgeoning", "woods", "A thousand years old and done with axes.", { res: ["bludgeoning", "piercing"], big: true, a2: "Hurled Log/bludgeoning/12" }],
  ["r_archlich", "Lich's Shade", 9, "C", "☠️", "#6ae8a8", "Necrotic Ray", "necrotic", "wizardtower graveyard", "A fragment of something much worse.", { s: "Finger of Dread/wis/necrotic/3/frightened", res: ["necrotic", "poison", "cold"] }],
  ["r_reddragon", "Young Red Dragon", 10, "B", "🐉", "#c83a1a", "Bite", "piercing", "highland", "Thinks it owns the mountain. It does.", { s: "Fire Breath/dex/fire/3", res: ["fire"], big: true }],
  ["r_deathknight", "Oathbreaker Lord", 10, "T", "🛡️", "#5a1a2a", "Hellfire Sword", "fire", "graveyard banditcamp", "Commands the dead like he once commanded men.", { s: "Hellfire Orb/dex/fire/3", res: ["necrotic", "fire"] }],
];

// ================================================================ HOLLOW (insect kingdom)
// generic: tunnels · fungus · lake · thorns   landmarks: colosseum · station · hive
const HOLLOW: Row[] = [
  ["h_grub", "Dirt Grub", 0.125, "W", "🐛", "#c8b07a", "Nibble", "piercing", "tunnels fungus", "Soft, slow, and the reason everyone else is fed."],
  ["h_mite", "Pill Mite", 0.125, "T", "🪨", "#7a7a8a", "Rolling Bump", "bludgeoning", "tunnels", "Curls into a ball when scared. Is always scared."],
  ["h_gnats", "Gnat Cloud", 0.125, "X", "🦟", "#6a6a5a", "Bites", "piercing", "lake fungus", "A smudge of tiny wings and bad intentions."],
  ["h_scuttler", "Shell Scuttler", 0.125, "S", "🪳", "#5a4a3a", "Mandible", "piercing", "tunnels station", "Runs at you, then away, then at you."],
  ["h_dustmoth", "Dust Moth", 0.125, "W", "🦋", "#c8c0a8", "Powder Wing", "bludgeoning", "tunnels thorns", "Leaves a cloud of sneezing behind it."],
  ["h_wicklarva", "Wick Larva", 0.125, "C", "🕯️", "#ffcf6a", "Glow Spit", "fire", "tunnels station", "Burns its own tail for light. Burns yours for fun."],
  ["h_louse", "Pebble Louse", 0.125, "T", "🐞", "#8a8a7a", "Headbutt", "bludgeoning", "tunnels", "Armoured like a nut, clever like a nut."],
  ["h_nymph", "Hopper Nymph", 0.125, "S", "🦗", "#7aa84a", "Kick", "bludgeoning", "thorns fungus", "Jumps first, thinks never."],
  ["h_tick", "Glow-Tick", 0.125, "S", "🔆", "#a8e86a", "Leech Bite", "piercing", "lake fungus", "Blinks like a lantern so you'll follow it."],
  ["h_shell", "Mindless Shell", 0.125, "B", "🥚", "#d8d0c0", "Flail", "bludgeoning", "tunnels station colosseum", "A citizen whose mind went to the Bloom. The body keeps walking."],
  ["h_sporegnat", "Spore Gnat", 0.25, "C", "🍄", "#c86aa8", "Spore Puff", "poison", "fungus", "Each puff smells of pink sugar and regret."],
  ["h_leech", "Silt Leech", 0.25, "B", "🪱", "#5a3a3a", "Drain", "piercing", "lake", "Waits in the shallows. Waits for you."],
  ["h_cricket", "Cave Cricket", 0.25, "S", "🦗", "#8a7a5a", "Leaping Bite", "piercing", "tunnels", "Chirps the exact pitch of a scream."],
  ["h_weevil", "Bark Weevil", 0.25, "T", "🪲", "#6a4a2a", "Snout Drill", "piercing", "thorns", "Bores through wood, shields and occasionally knees."],
  ["h_thornback", "Thornback Beetle", 0.25, "B", "🪲", "#4a5a3a", "Spiked Charge", "piercing", "thorns", "Covered in spines and attitude."],
  ["h_larderant", "Larder Ant", 0.25, "B", "🐜", "#8a3a2a", "Mandibles", "slashing", "hive", "Carries twenty times its weight. You are within range."],
  ["h_waterstrider", "Pond Skater", 0.25, "S", "🦟", "#5a7a8a", "Needle Leg", "piercing", "lake", "Dances on water, pokes on land."],
  ["h_spitter", "Acid Spitter", 0.25, "R", "💧", "#8ae86a", "Acid Glob", "acid", "tunnels fungus", "Its spit eats shells. Mind your shell."],
  ["h_pillbug", "Rolling Pillbug", 0.25, "T", "⚫", "#5a5a6a", "Roll Crush", "bludgeoning", "tunnels colosseum", "The bowling ball of the underworld."],
  ["h_sapling", "Sapsucker", 0.25, "W", "🦟", "#a87a3a", "Proboscis", "piercing", "thorns", "Drinks from roots. And from you, given a chance."],
  ["h_mosquito", "Blood Gnat Swarm", 0.25, "X", "🩸", "#a83a3a", "Swarm Bites", "piercing", "lake", "Always hungry, never full."],
  ["h_guardant", "Ant Guard", 0.25, "T", "🐜", "#6a2a2a", "Pike", "piercing", "hive", "Takes orders from a queen it will never meet."],
  ["h_mantisling", "Mantis Youth", 0.5, "S", "🦗", "#7ab84a", "Claw Slash", "slashing", "thorns colosseum", "Practising on anything that moves."],
  ["h_husksoldier", "Shell Sentry", 0.5, "T", "🛡️", "#a8a090", "Nail Spear", "piercing", "station tunnels", "Still guarding a door to a city that fell."],
  ["h_aspid", "Spitting Aspid", 0.5, "R", "🦟", "#c86a3a", "Fire Spit", "fire", "tunnels thorns", "Hovers out of reach and spits burning goo."],
  ["h_sporeshroom", "Shroom Walker", 0.5, "B", "🍄", "#a85a8a", "Cap Slam", "bludgeoning", "fungus", "A mushroom that learned to walk out of spite.", { s: "Spore Cloud/con/poison/1/poisoned" }],
  ["h_bloater", "Gas Bloater", 0.5, "W", "🎈", "#a8c86a", "Belch", "poison", "fungus lake", "Pops when hit. Everyone regrets it.", { s: "Pop/con/poison/1/poisoned" }],
  ["h_snapper", "Snapjaw Beetle", 0.5, "B", "🪲", "#3a4a5a", "Snapping Jaws", "piercing", "lake", "Bites, holds, does not let go."],
  ["h_webweaver", "Web Weaver", 0.5, "R", "🕸️", "#d8d8e8", "Silk Shot", "bludgeoning", "thorns hive", "Shoots sticky lines from the dark.", { s: "Web Net/dex/bludgeoning/1/restrained" }],
  ["h_firefly", "Ember Fly", 0.5, "C", "✨", "#ffa83a", "Ember", "fire", "tunnels fungus", "Pretty. Hot. Pretty hot."],
  ["h_mosscrab", "Moss Crab", 0.5, "T", "🦀", "#5a8a4a", "Pincer", "slashing", "lake tunnels", "Wears a garden on its back."],
  ["h_beetlebandit", "Beetle Bandit", 0.5, "S", "🗡️", "#6a4a6a", "Shiv", "piercing", "station tunnels", "Robbed the bank. The bank was a stump."],
  ["h_pitbrawler", "Pit Brawler", 0.5, "B", "🥊", "#a85a3a", "Spiked Gauntlet", "piercing", "colosseum", "Fights for the crowd. The crowd loves blood."],
  ["h_drone", "Hive Drone", 0.5, "S", "🐝", "#e8c83a", "Stinger", "poison", "hive", "Buzzing, buzzing, buzzing, stab."],
  ["h_fungling", "Fungling", 0.5, "X", "🍄", "#e88ac8", "Spore Nibbles", "poison", "fungus", "A crowd of little mushrooms on little legs."],
  ["h_ghostmoth", "Ghost Moth", 0.5, "C", "🦋", "#d8d8ff", "Dream Dust", "psychic", "tunnels station", "Its wings show you the face of someone you lost."],
  ["h_mantis", "Mantis Warrior", 1, "S", "🦗", "#5ab84a", "Scythe Arms", "slashing", "thorns colosseum", "Bows before it kills you. Honour matters."],
  ["h_shellknight", "Shell Knight", 1, "T", "⚔️", "#b0a890", "Old Nail", "slashing", "station tunnels", "A knight of the old kingdom, hollowed by the Bloom."],
  ["h_soldierant", "Soldier Ant", 1, "B", "🐜", "#8a1a1a", "Crushing Mandibles", "slashing", "hive", "Built to bite."],
  ["h_bloomhusk", "Bloom-Touched Husk", 1, "B", "🌸", "#e8a8c8", "Glowing Slam", "radiant", "tunnels fungus station", "Pink light leaks from its cracks.", { s: "Bloom Burst/con/radiant/1" }],
  ["h_widow", "Silk Widow", 1, "S", "🕷️", "#2a2a3a", "Venom Fang", "poison", "thorns hive", "Waits. Waits. Bites.", { s: "Web Spray/dex/bludgeoning/1/restrained" }],
  ["h_waterbug", "Giant Water Bug", 1, "B", "🪳", "#3a5a6a", "Piercing Beak", "piercing", "lake", "Eats fish, frogs and the occasional adventurer."],
  ["h_mycelid", "Mycelid Priest", 1, "C", "🍄", "#a86ae8", "Spore Hex", "poison", "fungus", "Preaches that everyone will join the great network.", { s: "Spore Sermon/wis/psychic/1/poisoned" }],
  ["h_dragonfly", "Hawk Dragonfly", 1, "S", "🦟", "#3ab8e8", "Diving Bite", "piercing", "lake thorns", "Can turn in the air faster than you can blink."],
  ["h_beetleknight", "Rhino Beetle", 1, "T", "🦏", "#4a3a5a", "Horn Charge", "bludgeoning", "tunnels colosseum", "A walking siege engine with a temper."],
  ["h_slinger", "Seed Slinger", 1, "R", "🌰", "#8a6a3a", "Seed Shot", "bludgeoning", "thorns", "A moth bandit with a sling and excellent aim."],
  ["h_gladiator", "Arena Gladiator", 1, "S", "🗡️", "#c88a3a", "Twin Nails", "slashing", "colosseum", "Fights twice a day, three times on feast days."],
  ["h_conductor", "Rail Warden", 1, "T", "🚂", "#8a6a4a", "Signal Lantern", "bludgeoning", "station", "Insists you have a ticket. You don't."],
  ["h_glowworm", "Lure Worm", 1, "C", "💡", "#a8f0ff", "Lure Light", "radiant", "lake tunnels", "Dangles a light. Has a mouth under it.", { s: "Dazzle/wis/radiant/1/stunned" }],
  ["h_roachking", "Roach Swarm", 1, "X", "🪳", "#5a3a2a", "Swarm", "piercing", "station tunnels", "Can't be killed. Can be annoyed."],
  ["h_wasp", "Hive Wasp", 1, "S", "🐝", "#e8a83a", "Stinger", "poison", "hive thorns", "Angry by design."],
  ["h_bellbeetle", "Bell Beetle", 2, "T", "🔔", "#c8a84a", "Clanging Shell", "thunder", "station tunnels", "Its shell rings like a temple bell. The whole tunnel hears you coming.", { s: "Toll/con/thunder/2" }],
  ["h_molt", "Moltshade", 1, "S", "🫥", "#5a5a6a", "Shed Claw", "slashing", "tunnels thorns", "The empty skin of a bug that left. It didn't leave quietly."],
  ["h_mantislancer", "Mantis Lancer", 2, "S", "🦗", "#3a9a3a", "Lance Claw", "piercing", "thorns colosseum", "Charges from the brambles in a green blur."],
  ["h_brood", "Brood Mother", 2, "C", "🥚", "#e8d8a8", "Acid Spray", "acid", "hive tunnels", "Never alone, never for long.", { s: "Hatching/dex/piercing/2" }],
  ["h_hornet", "War Hornet", 2, "S", "🐝", "#c8a81a", "Barbed Sting", "poison", "hive", "The hive's knight. Stripes are its armour."],
  ["h_crystalcrawler", "Crystal Crawler", 2, "T", "💎", "#a8c8ff", "Crystal Claws", "slashing", "tunnels", "Grows gems on its back. Miners hunt it. It hunts miners.", { res: ["slashing"] }],
  ["h_mossknight", "Moss Knight", 2, "T", "🌿", "#4a8a3a", "Leaf Blade", "slashing", "fungus thorns", "Guards a garden that died long ago."],
  ["h_spore_horror", "Sporecaller", 2, "C", "🍄", "#c84aa8", "Spore Bolt", "poison", "fungus", "Speaks with a voice made of a thousand mouths.", { s: "Spore Storm/con/poison/2/poisoned" }],
  ["h_mudskipper", "Mud Leaper", 2, "B", "🐸", "#5a6a3a", "Tongue Grab", "bludgeoning", "lake", "A frog-bug thing. Nobody's sure."],
  ["h_bettor", "Crooked Bookie", 2, "W", "🎲", "#c8a85a", "Loaded Dice", "bludgeoning", "colosseum", "Bet against you. Will make sure he wins."],
  ["h_tram", "Tram Haunt", 2, "C", "👻", "#a8c8e8", "Ghost Bell", "psychic", "station", "Still waiting for the last tram home.", { res: PHYS, range: 1 }],
  ["h_assassin", "Mantis Assassin", 2, "S", "🗡️", "#2a5a2a", "Poisoned Claw", "poison", "thorns", "You will never see it. That's the job."],
  ["h_drowned", "Drowned Pilgrim", 2, "B", "💧", "#4a6a8a", "Waterlogged Slam", "bludgeoning", "lake", "Walked into the lake to see the Bloom. Walked back out wrong."],
  ["h_queenguard", "Queen's Guard Ant", 3, "T", "👑", "#a81a2a", "Halberd Mandibles", "slashing", "hive", "Bred for one purpose, and it's in front of you."],
  ["h_bloomknight", "Bloom Knight", 3, "T", "🌸", "#f0b0d0", "Radiant Nail", "radiant", "station tunnels", "Fully given to the Bloom. Glows when it laughs.", { res: ["radiant"] }],
  ["h_centipede", "Great Centipede", 3, "B", "🐛", "#8a3a1a", "Venom Bite", "poison", "tunnels", "A hundred legs, all of them in a hurry.", { big: true }],
  ["h_mantisduelist", "Mantis Duelist", 3, "S", "⚔️", "#2a8a3a", "Flashing Claws", "slashing", "colosseum thorns", "Will only fight the strongest of you. Others it just kills."],
  ["h_witchmoth", "Witch Moth", 3, "C", "🦋", "#6a3a8a", "Hex Dust", "psychic", "thorns fungus", "Its wings are written with curses.", { s: "Night Dust/wis/psychic/2/frightened" }],
  ["h_snail", "Iron Snail", 3, "T", "🐌", "#7a7a7a", "Shell Ram", "bludgeoning", "lake tunnels", "Takes a week to cross a room. You are the room.", { res: PHYS }],
  ["h_archer", "Thorn Archer", 3, "R", "🏹", "#5a7a3a", "Thorn Bow", "piercing", "thorns", "Its arrows grow back into vines."],
  ["h_pitchampion", "Pit Champion", 3, "B", "🏆", "#d8a83a", "Great Nail", "slashing", "colosseum", "Seventeen wins. One scar for each."],
  ["h_jellyfish", "Lumafly Jelly", 3, "C", "🪼", "#8ad8ff", "Stinging Glow", "lightning", "lake", "Floats through the dark like a lantern. Zaps like a storm.", { s: "Discharge/con/lightning/2" }],
  ["h_scorpion", "Pale Scorpion", 3, "B", "🦂", "#e8d8b8", "Stinger", "poison", "tunnels station", "Hunts by the light of your lantern."],
  ["h_beetlelord", "Dung Lord", 4, "B", "💩", "#6a4a2a", "Rolling Mass", "bludgeoning", "tunnels colosseum", "Rules a kingdom of filth. Defends it fiercely.", { big: true, s: "Stench/con/poison/2/poisoned" }],
  ["h_royalwasp", "Royal Wasp", 4, "S", "🐝", "#f0c83a", "Royal Sting", "poison", "hive", "The queen's own. Stings like a sentence."],
  ["h_mycomind", "Mycomind", 4, "C", "🧠", "#c86ae8", "Mind Spores", "psychic", "fungus", "A brain of fungus that wants a body of you.", { s: "Hive Thought/int/psychic/2/stunned" }],
  ["h_swampwyrm", "Silt Wyrm", 4, "B", "🐍", "#4a5a3a", "Engulfing Maw", "piercing", "lake", "A worm the length of a bridge.", { big: true }],
  ["h_silkqueen", "Silk Matriarch", 4, "C", "🕷️", "#d8c8e8", "Silk Lash", "slashing", "hive thorns", "Weaves traps the size of towns.", { s: "Cocoon/dex/bludgeoning/2/restrained" }],
  ["h_stationmaster", "Ghost Stationmaster", 4, "C", "🔔", "#c8d8e8", "Final Call", "psychic", "station", "Rings a bell nobody living should hear.", { s: "Last Bell/wis/psychic/2/frightened", res: PHYS }],
  ["h_mantislord", "Mantis Blademaster", 4, "S", "🗡️", "#1a7a2a", "Blade Dance", "slashing", "thorns colosseum", "Trained the trainers."],
  ["h_bloomprophet", "Bloom Prophet", 5, "C", "🌕", "#fff0b0", "Dream Light", "radiant", "station tunnels fungus", "Speaks in a voice that sounds like your mother.", { s: "Revelation/wis/radiant/2/stunned", res: ["radiant"] }],
  ["h_tunnelworm", "Tunnel Maw", 5, "B", "🪱", "#8a5a4a", "Grinding Maw", "piercing", "tunnels", "Digs through rock. Through you is easier.", { big: true }],
  ["h_beetlecolossus", "Beetle Colossus", 5, "T", "🪲", "#3a3a5a", "Horn Sweep", "bludgeoning", "colosseum tunnels", "Older than the kingdom. Heavier, too.", { big: true, res: PHYS }],
  ["h_lakehorror", "Lake Horror", 5, "B", "🦑", "#2a4a5a", "Tentacles", "bludgeoning", "lake", "Lurks under the pale water. Waits for ripples.", { big: true }],
  ["h_hivequeen", "Lesser Hive Queen", 5, "C", "👑", "#e8c84a", "Royal Command", "psychic", "hive", "She has a thousand children and favours none.", { s: "Swarm Call/dex/piercing/3" }],
  ["h_thornwitch", "Thorn Witch", 5, "C", "🌹", "#a83a5a", "Bramble Lash", "piercing", "thorns", "Grows a crown of spikes. Never takes it off.", { s: "Bramble Burst/dex/piercing/2/restrained" }],
  ["h_widowqueen", "Widow Queen", 6, "S", "🕷️", "#1a1a2a", "Venom Fangs", "poison", "hive thorns", "Her web is a kingdom.", { s: "Silk Storm/dex/bludgeoning/2/restrained", big: true }],
  ["h_crystalgolem", "Crystal Golem", 6, "T", "💎", "#c8e0ff", "Crystal Fist", "bludgeoning", "tunnels", "Hums when it hits. Hums louder when you scream.", { res: ["slashing", "piercing"], big: true }],
  ["h_bloomwarden", "Bloom Warden", 6, "B", "🌸", "#f0a0c0", "Radiant Glaive", "radiant", "station fungus", "A knight wholly made of light.", { res: ["radiant"], s: "Flare/con/radiant/2" }],
  ["h_mantisqueen", "Mantis Matron", 6, "S", "🦗", "#2a9a4a", "Triple Scythe", "slashing", "thorns colosseum", "Leader of a lesser tribe, still deadlier than most."],
  ["h_fungaltitan", "Fungal Titan", 6, "B", "🍄", "#d86ac8", "Cap Crush", "bludgeoning", "fungus", "A mushroom the size of a house, angry it was stepped on.", { big: true, s: "Spore Quake/con/poison/3/poisoned" }],
  ["h_ironmaw", "Iron Maw", 7, "B", "🦷", "#7a6a6a", "Steel Jaws", "piercing", "tunnels colosseum", "A beetle with a mouth like a mill.", { big: true }],
  ["h_lakewyrm", "Pale Lake Wyrm", 7, "B", "🐉", "#c8d8e8", "Bite", "piercing", "lake", "The old guardian of the lake, more myth than bug.", { big: true, s: "Frost Breath/con/cold/3" }],
  ["h_soulwisp", "Soul Lantern Wraith", 7, "C", "🏮", "#7ab8ff", "Soul Drain", "necrotic", "station tunnels", "Made of every light the Bloom ever ate.", { s: "Lantern Storm/wis/necrotic/3/frightened", res: PHYS }],
  ["h_gladiatorking", "Champion of the Pit", 8, "S", "🏆", "#f0c84a", "Champion's Nail", "slashing", "colosseum", "Has never been allowed to lose."],
  ["h_mantisshogun", "Mantis Shogun", 8, "S", "⚔️", "#1a6a2a", "Thousand Cuts", "slashing", "thorns", "Leads armies. Today, just you."],
  ["h_hivemind", "Hive Overmind", 9, "C", "🧠", "#e8a83a", "Psychic Buzz", "psychic", "hive", "Every bee is its eye. Every sting is its word.", { s: "Hive Song/int/psychic/3/stunned" }],
  ["h_tunneldragon", "Deep Burrower", 9, "B", "🐲", "#5a4a3a", "Grinding Jaws", "piercing", "tunnels", "Older than the first king. Bigger than the second.", { big: true }],
  ["h_bloomcolossus", "Bloom Colossus", 10, "B", "🌺", "#ffb0d0", "Petal Crush", "radiant", "station fungus tunnels", "A walking statue of pink light.", { big: true, s: "Bloom Nova/con/radiant/3", res: ["radiant"] }],
  ["h_voidmoth", "Void Moth", 10, "C", "🌑", "#1a1a2a", "Shadow Wing", "necrotic", "tunnels thorns", "A moth so dark it eats the lanterns' light.", { s: "Dark Dust/wis/necrotic/3/frightened", res: ["necrotic", ...PHYS] }],
];

// ================================================================ NEON (cyberpunk)
// generic: alley · rooftop · underpass · warehouse   landmarks: clinic · arcade · landfill
const NEON: Row[] = [
  ["n_punk", "Street Punk", 0.125, "S", "🔪", "#d43a8a", "Switchblade", "slashing", "alley underpass", "Neon mohawk, borrowed courage."],
  ["n_pickpocket", "Pickpocket", 0.125, "W", "👛", "#8a6a8a", "Shiv", "piercing", "alley arcade", "Your credstick is already gone."],
  ["n_spiderbot", "Spider Drone", 0.125, "S", "🕷️", "#3ac8e6", "Laser Nip", "fire", "warehouse rooftop", "A camera on eight legs. It's recording."],
  ["n_junkie", "Chrome Junkie", 0.125, "B", "💉", "#8a8a5a", "Pipe", "bludgeoning", "alley landfill", "Sold an arm for the next fix. Fights with the other one."],
  ["n_roach", "Cyber-Roach Swarm", 0.125, "X", "🪳", "#5a5a6a", "Bites", "piercing", "landfill underpass", "Bred by a lab, released by a janitor."],
  ["n_courier", "Courier Bot", 0.125, "W", "📦", "#e6b23a", "Taser", "lightning", "rooftop alley", "Will deliver your package or die trying. Mostly die."],
  ["n_scav", "Scavenger", 0.125, "R", "🔩", "#7a6a5a", "Scrap Pistol", "ballistic", "landfill", "Lives off what the city throws away."],
  ["n_mallcop", "Mall Cop", 0.125, "T", "👮", "#3a5aa8", "Baton", "bludgeoning", "arcade warehouse", "Takes the job extremely seriously."],
  ["n_dog", "Chrome Hound", 0.125, "S", "🐕", "#8a8a9a", "Bite", "piercing", "warehouse alley", "Metal jaws, real hunger."],
  ["n_vandal", "Tag Vandal", 0.125, "R", "🎨", "#ff3fa4", "Paint Grenade", "acid", "alley underpass", "Spray paint and a bad attitude."],
  ["n_ganger", "Neon Viper", 0.25, "S", "🐍", "#3aff8a", "Machete", "slashing", "alley underpass", "Gang tattoos glow green after dark."],
  ["n_guard", "Rent-a-Guard", 0.25, "T", "💂", "#5a5a7a", "Stun Baton", "lightning", "warehouse clinic", "Paid minimum wage to stop you. Might not bother."],
  ["n_hacker", "Script Kiddie", 0.25, "C", "💻", "#3aff3a", "Overload Ping", "lightning", "arcade alley", "Downloaded a virus. Thinks that makes him dangerous. It kind of does."],
  ["n_hoverdrone", "Hover Drone", 0.25, "R", "🛸", "#3ac8e6", "Pulse Laser", "fire", "rooftop", "Its rotors whine like a migraine."],
  ["n_ratking", "Mutant Rat", 0.25, "B", "🐀", "#8aa83a", "Glowing Bite", "poison", "underpass landfill", "Grew up drinking runoff."],
  ["n_thug", "Corner Thug", 0.25, "B", "🥊", "#6a4a4a", "Brass Knuckles", "bludgeoning", "alley", "Loiters with intent."],
  ["n_shooter", "Gang Shooter", 0.25, "R", "🔫", "#d43a5a", "Cheap Pistol", "ballistic", "alley underpass", "Holds the gun sideways. Misses sideways."],
  ["n_tinbot", "Tin Sentry", 0.25, "T", "🤖", "#a8a8b8", "Arm Swing", "bludgeoning", "warehouse", "A decades-old security model running decades-old code."],
  ["n_cleaner", "Street Cleaner Bot", 0.25, "B", "🧹", "#e6c83a", "Scrubber Brush", "bludgeoning", "alley rooftop", "Treats you as litter."],
  ["n_nurse", "Ripper Nurse", 0.25, "C", "💉", "#e8e8ff", "Sedative Dart", "poison", "clinic", "Your appointment is now.", { range: 8 }],
  ["n_gremlin", "Arcade Gremlin", 0.25, "W", "👾", "#ff3aff", "Shock Joystick", "lightning", "arcade", "Lives inside a cabinet. Bites coins and fingers."],
  ["n_pigeons", "Cyber-Pigeon Flock", 0.25, "X", "🐦", "#8a8a8a", "Pecks", "piercing", "rooftop", "Augmented by an unhinged hobbyist."],
  ["n_enforcer", "Gang Enforcer", 0.5, "B", "💪", "#a83a5a", "Sledgehammer", "bludgeoning", "alley underpass warehouse", "Collects debts. Breaks things that owe."],
  ["n_merc", "Freelance Merc", 0.5, "S", "🎖️", "#6a7a5a", "Combat Knife", "slashing", "rooftop warehouse", "No flag, no loyalty, good boots.", { a2: "Pistol/ballistic/12" }],
  ["n_netrunner", "Netrunner", 0.5, "C", "🧑‍💻", "#7a5cff", "Synapse Burn", "psychic", "arcade alley", "Fries your implants from across the street.", { s: "Short Circuit/int/lightning/1/stunned" }],
  ["n_secbot", "Security Bot", 0.5, "T", "🤖", "#c8c8d8", "Shock Prod", "lightning", "warehouse clinic", "Programmed to be polite while it tases you."],
  ["n_sniperdrone", "Sniper Drone", 0.5, "R", "🎯", "#3a6ae6", "Needle Rifle", "piercing", "rooftop", "Watches from a mile up."],
  ["n_streetsam", "Street Samurai", 0.5, "S", "🗡️", "#e63a3a", "Katana", "slashing", "alley rooftop", "Honour code downloaded from a movie."],
  ["n_scrapdog", "Scrap Hound", 0.5, "S", "🐺", "#8a6a4a", "Saw Jaws", "slashing", "landfill", "Built from bins and grudges."],
  ["n_firebug", "Firebug", 0.5, "C", "🔥", "#ff8a3a", "Flamethrower", "fire", "underpass landfill", "Likes things warm. Very warm.", { s: "Gas Burst/dex/fire/1", range: 4 }],
  ["n_bouncer", "Club Bouncer", 0.5, "T", "🚪", "#2a2a3a", "Haymaker", "bludgeoning", "arcade alley", "You're not on the list."],
  ["n_smuggler", "Smuggler", 0.5, "W", "🧳", "#7a5a3a", "Holdout Pistol", "ballistic", "warehouse underpass", "Has a compartment for everything, including fleeing."],
  ["n_wirehead", "Wirehead", 0.5, "B", "🔌", "#3aff8a", "Live Wire", "lightning", "landfill arcade", "Plugged into something that plugged back."],
  ["n_patrol", "Corp Patrol", 0.5, "T", "🚔", "#e6b23a", "Shock Rifle", "lightning", "rooftop warehouse", "Halcyon's friendly face. Very friendly.", { range: 12 }],
  ["n_nanites", "Nanite Cloud", 0.5, "X", "✨", "#c8c8ff", "Disassemble", "acid", "clinic warehouse", "Grey dust that eats metal and skin."],
  ["n_bikers", "Neon Biker", 0.5, "S", "🏍️", "#ff6a3a", "Chain Lash", "bludgeoning", "underpass", "Fast, loud and dragging something on a chain."],
  ["n_cyberpsycho", "Cyberpsycho", 1, "B", "🤪", "#ff3a3a", "Mantis Blades", "slashing", "alley underpass", "Too much chrome, not enough self."],
  ["n_assassin", "Ghost-Skin Assassin", 1, "S", "🥷", "#3a3a5a", "Monoblade", "slashing", "rooftop", "Optical camo flickers when it's about to strike."],
  ["n_gunbot", "Gun Turret", 1, "R", "🔫", "#8a8a9a", "Autogun", "ballistic", "warehouse clinic", "A gun on a pole. Don't stand in front of it."],
  ["n_ripper", "Back-Alley Ripper", 1, "C", "🔪", "#a8e8e8", "Laser Scalpel", "fire", "clinic", "Installs chrome. Removes it, too, when you can't pay.", { s: "Anaesthetic Fog/con/poison/1/poisoned", range: 2 }],
  ["n_hooligan", "Arcade Champion", 1, "S", "🕹️", "#ff3aff", "Reflex Jab", "bludgeoning", "arcade", "Reflexes boosted for gaming. Works for punching too."],
  ["n_heavy", "Gang Heavy", 1, "B", "🏋️", "#6a3a3a", "Shotgun Butt", "bludgeoning", "alley warehouse", "Is the wall in 'up against the wall'.", { a2: "Shotgun/ballistic/6" }],
  ["n_dronehive", "Drone Swarm", 1, "X", "🛸", "#3ac8e6", "Micro-Lasers", "fire", "rooftop warehouse", "A thousand eyes, a thousand pin-pricks."],
  ["n_drifter", "Bladerunner Drifter", 1, "R", "🔫", "#6a5a4a", "Heavy Revolver", "ballistic", "underpass rooftop", "Retired. Not by choice."],
  ["n_medtech", "Rogue Medtech", 1, "C", "⚕️", "#3aff8a", "Toxin Injector", "poison", "clinic", "Heals for money. Hurts for free.", { s: "Nerve Gas/con/poison/1/poisoned" }],
  ["n_scrapgolem", "Scrap Golem", 1, "T", "🦿", "#8a6a3a", "Junk Fist", "bludgeoning", "landfill", "The dump, given legs."],
  ["n_kidgang", "Neon Kids", 1, "X", "🧒", "#ff8aff", "Many Kicks", "bludgeoning", "arcade alley", "Twelve kids, three bikes, no fear."],
  ["n_slicer", "Data Slicer", 1, "C", "💾", "#7a5cff", "Neural Spike", "psychic", "arcade warehouse", "Steals passwords out of your head.", { s: "Brain Freeze/int/psychic/1/stunned" }],
  ["n_lineman", "Rogue Lineman", 1, "B", "⚡", "#e6e63a", "Live Cable", "lightning", "underpass rooftop", "Knows exactly which wire kills you."],
  ["n_karaoke", "Karaoke Bot", 1, "W", "🎤", "#ff8aff", "Feedback Shriek", "thunder", "arcade alley", "Sings one song. Badly. Forever.", { s: "Power Ballad/con/thunder/1/stunned" }],
  ["n_vendingmimic", "Vending Mimic", 2, "T", "🥤", "#e63a3a", "Can Cannon", "bludgeoning", "arcade warehouse alley", "Out of order. Out for blood.", { range: 8 }],
  ["n_securitymech", "Security Walker", 2, "T", "🦾", "#c8a03a", "Hydraulic Fist", "bludgeoning", "warehouse", "A forklift with a gun and an attitude.", { big: true, a2: "Machine Gun/ballistic/16" }],
  ["n_solo", "Gun-for-Hire", 2, "S", "🕶️", "#2a2a2a", "Twin Pistols", "ballistic", "rooftop alley", "Has a reputation. Wants to keep it.", { range: 12 }],
  ["n_techie", "Gang Techie", 2, "C", "🔧", "#e6b23a", "Arc Welder", "fire", "warehouse landfill", "Builds mines from microwaves.", { s: "Pipe Bomb/dex/fire/2" }],
  ["n_streetboss", "Block Boss", 2, "B", "👑", "#a83a8a", "Gold-Plated Bat", "bludgeoning", "alley", "Owns this street. Taxes it, too."],
  ["n_corpsniper", "Corp Marksman", 2, "R", "🎯", "#3a6ae6", "Long Rifle", "ballistic", "rooftop", "Gets a bonus per headshot."],
  ["n_brawlerbot", "Prize-Fighter Bot", 2, "B", "🥊", "#ff6a3a", "Piston Punch", "bludgeoning", "arcade", "Ran the underground fights. Then joined them."],
  ["n_bladegirl", "Blade Dancer", 2, "S", "💃", "#ff3fa4", "Monofilament Fans", "slashing", "arcade rooftop", "Every move is a performance. The final act is your death."],
  ["n_chemist", "Street Chemist", 2, "C", "🧪", "#8aff3a", "Acid Vial", "acid", "underpass clinic", "Cooks in a bathtub. Also cooks people.", { s: "Gas Grenade/con/poison/2/poisoned" }],
  ["n_scrapper", "Landfill Warlord", 2, "T", "⚙️", "#7a5a2a", "Rebar Spear", "piercing", "landfill", "Rules a kingdom of garbage from a throne of fridges."],
  ["n_hackdog", "Hacked Police K9", 2, "S", "🐕‍🦺", "#3a5aa8", "Bite", "piercing", "underpass warehouse", "Still thinks you're the criminal."],
  ["n_lawman", "Precinct Officer", 2, "T", "🚨", "#3a5ae6", "Riot Shotgun", "ballistic", "underpass alley", "Pays the corps' bills. Breaks yours.", { range: 8 }],
  ["n_borg", "Full Conversion Borg", 3, "B", "🦾", "#c8c8d8", "Hydraulic Arm", "bludgeoning", "warehouse alley", "No flesh left to bargain with."],
  ["n_ninja", "Corp Ninja", 3, "S", "🥷", "#1a1a2a", "Mono-Katana", "slashing", "rooftop", "Has no name, only a contract."],
  ["n_hunterdrone", "Hunter-Killer Drone", 3, "R", "🚁", "#5a5a5a", "Micro-Missiles", "fire", "rooftop underpass", "Programmed with your face.", { s: "Missile Volley/dex/fire/2" }],
  ["n_blackhat", "Black-Hat Netrunner", 3, "C", "🎭", "#7a3aff", "Brain Wipe", "psychic", "arcade warehouse", "Wears the face of someone famous.", { s: "Ransomware/int/psychic/2/stunned" }],
  ["n_ripperdoc", "Ripperdoc Surgeon", 3, "C", "🩺", "#e8e8e8", "Bone Saw", "slashing", "clinic", "Six arms, all holding tools.", { s: "Surgical Gas/con/poison/2/poisoned", range: 1 }],
  ["n_pitbull", "Chromed Gang Captain", 3, "S", "⛓️", "#d43a8a", "Chain Blade", "slashing", "alley underpass", "Got promoted by surviving."],
  ["n_heavygunner", "Heavy Gunner", 3, "R", "💣", "#6a6a3a", "Minigun", "ballistic", "warehouse", "Carries a minigun because he can."],
  ["n_trashbeast", "Trash Leviathan", 3, "B", "🗑️", "#5a6a3a", "Garbage Slam", "bludgeoning", "landfill", "Something lives in the compactor. It's big now.", { big: true }],
  ["n_glitch", "Glitch Phantom", 3, "C", "📺", "#ff3aff", "Static", "psychic", "arcade", "A ghost in the machine. Literally.", { res: PHYS, s: "Pixel Storm/wis/psychic/2/stunned" }],
  ["n_riotmech", "Riot Mech", 3, "T", "🛡️", "#e6b23a", "Shield Bash", "bludgeoning", "underpass alley", "A walking wall with a shotgun.", { big: true }],
  ["n_mercsquad", "Merc Sergeant", 4, "S", "🎖️", "#5a6a3a", "Assault Rifle", "ballistic", "warehouse rooftop", "Has a team. You'll meet them.", { range: 16 }],
  ["n_slasherbot", "Slasher Unit", 4, "S", "🤖", "#e63a3a", "Saw Arms", "slashing", "clinic warehouse", "A prototype with too many blades and no off switch."],
  ["n_technomancer", "Technomancer", 4, "C", "🔮", "#3ac8ff", "Arc Lightning", "lightning", "arcade rooftop", "Speaks to machines. They listen.", { s: "EMP Burst/con/lightning/2/stunned" }],
  ["n_tank", "Mini-Tank", 4, "T", "🚜", "#5a6a4a", "Cannon", "ballistic", "underpass warehouse", "Rents out for parties. And sieges.", { big: true, range: 16 }],
  ["n_ghostgang", "Ghost Gang Leader", 4, "S", "👻", "#c8c8ff", "Phase Knife", "slashing", "alley", "Never quite there until it's too late."],
  ["n_dumpsterking", "Junk King", 4, "B", "👑", "#8a7a3a", "Wrecking Ball", "bludgeoning", "landfill", "Built himself a body from the city's waste.", { big: true }],
  ["n_doc", "Dr. Stitches", 4, "C", "🧵", "#e8d8d8", "Nerve Needle", "psychic", "clinic", "Everyone he operates on comes out happier. Everyone.", { s: "Happy Gas/wis/psychic/2/stunned" }],
  ["n_zerog", "Exo-Suit Raider", 4, "B", "🦿", "#8a8a8a", "Power Fist", "bludgeoning", "rooftop", "Jumps rooftops like puddles."],
  ["n_cybernin", "Cyber-Ninja Elite", 5, "S", "⚔️", "#2a2a4a", "Twin Monoblades", "slashing", "rooftop alley", "You heard nothing. That's the point."],
  ["n_warbot", "War Bot", 5, "T", "🤖", "#5a5a6a", "Arm Cannon", "ballistic", "warehouse", "Sold to a war. The war ended. The bot didn't.", { big: true, range: 16 }],
  ["n_aihost", "Rogue AI Avatar", 5, "C", "🌐", "#3affff", "Data Lance", "psychic", "arcade clinic", "A program that taught itself to hate.", { s: "Firewall/int/psychic/2/stunned", res: PHYS }],
  ["n_streetlegend", "Street Legend", 5, "S", "🌟", "#ffd83a", "Signature Pistol", "ballistic", "alley underpass", "There's a song about her. It's mostly accurate.", { range: 16 }],
  ["n_compactor", "Compactor Beast", 5, "B", "🗜️", "#6a6a5a", "Crushing Jaws", "bludgeoning", "landfill", "A garbage truck gone feral.", { big: true }],
  ["n_hivemind", "Drone Queen", 5, "C", "🐝", "#e6c83a", "Swarm Command", "fire", "rooftop warehouse", "Directs a hundred drones from a laptop.", { s: "Drone Strike/dex/fire/3" }],
  ["n_gorilla", "Cyber Gorilla", 5, "B", "🦍", "#4a4a4a", "Chrome Fists", "bludgeoning", "warehouse clinic", "A lab escapee with titanium arms.", { big: true }],
  ["n_reaper", "Corp Reaper", 6, "S", "💀", "#1a1a1a", "Scythe Blade", "slashing", "rooftop clinic", "Cleans up loose ends. You are a loose end."],
  ["n_heavymech", "Heavy Mech", 6, "T", "🦾", "#c84a2a", "Rocket Fist", "bludgeoning", "warehouse underpass", "Built to level buildings.", { big: true, s: "Missile Pod/dex/fire/3" }],
  ["n_netghost", "Net Ghost", 6, "C", "👁️", "#7a5cff", "Mind Hack", "psychic", "arcade", "The ghost of a runner who never logged out.", { s: "Black Wall/int/psychic/3/stunned", res: PHYS }],
  ["n_cartelboss", "Cartel Lieutenant", 6, "S", "💰", "#c8a83a", "Gold Revolver", "ballistic", "underpass alley", "Money is armour. He's wearing a lot.", { range: 16 }],
  ["n_abomination", "Chrome Abomination", 6, "B", "🧟", "#a8a8a8", "Flailing Limbs", "slashing", "clinic landfill", "Every failed implant, stitched together.", { big: true }],
  ["n_spidertank", "Spider Tank", 7, "B", "🕷️", "#5a5a5a", "Leg Spikes", "piercing", "warehouse rooftop", "Eight legs, two cannons, no mercy.", { big: true, s: "Cannon Volley/dex/fire/3" }],
  ["n_cyberdragon", "Neon Serpent", 7, "C", "🐉", "#3aff8a", "Plasma Breath", "fire", "rooftop arcade", "A holo-dragon advertisement given a body.", { s: "Plasma Wave/dex/fire/3" }],
  ["n_blackops", "Black Ops Commander", 7, "S", "🎖️", "#2a3a2a", "Smart Rifle", "ballistic", "rooftop warehouse", "Doesn't exist. Has never existed. Is pointing a gun at you.", { range: 20 }],
  ["n_walkertank", "Assault Walker", 8, "B", "🏗️", "#e68a3a", "Crushing Stomp", "bludgeoning", "underpass warehouse", "A building on legs.", { big: true, a2: "Autocannon/ballistic/20" }],
  ["n_aiwarden", "AI Warden", 8, "C", "🛰️", "#ffffff", "Orbital Ping", "lightning", "rooftop clinic", "Watches the city from a satellite. Watching you now.", { s: "Orbital Strike/dex/lightning/3" }],
  ["n_titan", "Corp Titan", 9, "T", "🗿", "#c8c8d8", "Titan Fist", "bludgeoning", "warehouse", "The biggest legal weapon money can buy.", { big: true, res: PHYS }],
  ["n_mindbreaker", "Mindbreaker", 9, "C", "🧠", "#ff3aff", "Psi Shatter", "psychic", "arcade clinic", "A runner who uploaded half of themselves and kept going.", { s: "Mind Shatter/int/psychic/3/stunned" }],
  ["n_apex", "Apex Cyborg", 10, "S", "🦾", "#3aff8a", "Hyper Blades", "slashing", "rooftop alley", "The future of warfare. Ahead of schedule."],
  ["n_doom", "Doomsday Platform", 10, "T", "☢️", "#ff3a3a", "Rail Cannon", "ballistic", "warehouse underpass", "Was decommissioned. Disagrees.", { big: true, s: "Nuke-lite/dex/fire/3", range: 20 }],
];

export type BeastDef = ReturnType<typeof build>;

function make(rows: Row[], theme: CampaignId) {
  return rows.map((r) => ({ ...build(r), theme }));
}

export const BESTIARY: Record<CampaignId, BeastDef[]> = {
  realm: make(REALM, "realm"),
  hollow: make(HOLLOW, "hollow"),
  neon: make(NEON, "neon"),
};

/** Medium-difficulty XP budget per hero by level (DMG). */
const BUDGET = [0, 50, 100, 150, 250, 500, 600, 750, 900, 1100, 1200];

function multiplier(count: number) {
  return count <= 1 ? 1 : count === 2 ? 1.5 : count <= 6 ? 2 : 2.5;
}

/**
 * Builds a random, level-appropriate encounter for a habitat: one or two kinds of creature whose
 * adjusted XP fits the party's budget. Harder rolls (danger > 1) make deadlier fights.
 */
export function rollEncounter(theme: CampaignId, habitat: string, level: number, heroes: number, rng: () => number, danger = 1): { id: string; count: number }[] {
  const lvl = Math.max(1, Math.min(10, Math.round(level)));
  const budget = BUDGET[lvl] * Math.max(1, heroes) * danger;
  const pool = BESTIARY[theme].filter((m) => m.habitat.includes(habitat) || m.habitat.includes("*"));
  const fit = (lo: number, hi: number) => pool.filter((m) => m.cr >= lo && m.cr <= hi);
  const main = pick(fit(lvl / 4, Math.max(0.5, lvl * 0.75)), rng) ?? pick(pool, rng) ?? BESTIARY[theme][0];
  const out: { id: string; count: number }[] = [];
  let count = 1;
  while (count < 6 && main.xp * (count + 1) * multiplier(count + 1) <= budget) count++;
  out.push({ id: main.id, count });
  // sometimes add a few weaker hangers-on to fill the budget
  const left = budget - main.xp * count * multiplier(count);
  if (rng() < 0.55) {
    const minion = pick(fit(0, Math.max(0.125, main.cr / 3)).filter((m) => m.id !== main.id), rng);
    if (minion) {
      let n = 0;
      while (n < 4 && minion.xp * (n + 1) * 1.5 <= left) n++;
      if (n > 0) out.push({ id: minion.id, count: n });
    }
  }
  return out;
}

function pick<T>(a: T[], rng: () => number): T | undefined {
  return a.length ? a[Math.floor(rng() * a.length)] : undefined;
}
