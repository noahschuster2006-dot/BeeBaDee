import type { DiceTerm, RollResult } from "./types";

export type Rng = () => number; // returns [0, 1)

export const defaultRng: Rng = () => Math.random();

/** Small seedable PRNG (mulberry32) for tests and deterministic content. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDie(sides: number, rng: Rng = defaultRng): number {
  return 1 + Math.floor(rng() * sides);
}

interface ParsedDice {
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { high: boolean; n: number };
  drop?: { high: boolean; n: number };
}

export interface ParsedExpr {
  dice: ParsedDice[];
  modifier: number;
}

const TERM_RE = /([+-]?)\s*(?:(\d*)d(\d+|%)(?:(kh|kl|dh|dl|k|d)(\d+))?|(\d+))/gi;

/**
 * Parses Foundry-style roll formulas:
 *   1d20+5, 2d6 + 1d4 - 1, 2d20kh1+3 (advantage), 2d20kl1 (disadvantage),
 *   4d6dl1 (drop lowest), d%, d20.
 * Throws on anything it doesn't understand, so chat can show a helpful error.
 */
export function parseDice(expr: string): ParsedExpr {
  if (/[\dd%]\s+[\dd]/i.test(expr.trim())) throw new Error("Missing + or - between terms");
  const src = expr.replace(/\s+/g, "").toLowerCase();
  if (!src) throw new Error("Empty roll");
  const out: ParsedExpr = { dice: [], modifier: 0 };
  let consumed = 0;
  TERM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let first = true;
  while ((m = TERM_RE.exec(src))) {
    if (m.index !== consumed) throw new Error(`Can't read "${src.slice(consumed, m.index) || src.slice(consumed)}"`);
    if (!first && !m[1]) throw new Error(`Missing + or - before "${m[0]}"`);
    first = false;
    consumed = m.index + m[0].length;
    const sign: 1 | -1 = m[1] === "-" ? -1 : 1;
    if (m[6] !== undefined) {
      out.modifier += sign * Number(m[6]);
      continue;
    }
    const count = m[2] ? Number(m[2]) : 1;
    const sides = m[3] === "%" ? 100 : Number(m[3]);
    if (count < 1 || count > 100) throw new Error("Between 1 and 100 dice, please");
    if (sides < 2 || sides > 1000) throw new Error("Dice need 2 to 1000 sides");
    const d: ParsedDice = { sign, count, sides };
    if (m[4]) {
      const n = Number(m[5]);
      if (n < 1 || n > count) throw new Error(`Can't keep/drop ${n} of ${count} dice`);
      const op = m[4];
      if (op === "kh" || op === "k") d.keep = { high: true, n };
      else if (op === "kl") d.keep = { high: false, n };
      else if (op === "dh") d.drop = { high: true, n };
      else d.drop = { high: false, n };
    }
    out.dice.push(d);
  }
  if (consumed !== src.length) throw new Error(`Can't read "${src.slice(consumed)}"`);
  if (out.dice.length === 0 && out.modifier === 0 && !/\d/.test(src)) throw new Error("No dice found");
  return out;
}

export function roll(expr: string, rng: Rng = defaultRng, label?: string): RollResult {
  const p = parseDice(expr);
  const terms: DiceTerm[] = [];
  let total = p.modifier;
  for (const d of p.dice) {
    const rolls = Array.from({ length: d.count }, () => rollDie(d.sides, rng));
    const idx = rolls.map((_, i) => i);
    const sorted = [...idx].sort((a, b) => rolls[a] - rolls[b]); // ascending
    let kept = idx;
    if (d.keep) kept = d.keep.high ? sorted.slice(-d.keep.n) : sorted.slice(0, d.keep.n);
    else if (d.drop) kept = d.drop.high ? sorted.slice(0, d.count - d.drop.n) : sorted.slice(d.drop.n);
    kept = [...kept].sort((a, b) => a - b);
    const sum = kept.reduce((s, i) => s + rolls[i], 0);
    total += d.sign * sum;
    terms.push({ sides: d.sides, rolls, kept });
  }
  const res: RollResult = { expr, total, terms, modifier: p.modifier, label };
  const d20 = terms.find((t) => t.sides === 20 && t.kept.length === 1);
  if (d20 && p.dice.length === 1) {
    const v = d20.rolls[d20.kept[0]];
    if (v === 20) res.crit = true;
    if (v === 1) res.fumble = true;
  }
  return res;
}

/** Doubles the dice (not the modifier) of a damage expression for critical hits. */
export function critExpr(expr: string): string {
  return expr.replace(/(\d*)d(\d+)/gi, (_, n, s) => `${(n ? Number(n) : 1) * 2}d${s}`);
}

export function modStr(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** Natural face value of the kept d20 of a roll (if any). */
export function naturalD20(r: RollResult): number | null {
  const t = r.terms.find((x) => x.sides === 20);
  if (!t || t.kept.length !== 1) return null;
  return t.rolls[t.kept[0]];
}

export function describeRoll(r: RollResult): string {
  const parts = r.terms.map((t) =>
    `[${t.rolls.map((v, i) => (t.kept.includes(i) ? `${v}` : `~${v}~`)).join(", ")}]`,
  );
  return `${r.expr} → ${parts.join(" ")}${r.modifier ? ` ${modStr(r.modifier)}` : ""} = ${r.total}`;
}
