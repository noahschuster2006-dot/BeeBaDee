# 🎲 BeeBaDee

BeeBaDee is a social 3D tabletop roleplaying game that runs in the browser. Up to six friends walk around a living world as customisable avatars, gather around a shared game board, and play full-length D&D-style campaigns from level 1 to 10. An AI Game Master, powered by Claude, runs the game, and the scripted campaigns branch on every choice the party makes.

## ▶ Play

- **GitHub Pages:** **https://noahschuster2006-dot.github.io/BeeBaDee/** (once Pages is switched on; see below).
- **Run it yourself:** `npm install && npm run dev`.

Open the link, pick a name and a table code, and send the 🔗 invite link to your friends. On a static host like GitHub Pages, the **first person to open a table code hosts it**: the whole game runs in their browser and everyone else connects to them peer-to-peer over WebRTC. No server is needed. The public PeerJS service is only used so browsers can find each other.

**Switch on GitHub Pages (one time):** in the repository go to **Settings → Pages → Build and deployment → Source: GitHub Actions**, then re-run the latest *Deploy play link to GitHub Pages* workflow (or push any commit). After that, every push rebuilds the game and republishes it.

A prebuilt copy also lives in `docs/` (rebuild it with `npm run build:docs`). You can serve that folder from any static host.

## What it's like

- **Hang out like VRChat.** First- or third-person movement, jumping, running, chairs, eight emotes, a working mirror, nameplates, chat bubbles above heads and 3D proximity voice chat. Avatars are fully customisable: human, bug, robot, beast or skull heads; hair; outfits; hats; wings and capes.
- **Play like Foundry VTT.** The board has a grid, fog of war, line of sight, click-to-move with path and distance, initiative tracker, roll cards, conditions, one-click attacks, spells, features, items and shops.
- **The board is a diorama.** The table in the middle of every world shows the live map with miniatures. Walls, pillars, trees and doors rise out of it as the party explores.
- **Ever-changing worlds.** Each of 36 scenes builds its own environment around the table: a fog-bound village, a stilt-town over a marsh, a dragon's crater, a city of paper lanterns, a crystal mine that sings, a neon noodle bar, a wireframe cyberspace, a corporate penthouse above the clouds. Each world has ambient life (crows, moths, gulls, rats, drones, wisps) and an interaction everyone sees and hears (press **E**): ring the church bell, beat the war drum, feed the Great Lantern, pluck the silk web, drop the beat, stare back at ORACLE. In the pub you can throw darts, strum the lute, roll for luck or change the music.
- **The Game Master.** The AI GM narrates, voices every NPC, calls for checks, puts dilemmas to a party vote, rolls fate on the world's whims, records consequences as story flags, and fires the campaign's story beats. Without an API key, a scripted narrator runs the same campaigns.

## Free will, consequences and dice

D&D is about choice, so the story engine is built around it:

- **Anyone can be killed, including key NPCs.** Kill the reeve and Thornwick turns on you. Kill the fixer who hired you and her grandson hunts you. Kill the mantis duelist and her widow comes for you in the gardens. Each campaign has `killed` triggers that rewrite the story.
- **Party votes on real dilemmas.** Spare the wolf cubs, adopt them or sell their pelts. Save the moth-queen's egg or the gardener grubs. Take a million credits to betray your fixer. Free the refugees in the spider queen's larder or take her deal. Every option changes allies, items, paths and endings.
- **Story flags persist across scenes and sessions.** Grown wolves return to fight beside you. The merchant you saved gives a discount. The dragon you freed may help in the final battle, or may eat you. The finale reads everything you did.
- **Dice decide the uncertain.** Random event tables at scene starts, tavern rumours, wishing wells, chance spawns and random monster variants mean no two playthroughs match.
- **Gritty and funny.** When a hero drops to 0 HP they roll on a lingering-wounds table, and the scars stay. Death is permanent unless the party pays a priest, medic or ripperdoc to bring someone back, and the revived come back changed. Heroes made mid-campaign join at the party's level. The writing is darkly funny: bureaucratic beetles, cowardly mayors, sarcastic dragons, terms-and-conditions on everything.

## Campaigns (levels 1-10)

| Campaign | Setting | Acts |
|---|---|---|
| **The Gravecaller of Thornwick** (14 scenes) | Mud, plague and gallows humour in a medieval kingdom where the dead won't stay buried | I: road ambush, Thornwick village, the Blackfang den, the chapel crypt, the Bone Throne · II: the Greywater causeway, Stilthaven on stilts, the hag's hut, Ironjaw Hold · III: the Giant's Stair, the Sunken Abbey · IV: Verdigris's roost, the Barrow of Kings, the Hollow Throne |
| **Lanterns of the Sunken Hive** (12 scenes) | An original, melancholy insect kingdom underground, eaten by a pale bloom that offers endless sleep | I: Mossgrot Crossing, Lanternrest, the Fungal Wastes, the Mantis Gallery · II: the Weeping Aqueducts, Silkhollow, the Withered Bridge · III: the Crystal Deeps, the Queen's Gardens, the Pale Knight · IV: the Heart of the Bloom, the Root of All Light |
| **Static Saints** (13 scenes) | A neon-noir heist on the most secure mind in Neo-Calder | I: Kessler Night Market, the Lucky Ladle, the chop shop, the Chrome Cathedral · II: the undercity drains, the Data Haven, inside the Net, Halcyon Docks · III: the tower lobby, R&D Floor 33, the executive floor · IV: Vault 9, the ORACLE core |

Each campaign has:

- **Its own hubs** with shops, rumour tables and resurrection.
- **Side quests and story milestones** that level the party to 10.
- **A bestiary and bosses:** a hag, a bandit queen, a hill giant, a dragon and a death-knight king; a giant crab, a spider queen, a corrupted knight and a radiant god; a chrome-bladed gang boss, a rogue AI daemon, a cargo mech, a corporate fixer and a predictive superintelligence.
- **Unique relic weapons and gear,** such as Bellringer, the Needle of the First Knight and Vale's Monowire.
- **Arena hazards:** sucking bogs, acid runoff, razor crystals, power couplings and silencing mist.
- **Several endings.**

## Rules

A simplified, fifth-edition-compatible ruleset built on the SRD 5.1 (CC-BY-4.0) core:

- **Classes and progression:** six classes from level 1 to 10, ability score increases at 4 and 8, and spell levels 1–5 with level-gated spell lists.
- **Class features:** Extra Attack, Improved Critical, Action Surge, Indomitable, Cunning Action, Uncanny Dodge, Evasion, Rage, Brutal Critical, Spirit Guardians, Divine Intervention and more.
- **Monsters:** multiattacks, recharge area abilities (breath weapons, spore bursts, missile pods), resistances and regeneration.
- **Combat:** advantage and disadvantage, opportunity attacks, death saves, rests, magic items with attack, AC and save bonuses, shops, encounter scaling by party size, and an enemy tactics engine (brutes close in, skirmishers flank, ranged foes kite).

## Running it

```bash
npm install
npm run dev        # game server on :8787 + Vite client on http://localhost:5173
npm run build && npm start   # production server on http://localhost:8787
npm test           # rules, campaign integrity and reachability, combat, story systems, AI GM tool loop
```

When the page is served by the game server, everyone connects to the server. When it's served statically (GitHub Pages, `docs/`), the first browser hosts the table.

### The AI Game Master

- **Browser-hosted tables:** the host opens **🤖 AI Game Master** on the join screen and pastes an Anthropic API key. The key stays in that browser and is sent only to Anthropic.
- **The game server:** set `ANTHROPIC_API_KEY` before `npm start`.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Turns on the AI GM on the server |
| `GM_MODEL` | `claude-opus-5-5` | Model |
| `GM_EFFORT` | `low` | Thinking effort; low keeps live chat snappy |
| `GM_DISABLE_AI` | — | `1` forces the scripted narrator |
| `PORT` / `DATA_DIR` / `ENEMY_STEP_MS` | `8787` / `./data/rooms` / `750` | Server settings |

The GM's tools are:

- **Voice and narration:** `npc_say`, `remember`.
- **Rolls and choices:** `request_check`, `present_choice`, `roll_fate`.
- **Story:** `fire_trigger`, `set_flag`, `set_objective`.
- **World and creatures:** `spawn_creatures`, `start_combat`, `set_environment`, `reveal_area`, `move_npc`, `set_disposition`.
- **Rewards and effects:** `give_item`, `give_gold`, `award_xp`, `apply_effect`.

Its instructions tell it never to block a player action, to make consequences stick, to use dice honestly, and to keep the tone gritty and funny. Requests use server-side refusal fallbacks.

## Controls

| Key | Action |
|---|---|
| WASD · Shift · Space | Move · run · jump |
| Click / right-drag · wheel · C | Look · zoom · first/third person |
| E | Interact: sit, mirror, quest board, desk, darts, lute, world interactions, the table |
| 1–8 | Emotes |
| Tab · K · Enter | Board · character sheet · chat |
| V · M | Push-to-talk · mute |

Chat commands: `/r 1d20+5`, `/r 2d20kh1+3`, `/gr 1d20`, `/me …`, `/gm …`, `/w name …`, `/ooc …`.

## Project layout

```
src/shared/     rules, monsters, items, dice, grid geometry, campaign scripts (realm/, hollow/, neon/)
src/server/     game engine & story director (game.ts), enemy tactics, AI GM, transport-agnostic rooms, Node server
src/client/     React UI, three.js world (avatars, pub, 36 environments, table diorama, dice, audio, voice), p2p hosting
tests/          rules, campaign checker (structure + reachability), combat, story systems, AI GM loop
```

All art and music are procedural, so there are no asset files. All settings, names and characters are original.
