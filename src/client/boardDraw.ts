// Draws the tactical map as an ink-and-watercolour sketch: washed floors, hatched walls, hand-drawn
// trees, boulders, crates and crystals, wobbly ink edges, and pencil-hatched fog for squares the party
// can't currently see. Used by the 2D board panel and the 3D table top. The static map is cached.

import { TILE } from "../shared/board";
import { isHostile } from "../shared/rules";
import type { BoardState, Token } from "../shared/types";

interface Palette { floor: string; alt: string; wall: string; ink: string; paper: string; unknown: string; water: string; hazard: string }

export const PALETTES: Record<string, Palette> = {
  realm: { floor: "#d8c49a", alt: "#a8c27a", wall: "#4a3b2c", ink: "#2a2018", paper: "#efe4cc", unknown: "#cbbd9e", water: "#8fb4cf", hazard: "#b8c46a" },
  hollow: { floor: "#b9bfd2", alt: "#9fc5b2", wall: "#2c3150", ink: "#1c2036", paper: "#e9e4d8", unknown: "#c4bfb2", water: "#86a8d8", hazard: "#d8d0f0" },
  neon: { floor: "#c8c2d6", alt: "#dcaed6", wall: "#262338", ink: "#16141f", paper: "#ebe5dc", unknown: "#c6beb0", water: "#7fb0d0", hazard: "#e8a0a0" },
  pub: { floor: "#c79a62", alt: "#a8603a", wall: "#4a2c14", ink: "#2a180a", paper: "#efe4cc", unknown: "#cbbd9e", water: "#8fb4cf", hazard: "#e8a060" },
};

export const PROP_GLYPH: Record<string, string> = {
  cart: "🛒", path: "➡️", lever: "🕹️", chest: "🧰", stairs: "🪜", lantern: "🏮", tunnel: "🕳️", van: "🚐", terminal: "💻", elevator: "🛗",
  anvil: "⚒️", mug: "🍺", altar: "🕯️", well: "⛲", bell: "🔔", crystal: "💎", egg: "🥚", cage: "🪤", board: "📋", car: "🚗", ladder: "🪜",
};

export interface DrawOpts {
  cell: number;
  vis: Set<number>;
  revealAll?: boolean;
  selected?: string | null;
  target?: string | null;
  currentId?: string | null;
  hover?: [number, number] | null;
  reach?: Map<number, number> | null;
  path?: [number, number][] | null;
  pings?: { x: number; y: number; t: number; color: string }[];
  time: number;
  labels?: boolean;
  aoe?: { x: number; y: number; r: number } | null;
}

export function tokenVisible(t: Token, b: BoardState, vis: Set<number>) {
  if (t.kind === "pc") return true;
  if (t.hidden) return false;
  for (let y = t.y; y < t.y + t.size; y++) for (let x = t.x; x < t.x + t.size; x++) if (vis.has(y * b.width + x)) return true;
  return false;
}

// ---------- sketch helpers ----------

function hash(x: number, y: number, k = 0) {
  let h = x * 374761393 + y * 668265263 + k * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  return (Math.abs(h ^ (h >> 16)) % 10000) / 10000;
}

/** A hand-drawn line: slightly wobbly, drawn twice like a quick pen stroke. */
function inkLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, seed: number, w: number) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
  for (let pass = 0; pass < 2; pass++) {
    const j = (k: number) => (hash(seed, pass, k) - 0.5) * w * 1.6;
    ctx.beginPath();
    ctx.moveTo(x1 + nx * j(1), y1 + ny * j(1));
    ctx.quadraticCurveTo((x1 + x2) / 2 + nx * j(2) * 1.5, (y1 + y2) / 2 + ny * j(2) * 1.5, x2 + nx * j(3), y2 + ny * j(3));
    ctx.lineWidth = pass ? w * 0.55 : w;
    ctx.stroke();
  }
}

function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number, pts = 9) {
  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = r * (0.82 + hash(seed, i, 7) * 0.32);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const patterns = new WeakMap<CanvasRenderingContext2D, Record<string, CanvasPattern>>();
function hatchPattern(ctx: CanvasRenderingContext2D, kind: "light" | "cross" | "fog", color: string) {
  let p = patterns.get(ctx);
  if (!p) { p = {}; patterns.set(ctx, p); }
  const key = `${kind}${color}`;
  if (p[key]) return p[key];
  const c = document.createElement("canvas");
  c.width = c.height = 12;
  const g = c.getContext("2d")!;
  g.strokeStyle = color;
  g.lineWidth = kind === "fog" ? 1.1 : 1.3;
  g.beginPath(); g.moveTo(-2, 14); g.lineTo(14, -2); g.stroke();
  if (kind === "cross") { g.beginPath(); g.moveTo(-2, -2); g.lineTo(14, 14); g.stroke(); }
  p[key] = ctx.createPattern(c, "repeat")!;
  return p[key];
}

type Decor = "tree" | "rock" | "pillar" | "crate" | "crystal" | "mushroom" | "rack";
function decorFor(b: BoardState): { solid: Decor; brush: "grass" | "rubble" | "junk" | "silk" } {
  const d = b.decor ?? "";
  if (["forest", "village", "marsh", "garden", "stilts", "fortress"].includes(d)) return { solid: "tree", brush: "grass" };
  if (["mountain", "dragonroost", "cavern", "aqueduct"].includes(d)) return { solid: "rock", brush: d === "aqueduct" ? "rubble" : "grass" };
  if (d === "crystal" || d === "radiance") return { solid: "crystal", brush: "rubble" };
  if (["fungal", "bloom", "bloomroad", "silk"].includes(d)) return { solid: "mushroom", brush: d === "silk" ? "silk" : "grass" };
  if (["servervault", "datacore", "lab", "cyberspace"].includes(d)) return { solid: "rack", brush: "junk" };
  if (["neoncity", "docks", "garage", "sewer", "club", "neonbar", "gangden", "penthouse", "corplobby"].includes(d)) return { solid: "crate", brush: "junk" };
  return { solid: "pillar", brush: "rubble" };
}

function drawDecor(ctx: CanvasRenderingContext2D, kind: Decor, x: number, y: number, c: number, pal: Palette, seed: number) {
  const cx = x + c / 2, cy = y + c / 2;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1, c * 0.05);
  switch (kind) {
    case "tree": {
      ctx.fillStyle = "rgba(40,30,20,0.25)"; blob(ctx, cx + c * 0.1, cy + c * 0.12, c * 0.45, seed); ctx.fill();
      const greens = ["#5f8f4a", "#4f7f3e", "#6e9a52"];
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = greens[k];
        blob(ctx, cx + (hash(seed, k, 1) - 0.5) * c * 0.3, cy + (hash(seed, k, 2) - 0.5) * c * 0.3, c * (0.3 + hash(seed, k) * 0.12), seed + k, 8);
        ctx.fill(); ctx.stroke();
      }
      break;
    }
    case "rock": {
      ctx.fillStyle = "rgba(40,30,20,0.25)"; blob(ctx, cx + c * 0.08, cy + c * 0.1, c * 0.42, seed, 6); ctx.fill();
      ctx.fillStyle = ["#9a948a", "#8a857c", "#a8a296"][Math.floor(hash(seed, 3) * 3)];
      blob(ctx, cx, cy, c * 0.42, seed, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hatchPattern(ctx, "light", "rgba(30,25,20,0.45)");
      blob(ctx, cx + c * 0.08, cy + c * 0.08, c * 0.28, seed + 9, 5); ctx.fill();
      break;
    }
    case "pillar": {
      ctx.fillStyle = "rgba(30,25,20,0.3)"; ctx.beginPath(); ctx.arc(cx + c * 0.08, cy + c * 0.1, c * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#d8d0c0"; ctx.beginPath(); ctx.arc(cx, cy, c * 0.38, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, c * 0.24, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case "crate": {
      const s = c * 0.74, ox = cx - s / 2, oy = cy - s / 2;
      ctx.fillStyle = "rgba(20,15,20,0.3)"; ctx.fillRect(ox + c * 0.08, oy + c * 0.08, s, s);
      ctx.fillStyle = ["#b08850", "#7a8ab0", "#b06a5a"][Math.floor(hash(seed, 4) * 3)];
      ctx.fillRect(ox, oy, s, s); ctx.strokeRect(ox, oy, s, s);
      inkLine(ctx, ox, oy, ox + s, oy + s, seed, ctx.lineWidth * 0.7);
      inkLine(ctx, ox + s, oy, ox, oy + s, seed + 1, ctx.lineWidth * 0.7);
      break;
    }
    case "rack": {
      const w = c * 0.7, h = c * 0.8, ox = cx - w / 2, oy = cy - h / 2;
      ctx.fillStyle = "#2a2e40"; ctx.fillRect(ox, oy, w, h); ctx.strokeRect(ox, oy, w, h);
      for (let k = 1; k < 5; k++) { ctx.fillStyle = hash(seed, k) > 0.5 ? "#3aff8a" : "#3ac8ff"; ctx.fillRect(ox + w * 0.7, oy + (h * k) / 5 - 1, w * 0.12, 2); }
      break;
    }
    case "crystal": {
      for (let k = 0; k < 3; k++) {
        const px = cx + (k - 1) * c * 0.22, h = c * (0.4 + hash(seed, k) * 0.3);
        ctx.fillStyle = ["#b8e8ff", "#e8b8f0", "#c8b8ff"][k];
        ctx.beginPath(); ctx.moveTo(px, cy - h); ctx.lineTo(px + c * 0.12, cy + c * 0.2); ctx.lineTo(px - c * 0.12, cy + c * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      break;
    }
    case "mushroom": {
      ctx.fillStyle = "#efe6d6"; ctx.fillRect(cx - c * 0.07, cy, c * 0.14, c * 0.3); ctx.strokeRect(cx - c * 0.07, cy, c * 0.14, c * 0.3);
      ctx.fillStyle = ["#c070d0", "#d0a040", "#60c0b0"][Math.floor(hash(seed, 5) * 3)];
      ctx.beginPath(); ctx.ellipse(cx, cy, c * 0.4, c * 0.28, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(cx + (k - 1) * c * 0.15, cy - c * 0.12, c * 0.04, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
  }
}

function drawBrush(ctx: CanvasRenderingContext2D, kind: "grass" | "rubble" | "junk" | "silk", x: number, y: number, c: number, pal: Palette, seed: number) {
  ctx.lineWidth = Math.max(1, c * 0.04);
  if (kind === "grass") {
    ctx.fillStyle = "rgba(110,150,70,0.35)"; ctx.fillRect(x, y, c, c);
    ctx.strokeStyle = "#4f7a33";
    for (let k = 0; k < 7; k++) {
      const gx = x + hash(seed, k) * c, gy = y + c * 0.85;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + (hash(seed, k, 2) - 0.5) * c * 0.4, gy - c * 0.4, gx + (hash(seed, k, 3) - 0.5) * c * 0.3, gy - c * (0.55 + hash(seed, k, 4) * 0.3)); ctx.stroke();
    }
  } else if (kind === "silk") {
    ctx.fillStyle = "rgba(240,235,255,0.45)"; ctx.fillRect(x, y, c, c);
    ctx.strokeStyle = "rgba(120,110,150,0.8)";
    for (let k = 0; k < 4; k++) inkLine(ctx, x + hash(seed, k) * c, y, x + hash(seed, k, 1) * c, y + c, seed + k, ctx.lineWidth * 0.6);
  } else {
    ctx.fillStyle = kind === "junk" ? "rgba(90,80,100,0.35)" : "rgba(120,100,80,0.35)"; ctx.fillRect(x, y, c, c);
    ctx.strokeStyle = pal.ink;
    for (let k = 0; k < 4; k++) {
      const s = c * (0.16 + hash(seed, k) * 0.14);
      const bx = x + hash(seed, k, 1) * (c - s), by = y + hash(seed, k, 2) * (c - s);
      ctx.fillStyle = kind === "junk" ? ["#8a7a6a", "#6a7a9a", "#9a6a6a"][k % 3] : "#8a8070";
      if (kind === "junk") { ctx.fillRect(bx, by, s, s); ctx.strokeRect(bx, by, s, s); }
      else { blob(ctx, bx + s / 2, by + s / 2, s / 2, seed + k, 5); ctx.fill(); ctx.stroke(); }
    }
  }
}

const layerCache = new Map<string, HTMLCanvasElement>();

function staticLayer(b: BoardState, c: number, revealAll: boolean): HTMLCanvasElement {
  const key = `${b.sceneId}|${c}|${revealAll}|${b.tiles.join("")}|${revealAll ? "" : b.explored}`;
  const hit = layerCache.get(key);
  if (hit) return hit;
  const pal = PALETTES[b.theme] ?? PALETTES.realm;
  const deco = decorFor(b);
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(b.width * c);
  cv.height = Math.ceil(b.height * c);
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = pal.paper;
  ctx.fillRect(0, 0, cv.width, cv.height);
  const known = (x: number, y: number) => x >= 0 && y >= 0 && x < b.width && y < b.height && (revealAll || b.explored[y * b.width + x] === "1") && b.tiles[y][x] !== TILE.UNKNOWN;
  const tile = (x: number, y: number) => (x < 0 || y < 0 || x >= b.width || y >= b.height ? TILE.WALL : b.tiles[y][x]);

  // 1) watercolour washes for the ground
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    if (!known(x, y)) continue;
    const ch = tile(x, y);
    const px = x * c, py = y * c;
    const base = ch === TILE.ALT || ch === TILE.BRUSH ? pal.alt : ch === TILE.WATER ? pal.water : ch === TILE.HAZARD ? pal.hazard : ch === TILE.CHASM ? "#2a2420" : ch === TILE.WALL ? pal.wall : pal.floor;
    ctx.fillStyle = base;
    ctx.fillRect(px - 0.5, py - 0.5, c + 1, c + 1);
    // pigment blooms
    ctx.fillStyle = `rgba(255,255,255,${0.06 + hash(x, y) * 0.08})`;
    blob(ctx, px + hash(x, y, 1) * c, py + hash(x, y, 2) * c, c * (0.25 + hash(x, y, 3) * 0.3), x * 31 + y, 7);
    ctx.fill();
    ctx.fillStyle = `rgba(60,40,20,${0.04 + hash(x, y, 4) * 0.05})`;
    blob(ctx, px + hash(x, y, 5) * c, py + hash(x, y, 6) * c, c * 0.2, x * 17 + y, 6);
    ctx.fill();
  }
  // 2) pencil grid
  ctx.strokeStyle = "rgba(60,45,30,0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= b.width; x++) inkLine(ctx, x * c, 0, x * c, b.height * c, x, 0.6);
  for (let y = 0; y <= b.height; y++) inkLine(ctx, 0, y * c, b.width * c, y * c, 100 + y, 0.6);
  // 3) features
  ctx.lineCap = "round";
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    if (!known(x, y)) continue;
    const ch = tile(x, y);
    const px = x * c, py = y * c;
    const seed = x * 97 + y * 13;
    if (ch === TILE.WALL) {
      ctx.fillStyle = hatchPattern(ctx, "cross", "rgba(255,240,220,0.18)");
      ctx.fillRect(px, py, c + 0.5, c + 0.5);
    } else if (ch === TILE.PILLAR) drawDecor(ctx, deco.solid, px, py, c, pal, seed);
    else if (ch === TILE.BRUSH) drawBrush(ctx, deco.brush, px, py, c, pal, seed);
    else if (ch === TILE.WATER) {
      ctx.strokeStyle = "rgba(40,80,120,0.55)"; ctx.lineWidth = 1.2;
      for (let k = 0; k < 2; k++) { ctx.beginPath(); const wy = py + c * (0.35 + k * 0.3); ctx.moveTo(px + c * 0.15, wy); ctx.bezierCurveTo(px + c * 0.35, wy - c * 0.1, px + c * 0.55, wy + c * 0.1, px + c * 0.85, wy); ctx.stroke(); }
    } else if (ch === TILE.HAZARD) {
      ctx.strokeStyle = "rgba(140,40,30,0.6)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); for (let k = 0; k <= 4; k++) ctx.lineTo(px + c * (0.1 + k * 0.2), py + c * (k % 2 ? 0.35 : 0.65)); ctx.stroke();
    } else if (ch === TILE.RUBBLE) drawBrush(ctx, "rubble", px, py, c, pal, seed);
    else if (ch === TILE.CHASM) {
      ctx.fillStyle = hatchPattern(ctx, "cross", "rgba(0,0,0,0.6)"); ctx.fillRect(px, py, c, c);
    } else if (ch === TILE.BRIDGE) {
      ctx.strokeStyle = pal.ink; ctx.lineWidth = 1;
      ctx.fillStyle = "#a07a4a"; ctx.fillRect(px, py + c * 0.15, c, c * 0.7);
      for (let k = 1; k < 4; k++) inkLine(ctx, px + (c * k) / 4, py + c * 0.15, px + (c * k) / 4, py + c * 0.85, seed + k, 0.8);
    } else if (ch === TILE.DOOR || ch === TILE.OPEN) {
      ctx.fillStyle = ch === TILE.DOOR ? "#8a5a30" : "rgba(138,90,48,0.35)";
      ctx.strokeStyle = pal.ink; ctx.lineWidth = Math.max(1, c * 0.05);
      const vertical = tile(x - 1, y) === TILE.WALL && tile(x + 1, y) === TILE.WALL;
      if (vertical) { ctx.fillRect(px, py + c * 0.3, c, c * 0.4); ctx.strokeRect(px, py + c * 0.3, c, c * 0.4); }
      else { ctx.fillRect(px + c * 0.3, py, c * 0.4, c); ctx.strokeRect(px + c * 0.3, py, c * 0.4, c); }
    }
  }
  // 4) ink outlines where walls meet open ground
  ctx.strokeStyle = pal.ink;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    if (!known(x, y) || tile(x, y) !== TILE.WALL) continue;
    const px = x * c, py = y * c, w = Math.max(1.4, c * 0.07), seed = x * 7 + y * 3;
    const open = (nx: number, ny: number) => known(nx, ny) && tile(nx, ny) !== TILE.WALL;
    if (open(x, y - 1)) inkLine(ctx, px, py, px + c, py, seed, w);
    if (open(x, y + 1)) inkLine(ctx, px, py + c, px + c, py + c, seed + 1, w);
    if (open(x - 1, y)) inkLine(ctx, px, py, px, py + c, seed + 2, w);
    if (open(x + 1, y)) inkLine(ctx, px + c, py, px + c, py + c, seed + 3, w);
  }
  // 5) the unexplored: dark, cross-hatched paper — an unfinished sketch
  if (!revealAll) for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    if (known(x, y)) continue;
    ctx.fillStyle = pal.unknown;
    ctx.fillRect(x * c - 0.5, y * c - 0.5, c + 1, c + 1);
    ctx.fillStyle = hatchPattern(ctx, "cross", "rgba(70,55,40,0.28)");
    ctx.fillRect(x * c - 0.5, y * c - 0.5, c + 1, c + 1);
  }
  if (layerCache.size > 6) layerCache.delete(layerCache.keys().next().value!);
  layerCache.set(key, cv);
  return cv;
}

export function drawBoard(ctx: CanvasRenderingContext2D, b: BoardState, o: DrawOpts) {
  const pal = PALETTES[b.theme] ?? PALETTES.realm;
  const c = o.cell;
  ctx.drawImage(staticLayer(b, c, !!o.revealAll), 0, 0);

  // pencil fog over explored squares out of sight
  if (!o.revealAll) {
    ctx.fillStyle = hatchPattern(ctx, "fog", "rgba(60,50,40,0.32)");
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      const i = y * b.width + x;
      if (b.explored[i] === "1" && !o.vis.has(i)) { ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5); }
    }
    ctx.fillStyle = "rgba(220,210,190,0.18)";
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      const i = y * b.width + x;
      if (b.explored[i] === "1" && !o.vis.has(i)) ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5);
    }
  }

  if (o.reach) {
    ctx.fillStyle = "rgba(60,140,220,0.16)";
    for (const cell of o.reach.keys()) ctx.fillRect((cell % b.width) * c, Math.floor(cell / b.width) * c, c, c);
  }
  if (o.aoe) {
    ctx.fillStyle = "rgba(220,90,30,0.25)";
    ctx.strokeStyle = "rgba(160,50,10,0.8)";
    ctx.beginPath(); ctx.arc((o.aoe.x + 0.5) * c, (o.aoe.y + 0.5) * c, (o.aoe.r + 0.5) * c, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (o.path?.length) {
    ctx.strokeStyle = "rgba(30,60,140,0.85)";
    ctx.lineWidth = Math.max(2, c * 0.08);
    ctx.setLineDash([c * 0.18, c * 0.14]);
    ctx.beginPath();
    o.path.forEach(([x, y], i) => (i ? ctx.lineTo(x * c + c / 2, y * c + c / 2) : ctx.moveTo(x * c + c / 2, y * c + c / 2)));
    ctx.stroke();
    ctx.setLineDash([]);
    const [ex, ey] = o.path[o.path.length - 1];
    ctx.beginPath(); ctx.arc(ex * c + c / 2, ey * c + c / 2, c * 0.18, 0, Math.PI * 2); ctx.stroke();
  }
  if (o.hover) {
    ctx.strokeStyle = "rgba(30,20,10,0.7)";
    ctx.lineWidth = 2;
    inkLine(ctx, o.hover[0] * c + 2, o.hover[1] * c + 2, o.hover[0] * c + c - 2, o.hover[1] * c + 2, 1, 1.5);
    inkLine(ctx, o.hover[0] * c + 2, o.hover[1] * c + c - 2, o.hover[0] * c + c - 2, o.hover[1] * c + c - 2, 2, 1.5);
    inkLine(ctx, o.hover[0] * c + 2, o.hover[1] * c + 2, o.hover[0] * c + 2, o.hover[1] * c + c - 2, 3, 1.5);
    inkLine(ctx, o.hover[0] * c + c - 2, o.hover[1] * c + 2, o.hover[0] * c + c - 2, o.hover[1] * c + c - 2, 4, 1.5);
  }

  // props: little sketched tags
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of b.props) {
    if (!o.revealAll && b.explored[p.y * b.width + p.x] !== "1") continue;
    ctx.fillStyle = p.used ? "rgba(255,250,240,0.55)" : "rgba(255,236,170,0.95)";
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = Math.max(1, c * 0.05);
    blob(ctx, p.x * c + c / 2, p.y * c + c / 2, c * 0.42, p.x * 11 + p.y, 8);
    ctx.fill(); ctx.stroke();
    if (!p.used) { ctx.strokeStyle = `rgba(200,140,20,${0.4 + Math.sin(o.time * 3) * 0.3})`; ctx.beginPath(); ctx.arc(p.x * c + c / 2, p.y * c + c / 2, c * 0.5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.font = `${c * 0.55}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    ctx.fillText(PROP_GLYPH[p.kind] ?? "❔", p.x * c + c / 2, p.y * c + c / 2 + c * 0.03);
  }

  const tokens = [...b.tokens].sort((a, z) => Number(z.conditions.includes("dead")) - Number(a.conditions.includes("dead")));
  for (const t of tokens) {
    if (!o.revealAll && !tokenVisible(t, b, o.vis)) continue;
    drawToken(ctx, t, c, o, pal);
  }

  for (const p of o.pings ?? []) {
    const age = o.time - p.t;
    if (age > 2.5) continue;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      const r = ((age * 1.4 + k * 0.5) % 1.2) * c * 1.4;
      ctx.globalAlpha = Math.max(0, 1 - age / 2.5);
      ctx.beginPath(); ctx.arc(p.x * c + c / 2, p.y * c + c / 2, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawToken(ctx: CanvasRenderingContext2D, t: Token, c: number, o: DrawOpts, pal: Palette) {
  const s = t.size * c;
  const cx = t.x * c + s / 2;
  const cy = t.y * c + s / 2;
  const r = s * 0.4;
  const dead = t.conditions.includes("dead");
  const ring = t.kind === "pc" ? "#2f8a4a" : isHostile(t) ? "#b02a2a" : t.disposition === "neutral" ? "#b08a1a" : "#2a6ab0";
  const seed = t.x * 13 + t.y * 7;
  if (t.id === o.currentId && !dead) {
    ctx.fillStyle = "rgba(255,210,80,0.45)";
    blob(ctx, cx, cy, r * (1.45 + Math.sin(o.time * 5) * 0.06), seed, 10);
    ctx.fill();
  }
  ctx.globalAlpha = dead ? 0.5 : t.conditions.includes("hidden") ? 0.6 : 1;
  // paper coin with a coloured rim, like a hand-made standee
  ctx.fillStyle = "rgba(40,30,20,0.3)";
  ctx.beginPath(); ctx.arc(cx + c * 0.06, cy + c * 0.08, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dead ? "#bbb" : "#fbf6ea";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dead ? "#999" : t.color;
  ctx.globalAlpha *= 0.35;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = dead ? 0.5 : 1;
  ctx.strokeStyle = ring;
  ctx.lineWidth = Math.max(2.5, c * 0.1);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1, c * 0.035);
  ctx.beginPath(); ctx.arc(cx, cy, r + c * 0.05, 0, Math.PI * 2); ctx.stroke();
  if (t.id === o.selected) {
    ctx.strokeStyle = "#1a3a8a";
    ctx.setLineDash([c * 0.12, c * 0.08]);
    ctx.lineWidth = Math.max(2, c * 0.06);
    ctx.beginPath(); ctx.arc(cx, cy, r + c * 0.14, o.time, o.time + Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (t.id === o.target) {
    ctx.strokeStyle = "#b02a2a";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + o.time;
      ctx.beginPath(); ctx.arc(cx, cy, r + c * 0.18, a, a + 0.9); ctx.stroke();
    }
  }
  ctx.font = `${s * 0.48}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(dead ? "✖" : t.glyph, cx, cy + s * 0.03);
  ctx.globalAlpha = 1;
  if (t.conditions.includes("unconscious") && !dead) { ctx.font = `${c * 0.38}px sans-serif`; ctx.fillText("💤", cx + r * 0.85, cy - r * 0.85); }

  if (!dead && t.kind !== "object") {
    const frac = Math.max(0, Math.min(1, t.hp / t.maxHp));
    const bw = s * 0.8, bx = cx - bw / 2, by = t.y * c + s - c * 0.06;
    ctx.fillStyle = "#fbf6ea";
    ctx.fillRect(bx, by, bw, c * 0.11);
    ctx.fillStyle = frac > 0.5 ? "#4a9a4a" : frac > 0.25 ? "#d0a020" : "#c03020";
    if (t.kind !== "pc" && t.disposition !== "friendly") ctx.fillStyle = frac > 0.5 ? "#b04040" : "#e02020";
    ctx.fillRect(bx, by, bw * frac, c * 0.11);
    ctx.strokeStyle = pal.ink; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, c * 0.11);
  }
  const conds = t.conditions.filter((x) => !["dead", "unconscious"].includes(x));
  conds.slice(0, 4).forEach((cd, i) => {
    ctx.fillStyle = CONDITION_COLOR[cd] ?? "#ccc";
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(t.x * c + c * 0.15 + i * c * 0.2, t.y * c + c * 0.12, c * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  if (o.labels && c >= 26 && !dead) {
    ctx.font = `700 ${Math.max(10, c * 0.26)}px "Patrick Hand", "Comic Sans MS", system-ui, sans-serif`;
    const label = t.name.length > 16 ? `${t.name.slice(0, 15)}…` : t.name;
    const w = ctx.measureText(label).width + 8;
    ctx.fillStyle = "rgba(251,246,234,0.9)";
    ctx.fillRect(cx - w / 2, t.y * c + s + c * 0.04, w, c * 0.3);
    ctx.fillStyle = pal.ink;
    ctx.fillText(label, cx, t.y * c + s + c * 0.2);
  }
}

export const CONDITION_COLOR: Record<string, string> = {
  prone: "#a0784c", poisoned: "#6cd04c", frightened: "#b04cd0", restrained: "#d08a4c", stunned: "#ffe04c",
  blinded: "#444", dodging: "#4cb4ff", raging: "#ff4c4c", marked: "#ff8c1a", blessed: "#ffe9a0", hidden: "#8888aa", disengaged: "#9ad",
  guardians: "#fff2a0", warded: "#c0e0ff", slowed: "#80a0c0",
};
