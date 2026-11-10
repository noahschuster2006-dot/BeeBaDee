import { describe, expect, it } from "vitest";
import { parseMap, pathTo } from "../src/shared/board";
import { BESTIARY, XP_BY_CR, rollEncounter } from "../src/shared/bestiary";
import { seededRng } from "../src/shared/dice";
import { LANDMARKS, TERRAINS, WORLD_MAPS, encounterId, encounterScene, isEncounter, placeOf, resumableScene, sceneDef } from "../src/shared/encounters";
import { MONSTERS } from "../src/shared/monsters";
import { CAMPAIGNS } from "../src/shared/campaigns";
import { newCharacter } from "../src/shared/rules";
import type { BoardState, CampaignId, Token } from "../src/shared/types";
import { emptyRoom, Game, type GameEvents } from "../src/server/game";
import { sanitizeLook } from "../src/server/room";

const THEMES: CampaignId[] = ["realm", "hollow", "neon"];

function setup(level = 1) {
  const log: string[] = [];
  const ev: GameEvents = { chat: (m) => log.push(m.text), fx: () => {}, dice: () => {}, changed: () => {}, gmEvent: () => {} };
  const state = emptyRoom("t");
  (["fighter", "cleric", "rogue", "wizard"] as const).forEach((cls, i) => {
    const c = newCharacter({ id: `c${i}`, name: `Hero${i}`, cls, ancestry: "human", campaign: "any" });
    c.level = level;
    state.players[`p${i}`] = { id: `p${i}`, name: `P${i}`, look: sanitizeLook({}), host: i === 0, ready: true, connected: true, character: c };
  });
  const g = new Game(state, ev, seededRng(3));
  return { g, log };
}

const tok = (x: number, y: number) => ({ x, y, size: 1 }) as Token;
const boardOf = (map: string[]) => { const p = parseMap(map); return { p, b: { tiles: p.tiles, width: p.width, height: p.height, tokens: [], props: [] } as unknown as BoardState }; };

describe("bestiary", () => {
  it("has at least a hundred everyday foes per world, levelled from CR 1/8 to 10", () => {
    for (const t of THEMES) {
      const list = BESTIARY[t];
      expect(list.length).toBeGreaterThanOrEqual(100);
      expect(new Set(list.map((m) => m.id)).size).toBe(list.length);
      expect(Math.min(...list.map((m) => m.cr))).toBe(0.125);
      expect(Math.max(...list.map((m) => m.cr))).toBe(10);
      for (const m of list) {
        expect(MONSTERS[m.id]).toBeDefined();
        expect(m.xp).toBe(XP_BY_CR[m.cr]);
        expect(m.attacks.length).toBeGreaterThan(0);
      }
      // tougher creatures really are tougher
      const avgHp = (lo: number, hi: number) => { const ms = list.filter((m) => m.cr >= lo && m.cr <= hi); return ms.reduce((a, m) => a + Number(m.hp.split("d")[0]), 0) / ms.length; };
      expect(avgHp(5, 10)).toBeGreaterThan(avgHp(0, 1) * 3);
    }
  });

  it("every habitat has foes for weak and strong parties", () => {
    for (const t of THEMES) {
      const habitats = new Set(BESTIARY[t].flatMap((m) => m.habitat));
      for (const h of habitats) {
        for (const lvl of [1, 4, 7, 10]) {
          const enc = rollEncounter(t, h, lvl, 4, seededRng(lvl));
          expect(enc.length).toBeGreaterThan(0);
          for (const e of enc) expect(MONSTERS[e.id]).toBeDefined();
        }
      }
    }
  });
});

describe("encounter maps", () => {
  it("every terrain has four layouts, and every generated map is connected and populated", () => {
    for (const t of THEMES) {
      for (const terrain of TERRAINS[t]) {
        expect(terrain.variants.length).toBeGreaterThanOrEqual(4);
        const shapes = new Set<string>();
        for (let v = 0; v < terrain.variants.length; v++) {
          for (const [kind, lvl] of [["t", 1], ["t", 6], ["t", 10], ["e", 3]] as const) {
            const sc = encounterScene(t, encounterId(kind, terrain.id, v, lvl, 100 + v * 13 + lvl, "x"))!;
            expect(sc.map.length).toBe(16);
            expect(sc.env.preset).toBe(`${terrain.id}-${v}`);
            const { p, b } = boardOf(sc.map);
            const [sx, sy] = p.marks.S[0];
            const [ex, ey] = p.marks.X[0];
            expect(pathTo(b, tok(sx, sy), ex, ey, 300), `${t}/${terrain.id}/${v}`).not.toBeNull();
            const foes = [...(p.marks.a ?? []), ...(p.marks.b ?? [])];
            if (kind === "t") expect(foes.length, `${t}/${terrain.id}/${v} lvl ${lvl}`).toBeGreaterThan(0);
            if (kind === "e") expect(p.marks.N?.length).toBe(1);
            if (lvl === 1 && kind === "t") shapes.add(p.tiles.join(""));
          }
        }
        expect(shapes.size).toBe(terrain.variants.length); // the variants really are different maps
      }
    }
  });

  it("landmarks have a keeper you can reach, and a level-appropriate stat block", () => {
    for (const t of THEMES) {
      expect(LANDMARKS[t].length).toBeGreaterThanOrEqual(3);
      for (const lm of LANDMARKS[t]) {
        for (const lvl of [1, 5, 10]) {
          const sc = encounterScene(t, encounterId("l", lm.id, 0, lvl, 7 + lvl, "x"))!;
          const { p, b } = boardOf(sc.map);
          const [sx, sy] = p.marks.S[0];
          const [kx, ky] = p.marks.B[0];
          expect([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].some(([dx, dy]) => pathTo(b, tok(sx, sy), kx + dx, ky + dy, 300)), `${lm.id}`).toBe(true);
          const keeper = sc.marks.B;
          expect(keeper.type === "npc" && keeper.monster && MONSTERS[keeper.monster]).toBeTruthy();
        }
      }
    }
  });

  it("trigger ids are unique per encounter so one-shot triggers fire every time", () => {
    const a = encounterScene("realm", encounterId("t", "woods", 0, 2, 1, "village"))!;
    const b = encounterScene("realm", encounterId("t", "woods", 0, 2, 2, "village"))!;
    const ids = new Set(a.triggers.map((x) => x.id));
    expect(b.triggers.some((x) => ids.has(x.id))).toBe(false);
    for (const m of Object.values(a.marks)) if (m.type === "prop" && m.interact) expect(a.triggers.some((x) => x.id === m.interact)).toBe(true);
  });
});

describe("world maps", () => {
  it("every story scene sits somewhere on its world map, and roads join known places", () => {
    for (const t of THEMES) {
      for (const id of Object.keys(CAMPAIGNS[t].scenes)) expect(placeOf(t, id), `${t}/${id}`).toBeDefined();
      const ids = new Set(WORLD_MAPS[t].places.map((p) => p.id));
      for (const [a, b] of WORLD_MAPS[t].roads) { expect(ids.has(a)).toBe(true); expect(ids.has(b)).toBe(true); }
      for (const p of WORLD_MAPS[t].places) expect(TERRAINS[t].some((x) => x.id === p.terrain)).toBe(true);
    }
  });
});

describe("travel and exploring", () => {
  it("travelling between places can be interrupted by an encounter that then continues to the destination", () => {
    const { g } = setup(2);
    g.startCampaign("realm");
    g.loadScene("village");
    const seeded = g.rng;
    g.rng = () => 0.6; // d20 = 13: a fight on the road
    g.run([{ do: "scene", id: "causeway" }]);
    g.rng = seeded;
    expect(isEncounter(g.board.sceneId)).toBe(true);
    expect(g.board.title.length).toBeGreaterThan(0);
    expect(g.state.env.preset).toMatch(/^bog-\d$/);
    // the save file would resume at the destination, not inside the random encounter
    expect(resumableScene(g.board.sceneId)).toBe("causeway");
    // leave by the exit
    const exit = g.board.props.find((p) => p.name.startsWith("Press on"))!;
    const hero = g.pcTokens()[0];
    g.endCombat(true);
    hero.x = exit.x - 1; hero.y = exit.y;
    if (!g.board.tokens.some((t) => t !== hero && t.x === hero.x && t.y === hero.y)) expect(g.act(hero.ownerId!, { type: "interact", tokenId: hero.id, propId: exit.id })).toBeNull();
    else g.run([{ do: "scene", id: "causeway", direct: true }]);
    expect(g.board.sceneId).toBe("causeway");
    expect(g.state.flags["visited:greywater"]).toBe(true);
  });

  it("a quiet road goes straight there", () => {
    const { g } = setup(2);
    g.startCampaign("realm");
    g.loadScene("village");
    const seeded = g.rng;
    g.rng = () => 0.1; // d20 = 3
    g.run([{ do: "scene", id: "causeway" }]);
    g.rng = seeded;
    expect(g.board.sceneId).toBe("causeway");
  });

  it("exploring the wilds and heading back restores the scene exactly as it was", () => {
    const { g } = setup(3);
    g.startCampaign("neon");
    g.loadScene("market");
    const before = g.board.tokens.filter((t) => t.kind !== "pc").map((t) => `${t.name}@${t.x},${t.y}`).sort();
    expect(g.explore()).toBeNull();
    expect(isEncounter(g.board.sceneId)).toBe(true);
    expect(g.state.stash?.board.sceneId).toBe("market");
    expect(sceneDef("neon", g.board.sceneId)).toBeDefined();
    g.endCombat(true);
    g.run([{ do: "scene", id: "@return" }]);
    expect(g.board.sceneId).toBe("market");
    expect(g.state.stash).toBeUndefined();
    expect(g.board.tokens.filter((t) => t.kind !== "pc").map((t) => `${t.name}@${t.x},${t.y}`).sort()).toEqual(before);
    expect(g.pcTokens().length).toBe(4);
  });

  it("heroes can hand items to each other or drop them", () => {
    const { g } = setup(1);
    g.startCampaign("realm");
    const a = g.state.players.p0.character!, b = g.state.players.p1.character!;
    a.inventory.push({ id: "shield1", name: "Shield of Testing", kind: "armor", acBonus: 2 });
    expect(g.transferItem("p0", "shield1", "give", "p1")).toBeNull();
    expect(a.inventory.some((i) => i.id === "shield1")).toBe(false);
    expect(b.inventory.some((i) => i.id === "shield1")).toBe(true);
    const tokB = g.pcTokens().find((t) => t.ownerId === "p1")!;
    expect(tokB.ac).toBeGreaterThanOrEqual(2 + 10);
    expect(g.transferItem("p1", "shield1", "drop")).toBeNull();
    expect(b.inventory.some((i) => i.id === "shield1")).toBe(false);
  });
});

describe("paying up", () => {
  it("negative loot takes money from the party instead of giving it", () => {
    const { g } = setup(1);
    g.startCampaign("realm");
    const before = Object.values(g.state.players).reduce((a, p) => a + p.character!.gold, 0);
    g.run([{ do: "loot", gold: -20 }]);
    const after = Object.values(g.state.players).reduce((a, p) => a + p.character!.gold, 0);
    expect(after).toBe(before - 20);
  });
});
