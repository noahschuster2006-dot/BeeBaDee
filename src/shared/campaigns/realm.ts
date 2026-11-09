import type { CampaignDef } from "./types";

export const realm: CampaignDef = {
  id: "realm",
  name: "The Gravecaller of Thornwick",
  tagline: "Swords, sorcery and something stirring beneath the old chapel.",
  color: "#c9a14a",
  pitch:
    "The village of Thornwick has stopped burying its dead — because the dead keep leaving. The reeve has posted a bounty: find out what lies beneath the ruined chapel on the hill, and end it.",
  tone:
    "Classic high fantasy with a gothic edge. Warm hearths and cold crypts. Earnest heroes, wry villagers, a tragic villain. Describe sights, sounds and smells in two or three vivid sentences.",
  start: "road",
  pregens: [
    { name: "Sir Aldric Vane", cls: "fighter", ancestry: "human", backstory: "A disgraced knight seeking redemption." },
    { name: "Wren Quickfingers", cls: "rogue", ancestry: "halfling", backstory: "Owes money to half of Thornwick." },
    { name: "Ilyra Moonquill", cls: "wizard", ancestry: "elf", backstory: "Hunting her former mentor, Vesk." },
    { name: "Brother Tomas", cls: "cleric", ancestry: "dwarf", backstory: "Keeper of Thornwick's cemetery." },
    { name: "Fenna Ashwood", cls: "ranger", ancestry: "human", backstory: "Tracks the wolves that haunt the road." },
    { name: "Grukka", cls: "barbarian", ancestry: "orc", backstory: "Wants her grandmother's bones back." },
  ],
  scenes: {
    road: {
      id: "road",
      title: "The Thornwick Road",
      env: { preset: "forest", weather: "clear", time: "dusk" },
      map: [
        "TTTTTTTTTTTTTTTTTTTTTTTTTTTT",
        "T,,,,T,,,,,,,,T,,,,,,,,,T,,T",
        "T,,g,,,,,,T,,,,,,,,g,,,,,,,T",
        "T,T,,,,,,,,,,,,,,,,,,,,T,,,T",
        "T,,,,,,^^,,,,,,,,,,,,,,,,,,T",
        "T,,,,,,,,,,,,,,,,,,,,,,,,,,T",
        "TSS.......................,T",
        "TSS..................C....,T",
        "TSS.......................,T",
        "T,,,,,,,,,,,,,,,,,,,,,,,,.,T",
        "T,,T,,,,,b,,,,,T,,,,,,,,,.,T",
        "T,,,,,,,,,,,,,,,,,,,,T,,,.,T",
        "T,T,,,,,~~~,,,,,,,,,,,,,,.,T",
        "T,,,,,,~~~~~,,,,,T,,,,,,,E,T",
        "T,,,,,,,~~~,,,,,,,,,,,,,,,,T",
        "TTTTTTTTTTTTTTTTTTTTTTTTTTTT",
      ],
      marks: {
        S: { type: "start" },
        g: { type: "enemy", monster: "goblin", group: "ambush", dormant: true },
        b: { type: "enemy", monster: "goblin", group: "ambush", dormant: true, name: "Goblin Archer" },
        C: { type: "prop", kind: "cart", name: "Overturned Cart", interact: "cart" },
        E: { type: "prop", kind: "path", name: "Path to the Chapel", interact: "leave" },
      },
      intro:
        "The sun bleeds orange through the pines as you walk the Thornwick road. Ahead, a merchant's cart lies on its side, one wheel still turning. The birds have gone quiet.",
      objective: "Reach the ruined chapel on the hill (the path south-east).",
      gmNotes:
        "Goblins of the Rotfang tribe hide in the trees and will ambush the party when they near the cart. They were paid in silver by 'a pale man with a staff' (Vesk) to keep travellers away from the chapel. A captured goblin will spill this if intimidated (DC 12). The cart belonged to a cloth merchant, Hollis, who fled to the village.",
      triggers: [
        { id: "ambush", when: { type: "enter", rect: [10, 4, 22, 10] }, note: "Goblin ambush springs near the cart.", actions: [
          { do: "spawn", group: "ambush" },
          { do: "narrate", text: "Arrows hiss out of the treeline! Shrieking goblins burst from the undergrowth, rusty blades flashing." },
          { do: "combat" },
        ] },
        { id: "ambushdone", when: { type: "cleared", group: "ambush" }, actions: [
          { do: "narrate", text: "The last goblin falls. Among their things you find a pouch of fresh silver stamped with a chapel bell — odd pay for road thugs." },
          { do: "xp", amount: 150 },
          { do: "loot", gold: 20 },
          { do: "objective", text: "Follow the south-east path to the chapel." },
        ] },
        { id: "cart", when: { type: "interact" }, note: "Searching the overturned cart.", actions: [
          { do: "check", skill: "investigation", dc: 11, reason: "Search the overturned cart", success: [
            { do: "narrate", text: "Under a torn bolt of velvet you find a small locked box. Inside: two healing draughts wrapped in straw." },
            { do: "loot", item: { id: "potion", name: "Healing Potion", kind: "consumable", qty: 2, heal: "2d4+2", desc: "Drink to heal 2d4+2." } },
          ], fail: [{ do: "narrate", text: "Bolts of cloth, a broken axle, nothing more — though something glints in the mud just out of reach." }] },
        ] },
        { id: "leave", when: { type: "interact" }, note: "Leaving for the chapel.", actions: [
          { do: "narrate", text: "The path climbs through dead bracken to the chapel ruins. Its bell tower is cracked, and cold air breathes up from a stair beneath the altar." },
          { do: "scene", id: "crypt" },
        ] },
      ],
    },
    crypt: {
      id: "crypt",
      title: "The Chapel Crypt",
      env: { preset: "crypt", weather: "fog", time: "night" },
      map: [
        "############################",
        "#SS.....#..........#.......#",
        "#SS.....+....k.....#...s...#",
        "#SS.....#..........#.......#",
        "#.......#....^^....#...s...#",
        "####+####..........#########",
        "#.......#####+######.......#",
        "#..L....#..........#...C...#",
        "#.......#..k....k..#.......#",
        "#.......#..........#.......#",
        "####.#######+#######..####.#",
        "#..........................#",
        "#.....T.........T......k...#",
        "#..........................#",
        "#.....T.........T.........E#",
        "############################",
      ],
      marks: {
        S: { type: "start" },
        k: { type: "enemy", monster: "skeleton", group: "crypt" },
        s: { type: "enemy", monster: "skeleton", group: "archers", name: "Skeleton Archer" },
        L: { type: "prop", kind: "lever", name: "Rusted Lever", interact: "lever" },
        C: { type: "prop", kind: "chest", name: "Reliquary", interact: "chest" },
        E: { type: "prop", kind: "stairs", name: "Stair to the Ossuary", interact: "descend" },
      },
      intro:
        "The stair ends in a crypt that smells of wet stone and old incense. Niches line the walls — most of them empty. Somewhere ahead, bone scrapes against bone.",
      objective: "Find the way down to whoever is raising the dead.",
      gmNotes:
        "The east chamber (top right) is sealed; the rusted lever in the west room opens it. The reliquary holds the Bell-Shard, a holy relic that deals extra radiant damage to undead (flavour; treat as a +1d4 radiant bonus the AI can mention). Vesk the Gravecaller waits in the ossuary below. He was once Ilyra's mentor and court mage, exiled for trying to bring back his drowned daughter.",
      triggers: [
        { id: "lever", when: { type: "interact" }, note: "The lever opens the sealed east chamber.", actions: [
          { do: "check", skill: "athletics", dc: 10, reason: "Force the rusted lever", success: [
            { do: "narrate", text: "With a shriek of iron the lever gives. Far to the east, stone grinds on stone." },
            { do: "setTile", x: 19, y: 2, tile: "/" },
            { do: "flag", key: "eastOpen", value: true },
          ], fail: [{ do: "narrate", text: "The lever groans but won't budge. Maybe someone stronger could try." }] },
        ] },
        { id: "chest", when: { type: "interact" }, note: "The reliquary with the Bell-Shard.", actions: [
          { do: "narrate", text: "The reliquary opens with a sigh of dust. Inside rests a curved shard of bronze that hums faintly — a piece of the chapel's bell." },
          { do: "loot", item: { id: "bellshard", name: "Bell-Shard", kind: "treasure", desc: "Hums near the undead. Your strikes against undead ring with radiant light." }, gold: 40 },
          { do: "xp", amount: 50 },
        ] },
        { id: "trap", when: { type: "enter", rect: [12, 3, 15, 4] }, note: "Pressure-plate dart trap.", actions: [
          { do: "trap", damage: "2d4", type: "piercing", save: "dex", dc: 12, text: "Click. Darts spit from the walls!" },
        ] },
        { id: "cryptdone", when: { type: "cleared" }, actions: [
          { do: "narrate", text: "Silence returns to the crypt, broken only by the drip of water. From the stair in the far corner, a voice drifts up: singing a lullaby." },
          { do: "xp", amount: 200 },
        ] },
        { id: "descend", when: { type: "interact" }, note: "Going down to the final scene.", actions: [
          { do: "scene", id: "ossuary" },
        ] },
      ],
    },
    ossuary: {
      id: "ossuary",
      title: "The Bone Throne",
      env: { preset: "ossuary", weather: "embers", time: "night" },
      map: [
        "############################",
        "#..........................#",
        "#..T....T....N.....T....T..#",
        "#..........k....k..........#",
        "#..........................#",
        "#..T....T..........T....T..#",
        "#.........^^......^^.......#",
        "#..........................#",
        "#~~~~~~~~~~~~==~~~~~~~~~~~~#",
        "#..........................#",
        "#..T....T..........T....T..#",
        "#..........................#",
        "#............SS............#",
        "#...........SSSS...........#",
        "#..........................#",
        "############################",
      ],
      marks: {
        S: { type: "start" },
        N: { type: "enemy", monster: "necromancer", group: "boss" },
        k: { type: "enemy", monster: "skeleton", group: "boss" },
      },
      intro:
        "A vast ossuary opens before you, its pillars stacked with skulls. A black river runs across the hall. Beyond it, on a throne of fused bone, a gaunt man in a sodden court robe cradles a little skull and sings.",
      objective: "Defeat — or redeem — Vesk the Gravecaller.",
      gmNotes:
        "Vesk wants to finish a ritual to return his daughter Mira. He can be talked down (Persuasion or Insight DC 15 after 2 rounds of combat, or if someone shows him the Bell-Shard, which was Mira's christening bell). If talked down he collapses weeping and the skeletons crumble. Otherwise fight to the end. Ending either way concludes the campaign.",
      triggers: [
        { id: "speech", when: { type: "enter", rect: [1, 9, 26, 11] }, note: "Vesk speaks and battle begins.", actions: [
          { do: "say", npc: "Vesk the Gravecaller", text: "Not another step! Mira is almost home. I will not let you take her from me again." },
          { do: "combat" },
        ] },
        { id: "redeem", when: { type: "manual" }, note: "Fire this if the players talk Vesk down. Ends the campaign peacefully.", actions: [
          { do: "remove", group: "boss" },
          { do: "narrate", text: "The staff slips from Vesk's fingers. The skeletons fold like puppets with cut strings, and the old mage weeps into his hands. Upstairs, the chapel bell rings once, on its own." },
          { do: "xp", amount: 700 },
          { do: "end", text: "Thornwick's dead sleep again. Vesk is led away to face the reeve — alive, and for the first time in years, at peace." },
        ] },
        { id: "victory", when: { type: "cleared", group: "boss" }, actions: [
          { do: "narrate", text: "Vesk crumples beside his throne. The little skull rolls from his hands and comes to rest at your feet. The bones in the walls fall still." },
          { do: "end", text: "The Gravecaller is no more. Thornwick will ring its bells for you — though some nights, a lullaby still drifts up from beneath the chapel." },
        ] },
      ],
    },
  },
};
