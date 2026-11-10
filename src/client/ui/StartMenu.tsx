import { useEffect, useMemo, useState } from "react";
import { CAMPAIGNS } from "../../shared/campaigns";
import type { RoomState } from "../../shared/types";
import { connect } from "../net";
import type { GmSettings } from "../p2p";
import { GM_KEY, NAME_KEY, loadLocalRaw, saveLocal, store } from "../store";
import { sound } from "../world/audio";
import { SettingsPanel } from "./Settings";
import { Help } from "./Help";

const ADJ = ["mossy", "rusty", "lucky", "salty", "sleepy", "brave", "neon", "pale", "grumpy", "jolly", "sneaky", "golden"];
const NOUN = ["goblin", "lantern", "tankard", "beetle", "dragon", "dice", "gremlin", "knight", "mantis", "toad", "rogue", "owlbear"];
export const newTableCode = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]}-${NOUN[Math.floor(Math.random() * NOUN.length)]}-${Math.floor(10 + Math.random() * 90)}`;

const RECENT_KEY = "bbd.recent";
const ROOM_PREFIX = "bbd.room.";

export interface SaveInfo { code: string; at: number; campaign: string | null; scene: string; heroes: string[]; hosted: boolean }

/** Tables this browser has visited, with what it knows about each (hosted ones keep a full save). */
export function listSaves(): SaveInfo[] {
  const out = new Map<string, SaveInfo>();
  let recent: { code: string; at: number }[] = [];
  try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { recent = []; }
  for (const r of recent) out.set(r.code, { code: r.code, at: r.at, campaign: null, scene: "", heroes: [], hosted: false });
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(ROOM_PREFIX)) continue;
    const code = key.slice(ROOM_PREFIX.length);
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as { state?: RoomState; savedAt?: number };
      const st = raw.state;
      if (!st) continue;
      const last = Object.entries(st.flags ?? {}).find(([k]) => k.startsWith("lastScene:"));
      const campaign = st.campaign ?? (last ? last[0].slice(10) : null);
      const sceneId = st.phase === "campaign" ? st.board.sceneId : String(last?.[1] ?? "");
      const scene = campaign ? (CAMPAIGNS[campaign as keyof typeof CAMPAIGNS]?.scenes[sceneId]?.title ?? (st.phase === "campaign" ? st.board.title : "")) : "";
      const heroes = Object.values(st.players ?? {}).map((p) => p.character ? `${p.character.name} (lv ${p.character.level})` : "").filter(Boolean);
      out.set(code, { code, at: raw.savedAt ?? out.get(code)?.at ?? 0, campaign, scene, heroes, hosted: true });
    } catch { /* unreadable save */ }
  }
  return [...out.values()].sort((a, b) => b.at - a.at).slice(0, 12);
}

export function rememberTable(code: string) {
  try {
    const recent = (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as { code: string; at: number }[]).filter((r) => r.code !== code);
    recent.unshift({ code, at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 12)));
  } catch { /* private mode */ }
}

export function downloadText(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Pulls a table code out of whatever a friend pasted: a code, or a full invite link. */
function parseCode(input: string) {
  const t = input.trim();
  try { const u = new URL(t); return u.searchParams.get("room") ?? ""; } catch { /* not a link */ }
  return t.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
}

type Tab = "host" | "join" | "continue";

export function StartMenu() {
  const invited = new URLSearchParams(location.search).get("room");
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY)?.replace(/"/g, "") || "");
  const [tab, setTab] = useState<Tab>(invited ? "join" : "host");
  const [hostCode, setHostCode] = useState(newTableCode);
  const [joinCode, setJoinCode] = useState(invited ?? "");
  const [busy, setBusy] = useState(false);
  const [gm, setGm] = useState<GmSettings>(() => loadLocalRaw<GmSettings>(GM_KEY) ?? {});
  const [overlay, setOverlay] = useState<null | "settings" | "help" | "gm">(null);
  const [saves, setSaves] = useState<SaveInfo[]>(() => listSaves());
  const [nameWarn, setNameWarn] = useState(false);
  useEffect(() => { if (tab === "continue") setSaves(listSaves()); }, [tab]);
  const hosted = useMemo(() => saves.filter((s) => s.hosted).length, [saves]);

  const go = (code: string, intent: "host" | "join") => {
    if (!name.trim()) { setNameWarn(true); document.getElementById("nm")?.focus(); return; }
    if (!code) return;
    saveLocal(GM_KEY, gm);
    setBusy(true);
    sound.start();
    const url = new URL(location.href);
    url.searchParams.set("room", code);
    history.replaceState(null, "", url);
    rememberTable(code);
    store.set({ intent });
    void connect(name.trim(), code);
  };

  const importSave = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data?.state?.players) throw new Error("not a save");
        const code = newTableCode();
        localStorage.setItem(ROOM_PREFIX + code, JSON.stringify(data));
        rememberTable(code);
        setSaves(listSaves());
        store.toast(`Save imported as table "${code}". Press Continue to host it.`);
      } catch {
        store.toast("That file isn't a BeeBaDee save.", "error");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="join">
      <div className="panel join-card menu-card">
        <h1><span>🎲</span> BeeBaDee</h1>
        <div className="tag">a sketchbook tabletop for you & five friends</div>

        <label htmlFor="nm">Your name</label>
        <input id="nm" className={nameWarn && !name.trim() ? "warn" : ""} value={name} maxLength={20} autoFocus={!name} placeholder="What should the table call you?" onChange={(e) => setName(e.target.value)} />

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "host"} className={`tab ${tab === "host" ? "on" : ""}`} onClick={() => setTab("host")}>🍺 Host a game</button>
          <button role="tab" aria-selected={tab === "join"} className={`tab ${tab === "join" ? "on" : ""}`} onClick={() => setTab("join")}>🔗 Join a friend</button>
          <button role="tab" aria-selected={tab === "continue"} className={`tab ${tab === "continue" ? "on" : ""}`} onClick={() => setTab("continue")}>💾 Continue{hosted ? ` (${hosted})` : ""}</button>
        </div>

        {tab === "host" && (
          <div className="tab-body">
            <p className="small">Start a new table in this browser. You'll get an invite link to send your friends — up to six can play.</p>
            <label htmlFor="hc">Table code</label>
            <div className="row tight">
              <input id="hc" value={hostCode} maxLength={24} onChange={(e) => setHostCode(parseCode(e.target.value))} onKeyDown={(e) => e.key === "Enter" && go(hostCode, "host")} />
              <button className="btn" title="New random code" onClick={() => setHostCode(newTableCode())}>🎲</button>
            </div>
            <button className="btn primary big" disabled={busy || !hostCode} onClick={() => go(hostCode, "host")}>{busy ? "Opening the pub…" : "▶ Start hosting"}</button>
          </div>
        )}

        {tab === "join" && (
          <div className="tab-body">
            {invited ? <p className="small">You've been invited to table <b>{invited}</b>. Pick a name and jump in!</p> : <p className="small">Paste the invite link your friend sent you, or type their table code.</p>}
            <label htmlFor="jc">Invite link or table code</label>
            <input id="jc" value={joinCode} placeholder="e.g. lucky-goblin-42 or https://…?room=lucky-goblin-42" onChange={(e) => setJoinCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go(parseCode(joinCode), "join")} />
            <button className="btn primary big" disabled={busy || !parseCode(joinCode)} onClick={() => go(parseCode(joinCode), "join")}>{busy ? "Finding the table…" : "▶ Join game"}</button>
          </div>
        )}

        {tab === "continue" && (
          <div className="tab-body">
            {saves.length === 0 && <p className="small muted">No saved games yet. Tables you host are saved automatically in this browser.</p>}
            <div className="saves">
              {saves.map((s) => (
                <div className="save-row" key={s.code}>
                  <div className="save-info">
                    <b>{s.code}</b>
                    <div className="small muted">
                      {s.campaign ? `${CAMPAIGNS[s.campaign as keyof typeof CAMPAIGNS]?.name ?? s.campaign}${s.scene ? ` · ${s.scene}` : ""}` : s.hosted ? "In the pub" : "Joined as a guest"}
                      {s.at ? ` · ${new Date(s.at).toLocaleString()}` : ""}
                    </div>
                    {s.heroes.length > 0 && <div className="small">{s.heroes.join(", ")}</div>}
                  </div>
                  <div className="save-actions">
                    <button className="btn primary small" disabled={busy} onClick={() => go(s.code, s.hosted ? "host" : "join")}>▶ {s.hosted ? "Continue" : "Rejoin"}</button>
                    {s.hosted && <button className="btn small" title="Download save file" onClick={() => downloadText(`beebadee-${s.code}.json`, localStorage.getItem(ROOM_PREFIX + s.code) ?? "{}")}>⬇</button>}
                    <button className="btn small danger" title="Forget this table" onClick={() => {
                      if (s.hosted && !confirm(`Delete the save for "${s.code}"? This can't be undone.`)) return;
                      localStorage.removeItem(ROOM_PREFIX + s.code);
                      try { localStorage.setItem(RECENT_KEY, JSON.stringify((JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as { code: string }[]).filter((r) => r.code !== s.code))); } catch { /* ignore */ }
                      setSaves(listSaves());
                    }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
            <label className="btn small file-btn">⬆ Import a save file<input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && importSave(e.target.files[0])} /></label>
          </div>
        )}

        <div className="menu-foot">
          <button className="btn" onClick={() => setOverlay("gm")}>🤖 AI Game Master {gm.apiKey ? "✓" : ""}</button>
          <button className="btn" onClick={() => setOverlay("settings")}>⚙️ Settings</button>
          <button className="btn" onClick={() => setOverlay("help")}>❔ How to play</button>
        </div>
        <div className="feature-list">
          <span>🧍 Avatars & proximity voice</span><span>🗺️ Live game board</span>
          <span>🐞 Insect kingdom</span><span>🌃 Cyberpunk heist</span>
          <span>🏰 Medieval crypt</span><span>🎲 300+ monsters</span>
        </div>
      </div>

      {overlay === "settings" && <Closer onClose={() => setOverlay(null)}><SettingsPanel onClose={() => setOverlay(null)} /></Closer>}
      {overlay === "help" && <Closer onClose={() => setOverlay(null)}><Help onClose={() => setOverlay(null)} /></Closer>}
      {overlay === "gm" && (
        <div className="modal-wrap" onClick={(e) => e.target === e.currentTarget && setOverlay(null)}>
          <div className="panel modal">
            <button className="btn close" onClick={() => setOverlay(null)}>✕</button>
            <h2>🤖 AI Game Master</h2>
            <div className="small muted">
              Optional, and only needed by whoever <b>hosts</b> the table. Paste an Anthropic API key to have Claude run the game; without one, the scripted narrator runs the campaigns.
              The key stays in this browser and is sent only to Anthropic. Anyone using this browser profile could read it, so use a key you can revoke.
            </div>
            <label htmlFor="key">Anthropic API key</label>
            <input id="key" type="password" autoComplete="off" value={gm.apiKey ?? ""} placeholder="sk-ant-…" onChange={(e) => setGm({ ...gm, apiKey: e.target.value.trim() || undefined })} />
            <label htmlFor="eff">Thinking effort (lower = faster replies)</label>
            <select id="eff" value={gm.effort ?? "low"} onChange={(e) => setGm({ ...gm, effort: e.target.value as GmSettings["effort"] })}>
              <option value="low">Low (fast)</option><option value="medium">Medium</option><option value="high">High (slow, thoughtful)</option>
            </select>
            <div style={{ marginTop: 12 }}><button className="btn primary" onClick={() => { saveLocal(GM_KEY, gm); setOverlay(null); }}>Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Closer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return <>{children}</>;
}
