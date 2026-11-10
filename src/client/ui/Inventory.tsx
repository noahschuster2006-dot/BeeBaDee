import { RESKIN, armorClass, itemBonus } from "../../shared/rules";
import type { Item } from "../../shared/types";
import { net } from "../net";
import { store, useStore } from "../store";

const GROUPS: { kind: Item["kind"][]; label: string; icon: string }[] = [
  { kind: ["weapon"], label: "Weapons", icon: "⚔️" },
  { kind: ["armor"], label: "Armour & wards", icon: "🛡️" },
  { kind: ["consumable"], label: "Potions & consumables", icon: "🧪" },
  { kind: ["gear", "key", "treasure"], label: "Gear, keys & treasure", icon: "🎒" },
];

export function Inventory() {
  const s = useStore((x) => x.state)!;
  const you = useStore((x) => x.you);
  const c = s.players[you]?.character;
  const close = () => store.set({ panel: null });
  if (!c) return null;
  const tok = s.board.tokens.find((t) => t.ownerId === you);
  const cur = s.campaign ? RESKIN[s.campaign].currency : "gold";
  const friends = Object.values(s.players).filter((p) => p.id !== you && p.character && p.connected);
  const best = { attackBonus: itemBonus(c, "attackBonus"), acBonus: itemBonus(c, "acBonus"), saveBonus: itemBonus(c, "saveBonus") };
  const active = (i: Item) =>
    (i.attackBonus && i.attackBonus === best.attackBonus) || (i.acBonus && i.acBonus === best.acBonus) || (i.saveBonus && i.saveBonus === best.saveBonus);
  const inCombat = s.combat.active;
  return (
    <div className="modal-wrap" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal" style={{ width: "min(640px, calc(100vw - 24px))" }}>
        <button className="btn close" onClick={close}>✕</button>
        <h2>🎒 {c.name}'s pack</h2>
        <div className="stat-row">
          <div className="stat">{cur}<b>{c.gold}</b></div>
          <div className="stat">Armour<b>{armorClass(c)}</b></div>
          <div className="stat">Weapon bonus<b>+{best.attackBonus}</b></div>
          <div className="stat">Save bonus<b>+{best.saveBonus}</b></div>
          <div className="stat">Items<b>{c.inventory.reduce((n, i) => n + (i.qty ?? 1), 0)}</b></div>
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>Your best weapon, armour and charm are used automatically (marked ★). {inCombat ? "Using a potion in combat takes your action." : ""}</div>
        {c.inventory.length === 0 && <div className="card" style={{ marginTop: 10 }}>Empty pockets. A little lint. A button you don't remember owning.</div>}
        {GROUPS.map((g) => {
          const items = c.inventory.filter((i) => g.kind.includes(i.kind));
          if (!items.length) return null;
          return (
            <div key={g.label}>
              <h3>{g.icon} {g.label}</h3>
              {items.map((i) => (
                <div key={i.id} className={`inv-row ${i.relic ? "relic" : ""}`}>
                  <div className="inv-name">
                    <b>{active(i) ? "★ " : ""}{i.name}</b>{(i.qty ?? 1) > 1 && <span className="muted"> ×{i.qty}</span>}
                    <div className="small muted">
                      {[i.attackBonus ? `+${i.attackBonus} attack` : "", i.acBonus ? `+${i.acBonus} AC` : "", i.saveBonus ? `+${i.saveBonus} saves` : "", i.extraDamage ? `+${i.extraDamage.dice} ${i.extraDamage.type}` : "", i.heal ? `heals ${i.heal}` : ""].filter(Boolean).join(" · ")}
                      {i.desc ? ` ${i.desc}` : ""}
                    </div>
                  </div>
                  <div className="inv-actions">
                    {i.heal && tok && <button className="btn small primary" onClick={() => net.board({ type: "useItem", tokenId: tok.id, itemId: i.id })}>Use</button>}
                    {friends.length > 0 && (
                      <select className="small" value="" onChange={(e) => e.target.value && net.item("give", i.id, e.target.value)} title="Give to a friend">
                        <option value="">Give…</option>
                        {friends.map((f) => <option key={f.id} value={f.id}>{f.character!.name}</option>)}
                      </select>
                    )}
                    {!i.relic && <button className="btn small" title="Leave it behind" onClick={() => { if (confirm(`Drop ${i.name}?`)) net.item("drop", i.id); }}>Drop</button>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
