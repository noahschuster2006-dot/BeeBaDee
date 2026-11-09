import type { CampaignDef } from "../types";
import { scenesA } from "./actsA";
import { scenesB } from "./actsB";

export const realm: CampaignDef = {
  id: "realm",
  name: "The Gravecaller of Thornwick",
  tagline: "Mud, plague, broken bells — and the dead who won't stay buried.",
  color: "#c9a14a",
  levels: "1-10",
  pitch:
    "Thornwick has stopped burying its dead, because the dead keep leaving. What starts as a reeve's bounty becomes a hunt across marsh, mountain and barrow for the three shards of a broken bell — before a king who wants the whole world silent finds them first.",
  tone:
    "Gritty low fantasy with gallows humour. Mud, rain, plague-pits and petty corruption sit next to genuine heroism. Death is real and permanent unless paid for. NPCs are funny because they are human: cowardly mayors, drunk witnesses, pragmatic bandits. Never make choices consequence-free; remember who the party hurt and who they helped.",
  start: "road",
  acts: [
    { title: "Act I — Dead Don't Stay Buried (levels 1-3)", scenes: ["road", "village", "den", "crypt", "ossuary"] },
    { title: "Act II — The Greywater Rot (levels 3-6)", scenes: ["causeway", "stilthaven", "hut", "ironjaw"] },
    { title: "Act III — Bells in the High Places (levels 6-8)", scenes: ["pass", "abbey"] },
    { title: "Act IV — The Hollow Crown (levels 8-10)", scenes: ["roost", "barrow", "throne"] },
  ],
  flagGuide: {
    hollisSaved: "The merchant Hollis survived the road and is grateful.",
    reeveDead: "The party killed Reeve Aldous; Thornwick hates them, Sister Wren refuses them.",
    cubsSpared: "The party spared the wolf cubs; grown wolves help them later.",
    cubsKilled: "The party killed the cubs for pelts.",
    veskAlly: "Vesk was redeemed and will help at the barrow.",
    veskDead: "Vesk was killed in the ossuary.",
    mayorExposed: "Stilthaven's mayor was exposed for paying bandits.",
    childrenSaved: "The hag's captive children were freed.",
    joinedMara: "The party allied with Captain Mara of Ironjaw.",
    gorboFriend: "Gorbo the hill giant likes the party.",
    kingAlerted: "The Hollow King knows the party is coming — the finale is harder.",
    dragonAlly: "Verdigris the dragon fights for the party.",
    crimes: "Number of crimes the party has been seen committing (a counter).",
    bellShards: "Number of bell shards recovered (a counter).",
  },
  relics: [
    { id: "bellringer", name: "Bellringer", kind: "weapon", attackBonus: 1, extraDamage: { dice: "1d6", type: "radiant" }, relic: true, desc: "The chapel bell's clapper on an oak haft. +1, deals +1d6 radiant on every hit. Goes 'dong'." },
    { id: "locket", name: "Mira's Locket", kind: "gear", saveBonus: 1, acBonus: 1, relic: true, desc: "A drowned girl's locket. +1 AC and saves. Sometimes, faintly, it hums a lullaby." },
    { id: "nettlecloak", name: "Nettle Cloak", kind: "gear", acBonus: 1, saveBonus: 2, relic: true, desc: "Woven from marsh-nettle and spite. +1 AC, +2 saves. Itches." },
    { id: "ironjawgrin", name: "Ironjaw's Grin", kind: "weapon", attackBonus: 2, extraDamage: { dice: "1d6", type: "slashing" }, relic: true, desc: "Mara's skull-hilted sabre. +2, +1d6 slashing. It grins when it's hungry." },
    { id: "dragonmantle", name: "Verdigris Mantle", kind: "armor", acBonus: 2, saveBonus: 1, relic: true, desc: "Scales of a young green dragon. +2 AC, +1 saves. Smells faintly of chlorine and vanity." },
  ],
  pregens: [
    { name: "Sir Aldric Vane", cls: "fighter", ancestry: "human", backstory: "A disgraced knight who lost a duel, his lands and his favourite horse, in that order." },
    { name: "Wren Quickfingers", cls: "rogue", ancestry: "halfling", backstory: "Owes money to half of Thornwick and an apology to the other half." },
    { name: "Ilyra Moonquill", cls: "wizard", ancestry: "elf", backstory: "Vesk's former apprentice, here to find out how badly her teacher went wrong." },
    { name: "Brother Tomas", cls: "cleric", ancestry: "dwarf", backstory: "Thornwick's gravedigger-priest. Very upset about the empty graves. Professionally." },
    { name: "Fenna Ashwood", cls: "ranger", ancestry: "human", backstory: "Tracks the Blackfang wolves that killed her brother. Not sure she wants revenge or answers." },
    { name: "Grukka", cls: "barbarian", ancestry: "orc", backstory: "Wants her grandmother's bones back from whoever stole them. Grandmother would want this." },
  ],
  scenes: { ...scenesA, ...scenesB },
};
