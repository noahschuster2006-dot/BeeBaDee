# 🎲 BeeBaDee

BeeBaDee is a social 3D tabletop roleplaying game that runs in the browser. Up to six friends walk around a living world as customisable avatars and gather around a shared game board. An AI Game Master, powered by Claude, runs the adventure.

- **Hang out like VRChat.** You get third- and first-person movement, jumping, running, chairs to sit on, emotes, a working mirror, nameplates, chat bubbles above heads and proximity voice chat.
- **Play like Foundry VTT.** The board has a grid, fog of war, line of sight, click-to-move with path and distance preview, initiative tracking, attack/damage roll cards, conditions and one-click actions.
- **An AI Game Master** narrates, voices NPCs, asks for skill checks, improvises encounters, hands out loot and XP, changes the weather and fires the campaign's scripted story beats. Without an API key, a scripted narrator runs the same campaigns.
- **Ever-changing worlds.** Each scene builds a new procedural environment around the table: forests, crypts, caverns, neon streets, server vaults and more. Weather and time of day shift as the story goes on.

## The game loop

1. **The Gilded Mug (pub).** Everyone spawns in a tavern. Change your look at the mirror, build a hero at the scribe's desk, roll dice for luck, sit at the bar, play with the music box, or just chat. The table in the middle shows a live overhead map of the pub with everyone on it.
2. **The Quest Board.** The host (👑) picks one of three campaigns. Anyone without a hero gets a ready-made one.
3. **The adventure.** The pub dissolves and the campaign's world is built around the table. Walk around it, or open the board (**Tab**, or click the table) to move your token, interact with objects and fight. When the session ends, everyone returns to the pub, and the host can continue later from the scene where they stopped.

## Campaigns

| Campaign | Setting | Scenes |
|---|---|---|
| **Lanterns of the Sunken Hive** | An original melancholy insect kingdom underground, slowly eaten by a pale infection | Mossgrot Crossing → The Mantis Gallery (talk or fight) → Heart of the Bloom |
| **Static Saints** | A neon-noir cyberpunk heist in Neo-Calder | Kessler Night Market → Halcyon Tower Lobby (hack or fight) → Vault 9 |
| **The Gravecaller of Thornwick** | Classic medieval fantasy with a gothic edge | The Thornwick Road → The Chapel Crypt → The Bone Throne (redeem or defeat the villain) |

All three campaigns use the same rules. Each one renames classes, ancestries, weapons and spells to fit its world. For example, a Wizard is a *Soul Weaver* in the hive and a *Netrunner* in Neo-Calder.

## Rules

The rules are a simplified, fifth-edition-compatible ruleset built on the SRD 5.1 (CC-BY-4.0) core:

- Six classes (Fighter, Rogue, Wizard, Cleric, Ranger, Barbarian), six ancestries, levels 1–5, and the standard array.
- Proficiency, skills and saving throws.
- Advantage and disadvantage from conditions, prone targets, hiding, dodging, ranged attacks in melee and rage.
- Critical hits, sneak attack, opportunity attacks, death saves, short and long rests, spell slots, cantrip scaling, area spells, healing and buffs.
- Enemy turns are played by a tactics engine: brutes close in, skirmishers flank, ranged foes kite, and large monsters attack twice.
- Encounters scale to the size of the party.

## Running it

```bash
npm install
npm run dev        # game server on :8787 + Vite client on http://localhost:5173
```

For production, build the client and let the game server serve it:

```bash
npm run build
npm start          # http://localhost:8787
```

Open the page, choose a name and a table code, and share the invite link (🔗) with up to five friends.

### Turning on the AI Game Master

Set an Anthropic API key on the **server** before you start it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Turns on the AI Game Master. Without it, the scripted narrator runs. |
| `GM_MODEL` | `claude-opus-5-5` | Model used by the Game Master |
| `GM_EFFORT` | `low` | Thinking effort (`low`–`max`). Low keeps replies fast for live chat. |
| `GM_DISABLE_AI` | — | Set to `1` to force the scripted narrator |
| `PORT` | `8787` | Server port |
| `DATA_DIR` | `./data/rooms` | Where tables are saved |
| `ENEMY_STEP_MS` | `750` | Delay between enemy moves, so everyone can watch them |

How the GM works (`src/server/gm/ai.ts`):

- **Each wake-up starts a fresh conversation.** It holds a cached system prompt, then one message with the table state, the scene's secret GM notes, NPC personas, the GM's own notes, the recent table log and the new events.
- **Claude answers with narration and tools.** Its narration goes to chat. Its tools act on the game: `npc_say`, `request_check`, `fire_trigger`, `spawn_creatures`, `start_combat`, `set_environment`, `give_item`, `give_gold`, `award_xp`, `apply_effect`, `reveal_area`, `set_objective`, `move_npc`, `set_disposition` and `remember`.
- **It speaks only when there's something to answer.** In-character chat, `/gm` questions, check results and story beats wake the GM. Routine events are batched into its next turn.
- **Refusals fall back automatically.** Requests use server-side refusal fallbacks (`fallbacks: "default"`).

## Controls

| Key | Action |
|---|---|
| WASD / arrows | Move · **Shift** run · **Space** jump |
| Click / right-drag | Look around (Esc releases the mouse) |
| Wheel · C | Zoom · switch first/third person |
| E | Interact: sit, mirror, quest board, desk, music box, dice tray, game table |
| 1–8 | Emotes: wave, dance, clap, cheer, sit, point, bow, laugh |
| Tab · K | Game board · character sheet |
| Enter | Chat |
| V · M | Push-to-talk · mute (with the 🎙️ mic on) |

**On the board:** click your token's destination to move, click a creature to target it, then pick an attack, spell or feature. Right-drag pans, the wheel zooms, Alt+click pings, and **Space** ends your turn.

**Chat commands:**

- `/r 1d20+5 label`, `/r 2d20kh1+3` (advantage), `/gr 1d20` (secret roll)
- `/me action`, `/gm question`, `/w name message`, `/ooc message`

## Project layout

```
src/shared/     rules, dice, grid geometry (LOS, fog, pathing), campaign scripts — used by client and server
src/server/     WebSocket rooms, rules resolution & scripted director (game.ts), enemy tactics, AI Game Master
src/client/     React UI + three.js world (avatars, pub, environments, table, dice, audio, proximity voice)
tests/          rules, content integrity, full combats, AI GM tool loop (against a mock API)
```

```bash
npm test           # vitest
npm run typecheck
```

## Notes and limits

- **Voice is peer-to-peer WebRTC using public STUN servers.** Players behind strict NATs may need a TURN server, which you can add in `src/client/world/voice.ts`.
- **Characters live in each player's browser.** The server re-validates them against the rules when they join. Tables are saved to disk, and a restored table starts in the pub with a "Continue" option on the Quest Board.
- **All art and music are procedural.** There are no asset files, and the music is synthesised live with Web Audio.
- **All settings, names and characters are original.** The insect-kingdom campaign is inspired by the melancholy-bug genre without using any existing game's characters or places.
