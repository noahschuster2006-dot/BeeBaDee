import { net } from "../net";
import { store, useStore } from "../store";

/** The pause menu (Esc): save, invite, settings, leave. */
export function GameMenu() {
  const s = useStore((x) => x.state)!;
  const you = useStore((x) => x.you);
  const room = useStore((x) => x.room);
  const hosting = useStore((x) => x.hosting);
  const netMode = useStore((x) => x.netMode);
  const me = s.players[you];
  const close = () => store.set({ panel: null });
  const invite = () => {
    const url = `${location.origin}${location.pathname}?room=${room}`;
    void navigator.clipboard?.writeText(url);
    store.toast("Invite link copied — send it to your friends!");
  };
  const saves = netMode === "server" || hosting;
  return (
    <div className="modal-wrap" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal game-menu" style={{ width: "min(380px, calc(100vw - 24px))" }}>
        <h2>☰ Menu</h2>
        <div className="small muted" style={{ marginBottom: 10 }}>Table <b>{room}</b>{hosting ? " · you're the host" : me?.host ? " · you're the host" : ""}</div>
        <button className="btn primary big" onClick={close}>▶ Resume</button>
        <button className="btn big" onClick={() => net.saveNow(false)}>💾 Save game</button>
        <button className="btn big" onClick={() => net.saveNow(true)}>⬇ Download save file</button>
        <button className="btn big" onClick={invite}>🔗 Copy invite link</button>
        <div className="menu-grid">
          <button className="btn" onClick={() => store.set({ panel: "inventory" })}>🎒 Pack</button>
          <button className="btn" onClick={() => store.set({ panel: "map" })}>🧭 Map</button>
          <button className="btn" onClick={() => store.set({ panel: "sheet" })} disabled={!me?.character}>📜 Sheet</button>
          <button className="btn" onClick={() => store.set({ panel: "quest" })}>📋 Quests</button>
          <button className="btn" onClick={() => store.set({ panel: "settings" })}>⚙️ Settings</button>
          <button className="btn" onClick={() => store.set({ panel: "help" })}>❔ Help</button>
        </div>
        {me?.host && s.phase === "campaign" && <button className="btn big danger" onClick={() => { if (confirm("End the adventure for everyone and return to the pub? Progress is saved and can be continued from the Quest Board.")) { net.returnToPub(); close(); } }}>🍺 Return everyone to the pub</button>}
        <button className="btn big" onClick={() => { if (confirm(hosting ? "Leave the table? You're the host, so the game pauses for everyone until you come back. It's saved in this browser." : "Leave the table?")) location.href = `${location.pathname}?room=${room}`; }}>🚪 Leave table</button>
        <div className="small muted" style={{ marginTop: 8 }}>{saves ? "The table also saves itself every few seconds." : "Saves are kept by the host's browser. Download a copy to keep your own."}</div>
      </div>
    </div>
  );
}
