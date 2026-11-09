import { CAMPAIGNS, CAMPAIGN_ORDER } from "../../shared/campaigns";
import { RESKIN } from "../../shared/rules";
import { net } from "../net";
import { store, useStore } from "../store";

export function QuestBoard() {
  const s = useStore((x) => x.state)!;
  const you = useStore((x) => x.you);
  const aiEnabled = useStore((x) => x.aiEnabled);
  const me = s.players[you];
  const host = me?.host;
  const players = Object.values(s.players).filter((p) => p.connected);
  const inCampaign = s.phase === "campaign";
  return (
    <div className="modal-wrap">
      <div className="panel modal wide left" style={{ width: "min(980px, calc(100vw - 24px))" }}>
        <button className="btn close" onClick={() => store.set({ panel: null })}>✕</button>
        <h2>📋 The Quest Board</h2>
        <div className="muted small">
          {host ? "You're the host: pick an adventure to start it for everyone." : "Suggest an adventure — the host (👑) starts it."}
          {" "}Players without a hero get a ready-made one. The {aiEnabled ? "AI Game Master" : "scripted narrator"} will run the game.
        </div>
        {inCampaign && <div className="card" style={{ marginTop: 10 }}>An adventure is already running: <b>{CAMPAIGNS[s.campaign!].name}</b>. {host && <button className="btn small danger" onClick={() => { net.returnToPub(); }}>End it and return to the pub</button>}</div>}
        <div className="grid3" style={{ marginTop: 12 }}>
          {CAMPAIGN_ORDER.map((id) => {
            const c = CAMPAIGNS[id];
            const resume = s.flags[`lastScene:${id}`];
            const voted = s.campaignVote === id;
            return (
              <div key={id} className={`card ${voted ? "on" : ""}`} style={{ borderTop: `4px solid ${c.color}`, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 19, color: c.color }}>{c.name}</div>
                <div className="small" style={{ fontStyle: "italic" }}>{c.tagline}</div>
                <div className="small muted">{c.pitch}</div>
                <div className="small"><b>Heroes:</b> {Object.values(RESKIN[id].classes).join(", ")}</div>
                <div className="small muted">{Object.keys(c.scenes).length} scenes · levels 1–3 · 2–3 hours</div>
                <span style={{ flex: 1 }} />
                {!inCampaign && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {host ? (
                      <>
                        <button className="btn primary" onClick={() => { net.start(id); store.set({ panel: null }); }}>▶ Start</button>
                        {resume && <button className="btn" onClick={() => { net.start(id, true); store.set({ panel: null }); }}>⏯ Continue ({c.scenes[String(resume)]?.title})</button>}
                      </>
                    ) : (
                      <button className="btn" onClick={() => net.vote(id)}>🗳️ Suggest</button>
                    )}
                    {voted && <span className="small" style={{ alignSelf: "center" }}>⭐ Suggested</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <h3>Party</h3>
        {players.map((p) => (
          <div key={p.id} className="small" style={{ margin: "3px 0" }}>
            {p.host ? "👑 " : ""}<b>{p.name}</b> — {p.character ? `${p.character.name}, level ${p.character.level}` : <span className="muted">no hero yet (will get a ready-made one)</span>}
          </div>
        ))}
        {!me?.character && <button className="btn" style={{ marginTop: 8 }} onClick={() => store.set({ panel: "creator" })}>🧙 Make my own hero first</button>}
      </div>
    </div>
  );
}
