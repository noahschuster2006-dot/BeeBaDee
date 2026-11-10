import { useEffect, useRef } from "react";
import { CAMPAIGNS } from "../../shared/campaigns";
import { net } from "../net";
import { store, useStore } from "../store";
import { sound } from "../world/audio";
import { Engine, EMOTES } from "../world/engine";
import { voice } from "../world/voice";
import { AvatarEditor } from "./AvatarEditor";
import { BoardPanel } from "./BoardPanel";
import { CharacterCreator } from "./CharacterCreator";
import { CharacterSheet } from "./CharacterSheet";
import { Chat } from "./Chat";
import { Help } from "./Help";
import { SettingsPanel } from "./Settings";
import { settings } from "../settings";
import { paperGrainUrl } from "../world/style";

const GRAIN = typeof document !== "undefined" ? paperGrainUrl() : "";
import { QuestBoard } from "./QuestBoard";
import { StartMenu } from "./StartMenu";
import { Inventory } from "./Inventory";
import { WorldMap } from "./WorldMap";
import { GameMenu } from "./GameMenu";

export function App() {
  const joined = useStore((s) => s.joined);
  return joined ? <Game /> : <StartMenu />;
}

/** Paper grain, vignette and the fade used between worlds. */
function Overlays() {
  const fade = useStore((s) => s.fade);
  useEffect(() => {
    const apply = () => { const st = settings.get(); sound.setVolumes(st.music, st.sfx); };
    apply();
    return settings.subscribe(apply);
  }, []);
  return (
    <>
      <div className="paper-overlay" style={{ backgroundImage: `url(${GRAIN})` }} />
      <div className="vignette" />
      <div className={`fade ${fade ? "on" : ""}`} />
    </>
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
  const hosting = useStore((s) => s.hosting);
  const intent = useStore((s) => s.intent);
  const room = useStore((s) => s.room);
  useEffect(() => {
    // tried to join a friend, but nobody was hosting that code: say so instead of silently opening an empty pub
    if (intent === "join" && hosting) {
      store.toast(`Nobody is hosting "${room}" right now, so you're hosting it. Double-check the code with your friend, or send them your invite link.`, "error");
      store.set({ intent: null });
    }
  }, [intent, hosting, room]);
  return (
    <>
      <canvas ref={ref} className="game-canvas" />
      <Overlays />
      <Hud engine={engine} />
      <Chat />
      {panel === "board" && <BoardPanel />}
      {panel === "sheet" && <CharacterSheet />}
      {panel === "creator" && <CharacterCreator />}
      {panel === "avatar" && <AvatarEditor />}
      {panel === "quest" && <QuestBoard />}
      {panel === "help" && <Help />}
      {panel === "settings" && <SettingsPanel />}
      {panel === "inventory" && <Inventory />}
      {panel === "map" && <WorldMap />}
      {panel === "menu" && <GameMenu />}
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
  const hosting = useStore((x) => x.hosting);
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
            <span>Table <b style={{ color: "var(--gold)" }}>{room}</b> · {players.filter((p) => p.connected).length}/6{hosting ? " · 🏠 you host" : ""}</span>
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
          {s.phase === "campaign" && s.campaign && <div className="small muted">{CAMPAIGNS[s.campaign].scenes[s.board.sceneId]?.act}</div>}
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
          <button className={`btn ${panel === "inventory" ? "active" : ""}`} onClick={() => open("inventory")} disabled={!meP?.character}>🎒 Pack <span className="muted small">I</span></button>
          <button className={`btn ${panel === "map" ? "active" : ""}`} onClick={() => open("map")}>🧭 Map <span className="muted small">M</span></button>
          <button className={`btn ${panel === "creator" ? "active" : ""}`} onClick={() => open("creator")}>🧙 Hero</button>
          <button className={`btn ${panel === "avatar" ? "active" : ""}`} onClick={() => open("avatar")}>🪞 Look</button>
          <button className={`btn ${panel === "quest" ? "active" : ""}`} onClick={() => open("quest")}>📋 Quests</button>
          <button className={`btn ${micOn ? "active" : ""}`} onClick={() => void toggleMic()}>{micOn ? "🎙️ Mic on" : "🔇 Mic off"}</button>
          <button className="btn" onClick={() => { store.set({ firstPerson: !firstPerson }); settings.set({ firstPerson: !firstPerson }); }}>{firstPerson ? "👁️ 1st" : "🎥 3rd"}</button>
          <button className="btn" onClick={() => open("menu")} title="Menu (Esc)">☰</button>
        </div>
      </div>

      {s.choices.map((c) => {
        const mine = c.votes[you];
        return (
          <div key={c.id} className="panel banner" style={{ top: check ? 150 : 92, flexDirection: "column", alignItems: "stretch", maxWidth: 560 }}>
            <div>⚖️ <b>{c.prompt}</b></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {c.options.map((o, i) => {
                const n = Object.values(c.votes).filter((v) => v === i).length;
                return <button key={i} className={`btn ${mine === i ? "active" : ""}`} onClick={() => net.choose(c.id, i)}>{o}{n ? ` · ${n} vote${n > 1 ? "s" : ""}` : ""}</button>;
              })}
            </div>
            {meP?.host && mine !== undefined && <button className="btn small" onClick={() => net.choose(c.id, mine, true)}>👑 Decide now with my vote</button>}
          </div>
        );
      })}
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
          <b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>Click</b> look · <b>E</b> interact · <b>C</b> camera · <b>Enter</b> chat · <b>Tab</b> board · <b>I</b> pack · <b>M</b> map · <b>V</b> push-to-talk · <b>Esc</b> menu
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
