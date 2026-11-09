import { useState } from "react";
import { CAMPAIGNS, CAMPAIGN_ORDER } from "../../shared/campaigns";
import { modStr } from "../../shared/dice";
import {
  ABILITY_LABEL, ANCESTRIES, CLASSES, RESKIN, SKILL_LABEL, STANDARD_ARRAY, SPELLS, mod, newCharacter, suggestedScores, displayName,
} from "../../shared/rules";
import { ABILITIES, type Ability, type AncestryId, type CampaignId, type ClassId, type Skill } from "../../shared/types";
import { net } from "../net";
import { store, useStore } from "../store";

const uid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function CharacterCreator() {
  const s = useStore((x) => x.state)!;
  const you = useStore((x) => x.you);
  const existing = s.players[you]?.character;
  const [flavor, setFlavor] = useState<CampaignId>(s.campaign ?? s.campaignVote ?? "realm");
  const [name, setName] = useState(existing?.name ?? "");
  const [cls, setCls] = useState<ClassId>(existing?.cls ?? "fighter");
  const [anc, setAnc] = useState<AncestryId>(existing?.ancestry ?? "human");
  const [scores, setScores] = useState<Record<Ability, number>>(() => suggestedScores(existing?.cls ?? "fighter"));
  const [skills, setSkills] = useState<Skill[]>(existing?.skills ?? CLASSES[existing?.cls ?? "fighter"].skillChoices.slice(0, CLASSES[existing?.cls ?? "fighter"].skillCount));
  const [backstory, setBackstory] = useState(existing?.backstory ?? "");
  const rs = RESKIN[flavor];
  const def = CLASSES[cls];
  const used = Object.values(scores).sort((a, b) => b - a).join(",");
  const validArray = used === STANDARD_ARRAY.join(",");
  const inCombat = s.combat.active;

  const pickClass = (c: ClassId) => {
    setCls(c);
    setScores(suggestedScores(c));
    setSkills(CLASSES[c].skillChoices.slice(0, CLASSES[c].skillCount));
  };
  const swap = (a: Ability, v: number) => {
    // standard array: swap values between abilities so the set stays valid
    const other = ABILITIES.find((x) => x !== a && scores[x] === v);
    const next = { ...scores, [a]: v };
    if (other) next[other] = scores[a];
    setScores(next);
  };
  const toggleSkill = (sk: Skill) => {
    if (skills.includes(sk)) setSkills(skills.filter((x) => x !== sk));
    else if (skills.length < def.skillCount) setSkills([...skills, sk]);
  };
  const save = () => {
    const c = newCharacter({ id: existing?.cls === cls && existing.ancestry === anc ? existing.id : uid(), name: name.trim() || "Adventurer", cls, ancestry: anc, campaign: flavor, scores, skills, backstory });
    if (existing && existing.cls === cls && existing.ancestry === anc) {
      // keep earned progress when only renaming / tweaking
      c.xp = existing.xp; c.gold = existing.gold; c.inventory = existing.inventory;
    }
    net.character(c);
    store.toast(`✍️ ${c.name} is ready for adventure!`);
    store.set({ panel: null });
  };
  const pregen = (i: number) => {
    const p = CAMPAIGNS[flavor].pregens[i];
    setName(p.name); setAnc(p.ancestry); pickClass(p.cls); setBackstory(p.backstory);
  };

  return (
    <div className="modal-wrap">
      <div className="panel modal wide left" style={{ width: "min(860px, calc(100vw - 24px))" }}>
        <button className="btn close" onClick={() => store.set({ panel: null })}>✕</button>
        <h2>🧙 The Scribe's Desk</h2>
        <div className="muted small">Your hero's rules are separate from your avatar's looks. Choose a world flavour to see the names used there — the rules are the same everywhere.</div>
        {inCombat && <div className="small" style={{ color: "var(--bad)" }}>You can't change heroes in the middle of a fight.</div>}

        <h3>World flavour</h3>
        <div className="chips">
          {CAMPAIGN_ORDER.map((id) => <button key={id} className={`chip ${flavor === id ? "on" : ""}`} onClick={() => setFlavor(id)}>{CAMPAIGNS[id].name}</button>)}
        </div>
        <h3>Quick start — ready-made heroes</h3>
        <div className="chips">
          {CAMPAIGNS[flavor].pregens.map((p, i) => <button key={p.name} className="chip" onClick={() => pregen(i)}>{p.name} <span className="muted">· {rs.classes[p.cls]}</span></button>)}
        </div>

        <div className="grid2" style={{ marginTop: 10 }}>
          <div>
            <h3>Name</h3>
            <input style={{ width: "100%" }} value={name} maxLength={20} placeholder="Hero name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </div>
          <div>
            <h3>Ancestry</h3>
            <select style={{ width: "100%" }} value={anc} onChange={(e) => setAnc(e.target.value as AncestryId)}>
              {Object.values(ANCESTRIES).map((a) => <option key={a.id} value={a.id}>{rs.ancestries[a.id]} — {Object.entries(a.bonus).map(([k, v]) => `${k.toUpperCase()} +${v}`).join(", ")}</option>)}
            </select>
            <div className="small muted" style={{ marginTop: 4 }}>{ANCESTRIES[anc].trait} Speed {ANCESTRIES[anc].speed * 5} ft.</div>
          </div>
        </div>

        <h3>Class</h3>
        <div className="grid3">
          {Object.values(CLASSES).map((c) => (
            <button key={c.id} className={`card ${cls === c.id ? "on" : ""}`} style={{ textAlign: "left" }} onClick={() => pickClass(c.id)}>
              <b>{rs.classes[c.id]}</b> <span className="muted small">({c.name})</span>
              <div className="small muted">{c.blurb}</div>
              <div className="small" style={{ marginTop: 4 }}>d{c.hitDie} HP · {c.attacks.map((a) => displayName(flavor, a.id, a.name)).join(", ")}{c.spells.length ? ` · ${c.spells.slice(0, 2).map((x) => displayName(flavor, x, SPELLS[x].name)).join(", ")}…` : ""}</div>
            </button>
          ))}
        </div>

        <h3>Ability scores <span className="small muted">(standard array 15, 14, 13, 12, 10, 8 — pick to swap)</span></h3>
        <div className="abilities">
          {ABILITIES.map((a) => {
            const total = scores[a] + (ANCESTRIES[anc].bonus[a] ?? 0);
            return (
              <div key={a} className="ability">
                <div className="lbl" title={ABILITY_LABEL[a]}>{a.toUpperCase()}{def.primary === a ? " ★" : ""}</div>
                <div className="mod">{modStr(mod(total))}</div>
                <select value={scores[a]} onChange={(e) => swap(a, Number(e.target.value))} style={{ width: "100%", padding: 2 }}>
                  {STANDARD_ARRAY.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <div className="score">= {total}</div>
              </div>
            );
          })}
        </div>
        {!validArray && <div className="small" style={{ color: "var(--bad)" }}>Use each standard array value once.</div>}

        <h3>Skills — choose {def.skillCount} ({skills.length}/{def.skillCount})</h3>
        <div className="chips">
          {def.skillChoices.map((sk) => <button key={sk} className={`chip ${skills.includes(sk) ? "on" : ""}`} onClick={() => toggleSkill(sk)}>{SKILL_LABEL[sk]}</button>)}
        </div>

        <h3>Backstory (the AI Game Master reads this)</h3>
        <textarea style={{ width: "100%", minHeight: 70 }} maxLength={300} value={backstory} onChange={(e) => setBackstory(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Who are they? What do they want?" />

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn primary" disabled={!validArray || skills.length !== def.skillCount || inCombat} onClick={save}>{existing ? "Save hero" : "Create hero"}</button>
          <button className="btn" onClick={() => store.set({ panel: null })}>Cancel</button>
          {existing && <span className="small muted" style={{ alignSelf: "center" }}>Changing class or ancestry starts a new level-1 hero.</span>}
        </div>
      </div>
    </div>
  );
}
