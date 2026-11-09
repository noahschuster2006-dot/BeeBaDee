import { describe, expect, it } from "vitest";
import { seededRng } from "../src/shared/dice";
import { attacksPerAction, newCharacter, reachLevel, knownSpells } from "../src/shared/rules";
import type { ClassId } from "../src/shared/types";
import { emptyRoom, Game } from "../src/server/game";
import { sanitizeLook } from "../src/server/room";

function setup(classes: ClassId[] = ["fighter", "cleric"], seed = 3) {
  const log: string[] = [];
  const state = emptyRoom("s");
  classes.forEach((cls, i) => {
    state.players[`p${i}`] = { id: `p${i}`, name: `P${i}`, look: sanitizeLook({}), host: i === 0, ready: true, connected: true,
      character: newCharacter({ id: `c${i}`, name: `Hero${i}`, cls, ancestry: "human", campaign: "any" }) };
  });
  const g = new Game(state, { chat: (m) => log.push(m.text), fx: () => {}, dice: () => {}, changed: () => {}, gmEvent: () => {} }, seededRng(seed));
  return { g, log };
}

describe("story systems", () => {
  it("party votes resolve by majority and run the chosen branch", () => {
    const { g, log } = setup();
    g.startCampaign("realm");
    g.loadScene("den");
    g.run([{ do: "choice", prompt: "Cubs?", options: [
      { label: "Spare", actions: [{ do: "flag", key: "cubsSpared", value: true }] },
      { label: "Kill", actions: [{ do: "flag", key: "cubsKilled", value: true }] },
    ] }]);
    const c = g.state.choices[0];
    expect(c.options).toEqual(["Spare", "Kill"]);
    g.vote("p0", c.id, 0);
    expect(g.state.choices).toHaveLength(1); // 1 of 2 isn't a majority
    g.vote("p1", c.id, 0);
    expect(g.state.choices).toHaveLength(0);
    expect(g.state.flags.cubsSpared).toBe(true);
    expect(log.some((l) => l.includes("The party chooses: Spare"))).toBe(true);
  });

  it("the host can force a decision", () => {
    const { g } = setup(["fighter", "rogue", "wizard"]);
    g.startCampaign("realm");
    g.run([{ do: "choice", prompt: "Go?", options: [{ label: "A", actions: [{ do: "flag", key: "a", value: true }] }, { label: "B", actions: [] }] }]);
    g.vote("p0", g.state.choices[0].id, 0, true);
    expect(g.state.flags.a).toBe(true);
  });

  it("killing a key NPC fires the scene's consequences", () => {
    const { g, log } = setup();
    g.startCampaign("realm");
    g.loadScene("village");
    const reeve = g.board.tokens.find((t) => t.name === "Reeve Aldous")!;
    g.damage(reeve, 999, "slashing");
    expect(g.state.flags.reeveDead).toBe(true);
    expect(g.state.flags["dead:Reeve Aldous"]).toBe(true);
    expect(g.board.tokens.filter((t) => t.faction === "village" && !t.conditions.includes("dead")).every((t) => t.kind === "enemy")).toBe(true);
    expect(log.some((l) => l.includes("chain of office"))).toBe(true);
  });

  it("flag-gated NPCs only appear when the story allows", () => {
    const { g } = setup();
    g.startCampaign("realm");
    g.loadScene("village");
    expect(g.board.tokens.some((t) => t.name === "Hollis the Merchant")).toBe(false);
    g.state.flags.hollisSaved = true;
    g.loadScene("village");
    expect(g.board.tokens.some((t) => t.name === "Hollis the Merchant")).toBe(true);
  });

  it("random tables roll publicly and branch", () => {
    const { g, log } = setup();
    g.startCampaign("realm");
    g.run([{ do: "random", dice: "1d4", label: "Test fate", outcomes: [{ min: 1, max: 2, actions: [{ do: "flag", key: "low", value: true }] }, { min: 3, max: 4, actions: [{ do: "flag", key: "high", value: true }] }] }]);
    expect(log.some((l) => l.startsWith("🎲 Test fate:"))).toBe(true);
    expect(!!g.state.flags.low !== !!g.state.flags.high).toBe(true);
  });

  it("milestones level the party and new heroes catch up", () => {
    const { g } = setup();
    g.startCampaign("realm");
    g.milestone(5);
    for (const p of Object.values(g.state.players)) expect(p.character!.level).toBe(5);
    expect(attacksPerAction(g.state.players.p0.character!)).toBe(2);
    expect(knownSpells(g.state.players.p1.character!)).toContain("spiritguardians");
    const late = { id: "p9", name: "Late", look: sanitizeLook({}), host: false, ready: true, connected: true, character: newCharacter({ id: "c9", name: "Latecomer", cls: "rogue", ancestry: "elf", campaign: "any" }) };
    g.state.players.p9 = late;
    g.catchUp(late);
    expect(late.character.level).toBe(5);
  });

  it("shops sell their tier for gold, next to the counter only", () => {
    const { g } = setup();
    g.startCampaign("realm");
    g.loadScene("village");
    const shop = g.board.props.find((p) => p.shop)!;
    const hero = g.pcTokens()[0];
    const ch = g.charFor(hero)!;
    ch.gold = 1000;
    expect(g.act(hero.ownerId!, { type: "buy", tokenId: hero.id, propId: shop.id, itemId: "armor1" })).toMatch(/Walk up/);
    hero.x = shop.x + 1; hero.y = shop.y;
    const ac = hero.ac;
    expect(g.act(hero.ownerId!, { type: "buy", tokenId: hero.id, propId: shop.id, itemId: "armor1" })).toBeNull();
    expect(ch.gold).toBe(400);
    expect(hero.ac).toBe(ac + 1);
    expect(g.act(hero.ownerId!, { type: "buy", tokenId: hero.id, propId: shop.id, itemId: "amulet" })).toMatch(/don't sell/);
  });

  it("story survives a trip to the pub and resumes where it left off", () => {
    const { g } = setup();
    g.startCampaign("realm");
    g.loadScene("stilthaven");
    g.state.flags.childrenSaved = true;
    const snap = g.storySnapshot();
    g.state.flags["story:realm"] = JSON.stringify(snap);
    g.state.flags["lastScene:realm"] = "stilthaven";
    g.returnToPub();
    g.state.flags["story:realm"] = JSON.stringify(snap);
    g.startCampaign("realm", "stilthaven");
    expect(g.board.sceneId).toBe("stilthaven");
    expect(g.state.flags.childrenSaved).toBe(true);
    expect(g.state.flags.mayorMet).toBe(true); // the mayor's greeting doesn't repeat
  });

  it("reachLevel never lowers a character", () => {
    const c = newCharacter({ id: "x", name: "X", cls: "wizard", ancestry: "elf", campaign: "any" });
    reachLevel(c, 7);
    expect(c.level).toBe(7);
    reachLevel(c, 3);
    expect(c.level).toBe(7);
  });
});
