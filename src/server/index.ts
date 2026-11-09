// HTTP + WebSocket entry point. Serves the built client in production and hosts the game rooms.

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMsg } from "../shared/protocol";
import type { GmConfig } from "./gm/ai";
import { Room, type RoomStorage } from "./room";

const PORT = Number(process.env.PORT || 8787);
const DIST = join(process.cwd(), "dist");
const rooms = new Map<string, Room>();
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data", "rooms");

const aiConfigured = () => process.env.GM_DISABLE_AI !== "1" && !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const gmConfig: GmConfig = {
  enabled: aiConfigured(),
  model: process.env.GM_MODEL || undefined,
  effort: (process.env.GM_EFFORT as GmConfig["effort"]) || undefined,
};
const fileStorage: RoomStorage = {
  load(id) {
    const f = join(DATA_DIR, `${id.replace(/[^a-z0-9-]/gi, "_")}.json`);
    return existsSync(f) ? readFileSync(f, "utf8") : null;
  },
  save(id, data) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(join(DATA_DIR, `${id.replace(/[^a-z0-9-]/gi, "_")}.json`), data);
  },
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, ai: aiConfigured() }));
    return;
  }
  if (!existsSync(DIST)) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("BeeBaDee game server is running. In development open the Vite client at http://localhost:5173");
    return;
  }
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });

wss.on("connection", (ws: WebSocket) => {
  let room: Room | null = null;
  let conn: ReturnType<Room["join"]> = null;
  let budget = 60; // simple flood control: messages per second
  const refill = setInterval(() => (budget = 60), 1000);

  ws.on("message", (data) => {
    if (--budget < 0) return;
    let msg: ClientMsg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (!conn) {
      if (msg.t !== "hello") return;
      const code = String(msg.room || "tavern").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "tavern";
      room = rooms.get(code) ?? new Room(code, { storage: fileStorage, gm: gmConfig, stepMs: Number(process.env.ENEMY_STEP_MS ?? 750) });
      rooms.set(code, room);
      conn = room.join({ send: (d) => ws.send(d), close: () => ws.close(), isOpen: () => ws.readyState === 1 }, msg);
      return;
    }
    try {
      room!.handle(conn, msg);
    } catch (e) {
      console.error("[room] handler error", e);
    }
  });

  ws.on("close", () => {
    clearInterval(refill);
    if (room && conn) {
      room.leave(conn);
      const r = room;
      // keep empty rooms around briefly so people can reconnect
      setTimeout(() => {
        if (r.empty && rooms.get(r.id) === r) { r.dispose(); rooms.delete(r.id); }
      }, 10 * 60_000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🍺 BeeBaDee server on http://localhost:${PORT}  (AI game master: ${aiConfigured() ? "on" : "off — scripted narrator"})`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    for (const r of rooms.values()) r.dispose();
    process.exit(0);
  });
}
