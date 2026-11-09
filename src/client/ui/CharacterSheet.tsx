import { modStr } from "../../shared/dice";
import {
  ABILITY_LABEL, CLASSES, RESKIN, SKILL_ABILITY, SKILL_LABEL, SPELLS, XP_FOR_LEVEL, ANCESTRIES,
  abilityMod, armorClass, displayName, profBonus, saveBonus, skillBonus, spellDC,
} from "../../shared/rules";
import { ABILITIES, type Skill } from "../../shared/types";
import { net } from "../net";
import { store, useStore } from "../store";

export function CharacterSheet() {
  const s = useStore((x) => x.state)!;
  const you = useStore((x) => x.you);
  const c = s.players[you]?.character;
  const close = () => store.set({ panel: null });
  if (!c) return null;
  const campaign = s.campaign;
  const rs = campaign ? RESKIN[campaign] : null;
  const cls = CLASSES[c.cls];
  const next = XP_FOR_LEVEL[c.level + 1];
  const tok = s.board.tokens.find((t) => t.ownerId === you);
  const hp = tok?.hp ?? c.hp;
  return (
    <div className="modal-wrap">
      <div className="panel modal">
        <button className="btn close" onClick={close}>✕</button>
        <h2>{c.name}</h2>
        <div className="muted">Level {c.level} {rs?.ancestries[c.ancestry] ?? ANCESTRIES[c.ancestry].name} {rs?.classes[c.cls] ?? cls.name}</div>
        <div className="bar" style={{ margin: "8px 0 2px" }}><i style={{ width: `${next ? Math.min(100, (c.xp / next) * 100) : 100}%`, background: "var(--gold)" }} /></div>
        <div className="small muted">{c.xp} XP{next ? ` / ${next} for level ${c.level + 1}` : " (max level)"}</div>

        <div className="stat-row" style={{ marginTop: 10 }}>
          <div className="stat">{rs?.hp ?? "Hit Points"}<b>{hp}/{c.maxHp}</b></div>
          <div className="stat">Armor<b>{armorClass(c)}</b></div>
          <div className="stat">Speed<b>{ANCESTRIES[c.ancestry].speed * 5} ft</b></div>
          <div className="stat">Proficiency<b>{modStr(profBonus(c.level))}</b></div>
          <div className="stat">{rs?.currency ?? "gold"}<b>{c.gold}</b></div>
        </div>

        <h3>Abilities <span className="small muted">— click to roll a check, shift+click for a save</span></h3>
        <div className="abilities">
          {ABILITIES.map((a) => (
            <button key={a} className="ability" onClick={(e) => net.skillRoll(a, e.shiftKey)} title={`${ABILITY_LABEL[a]} — save ${modStr(saveBonus(c, a))}`}>
              <div className="lbl">{a.toUpperCase()}</div>
              <div className="mod">{modStr(abilityMod(c, a))}</div>
              <div className="score">{c.abilities[a]}{cls.saves.includes(a) ? " · save ●" : ""}</div>
            </button>
          ))}
        </div>

        <h3>Skills</h3>
        <div className="grid2">
          {(Object.keys(SKILL_ABILITY) as Skill[]).map((sk) => (
            <div key={sk} className={`skill ${c.skills.includes(sk) ? "prof" : ""}`} onClick={() => net.skillRoll(sk)}>
              <span>{c.skills.includes(sk) ? "● " : "○ "}{SKILL_LABEL[sk]} <span className="muted small">{SKILL_ABILITY[sk]}</span></span>
              <b>{modStr(skillBonus(c, sk))}</b>
            </div>
          ))}
        </div>

        {cls.spells.length > 0 && (
          <>
            <h3>Spells · {c.spellSlots}/{c.maxSpellSlots} slots · save DC {spellDC(c)}</h3>
            {cls.spells.map((id) => <div key={id} className="small" style={{ margin: "3px 0" }}><b>{displayName(campaign, id, SPELLS[id].name)}</b> <span className="muted">— {SPELLS[id].desc}</span></div>)}
          </>
        )}
        <h3>Features</h3>
        {cls.features.map((f) => <div key={f.id} className="small" style={{ margin: "3px 0" }}><b>{f.name}</b>{c.features[f.id] !== undefined && f.id !== "sneak" ? ` (${c.features[f.id]} left)` : ""} <span className="muted">— {f.desc}</span></div>)}

        <h3>Inventory</h3>
        {c.inventory.length === 0 && <div className="small muted">Empty pockets.</div>}
        {c.inventory.map((i) => (
          <div key={i.id} className="small" style={{ display: "flex", justifyContent: "space-between", margin: "4px 0" }}>
            <span><b>{i.name}</b>{(i.qty ?? 1) > 1 ? ` ×${i.qty}` : ""} {i.desc && <span className="muted">— {i.desc}</span>}</span>
            {i.heal && tok && <button className="btn small" onClick={() => net.board({ type: "useItem", tokenId: tok.id, itemId: i.id })}>Use</button>}
          </div>
        ))}

        {c.scars && c.scars.length > 0 && (<><h3>Scars & lingering wounds</h3>{c.scars.map((sc, i) => <div key={i} className="small">🩸 {sc}</div>)}</>)}

        {c.backstory && (<><h3>Backstory</h3><div className="small" style={{ fontFamily: "var(--serif)" }}>{c.backstory}</div></>)}

        <h3>Free roll</h3>
        <div className="chips">
          {["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "2d20kh1", "2d20kl1", "1d100"].map((d) => (
            <button key={d} className="chip" onClick={() => net.roll(d)}>{d === "2d20kh1" ? "d20 adv" : d === "2d20kl1" ? "d20 dis" : d}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
