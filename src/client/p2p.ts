// Browser-hosted tables for static hosting (GitHub Pages). No game server needed:
// the first browser to open a table code becomes the host and runs the whole game (rules, scripts,
// AI game master); everyone else connects to it peer-to-peer over WebRTC data channels.
// The public PeerJS broker is only used to introduce browsers to each other.

import Peer, { type DataConnection } from "peerjs";
import type { ClientMsg } from "../shared/protocol";
import type { Transport } from "./net";
import { GM_KEY, loadLocalRaw, store } from "./store";
import type { Link, Room as RoomT, RoomStorage } from "../server/room";
import type { Effort } from "../server/gm/ai";

interface Callbacks {
  onOpen(t: Transport): void;
  onClose(t: Transport, reason?: string): void;
  receive(data: string): void;
}

export interface GmSettings { apiKey?: string; model?: string; effort?: Effort }

const hostId = (code: string) => `beebadee-v2-${code}`;

/** Optional self-hosted PeerJS broker: ?peerhost=example.com&peerport=443&peerpath=/myapp&peersecure=1 */
function brokerOptions() {
  const q = new URLSearchParams(location.search);
  const host = q.get("peerhost");
  if (!host) return { debug: 0 };
  return {
    debug: 0, host, port: Number(q.get("peerport") || 443), path: q.get("peerpath") || "/",
    secure: q.get("peersecure") !== "0",
  };
}

const localStore: RoomStorage = {
  load: (id) => { try { return localStorage.getItem(`bbd.room.${id}`); } catch { return null; } },
  save: (id, data) => { try { localStorage.setItem(`bbd.room.${id}`, data); } catch { /* full or private mode */ } },
};

let peer: Peer | null = null;
let room: RoomT | null = null;

export function openP2P(code: string, cb: Callbacks) {
  peer?.destroy();
  peer = null;
  tryHost(code, cb);
}

function tryHost(code: string, cb: Callbacks) {
  const p = new Peer(hostId(code), brokerOptions());
  peer = p;
  let settled = false;
  p.on("open", async () => {
    settled = true;
    const { Room } = await import("../server/room");
    const gm = loadLocalRaw<GmSettings>(GM_KEY) ?? {};
    room = new Room(code, {
      storage: localStore,
      gm: { enabled: !!gm.apiKey, apiKey: gm.apiKey, model: gm.model, effort: gm.effort, browser: true },
      stepMs: 750,
    });
    const r = room;
    store.set({ hosting: true });
    // this browser's own player talks to the room directly
    let mine: ReturnType<RoomT["join"]> = null;
    const loop: Link = { send: (d) => queueMicrotask(() => cb.receive(d)), close: () => {}, isOpen: () => true };
    const t: Transport = {
      send: (d) => {
        const m = JSON.parse(d) as ClientMsg;
        if (!mine) { if (m.t === "hello") mine = r.join(loop, m); return; }
        try { r.handle(mine, m); } catch (e) { console.error(e); }
      },
      close: () => {},
    };
    cb.onOpen(t);
    p.on("connection", (dc) => acceptGuest(r, dc));
    window.addEventListener("beforeunload", () => { r.dispose(); p.destroy(); });
  });
  p.on("error", (err: { type?: string }) => {
    if (!settled && err.type === "unavailable-id") {
      // someone already hosts this table: join them
      settled = true;
      p.destroy();
      joinAsGuest(code, cb);
      return;
    }
    if (!settled) {
      settled = true;
      store.toast("Couldn't reach the matchmaking service. Retrying…", "error");
      p.destroy();
      setTimeout(() => openP2P(code, cb), 3000);
    }
  });
}

function acceptGuest(r: RoomT, dc: DataConnection) {
  let conn: ReturnType<RoomT["join"]> = null;
  let budget = 60;
  const refill = setInterval(() => (budget = 60), 1000);
  const link: Link = { send: (d) => { if (dc.open) dc.send(d); }, close: () => dc.close(), isOpen: () => dc.open };
  dc.on("data", (raw) => {
    if (--budget < 0) return;
    let m: ClientMsg;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (!conn) { if (m?.t === "hello") conn = r.join(link, m); return; }
    try { r.handle(conn, m); } catch (e) { console.error("[host] guest message failed", e); }
  });
  dc.on("close", () => { clearInterval(refill); if (conn) r.leave(conn); });
  dc.on("error", () => { clearInterval(refill); if (conn) r.leave(conn); });
}

function joinAsGuest(code: string, cb: Callbacks) {
  const p = new Peer(brokerOptions());
  peer = p;
  store.set({ hosting: false });
  p.on("open", () => {
    const dc = p.connect(hostId(code), { reliable: true });
    const t: Transport = { send: (d) => { if (dc.open) dc.send(d); }, close: () => dc.close() };
    dc.on("open", () => cb.onOpen(t));
    dc.on("data", (d) => cb.receive(String(d)));
    dc.on("close", () => { p.destroy(); cb.onClose(t, "Lost the host. Reconnecting — if the host left, you'll take over the table."); });
  });
  p.on("error", (err: { type?: string }) => {
    if (err.type === "peer-unavailable") {
      // the host vanished between lookups: try to host it ourselves
      p.destroy();
      setTimeout(() => openP2P(code, cb), 500);
    }
  });
}
