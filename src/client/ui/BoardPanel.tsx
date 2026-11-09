// Foundry-style tactical board: click your token, click a square to move, click a foe to attack.

import { useEffect, useMemo, useRef, useState } from "react";
import { canStand, dist, hasLos, partyVision, pathTo, reachable, tokenDist } from "../../shared/board";
import { CAMPAIGNS } from "../../shared/campaigns";
import { modStr } from "../../shared/dice";
import { CLASSES, MONSTERS, SPELLS, attackBonus, displayName, isHostile, knownSpells, spellAttackBonus, spellDC, attacksPerAction } from "../../shared/rules";
import { SHOP_TIERS, makeItem } from "../../shared/items";
import { RESKIN } from "../../shared/rules";
import type { BoardState, Character, Token } from "../../shared/types";
import { drawBoard, tokenVisible } from "../boardDraw";
import { net, onServer } from "../net";
import { store, useStore } from "../store";

type Mode = null | { kind: "attack"; id: string } | { kind: "cast"; id: string };

export function BoardPanel() {
  const s = useStore((x) => x.state)!;
  const you = useStore((x) => x.you);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef({ x: 20, y: 20, z: 32, fitted: "" });
  const hover = useRef<[number, number] | null>(null);
  const pings = useRef<{ x: number; y: number; t: number; color: string }[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [target, setTarget] = useState<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const targetRef = useRef(target);
  targetRef.current = target;
  const stateRef = useRef(s);
  stateRef.current = s;

  const b = s.board;
  const mine = b.tokens.find((t) => t.ownerId === you);
  const myChar = s.players[you]?.character ?? null;
  const cur = s.combat.active ? b.tokens.find((t) => t.id === s.combat.order[s.combat.turn]) : null;
  const myTurn = !s.combat.active || cur?.id === mine?.id;
  const campaign = s.campaign;
  const vis = useMemo(() => partyVision(b), [b]);
  const visRef = useRef(vis);
  visRef.current = vis;

  useEffect(() => {
    const off = onServer((m) => {
      if (m.t === "ping") pings.current.push({ x: m.x, y: m.y, t: performance.now() / 1000, color: stateRef.current.players[m.from]?.look.primary ?? "#fff" });
    });
    return () => { off(); };
  }, []);

  // render loop
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvasRef.current;
      const wrap = wrapRef.current;
      if (!c || !wrap) return;
      const dpr = Math.min(2, window.devicePixelRatio);
      const W = wrap.clientWidth, H = wrap.clientHeight;
      if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
      const st = stateRef.current;
      const board = st.board;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#050403";
      ctx.fillRect(0, 0, c.width, c.height);
      if (!board.width) {
        ctx.fillStyle = "#b9a88e";
        ctx.font = `${16 * dpr}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText("No adventure yet — visit the Quest Board to begin.", c.width / 2, c.height / 2);
        return;
      }
      const key = `${board.sceneId}:${board.width}x${board.height}`;
      const v = view.current;
      if (v.fitted !== key) {
        v.z = Math.floor(Math.min((W - 20) / board.width, (H - 60) / board.height));
        v.x = (W - board.width * v.z) / 2;
        v.y = (H - board.height * v.z) / 2 + 20;
        v.fitted = key;
      }
      ctx.setTransform(dpr, 0, 0, dpr, dpr * v.x, dpr * v.y);
      const meTok = board.tokens.find((t) => t.ownerId === store.get().you);
      const curTok = st.combat.active ? board.tokens.find((t) => t.id === st.combat.order[st.combat.turn]) : null;
      const canAct = !!meTok && (!st.combat.active || curTok?.id === meTok.id) && !meTok.conditions.includes("unconscious");
      const budget = st.combat.active ? meTok?.turn?.movement ?? 0 : 40;
      const md = modeRef.current;
      let reach: Map<number, number> | null = null;
      let path: [number, number][] | null = null;
      let aoe: { x: number; y: number; r: number } | null = null;
      if (meTok && canAct && !md) {
        reach = st.combat.active ? reachable(board, meTok, budget).cost : null;
        const h = hover.current;
        if (h && !board.tokens.some((t) => t.x === h[0] && t.y === h[1] && !t.conditions.includes("dead"))) {
          const p = pathTo(board, meTok, h[0], h[1], budget);
          if (p) path = [[meTok.x, meTok.y], ...p.path];
        }
      }
      if (md?.kind === "cast" && SPELLS[md.id]?.area && hover.current) aoe = { x: hover.current[0], y: hover.current[1], r: SPELLS[md.id].area! };
      const now = performance.now() / 1000;
      pings.current = pings.current.filter((p) => now - p.t < 2.6);
      drawBoard(ctx, board, {
        cell: v.z, vis: visRef.current, selected: meTok?.id, target: targetRef.current, currentId: curTok?.id, hover: hover.current, reach, path,
        pings: pings.current, time: now, labels: true, aoe,
      });
      if (path && path.length > 1) {
        const [hx, hy] = path[path.length - 1];
        const cost = pathTo(board, meTok!, hx, hy, budget)?.cost ?? 0;
        ctx.font = `700 ${Math.max(11, v.z * 0.35)}px system-ui`;
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 4;
        ctx.fillText(`${cost * 5} ft`, hx * v.z + v.z / 2, hy * v.z - 4);
        ctx.shadowBlur = 0;
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const cellAt = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = view.current;
    const x = Math.floor((e.clientX - r.left - v.x) / v.z);
    const y = Math.floor((e.clientY - r.top - v.y) / v.z);
    if (x < 0 || y < 0 || x >= b.width || y >= b.height) return null;
    return [x, y] as const;
  };

  const tokenAt = (board: BoardState, x: number, y: number) =>
    board.tokens.find((t) => !t.conditions.includes("dead") && x >= t.x && x < t.x + t.size && y >= t.y && y < t.y + t.size && tokenVisible(t, board, vis));

  const doAttack = (atkId: string, tgt: Token) => { if (mine) net.board({ type: "attack", tokenId: mine.id, targetId: tgt.id, attack: atkId }); };
  const doCast = (spellId: string, tgt?: Token, x?: number, y?: number) => { if (mine) net.board({ type: "cast", tokenId: mine.id, spell: spellId, targetId: tgt?.id, x, y }); };

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2) drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onMove = (e: React.MouseEvent) => {
    if (drag.current) {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
      view.current.x += dx; view.current.y += dy;
      drag.current.x = e.clientX; drag.current.y = e.clientY;
    }
    hover.current = cellAt(e) as [number, number] | null;
  };
  const onUp = (e: React.MouseEvent) => {
    if (e.button === 2) {
      const wasDrag = drag.current?.moved;
      drag.current = null;
      if (!wasDrag) { setMode(null); setTarget(null); }
      return;
    }
    drag.current = null;
    if (e.button !== 0) return;
    const c = cellAt(e);
    if (!c) return;
    const [x, y] = c;
    if (e.altKey || e.shiftKey) { net.ping(x, y); return; }
    const tok = tokenAt(b, x, y);
    if (mode) {
      if (mode.kind === "attack" && tok && tok !== mine) doAttack(mode.id, tok);
      else if (mode.kind === "cast") {
        const sp = SPELLS[mode.id];
        if (sp.area) doCast(mode.id, tok, x, y);
        else if (tok) doCast(mode.id, tok);
        else return;
      }
      setMode(null);
      return;
    }
    if (tok && tok !== mine) { setTarget(tok.id); return; }
    if (!mine) return;
    const prop = b.props.find((p) => p.x === x && p.y === y);
    if (prop) {
      if (dist(mine.x, mine.y, prop.x, prop.y) <= 1) net.board({ type: "interact", tokenId: mine.id, propId: prop.id });
      else {
        const budget = s.combat.active ? mine.turn?.movement ?? 0 : 40;
        const { cost } = reachable(b, mine, budget);
        let best: [number, number] | null = null;
        let bc = Infinity;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const cx = prop.x + dx, cy = prop.y + dy;
          const cc = cost.get(cy * b.width + cx);
          if (cc !== undefined && cc < bc && canStand(b, mine, cx, cy)) { bc = cc; best = [cx, cy]; }
        }
        if (best) {
          net.board({ type: "move", tokenId: mine.id, x: best[0], y: best[1] });
          net.board({ type: "interact", tokenId: mine.id, propId: prop.id });
        } else store.toast("Can't reach that from here.", "error");
      }
      return;
    }
    if (tok === mine) return;
    net.board({ type: "move", tokenId: mine.id, x, y });
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = view.current;
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const nz = Math.max(10, Math.min(110, v.z * (e.deltaY < 0 ? 1.12 : 0.89)));
    v.x = mx - ((mx - v.x) / v.z) * nz;
    v.y = my - ((my - v.y) / v.z) * nz;
    v.z = nz;
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") { if (modeRef.current) setMode(null); else store.set({ panel: null }); }
      if (e.key === " " && mine && s.combat.active && cur?.id === mine.id) { e.preventDefault(); net.board({ type: "endTurn", tokenId: mine.id }); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [mine, cur, s.combat.active]);

  const tgt = target ? b.tokens.find((t) => t.id === target) : undefined;
  const isHost = s.players[you]?.host;

  return (
    <div className="board-wrap">
      <div className="board-main" ref={wrapRef}>
        <canvas ref={canvasRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onWheel={onWheel} onContextMenu={(e) => e.preventDefault()} onMouseLeave={() => (hover.current = null)} />
        <div className="board-top">
          <div className="panel" style={{ padding: "6px 12px" }}>
            <b style={{ fontFamily: "var(--serif)", color: "var(--gold)" }}>{b.title || "The Gilded Mug"}</b>
            {s.combat.active && <span className="muted"> · ⚔️ Round {s.combat.round} · {cur?.name}'s turn</span>}
          </div>
          <span style={{ flex: 1 }} />
          {mode && <div className="panel" style={{ padding: "6px 12px", borderColor: "var(--accent)" }}>🎯 Choose a target for <b>{mode.kind === "attack" ? labelAttack(campaign, myChar, mode.id) : displayName(campaign, mode.id, SPELLS[mode.id].name)}</b> <button className="btn small" onClick={() => setMode(null)}>Cancel</button></div>}
          <button className="btn" onClick={() => store.set({ panel: null })}>✕ Close <span className="muted small">Esc</span></button>
        </div>
        <div className="panel board-tip">Click a square to move · click a creature to target it · right-drag to pan · wheel to zoom · Alt+click to ping · Space to end your turn</div>
      </div>

      <div className="board-side">
        {mine && myChar ? (
          <MyToken t={mine} c={myChar} campaign={campaign} myTurn={myTurn} combat={s.combat.active}
            onAttack={(id) => { if (tgt && isTargetable(tgt)) doAttack(id, tgt); else setMode({ kind: "attack", id }); }}
            onCast={(id) => {
              const sp = SPELLS[id];
              if ((sp.kind === "heal" || sp.kind === "buff") && !tgt) { setMode({ kind: "cast", id }); return; }
              if (tgt && !sp.area) doCast(id, tgt); else setMode({ kind: "cast", id });
            }} />
        ) : (
          <div className="panel"><b>No token on the board.</b><div className="small muted">{s.phase === "pub" ? "Start an adventure from the Quest Board." : "Create a hero to join in."}</div></div>
        )}
        {tgt && mine && <TargetCard t={tgt} from={mine} board={b} clear={() => setTarget(null)} />}
        {mine && myChar && !s.combat.active && b.props.filter((p) => p.shop && dist(p.x, p.y, mine.x, mine.y) <= 1).map((p) => (
          <div key={p.id} className="panel">
            <b>🛒 {p.name}</b> <span className="small muted">· you have {myChar.gold} {campaign ? RESKIN[campaign].currency : "gold"}</span>
            <div className="actions" style={{ marginTop: 6 }}>
              {(SHOP_TIERS[p.shop!] ?? []).map((id) => {
                const it = makeItem(id, campaign);
                return <button key={id} className="btn" title={it.desc} disabled={myChar.gold < (it.price ?? 0)} onClick={() => net.board({ type: "buy", tokenId: mine.id, propId: p.id, itemId: id })}>{it.name}<small>{it.price} · {it.desc}</small></button>;
              })}
            </div>
          </div>
        ))}
        {s.combat.active && <Tracker s={s.combat} tokens={b.tokens} vis={vis} board={b} you={you} />}
        {!s.combat.active && s.phase === "campaign" && (
          <div className="panel">
            <h3 style={{ margin: "0 0 6px" }} className="muted small">REST</h3>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" onClick={() => net.rest("short")}>☕ Short rest</button>
              <button className="btn" onClick={() => net.rest("long")}>🌙 Long rest</button>
            </div>
            {isHost && <button className="btn danger" style={{ marginTop: 8 }} onClick={() => { if (confirm("End the session and return everyone to the pub? Progress in this scene is saved.")) net.returnToPub(); }}>🍺 Return to the pub</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function isTargetable(t: Token) { return !t.conditions.includes("dead"); }

function labelAttack(campaign: string | null, c: Character | null, id: string) {
  const a = c ? CLASSES[c.cls].attacks.find((x) => x.id === id) : undefined;
  return displayName(campaign as never, id, a?.name ?? id);
}

function MyToken({ t, c, campaign, myTurn, combat, onAttack, onCast }: {
  t: Token; c: Character; campaign: string | null; myTurn: boolean; combat: boolean;
  onAttack: (id: string) => void; onCast: (id: string) => void;
}) {
  const cls = CLASSES[c.cls];
  const budget = t.turn;
  const down = t.conditions.includes("unconscious");
  const canAct = myTurn && !down;
  const act = (type: "dash" | "dodge" | "disengage" | "hide" | "endTurn") => net.board({ type, tokenId: t.id });
  const cn = campaign ? CAMPAIGNS[campaign as keyof typeof CAMPAIGNS] : null;
  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b>{t.glyph} {t.name}</b>
        <span className="small muted">AC {t.ac} · {t.speed * 5} ft</span>
      </div>
      <div className="bar" style={{ margin: "6px 0" }}><i style={{ width: `${(t.hp / t.maxHp) * 100}%`, background: t.hp / t.maxHp > 0.5 ? "var(--good)" : t.hp / t.maxHp > 0.25 ? "#ffcc00" : "var(--bad)" }} /></div>
      <div className="small">HP {t.hp}/{t.maxHp}{c.tempHp ? ` (+${c.tempHp})` : ""} {t.conditions.length > 0 && <span className="muted">· {t.conditions.join(", ")}</span>}</div>
      {down && <div className="small" style={{ color: "var(--bad)" }}>💤 Unconscious — death saves {c.deathSaves.success}✔ {c.deathSaves.fail}✖. An ally can heal you!</div>}
      {combat && budget && (
        <div className="budget" style={{ margin: "8px 0" }}>
          <span>👣 {budget.movement * 5} ft</span>
          <span className={budget.action ? "" : "used"}>Action</span>
          <span className={budget.bonus ? "" : "used"}>Bonus</span>
          <span className={budget.reaction ? "" : "used"}>Reaction</span>
        </div>
      )}
      {combat && !myTurn && <div className="small muted" style={{ margin: "6px 0" }}>Waiting for your turn…</div>}

      <h3>Attacks</h3>
      <div className="actions">
        {cls.attacks.map((a) => {
          const { bonus, dmgMod } = attackBonus(c, a);
          return (
            <button key={a.id} className="btn" disabled={!canAct || (combat && !budget?.action)} onClick={() => onAttack(a.id)}>
              ⚔️ {displayName(campaign as never, a.id, a.name)}{attacksPerAction(c) > 1 ? " ×2" : ""}
              <small>{modStr(bonus)} to hit · {a.damage}{modStr(dmgMod)} {a.type} · {a.range > 1 ? `${a.range * 5} ft` : "melee"}</small>
            </button>
          );
        })}
      </div>
      {knownSpells(c).length > 0 && (
        <>
          <h3>Spells <span className="muted small">· slots {c.spellSlots}/{c.maxSpellSlots} · DC {spellDC(c)} · {modStr(spellAttackBonus(c))}</span></h3>
          <div className="actions">
            {knownSpells(c).map((id) => {
              const sp = SPELLS[id];
              const locked = false;
              return (
                <button key={id} className="btn" title={sp.desc} disabled={!canAct || locked || (sp.level > 0 && c.spellSlots <= 0) || (combat && (sp.bonusAction ? !budget?.bonus : !budget?.action))} onClick={() => onCast(id)}>
                  ✨ {displayName(campaign as never, id, sp.name)}
                  <small>{sp.level === 0 ? "cantrip" : `level ${sp.level}`}{sp.bonusAction ? " · bonus" : ""} · {sp.range * 5} ft{locked ? " · lvl 2" : ""}</small>
                </button>
              );
            })}
          </div>
        </>
      )}
      {Object.keys(c.features).length > 0 && (
        <>
          <h3>Features</h3>
          <div className="actions">
            {cls.features.filter((f) => c.features[f.id] !== undefined && f.id !== "sneak" && f.id !== "arcanerecovery").map((f) => (
              <button key={f.id} className="btn" title={f.desc} disabled={!canAct || c.features[f.id] <= 0} onClick={() => net.board({ type: "feature", tokenId: t.id, feature: f.id })}>
                ⭐ {f.name}<small>{c.features[f.id]} left{f.bonusAction ? " · bonus" : ""}</small>
              </button>
            ))}
          </div>
        </>
      )}
      <h3>Actions</h3>
      <div className="actions">
        {combat && <button className="btn" disabled={!canAct || !budget?.action} onClick={() => act("dash")}>🏃 Dash<small>double move</small></button>}
        <button className="btn" disabled={!canAct || (combat && !budget?.action)} onClick={() => act("dodge")}>🛡️ Dodge<small>attacks have disadvantage</small></button>
        {combat && <button className="btn" disabled={!canAct} onClick={() => act("disengage")}>↩️ Disengage<small>no opportunity attacks</small></button>}
        <button className="btn" disabled={!canAct} onClick={() => act("hide")}>🫥 Hide<small>Stealth check</small></button>
        {c.inventory.filter((i) => i.heal).map((i) => (
          <button key={i.id} className="btn" disabled={!canAct || (combat && !budget?.bonus)} onClick={() => net.board({ type: "useItem", tokenId: t.id, itemId: i.id })}>🧪 {i.name}<small>×{i.qty ?? 1} · heals {i.heal}</small></button>
        ))}
      </div>
      {combat && <button className="btn primary" style={{ width: "100%", marginTop: 10 }} disabled={!myTurn} onClick={() => act("endTurn")}>End turn ⏭</button>}
      {cn && <div className="small muted" style={{ marginTop: 8 }}>{cn.name}</div>}
    </div>
  );
}

function TargetCard({ t, from, board, clear }: { t: Token; from: Token; board: BoardState; clear: () => void }) {
  const m = t.statId ? MONSTERS[t.statId] : undefined;
  const d = tokenDist(from, t);
  const frac = t.hp / t.maxHp;
  const health = t.kind === "pc" ? `${t.hp}/${t.maxHp} HP` : frac >= 1 ? "Unhurt" : frac > 0.5 ? "Wounded" : frac > 0.25 ? "Bloodied" : "Near death";
  return (
    <div className="panel" style={{ borderColor: isHostile(t) ? "#ff5a5a66" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <b>🎯 {t.glyph} {t.name}</b>
        <button className="btn small" onClick={clear}>✕</button>
      </div>
      <div className="small muted">{health} · AC {t.ac} · {d * 5} ft away{!hasLos(board, from.x, from.y, t.x, t.y) ? " · no line of sight" : ""}</div>
      {t.conditions.length > 0 && <div className="small">{t.conditions.join(", ")}</div>}
      {m && <div className="small muted" style={{ marginTop: 4 }}>{m.desc}</div>}
      <div className="small muted" style={{ marginTop: 4 }}>Pick an attack or spell to use it on this target.</div>
    </div>
  );
}

function Tracker({ s, tokens, vis, board, you }: { s: { order: string[]; turn: number; round: number }; tokens: Token[]; vis: Set<number>; board: BoardState; you: string }) {
  return (
    <div className="panel tracker">
      <h3 style={{ margin: "0 0 6px" }} className="muted small">INITIATIVE · ROUND {s.round}</h3>
      {s.order.map((id, i) => {
        const t = tokens.find((x) => x.id === id);
        if (!t) return null;
        const hidden = t.kind !== "pc" && !tokenVisible(t, board, vis);
        const dead = t.conditions.includes("dead");
        return (
          <div key={id} className={`row ${i === s.turn ? "cur" : ""} ${dead ? "dead" : ""}`}>
            <span className="dot" style={{ background: t.kind === "pc" ? "#59e08a" : isHostile(t) ? "#ff4d4d" : "#6cc3ff" }} />
            <span style={{ width: 22, textAlign: "right" }} className="muted">{t.initiative}</span>
            <span>{hidden ? "??? (unseen)" : `${t.glyph} ${t.name}`}{t.ownerId === you ? " (you)" : ""}</span>
            <span style={{ flex: 1 }} />
            {t.kind === "pc" && <span className="small muted">{t.hp}/{t.maxHp}</span>}
          </div>
        );
      })}
    </div>
  );
}
