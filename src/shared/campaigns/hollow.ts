import type { CampaignDef } from "./types";

// An original insect-kingdom setting: a fallen subterranean city of bugs,
// melancholy and quiet, lit by soul-lanterns and slowly eaten by a pale infection.
export const hollow: CampaignDef = {
  id: "hollow",
  name: "Lanterns of the Sunken Hive",
  tagline: "A forgotten insect kingdom, a dying light, and a bloom that should not grow.",
  color: "#9fb8ff",
  pitch:
    "Far beneath the surface lies Vesperhold, once a kingdom of a thousand bug-folk, now silent. Its soul-lanterns are going dark one by one, and the Pale Bloom spreads through the tunnels, turning the living into hollow husks. Someone has to carry a new flame into the deep.",
  tone:
    "Quiet, melancholy, beautiful decay. Echoing caverns, drifting spores, gentle music-box loneliness punctuated by sudden, sharp danger. NPCs are small, odd and endearing bug-folk who speak in short, wistful sentences. Never mention any existing video game.",
  start: "crossing",
  pregens: [
    { name: "Pell of the Needle", cls: "fighter", ancestry: "human", backstory: "A pillbug knight sworn to the last lantern." },
    { name: "Silk", cls: "rogue", ancestry: "halfling", backstory: "A mite thief who steals light itself." },
    { name: "Aurelia Dustwing", cls: "wizard", ancestry: "elf", backstory: "A mothkin scholar of soul-script." },
    { name: "Brother Slowshell", cls: "cleric", ancestry: "gnome", backstory: "A snail priest who tends the lanterns." },
    { name: "Thistle", cls: "ranger", ancestry: "orc", backstory: "A mantid hunter exiled from the canopy." },
    { name: "Gorm Hardcarapace", cls: "barbarian", ancestry: "dwarf", backstory: "A beetle brawler who fears nothing but silence." },
  ],
  scenes: {
    crossing: {
      id: "crossing",
      title: "Mossgrot Crossing",
      env: { preset: "cavern", weather: "spores", time: "night" },
      map: [
        "############################",
        "#,,,,,,,#######,,,,,,,,,,,,#",
        "#,SS,,,,,,,,,,,,,,,,,h,,,,,#",
        "#,SS,,W,,,,,,,,,,,,,,,,T,,,#",
        "#,SS,,,,,,T,,,,,,,,,,,,,,,,#",
        "#,,,,,,,,,,,,,,,,,,h,,,,,,,#",
        "####,,,,,     ==     ,,,,###",
        "####,,,,,     ==     ,,,,###",
        "#,,,,,,,,     ==     ,,,,,,#",
        "#,,,T,,,,,,,,,,,,,,,,,g,,,,#",
        "#,,,,,,,,,,,,,,,,,,g,,,,,,,#",
        "#,,,,,,,,,,,,,,,,,,,,,,T,,,#",
        "#,,L,,,,,,,,T,,,,,,,,,,,,,,#",
        "#,,,,,,,,,,,,,,,,,,,,,,,,,E#",
        "#,,,,,,,,,,,,,,,,,,,,,,,,,,#",
        "############################",
      ],
      marks: {
        S: { type: "start" },
        W: { type: "npc", name: "Old Wick", glyph: "🐌", color: "#d9b26b", persona: "An ancient snail lantern-maker, slow-spoken, kindly, a little forgetful. Sells lantern oil. Knows the Bloom started in the Hive Heart below the Mantis Gallery." },
        h: { type: "enemy", monster: "husk", group: "husks" },
        g: { type: "enemy", monster: "mosquito", group: "gnats", dormant: true },
        L: { type: "prop", kind: "lantern", name: "Dark Soul-Lantern", interact: "lantern" },
        E: { type: "prop", kind: "tunnel", name: "Tunnel to the Gallery", interact: "leave" },
      },
      intro:
        "You drift down into a cavern of soft green moss. Pale spores float like snow in the dark. Near the entrance an old snail sits beside a cart of unlit lanterns, humming. Across a chasm, something shuffles — a husk still walking its long-forgotten patrol.",
      objective: "Relight the dark soul-lantern and find the way down to the Gallery.",
      gmNotes:
        "Old Wick (friendly NPC) will give the party a lantern-flame if asked kindly and warns of blood gnats that swarm when the old lantern is relit. Relighting the lantern (Religion or Arcana DC 12) heals the party 1d6 and wakes the gnats. The husks were once Vesperhold's guards; their shells hold faint memories (a Medicine or Insight check can glimpse one).",
      triggers: [
        { id: "hello", when: { type: "start" }, actions: [
          { do: "say", npc: "Old Wick", text: "Oh… visitors. Haven't had visitors since the light was young. Mind the husks, dears. They don't know they're gone." },
        ] },
        { id: "lantern", when: { type: "interact" }, note: "Relighting the lantern heals the party and wakes the gnats.", actions: [
          { do: "check", skill: "religion", dc: 12, reason: "Coax the old soul-lantern back to life", success: [
            { do: "narrate", text: "The lantern catches. Blue soul-light washes over the moss, and warmth flows back into your shells." },
            { do: "heal", amount: "1d6" },
            { do: "xp", amount: 100 },
            { do: "env", weather: "clear" },
            { do: "narrate", text: "The light disturbs something. A high whine rises from across the cavern — blood gnats, dozens of wings." },
            { do: "spawn", group: "gnats" },
            { do: "combat" },
          ], fail: [
            { do: "narrate", text: "The wick sputters and dies. The whine of wings rises anyway — the gnats smelled your attempt." },
            { do: "spawn", group: "gnats" },
            { do: "combat" },
          ] },
        ] },
        { id: "gnatsdone", when: { type: "cleared" }, actions: [
          { do: "narrate", text: "Quiet settles back over Mossgrot. Old Wick claps two slow, slimy hands. 'Well done. Down the tunnel, then. The mantids won't like you. They don't like anyone.'" },
          { do: "xp", amount: 100 },
          { do: "loot", gold: 30 },
        ] },
        { id: "leave", when: { type: "interact" }, note: "Leaving for the Mantis Gallery.", actions: [
          { do: "scene", id: "gallery" },
        ] },
      ],
    },
    gallery: {
      id: "gallery",
      title: "The Mantis Gallery",
      env: { preset: "gallery", weather: "clear", time: "dusk" },
      map: [
        "############################",
        "#.......T..........T.......#",
        "#..........................#",
        "#....m........M........m...#",
        "#..........................#",
        "#.......T..........T.......#",
        "#..........,,,,,,..........#",
        "#..........,,,,,,..........#",
        "#.......T..,,,,,,..T.......#",
        "#..........................#",
        "#..........................#",
        "#.......T..........T.......#",
        "#..........................#",
        "#...........SSSS...........#",
        "#............SS............#",
        "############+###############",
      ],
      marks: {
        S: { type: "start" },
        M: { type: "npc", name: "Lady Kesh of the Blades", glyph: "🦗", color: "#7fd08a", monster: "mantisguard", persona: "Proud mantis duelist, leader of the gallery. Formal and honour-bound; respects courage and courtesy; despises cowardice. Will let the party pass if they win her respect.", group: "mantis" },
        m: { type: "npc", name: "Mantis Duelist", glyph: "🦗", color: "#5aa36a", monster: "mantisguard", persona: "Silent mantis guard.", group: "mantis" },
      },
      intro:
        "The tunnel opens into a hall of carved columns, where tall green figures stand utterly still. Mantis duelists. Their leader turns her head — just her head — to regard you.",
      objective: "Win passage through the Mantis Gallery — by word or by blade.",
      gmNotes:
        "The mantids are neutral. Lady Kesh challenges the party: 'State your purpose, crawlers.' A respectful explanation plus Persuasion DC 14 (or a formal duel offer) wins passage — fire the 'respect' trigger. Insults or attacks — fire 'duel' (they become hostile). Kesh knows the Bloom's heart is the Broodmother, a queen who ate a pale flower and grew vast.",
      triggers: [
        { id: "challenge", when: { type: "enter", rect: [1, 8, 26, 10] }, note: "Kesh issues a challenge.", actions: [
          { do: "say", npc: "Lady Kesh of the Blades", text: "Far enough. State your purpose, crawlers — and choose your words as carefully as you would choose a blade." },
          { do: "check", skill: "persuasion", dc: 14, reason: "Win Lady Kesh's respect", success: [{ do: "ai", direction: "Kesh is impressed. Fire the 'respect' trigger after a short in-character exchange.", fallback: [{ do: "trigger", id: "respect" }] }], fail: [{ do: "ai", direction: "Kesh is unimpressed. Give the party one more chance to show courage (e.g. accept a duel); if they don't, fire the 'duel' trigger.", fallback: [{ do: "trigger", id: "duel" }] }] },
        ] },
        { id: "respect", when: { type: "manual" }, note: "The mantids let the party pass peacefully.", actions: [
          { do: "say", npc: "Lady Kesh of the Blades", text: "Go, then. Burn the Bloom from our home. And should you fail — fail well." },
          { do: "setTile", x: 13, y: 0, tile: "/" },
          { do: "remove", group: "mantis" },
          { do: "xp", amount: 300 },
          { do: "narrate", text: "The mantids bow as one and melt into the shadows. A hidden gate grinds open in the north wall." },
        ] },
        { id: "duel", when: { type: "manual" }, note: "The mantids attack.", actions: [
          { do: "hostile", group: "mantis" },
          { do: "say", npc: "Lady Kesh of the Blades", text: "Then we dance." },
          { do: "combat" },
        ] },
        { id: "galledone", when: { type: "cleared", group: "mantis" }, actions: [
          { do: "narrate", text: "The last duelist kneels and folds her blades. 'Honour is satisfied.' A gate grinds open in the north wall." },
          { do: "setTile", x: 13, y: 0, tile: "/" },
          { do: "xp", amount: 200 },
        ] },
        { id: "gate", when: { type: "enter", rect: [13, 0, 13, 0] }, note: "Through the north gate.", actions: [
          { do: "scene", id: "heart" },
        ] },
      ],
    },
    heart: {
      id: "heart",
      title: "Heart of the Bloom",
      env: { preset: "bloom", weather: "spores", time: "night" },
      map: [
        "############################",
        "#,,,,,,,,,,,,,,,,,,,,,,,,,,#",
        "#,,T,,,,,,,,,,,,,,,,,,,T,,,#",
        "#,,,,,,p,,,,,,,,,,,p,,,,,,,#",
        "#,,,,,,,,,,,B,,,,,,,,,,,,,,#",
        "#,,,,,,,,,,,,,,,,,,,,,,,,,,#",
        "#,,T,,,,,,,,,,,,,,,,,,,T,,,#",
        "#,,,,,^^^,,,,,,,,,,^^^,,,,,#",
        "#,,,,,,,,,,,,,,,,,,,,,,,,,,#",
        "#,,,,,,,,,,,,,,,,,,,,,,,,,,#",
        "#~~~,,,,,,,,,,,,,,,,,,,,~~~#",
        "#~~~,,,,,,,,,,,,,,,,,,,,~~~#",
        "#,,,,,,,,,,,SSSS,,,,,,,,,,,#",
        "#,,,,,,,,,,,,SS,,,,,,,,,,,,#",
        "#,,,,,,,,,,,,,,,,,,,,,,,,,,#",
        "############################",
      ],
      marks: {
        S: { type: "start" },
        B: { type: "enemy", monster: "broodmother", group: "boss" },
        p: { type: "enemy", monster: "spitter", group: "boss" },
      },
      intro:
        "The cavern ends in a chamber of pale, pulsing petals. Roots of white light vein the walls. At its centre, a swollen queen the size of a house shifts on a bed of blossoms, and every husk in Vesperhold seems to breathe in time with her.",
      objective: "Destroy the Pale Broodmother and save Vesperhold's last light.",
      gmNotes: "Final battle. The Broodmother fights to the death. Describe the Bloom withering when she falls.",
      triggers: [
        { id: "wake", when: { type: "start" }, actions: [{ do: "combat" }] },
        { id: "win", when: { type: "cleared", group: "boss" }, actions: [
          { do: "env", weather: "clear", time: "dawn" },
          { do: "narrate", text: "The Broodmother shudders and goes still. Petal by petal, the Pale Bloom browns and falls. Far above, one by one, the soul-lanterns of Vesperhold flicker back to life." },
          { do: "end", text: "Vesperhold will not be the same. But it will go on — and its bugs will tell of the strangers who carried the light." },
        ] },
      ],
    },
  },
};
