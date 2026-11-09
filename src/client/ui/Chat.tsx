import { useEffect, useRef, useState } from "react";
import type { ChatMessage, RollResult } from "../../shared/types";
import { net } from "../net";
import { store, useStore } from "../store";

const TABS = [
  { id: "all", label: "All" },
  { id: "story", label: "Story" },
  { id: "rolls", label: "Rolls" },
  { id: "ooc", label: "OOC" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function matches(tab: Tab, m: ChatMessage) {
  if (tab === "all") return true;
  if (tab === "story") return m.channel === "gm" || m.channel === "ic" || m.channel === "emote";
  if (tab === "rolls") return m.channel === "roll";
  return m.channel === "ooc" || m.channel === "whisper" || m.channel === "system";
}

export function Chat() {
  const chat = useStore((s) => s.chat);
  const focus = useStore((s) => s.chatFocus);
  const phase = useStore((s) => s.state?.phase);
  const players = useStore((s) => s.state?.players);
  const [tab, setTab] = useState<Tab>("all");
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<"ic" | "ooc">("ic");
  const [collapsed, setCollapsed] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const history = useRef<string[]>([]);
  const hIdx = useRef(-1);

  useEffect(() => {
    if (focus) { inputRef.current?.focus(); store.set({ chatFocus: false }); }
  }, [focus]);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, tab, collapsed]);

  const send = () => {
    const t = text.trim();
    if (!t) { inputRef.current?.blur(); return; }
    net.chat(t, phase === "campaign" ? channel : "ooc");
    history.current.unshift(t);
    hIdx.current = -1;
    setText("");
  };

  const visible = chat.filter((m) => matches(tab, m)).slice(-150);
  return (
    <div className={`panel chat ${collapsed ? "collapsed" : ""}`}>
      <div className="chat-tabs">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}
        <span style={{ flex: 1 }} />
        <button onClick={() => setCollapsed(!collapsed)} title="Collapse">{collapsed ? "▲" : "▼"}</button>
      </div>
      {!collapsed && (
        <div className="chat-log" ref={logRef}>
          {visible.map((m) => <Line key={m.id} m={m} color={m.fromId ? players?.[m.fromId]?.look.primary : undefined} />)}
        </div>
      )}
      <div className="chat-input">
        {phase === "campaign" && (
          <select value={channel} onChange={(e) => setChannel(e.target.value as "ic" | "ooc")} title="In character / out of character">
            <option value="ic">🎭 IC</option>
            <option value="ooc">💬 OOC</option>
          </select>
        )}
        <input
          ref={inputRef}
          value={text}
          maxLength={500}
          placeholder={phase === "campaign" ? (channel === "ic" ? "Say or do something… (/r 1d20, /me, /gm)" : "Out of character…") : "Chat… (try: hey barkeep!)"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") send();
            if (e.key === "Escape") inputRef.current?.blur();
            if (e.key === "ArrowUp" && history.current.length) { hIdx.current = Math.min(history.current.length - 1, hIdx.current + 1); setText(history.current[hIdx.current]); }
            if (e.key === "ArrowDown") { hIdx.current = Math.max(-1, hIdx.current - 1); setText(hIdx.current < 0 ? "" : history.current[hIdx.current]); }
          }}
        />
        <button className="btn" onClick={send}>Send</button>
      </div>
    </div>
  );
}

function Line({ m, color }: { m: ChatMessage; color?: string }) {
  switch (m.channel) {
    case "gm":
      return <div className={`m gm ${m.npc ? "npc" : ""}`}>{m.npc ? <span className="who" style={{ color: "#d8b8ff" }}>{m.npc}:</span> : <span className="who" style={{ color: "var(--gold)" }}>📖</span>}{m.text}</div>;
    case "system":
      return <div className="m system">{m.text}</div>;
    case "roll":
      return m.roll ? <RollCard m={m} r={m.roll} /> : <div className="m system">{m.text}</div>;
    case "emote":
      return <div className="m emote">✦ {m.text}</div>;
    case "whisper":
      return <div className="m whisper">🤫 <b>{m.from}</b>: {m.text}</div>;
    case "ooc":
      return <div className="m ooc"><span className="who" style={{ color }}>{m.from}</span><span className="muted small">(ooc)</span> {m.text}</div>;
    default:
      return <div className="m"><span className="who" style={{ color }}>{m.from}:</span>{m.text}</div>;
  }
}

function RollCard({ m, r }: { m: ChatMessage; r: RollResult }) {
  return (
    <div className="roll-card">
      <div className="small muted">{m.from} · {r.label ?? r.expr}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className={`total ${r.crit ? "crit" : r.fumble ? "fumble" : ""}`}>{r.total}</span>
        <span className="dice">
          {r.terms.map((t, i) => (
            <span key={i}>[{t.rolls.map((v, j) => <span key={j} style={{ opacity: t.kept.includes(j) ? 1 : 0.35, textDecoration: t.kept.includes(j) ? "none" : "line-through" }}>{j ? ", " : ""}{v}</span>)}]</span>
          ))}
          {r.modifier ? ` ${r.modifier > 0 ? "+" : ""}${r.modifier}` : ""}
        </span>
        {r.crit && <span className="crit small">CRIT!</span>}
        {r.fumble && <span className="fumble small">FUMBLE</span>}
      </div>
      {r.vs && <div className="small">vs {r.vs.kind === "ac" ? "AC" : "DC"} {r.vs.dc} — <span className={r.vs.success ? "ok" : "no"}>{r.vs.success ? (r.vs.kind === "ac" ? "HIT" : "SUCCESS") : r.vs.kind === "ac" ? "MISS" : "FAIL"}</span></div>}
      {r.damage && <div className="small"><span className="dmg">💥 {r.damage.total} {r.damage.type}</span> <span className="dice">({r.damage.rolls.join(", ")})</span></div>}
      <div className="small muted">{m.text}</div>
    </div>
  );
}
