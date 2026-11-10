import { settings, useSettings, type Settings as S } from "../settings";
import { store } from "../store";

export function SettingsPanel({ onClose }: { onClose?: () => void } = {}) {
  const close = onClose ?? (() => store.set({ panel: null }));
  const s = useSettings();
  const set = (p: Partial<S>) => settings.set(p);
  const Slider = ({ label, k, min, max, step, fmt }: { label: string; k: "sensitivity" | "fov" | "music" | "sfx" | "brightness"; min: number; max: number; step: number; fmt?: (v: number) => string }) => (
    <div className="setting">
      <label>{label}<br /><input type="range" min={min} max={max} step={step} value={s[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<S>)} style={{ width: "100%" }} /></label>
      <span className="val">{fmt ? fmt(s[k]) : s[k]}</span>
    </div>
  );
  const Toggle = ({ label, k, hint }: { label: string; k: "invertY" | "headBob" | "outlines" | "hatching" | "firstPerson"; hint?: string }) => (
    <div className="setting">
      <span>{label}{hint && <><br /><span className="small muted">{hint}</span></>}</span>
      <input className="toggle" type="checkbox" checked={s[k]} onChange={(e) => { set({ [k]: e.target.checked } as Partial<S>); if (k === "firstPerson") store.set({ firstPerson: e.target.checked }); }} />
    </div>
  );
  return (
    <div className="modal-wrap">
      <div className="panel modal" style={{ width: "min(460px, calc(100vw - 24px))" }}>
        <button className="btn close" onClick={close}>✕</button>
        <h2>⚙️ Settings</h2>
        <h3>Controls</h3>
        <Slider label="Mouse sensitivity" k="sensitivity" min={0.2} max={3} step={0.05} fmt={(v) => `${v.toFixed(2)}×`} />
        <Toggle label="Invert vertical look" k="invertY" />
        <Toggle label="First-person view" k="firstPerson" hint="Press C to switch any time" />
        <Toggle label="Head bob" k="headBob" />
        <Slider label="Field of view" k="fov" min={60} max={100} step={1} fmt={(v) => `${v}°`} />
        <h3>Art & performance</h3>
        <Slider label="Brightness" k="brightness" min={0.8} max={1.7} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} />
        <div className="setting">
          <span>Quality<br /><span className="small muted">Lower it on older laptops</span></span>
          <select value={s.quality} onChange={(e) => set({ quality: e.target.value as S["quality"] })}>
            <option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low (no shadows)</option>
          </select>
        </div>
        <Toggle label="Ink outlines" k="outlines" hint="The drawn look — costs a second render pass" />
        <Toggle label="Pen hatching in shadows" k="hatching" />
        <h3>Audio</h3>
        <Slider label="Music" k="music" min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Effects & dice" k="sfx" min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={() => settings.reset()}>Reset to defaults</button>
          <button className="btn primary" onClick={close}>Done</button>
        </div>
      </div>
    </div>
  );
}
