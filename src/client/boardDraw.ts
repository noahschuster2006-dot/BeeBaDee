// Draws the tactical map. Used by the 2D board panel (Foundry-style) and the 3D table top texture.

import { TILE } from "../shared/board";
import { isHostile } from "../shared/rules";
import type { BoardState, Token } from "../shared/types";

type Palette = Record<string, string> & { grid: string; fog: string; bg: string };

export const PALETTES: Record<string, Palette> = {
  realm: { [TILE.FLOOR]: "#9b8a68", [TILE.ALT]: "#56733a", [TILE.WALL]: "#3a332d", [TILE.PILLAR]: "#2e4a25", [TILE.WATER]: "#3b6585", [TILE.RUBBLE]: "#76684f", [TILE.DOOR]: "#80522b", [TILE.OPEN]: "#a0703f", [TILE.CHASM]: "#0b0b0b", [TILE.BRIDGE]: "#8a6640", grid: "rgba(0,0,0,0.18)", fog: "#07070a", bg: "#1a1612" },
  hollow: { [TILE.FLOOR]: "#46506a", [TILE.ALT]: "#3f6e5c", [TILE.WALL]: "#121722", [TILE.PILLAR]: "#2b3550", [TILE.WATER]: "#2d5582", [TILE.RUBBLE]: "#5b6274", [TILE.DOOR]: "#6f7fa8", [TILE.OPEN]: "#8fa2d8", [TILE.CHASM]: "#05060a", [TILE.BRIDGE]: "#7d7464", grid: "rgba(180,200,255,0.12)", fog: "#04050a", bg: "#0b0e16" },
  neon: { [TILE.FLOOR]: "#2b2f3d", [TILE.ALT]: "#43204f", [TILE.WALL]: "#0c0d13", [TILE.PILLAR]: "#17324a", [TILE.WATER]: "#1c4466", [TILE.RUBBLE]: "#3a3b45", [TILE.DOOR]: "#ff3fa4", [TILE.OPEN]: "#3af0ff", [TILE.CHASM]: "#000", [TILE.BRIDGE]: "#555a6a", grid: "rgba(58,240,255,0.14)", fog: "#020205", bg: "#06070c" },
  pub: { [TILE.FLOOR]: "#8b5e34", [TILE.ALT]: "#6e3b2a", [TILE.WALL]: "#3b2615", [TILE.PILLAR]: "#5a3a20", [TILE.WATER]: "#335", [TILE.RUBBLE]: "#665", [TILE.DOOR]: "#a06a35", [TILE.OPEN]: "#a06a35", [TILE.CHASM]: "#000", [TILE.BRIDGE]: "#864", grid: "rgba(0,0,0,0.15)", fog: "#000", bg: "#24160c" },
};

export const PROP_GLYPH: Record<string, string> = {
  cart: "🛒", path: "➡️", lever: "🕹️", chest: "🧰", stairs: "🪜", lantern: "🏮", tunnel: "🕳️", van: "🚐", terminal: "💻", elevator: "🛗",
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

export function drawBoard(ctx: CanvasRenderingContext2D, b: BoardState, o: DrawOpts) {
  const pal = PALETTES[b.theme] ?? PALETTES.realm;
  const c = o.cell;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, b.width * c, b.height * c);

  // tiles
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const ch = b.tiles[y][x];
      const idx = y * b.width + x;
      const explored = o.revealAll || b.explored[idx] === "1";
      if (!explored) continue;
      ctx.fillStyle = pal[ch] ?? pal[TILE.FLOOR];
      ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5);
      // texture flecks
      const n = hash(x, y);
      if (ch === TILE.ALT || ch === TILE.FLOOR) {
        ctx.fillStyle = `rgba(255,255,255,${0.025 + (n % 5) * 0.008})`;
        ctx.fillRect(x * c + (n % 7) * c / 9, y * c + ((n >> 3) % 7) * c / 9, c / 7, c / 7);
      }
      if (ch === TILE.PILLAR) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.arc(x * c + c / 2, y * c + c / 2, c * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
      if (ch === TILE.WATER) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        const off = Math.sin(o.time * 2 + x) * c * 0.1;
        ctx.moveTo(x * c + c * 0.2, y * c + c * 0.5 + off);
        ctx.lineTo(x * c + c * 0.8, y * c + c * 0.5 - off);
        ctx.stroke();
      }
      if (ch === TILE.DOOR || ch === TILE.OPEN) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x * c + c * 0.15, y * c + c * 0.15, c * 0.7, c * 0.7);
      }
      if (ch === TILE.WALL && b.theme === "neon") {
        ctx.strokeStyle = "rgba(255,63,164,0.25)";
        ctx.strokeRect(x * c + 1, y * c + 1, c - 2, c - 2);
      }
    }
  }

  // grid
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= b.width; x++) { ctx.moveTo(x * c, 0); ctx.lineTo(x * c, b.height * c); }
  for (let y = 0; y <= b.height; y++) { ctx.moveTo(0, y * c); ctx.lineTo(b.width * c, y * c); }
  ctx.stroke();

  // movement range
  if (o.reach) {
    ctx.fillStyle = "rgba(90,200,255,0.13)";
    for (const cell of o.reach.keys()) ctx.fillRect((cell % b.width) * c, Math.floor(cell / b.width) * c, c, c);
  }
  if (o.aoe) {
    ctx.fillStyle = "rgba(255,120,40,0.25)";
    for (let y = o.aoe.y - o.aoe.r; y <= o.aoe.y + o.aoe.r; y++) for (let x = o.aoe.x - o.aoe.r; x <= o.aoe.x + o.aoe.r; x++) ctx.fillRect(x * c, y * c, c, c);
  }
  if (o.path?.length) {
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(2, c * 0.08);
    ctx.setLineDash([c * 0.2, c * 0.15]);
    ctx.beginPath();
    o.path.forEach(([x, y], i) => (i ? ctx.lineTo(x * c + c / 2, y * c + c / 2) : ctx.moveTo(x * c + c / 2, y * c + c / 2)));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (o.hover) {
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(o.hover[0] * c + 1, o.hover[1] * c + 1, c - 2, c - 2);
  }

  // props
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of b.props) {
    if (!o.revealAll && b.explored[p.y * b.width + p.x] !== "1") continue;
    ctx.fillStyle = p.used ? "rgba(0,0,0,0.35)" : "rgba(255,215,90,0.28)";
    ctx.beginPath();
    ctx.roundRect(p.x * c + c * 0.08, p.y * c + c * 0.08, c * 0.84, c * 0.84, c * 0.15);
    ctx.fill();
    ctx.font = `${c * 0.6}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    ctx.fillText(PROP_GLYPH[p.kind] ?? "❔", p.x * c + c / 2, p.y * c + c / 2 + c * 0.03);
  }

  // fog over explored-but-not-visible
  if (!o.revealAll) {
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      const idx = y * b.width + x;
      if (b.explored[idx] !== "1") { ctx.fillStyle = pal.fog; ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5); }
      else if (!o.vis.has(idx)) { ctx.fillStyle = "rgba(5,5,12,0.5)"; ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5); }
    }
  }

  // tokens
  const tokens = [...b.tokens].sort((a, z) => Number(a.conditions.includes("dead")) - Number(z.conditions.includes("dead")) || 0);
  for (const t of tokens) {
    if (!o.revealAll && !tokenVisible(t, b, o.vis)) continue;
    drawToken(ctx, t, c, o);
  }

  // pings
  for (const p of o.pings ?? []) {
    const age = (o.time - p.t);
    if (age > 2.5) continue;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      const r = ((age * 1.4 + k * 0.5) % 1.2) * c * 1.4;
      ctx.globalAlpha = Math.max(0, 1 - age / 2.5);
      ctx.beginPath();
      ctx.arc(p.x * c + c / 2, p.y * c + c / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawToken(ctx: CanvasRenderingContext2D, t: Token, c: number, o: DrawOpts) {
  const s = t.size * c;
  const cx = t.x * c + s / 2;
  const cy = t.y * c + s / 2;
  const r = s * 0.42;
  const dead = t.conditions.includes("dead");
  const down = t.conditions.includes("unconscious");
  const ring = t.kind === "pc" ? "#59e08a" : isHostile(t) ? "#ff4d4d" : t.disposition === "neutral" ? "#ffd04d" : "#6cc3ff";

  if (t.id === o.currentId && !dead) {
    ctx.fillStyle = "rgba(255,230,120,0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1.35 + Math.sin(o.time * 5) * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = dead ? 0.45 : t.conditions.includes("hidden") ? 0.6 : 1;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.arc(cx + c * 0.04, cy + c * 0.06, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dead ? "#555" : t.color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(2, c * 0.08);
  ctx.strokeStyle = ring;
  ctx.stroke();
  if (t.id === o.selected) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(2, c * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, r + c * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (t.id === o.target) {
    ctx.strokeStyle = "#ff3b3b";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + o.time;
      ctx.beginPath();
      ctx.arc(cx, cy, r + c * 0.16, a, a + 0.9);
      ctx.stroke();
    }
  }
  ctx.font = `${s * 0.5}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(dead ? "✖" : t.glyph, cx, cy + s * 0.03);
  ctx.globalAlpha = 1;

  if (down && !dead) {
    ctx.font = `${c * 0.4}px sans-serif`;
    ctx.fillText("💤", cx + r * 0.8, cy - r * 0.8);
  }

  // HP bar
  if (!dead && t.kind !== "object") {
    const frac = Math.max(0, Math.min(1, t.hp / t.maxHp));
    const bw = s * 0.8;
    const bx = cx - bw / 2;
    const by = t.y * c + s - c * 0.12;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(bx, by, bw, c * 0.1);
    ctx.fillStyle = frac > 0.5 ? "#4cd964" : frac > 0.25 ? "#ffcc00" : "#ff3b30";
    if (t.kind !== "pc" && t.disposition !== "friendly") ctx.fillStyle = frac > 0.5 ? "#c94c4c" : "#ff2020";
    ctx.fillRect(bx, by, bw * frac, c * 0.1);
  }
  // condition pips
  const conds = t.conditions.filter((x) => !["dead", "unconscious"].includes(x));
  conds.slice(0, 4).forEach((cd, i) => {
    ctx.fillStyle = CONDITION_COLOR[cd] ?? "#ccc";
    ctx.beginPath();
    ctx.arc(t.x * c + c * 0.15 + i * c * 0.2, t.y * c + c * 0.12, c * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });

  if (o.labels && c >= 26 && !dead) {
    ctx.font = `600 ${Math.max(10, c * 0.26)}px system-ui, sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(t.name.length > 16 ? `${t.name.slice(0, 15)}…` : t.name, cx, t.y * c + s + c * 0.18);
    ctx.shadowBlur = 0;
  }
}

export const CONDITION_COLOR: Record<string, string> = {
  prone: "#a0784c", poisoned: "#6cd04c", frightened: "#b04cd0", restrained: "#d08a4c", stunned: "#ffe04c",
  blinded: "#444", dodging: "#4cb4ff", raging: "#ff4c4c", marked: "#ff8c1a", blessed: "#ffe9a0", hidden: "#8888aa", disengaged: "#9ad",
};

function hash(x: number, y: number) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return Math.abs(h ^ (h >> 16));
}
