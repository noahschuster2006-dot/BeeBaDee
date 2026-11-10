import { CAMPAIGNS } from "../../shared/campaigns";
import { WORLD_MAPS, isEncounter, placeOf, type Place } from "../../shared/encounters";
import { net } from "../net";
import { store, useStore } from "../store";

const TERRAIN_ICON: Record<string, string> = {
  meadow: "🌾", woods: "🌲", highland: "⛰️", bog: "🌫️", tunnels: "🕳️", fungus: "🍄", lake: "💧", thorns: "🌿",
  alley: "🏮", rooftop: "🏙️", underpass: "🌉", warehouse: "🏭",
};
const TERRAIN_NAME: Record<string, string> = {
  meadow: "fields", woods: "forest", highland: "hills", bog: "marsh", tunnels: "tunnels", fungus: "fungal caves", lake: "underground lake", thorns: "brambles",
  alley: "back alleys", rooftop: "rooftops", underpass: "underpasses", warehouse: "warehouses",
};

export function WorldMap() {
  const s = useStore((x) => x.state)!;
  const you = useStore((x) => x.you);
  const close = () => store.set({ panel: null });
  const theme = s.campaign;
  if (!theme) {
    return (
      <div className="modal-wrap" onClick={(e) => e.target === e.currentTarget && close()}>
        <div className="panel modal"><button className="btn close" onClick={close}>✕</button><h2>🧭 World map</h2><p>Pick an adventure on the Quest Board first. Each world has its own map to fill in as you travel.</p></div>
      </div>
    );
  }
  const wm = WORLD_MAPS[theme];
  const flags = s.flags;
  const visited = new Set(wm.places.filter((p) => flags[`visited:${p.id}`]).map((p) => p.id));
  const rumoured = new Set<string>();
  for (const [a, b] of wm.roads) { if (visited.has(a) && !visited.has(b)) rumoured.add(b); if (visited.has(b) && !visited.has(a)) rumoured.add(a); }
  const byId = Object.fromEntries(wm.places.map((p) => [p.id, p])) as Record<string, Place>;
  const sceneId = s.board.sceneId;
  const travelling = isEncounter(sceneId);
  const destId = travelling ? sceneId.split("~").slice(6).join("~") : "";
  const here = travelling ? byId[String(flags.place ?? "")] : placeOf(theme, sceneId);
  const dest = travelling && destId !== "@return" ? placeOf(theme, destId) : undefined;
  const marker = here && dest ? { x: (here.x + dest.x) / 2, y: (here.y + dest.y) / 2 } : here ? { x: here.x, y: here.y } : null;
  const host = s.players[you]?.host;
  const canExplore = host && !travelling && !s.combat.active && !!here;
  const W = 100, H = 100;
  const known = (id: string) => visited.has(id) || rumoured.has(id);
  const rep = Number(flags.reputation ?? 0), crimes = Number(flags.crimes ?? 0);

  return (
    <div className="modal-wrap" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal wide" style={{ width: "min(1040px, calc(100vw - 24px))" }}>
        <button className="btn close" onClick={close}>✕</button>
        <h2>🧭 {wm.title}</h2>
        <div className="map-layout">
          <svg className="world-map" viewBox={`-4 -4 ${W + 8} ${H + 8}`} role="img" aria-label={`Map of ${wm.title}`}>
            <defs>
              <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="0.8" /></filter>
              <pattern id="hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2" stroke="rgba(80,60,40,0.12)" strokeWidth="0.5" /></pattern>
            </defs>
            <rect x={-4} y={-4} width={W + 8} height={H + 8} fill="#efe3c8" />
            <rect x={-4} y={-4} width={W + 8} height={H + 8} fill="url(#hatch)" />
            <rect x={-2} y={-2} width={W + 4} height={H + 4} fill="none" stroke="#5a4630" strokeWidth="0.6" filter="url(#rough)" />
            {wm.roads.map(([a, b]) => {
              if (!known(a) || !known(b)) return null;
              const pa = byId[a], pb = byId[b];
              const mx = (pa.x + pb.x) / 2 + (pa.y - pb.y) * 0.12, my = (pa.y + pb.y) / 2 + (pb.x - pa.x) * 0.12;
              const sure = visited.has(a) && visited.has(b);
              return <path key={a + b} d={`M${pa.x},${pa.y} Q${mx},${my} ${pb.x},${pb.y}`} fill="none" stroke="#6a5038" strokeWidth={sure ? 0.7 : 0.45} strokeDasharray={sure ? "2 1.2" : "0.8 1.6"} opacity={sure ? 0.9 : 0.5} filter="url(#rough)" />;
            })}
            {wm.places.map((p) => {
              if (!known(p.id)) return null;
              const seen = visited.has(p.id);
              return (
                <g key={p.id} opacity={seen ? 1 : 0.55}>
                  <circle cx={p.x} cy={p.y} r={3.4} fill={seen ? "#fff6e0" : "none"} stroke="#3a2a1a" strokeWidth={0.5} strokeDasharray={seen ? undefined : "0.8 0.8"} filter="url(#rough)" />
                  <text x={p.x} y={p.y + 1.3} fontSize="3.6" textAnchor="middle">{seen ? TERRAIN_ICON[p.terrain] ?? "📍" : "?"}</text>
                  <text x={p.x} y={p.y + 7} fontSize="2.6" textAnchor="middle" fill="#2a1e14" style={{ fontFamily: "var(--title)" }}>{seen ? p.name : "Rumoured place"}</text>
                </g>
              );
            })}
            {marker && (
              <g>
                <circle cx={marker.x} cy={marker.y} r={5} fill="none" stroke="#c0392b" strokeWidth={0.7} className="map-pulse" />
                <text x={marker.x} y={marker.y - 5.8} fontSize="2.4" textAnchor="middle" fill="#c0392b" fontWeight="bold">{travelling ? "On the road" : "You are here"}</text>
              </g>
            )}
            <text x={W - 1} y={H + 2} fontSize="2.2" textAnchor="end" fill="#6a5038">N ↑</text>
          </svg>
          <div className="map-side">
            <h3>{travelling ? `On the road${dest ? ` to ${dest.name}` : ""}` : here?.name ?? s.board.title}</h3>
            {here && !travelling && <div className="small">{here.desc}</div>}
            <div className="small muted">Now: {s.board.title}</div>
            {here && <div className="small" style={{ marginTop: 6 }}>{TERRAIN_ICON[here.terrain]} The land around here is {TERRAIN_NAME[here.terrain] ?? here.terrain}.</div>}
            <h3>Journey so far</h3>
            <div className="small">{visited.size} of {wm.places.length} places visited · {rumoured.size} rumoured</div>
            <div className="small">⭐ Reputation: {rep >= 0 ? `+${rep}` : rep} · 🩸 Crimes: {crimes}</div>
            <div className="small muted" style={{ marginTop: 4 }}>{CAMPAIGNS[theme].acts.find((a) => a.scenes.includes(travelling ? destId : sceneId))?.title ?? ""}</div>
            <h3>Explore</h3>
            <div className="small muted">Leave the story for a while to roam the {here ? TERRAIN_NAME[here.terrain] : "wilds"} nearby: the dice decide whether you find a fight, a stranger or something stranger. You'll come back right where you left off.</div>
            {host ? (
              <button className="btn primary" style={{ marginTop: 8 }} disabled={!canExplore} onClick={() => { net.explore(); close(); }}>🧭 Explore the wilds</button>
            ) : <div className="small" style={{ marginTop: 6 }}>Ask the host (👑) to lead an expedition.</div>}
            {!canExplore && host && <div className="small muted">{s.combat.active ? "Not during a fight." : travelling ? "You're already out in the wilds." : ""}</div>}
            <h3>Legend</h3>
            <div className="small legend">{Object.entries(TERRAIN_NAME).filter(([k]) => wm.places.some((p) => p.terrain === k)).map(([k, v]) => <span key={k}>{TERRAIN_ICON[k]} {v}</span>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
