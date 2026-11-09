// Shared structural checks for campaign content (used by tests and handy from the CLI).
import { blocksMove, parseMap } from "../src/shared/board";
import { furnishedMap } from "../src/shared/furnish";
import { MONSTERS } from "../src/shared/monsters";
import { ITEM_IDS } from "../src/shared/items";
import type { ActionDef, CampaignDef } from "../src/shared/campaigns";

export function checkCampaign(c: CampaignDef): string[] {
  const errs: string[] = [];
  const sceneIds = Object.keys(c.scenes);
  if (!c.scenes[c.start]) errs.push(`${c.id}: start scene missing`);
  for (const a of c.acts) for (const s of a.scenes) if (!c.scenes[s]) errs.push(`${c.id}: act lists unknown scene ${s}`);
  for (const s of Object.values(c.scenes)) {
    const where = `${c.id}/${s.id}`;
    s.map.forEach((r, i) => { if (r.length !== 28) errs.push(`${where}: row ${i} has width ${r.length}`); });
    if (s.map.length !== 16) errs.push(`${where}: ${s.map.length} rows`);
    const parsed = parseMap(furnishedMap(s));
    for (const ch of Object.keys(parsed.marks)) if (!s.marks[ch]) errs.push(`${where}: unknown marker "${ch}"`);
    for (const ch of Object.keys(s.marks)) if (!parsed.marks[ch]) errs.push(`${where}: marker "${ch}" not on the map`);
    if ((parsed.marks.S ?? []).length < 6) errs.push(`${where}: needs 6 start squares`);
    const ids = s.triggers.map((t) => t.id);
    if (new Set(ids).size !== ids.length) errs.push(`${where}: duplicate trigger ids`);
    const opened = new Set<string>();
    const walk = (acts: ActionDef[]) => {
      for (const a of acts) {
        if (a.do === "scene" && !sceneIds.includes(a.id)) errs.push(`${where}: → unknown scene ${a.id}`);
        if (a.do === "trigger" && !ids.includes(a.id)) errs.push(`${where}: → unknown trigger ${a.id}`);
        if (a.do === "loot" && a.itemId && !ITEM_IDS.includes(a.itemId)) errs.push(`${where}: unknown item ${a.itemId}`);
        if (a.do === "loot" && a.relic && !c.relics.some((r) => r.id === a.relic)) errs.push(`${where}: unknown relic ${a.relic}`);
        if (a.do === "setTile") opened.add(`${a.x},${a.y}`);
        if (a.do === "check") { walk(a.success); walk(a.fail); }
        if (a.do === "if") { walk(a.then ?? []); walk(a.else ?? []); }
        if (a.do === "choice") a.options.forEach((o) => walk(o.actions));
        if (a.do === "random") a.outcomes.forEach((o) => walk(o.actions));
        if (a.do === "ai" && a.fallback) walk(a.fallback);
        if ((a.do === "spawn" || a.do === "hostile" || a.do === "befriend" || a.do === "remove") && !Object.values(s.marks).some((m) => (m.type === "enemy" || m.type === "npc") && m.group === a.group)) errs.push(`${where}: group ${a.group} has no members`);
      }
    };
    for (const t of s.triggers) walk(t.actions);
    for (const m of Object.values(s.marks)) {
      if (m.type === "enemy") for (const id of [m.monster].flat()) if (!MONSTERS[id]) errs.push(`${where}: unknown monster ${id}`);
      if (m.type === "npc" && m.monster && !MONSTERS[m.monster]) errs.push(`${where}: unknown monster ${m.monster}`);
      if (m.type === "prop" && m.interact && !ids.includes(m.interact)) errs.push(`${where}: prop trigger ${m.interact} missing`);
    }
    // reachability from the first start square (treat tiles opened by scripts as passable)
    const [sx, sy] = parsed.marks.S?.[0] ?? [1, 1];
    const seen = new Set<string>([`${sx},${sy}`]);
    const q: [number, number][] = [[sx, sy]];
    const pass = (x: number, y: number) => x >= 0 && y >= 0 && x < parsed.width && y < parsed.height && (!blocksMove(parsed.tiles[y][x]) || opened.has(`${x},${y}`));
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!pass(nx, ny) || seen.has(`${nx},${ny}`)) continue;
        if (dx && dy && !pass(x + dx, y) && !pass(x, y + dy)) continue;
        seen.add(`${nx},${ny}`);
        q.push([nx, ny]);
      }
    }
    for (const [ch, spots] of Object.entries(parsed.marks)) {
      const m = s.marks[ch];
      if (!m || m.type === "start") continue;
      for (const [x, y] of spots) {
        const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`));
        if (!near) errs.push(`${where}: "${ch}" at ${x},${y} is unreachable`);
      }
    }
    for (const t of s.triggers) if (t.when.type === "enter") {
      const [x0, y0, x1, y1] = t.when.rect;
      let ok = false;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (seen.has(`${x},${y}`)) ok = true;
      if (!ok) errs.push(`${where}: enter trigger ${t.id} can't be reached`);
    }
  }
  return errs;
}
