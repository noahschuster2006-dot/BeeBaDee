// Travel and exploration encounters. Between story locations the dice decide what's on the road:
// nothing, a fight on a reusable map (every terrain has four hand-shaped layouts), or a landmark
// such as a wizard's tower. Encounter scenes are generated from their id, so they survive saves
// and every client can rebuild the same map.

import { BESTIARY, rollEncounter } from "./bestiary";
import { CAMPAIGNS } from "./campaigns";
import type { ActionDef, MarkDef, SceneDef, TriggerDef } from "./campaigns/types";
import type { CampaignId, TimeOfDay, Weather } from "./types";

// ---------------------------------------------------------------- grid drawing

type Rng = () => number;
const W = 28, H = 16;

export function seeded(seed: number): Rng {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Grid {
  t: string[][];
  constructor(fill: string, public r: Rng) { this.t = Array.from({ length: H }, () => Array(W).fill(fill)); }
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < W && y < H; }
  get(x: number, y: number) { return this.in(x, y) ? this.t[y][x] : "#"; }
  set(x: number, y: number, c: string) { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) this.t[y][x] = c; }
  rect(x0: number, y0: number, x1: number, y1: number, c: string) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  box(x0: number, y0: number, x1: number, y1: number, wall: string, floor?: string) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if (edge) this.set(x, y, wall); else if (floor) this.set(x, y, floor);
    }
  }
  frame(c: string) { for (let x = 0; x < W; x++) { this.t[0][x] = c; this.t[H - 1][x] = c; } for (let y = 0; y < H; y++) { this.t[y][0] = c; this.t[y][W - 1] = c; } }
  disc(cx: number, cy: number, r: number, c: string, ring = false) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r * 1.4); x <= cx + r * 1.4; x++) {
      const d = Math.hypot((x - cx) / 1.4, y - cy);
      if (ring ? d <= r && d > r - 1 : d <= r) this.set(x, y, c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, thick = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let dy = -thick; dy <= thick; dy++) for (let dx = -thick; dx <= thick; dx++) this.set(x + dx, y + dy, c);
    }
  }
  /** A wandering line, like a stream or a path. */
  wander(x0: number, y0: number, dir: "x" | "y", c: string, thick = 0, wobble = 0.35) {
    let x = x0, y = y0;
    while (this.in(x, y)) {
      for (let d = -thick; d <= thick; d++) dir === "x" ? this.set(x, y + d, c) : this.set(x + d, y, c);
      if (dir === "x") { x++; if (this.r() < wobble) y += this.r() < 0.5 ? -1 : 1; y = Math.max(2, Math.min(H - 3, y)); }
      else { y++; if (this.r() < wobble) x += this.r() < 0.5 ? -1 : 1; x = Math.max(2, Math.min(W - 3, x)); }
    }
  }
  sprinkle(c: string, n: number, on = ".,", area: [number, number, number, number] = [1, 1, W - 2, H - 2]) {
    for (let i = 0; i < n; i++) {
      const x = area[0] + Math.floor(this.r() * (area[2] - area[0] + 1)), y = area[1] + Math.floor(this.r() * (area[3] - area[1] + 1));
      if (on.includes(this.get(x, y))) this.set(x, y, c);
    }
  }
  blobs(c: string, n: number, rMin: number, rMax: number, on = ".,") {
    for (let i = 0; i < n; i++) {
      const cx = 3 + Math.floor(this.r() * (W - 6)), cy = 2 + Math.floor(this.r() * (H - 4));
      const r = rMin + this.r() * (rMax - rMin);
      for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 4; x <= cx + 4; x++)
        if (Math.hypot((x - cx) / 1.3, y - cy) <= r + this.r() * 0.6 && on.includes(this.get(x, y))) this.set(x, y, c);
    }
  }
  rows() { return this.t.map((r) => r.join("")); }
}

const WALK_TILES = new Set([".", ",", "~", "^", "+", "/", "=", "%", ";"]);
/** Walkable tiles, plus marker letters (start, exit, foes...) which sit on floor. */
const WALK = { has: (c: string) => WALK_TILES.has(c) || (/[A-Za-z]/.test(c) && c !== "T") };
const OPEN = new Set([".", ","]);

function reach(g: Grid, sx: number, sy: number) {
  const seen = new Set<number>([sy * W + sx]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (dx && dy && !WALK.has(g.get(x + dx, y)) && !WALK.has(g.get(x, y + dy))) continue; // no squeezing between corners
      if (!seen.has(k) && WALK.has(g.get(nx, ny))) { seen.add(k); q.push([nx, ny]); }
    }
  }
  return seen;
}

/** Carve a path of floor between two points if they aren't connected. */
function connect(g: Grid, ax: number, ay: number, bx: number, by: number, floor: string) {
  if (reach(g, ax, ay).has(by * W + bx)) return;
  let x = ax, y = ay;
  while (x !== bx || y !== by) {
    if (!WALK.has(g.get(x, y))) g.set(x, y, g.get(x, y) === " " ? "=" : floor);
    if (x !== bx && (y === by || g.r() < 0.6)) x += Math.sign(bx - x); else y += Math.sign(by - y);
  }
}

// ---------------------------------------------------------------- terrains

interface Variant { name: string; intro: string; draw: (g: Grid) => void; hazard?: SceneDef["hazard"]; time?: TimeOfDay; weather?: Weather }
export interface Terrain { id: string; name: string; habitat: string; floor: string; variants: Variant[] }

const mire = { name: "Sucking mire", damage: "1d4", type: "bludgeoning", save: "str" as const, dc: 10 };
const spores = { name: "Choking spores", damage: "1d6", type: "poison", save: "con" as const, dc: 11 };
const thornsHz = { name: "Razor thorns", damage: "1d6", type: "piercing", save: "dex" as const, dc: 11 };
const acidHz = { name: "Chemical vat", damage: "2d6", type: "acid", save: "dex" as const, dc: 12 };
const fireHz = { name: "Burning barrel", damage: "1d6", type: "fire", save: "dex" as const, dc: 11 };

function house(g: Grid, x0: number, y0: number, x1: number, y1: number, door: "n" | "s" | "e" | "w", wall = "#", floor = ".") {
  g.box(x0, y0, x1, y1, wall, floor);
  const mx = Math.floor((x0 + x1) / 2), my = Math.floor((y0 + y1) / 2);
  if (door === "n") g.set(mx, y0, "+"); if (door === "s") g.set(mx, y1, "+"); if (door === "e") g.set(x1, my, "+"); if (door === "w") g.set(x0, my, "+");
}
function ruin(g: Grid, x0: number, y0: number, x1: number, y1: number, wall = "#") {
  g.box(x0, y0, x1, y1, wall, ".");
  for (let i = 0; i < 4; i++) { const side = Math.floor(g.r() * 4); const x = x0 + 1 + Math.floor(g.r() * (x1 - x0 - 1)), y = y0 + 1 + Math.floor(g.r() * (y1 - y0 - 1)); if (side === 0) g.set(x, y0, "^"); if (side === 1) g.set(x, y1, "^"); if (side === 2) g.set(x0, y, "^"); if (side === 3) g.set(x1, y, "^"); }
}

export const TERRAINS: Record<CampaignId, Terrain[]> = {
  realm: [
    { id: "meadow", name: "Open fields", habitat: "meadow", floor: ",", variants: [
      { name: "Wildflower Meadow", intro: "Knee-high flowers roll in the wind. Bees, butterflies, and somewhere in the long grass, something that isn't either.", draw: (g) => { g.frame("T"); g.blobs(";", 7, 1, 2.2); g.sprinkle("T", 6); g.wander(13 + Math.floor(g.r() * 4), 1, "y", "~", 0, 0.4); const by = 4 + Math.floor(g.r() * 8); for (let x = 10; x < 20; x++) if (g.get(x, by) === "~") g.set(x, by, "="); } },
      { name: "Wheat Farm", intro: "A farm at the edge of the road. The wheat is tall, the farmhouse shutters are closed, and the scarecrow is facing the wrong way.", draw: (g) => { g.frame("T"); for (let y = 2; y < H - 2; y++) if (y % 3 !== 0) g.rect(14, y, 25, y, ";"); house(g, 3, 2, 9, 6, "s"); g.line(2, 9, 11, 9, "#"); g.set(6, 9, ","); g.set(7, 9, ","); g.sprinkle("T", 3, ",", [2, 10, 12, 14]); g.set(19, 7, "T"); } },
      { name: "Standing Stones", intro: "A circle of ancient stones crowns a low hill. Nobody farms here. Nobody even lets their sheep graze here.", draw: (g) => { g.frame("T"); g.blobs("^", 3, 1, 2); for (let i = 0; i < 12; i++) { if (i % 4 === 1) continue; const a = (i / 12) * Math.PI * 2; g.set(Math.round(14 + Math.cos(a) * 6), Math.round(8 + Math.sin(a) * 4), "T"); } g.set(14, 8, "T"); g.blobs(";", 4, 1, 1.8); } },
      { name: "Old Battlefield", intro: "Rusted helmets in the mud, a broken banner, ravens on a cart. A battle happened here. Nobody won it.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.set(x, y, "."); g.frame("T"); g.blobs("^", 6, 1, 2); g.line(9, 2, 9, 7, ";"); g.line(19, 8, 19, 13, ";"); g.rect(5, 11, 7, 12, "T"); g.rect(21, 3, 23, 4, "T"); g.sprinkle("T", 4, ".") ; g.sprinkle(",", 30, "."); } },
    ] },
    { id: "woods", name: "Forest", habitat: "woods", floor: ",", variants: [
      { name: "Forest Clearing", intro: "The trees open into a sunlit clearing. A fallen log, a ring of ash from an old fire. Very peaceful. Suspiciously so.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "T"; g.disc(14, 8, 5.5, ","); g.line(1, 8, 9, 8, ",", 1); g.line(19, 8, 26, 8, ",", 1); g.wander(5, 2, "x", ",", 0, 0.5); g.blobs(";", 5, 1, 1.6, ","); g.rect(12, 7, 14, 7, "T"); } },
      { name: "Pine Ravine", intro: "A ravine splits the pinewood, a cold stream roaring at its bottom. Two rope bridges. One looks newer than the other.", draw: (g) => { g.frame("T"); g.sprinkle("T", 34); for (let x = 1; x < W - 1; x++) { const y = 7 + Math.round(Math.sin(x / 4) * 2); g.set(x, y, " "); g.set(x, y + 1, " "); } for (const bx of [7, 20]) for (let y = 3; y < 13; y++) if (g.get(bx, y) === " ") g.set(bx, y, "="); g.blobs(";", 3, 1, 1.5); } },
      { name: "Fairy Ring", intro: "Mushrooms grow in a perfect circle around a mossy pond. The air hums. Your boots feel very interested in dancing.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = g.r() < 0.35 ? "T" : ","; g.disc(14, 8, 6, ","); g.disc(14, 8, 6, ";", true); for (const a of [0, 2.1, 4.2]) g.set(Math.round(14 + Math.cos(a) * 8.4), Math.round(8 + Math.sin(a) * 6), ","); g.disc(14, 8, 2, "~"); g.line(1, 8, 8, 8, ","); g.line(20, 8, 26, 8, ","); } },
      { name: "Logging Camp", intro: "Stumps, sawdust and stacked logs. The loggers' axes are still in the stumps. The loggers are not.", draw: (g) => { g.frame("T"); g.sprinkle("T", 14); g.sprinkle("^", 18); g.rect(4, 3, 9, 4, "T"); g.rect(4, 11, 9, 12, "T"); house(g, 17, 2, 23, 6, "s"); g.rect(15, 10, 22, 11, "T"); g.set(18, 10, "."); } },
    ] },
    { id: "highland", name: "Hills and mountains", habitat: "highland", floor: ".", variants: [
      { name: "Rocky Hills", intro: "Wind-scoured hills littered with boulders the size of cottages. Good cover, for you and for whatever lives here.", draw: (g) => { g.frame("#"); g.blobs("#", 6, 1, 2.2); g.blobs("^", 6, 1, 2); g.sprinkle(",", 40, "."); } },
      { name: "Mountain Path", intro: "A narrow path winds along the mountainside. On one side, rock. On the other, a very long way down.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = y > 9 ? " " : "#"; g.wander(1, 7, "x", ".", 1, 0.3); g.blobs("^", 3, 1, 1.4, "."); g.rect(10, 3, 14, 5, "."); g.rect(18, 4, 21, 6, "."); for (let x = 0; x < W; x++) g.t[H - 1][x] = "#"; } },
      { name: "Crag Pass", intro: "Two cliffs squeeze the road into a gap barely wide enough for a cart. Perfect for an ambush. Everyone always says that, right before one.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "#"; for (let x = 1; x < W - 1; x++) { const w = x > 10 && x < 18 ? 1 : 3; for (let y = 8 - w; y <= 8 + w; y++) g.set(x, y, "."); } g.rect(3, 2, 7, 4, "."); g.rect(21, 11, 25, 13, "."); g.line(5, 4, 5, 6, "."); g.line(23, 9, 23, 11, "."); g.sprinkle("^", 8, "."); } },
      { name: "Shepherd's Ridge", intro: "Dry-stone walls stitch the hillside into sheepfolds. The sheep are gone. The wool on the walls is red.", draw: (g) => { g.frame("#"); g.box(3, 2, 10, 7, "#"); g.set(10, 4, ","); g.box(16, 8, 24, 13, "#"); g.set(16, 10, ","); house(g, 18, 2, 23, 5, "s"); g.blobs(";", 4, 1, 1.5); g.sprinkle(",", 50, "."); } },
    ] },
    { id: "bog", name: "Marsh", habitat: "bog", floor: ",", variants: [
      { name: "Reed Marsh", intro: "Reeds taller than you, black water between them, and a boardwalk that has seen better centuries.", draw: (g) => { g.frame("T"); g.blobs("~", 7, 1, 2.5); g.blobs(";", 7, 1, 2); g.line(1, 8, 26, 8, "="); } },
      { name: "Drowned Village", intro: "A village the marsh swallowed. Rooftops break the water like the backs of whales.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "~"; g.frame("T"); g.rect(1, 6, 5, 10, ","); g.rect(22, 6, 26, 10, ","); ruin(g, 7, 2, 12, 6); ruin(g, 15, 9, 21, 13); ruin(g, 16, 2, 20, 5); g.line(5, 8, 22, 8, "="); g.line(10, 6, 10, 8, "="); g.line(18, 8, 18, 9, "="); } },
      { name: "Peat Cuttings", intro: "Neat black trenches where villagers cut peat for fuel. The trenches are full of water. Something in them is full of teeth.", draw: (g) => { g.frame("T"); for (let i = 0; i < 6; i++) { const x = 4 + (i % 3) * 7, y = i < 3 ? 3 : 10; g.rect(x, y, x + 4, y + 2, "~"); } g.sprinkle("T", 6, ","); g.blobs(";", 3, 1, 1.4); } },
      { name: "Misty Fen", intro: "Fog so thick you can taste it. Dead trees, sucking mud, and lights in the distance that nobody is holding.", hazard: mire, weather: "fog", draw: (g) => { g.frame("T"); g.blobs("%", 6, 1, 2); g.blobs("~", 3, 1, 1.5); g.sprinkle("T", 10); g.blobs(";", 4, 1, 1.4); } },
    ] },
  ],
  hollow: [
    { id: "tunnels", name: "Tunnels", habitat: "tunnels", floor: ".", variants: [
      { name: "Root Tunnel", intro: "A tunnel bored through roots older than the kingdom. They creak. Sometimes they move.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "#"; g.wander(1, 8, "x", ".", 1, 0.45); g.disc(8, 4, 2.2, "."); g.disc(19, 11, 2.5, "."); g.line(8, 4, 9, 8, "."); g.line(19, 11, 18, 8, "."); g.sprinkle("T", 5, "."); } },
      { name: "Abandoned Mine", intro: "Rails, overturned carts, picks still stuck in the walls. The miners left in a hurry. The singing they left behind didn't.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "#"; g.rect(1, 7, 26, 9, "."); g.line(1, 8, 26, 8, "="); g.rect(5, 2, 7, 13, "."); g.rect(15, 2, 17, 13, "."); g.rect(20, 2, 25, 4, "."); g.rect(20, 11, 25, 13, "."); g.sprinkle("^", 8, "."); g.set(10, 7, "T"); g.set(22, 9, "T"); } },
      { name: "Collapsed Street", intro: "An old bug-town street, its houses cracked like eggshells. Lanterns still hang from the eaves. A few still burn.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); ruin(g, 3, 2, 8, 6); ruin(g, 12, 2, 17, 5); ruin(g, 20, 10, 25, 14); ruin(g, 5, 10, 10, 14); g.sprinkle("^", 12, "."); } },
      { name: "Lantern Corridor", intro: "A grand corridor of dead lanterns. Pillars carved into praying beetles line the way. Their eyes follow you. Probably a trick of the light.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = y < 3 || y > 12 ? "#" : "."; for (let x = 3; x < W - 2; x += 4) { g.set(x, 5, "T"); g.set(x, 10, "T"); } for (const x of [6, 14, 22]) { g.rect(x, 1, x + 1, 2, "."); g.rect(x, 13, x + 1, 14, "."); } g.sprinkle("^", 4, "."); } },
    ] },
    { id: "fungus", name: "Fungal caves", habitat: "fungus", floor: ",", variants: [
      { name: "Spore Grove", intro: "Mushrooms the height of houses, glowing soft pink. The air is thick with spores. Try not to breathe. Try harder than that.", hazard: spores, draw: (g) => { g.frame("#"); g.sprinkle("T", 20); g.blobs("%", 4, 1, 1.6); g.blobs(";", 4, 1, 1.5); } },
      { name: "Shelf Caves", intro: "Cave shelves stacked like a pantry, each one sprouting fungus like bread mould. Something has been nibbling the bread.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "#"; for (let i = 0; i < 7; i++) g.disc(3 + i * 3.6, 5 + (i % 2) * 6, 2.6, ","); g.line(1, 8, 26, 8, ","); g.sprinkle(";", 10, ","); } },
      { name: "Puffball Field", intro: "A field of puffballs, each one ready to burst at a touch. Your party's sneezing will be heard for miles.", draw: (g) => { g.frame("#"); g.sprinkle(";", 70); g.sprinkle("T", 6); } },
      { name: "Rot Garden", intro: "Someone once kept a garden here. Now the planters overflow with rot that glows and breathes.", hazard: spores, draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); for (let x = 4; x < 24; x += 6) for (let y = 3; y < 13; y += 5) { g.box(x, y, x + 3, y + 2, "#", "%"); g.set(x + 1, y, "."); } } },
    ] },
    { id: "lake", name: "Underground lake", habitat: "lake", floor: ".", variants: [
      { name: "Still Lake", intro: "A black lake under a cave roof, its surface perfectly still. A narrow causeway crosses it. Things circle beneath.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "#"; g.disc(14, 8, 7, "."); g.disc(14, 8, 5, "~"); g.line(1, 8, 26, 8, "="); g.rect(1, 7, 4, 9, "."); g.rect(23, 7, 26, 9, "."); } },
      { name: "Pale Shallows", intro: "Ankle-deep water, pale as milk. Every step echoes. Every echo answers.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "~"; g.frame("#"); g.blobs(".", 7, 1, 2.4, "~"); g.sprinkle("T", 6, "."); g.rect(1, 6, 3, 10, "."); } },
      { name: "Waterfall Grotto", intro: "A waterfall thunders down from the dark into a churning pool. Behind it, if the stories are true, there's always treasure.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); g.rect(18, 1, 21, 14, "~"); g.rect(19, 1, 20, 4, " "); g.line(18, 10, 21, 10, "="); g.rect(23, 2, 26, 5, "."); g.blobs("T", 3, 1, 1.3, "."); } },
      { name: "Flooded Hall", intro: "A great hall, half drowned. Pillars march into the water and vanish. So did the last people who tried to swim it.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = y > 9 ? "~" : "."; g.frame("#"); for (let x = 4; x < W - 2; x += 5) for (const y of [4, 11]) g.set(x, y, "T"); } },
    ] },
    { id: "thorns", name: "Bramble lands", habitat: "thorns", floor: ",", variants: [
      { name: "Bramble Maze", intro: "Thorny brambles grown into a maze. Tufts of shell and cloth snag on every spike. Some of them still twitch.", hazard: thornsHz, draw: (g) => { g.frame("T"); for (let x = 3; x < W - 2; x += 4) { const gap = 2 + Math.floor(g.r() * 11); for (let y = 1; y < H - 1; y++) if (Math.abs(y - gap) > 1) g.set(x, y, y % 4 === 0 ? "%" : "T"); } } },
      { name: "Thorn Gully", intro: "A gully between two walls of thorns. Above, the mantis tribes watch from their perches. Below, you walk.", hazard: thornsHz, draw: (g) => { g.frame("T"); g.rect(1, 1, 26, 3, "%"); g.rect(1, 12, 26, 14, "%"); g.blobs("T", 4, 1, 1.4); g.blobs(";", 3, 1, 1.4); } },
      { name: "Briar Bridge", intro: "Branches knitted into bridges over a chasm full of thorns. Don't look down. Look down a bit, actually, to check your footing.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = " "; g.frame("T"); g.rect(1, 6, 4, 10, ","); g.rect(23, 6, 26, 10, ","); g.disc(13, 4, 2, ","); g.disc(14, 12, 2, ","); g.line(4, 8, 13, 4, "="); g.line(13, 4, 14, 12, "="); g.line(14, 12, 23, 8, "="); g.line(4, 8, 23, 8, "="); } },
      { name: "Hedge Garden", intro: "The queen's old hedge garden, unpruned for a hundred years. Topiary beetles stand in rows, slowly becoming something else.", draw: (g) => { g.frame("T"); for (let y = 3; y < H - 2; y += 3) for (let x = 3; x < W - 3; x++) if ((x + y) % 7 !== 0) g.set(x, y, "T"); g.sprinkle(";", 10, ","); } },
    ] },
  ],
  neon: [
    { id: "alley", name: "Back alleys", habitat: "alley", floor: ".", variants: [
      { name: "Back Alley", intro: "Steam vents, overflowing dumpsters, a neon sign that buzzes 'OPEN 25 HOURS'. Rain drips from a dozen fire escapes.", weather: "rain", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = y < 5 || y > 10 ? "#" : "."; g.rect(6, 2, 8, 4, "."); g.set(7, 5, "+"); g.rect(18, 11, 21, 13, "."); g.set(19, 10, "+"); g.sprinkle("T", 5, ".", [1, 5, 26, 10]); g.sprinkle(";", 6, ".", [1, 5, 26, 10]); g.sprinkle("~", 5, "."); } },
      { name: "Night Market Lane", intro: "A lane of food stalls, knock-off chrome and fortune-telling robots. Everybody here is selling something. Some of it is you.", draw: (g) => { g.frame("#"); for (let x = 3; x < W - 3; x += 4) { g.rect(x, 3, x + 1, 4, "T"); g.rect(x, 11, x + 1, 12, "T"); g.set(x, 5, ";"); g.set(x + 1, 10, ";"); } g.sprinkle(";", 6); } },
      { name: "Laundry Court", intro: "A courtyard boxed in by tenements, laundry lines crossing it like a web. Somebody up there is watching. Somebody is always watching.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); g.rect(1, 1, 26, 2, "#"); g.rect(1, 13, 26, 14, "#"); for (const x of [5, 12, 19]) { g.set(x, 2, "+"); g.set(x + 2, 13, "+"); } for (let x = 4; x < 25; x += 5) g.line(x, 4, x, 11, ";"); g.sprinkle("T", 4, "."); } },
      { name: "Dead End", intro: "The alley ends in a chain-link fence and a mural of a smiling corporate mascot. The mascot has bullet holes for eyes.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "#"; g.rect(1, 6, 26, 10, "."); g.rect(12, 1, 16, 14, "."); g.rect(20, 1, 23, 5, "."); g.sprinkle("T", 6, "."); g.sprinkle("~", 4, "."); g.line(12, 3, 16, 3, ";"); } },
    ] },
    { id: "rooftop", name: "Rooftops", habitat: "rooftop", floor: ".", variants: [
      { name: "Rooftop Garden", intro: "Somebody grows tomatoes up here, between the satellite dishes. Fifty floors below, the city hums like a hive.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame(" "); for (let i = 0; i < 6; i++) g.rect(4 + i * 4, 4 + (i % 2) * 6, 5 + i * 4, 5 + (i % 2) * 6, ";"); g.sprinkle("T", 5, "."); } },
      { name: "Billboard Roofs", intro: "Two rooftops, a gap between them and a giant billboard advertising a drink called LIQUID JOY. The planks across the gap are... optimistic.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = x > 11 && x < 16 ? " " : "."; g.frame(" "); g.line(12, 4, 15, 4, "="); g.line(12, 11, 15, 11, "="); g.line(19, 2, 25, 2, "#"); g.sprinkle("T", 6, "."); } },
      { name: "Water-Tank Roof", intro: "Old wooden water tanks on stilts, steam stacks, rattling vents. A pigeon in a tiny augmented-reality visor glares at you.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame(" "); g.disc(8, 5, 1.6, "T"); g.disc(19, 10, 1.6, "T"); g.disc(21, 4, 1.2, "T"); g.sprinkle("^", 8, "."); g.sprinkle(";", 5, "."); } },
      { name: "Helipad", intro: "A corporate helipad, the big H half-scrubbed off. Cargo crates, a fuel line, and a very long drop.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame(" "); g.disc(14, 8, 4, ","); g.rect(3, 3, 5, 4, "T"); g.rect(22, 11, 24, 12, "T"); g.rect(22, 3, 23, 5, "T"); g.sprinkle("%", 3, "."); } , hazard: fireHz },
    ] },
    { id: "underpass", name: "Under the highway", habitat: "underpass", floor: ".", variants: [
      { name: "Highway Underpass", intro: "Concrete pillars, burning barrels, a tent city under the roar of the highway. The locals don't like strangers. Or each other.", hazard: fireHz, draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); for (let x = 4; x < W - 2; x += 5) { g.set(x, 4, "T"); g.set(x, 11, "T"); } g.blobs(";", 4, 1, 1.5); g.sprinkle("%", 4, "."); } },
      { name: "Service Tunnel", intro: "A maintenance tunnel lined with cables thick as arms. Graffiti counts down in dates. The last one is today.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "#"; g.rect(1, 6, 26, 9, "."); house(g, 5, 1, 11, 6, "s", "#", "."); house(g, 16, 9, 23, 14, "n", "#", "."); g.sprinkle("T", 4, "."); g.sprinkle(";", 4, "."); } },
      { name: "Canal Bridge", intro: "A chemical canal glows sickly green under a rusted footbridge. Fish here have three eyes. They're the healthy ones.", hazard: acidHz, draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); g.rect(1, 6, 26, 9, "%"); g.rect(12, 6, 14, 9, "="); g.rect(22, 6, 23, 9, "="); g.sprinkle("T", 6, "."); } },
      { name: "Broken Overpass", intro: "Half an overpass, snapped clean off by something nobody wants to talk about. Cars hang over the edge like teeth.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = y < 4 || y > 12 ? " " : "."; g.frame(" "); g.rect(1, 6, 3, 10, "."); g.sprinkle("T", 8, "."); g.rect(16, 5, 18, 11, " "); g.line(16, 8, 18, 8, "="); g.sprinkle("^", 5, "."); } },
    ] },
    { id: "warehouse", name: "Warehouses", habitat: "warehouse", floor: ".", variants: [
      { name: "Cargo Warehouse", intro: "Shelves stacked to the ceiling with crates stamped HALCYON. Forklifts parked at angles that suggest a hurry.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); for (let y = 3; y < H - 2; y += 3) for (let x = 5; x < W - 4; x++) if (x % 8 !== 0) g.set(x, y, "T"); g.set(0, 8, "+"); } },
      { name: "Cold Storage", intro: "Frost on everything. Meat hooks. Rows of freezers humming. Your breath fogs. So does something else's.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); house(g, 4, 1, 11, 6, "s"); house(g, 15, 1, 22, 6, "s"); house(g, 6, 9, 13, 14, "n"); house(g, 17, 9, 24, 14, "n"); g.sprinkle(";", 8, "."); } },
      { name: "Container Yard", intro: "Shipping containers stacked three high, cranes frozen mid-swing. A maze made of other people's stuff.", draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); for (let i = 0; i < 9; i++) { const x = 3 + (i % 3) * 8 + Math.floor(g.r() * 2), y = 2 + Math.floor(i / 3) * 4 + Math.floor(g.r() * 2); g.rect(x, y, x + 4, y + 1, "#"); } } },
      { name: "Factory Floor", intro: "Conveyor belts still running with nobody to run them. Robotic arms twitch. Vats bubble with something that eats boots.", hazard: acidHz, draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); g.line(3, 4, 24, 4, "="); g.line(3, 11, 24, 11, "="); for (const x of [6, 13, 20]) { g.set(x, 3, "T"); g.set(x + 2, 12, "T"); } g.disc(9, 8, 1.2, "%"); g.disc(19, 8, 1.2, "%"); } },
    ] },
  ],
};

// ---------------------------------------------------------------- landmarks

interface Landmark {
  id: string; name: string; habitat: string; intro: string; preset: string; time?: TimeOfDay; weather?: Weather;
  draw: (g: Grid) => void;
  /** where the keeper stands, and the bosses that can play them by party level (weakest first) */
  keeper: { at: [number, number]; name: string; glyph: string; color: string; persona: string; byLevel: string[] };
  greeting: string;
  options: (lvl: number) => { label: string; actions: ActionDef[] }[];
  hazard?: SceneDef["hazard"];
}

const fight = (text: string): ActionDef[] => [{ do: "narrate", text }, { do: "spawn", group: "guards" }, { do: "hostile", group: "keeper" }, { do: "combat" }];

export const LANDMARKS: Record<CampaignId, Landmark[]> = {
  realm: [
    { id: "wizardtower", name: "The Crooked Tower", habitat: "wizardtower", preset: "wizardtower", time: "dusk",
      intro: "A wizard's tower leans over the road like a drunk over a bar. Books flap around its top like bats. A sign on the door: 'NO SOLICITORS. NO ADVENTURERS. ESPECIALLY NO ADVENTURERS.'",
      draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = ","; g.frame("T"); g.disc(15, 8, 6, "#"); g.disc(15, 8, 5, "."); g.set(7, 8, "+"); g.set(8, 8, "."); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.set(Math.round(15 + Math.cos(a) * 5.5), Math.round(8 + Math.sin(a) * 3.6), "T"); } g.set(15, 8, "^"); g.sprinkle(";", 5, ","); },
      keeper: { at: [17, 8], name: "Magister Quillon", glyph: "🧙‍♂️", color: "#6a3aa8", persona: "A paranoid, brilliant, extremely tired wizard who thinks everyone is here to steal his research (most are). Speaks fast, offers deals, hates interruptions.", byLevel: ["r_novice", "r_hedgewitch", "r_evoker", "r_evoker", "r_flameskull", "r_magus", "r_magus", "r_magus", "r_archlich", "r_archlich"] },
      greeting: "Magister Quillon leans out of a window: \"If you're here about the explosion, it wasn't me. If you're here to rob me, I have wards. If you're here to buy, come in. Wipe your feet.\"",
      options: (lvl) => [
        { label: "Fight the wizard for his treasure", actions: fight("You draw steel. Quillon sighs the sigh of a man who has done this before, and the tower's furniture comes alive.") },
        { label: "Persuade him to share his research", actions: [{ do: "check", skill: "persuasion", dc: 10 + lvl, reason: "Talk Quillon into sharing", success: [{ do: "say", npc: "Magister Quillon", text: "Fine. FINE. Take this and go away. And tell nobody where my tower is. It moves, anyway." }, { do: "loot", itemId: "potion", qty: 2 }, { do: "xp", amount: 50 * lvl }, { do: "addFlag", key: "reputation", amount: 1 }], fail: [{ do: "say", npc: "Magister Quillon", text: "Flattery! The oldest attack in the book. Out!" }, { do: "trap", damage: `${Math.ceil(lvl / 2) + 1}d6`, type: "force", save: "dex", dc: 10 + Math.ceil(lvl / 2), text: "A ward slams you back out the door." }] }] },
        { label: "Sneak in and rob the library", actions: [{ do: "check", skill: "stealth", dc: 11 + lvl, reason: "Sneak past the wards", success: [{ do: "narrate", text: "You slip in, grab a fistful of potions and a jar of gold, and slip out. Somewhere upstairs, a wizard sneezes." }, { do: "loot", gold: 30 * lvl }, { do: "loot", itemId: "potion", qty: 1 }, { do: "addFlag", key: "crimes", amount: 1 }], fail: fight("A floorboard creaks. Every candle in the tower turns to face you. \"THIEVES!\"") }] },
        { label: "Leave him to his books", actions: [{ do: "narrate", text: "You leave the wizard in peace. From the tower, faintly: \"...thank you.\"" }] },
      ] },
    { id: "banditcamp", name: "Bandit Camp", habitat: "banditcamp", preset: "banditcamp", time: "night",
      intro: "Campfires behind a palisade of sharpened logs, laughter, a lute played badly. A bandit camp, and the road runs right past its gate.",
      draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = ","; g.frame("T"); g.box(10, 2, 25, 13, "#", "."); g.set(10, 8, "+"); g.set(10, 7, "+"); g.rect(13, 3, 15, 4, "T"); g.rect(20, 3, 22, 4, "T"); g.rect(13, 11, 15, 12, "T"); g.rect(20, 11, 22, 12, "T"); g.set(18, 8, "%"); g.sprinkle("T", 5, ",", [1, 1, 8, 14]); },
      hazard: { name: "Campfire", damage: "1d6", type: "fire", save: "dex", dc: 10 },
      keeper: { at: [20, 7], name: "Red Mags", glyph: "🏴‍☠️", color: "#8a3a3a", persona: "Bandit chief, ex-soldier, charming and practical. Prefers tolls to killing; respects strength and good jokes. Will hire competent people.", byLevel: ["r_bandit", "r_deserter", "r_banditcap", "r_banditcap", "r_sellsword", "r_baron", "r_baron", "r_champion", "r_champion", "r_deathknight"] },
      greeting: "Red Mags walks to the gate, axe on her shoulder: \"Toll road, friends. Ten coin a head, or entertain us, or bleed. Your choice. I'm flexible.\"",
      options: (lvl) => [
        { label: "Pay the toll", actions: [{ do: "loot", gold: -10 * lvl }, { do: "say", npc: "Red Mags", text: "Pleasure doing business. Safe roads — we'll make sure of it. For a week." }] },
        { label: "Attack the camp", actions: fight("Steel comes out. Red Mags grins. \"I was hoping you'd say that.\"") },
        { label: "Challenge Mags to a drinking contest", actions: [{ do: "check", skill: "con", dc: 11 + lvl, reason: "Out-drink a bandit chief", success: [{ do: "say", npc: "Red Mags", text: "You... *hic*... magnificent... take the pot. Take my HAT." }, { do: "loot", gold: 20 * lvl }, { do: "addFlag", key: "reputation", amount: 1 }], fail: [{ do: "narrate", text: "You wake up at dawn in a ditch, lighter by one purse and one boot. Mags left a note: 'Thanks for the boot.'" }, { do: "loot", gold: -5 * lvl }] }] },
        { label: "Join them for a night (and steal their payroll)", actions: [{ do: "check", skill: "deception", dc: 12 + lvl, reason: "Pass as a fellow outlaw", success: [{ do: "narrate", text: "You drink, sing and lie your way into the payroll tent. By dawn you're gone and so is the strongbox." }, { do: "loot", gold: 40 * lvl }, { do: "addFlag", key: "crimes", amount: 1 }], fail: fight("\"Wait... those aren't our boots.\" Knives come out.") }] },
      ] },
    { id: "graveyard", name: "The Forgotten Graveyard", habitat: "graveyard", preset: "graveyard", time: "night", weather: "fog",
      intro: "A graveyard with no village to go with it. The headstones are new. The graves are open. The gravedigger is still digging, humming.",
      draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = ","; g.frame("T"); for (let x = 5; x < 22; x += 2) for (let y = 3; y < 14; y += 3) if (g.r() < 0.7) g.set(x, y, g.r() < 0.3 ? "^" : "T"); house(g, 21, 5, 26, 10, "w", "#", "."); g.sprinkle(";", 6, ","); },
      keeper: { at: [17, 8], name: "Old Ebb the Gravedigger", glyph: "⚰️", color: "#5a5040", persona: "A cheerful, ancient gravedigger who may be a necromancer, may be dead himself, and is definitely digging graves for you. Polite to a fault.", byLevel: ["r_graverobber", "r_ghoul", "r_ghast", "r_wight", "r_ghost", "r_wraith", "r_wraith", "r_graveknight", "r_archlich", "r_archlich"] },
      greeting: "Old Ebb leans on his spade: \"Evening! You'll want to lie down soon. I've measured you all. Lovely bones, very lovely.\"",
      options: (lvl) => [
        { label: "Put him and his dead down", actions: fight("You attack. The open graves answer before Ebb does.") },
        { label: "Lay the dead to rest with prayers", actions: [{ do: "check", skill: "religion", dc: 10 + lvl, reason: "Bless the graves", success: [{ do: "narrate", text: "Your prayer rolls across the graves. The earth settles. Old Ebb blinks, smiles, and crumbles into dust with a grateful sigh." }, { do: "xp", amount: 60 * lvl }, { do: "loot", gold: 15 * lvl }], fail: fight("The prayer catches in your throat. The dead take it as an insult.") }] },
        { label: "Ask what he's digging for", actions: [{ do: "check", skill: "insight", dc: 9 + lvl, reason: "Read the gravedigger", success: [{ do: "say", npc: "Old Ebb the Gravedigger", text: "Treasure! Buried with a king, wasn't it. Help me dig and we'll split it." }, { do: "loot", gold: 25 * lvl }], fail: [{ do: "say", npc: "Old Ebb the Gravedigger", text: "For you, dearie. Always for you." }, ...fight("He whistles. Something climbs out of the nearest hole.")] }] },
        { label: "Walk on, quickly", actions: [{ do: "narrate", text: "You walk on. Behind you, the humming continues, and you could swear it's getting closer." }] },
      ] },
  ],
  hollow: [
    { id: "colosseum", name: "The Fool's Pit", habitat: "colosseum", preset: "colosseum",
      intro: "An arena carved from a beetle's skull, packed with screaming bugs. A banner reads 'TRIAL OF FOOLS: GLORY OR DEATH (OR BOTH)'. A herald spots you. Oh no.",
      draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = ";"; g.frame("#"); g.disc(15, 8, 6, "#"); g.disc(15, 8, 5, "."); g.rect(2, 7, 9, 9, "."); g.set(8, 8, "/"); g.set(15, 8, "^"); },
      keeper: { at: [18, 8], name: "The Pit Herald", glyph: "📯", color: "#c8a83a", persona: "A pompous herald-beetle who lives for spectacle. Loves underdogs, betting and theatrical deaths.", byLevel: ["h_pitbrawler", "h_gladiator", "h_gladiator", "h_pitchampion", "h_mantisduelist", "h_beetlecolossus", "h_mantisqueen", "h_gladiatorking", "h_gladiatorking", "h_gladiatorking"] },
      greeting: "The Pit Herald trumpets: \"FRESH FOOLS! Will you fight for glory, or will you be fed to the crowd? The crowd prefers the second!\"",
      options: (lvl) => [
        { label: "Fight in the trial", actions: fight("The gate slams. The crowd roars. The champion steps out, and the herald steps back, bowing.") },
        { label: "Bet on yourselves and work the crowd", actions: [{ do: "check", skill: "performance", dc: 10 + lvl, reason: "Win the crowd before the fight", success: [{ do: "narrate", text: "The crowd loves you. They throw geo. They throw flowers. The champion sulks off. You win by popularity." }, { do: "loot", gold: 30 * lvl }, { do: "xp", amount: 50 * lvl }], fail: fight("The crowd boos. A rotten fruit hits you. Then the champion does.") }] },
        { label: "Bribe the herald to skip you", actions: [{ do: "loot", gold: -8 * lvl }, { do: "say", npc: "The Pit Herald", text: "Ahem! These fools are... VERY sick. Contagious. Next!" }] },
      ] },
    { id: "station", name: "The Last Station", habitat: "station", preset: "station",
      intro: "A tram station of the old kingdom. The benches are full of shells still waiting for a tram that stopped running before they died. A bell hangs above the platform.",
      draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); g.rect(1, 10, 26, 14, " "); g.line(1, 11, 26, 11, "="); g.line(1, 13, 26, 13, "="); for (let x = 4; x < W - 2; x += 5) g.set(x, 3, "T"); g.rect(9, 6, 11, 6, ";"); g.rect(17, 6, 19, 6, ";"); g.box(20, 1, 26, 5, "#", "."); g.set(23, 5, "+"); },
      keeper: { at: [14, 7], name: "The Stationmaster", glyph: "🔔", color: "#c8d8e8", persona: "The ghost of the stationmaster, punctual, polite and unaware he is dead. Wants to see one last tram arrive.", byLevel: ["h_shell", "h_shellknight", "h_tram", "h_bloomknight", "h_stationmaster", "h_bloomprophet", "h_soulwisp", "h_soulwisp", "h_bloomcolossus", "h_bloomcolossus"] },
      greeting: "A ghostly beetle in a cap checks a stopped pocket-watch: \"Tickets, please. The tram is late. The tram is always late. It has been late for ninety years.\"",
      options: (lvl) => [
        { label: "Ring the bell to call the last tram", actions: [{ do: "check", skill: "arcana", dc: 10 + lvl, reason: "Wake the old tram line", success: [{ do: "narrate", text: "The bell rings. Far away, a light. A ghost tram glides in, and every waiting shell stands, boards, and is gone. The Stationmaster tips his cap and boards last." }, { do: "xp", amount: 70 * lvl }, { do: "loot", gold: 20 * lvl }], fail: fight("The bell cracks. The waiting shells turn, very slowly, to look at you.") }] },
        { label: "Tell him the truth: he's dead", actions: [{ do: "check", skill: "persuasion", dc: 11 + lvl, reason: "Break it to a ghost gently", success: [{ do: "say", npc: "The Stationmaster", text: "Ah. Ah. That explains the service. Thank you, travellers. Take the ticket office's float. I won't need it." }, { do: "loot", gold: 25 * lvl }], fail: fight("\"DEAD? I have NEVER missed a shift!\" The station's lanterns flare.") }] },
        { label: "Loot the ticket office", actions: [{ do: "loot", gold: 15 * lvl }, ...fight("\"STOP! THIEF! Fare dodger!\" The shells on the benches rise.")] },
      ] },
    { id: "hive", name: "The Wild Hive", habitat: "hive", preset: "hive",
      intro: "Honey-gold light spills from a hive grown into the cave wall. The air buzzes. Somewhere inside, something hums a lullaby to ten thousand children.",
      draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "#"; const cells: [number, number][] = [[4, 8], [9, 4], [9, 12], [14, 8], [19, 4], [19, 12], [23, 8]]; for (const [x, y] of cells) g.disc(x, y, 2.2, "."); for (let i = 1; i < cells.length; i++) g.line(cells[i - 1][0], cells[i - 1][1], cells[i][0], cells[i][1], "."); g.line(1, 8, 4, 8, "."); g.sprinkle(";", 8, "."); },
      keeper: { at: [19, 8], name: "Queen Hum", glyph: "👑", color: "#e8c84a", persona: "A drowsy, motherly hive queen who speaks in a chorus. Fiercely protective; open to trades of sweet things, songs and promises.", byLevel: ["h_drone", "h_wasp", "h_hornet", "h_queenguard", "h_royalwasp", "h_hivequeen", "h_hivequeen", "h_hivequeen", "h_hivemind", "h_hivemind"] },
      greeting: "Ten thousand voices hum as one: \"Little walkers. You smell of the surface. Have you brought us anything sweet?\"",
      options: (lvl) => [
        { label: "Raid the hive for royal honey", actions: fight("You reach for the honey. Ten thousand wings stop. Then start, much louder.") },
        { label: "Trade a song for honey", actions: [{ do: "check", skill: "performance", dc: 10 + lvl, reason: "Sing for the hive", success: [{ do: "narrate", text: "The hive hums along. When you finish, a drone carries out a comb of royal honey, still warm." }, { do: "loot", itemId: "potion", qty: 2 }, { do: "addFlag", key: "reputation", amount: 1 }], fail: [{ do: "narrate", text: "The hive does not like the song. It asks you, very politely, to leave. The stings are less polite." }, { do: "trap", damage: `${Math.ceil(lvl / 2)}d6`, type: "poison", save: "con", dc: 10 + Math.ceil(lvl / 2), text: "Warning stings!" }] }] },
        { label: "Back away slowly", actions: [{ do: "narrate", text: "You back away. The humming follows you for a mile, like a lullaby you'll never get out of your head." }] },
      ] },
  ],
  neon: [
    { id: "clinic", name: "Doc Ocho's Clinic", habitat: "clinic", preset: "clinic",
      intro: "A ripperdoc clinic behind a noodle shop: flickering surgical lights, a waiting room full of people missing parts, and a sign: 'NO REFUNDS ON LIMBS'.",
      draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); g.line(9, 1, 9, 14, "#"); g.set(9, 8, "+"); g.line(18, 1, 18, 14, "#"); g.set(18, 4, "+"); g.set(18, 12, "+"); g.line(18, 8, 26, 8, "#"); g.rect(3, 3, 6, 3, "T"); g.rect(3, 12, 6, 12, "T"); g.set(13, 6, "T"); g.set(13, 10, "T"); g.set(22, 4, "T"); g.set(22, 12, "%"); },
      hazard: acidHz,
      keeper: { at: [14, 8], name: "Doc Ocho", glyph: "🩺", color: "#e8e8e8", persona: "An eight-armed ripperdoc, cheerful, unlicensed and brilliant. Does anything for money, and some things for fun. Has organs in the fridge next to his lunch.", byLevel: ["n_nurse", "n_medtech", "n_ripper", "n_ripperdoc", "n_doc", "n_doc", "n_reaper", "n_reaper", "n_mindbreaker", "n_mindbreaker"] },
      greeting: "Doc Ocho waves four hands and points with two more: \"Customers! New eyes? New lungs? Discount on kidneys this week. Don't ask why.\"",
      options: (lvl) => [
        { label: "Buy a back-alley patch-up", actions: [{ do: "loot", gold: -6 * lvl }, { do: "heal", amount: `${lvl + 2}d8` }, { do: "say", npc: "Doc Ocho", text: "All done! Mostly your own parts. Mostly." }] },
        { label: "Shake him down for his drug stash", actions: [{ do: "check", skill: "intimidation", dc: 11 + lvl, reason: "Lean on a ripperdoc", success: [{ do: "narrate", text: "Doc Ocho raises all eight hands. You leave with a case of stims and a deep, lasting distrust of hospitals." }, { do: "loot", itemId: "potion", qty: 2 }, { do: "addFlag", key: "crimes", amount: 1 }], fail: fight("\"Rude.\" He presses a button. The waiting room stands up. They're all chrome underneath.") }] },
        { label: "Report him to the corps (and collect the bounty)", actions: [{ do: "loot", gold: 25 * lvl }, { do: "addFlag", key: "corpFavour", amount: 1 }, ...fight("Doc Ocho reads your face. \"Oh, you didn't.\" The scalpels come out.")] },
        { label: "Leave before he looks at your kidneys", actions: [{ do: "narrate", text: "You back out. He calls after you: \"Come back when you're broken!\"" }] },
      ] },
    { id: "arcade", name: "The Glitch Arcade", habitat: "arcade", preset: "arcade",
      intro: "An arcade where the cabinets play themselves. Rumour says the high-score table is haunted, and that beating it pays out in real cred.",
      draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); for (let y = 3; y < 13; y += 3) for (let x = 4; x < 22; x += 2) if (x % 6 !== 0) g.set(x, y, "T"); g.box(22, 1, 26, 6, "#", "."); g.set(22, 4, "+"); g.rect(23, 11, 25, 12, "T"); },
      keeper: { at: [14, 7], name: "HI-SCORE", glyph: "👾", color: "#ff3aff", persona: "A rogue arcade AI that speaks in 8-bit catchphrases. Wants to be beaten fairly at least once before it's deleted. Cheats a lot anyway.", byLevel: ["n_gremlin", "n_hacker", "n_slicer", "n_glitch", "n_technomancer", "n_aihost", "n_netghost", "n_netghost", "n_mindbreaker", "n_mindbreaker"] },
      greeting: "Every screen shows the same pixel face: \"INSERT COIN. PLAYER ONE: READY? HIGH SCORE TO BEAT: 9,999,999. NO CONTINUES.\"",
      options: (lvl) => [
        { label: "Beat the high score", actions: [{ do: "check", skill: "dex", dc: 11 + lvl, reason: "Beat the haunted high score", success: [{ do: "narrate", text: "NEW HIGH SCORE. The arcade erupts in confetti. Real cred pours out of the coin slots." }, { do: "loot", gold: 30 * lvl }, { do: "xp", amount: 50 * lvl }], fail: fight("GAME OVER. The cabinets' screens crack open and something crawls out of each one.") }] },
        { label: "Hack the cabinets", actions: [{ do: "check", skill: "int", dc: 12 + lvl, reason: "Hack a haunted arcade", success: [{ do: "narrate", text: "You crack it. Every cabinet pays out at once. HI-SCORE says 'GG' and logs off forever." }, { do: "loot", gold: 40 * lvl }, { do: "addFlag", key: "crimes", amount: 1 }], fail: fight("CHEATER DETECTED. INITIATING BOSS FIGHT.") }] },
        { label: "Unplug it", actions: fight("You reach for the plug. HI-SCORE: \"NO. NO. NO. NO.\"") },
      ] },
    { id: "landfill", name: "The Heap", habitat: "landfill", preset: "landfill", weather: "rain",
      intro: "A mountain of the city's trash, steaming in the acid rain. Scavengers pick through it. A throne of fridges sits on the top, and someone is sitting on it.",
      draw: (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) g.t[y][x] = "."; g.frame("#"); g.blobs("^", 8, 1, 2.2, "."); g.blobs("T", 5, 1, 1.5, ".^"); g.disc(19, 8, 2.5, "^"); g.set(19, 8, "."); g.sprinkle("%", 4, "."); },
      hazard: acidHz,
      keeper: { at: [19, 7], name: "King Scrap", glyph: "👑", color: "#8a7a3a", persona: "Self-crowned king of the landfill, wears a hubcap crown. Generous, paranoid, trades salvage for news and favours, hates the corps.", byLevel: ["n_scav", "n_scrapdog", "n_scrapgolem", "n_scrapper", "n_dumpsterking", "n_compactor", "n_abomination", "n_abomination", "n_titan", "n_titan"] },
      greeting: "King Scrap bangs a pipe on his fridge-throne: \"Visitors to the kingdom! Trade, tribute, or tribute in the form of trade!\"",
      options: (lvl) => [
        { label: "Trade news of the corps for salvage", actions: [{ do: "check", skill: "persuasion", dc: 10 + lvl, reason: "Sell the King a good story", success: [{ do: "say", npc: "King Scrap", text: "Ha! The corps will hate that. Take your pick of the treasury!" }, { do: "loot", gold: 20 * lvl }, { do: "loot", itemId: "potion", qty: 1 }], fail: [{ do: "say", npc: "King Scrap", text: "Old news! Bah. Here, have a broken toaster." }] }] },
        { label: "Overthrow the King", actions: fight("You climb the heap. The King stands. The heap stands with him.") },
        { label: "Scavenge on your own", actions: [{ do: "random", dice: "1d20", label: "What's in the trash?", outcomes: [{ min: 1, max: 6, actions: [{ do: "trap", damage: `${Math.ceil(lvl / 2)}d6`, type: "acid", save: "dex", dc: 11, text: "A leaking battery bursts." }] }, { min: 7, max: 16, actions: [{ do: "loot", gold: 10 * lvl }] }, { min: 17, max: 20, actions: [{ do: "loot", itemId: "potion", qty: 2 }, { do: "loot", gold: 20 * lvl }] }] }] },
      ] },
  ],
};

// ---------------------------------------------------------------- roadside events

interface Traveller { name: string; glyph: string; color: string; persona: string; prompt: string; options: (lvl: number) => { label: string; actions: ActionDef[] }[] }

const TRAVELLERS: Record<CampaignId, Traveller[]> = {
  realm: [
    { name: "Wounded Pilgrim", glyph: "🧎", color: "#c8b08a", persona: "A pilgrim bleeding from an arrow wound, clutching a reliquary. Grateful, devout, a terrible liar about what's in the box.", prompt: "A wounded pilgrim waves you down, an arrow in his leg and a silver reliquary in his arms.",
      options: (l) => [
        { label: "Patch him up", actions: [{ do: "check", skill: "medicine", dc: 11, reason: "Treat the arrow wound", success: [{ do: "say", npc: "Wounded Pilgrim", text: "Bless you. Take this — it was blessed by a saint. Or a man called Saint. Either way." }, { do: "loot", itemId: "potion", qty: 1 }, { do: "addFlag", key: "reputation", amount: 1 }], fail: [{ do: "narrate", text: "You pull the arrow. He faints. When he wakes he thanks you anyway, bravely, and limps off pale as milk." }] }] },
        { label: "Take the reliquary", actions: [{ do: "loot", gold: 25 * l }, { do: "addFlag", key: "crimes", amount: 1 }, { do: "narrate", text: "He doesn't fight. He just watches you go, and starts praying. Loudly. With your descriptions." }] },
        { label: "Leave him", actions: [{ do: "narrate", text: "You walk on. Behind you he calls out to the next travellers. They are not as kind as you weren't." }] },
      ] },
    { name: "Travelling Tinker", glyph: "🧳", color: "#a8743a", persona: "A fast-talking tinker with a mule named Trouble. Sells 'genuine' artefacts, gossip and directions, all of questionable value.", prompt: "A tinker's cart blocks the road. \"Bargains! Gossip! Directions! Only one of those is free!\"",
      options: (l) => [
        { label: "Buy a 'lucky charm'", actions: [{ do: "loot", gold: -5 * l }, { do: "random", dice: "1d6", label: "Is it actually lucky?", outcomes: [{ min: 1, max: 4, actions: [{ do: "narrate", text: "It's a painted chicken bone. Lucky for the tinker." }] }, { min: 5, max: 6, actions: [{ do: "narrate", text: "It hums in your hand. Huh. It works." }, { do: "loot", itemId: "potion", qty: 1 }] }] }] },
        { label: "Ask for gossip", actions: [{ do: "ai", direction: "The tinker shares a rumour about the party's current quest, half true and half wildly exaggerated.", fallback: [{ do: "say", npc: "Travelling Tinker", text: "They say the dead walk more than they used to. And a dragon's been buying real estate. Anyway. Bargains?" }] }] },
        { label: "Rob the tinker", actions: [{ do: "loot", gold: 15 * l }, { do: "addFlag", key: "crimes", amount: 1 }, { do: "narrate", text: "Trouble the mule bites someone on the way out. Justice, of a sort." }, { do: "trap", damage: "1d4", type: "piercing", save: "dex", dc: 12, text: "The mule bites!" }] },
      ] },
  ],
  hollow: [
    { name: "Lost Grubling", glyph: "🐛", color: "#e8d8a8", persona: "A tiny, frightened grub who got separated from its family. Speaks in squeaks, very brave, very hungry.", prompt: "A tiny grub squeaks from under a rock: \"Are you... are you going home? Can I come?\"",
      options: (l) => [
        { label: "Carry it to safety", actions: [{ do: "narrate", text: "The grub rides in someone's pack, squeaking happily. Later, its family finds you and showers you with gifts." }, { do: "loot", gold: 15 * l }, { do: "addFlag", key: "reputation", amount: 1 }] },
        { label: "Eat it (it's been a long day)", actions: [{ do: "heal", amount: "1d8" }, { do: "addFlag", key: "crimes", amount: 1 }, { do: "narrate", text: "It's surprisingly filling. It's surprisingly hard to look each other in the eye afterwards." }] },
        { label: "Point it the right way and move on", actions: [{ do: "narrate", text: "It waves goodbye with all its tiny legs. You will think about it later, at night." }] },
      ] },
    { name: "Shell Merchant", glyph: "🐌", color: "#c8a87a", persona: "A slow snail-merchant who carries his whole shop on his back. Takes geo, trades charms, never rushes.", prompt: "A snail merchant inches across your path. \"Waaares... fiiine waaares...\"",
      options: (l) => [
        { label: "Buy a healing tonic", actions: [{ do: "loot", gold: -6 * l }, { do: "loot", itemId: "potion", qty: 1 }] },
        { label: "Help him across the tunnel (it'll take a while)", actions: [{ do: "narrate", text: "Twenty minutes later he's across. He gives you a tip: a geo coin and a tip about a hidden path." }, { do: "loot", gold: 10 * l }, { do: "xp", amount: 25 * l }] },
        { label: "Steal his shell-shop", actions: [{ do: "check", skill: "athletics", dc: 13, reason: "Lift a whole shop", success: [{ do: "loot", gold: 30 * l }, { do: "addFlag", key: "crimes", amount: 1 }], fail: [{ do: "narrate", text: "It's heavier than it looks. He watches you struggle with infinite patience until you give up." }] }] },
      ] },
  ],
  neon: [
    { name: "Courier in Trouble", glyph: "🛵", color: "#3ac8e6", persona: "A teenage courier with a crashed scooter and a package everyone seems to want. Talks fast, scared, cheeky.", prompt: "A courier kid limps out of a crashed scooter, clutching a package. \"Hey! Hey! You look like you can fight. Want a job?\"",
      options: (l) => [
        { label: "Protect the kid", actions: [{ do: "narrate", text: "You walk the kid to the drop. They tip well, in cred and in gratitude." }, { do: "loot", gold: 20 * l }, { do: "addFlag", key: "reputation", amount: 1 }] },
        { label: "Take the package", actions: [{ do: "loot", gold: 30 * l }, { do: "addFlag", key: "crimes", amount: 1 }, { do: "narrate", text: "The package buzzes. It's still buzzing. You decide not to think about it." }] },
        { label: "Open the package", actions: [{ do: "random", dice: "1d6", label: "What's inside?", outcomes: [{ min: 1, max: 2, actions: [{ do: "trap", damage: `${Math.ceil(l / 2) + 1}d6`, type: "fire", save: "dex", dc: 12, text: "It was a bomb. Of course it was a bomb." }] }, { min: 3, max: 5, actions: [{ do: "loot", itemId: "potion", qty: 2 }] }, { min: 6, max: 6, actions: [{ do: "narrate", text: "It's a kitten. A cyber-kitten. It is now yours." }, { do: "flag", key: "cyberKitten", value: true }] }] }] },
      ] },
    { name: "Street Preacher", glyph: "📢", color: "#ff8a3a", persona: "A street preacher of the Church of the Last Upload, convinced the singularity is next Tuesday. Kind, unhinged, well informed about local crime.", prompt: "A preacher on a crate shouts through a cracked megaphone: \"REPENT! UPLOAD! OR AT LEAST TIP!\"",
      options: (l) => [
        { label: "Donate for a blessing", actions: [{ do: "loot", gold: -3 * l }, { do: "heal", amount: "2d6" }, { do: "say", npc: "Street Preacher", text: "May your firmware never brick." }] },
        { label: "Ask what's happening on the streets", actions: [{ do: "ai", direction: "The preacher shares a paranoid but useful rumour about the party's current target or a gang nearby.", fallback: [{ do: "say", npc: "Street Preacher", text: "The Tower watches! The drones count! And the noodles at the Lucky Ladle are 40% soy!" }] }] },
        { label: "Heckle him", actions: [{ do: "check", skill: "performance", dc: 12, reason: "Out-shout a preacher", success: [{ do: "narrate", text: "The crowd cheers for you. Someone throws a coin. The preacher bows out gracefully." }, { do: "loot", gold: 5 * l }], fail: [{ do: "narrate", text: "He out-shouts you. The crowd turns on you. Somebody throws a noodle cup." }] }] },
      ] },
  ],
};

// ---------------------------------------------------------------- world maps

export interface Place { id: string; name: string; x: number; y: number; scenes: string[]; terrain: string; desc: string }
export interface WorldMapDef { title: string; places: Place[]; roads: [string, string][] }

export const WORLD_MAPS: Record<CampaignId, WorldMapDef> = {
  realm: {
    title: "The Vale of Thornwick",
    places: [
      { id: "road", name: "Thornwick Road", x: 12, y: 58, scenes: ["road"], terrain: "woods", desc: "The forest road where it all began." },
      { id: "thornwick", name: "Thornwick", x: 26, y: 48, scenes: ["village", "crypt", "ossuary"], terrain: "meadow", desc: "A small village with a big bell and bigger secrets." },
      { id: "blackfang", name: "Blackfang Den", x: 22, y: 26, scenes: ["den"], terrain: "woods", desc: "The wolf-raiders' lair in the old forest." },
      { id: "greywater", name: "Greywater Fens", x: 46, y: 70, scenes: ["causeway", "hut"], terrain: "bog", desc: "A causeway through endless marsh." },
      { id: "stilthaven", name: "Stilthaven", x: 58, y: 80, scenes: ["stilthaven"], terrain: "bog", desc: "A town on stilts above the marsh." },
      { id: "ironjaw", name: "Ironjaw Hold", x: 58, y: 36, scenes: ["ironjaw"], terrain: "highland", desc: "A fortress cut into the hills." },
      { id: "pass", name: "The Giant's Stair", x: 72, y: 22, scenes: ["pass"], terrain: "highland", desc: "A mountain pass of giant-sized steps." },
      { id: "abbey", name: "The Sunken Abbey", x: 76, y: 60, scenes: ["abbey"], terrain: "bog", desc: "An abbey half drowned in a lake." },
      { id: "roost", name: "Verdigris's Roost", x: 88, y: 14, scenes: ["roost"], terrain: "highland", desc: "A green dragon's crater." },
      { id: "barrow", name: "The Barrow of Kings", x: 88, y: 44, scenes: ["barrow", "throne"], terrain: "meadow", desc: "The tomb of the hollow king." },
    ],
    roads: [["road", "thornwick"], ["thornwick", "blackfang"], ["thornwick", "greywater"], ["greywater", "stilthaven"], ["thornwick", "ironjaw"], ["ironjaw", "pass"], ["stilthaven", "abbey"], ["abbey", "barrow"], ["pass", "roost"], ["roost", "barrow"], ["ironjaw", "abbey"]],
  },
  hollow: {
    title: "The Underkingdom",
    places: [
      { id: "crossing", name: "Mossgrot Crossing", x: 10, y: 20, scenes: ["crossing"], terrain: "tunnels", desc: "Where travellers first come down." },
      { id: "lanternrest", name: "Lanternrest", x: 26, y: 30, scenes: ["lanternrest"], terrain: "tunnels", desc: "The last lit town." },
      { id: "fungal", name: "Fungal Wastes", x: 20, y: 56, scenes: ["fungal"], terrain: "fungus", desc: "Mushroom forests and spore storms." },
      { id: "gallery", name: "Mantis Gallery", x: 42, y: 18, scenes: ["gallery"], terrain: "thorns", desc: "The mantis tribes' proving grounds." },
      { id: "aqueducts", name: "Weeping Aqueducts", x: 44, y: 54, scenes: ["aqueducts"], terrain: "lake", desc: "Old waterworks, always raining." },
      { id: "silkhollow", name: "Silkhollow", x: 62, y: 72, scenes: ["silkhollow"], terrain: "thorns", desc: "A city of webs." },
      { id: "bridge", name: "Withered Bridge", x: 60, y: 40, scenes: ["bridge"], terrain: "tunnels", desc: "The great bridge over the abyss." },
      { id: "crystal", name: "Crystal Deeps", x: 74, y: 56, scenes: ["crystal"], terrain: "tunnels", desc: "Singing crystal mines." },
      { id: "gardens", name: "Queen's Gardens", x: 78, y: 28, scenes: ["gardens"], terrain: "thorns", desc: "Overgrown royal gardens." },
      { id: "palace", name: "The Pale Palace", x: 88, y: 46, scenes: ["knight"], terrain: "lake", desc: "Home of the Pale Knight." },
      { id: "heart", name: "Heart of the Bloom", x: 88, y: 80, scenes: ["heart", "root"], terrain: "fungus", desc: "Where the light began." },
    ],
    roads: [["crossing", "lanternrest"], ["lanternrest", "fungal"], ["lanternrest", "gallery"], ["fungal", "aqueducts"], ["gallery", "bridge"], ["aqueducts", "bridge"], ["aqueducts", "silkhollow"], ["bridge", "crystal"], ["bridge", "gardens"], ["crystal", "palace"], ["gardens", "palace"], ["silkhollow", "heart"], ["palace", "heart"]],
  },
  neon: {
    title: "Kessler City",
    places: [
      { id: "market", name: "Kessler Night Market", x: 18, y: 64, scenes: ["market", "noodlebar"], terrain: "alley", desc: "Food, chrome and rumours." },
      { id: "chopshop", name: "The Chop Shop", x: 12, y: 36, scenes: ["chopshop"], terrain: "warehouse", desc: "Stolen cars, stolen arms." },
      { id: "saintsden", name: "Chrome Cathedral", x: 34, y: 28, scenes: ["saintsden"], terrain: "alley", desc: "The Chrome Saints' church-turned-den." },
      { id: "drains", name: "Undercity Drains", x: 36, y: 82, scenes: ["drains"], terrain: "underpass", desc: "The city's guts." },
      { id: "datahaven", name: "The Data Haven", x: 54, y: 70, scenes: ["datahaven", "thenet"], terrain: "alley", desc: "A club where runners jack in." },
      { id: "docks", name: "Halcyon Docks", x: 74, y: 82, scenes: ["docks"], terrain: "warehouse", desc: "Container stacks and cranes." },
      { id: "tower", name: "Halcyon Tower", x: 78, y: 26, scenes: ["lobby", "labs", "executive", "vault", "core"], terrain: "rooftop", desc: "A hundred floors of corporate sin." },
    ],
    roads: [["market", "chopshop"], ["market", "saintsden"], ["chopshop", "saintsden"], ["market", "drains"], ["drains", "datahaven"], ["saintsden", "datahaven"], ["datahaven", "docks"], ["docks", "tower"], ["datahaven", "tower"]],
  },
};

export function placeOf(theme: CampaignId, sceneId: string): Place | undefined {
  return WORLD_MAPS[theme].places.find((p) => p.scenes.includes(sceneId));
}

// ---------------------------------------------------------------- encounter scenes

/** enc~kind~id~variant~level~seed~destination   (kind: t = terrain, l = landmark, e = roadside event) */
export function encounterId(kind: "t" | "l" | "e", id: string, variant: number, level: number, seed: number, dest: string) {
  return `enc~${kind}~${id}~${variant}~${level}~${seed}~${dest}`;
}
export const isEncounter = (sceneId: string) => sceneId.startsWith("enc~");

/** The story scene a save should resume at (encounters resume at their destination). */
export function resumableScene(sceneId: string, stashScene?: string) {
  if (!isEncounter(sceneId)) return sceneId;
  const dest = sceneId.split("~").slice(6).join("~");
  return dest === "@return" ? stashScene ?? "" : dest;
}

const cache = new Map<string, SceneDef>();

export function sceneDef(theme: CampaignId, sceneId: string): SceneDef | undefined {
  return CAMPAIGNS[theme].scenes[sceneId] ?? (isEncounter(sceneId) ? encounterScene(theme, sceneId) : undefined);
}

function destName(theme: CampaignId, dest: string) {
  if (dest === "@return") return "where you were";
  return CAMPAIGNS[theme].scenes[dest]?.title ?? "the road ahead";
}

export function encounterScene(theme: CampaignId, id: string): SceneDef | undefined {
  const hit = cache.get(id);
  if (hit) return hit;
  const [, kind, key, v, lv, sd, ...rest] = id.split("~");
  const dest = rest.join("~");
  const level = Number(lv) || 1, seed = Number(sd) || 1, variant = Number(v) || 0;
  const rng = seeded(seed);
  let scene: SceneDef | undefined;
  if (kind === "t" || kind === "e") scene = terrainScene(theme, id, key, variant, level, rng, dest, kind === "e");
  if (kind === "l") scene = landmarkScene(theme, id, key, level, rng, dest);
  if (scene) {
    // trigger ids are remembered for the whole campaign, so make this encounter's ids unique
    const pre = `e${seed}-`;
    for (const t of scene.triggers) t.id = pre + t.id;
    for (const m of Object.values(scene.marks)) if (m.type === "prop" && m.interact) m.interact = pre + m.interact;
    cache.set(id, scene);
  }
  return scene;
}

function finish(g: Grid, floor: string) {
  // start on the west edge, exit on the east edge, both connected
  const sy = 7 + Math.floor(g.r() * 2), ey = 6 + Math.floor(g.r() * 4);
  for (let y = sy - 1; y <= sy + 1; y++) for (let x = 1; x <= 2; x++) if (!WALK.has(g.get(x, y)) || g.get(x, y) === "~" || g.get(x, y) === "%") g.set(x, y, floor);
  g.set(W - 2, ey, floor); g.set(W - 3, ey, floor);
  connect(g, 1, sy, W - 2, ey, floor);
  return { sx: 1, sy, ex: W - 2, ey };
}

function freeSpots(g: Grid, from: [number, number], minX: number, taken: Set<number>, big = false) {
  const r = reach(g, from[0], from[1]);
  const out: [number, number][] = [];
  for (let y = 1; y < H - 1; y++) for (let x = minX; x < W - 2; x++) {
    const cells = big ? [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] : [[x, y]];
    if (cells.every(([cx, cy]) => OPEN.has(g.get(cx, cy)) && r.has(cy * W + cx) && !taken.has(cy * W + cx))) out.push([x, y]);
  }
  return out;
}

function placeMark(g: Grid, spots: [number, number][], ch: string, taken: Set<number>, big = false) {
  if (!spots.length) return false;
  const [x, y] = spots.splice(Math.floor(g.r() * spots.length), 1)[0];
  g.t[y][x] = ch;
  for (const [dx, dy] of big ? [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 0], [0, 2]] : [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) taken.add((y + dy) * W + x + dx);
  return true;
}

function common(theme: CampaignId, level: number, dest: string): { triggers: TriggerDef[]; marks: Record<string, MarkDef> } {
  return {
    marks: {
      S: { type: "start" },
      X: { type: "prop", kind: "path", name: dest === "@return" ? "Head back" : `Press on to ${destName(theme, dest)}`, interact: "onward" },
      K: { type: "prop", kind: "chest", name: theme === "neon" ? "Abandoned stash" : theme === "hollow" ? "Fallen traveller's pack" : "Abandoned pack", interact: "cache" },
    },
    triggers: [
      { id: "onward", when: { type: "interact" }, repeat: true, note: "Leave this encounter and continue the journey.", actions: [{ do: "scene", id: dest, direct: true }] },
      { id: "cache", when: { type: "interact" }, note: "Search a stash of supplies.", actions: [{ do: "check", skill: "investigation", dc: 10 + Math.floor(level / 2), reason: "Search the stash", success: [{ do: "random", dice: "1d6", label: "What's in the stash?", outcomes: [{ min: 1, max: 3, actions: [{ do: "loot", gold: 6 * level + 4 }] }, { min: 4, max: 5, actions: [{ do: "loot", itemId: "potion", qty: 1 }] }, { min: 6, max: 6, actions: [{ do: "loot", itemId: "potion", qty: 1 }, { do: "loot", gold: 12 * level }] }] }], fail: [{ do: "narrate", text: "Rags, a broken bottle and a note that just says 'don't'." }] }] },
    ],
  };
}

function terrainScene(theme: CampaignId, id: string, key: string, variant: number, level: number, rng: Rng, dest: string, event: boolean): SceneDef | undefined {
  const terrain = TERRAINS[theme].find((t) => t.id === key);
  if (!terrain) return;
  const vdef = terrain.variants[variant % terrain.variants.length];
  const g = new Grid(terrain.floor, rng);
  vdef.draw(g);
  const { sx, sy, ex, ey } = finish(g, terrain.floor);
  const taken = new Set<number>();
  for (let dy = -3; dy <= 3; dy++) for (let dx = 0; dx <= 6; dx++) taken.add((sy + dy) * W + sx + dx);
  g.t[sy][sx] = "S"; g.t[sy + (sy < H - 2 ? 1 : -1)][sx] = "S"; g.t[sy - 1][sx] = "S"; g.t[sy][sx + 1] = "S";
  g.t[ey][ex] = "X";
  taken.add(ey * W + ex);
  const c = common(theme, level, dest);
  const marks: Record<string, MarkDef> = { ...c.marks };
  const triggers: TriggerDef[] = [...c.triggers];
  // a stash somewhere off the beaten track
  placeMark(g, freeSpots(g, [sx, sy], 6, taken), "K", taken);
  let objective = `Get through ${vdef.name} and press on.`;
  let gmNotes = `Travel encounter on the way to ${destName(theme, dest)}. Terrain: ${terrain.name} (${vdef.name}).`;

  if (event) {
    const tr = TRAVELLERS[theme][Math.floor(rng() * TRAVELLERS[theme].length)];
    placeMark(g, freeSpots(g, [sx, sy], 9, taken).filter(([x]) => x < 18), "N", taken);
    marks.N = { type: "npc", name: tr.name, glyph: tr.glyph, color: tr.color, persona: tr.persona, group: "traveller" };
    let nx = 12, ny = 8;
    g.t.forEach((row, y) => row.forEach((ch, x) => { if (ch === "N") { nx = x; ny = y; } }));
    triggers.push({ id: "meet", when: { type: "enter", rect: [Math.max(1, nx - 4), Math.max(1, ny - 3), Math.min(W - 2, nx + 4), Math.min(H - 2, ny + 3)] }, note: `Meeting ${tr.name}.`, actions: [{ do: "narrate", text: tr.prompt }, { do: "choice", prompt: `${tr.name}: what do you do?`, options: tr.options(level) }] });
    objective = `Meet the stranger on the road, then press on.`;
    gmNotes += ` A roadside meeting with ${tr.name}: ${tr.persona} The party can help, rob, ignore or do anything else; let the world remember it.`;
  } else {
    const foes = rollEncounter(theme, terrain.habitat, level, 4, rng);
    const letters = ["a", "b"];
    const placed: string[] = [];
    foes.forEach((f, i) => {
      const def = BESTIARY[theme].find((m) => m.id === f.id)!;
      const ch = letters[i];
      let n = 0;
      for (let k = 0; k < f.count; k++) if (placeMark(g, freeSpots(g, [sx, sy], 12, taken, def.size === 2), ch, taken, def.size === 2)) n++;
      if (n) { marks[ch] = { type: "enemy", monster: f.id, group: "foes" }; placed.push(`${n}× ${def.name}`); }
    });
    triggers.push(
      { id: "awareness", when: { type: "start" }, actions: [{ do: "random", dice: "1d6", label: "Who sees whom first?", outcomes: [
        { min: 1, max: 1, actions: [{ do: "narrate", text: "Too late: they saw you first. Movement in the cover ahead, weapons out." }, { do: "reveal", rect: [12, 1, 26, 14] }] },
        { min: 2, max: 5, actions: [{ do: "narrate", text: "Something is out there. You can hear it. Careful, now." }] },
        { min: 6, max: 6, actions: [{ do: "narrate", text: "You spot tracks, fresh ones, and hear voices ahead before they hear you. A chance to sneak by, or strike first." }] },
      ] }] },
      { id: "won", when: { type: "cleared", group: "foes" }, actions: [{ do: "narrate", text: "The road is clear, for now. You catch your breath and check your gear." }, { do: "loot", gold: 4 * level + Math.floor(rng() * 6 * level) }, { do: "objective", text: `Press on to ${destName(theme, dest)} (the exit to the east).` }] },
    );
    objective = `Deal with whatever lurks in ${vdef.name}, or slip past, then press on east.`;
    gmNotes += ` Hostiles: ${placed.join(", ")}. They can be fought, avoided, bribed, frightened off or talked to if the players try. Hidden until seen.`;
  }

  return {
    id, title: vdef.name, act: `On the road · ${terrain.name}`,
    env: { preset: `${terrain.id}-${variant % terrain.variants.length}`, weather: vdef.weather ?? "clear", time: vdef.time ?? (["day", "dusk", "night", "dawn"] as TimeOfDay[])[Math.floor(rng() * 4)] },
    map: g.rows(), marks, intro: vdef.intro, objective, gmNotes, hazard: vdef.hazard, triggers,
  };
}

function landmarkScene(theme: CampaignId, id: string, key: string, level: number, rng: Rng, dest: string): SceneDef | undefined {
  const lm = LANDMARKS[theme].find((l) => l.id === key);
  if (!lm) return;
  const g = new Grid(".", rng);
  lm.draw(g);
  const { sx, sy, ex, ey } = finish(g, ".");
  g.t[sy][sx] = "S"; g.t[sy - 1][sx] = "S"; g.t[sy + 1][sx] = "S"; g.t[sy][sx + 1] = "S";
  g.t[ey][ex] = "X";
  const [kx, ky] = lm.keeper.at;
  if (!WALK.has(g.get(kx, ky))) g.set(kx, ky, ".");
  connect(g, sx, sy, kx, ky, ".");
  g.t[ky][kx] = "B";
  const taken = new Set<number>([ky * W + kx, ey * W + ex]);
  for (let dy = -2; dy <= 2; dy++) for (let dx = 0; dx <= 5; dx++) taken.add((sy + dy) * W + sx + dx);
  const c = common(theme, level, dest);
  const marks: Record<string, MarkDef> = { ...c.marks };
  placeMark(g, freeSpots(g, [sx, sy], 5, taken), "K", taken);
  const bossId = lm.keeper.byLevel[Math.max(0, Math.min(9, level - 1))];
  marks.B = { type: "npc", name: lm.keeper.name, glyph: lm.keeper.glyph, color: lm.keeper.color, persona: lm.keeper.persona, group: "keeper", monster: bossId };
  // the keeper's guards wake if it comes to a fight
  const guards = BESTIARY[theme].filter((m) => m.habitat.includes(lm.habitat) && m.cr <= Math.max(0.25, level / 3));
  const guard = guards[Math.floor(rng() * guards.length)] ?? BESTIARY[theme][0];
  const spots = freeSpots(g, [sx, sy], 9, taken);
  const nGuards = Math.min(4, 1 + Math.floor(level / 3));
  for (let i = 0; i < nGuards; i++) placeMark(g, spots, "g", taken);
  marks.g = { type: "enemy", monster: guard.id, group: "guards", dormant: true };
  const triggers: TriggerDef[] = [
    ...c.triggers,
    { id: "greet", when: { type: "enter", rect: [Math.max(1, kx - 6), 1, Math.min(W - 2, kx + 6), H - 2] }, note: `Meeting ${lm.keeper.name}.`, actions: [{ do: "narrate", text: lm.greeting }, { do: "choice", prompt: `${lm.name}: what do you do?`, options: lm.options(level) }] },
    { id: "won", when: { type: "killed", name: lm.keeper.name }, actions: [{ do: "narrate", text: `${lm.keeper.name} falls. ${lm.name} is quiet now, and its treasures are yours.` }, { do: "loot", gold: 25 * level }, { do: "loot", itemId: "potion", qty: 1 }, { do: "xp", amount: 40 * level }, { do: "objective", text: `Press on to ${destName(theme, dest)}.` }] },
  ];
  return {
    id, title: lm.name, act: "On the road · a landmark",
    env: { preset: lm.preset, weather: lm.weather ?? "clear", time: lm.time ?? "night" },
    map: g.rows(), marks, intro: lm.intro, objective: `Deal with ${lm.keeper.name} however you like, then press on.`,
    gmNotes: `Landmark encounter. ${lm.keeper.name}: ${lm.keeper.persona} Their combat stats are a level-appropriate ${bossId}. Players may do anything: fight, bargain, trick, help or ignore. Guards (${guard.name}) join if it comes to blows.`,
    hazard: lm.hazard, triggers,
  };
}

// ---------------------------------------------------------------- rolling the road

export interface TravelRoll { kind: "quiet" | "t" | "l" | "e"; key?: string; variant?: number }

/** What the dice put on the road: d20 → 1-9 quiet, 10-15 a fight, 16-17 a stranger, 18-20 a landmark. */
export function rollTravel(theme: CampaignId, terrain: string, d20: number, rng: Rng, exploring = false): TravelRoll {
  const n = exploring ? Math.max(10, d20) : d20;
  if (n <= 9) return { kind: "quiet" };
  if (n <= 15) return { kind: "t", key: terrain, variant: Math.floor(rng() * 4) };
  if (n <= 17) return { kind: "e", key: terrain, variant: Math.floor(rng() * 4) };
  const lms = LANDMARKS[theme];
  return { kind: "l", key: lms[Math.floor(rng() * lms.length)].id };
}

export const QUIET_ROADS: Record<CampaignId, string[]> = {
  realm: ["The road is quiet. A farmer waves. A dog follows you for a mile, then thinks better of it.", "Rain, mud, and a long uneventful walk. Somebody hums the same three notes the whole way.", "You pass a gallows with nobody on it. A good sign, or a vacancy.", "A peddler sells you a turnip you didn't want. Otherwise, nothing."],
  hollow: ["The tunnels are still. Only the drip of water and the tick of your own shells.", "A lantern-bug lights your way for a while, then flutters off.", "You pass a shrine of tiny shells. Someone left an offering. You leave it alone. Probably wise.", "Long, dark, uneventful. The best kind of tunnel."],
  neon: ["The tram is late but it gets you there. A man sells you a hot dog of uncertain species.", "Rain, neon, traffic. Nobody shoots at you. A personal best.", "A drone follows you for three blocks, takes a photo and leaves. Ominous.", "You take the long way round a gang checkpoint. Nothing happens. You're almost disappointed."],
};
