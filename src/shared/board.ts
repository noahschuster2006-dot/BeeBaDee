// Grid geometry: tiles, line of sight, fog of war and movement.
// Distances follow the 5e default grid rule: every square (diagonals too) costs 1.

import type { BoardState, Token } from "./types";

export const TILE = {
  WALL: "#",
  FLOOR: ".",
  ALT: ",", // grass / moss / carpet: walkable alt floor
  WATER: "~", // difficult terrain
  RUBBLE: "^", // difficult terrain
  DOOR: "+", // closed door: walkable, blocks sight
  OPEN: "/", // open door
  PILLAR: "T", // blocks movement and sight (trees, pillars, server racks)
  CHASM: " ", // impassable but see-through
  BRIDGE: "=",
  HAZARD: "%", // walkable but dangerous: lava, acid, live wires, bloom-rot
  BRUSH: ";", // tall grass, reeds, crates, curtains: walkable but blocks line of sight
  UNKNOWN: "?", // unexplored square as seen by players (the server hides the real tile)
} as const;

export const SQUARE_FEET = 5;

export function tileAt(b: Pick<BoardState, "tiles" | "width" | "height">, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return TILE.WALL;
  return b.tiles[y][x] ?? TILE.WALL;
}

export function blocksMove(t: string) {
  // "?" is treated as walkable for previews: the server knows the real tile and has the final say
  return t === TILE.WALL || t === TILE.PILLAR || t === TILE.CHASM;
}

export function blocksSight(t: string) {
  return t === TILE.WALL || t === TILE.PILLAR || t === TILE.DOOR || t === TILE.BRUSH || t === TILE.UNKNOWN;
}

export function moveCost(t: string) {
  return t === TILE.WATER || t === TILE.RUBBLE || t === TILE.BRUSH ? 2 : 1;
}

/** What the party can see right now: the server's mask if it sent one, otherwise computed. */
export function visionOf(b: BoardState): Set<number> {
  if (b.visible) {
    const out = new Set<number>();
    for (let i = 0; i < b.visible.length; i++) if (b.visible[i] === "1") out.add(i);
    return out;
  }
  return partyVision(b);
}

/**
 * The players' copy of the board: only what the party has explored, only the creatures it can see now.
 * Unexplored squares become "?" so map shapes, enemies and features aren't revealed early.
 */
export function redactBoard(b: BoardState): BoardState {
  const vis = partyVision(b);
  const visible = Array.from({ length: b.width * b.height }, (_, i) => (vis.has(i) ? "1" : "0")).join("");
  const seen = (x: number, y: number) => b.explored[y * b.width + x] === "1";
  const tokens = b.tokens.filter((t) => {
    if (t.kind === "pc") return true;
    if (t.hidden) return false;
    for (let y = t.y; y < t.y + t.size; y++) for (let x = t.x; x < t.x + t.size; x++) if (vis.has(y * b.width + x)) return true;
    return false;
  });
  return {
    ...b,
    tiles: b.tiles.map((row, y) => [...row].map((ch, x) => (seen(x, y) ? ch : TILE.UNKNOWN)).join("")),
    tokens,
    props: b.props.filter((p) => seen(p.x, p.y)),
    visible,
  };
}

export function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Distance between two tokens' nearest occupied squares (handles large creatures). */
export function tokenDist(a: Token, b: Token) {
  const dx = Math.max(0, a.x - (b.x + b.size - 1), b.x - (a.x + a.size - 1));
  const dy = Math.max(0, a.y - (b.y + b.size - 1), b.y - (a.y + a.size - 1));
  return Math.max(dx, dy);
}

/** Bresenham line of sight between square centres. */
export function hasLos(b: Pick<BoardState, "tiles" | "width" | "height">, x0: number, y0: number, x1: number, y1: number) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) break;
    if (blocksSight(tileAt(b, x, y))) return false;
  }
  return true;
}

/** Cells visible from a point within a radius. */
export function visibleFrom(b: Pick<BoardState, "tiles" | "width" | "height">, ox: number, oy: number, radius: number): Set<number> {
  const out = new Set<number>();
  for (let y = Math.max(0, oy - radius); y <= Math.min(b.height - 1, oy + radius); y++) {
    for (let x = Math.max(0, ox - radius); x <= Math.min(b.width - 1, ox + radius); x++) {
      if (hasLos(b, ox, oy, x, y)) out.add(y * b.width + x);
    }
  }
  return out;
}

/** Union of what the party (PC tokens that aren't dead) can currently see. */
export function partyVision(b: BoardState): Set<number> {
  const out = new Set<number>();
  for (const t of b.tokens) {
    if (t.kind !== "pc" || t.conditions.includes("dead")) continue;
    for (const c of visibleFrom(b, t.x, t.y, t.vision)) out.add(c);
  }
  return out;
}

export function updateExplored(b: BoardState): boolean {
  const vis = partyVision(b);
  const arr = b.explored.split("");
  let changed = false;
  for (const c of vis) {
    if (arr[c] !== "1") { arr[c] = "1"; changed = true; }
  }
  if (changed) b.explored = arr.join("");
  return changed;
}

export function revealRect(b: BoardState, x0: number, y0: number, x1: number, y1: number) {
  const arr = b.explored.split("");
  for (let y = Math.max(0, y0); y <= Math.min(b.height - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(b.width - 1, x1); x++) arr[y * b.width + x] = "1";
  b.explored = arr.join("");
}

export function occupied(b: BoardState, x: number, y: number, ignore?: string): Token | undefined {
  return b.tokens.find(
    (t) => t.id !== ignore && !t.conditions.includes("dead") && x >= t.x && x < t.x + t.size && y >= t.y && y < t.y + t.size,
  );
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Cheapest path cost from a token to every reachable square within budget (Dijkstra).
 * Allies can be moved through; hostiles block. Returns map cellIndex -> cost and parent links.
 */
export function reachable(b: BoardState, tok: Token, budget: number) {
  const cost = new Map<number, number>();
  const parent = new Map<number, number>();
  const start = tok.y * b.width + tok.x;
  cost.set(start, 0);
  const open: number[] = [start];
  const hostileTo = (o: Token) => (tok.kind === "enemy") !== (o.kind === "enemy") && o.kind !== "object";
  while (open.length) {
    open.sort((a, c) => cost.get(a)! - cost.get(c)!);
    const cur = open.shift()!;
    const cx = cur % b.width;
    const cy = Math.floor(cur / b.width);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!fits(b, tok, nx, ny)) continue;
      // no corner cutting through walls on diagonals
      if (dx && dy && (blocksMove(tileAt(b, cx + dx, cy)) || blocksMove(tileAt(b, cx, cy + dy)))) continue;
      const blocker = occupiedArea(b, tok, nx, ny);
      if (blocker && hostileTo(blocker)) continue;
      const c = cost.get(cur)! + moveCost(tileAt(b, nx, ny));
      if (c > budget) continue;
      const n = ny * b.width + nx;
      if (!cost.has(n) || c < cost.get(n)!) {
        cost.set(n, c);
        parent.set(n, cur);
        open.push(n);
      }
    }
  }
  return { cost, parent };
}

function fits(b: BoardState, tok: Token, x: number, y: number) {
  for (let yy = y; yy < y + tok.size; yy++)
    for (let xx = x; xx < x + tok.size; xx++) if (blocksMove(tileAt(b, xx, yy))) return false;
  return true;
}

function occupiedArea(b: BoardState, tok: Token, x: number, y: number) {
  for (let yy = y; yy < y + tok.size; yy++)
    for (let xx = x; xx < x + tok.size; xx++) {
      const o = occupied(b, xx, yy, tok.id);
      if (o) return o;
    }
  return undefined;
}

/** Can the token end its move on this square (nobody else standing there)? */
export function canStand(b: BoardState, tok: Token, x: number, y: number) {
  return fits(b, tok, x, y) && !occupiedArea(b, tok, x, y);
}

export function pathTo(b: BoardState, tok: Token, x: number, y: number, budget: number): { cost: number; path: [number, number][] } | null {
  const { cost, parent } = reachable(b, tok, budget);
  const target = y * b.width + x;
  if (!cost.has(target)) return null;
  const path: [number, number][] = [];
  let cur: number | undefined = target;
  const start = tok.y * b.width + tok.x;
  while (cur !== undefined && cur !== start) {
    path.unshift([cur % b.width, Math.floor(cur / b.width)]);
    cur = parent.get(cur);
  }
  return { cost: cost.get(target)!, path };
}

export interface ParsedMap {
  tiles: string[];
  width: number;
  height: number;
  marks: Record<string, [number, number][]>;
}

/**
 * Turns an authored ASCII map into tiles + markers. Any character that isn't a tile becomes a
 * marker on a floor square (the scene decides what it means: start, spawn group, chest...).
 */
export function parseMap(rows: string[]): ParsedMap {
  const width = Math.max(...rows.map((r) => r.length));
  const tileChars = new Set<string>(Object.values(TILE));
  const marks: Record<string, [number, number][]> = {};
  const tiles = rows.map((row, y) => {
    let out = "";
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? TILE.WALL;
      if (tileChars.has(ch)) out += ch;
      else {
        (marks[ch] ??= []).push([x, y]);
        out += TILE.FLOOR;
      }
    }
    return out;
  });
  return { tiles, width, height: rows.length, marks };
}
