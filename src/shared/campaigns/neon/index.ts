import type { CampaignDef } from "../types";
import { scenesA } from "./actsA";
import { scenesB } from "./actsB";

export const neon: CampaignDef = {
  id: "neon",
  name: "Static Saints",
  tagline: "Rain, chrome, debt — and a heist on the most secure mind in Neo-Calder.",
  color: "#ff3fa4",
  levels: "1-10",
  pitch:
    "Neo-Calder never sleeps; it just flickers. Halcyon Dynamics owns the water, the air and the dead — including Saint Lucía, the street's beloved patron, whose uploaded mind sits in Vault 9. A noodle-stall fixer wants her out. Getting there means gangs, drains, cyberspace, docks and forty floors of corporate security — and every step has a price.",
  tone:
    "Neon-noir cyberpunk with savage corporate satire: ads everywhere, terms and conditions on everything, a leased-lungs economy. Street people are warm, funny and dangerous; corporations are cold and polite. Violence is quick and ugly; debt is forever. Track loyalty and betrayal — everyone remembers.",
  start: "market",
  acts: [
    { title: "Act I — Street Level (levels 1-3)", scenes: ["market", "noodlebar", "chopshop", "saintsden"] },
    { title: "Act II — Under the Skin (levels 3-6)", scenes: ["drains", "datahaven", "thenet", "docks"] },
    { title: "Act III — Corporate Ladder (levels 6-8)", scenes: ["lobby", "labs", "executive"] },
    { title: "Act IV — Ghost in the Saint (levels 8-10)", scenes: ["vault", "core"] },
  ],
  flagGuide: {
    iriDead: "The party killed Mama Iri; her family hunts them.",
    cabbieFriend: "The party returned DOLLY the car; she helps at the docks.",
    stoleCar: "The party kept the stolen car; the Saints want revenge.",
    razorAlly: "Razor Ruiz and the Chrome Saints are allies.",
    razorDead: "Razor Ruiz is dead.",
    owesZero: "The party owes Zero a favour.",
    zeroBetrayed: "The party betrayed Zero; Zero sabotages the vault.",
    schematics: "The party stole the dock schematics.",
    unit7Friend: "Receptionist Unit 7 is an ally inside Halcyon.",
    subjectsFreed: "The party freed the R&D test subjects; they return in the finale.",
    lazarusData: "The party has Project LAZARUS data to extract Lucía safely.",
    valeDeal: "The party took Mr. Vale's deal and betrayed Mama Iri.",
    heat: "How much attention the party has drawn (a counter).",
  },
  relics: [
    { id: "ladle", name: "Mama Iri's Ladle", kind: "weapon", attackBonus: 1, extraDamage: { dice: "1d4", type: "fire" }, relic: true, desc: "A titanium ladle that's been in three gang wars. +1, +1d4 fire (soup is very hot)." },
    { id: "mantisblades", name: "Razor's Mantis Blades", kind: "weapon", attackBonus: 1, extraDamage: { dice: "1d6", type: "slashing" }, relic: true, desc: "Forearm blades that snap out with a sound you feel in your teeth. +1, +1d6 slashing." },
    { id: "monowire", name: "Vale's Monowire", kind: "weapon", attackBonus: 2, extraDamage: { dice: "1d8", type: "slashing" }, relic: true, desc: "A filament one molecule wide. +2, +1d8 slashing. Keep your fingers. Count them often." },
    { id: "halo", name: "Saint's Halo Implant", kind: "gear", saveBonus: 2, acBonus: 1, relic: true, desc: "A ring of light behind the head. +1 AC, +2 saves. People keep asking for blessings." },
  ],
  pregens: [
    { name: "Vex Kuroda", cls: "fighter", ancestry: "orc", backstory: "Ex-corporate soldier with a chrome arm and a severance package that tried to kill her." },
    { name: "Juno 'Nine Lives' Park", cls: "rogue", ancestry: "halfling", backstory: "Mama Iri's favourite liar. Currently on life number six." },
    { name: "Glitch", cls: "wizard", ancestry: "elf", backstory: "Netrunner who's been inside Halcyon's net once and left a piece of themselves behind." },
    { name: "Doc Ama Sato", cls: "cleric", ancestry: "human", backstory: "Back-alley medtech. Has stitched up half the Saints and billed none of them." },
    { name: "Ghost-7", cls: "ranger", ancestry: "gnome", backstory: "Rooftop sniper. Never misses twice. Has missed once. Doesn't talk about it." },
    { name: "Brick", cls: "barbarian", ancestry: "dwarf", backstory: "Too much chrome, not enough chill. Cries at romcoms." },
  ],
  scenes: { ...scenesA, ...scenesB },
};
