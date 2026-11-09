// Shared helpers for building world pieces.

import * as THREE from "three";

export interface Collider { minX: number; maxX: number; minZ: number; maxZ: number; top?: number }
export interface Seat { id: string; pos: THREE.Vector3; ry: number }
export type InteractKind = "quest" | "mirror" | "desk" | "jukebox" | "dice" | "table" | "seat" | "portal";
export interface Interactable { id: string; pos: THREE.Vector3; radius: number; label: string; kind: InteractKind; seatId?: string }

export interface WorldPiece {
  group: THREE.Group;
  colliders: Collider[];
  seats: Seat[];
  interactables: Interactable[];
  update?: (t: number, dt: number, viewer: THREE.Vector3) => void;
  dispose?: () => void;
  bounds: number; // radius players can wander
}

/** Positions an object and returns it (note: parent.add() returns the parent, not the child). */
export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

export function std(color: string | number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...o });
}

export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

export function aabb(x: number, z: number, w: number, d: number, top = 99): Collider {
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top };
}

/** Procedural canvas texture. */
export function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  t.anisotropy = 8;
  return t;
}

export function rngFrom(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite) {
      o.geometry?.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    }
  });
}

export function woodTexture(base: string, plank = 64, rep: [number, number] = [8, 8]) {
  return canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += plank / 2) {
      ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.12})`;
      ctx.fillRect(0, y, 256, plank / 2 - 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, y + plank / 2 - 2, 256, 2);
      for (let i = 0; i < 20; i++) {
        ctx.strokeStyle = `rgba(40,20,5,${Math.random() * 0.15})`;
        ctx.beginPath();
        const yy = y + Math.random() * (plank / 2);
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(80, yy + 3, 170, yy - 3, 256, yy);
        ctx.stroke();
      }
      const off = (y / plank) % 2 ? 90 : 190;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(off, y, 2, plank / 2);
    }
  }, rep);
}

export function noiseTexture(base: string, spots: string[], rep: [number, number], n = 600) {
  return canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = spots[i % spots.length];
      ctx.globalAlpha = 0.08 + Math.random() * 0.2;
      const r = 1 + Math.random() * 7;
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, rep);
}

let dotTex: THREE.Texture | null = null;
/** Soft round sprite for particles. */
export function dotTexture() {
  if (dotTex) return dotTex;
  dotTex = canvasTex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  return dotTex;
}
