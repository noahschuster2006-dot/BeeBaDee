// Exercises the AI game master's request/tool loop against a local mock of the Messages API.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seededRng } from "../src/shared/dice";
import { newCharacter } from "../src/shared/rules";
import { emptyRoom, Game } from "../src/server/game";
import { sanitizeLook } from "../src/server/room";

let server: Server;
const requests: Record<string, unknown>[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = JSON.parse(body);
      requests.push({ ...json, _headers: req.headers });
      const turn = requests.length;
      const content = turn === 1
        ? [
            { type: "text", text: "The snail blinks slowly." },
            { type: "tool_use", id: "tu_1", name: "npc_say", input: { npc: "Old Wick", text: "Lanterns, dears?" } },
            { type: "tool_use", id: "tu_2", name: "request_check", input: { character: "Hero0", skill: "insight", dc: 12, reason: "Read the old snail" } },
          ]
        : [{ type: "text", text: "Roll when you're ready." }];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: `msg_${turn}`, type: "message", role: "assistant", model: json.model, content,
        stop_reason: turn === 1 ? "tool_use" : "end_turn", stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("AI game master loop", () => {
  it("narrates, runs tools, returns results and stops", async () => {
    const { AiGameMaster } = await import("../src/server/gm/ai");
    const out: string[] = [];
    const state = emptyRoom("ai");
    state.players.p0 = { id: "p0", name: "P0", look: sanitizeLook({}), host: true, ready: true, connected: true, character: newCharacter({ id: "c0", name: "Hero0", cls: "cleric", ancestry: "human", campaign: "any" }) };
    const g = new Game(state, { chat: () => {}, fx: () => {}, dice: () => {}, changed: () => {}, gmEvent: () => {} }, seededRng(1));
    g.startCampaign("hollow");
    const gm = new AiGameMaster(g, { narrate: (t, npc) => out.push(`${npc ?? "GM"}: ${t}`), system: (t) => out.push(`SYS ${t}`), thinking: () => {}, changed: () => {} });
    expect(gm.enabled).toBe(true);
    gm.push('Hero0 says: "Hello, old one."', true);
    await new Promise((r) => setTimeout(r, 2500));

    expect(requests).toHaveLength(2);
    const first = requests[0] as { model: string; tools: { name: string }[]; system: { text: string }[]; messages: { content: string }[]; fallbacks: string; _headers: Record<string, string> };
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.fallbacks).toBe("default");
    expect(first._headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(first.tools.map((t) => t.name)).toContain("fire_trigger");
    expect(first.system[0].text).toContain("Game Master of BeeBaDee");
    expect(first.messages[0].content).toContain("Mossgrot Crossing");
    expect(first.messages[0].content).toContain("Hello, old one.");
    const second = requests[1] as { messages: { role: string; content: { type: string; tool_use_id?: string; is_error?: boolean }[] }[] };
    const results = second.messages[2].content;
    expect(results.map((r) => r.tool_use_id)).toEqual(["tu_1", "tu_2"]);
    expect(results.every((r) => !r.is_error)).toBe(true);
    expect(out).toEqual(["GM: The snail blinks slowly.", "Old Wick: Lanterns, dears?", "GM: Roll when you're ready."]);
    expect(g.state.checks[0]).toMatchObject({ skill: "insight", dc: 12 });
  });
});
