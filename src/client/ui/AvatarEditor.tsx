import { useState } from "react";
import type { Accessory, AvatarLook, HairStyle, Hat, HeadStyle, Outfit } from "../../shared/types";
import { net } from "../net";
import { DEFAULT_LOOK, local, store } from "../store";

const HEADS: [HeadStyle, string][] = [["human", "🙂 Human"], ["bug", "🪲 Bug"], ["robot", "🤖 Robot"], ["beast", "🐺 Beast"], ["skull", "💀 Skull"]];
const HAIRS: HairStyle[] = ["none", "short", "long", "mohawk", "bun", "spiky"];
const OUTFITS: Outfit[] = ["tunic", "robe", "armor", "jacket", "hoodie", "cloak"];
const HATS: Hat[] = ["none", "wizard", "hood", "crown", "visor", "horns", "antennae", "tophat"];
const ACCS: Accessory[] = ["none", "cape", "backpack", "wings", "scarf"];
const SKINS = ["#f1d1b5", "#e0ac83", "#c99a76", "#a8754f", "#7a4e2e", "#4a2e1c", "#9fd0a0", "#a8b8e8", "#d8d8e0", "#3a3a4a"];

const PRESETS: { name: string; look: Partial<AvatarLook> }[] = [
  { name: "Knight", look: { head: "human", outfit: "armor", primary: "#c0c8d8", secondary: "#3a4a6a", hat: "none", accessory: "cape", hair: "short" } },
  { name: "Wizard", look: { head: "human", outfit: "robe", primary: "#4a3aa0", secondary: "#2a1f5a", hat: "wizard", accessory: "none", hair: "long", hairColor: "#dddddd" } },
  { name: "Bug knight", look: { head: "bug", outfit: "cloak", primary: "#2a2f45", secondary: "#9fb8ff", skin: "#e8e6f0", eyes: "#101018", hat: "none", accessory: "cape" } },
  { name: "Netrunner", look: { head: "human", outfit: "hoodie", primary: "#2a2a35", secondary: "#ff3fa4", hat: "visor", hair: "mohawk", hairColor: "#3af0ff", accessory: "none" } },
  { name: "Chrome", look: { head: "robot", outfit: "jacket", primary: "#1a1a22", secondary: "#c8c8d8", eyes: "#ff3030", hat: "none", accessory: "none" } },
  { name: "Fairy", look: { head: "human", outfit: "tunic", primary: "#7adca0", secondary: "#f0e6a0", hat: "antennae", accessory: "wings", hair: "bun", hairColor: "#f2a6d0" } },
];

export function AvatarEditor() {
  const [look, setLook] = useState<AvatarLook>(local.look);
  const update = (p: Partial<AvatarLook>) => {
    const next = { ...look, ...p };
    setLook(next);
    local.look = next; // live preview in the world
  };
  const save = () => { net.look(look); store.toast("🪞 Looking good!"); store.set({ panel: null }); };
  const random = () => {
    const r = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const hue = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
    update({ head: r(HEADS)[0], hair: r(HAIRS), outfit: r(OUTFITS), hat: r(HATS), accessory: r(ACCS), skin: r(SKINS), primary: hue(), secondary: hue(), hairColor: hue(), eyes: hue(), height: 0.9 + Math.random() * 0.2, build: 0.85 + Math.random() * 0.35 });
  };
  const Chips = <T extends string>({ value, options, onPick, labels }: { value: T; options: T[]; onPick: (v: T) => void; labels?: Record<string, string> }) => (
    <div className="chips">{options.map((o) => <button key={o} className={`chip ${value === o ? "on" : ""}`} onClick={() => onPick(o)}>{labels?.[o] ?? o}</button>)}</div>
  );
  const Color = ({ label, k }: { label: string; k: "skin" | "hairColor" | "primary" | "secondary" | "eyes" }) => (
    <div className="color-row"><input type="color" value={look[k]} onChange={(e) => update({ [k]: e.target.value })} /><span className="small">{label}</span></div>
  );
  return (
    <div className="modal-wrap">
      <div className="panel modal" style={{ width: "min(420px, calc(100vw - 24px))" }}>
        <button className="btn close" onClick={() => { local.look = look; store.set({ panel: null }); save(); }}>✕</button>
        <h2>🪞 Wardrobe</h2>
        <div className="small muted">Changes show on your avatar right away. Everyone sees them when you save.</div>
        <h3>Presets</h3>
        <div className="chips">
          {PRESETS.map((p) => <button key={p.name} className="chip" onClick={() => update({ ...DEFAULT_LOOK, ...p.look })}>{p.name}</button>)}
          <button className="chip" onClick={random}>🎲 Random</button>
        </div>
        <h3>Head</h3>
        <Chips value={look.head} options={HEADS.map((h) => h[0])} labels={Object.fromEntries(HEADS)} onPick={(head) => update({ head })} />
        <h3>Body</h3>
        <div className="small">Height <input type="range" min={0.85} max={1.15} step={0.01} value={look.height} onChange={(e) => update({ height: Number(e.target.value) })} /></div>
        <div className="small">Build <input type="range" min={0.8} max={1.25} step={0.01} value={look.build} onChange={(e) => update({ build: Number(e.target.value) })} /></div>
        <div className="chips" style={{ marginTop: 6 }}>{SKINS.map((c) => <button key={c} className={`chip ${look.skin === c ? "on" : ""}`} style={{ background: c, width: 28, height: 28, padding: 0 }} onClick={() => update({ skin: c })} title={c} />)}</div>
        <div className="grid2"><Color label="Skin / shell" k="skin" /><Color label="Eyes / glow" k="eyes" /></div>
        <h3>Hair</h3>
        <Chips value={look.hair} options={HAIRS} onPick={(hair) => update({ hair })} />
        <Color label="Hair colour" k="hairColor" />
        <h3>Outfit</h3>
        <Chips value={look.outfit} options={OUTFITS} onPick={(outfit) => update({ outfit })} />
        <div className="grid2"><Color label="Main colour" k="primary" /><Color label="Trim colour" k="secondary" /></div>
        <h3>Hat</h3>
        <Chips value={look.hat} options={HATS} onPick={(hat) => update({ hat })} />
        <h3>Extras</h3>
        <Chips value={look.accessory} options={ACCS} onPick={(accessory) => update({ accessory })} />
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn primary" onClick={save}>Save look</button>
        </div>
      </div>
    </div>
  );
}
