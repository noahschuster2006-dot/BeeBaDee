import type { CampaignDef } from "./types";

export const neon: CampaignDef = {
  id: "neon",
  name: "Static Saints",
  tagline: "Rain, chrome and a heist on the most secure vault in Neo-Calder.",
  color: "#ff3fa4",
  pitch:
    "Neo-Calder never sleeps; it just flickers. Halcyon Dynamics is hiding a stolen mind in Vault 9 — the uploaded consciousness of a street saint the gangs still pray to. A fixer wants it out. The pay is enough to disappear forever.",
  tone:
    "Neon-noir cyberpunk. Rain on chrome, holographic ads, bass through the walls, slang and swagger. Corporations are cold, street people are warm and dangerous. Keep descriptions punchy and cinematic.",
  start: "market",
  pregens: [
    { name: "Vex Kuroda", cls: "fighter", ancestry: "orc", backstory: "Ex-corporate soldier with a chrome arm and a grudge." },
    { name: "Juno 'Nine Lives' Park", cls: "rogue", ancestry: "halfling", backstory: "Fixer's favourite face and liar." },
    { name: "Glitch", cls: "wizard", ancestry: "elf", backstory: "Netrunner who's been inside Halcyon's net once before." },
    { name: "Doc Ama Sato", cls: "cleric", ancestry: "human", backstory: "Back-alley medtech with a heart of gold-plated steel." },
    { name: "Ghost-7", cls: "ranger", ancestry: "gnome", backstory: "Rooftop sniper. Never misses twice." },
    { name: "Brick", cls: "barbarian", ancestry: "dwarf", backstory: "Too much chrome, not enough chill." },
  ],
  scenes: {
    market: {
      id: "market",
      title: "Kessler Night Market",
      env: { preset: "neoncity", weather: "rain", time: "night" },
      map: [
        "############################",
        "#SS..T......T......T.......#",
        "#SS........................#",
        "#SS...,,,,....,,,,....,,,,.#",
        "#.....,I,,....,,,,....,,g,.#",
        "#.....,,,,....,,,,....,,,,.#",
        "#..........................#",
        "#..T......T.......T......T.#",
        "#..........................#",
        "#.....,,,,....,,,,....,,,,.#",
        "#.....,,,,....,,g,....,,,,.#",
        "#.....,,,,....,,,,....,,g,.#",
        "#..........................#",
        "#..T......T.......T......E.#",
        "#..........................#",
        "############################",
      ],
      marks: {
        S: { type: "start" },
        I: { type: "npc", name: "Mama Iri", glyph: "👵", color: "#ffcf3a", persona: "Grandmotherly fixer who runs a noodle stall as a front. Calls everyone 'sweetheart'. Hands out the job: break into Halcyon's Vault 9 and recover the mind-shard of Saint Lucía. Pays 10,000 cred. Warns that the Chrome Saints gang has been bought by Halcyon." },
        g: { type: "enemy", monster: "ganger", group: "saints", dormant: true },
        E: { type: "prop", kind: "van", name: "Getaway Van", interact: "leave" },
      },
      intro:
        "Rain hammers the tarps of the Kessler Night Market. Holo-koi swim through the air above noodle stalls, and the smell of chilli oil fights the stink of ozone. At the corner stall, a tiny old woman waves you over with a ladle.",
      objective: "Meet Mama Iri, get the job, and reach the van.",
      gmNotes:
        "Mama Iri gives the job (vault 9 on the 40th floor of Halcyon Tower; the lobby has drones and a security terminal that can be hacked). The Chrome Saints gang will jump the party when they talk to Iri or head toward the van — Halcyon paid them. A ganger interrogated (Intimidation DC 12) admits a corp suit named Mr. Vale paid them.",
      triggers: [
        { id: "ambush", when: { type: "enter", rect: [10, 6, 26, 14] }, note: "Chrome Saints ambush.", actions: [
          { do: "say", npc: "Chrome Saint", text: "Halcyon says hi, choombas!" },
          { do: "spawn", group: "saints" },
          { do: "combat" },
        ] },
        { id: "saintsdone", when: { type: "cleared", group: "saints" }, actions: [
          { do: "narrate", text: "The last ganger hits the wet pavement. A burner phone buzzes in his pocket: 'Status? — V.'" },
          { do: "xp", amount: 150 },
          { do: "loot", gold: 120 },
          { do: "objective", text: "Take the getaway van to Halcyon Tower." },
        ] },
        { id: "leave", when: { type: "interact" }, note: "Driving to Halcyon Tower.", actions: [
          { do: "narrate", text: "The van tears through the rain-slick streets. Halcyon Tower rises ahead, a blade of white light stabbing the smog." },
          { do: "scene", id: "lobby" },
        ] },
      ],
    },
    lobby: {
      id: "lobby",
      title: "Halcyon Tower Lobby",
      env: { preset: "corplobby", weather: "clear", time: "night" },
      map: [
        "############################",
        "#......#############.......#",
        "#..d...#.....X.....#...d...#",
        "#......#...........#.......#",
        "#......#...........#.......#",
        "#......#############.......#",
        "#..........................#",
        "#..T..,,,,,,,,,,,,,,,,..T..#",
        "#.....,,,,,,,,,,,,,,,,.....#",
        "#..T..,,,,,,,K,,,,,,,,..T..#",
        "#.....,,,,,,,,,,,,,,,,.....#",
        "#..........................#",
        "#...e........SS........e...#",
        "#...........SSSS...........#",
        "#..........................#",
        "############################",
      ],
      marks: {
        S: { type: "start" },
        d: { type: "enemy", monster: "drone", group: "drones" },
        e: { type: "enemy", monster: "enforcer", group: "alarm", dormant: true },
        K: { type: "prop", kind: "terminal", name: "Security Terminal", interact: "hack" },
        X: { type: "prop", kind: "elevator", name: "Express Elevator", interact: "leave" },
      },
      intro:
        "Halcyon's lobby is a cathedral of white marble and soft piano music. Security drones drift like jellyfish beneath a forty-storey atrium. In the centre, a reception terminal glows patiently. The elevator vault behind it is sealed.",
      objective: "Get to the express elevator behind the sealed security door.",
      gmNotes:
        "Hacking the terminal (Arcana DC 13 — netrunning) unlocks the security door at the elevator bay and shuts down the drones. Failing triggers the alarm: enforcers deploy. Players can also simply fight; the door then needs Athletics DC 15 to force or the terminal. Mr. Vale watches on cameras and may taunt them over the PA.",
      triggers: [
        { id: "hack", when: { type: "interact" }, note: "Hacking the security terminal.", actions: [
          { do: "check", skill: "arcana", dc: 13, reason: "Jack into the security terminal", success: [
            { do: "narrate", text: "You slip through Halcyon's firewall like smoke. Drones power down mid-air and clatter onto the marble. The elevator bay door slides open." },
            { do: "remove", group: "drones" },
            { do: "setTile", x: 18, y: 5, tile: "/" },
            { do: "xp", amount: 200 },
          ], fail: [
            { do: "narrate", text: "ACCESS DENIED. Red light floods the atrium as a calm voice announces: 'Intruders. Lethal response authorised.'" },
            { do: "env", time: "night", weather: "storm" },
            { do: "spawn", group: "alarm" },
            { do: "setTile", x: 18, y: 5, tile: "/" },
            { do: "combat" },
          ] },
        ] },
        { id: "lobbydone", when: { type: "cleared" }, actions: [
          { do: "narrate", text: "Smoke curls over the shattered marble. The elevator waits, its doors open like an invitation." },
          { do: "xp", amount: 150 },
          { do: "setTile", x: 18, y: 5, tile: "/" },
        ] },
        { id: "leave", when: { type: "interact" }, note: "Riding up to Vault 9.", actions: [{ do: "scene", id: "vault" }] },
      ],
    },
    vault: {
      id: "vault",
      title: "Vault 9",
      env: { preset: "servervault", weather: "clear", time: "night" },
      map: [
        "############################",
        "#..T..T..T..T..T..T..T..T..#",
        "#..........................#",
        "#..........Q..H............#",
        "#..........................#",
        "#..T..T..T..........T..T..T#",
        "#..........................#",
        "#.........^^......^^.......#",
        "#..........................#",
        "#..T..T............T..T..T.#",
        "#..........................#",
        "#..........................#",
        "#...........SSSS...........#",
        "#............SS............#",
        "#..........................#",
        "############################",
      ],
      marks: {
        S: { type: "start" },
        Q: { type: "enemy", monster: "mech", group: "boss" },
        H: { type: "enemy", monster: "ice", group: "boss" },
      },
      intro:
        "The elevator opens onto a freezing hall of server towers, their lights blinking like a field of stars. At the far end, inside a glass cylinder, a single glowing shard hangs in the air. Between you and it: a two-storey security mech, and a figure of black, flickering hard-light.",
      objective: "Defeat Vault 9's guardians and recover Saint Lucía's mind-shard.",
      gmNotes: "Final battle. Mr. Vale speaks over the PA, offering the party double pay to walk away (a betrayal — if accepted, the enforcers will come for them later; the AI can decide). Recovering the shard ends the campaign.",
      triggers: [
        { id: "pa", when: { type: "start" }, actions: [
          { do: "say", npc: "Mr. Vale (PA)", text: "Impressive. Truly. I'll double whatever the old woman is paying if you turn around right now. No? Pity." },
          { do: "combat" },
        ] },
        { id: "win", when: { type: "cleared", group: "boss" }, actions: [
          { do: "narrate", text: "The mech topples into the server towers in a shower of sparks. The glass cylinder hisses open, and the shard drops into your palm — warm, humming, alive." },
          { do: "end", text: "That night, every screen in the Kessler Market flickers with a single image: a smiling saint and the words 'I'm home.' Somewhere, Mama Iri is pouring noodles for heroes." },
        ] },
      ],
    },
  },
};
