// The game table at the centre of every world. Its top shows the live board; minis stand on it.

import * as THREE from "three";
import { partyVision } from "../../shared/board";
import { isHostile } from "../../shared/rules";
import type { RoomState, Token, Transform } from "../../shared/types";
import { drawBoard, tokenVisible } from "../boardDraw";
import { at, box, cyl, std } from "./kit";
import { PUB } from "./pub";

export const TABLE = { w: 8.2, d: 5.2, h: 0.92, boardW: 7.4, boardD: 4.4 };

interface Mini { group: THREE.Group; ring: THREE.MeshStandardMaterial; body: THREE.MeshStandardMaterial; label: THREE.Sprite; glyph: string; target: THREE.Vector3 }

export class GameTable {
  group = new THREE.Group();
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private tex: THREE.CanvasTexture;
  private boardMesh: THREE.Mesh;
  private minis = new Map<string, Mini>();
  private lastDraw = 0;
  private holo: THREE.PointLight;
  private cell = 1;
  private origin = new THREE.Vector2();
  private dims = { w: 1, h: 1 };
  private relief = new THREE.Group();
  private reliefKey = "";

  constructor() {
    const wood = std("#5b3a1e", { roughness: 0.55 });
    const top = box(TABLE.w, 0.14, TABLE.d, wood, 0, TABLE.h - 0.07, 0);
    this.group.add(top);
    const rim = std("#3a2412", { roughness: 0.5 });
    this.group.add(box(TABLE.w + 0.2, 0.12, 0.18, rim, 0, TABLE.h + 0.02, TABLE.d / 2 + 0.05));
    this.group.add(box(TABLE.w + 0.2, 0.12, 0.18, rim, 0, TABLE.h + 0.02, -TABLE.d / 2 - 0.05));
    this.group.add(box(0.18, 0.12, TABLE.d, rim, TABLE.w / 2 + 0.05, TABLE.h + 0.02, 0));
    this.group.add(box(0.18, 0.12, TABLE.d, rim, -TABLE.w / 2 - 0.05, TABLE.h + 0.02, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.group.add(cyl(0.16, 0.2, TABLE.h - 0.1, rim, sx * (TABLE.w / 2 - 0.5), (TABLE.h - 0.1) / 2, sz * (TABLE.d / 2 - 0.5), 10));
    this.canvas.width = 1024;
    this.canvas.height = 600;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.8, emissiveMap: this.tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.35 }));
    this.boardMesh.rotation.x = -Math.PI / 2;
    this.boardMesh.position.y = TABLE.h + 0.005;
    this.boardMesh.receiveShadow = true;
    this.group.add(this.boardMesh);
    this.holo = new THREE.PointLight("#fff1d0", 9, 12, 1.4);
    this.holo.position.set(0, TABLE.h + 2.6, 0);
    this.group.add(this.holo);
    this.group.add(this.relief);
  }

  /** Raised 3D terrain on the board: walls, pillars, trees and doors stand up out of the map. */
  private buildRelief(b: RoomState["board"]) {
    const key = `${b.sceneId}:${b.explored}:${b.tiles.join("")}`;
    if (key === this.reliefKey) return;
    this.reliefKey = key;
    for (const c of [...this.relief.children]) {
      this.relief.remove(c);
      if (c instanceof THREE.Mesh || c instanceof THREE.InstancedMesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    }
    const theme = b.theme;
    const colors: Record<string, { wall: string; pillar: string; leaf?: string }> = {
      realm: { wall: "#6a6058", pillar: "#4a3320", leaf: "#2e5a24" },
      hollow: { wall: "#2a3046", pillar: "#3a4460" },
      neon: { wall: "#14161e", pillar: "#1c3a5a" },
    };
    const pal = colors[theme] ?? colors.realm;
    const c = this.cell;
    const walls: [number, number][] = [];
    const pillars: [number, number][] = [];
    const doors: [number, number][] = [];
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      if (b.explored[y * b.width + x] !== "1") continue;
      const ch = b.tiles[y][x];
      if (ch === "#") walls.push([x, y]);
      else if (ch === "T") pillars.push([x, y]);
      else if (ch === "+") doors.push([x, y]);
    }
    const place = (list: [number, number][], geo: THREE.BufferGeometry, mat: THREE.Material, h: number) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4();
      list.forEach(([x, y], i) => { const p = this.squareToWorld(x, y); m.makeTranslation(p.x, TABLE.h + h / 2, p.z); im.setMatrixAt(i, m); });
      im.castShadow = true;
      this.relief.add(im);
    };
    const wallH = c * 0.7;
    place(walls, new THREE.BoxGeometry(c, wallH, c), new THREE.MeshStandardMaterial({ color: pal.wall, roughness: 0.8, emissive: theme === "neon" ? new THREE.Color("#ff3fa4") : undefined, emissiveIntensity: theme === "neon" ? 0.08 : 0 }), wallH);
    if (pal.leaf) {
      place(pillars, new THREE.CylinderGeometry(c * 0.08, c * 0.1, c * 0.5, 6), new THREE.MeshStandardMaterial({ color: pal.pillar }), c * 0.5);
      const leaves = pillars.map(([x, y]) => [x, y] as [number, number]);
      if (leaves.length) {
        const im = new THREE.InstancedMesh(new THREE.ConeGeometry(c * 0.42, c * 1.1, 7), new THREE.MeshStandardMaterial({ color: pal.leaf }), leaves.length);
        const m = new THREE.Matrix4();
        leaves.forEach(([x, y], i) => { const p = this.squareToWorld(x, y); m.makeTranslation(p.x, TABLE.h + c * 0.95, p.z); im.setMatrixAt(i, m); });
        im.castShadow = true;
        this.relief.add(im);
      }
    } else {
      place(pillars, new THREE.CylinderGeometry(c * 0.32, c * 0.38, c * 1.2, 10), new THREE.MeshStandardMaterial({ color: pal.pillar, emissive: new THREE.Color(theme === "neon" ? "#3af0ff" : "#6a80c0"), emissiveIntensity: 0.15 }), c * 1.2);
    }
    place(doors, new THREE.BoxGeometry(c * 0.9, c * 0.55, c * 0.2), new THREE.MeshStandardMaterial({ color: "#7a4f2a" }), c * 0.55);
  }

  /** World position (on the table top) of a board square. */
  squareToWorld(x: number, y: number, size = 1) {
    return new THREE.Vector3(
      this.origin.x + (x + size / 2) * this.cell,
      TABLE.h + 0.01,
      this.origin.y + (y + size / 2) * this.cell,
    );
  }

  private layout(w: number, h: number) {
    const cell = Math.min(TABLE.boardW / w, TABLE.boardD / h);
    this.cell = cell;
    this.dims = { w, h };
    this.boardMesh.scale.set(w * cell, h * cell, 1);
    this.origin.set(-(w * cell) / 2, -(h * cell) / 2);
    const px = Math.floor(Math.min(2048 / w, 1200 / h, 64));
    if (this.canvas.width !== w * px || this.canvas.height !== h * px) {
      this.canvas.width = w * px;
      this.canvas.height = h * px;
      this.tex.dispose();
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.anisotropy = 8;
      const m = this.boardMesh.material as THREE.MeshStandardMaterial;
      m.map = this.tex;
      m.emissiveMap = this.tex;
      m.needsUpdate = true;
    }
    return px;
  }

  update(t: number, dt: number, rs: RoomState | null, you: string, trs: Record<string, Transform>, pings: { x: number; y: number; t: number; color: string }[]) {
    if (!rs) return;
    const redraw = t - this.lastDraw > 0.12;
    if (rs.phase === "pub" || rs.board.width === 0) {
      if (this.relief.children.length) this.buildRelief({ ...rs.board, explored: "", sceneId: "pub", tiles: [] });
      if (redraw) { this.lastDraw = t; this.drawPub(rs, trs); }
      this.syncMinis([], dt);
      return;
    }
    const b = rs.board;
    const px = this.layout(b.width, b.height);
    const vis = partyVision(b);
    this.buildRelief(b);
    if (redraw) {
      this.lastDraw = t;
      const cur = rs.combat.active ? rs.combat.order[rs.combat.turn] : null;
      drawBoard(this.ctx, b, { cell: px, vis, time: t, currentId: cur, pings, selected: b.tokens.find((x) => x.ownerId === you)?.id });
      this.tex.needsUpdate = true;
    }
    this.syncMinis(b.tokens.filter((x) => tokenVisible(x, b, vis) && !x.conditions.includes("dead")), dt);
  }

  private drawPub(rs: RoomState, trs: Record<string, Transform>) {
    const W = 26, H = 22;
    const px = this.layout(W, H);
    const c = this.ctx;
    c.fillStyle = "#6b4626";
    c.fillRect(0, 0, W * px, H * px);
    c.strokeStyle = "rgba(0,0,0,0.12)";
    for (let x = 0; x <= W; x++) { c.beginPath(); c.moveTo(x * px, 0); c.lineTo(x * px, H * px); c.stroke(); }
    for (let y = 0; y <= H; y++) { c.beginPath(); c.moveTo(0, y * px); c.lineTo(W * px, y * px); c.stroke(); }
    const toPx = (x: number, z: number) => [(x + PUB.w / 2) * px, (z + PUB.d / 2) * px] as const;
    const rect = (x: number, z: number, w: number, d: number, col: string) => { const [a, b] = toPx(x - w / 2, z - d / 2); c.fillStyle = col; c.fillRect(a, b, w * px, d * px); };
    rect(2, -PUB.d / 2 + 2.2, 10, 0.9, "#3a2210"); // bar
    rect(0, 0, TABLE.w, TABLE.d, "#2a1a0d");
    rect(-PUB.w / 2 + 0.6, -1.5, 1.4, 3.6, "#555");
    c.fillStyle = "#3a2210";
    for (const [x, z] of [[-9, -6], [9.5, 6.5], [-9.5, 6], [10, -3]]) { const [a, b] = toPx(x, z); c.beginPath(); c.arc(a, b, 0.8 * px, 0, Math.PI * 2); c.fill(); }
    c.font = `bold ${px * 0.9}px Georgia`;
    c.fillStyle = "#f2c66d";
    c.textAlign = "center";
    c.fillText("THE GILDED MUG", (W * px) / 2, H * px * 0.5 + px * 0.3);
    c.font = `${px * 0.5}px Georgia`;
    c.fillText("Visit the Quest Board to choose an adventure", (W * px) / 2, H * px * 0.5 + px * 1.3);
    // players as tokens
    for (const [pid, tr] of Object.entries(trs)) {
      const p = rs.players[pid];
      if (!p) continue;
      const [a, b] = toPx(tr.x, tr.z);
      c.fillStyle = p.look.primary;
      c.beginPath(); c.arc(a, b, px * 0.45, 0, Math.PI * 2); c.fill();
      c.lineWidth = 3; c.strokeStyle = "#59e08a"; c.stroke();
      c.fillStyle = "#fff"; c.font = `600 ${px * 0.45}px system-ui`;
      c.fillText(p.name, a, b - px * 0.7);
    }
    this.tex.needsUpdate = true;
  }

  private syncMinis(tokens: Token[], dt: number) {
    const seen = new Set<string>();
    for (const t of tokens) {
      seen.add(t.id);
      let m = this.minis.get(t.id);
      const target = this.squareToWorld(t.x, t.y, t.size);
      if (!m || m.glyph !== t.glyph) {
        if (m) { this.group.remove(m.group); }
        m = this.makeMini(t);
        m.group.position.copy(target);
        this.minis.set(t.id, m);
        this.group.add(m.group);
      }
      m.target.copy(target);
      m.group.position.lerp(m.target, Math.min(1, dt * 8));
      m.group.position.y = TABLE.h + 0.01 + Math.max(0, Math.sin((m.group.position.distanceTo(m.target)) * 6)) * 0.05;
      m.ring.color.set(t.kind === "pc" ? "#59e08a" : isHostile(t) ? "#ff4d4d" : t.disposition === "neutral" ? "#ffd04d" : "#6cc3ff");
      m.body.color.set(t.color);
      const down = t.conditions.includes("unconscious");
      m.group.rotation.z = down ? Math.PI / 2.4 : 0;
      m.group.scale.setScalar(this.cell / 0.25 * t.size * (t.size > 1 ? 0.8 : 1));
    }
    for (const [id, m] of this.minis) if (!seen.has(id)) { this.group.remove(m.group); this.minis.delete(id); }
  }

  private makeMini(t: Token): Mini {
    const g = new THREE.Group();
    const ring = std("#59e08a", { emissive: new THREE.Color("#222"), roughness: 0.4 });
    const body = std(t.color, { roughness: 0.5 });
    g.add(cyl(0.1, 0.11, 0.025, ring, 0, 0.012, 0, 18));
    g.add(cyl(0.035, 0.06, 0.13, body, 0, 0.09, 0, 12));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), body), 0, 0.19, 0));
    const c = document.createElement("canvas");
    c.width = c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.font = '72px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.glyph, 48, 54);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    label.scale.setScalar(0.12);
    label.position.y = 0.32;
    g.add(label);
    return { group: g, ring, body, label, glyph: t.glyph, target: new THREE.Vector3() };
  }

  /** Raycast hit on the board → square coordinates. */
  boardSquare(point: THREE.Vector3) {
    const x = Math.floor((point.x - this.origin.x) / this.cell);
    const y = Math.floor((point.z - this.origin.y) / this.cell);
    if (x < 0 || y < 0 || x >= this.dims.w || y >= this.dims.h) return null;
    return [x, y] as const;
  }

  get boardObject() { return this.boardMesh; }
}
