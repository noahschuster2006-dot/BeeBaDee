// Enemy (and hostile NPC) turns. Deterministic and cheap: the AI GM narrates, this plays the monsters.
// Returns a list of steps so the room can pace them out and the table can watch each move.

import { canStand, dist, hasLos, pathTo, reachable, tokenDist } from "../shared/board";
import { MONSTERS, isDown } from "../shared/rules";
import type { Token } from "../shared/types";
import type { Game } from "./game";

export type Step = () => void;

export function enemyTurn(g: Game, me: Token): Step[] {
  const m = me.statId ? MONSTERS[me.statId] : undefined;
  const steps: Step[] = [];
  const targets = g.livingPcs();
  if (!m || targets.length === 0 || !me.turn) return [() => g.nextTurn()];

  const melee = m.attacks.find((a) => a.range <= 1);
  const ranged = m.attacks.find((a) => a.range > 1);
  const frightened = me.conditions.includes("frightened");
  const fleeing = m.tactics === "coward" && me.hp < me.maxHp * 0.3;

  // pick the closest target by path length, preferring wounded ones a little
  const { cost } = reachable(g.board, me, 60);
  const scoreOf = (t: Token) => {
    let best = Infinity;
    for (let dy = -1; dy <= t.size; dy++) for (let dx = -1; dx <= t.size; dx++) {
      const c = cost.get((t.y + dy) * g.board.width + (t.x + dx));
      if (c !== undefined && c < best) best = c;
    }
    if (tokenDist(me, t) <= 1) best = 0;
    return (best === Infinity ? 100 + tokenDist(me, t) : best) - (t.hp < t.maxHp / 2 ? 1.5 : 0);
  };
  const target = [...targets].sort((a, b) => scoreOf(a) - scoreOf(b))[0];

  const canShoot = (from: Token) =>
    !!ranged && tokenDist(from, target) <= ranged.range && hasLos(g.board, from.x, from.y, target.x, target.y);

  const preferRange = (m.tactics === "ranged" || m.tactics === "caster") && !!ranged;
  const adjacentPc = () => g.livingPcs().some((p) => tokenDist(me, p) <= 1);

  // movement decision
  let dest: [number, number] | null = null;
  if (fleeing || frightened) {
    dest = farthestSpot(g, me, target);
  } else if (preferRange && canShoot(me) && !adjacentPc()) {
    dest = null; // already in a good spot
  } else if (preferRange && adjacentPc()) {
    dest = kiteSpot(g, me, target, ranged!.range);
  } else if (tokenDist(me, target) > 1 && melee) {
    dest = approachSpot(g, me, target);
  } else if (!melee && ranged && !canShoot(me)) {
    dest = approachSpot(g, me, target);
  }

  if (dest && (dest[0] !== me.x || dest[1] !== me.y)) {
    const [x, y] = dest;
    steps.push(() => {
      if (isDown(me) || !me.turn) return;
      const p = pathTo(g.board, me, x, y, me.turn.movement);
      if (!p) return;
      me.turn.movement -= p.cost;
      // enemies leaving a PC's reach can provoke
      g.opportunityAttacks(me, [me.x, me.y], p.path);
      if (isDown(me)) return;
      me.x = x;
      me.y = y;
    });
  }

  // attack decision (evaluated after moving): area special if it catches enough heroes, else attacks
  steps.push(() => {
    if (isDown(me) || !me.turn?.action || !g.state.combat.active) return;
    const sp = m.special;
    if (sp && me.specialReady) {
      let best: { x: number; y: number; n: number } | null = null;
      for (const p of g.livingPcs()) {
        if (dist(me.x, me.y, p.x, p.y) > sp.range + sp.area || !hasLos(g.board, me.x, me.y, p.x, p.y)) continue;
        const n = g.livingPcs().filter((o) => dist(o.x, o.y, p.x, p.y) <= sp.area).length;
        if (!best || n > best.n) best = { x: p.x, y: p.y, n };
      }
      if (best && (best.n >= 2 || g.livingPcs().length === 1 || m.boss)) {
        me.turn.action = false;
        me.specialReady = false;
        g.monsterSpecial(me, sp, best.x, best.y);
        return;
      }
    }
    me.turn.action = false;
    const swings = m.multiattack ?? 1;
    for (let i = 0; i < swings; i++) {
      if (isDown(me) || !g.state.combat.active) return;
      let foe: Token | undefined = !isDown(target) ? target : undefined;
      const adj = g.livingPcs().filter((p) => tokenDist(me, p) <= (melee?.range ?? 1));
      if (!foe || (melee && tokenDist(me, foe) > melee.range && adj.length)) foe = adj[0] ?? g.livingPcs()[0];
      if (!foe) return;
      if (melee && tokenDist(me, foe) <= melee.range) g.monsterAttack(me, foe, melee);
      else if (ranged && tokenDist(me, foe) <= ranged.range && hasLos(g.board, me.x, me.y, foe.x, foe.y)) g.monsterAttack(me, foe, ranged);
      else return;
    }
  });

  steps.push(() => {
    if (g.state.combat.active && g.current() === me) g.nextTurn();
  });
  return steps;
}

function approachSpot(g: Game, me: Token, target: Token): [number, number] | null {
  const budget = me.turn!.movement;
  const { cost } = reachable(g.board, me, budget);
  let best: [number, number] | null = null;
  let bestScore = Infinity;
  for (const [cell, c] of cost) {
    const x = cell % g.board.width;
    const y = Math.floor(cell / g.board.width);
    if (!canStand(g.board, me, x, y)) continue;
    const d = tokenDist({ ...me, x, y }, target);
    const score = d * 10 + c * 0.1;
    if (score < bestScore) { bestScore = score; best = [x, y]; }
  }
  return best;
}

function kiteSpot(g: Game, me: Token, target: Token, range: number): [number, number] | null {
  const { cost } = reachable(g.board, me, me.turn!.movement);
  let best: [number, number] | null = null;
  let bestScore = -Infinity;
  for (const [cell, c] of cost) {
    const x = cell % g.board.width;
    const y = Math.floor(cell / g.board.width);
    if (!canStand(g.board, me, x, y)) continue;
    const probe = { ...me, x, y };
    const d = tokenDist(probe, target);
    if (d > range || !hasLos(g.board, x, y, target.x, target.y)) continue;
    const nearPc = Math.min(...g.livingPcs().map((p) => tokenDist(probe, p)));
    const score = Math.min(nearPc, 6) * 3 - c * 0.2;
    if (score > bestScore) { bestScore = score; best = [x, y]; }
  }
  return best;
}

function farthestSpot(g: Game, me: Token, target: Token): [number, number] | null {
  const { cost } = reachable(g.board, me, me.turn!.movement);
  let best: [number, number] | null = null;
  let bestD = -1;
  for (const cell of cost.keys()) {
    const x = cell % g.board.width;
    const y = Math.floor(cell / g.board.width);
    if (!canStand(g.board, me, x, y)) continue;
    const d = tokenDist({ ...me, x, y }, target);
    if (d > bestD) { bestD = d; best = [x, y]; }
  }
  return best;
}
