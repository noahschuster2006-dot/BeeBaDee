// Map furnishing: adds terrain to every scene — groves, boulders, ridges, crates, tall reeds — so the
// board breaks into segments that the party has to explore. Solid terrain blocks movement and sight;
// brush blocks sight only. Placement is seeded per scene (same map every time) and never cuts off any
// area, marker or trigger: each piece is rolled back if the reachable area would shrink.

import { TILE, blocksMove, parseMap } from "./board";
import { seededRng } from "./dice";
import type { ActionDef, SceneDef } from "./campaigns/types";

const OUTDOOR = new Set(["forest", "village", "marsh", "stilts", "fortress", "mountain", "dragonroost", "fungal", "garden", "cavern", "bloom", "bloomroad", "crystal", "neoncity", "docks", "radiance", "cyberspace", "gallery", "sewer"]);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function openedTiles(scene: SceneDef) {
  const out = new Set<string>();
  const walk = (acts: ActionDef[]) => {
    for (const a of acts) {
      if (a.do === "setTile") out.add(`${a.x},${a.y}`);
      if (a.do === "check") { walk(a.success); walk(a.fail); }
      if (a.do === "if") { walk(a.then ?? []); walk(a.else ?? []); }
      if (a.do === "choice") a.options.forEach((o) => walk(o.actions));
      if (a.do === "random") a.outcomes.forEach((o) => walk(o.actions));
      if (a.do === "ai" && a.fallback) walk(a.fallback);
    }
  };
  for (const t of scene.triggers) walk(t.actions);
  return out;
}

const cache = new Map<string, string[]>();

/** Returns the scene's map rows with terrain added. */
export function furnishedMap(scene: SceneDef): string[] {
  if (scene.id.startsWith("enc~")) return scene.map; // encounter maps are already laid out
  const key = `${scene.id}:${scene.map.join("")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const parsed = parseMap(scene.map);
  const W = parsed.width, H = parsed.height;
  const grid = parsed.tiles.map((r) => [...r]);
  // keep markers on their original glyphs so parseMap still finds them afterwards
  const rows = scene.map.map((r) => [...r.padEnd(W, "#")]);
  const rand = seededRng(hash(scene.id));
  const opened = openedTiles(scene);

  // protected squares: markers (+1), trigger areas (+1), scripted doors (+1)
  const prot = new Set<string>();
  const protect = (x: number, y: number, r: number) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) prot.add(`${x + dx},${y + dy}`); };
  for (const [ch, spots] of Object.entries(parsed.marks)) for (const [x, y] of spots) protect(x, y, ch === "S" ? 2 : 1);
  for (const t of scene.triggers) if (t.when.type === "enter") { const [x0, y0, x1, y1] = t.when.rect; for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) prot.add(`${x},${y}`); }
  for (const k of opened) { const [x, y] = k.split(",").map(Number); protect(x, y, 1); }

  const start = parsed.marks.S?.[0] ?? [1, 1];
  const passable = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (!blocksMove(grid[y][x]) || opened.has(`${x},${y}`));
  const reach = () => {
    const seen = new Set<number>([start[1] * W + start[0]]);
    const q = [start];
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!passable(nx, ny) || seen.has(ny * W + nx)) continue;
        seen.add(ny * W + nx);
        q.push([nx, ny]);
      }
    }
    return seen.size;
  };

  const floorish = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && (grid[y][x] === TILE.FLOOR || grid[y][x] === TILE.ALT) && !prot.has(`${x},${y}`);
  const open: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (floorish(x, y)) open.push([x, y]);
  if (!open.length) { cache.set(key, scene.map); return scene.map; }

  const outdoor = OUTDOOR.has(scene.env.preset);
  const solidBudget = Math.floor(open.length * (outdoor ? 0.13 : 0.06));
  const brushBudget = Math.floor(open.length * (outdoor ? 0.1 : 0.06));
  let base = reach();

  const tryPlace = (cells: [number, number][], tile: string) => {
    const ok = cells.filter(([x, y]) => floorish(x, y));
    if (!ok.length) return 0;
    const before = ok.map(([x, y]) => grid[y][x]);
    ok.forEach(([x, y]) => (grid[y][x] = tile));
    if (tile === TILE.PILLAR) {
      const after = reach();
      if (after !== base - ok.length) { ok.forEach(([x, y], i) => (grid[y][x] = before[i])); return 0; }
      base = after;
    }
    ok.forEach(([x, y]) => (rows[y][x] = tile));
    return ok.length;
  };

  const blob = (size: number) => {
    const [sx, sy] = open[Math.floor(rand() * open.length)];
    const cells: [number, number][] = [[sx, sy]];
    for (let i = 1; i < size; i++) {
      const [bx, by] = cells[Math.floor(rand() * cells.length)];
      const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
      cells.push([bx + d[0], by + d[1]]);
    }
    return cells;
  };
  const ridge = () => {
    const [sx, sy] = open[Math.floor(rand() * open.length)];
    const len = 3 + Math.floor(rand() * 4);
    const horiz = rand() < 0.5;
    return Array.from({ length: len }, (_, i) => [horiz ? sx + i : sx, horiz ? sy : sy + i] as [number, number]);
  };

  let solid = 0, brush = 0;
  for (let tries = 0; tries < 160 && solid < solidBudget; tries++) solid += tryPlace(outdoor && rand() < 0.4 ? ridge() : blob(2 + Math.floor(rand() * 4)), TILE.PILLAR);
  for (let tries = 0; tries < 120 && brush < brushBudget; tries++) brush += tryPlace(blob(3 + Math.floor(rand() * 5)), TILE.BRUSH);

  const out = rows.map((r) => r.join(""));
  cache.set(key, out);
  return out;
}
