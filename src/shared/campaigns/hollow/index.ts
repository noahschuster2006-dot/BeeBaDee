import type { CampaignDef } from "../types";
import { scenesA } from "./actsA";
import { scenesB } from "./actsB";

// An original insect-kingdom setting: a fallen subterranean city of bugs, lit by soul-lanterns
// and slowly eaten by a pale infection that offers endless, comfortable sleep.
export const hollow: CampaignDef = {
  id: "hollow",
  name: "Lanterns of the Sunken Hive",
  tagline: "A forgotten insect kingdom, a dying light, and a bloom that wants you to sleep.",
  color: "#9fb8ff",
  levels: "1-10",
  pitch:
    "Far beneath the surface lies Vesperhold, once a kingdom of a thousand bug-folk, now silent. Its soul-lanterns are going dark one by one, and the Pale Bloom spreads through the tunnels, turning the living into hollow husks. Someone has to carry a new flame all the way to the bottom of the world.",
  tone:
    "Melancholy, beautiful decay with absurd bug humour: bureaucratic beetles, snails who take a day to finish a sentence, polite spiders who eat guests. Death is everywhere and treated honestly; kindness is rare and matters. Choices leave scars — remember who the party saved and who they left behind. Never mention any existing video game.",
  start: "crossing",
  acts: [
    { title: "Act I — The Last Lantern (levels 1-3)", scenes: ["crossing", "lanternrest", "fungal", "gallery"] },
    { title: "Act II — The Weeping Deep (levels 3-6)", scenes: ["aqueducts", "silkhollow", "bridge"] },
    { title: "Act III — Crystal and Bone (levels 6-8)", scenes: ["crystal", "gardens", "knight"] },
    { title: "Act IV — Heart of the Bloom (levels 8-10)", scenes: ["heart", "root"] },
  ],
  flagGuide: {
    wickDead: "Old Wick was killed. Lanternrest mourns; he can't make the final sacrifice.",
    glimmerDead: "Sister Glimmer was killed; Lanternrest's great lantern is dying.",
    burnedSpores: "The party burned the Fungal Wastes (and Old Morel).",
    morelFriend: "Old Morel the mushroom hermit likes the party.",
    keshAlly: "Lady Kesh respects the party and fights beside them in the gardens.",
    keshDead: "The party killed Lady Kesh; mantids hunt them.",
    larderFreed: "The party freed Silkhollow's cocooned refugees (and killed the queen).",
    larderIgnored: "The party took the queen's deal; the refugees were eaten.",
    mothSaved: "The party saved the last Moth-Queen's egg (and lost the gardeners).",
    grubsSaved: "The party saved the gardener grubs (and lost the egg).",
    knightMercy: "The Pale Knight died as himself.",
    knightTaken: "The party took the Pale Knight's needle; he rises again in the finale.",
  },
  relics: [
    { id: "wicklantern", name: "Old Wick's Lantern-Charm", kind: "gear", saveBonus: 1, relic: true, desc: "A snail-shell charm with a tiny lantern inside. +1 to saves. Lights very, very slowly." },
    { id: "mothveil", name: "Moth-Silk Veil", kind: "gear", acBonus: 1, saveBonus: 2, relic: true, desc: "Woven from the wings of a dead moth-queen. +1 AC, +2 saves. Flutters when danger's near." },
    { id: "shellmawplate", name: "Shellmaw Carapace", kind: "armor", acBonus: 2, relic: true, desc: "Crab-shell plates, still a bit damp. +2 AC. Smells of low tide forever." },
    { id: "arachnesilk", name: "Silk of Arachne", kind: "weapon", attackBonus: 1, extraDamage: { dice: "1d6", type: "poison" }, relic: true, desc: "A whip-blade of queen's silk. +1, +1d6 poison. Cuts beautifully, as promised." },
    { id: "firstneedle", name: "Needle of the First Knight", kind: "weapon", attackBonus: 2, extraDamage: { dice: "1d8", type: "radiant" }, relic: true, desc: "The Pale Knight's moonlit nail. +2, +1d8 radiant. Heavier than it looks; lighter than what it cost." },
  ],
  pregens: [
    { name: "Pell of the Needle", cls: "fighter", ancestry: "human", backstory: "A pillbug knight sworn to the last lantern. Rolls into a ball when nervous, which is often." },
    { name: "Silk", cls: "rogue", ancestry: "halfling", backstory: "A mite thief who steals light itself and sells it back by the jar." },
    { name: "Aurelia Dustwing", cls: "wizard", ancestry: "elf", backstory: "A mothkin scholar of soul-script, irresistibly drawn to bright, dangerous things." },
    { name: "Brother Slowshell", cls: "cleric", ancestry: "gnome", backstory: "A snail priest who tends the lanterns. Arrives late to everything, including danger." },
    { name: "Thistle", cls: "ranger", ancestry: "orc", backstory: "A mantid hunter exiled from the Gallery for refusing to duel her own sister." },
    { name: "Gorm Hardcarapace", cls: "barbarian", ancestry: "dwarf", backstory: "A beetle brawler who fears nothing but silence, and moths. Mostly moths." },
  ],
  scenes: { ...scenesA, ...scenesB },
};
