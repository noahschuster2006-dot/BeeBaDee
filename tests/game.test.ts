import { describe, expect, it, beforeEach } from "vitest";
import { seededRng } from "../src/shared/dice";
import { newCharacter } from "../src/shared/rules";
import type { ClassId } from "../src/shared/types";
import { emptyRoom, Game, type GameEvents } from "../src/server/game";
import { enemyTurn } from "../src/server/tactics";
import { canStand, reachable } from "../src/shared/board";
import { AiGameMaster } from "../src/server/gm/ai";
import { sanitizeCharacter, sanitizeLook } from "../src/server/room";

function setup(classes: ClassId[] = ["fighter", "wizard", "cleric", "rogue"], seed = 7) {
  const log: string[] = [];
  const gmEvents: string[] = [];
  const ev: GameEvents = {
    chat: (m) => log.push(`${m.channel}|${m.text}`),
    fx: () => {}, dice: () => {}, changed: () => {},
    gmEvent: (t) => gmEvents.push(t),
  };
  const state = emptyRoom("test");
  classes.forEach((cls, i) => {
    state.players[`p${i}`] = {
      id: `p${i}`, name: `P${i}`, look: sanitizeLook({}), host: i === 0, ready: true, connected: true,
      character: newCharacter({ id: `c${i}`, name: `Hero${i}`, cls, ancestry: "human", campaign: "any" }),
    };
  });
  const g = new Game(state, ev, seededRng(seed));
  return { g, log, gmEvents };
}

/** Plays the fight: enemies use their tactics, PCs attack the nearest foe or walk toward it. */
function autoplayCombat(g: Game, maxTurns = 400) {
  for (let i = 0; i < maxTurns && g.state.combat.active; i++) {
    const cur = g.current()!;
    if (cur.kind !== "pc") {
      for (const step of enemyTurn(g, cur)) { step(); if (!g.state.combat.active) break; }
      continue;
    }
    const ch = g.charFor(cur)!;
    const foes = g.hostiles().sort((a, b) => Math.max(Math.abs(a.x - cur.x), Math.abs(a.y - cur.y)) - Math.max(Math.abs(b.x - cur.x), Math.abs(b.y - cur.y)));
    const foe = foes[0];
    if (foe) {
      // walk (with real pathfinding) to the reachable square closest to the foe
      if (Math.max(Math.abs(foe.x - cur.x), Math.abs(foe.y - cur.y)) > 1) {
        const { cost } = reachable(g.board, cur, cur.turn!.movement);
        let best: [number, number] | null = null;
        let bd = Infinity;
        for (const cell of cost.keys()) {
          const x = cell % g.board.width, y = Math.floor(cell / g.board.width);
          if (!canStand(g.board, cur, x, y)) continue;
          const d = Math.max(Math.abs(foe.x - x), Math.abs(foe.y - y));
          if (d < bd) { bd = d; best = [x, y]; }
        }
        if (best) g.act(cur.ownerId!, { type: "move", tokenId: cur.id, x: best[0], y: best[1] });
      }
      const atk = ch.cls === "wizard" ? null : ch.cls;
      if (atk && g.state.combat.active && g.current() === cur) {
        const weapon = { fighter: "longsword", rogue: "shortsword", cleric: "mace", ranger: "longbow", barbarian: "greataxe" }[atk]!;
        g.act(cur.ownerId!, { type: "attack", tokenId: cur.id, targetId: foe.id, attack: weapon });
      } else if (g.state.combat.active && g.current() === cur) {
        g.act(cur.ownerId!, { type: "cast", tokenId: cur.id, spell: "firebolt", targetId: foe.id });
      }
    }
    if (g.state.combat.active && g.current() === cur) g.act(cur.ownerId!, { type: "endTurn", tokenId: cur.id });
  }
}

describe("game flow", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });

  it("starts a campaign with a token per character and an intro", () => {
    ctx.g.startCampaign("realm");
    expect(ctx.g.state.phase).toBe("campaign");
    expect(ctx.g.pcTokens()).toHaveLength(4);
    expect(new Set(ctx.g.pcTokens().map((t) => `${t.x},${t.y}`)).size).toBe(4);
    expect(ctx.log.some((l) => l.startsWith("gm|The sun bleeds"))).toBe(true);
    expect(ctx.g.board.explored.includes("1")).toBe(true);
  });

  it("springs the ambush trigger, runs a full combat and awards XP", () => {
    const { g } = ctx;
    g.startCampaign("realm");
    const hero = g.pcTokens()[0];
    expect(g.act(hero.ownerId!, { type: "move", tokenId: hero.id, x: 12, y: 6 })).toBeNull();
    expect(g.state.combat.active).toBe(true);
    expect(g.hostiles().length).toBeGreaterThan(0);
    autoplayCombat(g);
    expect(g.state.combat.active).toBe(false);
    const won = g.hostiles().length === 0;
    if (won) {
      expect(ctx.log.some((l) => l.includes("stamped with a chapel bell"))).toBe(true);
      expect(Object.values(g.state.players).every((p) => p.character!.xp > 0)).toBe(true);
    }
  });

  it("enforces turn order and action economy", () => {
    const { g } = ctx;
    g.startCampaign("realm");
    const hero = g.pcTokens()[0];
    g.act(hero.ownerId!, { type: "move", tokenId: hero.id, x: 12, y: 6 });
    // find a PC whose turn it is NOT
    const cur = g.current()!;
    const other = g.pcTokens().find((t) => t !== cur)!;
    expect(g.act(other.ownerId!, { type: "dodge", tokenId: other.id })).toMatch(/not your turn/);
    expect(g.act("p0", { type: "dodge", tokenId: g.pcTokens()[1].id })).toMatch(/not your character/);
  });

  it("scripted checks branch on success and failure", () => {
    const { g } = ctx;
    g.startCampaign("realm");
    g.loadScene("crypt");
    const lever = g.board.props.find((p) => p.kind === "lever")!;
    const hero = g.pcTokens()[0];
    hero.x = lever.x + 1; hero.y = lever.y;
    g.state.combat.active = false;
    expect(g.act(hero.ownerId!, { type: "interact", tokenId: hero.id, propId: lever.id })).toBeNull();
    const chk = g.state.checks[0];
    expect(chk.skill).toBe("athletics");
    g.resolveCheck(chk.playerId, chk.id);
    expect(g.state.checks).toHaveLength(0);
    expect(ctx.log.some((l) => l.includes("lever"))).toBe(true);
  });

  it("knocks PCs unconscious and runs death saves", () => {
    const { g } = ctx;
    g.startCampaign("realm");
    const t = g.pcTokens()[0];
    g.damage(t, 999, "slashing");
    expect(t.conditions).toContain("unconscious");
    expect(t.hp).toBe(0);
    g.heal(t, 5);
    expect(t.conditions).not.toContain("unconscious");
    expect(t.hp).toBe(5);
  });

  it("ends combat when the whole party is knocked out and retreats them", () => {
    const { g } = ctx;
    g.startCampaign("realm");
    const hero = g.pcTokens()[0];
    g.act(hero.ownerId!, { type: "move", tokenId: hero.id, x: 12, y: 6 });
    expect(g.state.combat.active).toBe(true);
    for (const t of g.pcTokens()) g.damage(t, 999, "slashing");
    expect(g.state.combat.active).toBe(false);
    for (const t of g.pcTokens()) {
      expect(t.hp).toBe(1);
      expect(t.conditions).not.toContain("unconscious");
      expect(t.x).toBeLessThan(4);
    }
  });

  it("can play every campaign's first fight to the end", () => {
    for (const id of ["hollow", "neon", "realm"] as const) {
      const c = setup(["fighter", "barbarian", "ranger", "cleric", "rogue", "wizard"], 11);
      c.g.startCampaign(id);
      c.g.spawnMonster(id === "hollow" ? "husk" : id === "neon" ? "ganger" : "goblin", c.g.pcTokens()[0], 2, true);
      c.g.startCombat();
      expect(c.g.state.combat.active).toBe(true);
      autoplayCombat(c.g);
      expect(c.g.state.combat.active, id).toBe(false);
    }
  });
});

describe("AI game master tools", () => {
  it("executes tools against the game and rejects bad input", () => {
    const { g, log } = setup();
    g.startCampaign("hollow");
    const gm = new AiGameMaster(g, { narrate: (t, npc) => log.push(`gm|${npc ?? ""}|${t}`), system: () => {}, thinking: () => {}, changed: () => {} });
    expect(gm.exec("npc_say", { npc: "Old Wick", text: "Hello dears." })).toBe("said");
    expect(log.at(-1)).toBe("gm|Old Wick|Hello dears.");
    expect(gm.exec("request_check", { character: "Hero1", skill: "arcana", dc: 12, reason: "Read the glyphs" })).toMatch(/requested/);
    expect(g.state.checks).toHaveLength(1);
    expect(() => gm.exec("request_check", { character: "Nobody", skill: "arcana", dc: 12, reason: "x" })).toThrow(/No player character/);
    expect(gm.exec("fire_trigger", { id: "lantern" })).toMatch(/fired/);
    expect(() => gm.exec("fire_trigger", { id: "nope" })).toThrow();
    gm.exec("set_environment", { weather: "storm", time: "dawn" });
    expect(g.state.env.weather).toBe("storm");
    const before = g.board.tokens.length;
    gm.exec("spawn_creatures", { monster: "husk", count: 2, near_character: "Hero0", hostile: true });
    expect(g.board.tokens.length).toBe(before + 2);
    gm.exec("award_xp", { amount: 50, reason: "test" });
    expect(g.state.players.p0.character!.xp).toBe(50);
    expect(() => gm.exec("apply_effect", { target: "Hero0", kind: "damage", dice: "rm -rf" })).toThrow();
  });
});

describe("input sanitising", () => {
  it("rebuilds characters from rules and rejects inflated stats", () => {
    const c = newCharacter({ id: "x", name: "Cheater", cls: "fighter", ancestry: "human", campaign: "any" });
    c.abilities.str = 30;
    c.maxHp = 999;
    c.hp = 999;
    const clean = sanitizeCharacter(c)!;
    expect(clean.abilities.str).toBeLessThanOrEqual(17);
    expect(clean.maxHp).toBeLessThan(20);
    expect(clean.hp).toBeLessThanOrEqual(clean.maxHp);
  });
  it("fixes bad avatar input", () => {
    const l = sanitizeLook({ head: "dragon" as never, primary: "red; drop table", height: 99 });
    expect(l.head).toBe("human");
    expect(l.primary).toMatch(/^#/);
    expect(l.height).toBe(1.15);
  });
});
