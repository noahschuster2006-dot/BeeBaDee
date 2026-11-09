import { useEffect, useRef, useState } from "react";
import { CAMPAIGNS } from "../../shared/campaigns";
import { connect, net } from "../net";
import { NAME_KEY, store, useStore } from "../store";
import { sound } from "../world/audio";
import { Engine, EMOTES } from "../world/engine";
import { voice } from "../world/voice";
import { AvatarEditor } from "./AvatarEditor";
import { BoardPanel } from "./BoardPanel";
import { CharacterCreator } from "./CharacterCreator";
import { CharacterSheet } from "./CharacterSheet";
import { Chat } from "./Chat";
import { Help } from "./Help";
import { QuestBoard } from "./QuestBoard";

export function App() {
  const joined = useStore((s) => s.joined);
  return joined ? <Game /> : <Join />;
}

function Join() {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY)?.replace(/"/g, "") || "");
  const [room, setRoom] = useState(() => new URLSearchParams(location.search).get("room") || "tavern");
  const connected = useStore((s) => s.connected);
  const [busy, setBusy] = useState(false);
  const go = () => {
    if (!name.trim()) return;
    setBusy(true);
    sound.start();
    const url = new URL(location.href);
    url.searchParams.set("room", room);
    history.replaceState(null, "", url);
    connect(name.trim(), room);
  };
  return (
    <div className="join">
      <div className="panel join-card">
        <h1>🎲 BeeBaDee</h1>
        <p>A tabletop hangout. Walk around a living world with up to six friends, gather around the game board, and let the AI Game Master run the adventure.</p>
        <label htmlFor="nm">Your name</label>
        <input id="nm" value={name} maxLength={20} autoFocus placeholder="e.g. Rowan" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
        <label htmlFor="rm">Table code (share it with friends)</label>
        <input id="rm" value={room} maxLength={24} onChange={(e) => setRoom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
        <div className="row">
          <button className="btn primary" disabled={!name.trim() || busy} onClick={go}>{busy ? (connected ? "Joining…" : "Connecting…") : "Enter the Gilded Mug"}</button>
        </div>
        <div className="feature-list">
          <span>🧍 VRChat-style avatars</span><span>🗺️ Live game board</span>
          <span>🤖 AI Game Master</span><span>🎙️ Proximity voice</span>
          <span>🐞 Insect kingdom</span><span>🌃 Cyberpunk heist</span>
          <span>🏰 Medieval crypt</span><span>💬 Chat & dice rolls</span>
        </div>
      </div>
    </div>
  );
}

function Game() {
  const ref = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  useEffect(() => {
    engine.current = new Engine(ref.current!);
    return () => engine.current?.dispose();
  }, []);
  const panel = useStore((s) => s.panel);
  return (
    <>
      <canvas ref={ref} className="game-canvas" />
      <Hud engine={engine} />
      <Chat />
      {panel === "board" && <BoardPanel />}
      {panel === "sheet" && <CharacterSheet />}
      {panel === "creator" && <CharacterCreator />}
      {panel === "avatar" && <AvatarEditor />}
      {panel === "quest" && <QuestBoard />}
      {panel === "help" && <Help />}
      <Toasts />
    </>
  );
}

function Hud({ engine }: { engine: React.RefObject<Engine | null> }) {
  const s = useStore((x) => x.state);
  const you = useStore((x) => x.you);
  const prompt = useStore((x) => x.prompt);
  const panel = useStore((x) => x.panel);
  const micOn = useStore((x) => x.micOn);
  const aiEnabled = useStore((x) => x.aiEnabled);
  const connected = useStore((x) => x.connected);
  const room = useStore((x) => x.room);
  const firstPerson = useStore((x) => x.firstPerson);
  if (!s) return null;
  const meP = s.players[you];
  const players = Object.values(s.players);
  const check = s.checks.find((c) => c.playerId === you);
  const cur = s.combat.active ? s.board.tokens.find((t) => t.id === s.combat.order[s.combat.turn]) : null;
  const myTurn = cur?.ownerId === you;
  const open = (p: typeof panel) => { document.exitPointerLock?.(); store.set({ panel: panel === p ? null : p }); };
  const toggleMic = async () => {
    sound.start();
    if (voice.active) voice.disable();
    else if (sound.ctx) await voice.enable(sound.ctx);
  };
  const invite = () => {
    const url = `${location.origin}${location.pathname}?room=${room}`;
    void navigator.clipboard?.writeText(url);
    store.toast("Invite link copied — send it to your friends!");
  };
  return (
    <>
      <div className="hud-top">
        <div className="panel players">
          <div className="small muted" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>Table <b style={{ color: "var(--gold)" }}>{room}</b> · {players.filter((p) => p.connected).length}/6</span>
            <button className="btn small" onClick={invite} title="Copy invite link">🔗</button>
          </div>
          {players.map((p) => (
            <div className="p" key={p.id} style={{ opacity: p.connected ? 1 : 0.4 }}>
              <span className={`dot ${p.talking ? "talking" : ""}`} style={{ background: p.look.primary }} />
              <span>{p.host ? "👑 " : ""}{p.name}{p.id === you ? " (you)" : ""}</span>
              {p.character && <span className="muted small">· {p.character.name}</span>}
            </div>
          ))}
          {!connected && <div className="small" style={{ color: "var(--bad)" }}>Reconnecting…</div>}
        </div>
        <div className="panel objective">
          <div className="title">{s.phase === "pub" ? "🍺 The Gilded Mug" : `${s.campaign ? CAMPAIGNS[s.campaign].name : ""} — ${s.board.title}`}</div>
          <div className="obj">🎯 {s.gm.objective}</div>
          <div className="gm-status">
            {aiEnabled ? "🤖 AI Game Master" : "📜 Scripted narrator"}
            {s.gm.thinking && <span> · the GM is thinking<span className="thinking-dots" /></span>}
            {s.combat.active && <span> · ⚔️ Round {s.combat.round}</span>}
          </div>
        </div>
        <div className="hud-buttons">
          <button className={`btn ${panel === "board" ? "active" : ""}`} onClick={() => open("board")}>🗺️ Board <span className="muted small">Tab</span></button>
          <button className={`btn ${panel === "sheet" ? "active" : ""}`} onClick={() => open("sheet")} disabled={!meP?.character}>📜 Sheet <span className="muted small">K</span></button>
          <button className={`btn ${panel === "creator" ? "active" : ""}`} onClick={() => open("creator")}>🧙 Hero</button>
          <button className={`btn ${panel === "avatar" ? "active" : ""}`} onClick={() => open("avatar")}>🪞 Look</button>
          <button className={`btn ${panel === "quest" ? "active" : ""}`} onClick={() => open("quest")}>📋 Quests</button>
          <button className={`btn ${micOn ? "active" : ""}`} onClick={() => void toggleMic()}>{micOn ? "🎙️ Mic on" : "🔇 Mic off"}</button>
          <button className="btn" onClick={() => store.set({ firstPerson: !firstPerson })}>{firstPerson ? "👁️ 1st" : "🎥 3rd"}</button>
          <button className="btn" onClick={() => open("help")}>❔</button>
        </div>
      </div>

      {check && (
        <div className="panel banner">
          <span>🎲 <b>{check.reason}</b> — roll <b>{check.skill}</b></span>
          <button className="btn primary" onClick={() => net.rollCheck(check.id)}>Roll!</button>
        </div>
      )}
      {!check && myTurn && panel !== "board" && (
        <div className="panel banner turn">
          <span>⚔️ <b>It's your turn!</b></span>
          <button className="btn primary" onClick={() => open("board")}>Open board</button>
        </div>
      )}
      {!meP?.character && s.phase === "pub" && !panel && (
        <div className="panel banner">
          <span>👋 Welcome! Make a hero at the scribe's desk, or just pick a quest and you'll get a ready-made one.</span>
          <button className="btn primary" onClick={() => open("creator")}>Create hero</button>
        </div>
      )}
      {prompt && !panel && <div className="panel prompt">{prompt}</div>}
      {!panel && <div className="crosshair" />}
      {!panel && (
        <div className="panel emote-bar">
          {EMOTES.map((e) => (
            <button key={e.key} title={e.label} onClick={() => engine.current?.setEmote(e.emote)}>
              {e.icon}<kbd>{e.key}</kbd>
            </button>
          ))}
        </div>
      )}
      {!panel && (
        <div className="panel hint">
          <b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>Click</b> look · <b>E</b> interact · <b>C</b> camera · <b>Enter</b> chat · <b>Tab</b> board · <b>V</b> push-to-talk · <b>Esc</b> release mouse
        </div>
      )}
    </>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}
