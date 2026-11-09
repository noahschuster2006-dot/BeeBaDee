import { describe, expect, it } from "vitest";
import { critExpr, parseDice, roll, seededRng } from "../src/shared/dice";
import { hasLos, parseMap, pathTo, TILE } from "../src/shared/board";
import { CAMPAIGNS } from "../src/shared/campaigns";
import { CLASSES, MONSTERS, SPELLS, grantXp, newCharacter, armorClass } from "../src/shared/rules";
import type { BoardState, Token } from "../src/shared/types";

describe("dice", () => {
  it("parses Foundry-style formulas", () => {
    expect(parseDice("1d20+5")).toEqual({ dice: [{ sign: 1, count: 1, sides: 20 }], modifier: 5 });
    expect(parseDice("2d20kh1 + 3").dice[0].keep).toEqual({ high: true, n: 1 });
    expect(parseDice("4d6dl1").dice[0].drop).toEqual({ high: false, n: 1 });
    expect(parseDice("d%").dice[0].sides).toBe(100);
    expect(parseDice("2d6-1d4+2").dice[1].sign).toBe(-1);
  });
  it("rejects nonsense", () => {
    for (const bad of ["", "hello", "1d20+", "1d1", "1000d6", "2d20kh3", "1d20 5"]) expect(() => parseDice(bad), bad).toThrow();
  });
  it("keeps the right dice and stays in range", () => {
    const rng = seededRng(42);
    for (let i = 0; i < 500; i++) {
      const adv = roll("2d20kh1+2", rng);
      const [a, b] = adv.terms[0].rolls;
      expect(adv.total).toBe(Math.max(a, b) + 2);
      const dis = roll("2d20kl1", rng);
      expect(dis.total).toBe(Math.min(...dis.terms[0].rolls));
      const stats = roll("4d6dl1", rng);
      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.total).toBeLessThanOrEqual(18);
    }
  });
  it("doubles dice on crits but not modifiers", () => {
    expect(critExpr("1d8+3")).toBe("2d8+3");
    expect(critExpr("2d6+1d4+2")).toBe("4d6+2d4+2");
  });
});

describe("board", () => {
  const map = parseMap([
    "#######",
    "#S..#.#",
    "#...+.#",
    "#..~..#",
    "#######",
  ]);
  const b: BoardState = { sceneId: "t", title: "t", width: map.width, height: map.height, tiles: map.tiles, explored: "0".repeat(35), tokens: [], props: [], theme: "realm" };
  const tok: Token = { id: "a", kind: "pc", name: "A", x: 1, y: 1, size: 1, hp: 1, maxHp: 1, ac: 10, speed: 6, color: "#fff", glyph: "x", conditions: [], vision: 8 };

  it("extracts markers as floor", () => {
    expect(map.marks.S).toEqual([[1, 1]]);
    expect(map.tiles[1][1]).toBe(TILE.FLOOR);
  });
  it("walls and closed doors block sight", () => {
    expect(hasLos(b, 1, 1, 3, 3)).toBe(true);
    expect(hasLos(b, 1, 2, 5, 2)).toBe(false);
  });
  it("paths through doors and pays for difficult terrain", () => {
    const p = pathTo(b, tok, 5, 2, 10);
    expect(p).not.toBeNull();
    expect(p!.path.at(-1)).toEqual([5, 2]);
    const water = pathTo(b, tok, 3, 3, 10)!;
    expect(water.cost).toBe(3); // two steps, the last one into water costs 2
    expect(pathTo(b, tok, 5, 2, 2)).toBeNull();
  });
});

describe("content integrity", () => {
  it("every campaign scene is well formed", () => {
    for (const c of Object.values(CAMPAIGNS)) {
      expect(c.scenes[c.start], `${c.id} start`).toBeTruthy();
      expect(c.pregens.length).toBe(6);
      for (const s of Object.values(c.scenes)) {
        const where = `${c.id}/${s.id}`;
        const widths = new Set(s.map.map((r) => r.length));
        expect(widths.size, `${where} rows must share a width`).toBe(1);
        const parsed = parseMap(s.map);
        for (const ch of Object.keys(parsed.marks)) expect(s.marks[ch], `${where} unknown marker "${ch}"`).toBeTruthy();
        expect((parsed.marks.S ?? []).length, `${where} needs 6 starts`).toBeGreaterThanOrEqual(6);
        for (const m of Object.values(s.marks)) {
          if (m.type === "enemy") expect(MONSTERS[m.monster], `${where} monster ${m.monster}`).toBeTruthy();
          if (m.type === "npc" && m.monster) expect(MONSTERS[m.monster]).toBeTruthy();
          if (m.type === "prop" && m.interact) expect(s.triggers.some((t) => t.id === m.interact), `${where} prop trigger ${m.interact}`).toBe(true);
        }
        const ids = s.triggers.map((t) => t.id);
        expect(new Set(ids).size, `${where} duplicate trigger ids`).toBe(ids.length);
        const walk = (acts: import("../src/shared/campaigns").ActionDef[]) => {
          for (const a of acts) {
            if (a.do === "scene") expect(c.scenes[a.id], `${where} → scene ${a.id}`).toBeTruthy();
            if (a.do === "trigger") expect(ids, `${where} → trigger ${a.id}`).toContain(a.id);
            if (a.do === "check") { walk(a.success); walk(a.fail); }
            if (a.do === "ai" && a.fallback) walk(a.fallback);
            if (a.do === "setTile") expect(a.y < s.map.length && a.x < s.map[0].length).toBe(true);
          }
        };
        for (const t of s.triggers) walk(t.actions);
      }
    }
  });
  it("every class spell exists and characters build cleanly", () => {
    for (const cls of Object.values(CLASSES)) {
      for (const sp of cls.spells) expect(SPELLS[sp], sp).toBeTruthy();
      const c = newCharacter({ id: "x", name: "Test", cls: cls.id, ancestry: "human", campaign: "any" });
      expect(c.hp).toBeGreaterThan(0);
      expect(armorClass(c)).toBeGreaterThanOrEqual(10);
      expect(c.skills.length).toBe(cls.skillCount);
    }
  });
  it("levels up with XP", () => {
    const c = newCharacter({ id: "x", name: "Test", cls: "wizard", ancestry: "elf", campaign: "any" });
    const hp = c.maxHp;
    expect(grantXp(c, 300)).toBe(2);
    expect(c.maxHp).toBeGreaterThan(hp);
    expect(c.maxSpellSlots).toBe(3);
  });
});
