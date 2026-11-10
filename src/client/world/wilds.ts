// 3D worlds for travel encounters and landmarks. Every reusable terrain has four looks that
// match its four board layouts (preset "meadow-2" = the third meadow), and every landmark
// (wizard's tower, bandit camp, ripperdoc clinic...) has its own place around the table.

import * as THREE from "three";
import { sound } from "./audio";
import { aabb, type Collider, type Interactable } from "./kit";
import { Fx, at, basic, box, critters, cottage, cyl, glow, ground, lamp, ring, scatter, sign, spot, std, tree, type Built } from "./worldkit";
import { dome, make, water } from "./worlds";

type Variant = (rand: () => number, v: number) => Built;
/** Adds a child and returns the child (Object3D.add returns the parent). */
function put<T extends THREE.Object3D>(parent: THREE.Object3D, child: T): T { parent.add(child); return child; }
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Sfx = Parameters<typeof sound.sfx>[0];

/** A world under construction: the group, its colliders, animations and one shared interaction. */
class Kit {
  g = new THREE.Group();
  col: Collider[] = [];
  fx = new Fx(this.g);
  updates: ((t: number, dt: number) => void)[] = [(_, dt) => this.fx.update(dt)];
  inter: Interactable[] = [];
  fxs: Record<string, () => void> = {};
  constructor(public rand: () => number) {}
  solid(x: number, z: number, w: number, d: number) { this.col.push(aabb(x, z, w, d)); }
  /** Press-E interaction everyone sees: a glowing marker that bursts when used. */
  interact(id: string, label: string, x: number, y: number, z: number, color: string, sfx: Sfx, extra?: () => void) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), basic(color));
    m.position.set(x, y + 0.9, z);
    m.userData.outlineParameters = { visible: false };
    this.g.add(m);
    const l = new THREE.PointLight(color, 4, 7, 1.6); l.position.copy(m.position); this.g.add(l);
    this.updates.push((t) => { m.rotation.y = t * 1.5; m.position.y = y + 0.9 + Math.sin(t * 2) * 0.1; });
    this.inter.push(spot(id, label, x, 1, z));
    this.fxs[id] = () => { sound.sfx(sfx); this.fx.burst(V(x, y + 0.5, z), color, 60, 3); this.fx.ring(V(x, 0.1, z), color, 10); this.fx.flash(V(x, y + 1, z), color, 25); extra?.(); };
  }
  done(enclosed = false): Built { return make(this.g, this.col, { updates: this.updates, inter: this.inter, fx: this.fxs, enclosed }); }
}

// ---------------------------------------------------------------- shared pieces

function rocks(k: Kit, n: number, r0: number, r1: number, color = "#8a857c", size = 1) {
  const m = std(color, { flatShading: true });
  for (const [x, z, r] of scatter(k.rand, n, r0, r1)) {
    const s = (0.4 + r * 1.2) * size;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), m);
    rock.position.set(x, s * 0.5, z); rock.rotation.set(r * 3, r * 7, r); rock.scale.y = 0.7; rock.castShadow = true;
    k.g.add(rock);
    if (s > 0.9) k.solid(x, z, s * 1.4, s * 1.4);
  }
}

function forest(k: Kit, n: number, r0: number, r1: number, leaves: string[], pine = 0.5, trunk = "#4a3320") {
  const tm = std(trunk); const lm = leaves.map((c) => std(c, { flatShading: true }));
  for (const [x, z, r] of scatter(k.rand, n, r0, r1)) { tree(k.g, x, z, 3 + r * 4, lm[Math.floor(r * 97) % lm.length], tm, r < pine); k.solid(x, z, 0.8, 0.8); }
}

/** Instanced tufts of grass, reeds, wheat or flowers. */
function tufts(k: Kit, n: number, r0: number, r1: number, color: string, h = 0.5, w = 0.08, tip?: string) {
  const geo = new THREE.ConeGeometry(w, h, 4); geo.translate(0, h / 2, 0);
  const im = new THREE.InstancedMesh(geo, std(color), n);
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
  scatter(k.rand, n, r0, r1).forEach(([x, z, r], i) => { q.setFromEuler(new THREE.Euler((r - 0.5) * 0.4, r * 6, (r - 0.5) * 0.4)); s.setScalar(0.6 + r * 0.9); m4.compose(V(x, 0, z), q, s); im.setMatrixAt(i, m4); });
  im.userData.outlineParameters = { visible: false };
  k.g.add(im);
  if (tip) {
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), basic(tip), Math.floor(n / 4));
    scatter(k.rand, Math.floor(n / 4), r0, r1).forEach(([x, z, r], i) => { m4.compose(V(x, h * (0.6 + r * 0.8), z), q.identity(), s.setScalar(1)); fl.setMatrixAt(i, m4); });
    fl.userData.outlineParameters = { visible: false };
    k.g.add(fl);
  }
}

function flatDisc(k: Kit, r: number, color: string, y = 0.015, x = 0, z = 0, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), std(color, o)); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; k.g.add(m); return m;
}
function flatRect(k: Kit, w: number, d: number, color: string, x: number, z: number, y = 0.02, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std(color, o)); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; k.g.add(m); return m;
}

/** A tall city block with lit windows. */
function tower(k: Kit, x: number, z: number, w: number, d: number, h: number, color: string, lit: string[], y = 0) {
  const b = box(w, h, d, std(color), x, y + h / 2, z); k.g.add(b);
  const wm = lit.map((c) => glow(c, 1.1));
  const rows = Math.floor(h / 1.6);
  for (let i = 0; i < rows; i++) for (const side of [-1, 1]) {
    if (k.rand() < 0.45) continue;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.5), wm[Math.floor(k.rand() * wm.length)]);
    win.position.set(x, y + 1 + i * 1.6, z + side * (d / 2 + 0.02)); if (side < 0) win.rotation.y = Math.PI;
    k.g.add(win);
  }
  if (y === 0 && Math.hypot(x, z) < 36) k.solid(x, z, w, d);
}

/** City lights far below a rooftop. */
function skyline(k: Kit, colors: string[], below = -30) {
  for (const p of ring(40, 46, 0.1)) tower(k, p.x + (k.rand() - 0.5) * 8, p.z + (k.rand() - 0.5) * 8, 4 + k.rand() * 4, 4 + k.rand() * 4, 20 + k.rand() * 50, "#14141e", colors, below);
}

function barrel(k: Kit, x: number, z: number, color = "#5a3a20", fire = false) {
  k.g.add(cyl(0.45, 0.45, 1.1, std(color), x, 0.55, z, 12)); k.solid(x, z, 1, 1);
  if (fire) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8), glow("#ff8a3a", 2)); f.position.set(x, 1.4, z); k.g.add(f); const l = new THREE.PointLight("#ff8a3a", 6, 9, 1.6); l.position.set(x, 1.8, z); k.g.add(l); k.updates.push((t) => { f.scale.y = 1 + Math.sin(t * 13 + x) * 0.25; l.intensity = 5 + Math.sin(t * 17 + z) * 1.5; }); }
}

function crate(k: Kit, x: number, z: number, s = 1, color = "#8a6a3a", y = 0) { k.g.add(box(s, s, s, std(color), x, y + s / 2, z)); if (y === 0) k.solid(x, z, s, s); }

function fence(k: Kit, x0: number, z0: number, x1: number, z1: number, color = "#6a4a2a") {
  const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.ceil(len / 1.5);
  const m = std(color);
  for (let i = 0; i <= n; i++) k.g.add(cyl(0.07, 0.07, 1.1, m, x0 + ((x1 - x0) * i) / n, 0.55, z0 + ((z1 - z0) * i) / n, 6));
  const rail = box(len, 0.08, 0.08, m, (x0 + x1) / 2, 0.85, (z0 + z1) / 2); rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0); k.g.add(rail);
  const rail2 = rail.clone(); rail2.position.y = 0.45; k.g.add(rail2);
}

function deadTree(k: Kit, x: number, z: number, h: number, color = "#3a3028") {
  const m = std(color);
  k.g.add(cyl(0.12, 0.3, h, m, x, h / 2, z, 6));
  for (let i = 0; i < 4; i++) { const b = cyl(0.04, 0.09, h * 0.4, m, x, h * (0.55 + i * 0.1), z, 5); b.rotation.z = (i % 2 ? 1 : -1) * (0.6 + i * 0.15); b.rotation.y = i * 1.7; b.position.x += Math.cos(i * 1.7) * 0.3; k.g.add(b); }
  k.solid(x, z, 0.6, 0.6);
}

function mushroom(k: Kit, x: number, z: number, h: number, cap: string, glowAmt = 0.4) {
  k.g.add(cyl(0.12 + h * 0.06, 0.18 + h * 0.08, h, std("#e8dcc8"), x, h / 2, z, 10));
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.5 + h * 0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glow(cap, glowAmt));
  c.position.set(x, h, z); c.scale.y = 0.6; c.castShadow = true; k.g.add(c);
  if (h > 1.5) k.solid(x, z, 0.9, 0.9);
}

function thornBush(k: Kit, x: number, z: number, s: number, color = "#3a2a2a") {
  const m = std(color, { flatShading: true });
  for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 1.2 * s, 4), m); c.position.set(x, 0.5 * s, z); c.rotation.set((k.rand() - 0.5) * 2.4, k.rand() * 6, (k.rand() - 0.5) * 2.4); k.g.add(c); }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * s, 0), std("#2a3a22", { flatShading: true })); core.position.set(x, 0.4 * s, z); k.g.add(core);
  k.solid(x, z, s, s);
}

function stoneWall(k: Kit, x0: number, z0: number, x1: number, z1: number, h = 1, color = "#8a8478") {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const w = box(len, h, 0.6, std(color, { flatShading: true }), (x0 + x1) / 2, h / 2, (z0 + z1) / 2); w.rotation.y = -Math.atan2(z1 - z0, x1 - x0); k.g.add(w);
  const n = Math.ceil(len / 2); for (let i = 0; i <= n; i++) k.solid(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, 1.2, 1.2);
}

function underground(k: Kit, floor: string, spots: string[], roof: string) {
  k.g.add(ground(floor, spots, 22));
  dome(k.g, roof, 46, 0.36);
  // cave walls ring so it reads as a cavern, not a void
  for (const p of ring(30, 38, 0)) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(5 + k.rand() * 4, 0), std(roof, { flatShading: true })); r.position.set(p.x, 2, p.z); r.scale.y = 1.6; k.g.add(r); }
}

function glowMotes(k: Kit, color: string, n = 100, mode: "hover" | "fall" | "rise" = "hover", h: [number, number] = [0.5, 8]) {
  const c = critters(k.g, k.rand, { count: n, color, size: 0.14, radius: [5, 30], height: h, mode, speed: 0.5 });
  k.updates.push(c.update);
  return c;
}

// ================================================================ REALM

const meadow: Variant = (rand, v) => {
  const k = new Kit(rand);
  if (v === 0) { // wildflower meadow
    k.g.add(ground("#5f8a3a", ["#4f7a2e", "#7aa04a", "#6a8a3a"]));
    tufts(k, 900, 6, 40, "#6a9a3a", 0.5, 0.07, "#f0d84a");
    tufts(k, 300, 6, 40, "#5a8a2e", 0.4, 0.06, "#e86aa8");
    const stream = new THREE.Mesh(new THREE.RingGeometry(14, 15.6, 64, 1, 0.4, 2.2), std("#4a8ac8", { roughness: 0.2, metalness: 0.3 })); stream.rotation.x = -Math.PI / 2; stream.position.y = 0.03; k.g.add(stream);
    k.g.add(box(2.4, 0.2, 2, std("#7a5a3a"), 0, 0.25, 14.8));
    forest(k, 18, 22, 45, ["#4f7f3e", "#6e9a52"], 0.2);
    const bf = critters(k.g, rand, { count: 30, color: "#ffe86a", size: 0.18, radius: [6, 16], height: [0.6, 2.5], mode: "hover", glow: false }); k.updates.push(bf.update);
    k.interact("dandelion", "Blow a dandelion clock", 9, 0, 6, "#ffffff", "chime", () => bf.scare());
  } else if (v === 1) { // wheat farm
    k.g.add(ground("#b89a4a", ["#a88a3a", "#c8aa5a", "#8a7a3a"]));
    tufts(k, 1400, 8, 34, "#d8b85a", 1.1, 0.05, "#e8c86a");
    cottage(k.g, -18, -12, 0.6, "#d8c8a8", "#7a4a2a", rand); k.solid(-18, -12, 5, 5);
    // windmill
    const mill = new THREE.Group(); mill.position.set(18, 0, -16);
    mill.add(cyl(1.8, 2.6, 9, std("#d8d0c0"), 0, 4.5, 0, 10)); mill.add(at(new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.4, 10), std("#6a3a2a")), 0, 10.2, 0));
    const blades = new THREE.Group(); blades.position.set(0, 8.5, 2.4);
    for (let i = 0; i < 4; i++) { const b = box(0.6, 6, 0.1, std("#e8e0d0"), 0, 3, 0); const p = new THREE.Group(); p.rotation.z = (i * Math.PI) / 2; p.add(b); blades.add(p); }
    mill.add(blades); k.g.add(mill); k.solid(18, -16, 5, 5);
    k.updates.push((t) => (blades.rotation.z = t * 0.6));
    // scarecrow facing the wrong way
    const sc = new THREE.Group(); sc.position.set(-7, 0, 8); sc.rotation.y = Math.PI;
    sc.add(cyl(0.06, 0.06, 2.4, std("#5a3a20"), 0, 1.2, 0, 6)); sc.add(box(1.8, 0.1, 0.1, std("#5a3a20"), 0, 1.8, 0));
    sc.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), std("#d8b88a")), 0, 2.5, 0)); sc.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.5, 10), std("#6a4a2a")), 0, 2.85, 0));
    k.g.add(sc);
    for (const [x, z] of [[10, 9], [12, -6], [-12, 4]]) { const hay = cyl(1, 1.2, 1.3, std("#d8b85a"), x, 0.65, z, 12); k.g.add(hay); k.solid(x, z, 2, 2); }
    fence(k, -24, 2, -10, 2); fence(k, -10, 2, -10, -4);
    const crows = critters(k.g, rand, { count: 8, color: "#151515", size: 0.45, radius: [6, 18], height: [6, 12], mode: "orbit", shape: "bird" }); k.updates.push(crows.update);
    k.interact("scarecrow", "Turn the scarecrow round", -7, 0, 9, "#d8b85a", "miss", () => { sc.rotation.y += Math.PI; crows.scare(); });
  } else if (v === 2) { // standing stones
    k.g.add(ground("#4f6f3a", ["#3f5a2e", "#6a8a4a", "#7a7a6a"]));
    const hill = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), std("#4f6f3a")); hill.scale.y = 0.06; k.g.add(hill);
    tufts(k, 600, 6, 40, "#5a7a3a", 0.45, 0.06);
    const stoneM = std("#9a968a", { flatShading: true });
    const stones: THREE.Mesh[] = [];
    ring(11, 14, 0.15).forEach((p, i) => { if (i === 5) return; const h = 4 + rand() * 2.5; const s = box(1.4, h, 0.9, stoneM, p.x, h / 2, p.z); s.rotation.y = -p.a; s.rotation.z = (rand() - 0.5) * 0.15; k.g.add(s); stones.push(s); k.solid(p.x, p.z, 1.6, 1.6); });
    const lintel = box(4, 0.8, 1, stoneM, 0, 6.6, -14); k.g.add(lintel);
    rocks(k, 14, 18, 42, "#8a857c");
    const mist = critters(k.g, rand, { count: 60, color: "#dfe8ef", size: 1.4, radius: [8, 24], height: [0.3, 1.2], mode: "hover", opacity: 0.25, glow: false }); k.updates.push(mist.update);
    const runes = glow("#7ac8ff", 0); stones.forEach((s) => { const r = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.4), runes); r.position.set(0, 0.3, 0.46); s.add(r); });
    let pulse = 0; k.updates.push((_, dt) => { pulse = Math.max(0, pulse - dt * 0.4); (runes as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + pulse * 3; });
    k.interact("runes", "Touch the standing stone's runes", 0, 0, -12, "#7ac8ff", "spell", () => (pulse = 1));
  } else { // old battlefield
    k.g.add(ground("#5a4a3a", ["#4a3a2a", "#6a5a40", "#3a3a2a"]));
    tufts(k, 300, 6, 40, "#6a6a3a", 0.35, 0.06);
    const iron = std("#5a5a5a", { metalness: 0.5 });
    for (const [x, z, r] of scatter(rand, 40, 7, 30)) { const sp = cyl(0.03, 0.03, 2, std("#4a3a2a"), x, 0.9, z, 4); sp.rotation.set((r - 0.5) * 0.8, 0, (r - 0.5) * 0.8); k.g.add(sp); if (r > 0.6) k.g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), iron), x + 0.4, 0.05, z)); }
    for (const [x, z, r] of scatter(rand, 5, 10, 24)) { const cart = new THREE.Group(); cart.position.set(x, 0, z); cart.rotation.set(0, r * 6, 0.3); cart.add(box(2.4, 0.8, 1.4, std("#5a3a20"), 0, 0.8, 0)); cart.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 6, 16), std("#3a2412")), 1, 0.6, 0.75)); k.g.add(cart); k.solid(x, z, 2.6, 2.6); }
    const banners: THREE.Mesh[] = [];
    for (const [x, z] of [[-9, -10], [12, 8], [-14, 9]]) { k.g.add(cyl(0.06, 0.06, 4, std("#3a2412"), x, 2, z, 6)); const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), std("#8a2a2a", { side: THREE.DoubleSide })); b.position.set(x + 0.6, 3.1, z); k.g.add(b); banners.push(b); }
    k.updates.push((t) => banners.forEach((b, i) => (b.rotation.y = Math.sin(t * 2 + i) * 0.4)));
    const smoke = critters(k.g, rand, { count: 40, color: "#8a8580", size: 1, radius: [10, 20], height: [0, 8], mode: "rise", glow: false, opacity: 0.5 }); k.updates.push(smoke.update);
    const crows = critters(k.g, rand, { count: 14, color: "#111", size: 0.45, radius: [5, 16], height: [5, 11], mode: "orbit", shape: "bird" }); k.updates.push(crows.update);
    k.interact("warhorn", "Blow a fallen soldier's horn", -9, 0, -8, "#c8a86a", "horn", () => crows.scare());
  }
  return k.done();
};

const woods: Variant = (rand, v) => {
  const k = new Kit(rand);
  if (v === 0) { // clearing
    k.g.add(ground("#4a6a32", ["#3a5a28", "#6a8a40", "#5a4a30"]));
    forest(k, 160, 13, 48, ["#2e5a24", "#3b6b2a", "#4d7a2e"], 0.45);
    tufts(k, 500, 5, 13, "#5a8a32", 0.4, 0.06, "#ffffff");
    const log = cyl(0.5, 0.5, 5, std("#5a3a20"), 8, 0.5, -5, 10); log.rotation.z = Math.PI / 2; log.rotation.y = 0.4; k.g.add(log); k.solid(8, -5, 4, 1.5);
    flatDisc(k, 1, "#2a2420", 0.02, -7, 6);
    const ff = critters(k.g, rand, { count: 50, color: "#e8ff8a", size: 0.12, radius: [4, 14], height: [0.5, 3], mode: "hover" }); k.updates.push(ff.update);
    k.interact("sunbeam", "Step into the sunbeam", -6, 0, -8, "#fff3c0", "chime", () => ff.scare());
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.5, 24, 16, 1, true), basic("#fff3c0", { transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.set(-6, 12, -8); beam.userData.outlineParameters = { visible: false }; k.g.add(beam);
  } else if (v === 1) { // pine ravine
    k.g.add(ground("#3a4a32", ["#2a3a24", "#5a6a4a", "#6a6a60"]));
    forest(k, 120, 9, 48, ["#1e4a2a", "#24522e"], 0.95);
    const gorge = flatRect(k, 80, 5, "#0a0e10", 0, -3, 0.03); gorge.rotation.z = 0.2;
    const river = flatRect(k, 80, 1.6, "#4a7ab8", 0, -3, 0.05, { emissive: new THREE.Color("#1a3a5a"), emissiveIntensity: 0.3 }); river.rotation.z = 0.2;
    for (const x of [-10, 12]) { const z = -3 - x * Math.tan(0.2) * 0; const br = box(1.8, 0.15, 7, std("#7a5a3a"), x, 0.3, z - x * 0.2); br.rotation.y = 0.2; k.g.add(br); }
    rocks(k, 30, 8, 40, "#7a7a72");
    const mist = critters(k.g, rand, { count: 50, color: "#e8f0f0", size: 1.2, radius: [6, 30], height: [0, 1], mode: "hover", opacity: 0.3, glow: false }); k.updates.push(mist.update);
    k.interact("echo", "Shout into the ravine", 4, 0, -1, "#bfe0ff", "horn");
  } else if (v === 2) { // fairy ring
    k.g.add(ground("#3a5a3a", ["#2a4a2a", "#4a6a4a", "#5a4a6a"]));
    forest(k, 130, 16, 48, ["#2a4a3a", "#3a5a3a", "#2a3a4a"], 0.3);
    const caps = ["#e86a6a", "#e8c86a", "#c8a8ff"];
    ring(26, 10, 0).forEach((p, i) => mushroom(k, p.x, p.z, 0.4 + rand() * 0.5, caps[i % 3], 0.8));
    water(k.g, "#3a6a7a", 0.04, 4).position.set(10, 0.04, 10);
    const motes = glowMotes(k, "#ffb8ff", 140, "hover", [0.3, 4]);
    let dance = 0;
    k.updates.push((_, dt) => { dance = Math.max(0, dance - dt * 0.3); });
    k.interact("dance", "Step into the fairy ring", 0, 0, -10, "#ff8aff", "spell", () => { dance = 1; motes.scare(); });
  } else { // logging camp
    k.g.add(ground("#5a4a32", ["#6a5a40", "#4a3a28", "#c8a878"]));
    forest(k, 90, 18, 48, ["#2e5a24", "#3b6b2a"], 0.7);
    for (const [x, z, r] of scatter(rand, 30, 7, 18)) k.g.add(cyl(0.4 + r * 0.3, 0.5 + r * 0.3, 0.4, std("#8a6a4a"), x, 0.2, z, 10));
    for (const [x, z] of [[-10, 8], [11, 10], [-12, -8]]) { for (let i = 0; i < 6; i++) { const l = cyl(0.35, 0.35, 4, std("#6a4a2a"), x, 0.35 + Math.floor(i / 3) * 0.6, z + (i % 3) * 0.7 - 0.7, 10); l.rotation.z = Math.PI / 2; k.g.add(l); } k.solid(x, z, 4.2, 2.4); }
    cottage(k.g, 14, -12, -0.6, "#8a6a4a", "#4a3a2a", rand); k.solid(14, -12, 5, 5);
    const axe = new THREE.Group(); axe.position.set(-7, 0.4, 2); axe.add(cyl(0.03, 0.03, 0.9, std("#6a4a2a"), 0, 0.45, 0, 6)); axe.add(box(0.3, 0.2, 0.04, std("#9a9a9a", { metalness: 0.7 }), 0.12, 0.85, 0)); k.g.add(axe);
    k.g.add(cyl(0.6, 0.7, 0.5, std("#8a6a4a"), -7, 0.25, 2, 12));
    k.interact("axe", "Pull the axe from the stump", -7, 0.3, 2, "#c8c8c8", "hit");
  }
  return k.done();
};

const highland: Variant = (rand, v) => {
  const k = new Kit(rand);
  const cliffs = (r: number, h: number, color: string, from = 0, to = Math.PI * 2) => {
    for (let i = 0; i < 24; i++) { const a = from + ((to - from) * i) / 24; const c = new THREE.Mesh(new THREE.DodecahedronGeometry(5 + rand() * 3, 0), std(color, { flatShading: true })); c.position.set(Math.cos(a) * r, h * 0.4, Math.sin(a) * r); c.scale.set(1, h / 6, 1); k.g.add(c); }
  };
  if (v === 0) { // rocky hills
    k.g.add(ground("#6a6a50", ["#5a5a44", "#7a7a60", "#8a8a7a"]));
    for (const [x, z, r] of scatter(rand, 8, 26, 50)) { const h = new THREE.Mesh(new THREE.SphereGeometry(8 + r * 8, 16, 8), std("#5a6a44", { flatShading: true })); h.position.set(x, -2, z); h.scale.y = 0.5; k.g.add(h); }
    rocks(k, 40, 7, 34, "#8a857c", 1.6);
    tufts(k, 400, 6, 30, "#7a7a4a", 0.35, 0.06);
    const eagles = critters(k.g, rand, { count: 3, color: "#4a3a2a", size: 1, radius: [16, 24], height: [16, 22], mode: "orbit", shape: "bird" }); k.updates.push(eagles.update);
    k.interact("cairn", "Add a stone to the cairn", 9, 0, -7, "#d8d0c0", "hit");
    for (let i = 0; i < 5; i++) k.g.add(at(new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 - i * 0.07, 0), std("#a8a296", { flatShading: true })), 9, 0.3 + i * 0.5, -7));
  } else if (v === 1) { // mountain path
    k.g.add(ground("#7a7a72", ["#6a6a62", "#8a8a82", "#e8e8f0"]));
    cliffs(26, 30, "#6a6a6a", Math.PI * 0.9, Math.PI * 2.1);
    for (const p of ring(10, 30, 0.2)) { if (p.z < 0) continue; const peak = new THREE.Mesh(new THREE.ConeGeometry(8, 22, 7), std("#8a8a92", { flatShading: true })); peak.position.set(p.x * 1.6, -14, p.z * 1.6); k.g.add(peak); const snow = new THREE.Mesh(new THREE.ConeGeometry(3, 5, 7), std("#f0f4f8", { flatShading: true })); snow.position.set(p.x * 1.6, -5.5, p.z * 1.6); k.g.add(snow); }
    rocks(k, 20, 7, 22, "#8a857c", 1.2);
    const snowfall = critters(k.g, rand, { count: 200, color: "#ffffff", size: 0.12, radius: [4, 30], height: [0, 16], mode: "fall", glow: false }); k.updates.push(snowfall.update);
    k.interact("summit", "Plant a flag at the lookout", 8, 0, 8, "#e83a3a", "horn");
  } else if (v === 2) { // crag pass
    k.g.add(ground("#6a5a4a", ["#5a4a3a", "#7a6a5a", "#4a4040"]));
    for (const side of [-1, 1]) for (let i = 0; i < 14; i++) { const x = -40 + i * 6; const c = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + rand() * 2, 0), std("#5a4a42", { flatShading: true })); c.position.set(x, 6, side * (16 + rand() * 3)); c.scale.y = 2.4; k.g.add(c); k.solid(x, side * 16, 8, 6); }
    rocks(k, 25, 6, 14, "#7a6a5a", 1.3);
    const dust = critters(k.g, rand, { count: 60, color: "#c8a878", size: 0.4, radius: [4, 20], height: [0.2, 3], mode: "hover", glow: false, opacity: 0.5 }); k.updates.push(dust.update);
    k.interact("rockslide", "Kick a loose boulder down", 10, 0, -10, "#c8a878", "boom", () => dust.scare());
  } else { // shepherd's ridge
    k.g.add(ground("#6a7a4a", ["#5a6a3a", "#8a8a5a", "#7a5a6a"]));
    tufts(k, 500, 6, 34, "#8a6a8a", 0.35, 0.06, "#c88ac8");
    stoneWall(k, -20, -6, -8, -6); stoneWall(k, -8, -6, -8, -14); stoneWall(k, 8, 8, 20, 8); stoneWall(k, 8, 8, 8, 16);
    cottage(k.g, 16, -12, -0.4, "#a8a090", "#4a4a40", rand); k.solid(16, -12, 5, 5);
    const sheep = critters(k.g, rand, { count: 7, color: "#e8e4d8", size: 0.5, radius: [18, 26], height: [0.25, 0.25], mode: "scurry", shape: "box", speed: 0.3 }); k.updates.push(sheep.update);
    k.interact("crook", "Whistle for the sheep", -12, 0, -9, "#e8e4d8", "chime", () => sheep.scare());
  }
  return k.done();
};

const bog: Variant = (rand, v) => {
  const k = new Kit(rand);
  if (v === 0) { // reed marsh
    k.g.add(ground("#3a4a2a", ["#2a3a20", "#4a5a3a", "#3a3a28"]));
    for (const [x, z, r] of scatter(rand, 14, 7, 30)) water(k.g, "#2a3a2a", 0.03, 2 + r * 4).position.set(x, 0.03, z);
    tufts(k, 1100, 6, 40, "#6a7a3a", 1.4, 0.04, "#5a3a2a");
    k.g.add(box(30, 0.15, 1.8, std("#6a5a40"), 0, 0.3, 9));
    for (let x = -14; x <= 14; x += 3) for (const s of [-1, 1]) k.g.add(cyl(0.08, 0.08, 1, std("#4a3a2a"), x, 0.2, 9 + s * 0.8, 5));
    const frogs = critters(k.g, rand, { count: 6, color: "#5a8a3a", size: 0.2, radius: [6, 14], height: [0, 0], mode: "scurry", shape: "box" }); k.updates.push(frogs.update);
    k.interact("frog", "Catch a bog frog", 7, 0, 5, "#8aff6a", "splash", () => frogs.scare());
  } else if (v === 1) { // drowned village
    water(k.g, "#2a3a3a", 0.02, 60);
    k.g.add(ground("#3a3a2a", ["#2a2a20", "#4a4a3a"], 8, {}, 9));
    ring(7, 18, 0.4).forEach((p, i) => { const h = cottage(k.g, p.x, p.z, -p.a, "#7a7060", "#3a3028", rand); h.position.y = -1.2 - (i % 3) * 0.4; h.rotation.z = (rand() - 0.5) * 0.3; k.solid(p.x, p.z, 4, 4); });
    const bell = new THREE.Group(); bell.position.set(0, 0, -22); bell.add(box(2.4, 9, 2.4, std("#6a6458"), 0, 3, 0)); bell.rotation.z = 0.15; k.g.add(bell);
    const mist = critters(k.g, rand, { count: 70, color: "#c8d0c8", size: 1.4, radius: [8, 30], height: [0, 1.5], mode: "hover", opacity: 0.3, glow: false }); k.updates.push(mist.update);
    k.interact("sunkbell", "Ring the drowned bell", 0, 0, -12, "#a8c0c8", "bell");
  } else if (v === 2) { // peat cuttings
    k.g.add(ground("#2a2420", ["#3a2a20", "#1a1814", "#4a3a2a"]));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; flatRect(k, 6, 3, "#1a2420", Math.cos(a) * 15, Math.sin(a) * 15, 0.03, { roughness: 0.2, metalness: 0.4 }).rotation.z = a; }
    for (const [x, z] of [[-9, -6], [10, 6], [-6, 11], [12, -9]]) { for (let i = 0; i < 8; i++) k.g.add(box(0.8, 0.4, 0.4, std("#3a2a1a"), x + (i % 4) * 0.85 - 1.3, 0.2 + Math.floor(i / 4) * 0.42, z)); k.solid(x, z, 3.5, 1); }
    tufts(k, 400, 6, 40, "#5a6a3a", 0.5, 0.05);
    k.g.add(box(0.3, 1.6, 0.05, std("#9a9a9a", { metalness: 0.6 }), 7, 0.8, -3));
    k.interact("spade", "Dig where the spade is", 7, 0, -3, "#c8a878", "hit");
  } else { // misty fen
    k.g.add(ground("#2a3a2a", ["#1a2a1a", "#3a4a3a", "#2a2a24"]));
    for (const [x, z, r] of scatter(rand, 10, 7, 30)) water(k.g, "#1a2a20", 0.03, 1.5 + r * 3).position.set(x, 0.03, z);
    for (const [x, z, r] of scatter(rand, 26, 8, 40)) deadTree(k, x, z, 3 + r * 4);
    const mist = critters(k.g, rand, { count: 120, color: "#c8d8c8", size: 1.8, radius: [5, 30], height: [0, 2], mode: "hover", opacity: 0.25, glow: false }); k.updates.push(mist.update);
    const wisps = critters(k.g, rand, { count: 8, color: "#8ac8ff", size: 0.5, radius: [12, 26], height: [1, 2.5], mode: "hover" }); k.updates.push(wisps.update);
    k.interact("wisp", "Follow the little light", 10, 0, -10, "#8ac8ff", "spell", () => wisps.scare());
  }
  return k.done();
};

// ================================================================ HOLLOW

const tunnels: Variant = (rand, v) => {
  const k = new Kit(rand);
  underground(k, "#2a2a34", ["#1a1a24", "#3a3a4a", "#4a3a2a"], "#141620");
  if (v === 0) { // root tunnel
    const rootM = std("#5a4030");
    for (let i = 0; i < 26; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(10 + rand() * 18, 0.3 + rand() * 0.5, 6, 20, 1 + rand()), rootM); r.position.set((rand() - 0.5) * 50, 0, (rand() - 0.5) * 50); r.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.8, rand() * 6, rand()); k.g.add(r); }
    const motes = glowMotes(k, "#d8f0ff", 100, "fall", [1, 12]);
    k.interact("root", "Tap the humming root", 9, 0, -6, "#c8a87a", "chime", () => motes.scare());
  } else if (v === 1) { // abandoned mine
    for (let x = -30; x <= 30; x += 1.2) k.g.add(box(0.2, 0.08, 2, std("#4a3a2a"), x, 0.04, 8));
    for (const z of [7.4, 8.6]) k.g.add(box(60, 0.08, 0.1, std("#7a7a7a", { metalness: 0.7 }), 0, 0.1, z));
    for (let x = -24; x <= 24; x += 8) { k.g.add(box(0.4, 5, 0.4, std("#5a3a20"), x, 2.5, 4)); k.g.add(box(0.4, 5, 0.4, std("#5a3a20"), x, 2.5, 12)); k.g.add(box(0.4, 0.4, 8.4, std("#5a3a20"), x, 5, 8)); lamp(k.g, x, 4.4, 8, "#ffc87a", 4, 9, 0.12); }
    const cart = new THREE.Group(); cart.position.set(-6, 0, 8); cart.add(box(1.6, 1, 1.2, std("#6a6a6a", { metalness: 0.5 }), 0, 0.7, 0)); cart.add(at(new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), std("#7ac8ff", { emissive: new THREE.Color("#3a8aff"), emissiveIntensity: 0.6 })), 0, 1.3, 0)); k.g.add(cart);
    let cartV = 0; k.updates.push((_, dt) => { cart.position.x += cartV * dt; cartV *= 0.98; if (cart.position.x > 24) cartV = -Math.abs(cartV); if (cart.position.x < -24) cartV = Math.abs(cartV); });
    rocks(k, 25, 8, 30, "#5a5a64");
    k.interact("cart", "Give the ore cart a shove", -6, 0, 6, "#7ac8ff", "boom", () => (cartV = 6));
  } else if (v === 2) { // collapsed street
    const paper = ["#f0d8a8", "#e8c8f0", "#c8e8f0"];
    ring(10, 15, 0.2).forEach((p, i) => { const h = new THREE.Group(); h.position.set(p.x, 0, p.z); h.rotation.set(0, -p.a, (rand() - 0.5) * 0.5); const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 2.6, 8, 1, true, 0, Math.PI * (1.2 + rand() * 0.6)), std(paper[i % 3], { side: THREE.DoubleSide })); body.position.y = 1.3; h.add(body); k.g.add(h); k.solid(p.x, p.z, 3.5, 3.5); if (i % 3 === 0) lamp(k.g, p.x, 3, p.z, "#ffd89a", 3, 7, 0.15); });
    rocks(k, 30, 6, 20, "#6a6a74", 0.8);
    const dust = glowMotes(k, "#e8e0c8", 80, "fall", [1, 10]);
    k.interact("doorbell", "Ring an old doorbell", 11, 0, 5, "#ffd89a", "chime", () => dust.scare());
  } else { // lantern corridor
    for (let z = -30; z <= 30; z += 6) for (const x of [-7, 7]) { k.g.add(cyl(0.6, 0.8, 7, std("#4a4a5a"), x, 3.5, z, 8)); const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), std("#3a3a48")); head.position.set(x, 7.6, z); head.scale.set(1, 0.7, 1.2); k.g.add(head); const lan = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), glow("#9fd4ff", 1.5)); lan.position.set(x * 0.85, 4.5, z); k.g.add(lan); k.solid(x, z, 1.6, 1.6); }
    lamp(k.g, 0, 7, -18, "#9fd4ff", 8, 20, 0.01); lamp(k.g, 0, 7, 18, "#9fd4ff", 8, 20, 0.01);
    k.interact("lanterns", "Relight the corridor lanterns", 6, 0, 3, "#9fd4ff", "heal");
  }
  return k.done(true);
};

const fungus: Variant = (rand, v) => {
  const k = new Kit(rand);
  underground(k, "#2a2234", ["#3a2a4a", "#1a1a24", "#4a3a5a"], "#100c16");
  const caps = ["#c06ad0", "#d0a03a", "#6ad0c0", "#d04a6a"];
  if (v === 0) {
    for (const [x, z, r] of scatter(rand, 40, 9, 38)) mushroom(k, x, z, 2 + r * 8, caps[Math.floor(r * 4)]);
    const sp = glowMotes(k, "#e8b0ff", 200);
    k.interact("sporecap", "Shake a spore cap", 8, 0, 6, "#e8b0ff", "miss", () => sp.scare());
  } else if (v === 1) { // shelf caves
    for (const [x, z, r] of scatter(rand, 26, 9, 34)) { k.g.add(cyl(0.6, 0.9, 6 + r * 6, std("#3a3048"), x, 3 + r * 3, z, 8)); for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(1.2 + i * 0.2, 1.4 + i * 0.2, 0.25, 12, 1, false, 0, Math.PI), glow(caps[(i + Math.floor(r * 4)) % 4], 0.3)); s.position.set(x, 1.5 + i * 1.6 + r, z); s.rotation.y = r * 6 + i; k.g.add(s); } k.solid(x, z, 1.4, 1.4); }
    glowMotes(k, "#c8ffe8", 120);
    k.interact("shelf", "Climb a fungus shelf", 9, 0, -6, "#6ad0c0", "chime");
  } else if (v === 2) { // puffballs
    const puffs: THREE.Mesh[] = [];
    for (const [x, z, r] of scatter(rand, 70, 7, 36)) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.4 + r * 0.9, 12, 10), glow(r > 0.5 ? "#d8c8ff" : "#f0e8d8", 0.4)); p.position.set(x, 0.4 + r * 0.6, z); k.g.add(p); puffs.push(p); }
    k.updates.push((t) => puffs.forEach((p, i) => p.scale.setScalar(1 + Math.sin(t * 1.2 + i) * 0.08)));
    const sp = glowMotes(k, "#ffffff", 120, "rise", [0, 10]);
    k.interact("puffball", "Step on a puffball", 7, 0, 7, "#ffffff", "miss", () => sp.scare());
  } else { // rot garden
    for (let x = -16; x <= 16; x += 8) for (let z = -16; z <= 16; z += 8) { if (Math.hypot(x, z) < 7) continue; k.g.add(box(4, 0.8, 2, std("#3a3028"), x, 0.4, z)); const rot = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 1.6), glow("#8aff6a", 0.6)); rot.position.set(x, 0.85, z); k.g.add(rot); k.solid(x, z, 4, 2); }
    const sp = glowMotes(k, "#8aff6a", 150);
    k.interact("compost", "Turn the glowing compost", 8, 0, 0, "#8aff6a", "splash", () => sp.scare());
  }
  return k.done(true);
};

const lake: Variant = (rand, v) => {
  const k = new Kit(rand);
  underground(k, "#22283a", ["#1a1e2a", "#2a3242", "#3a3a4a"], "#0c1018");
  if (v === 0) { // still lake
    water(k.g, "#0e1a2a", 0.04, 24, "#1a3a5a").position.y = 0.04;
    put(k.g, ground("#2a3040", ["#1a2030"], 6, {}, 6.5)).position.y = 0.06;
    k.g.add(box(60, 0.2, 2.4, std("#3a3a48"), 0, 0.15, 0));
    const fish = critters(k.g, rand, { count: 10, color: "#8ac8ff", size: 0.4, radius: [8, 20], height: [-0.1, -0.1], mode: "orbit" }); k.updates.push(fish.update);
    k.interact("ripple", "Drop a pebble in the lake", 8, 0, 2, "#8ac8ff", "splash", () => fish.scare());
  } else if (v === 1) { // pale shallows
    water(k.g, "#c8d0d8", 0.05, 60, "#a8b8c8").position.y = 0.05;
    for (const [x, z, r] of scatter(rand, 9, 9, 30)) { const isl = new THREE.Mesh(new THREE.CylinderGeometry(2 + r * 3, 2.5 + r * 3, 0.4, 14), std("#3a3a48")); isl.position.set(x, 0.1, z); k.g.add(isl); }
    const echo = glowMotes(k, "#ffffff", 80);
    k.interact("echo", "Call out across the shallows", 8, 0, -4, "#ffffff", "chime", () => echo.scare());
  } else if (v === 2) { // waterfall grotto
    water(k.g, "#1a3a4a", 0.04, 10, "#2a5a7a").position.set(14, 0.04, -14);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(6, 24), new THREE.MeshStandardMaterial({ color: "#a8d8f0", transparent: true, opacity: 0.6, emissive: new THREE.Color("#4a8ab8"), emissiveIntensity: 0.4, side: THREE.DoubleSide }));
    fall.position.set(16, 12, -20); fall.lookAt(0, 12, 0); fall.userData.outlineParameters = { visible: false }; k.g.add(fall);
    const spray = critters(k.g, rand, { count: 120, color: "#d8f0ff", size: 0.2, radius: [0, 4], height: [0, 4], mode: "rise", glow: false }); const sprayRoot = new THREE.Group(); sprayRoot.position.set(15, 0, -17); k.g.add(sprayRoot); k.updates.push(spray.update);
    k.updates.push((t) => (fall.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + Math.sin(t * 8) * 0.05);
    rocks(k, 20, 7, 26, "#3a4048", 1.4);
    k.interact("behindfall", "Look behind the waterfall", 13, 0, -12, "#a8d8f0", "splash");
  } else { // flooded hall
    water(k.g, "#1a2a3a", 0.3, 60, "#1a3a5a").position.set(0, 0.3, 30);
    for (let x = -24; x <= 24; x += 8) for (const z of [-10, 10]) { k.g.add(cyl(1, 1.2, 12, std("#4a4a5a"), x, 6, z, 10)); k.solid(x, z, 2, 2); }
    k.g.add(box(60, 0.6, 60, std("#2a2a38"), 0, 12, 0));
    const drips = critters(k.g, rand, { count: 80, color: "#a8d8ff", size: 0.1, radius: [3, 26], height: [0, 11], mode: "fall", glow: false }); k.updates.push(drips.update);
    lamp(k.g, 0, 9, 0, "#7ab8ff", 8, 30, 0.01);
    k.interact("statue", "Wipe the sunken statue's face", -8, 0, -6, "#7ab8ff", "chime");
    k.g.add(cyl(0.6, 0.8, 2.5, std("#6a6a7a"), -8, 1.25, -7, 10));
  }
  return k.done(true);
};

const thorns: Variant = (rand, v) => {
  const k = new Kit(rand);
  if (v === 2) { k.g.add(ground("#120c10", ["#1a1018"], 6)); flatDisc(k, 9, "#2a2a22", 0.05); } else k.g.add(ground("#2a3022", ["#3a4030", "#1a2018", "#4a3a2a"], 24));
  dome(k.g, "#0e120e", 46, 0.4);
  if (v === 0) { // bramble maze
    for (let x = -28; x <= 28; x += 7) for (let z = -28; z <= 28; z += 2.2) { if (Math.hypot(x, z) < 8 || rand() < 0.25) continue; thornBush(k, x, z, 1.3); }
    k.interact("snag", "Pull a scrap of cloth from the thorns", 8, 0, 4, "#c84a4a", "miss");
  } else if (v === 1) { // thorn gully
    for (const side of [-1, 1]) for (let x = -34; x <= 34; x += 1.8) thornBush(k, x, side * (11 + rand() * 3), 1.6 + rand());
    const watchers = critters(k.g, rand, { count: 6, color: "#5ab84a", size: 0.6, radius: [16, 20], height: [6, 8], mode: "hover", shape: "box", glow: false }); k.updates.push(watchers.update);
    k.interact("bow", "Bow to the mantis watchers", 0, 0, -9, "#5ab84a", "bell", () => watchers.scare());
  } else if (v === 2) { // briar bridge
    for (const [a, b] of [[[-30, 0], [-9, 0]], [[9, 0], [30, 0]], [[0, -9], [0, -30]], [[0, 9], [0, 30]]] as [number, number][][]) { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const br = box(len, 0.3, 2, std("#4a3a2a"), (a[0] + b[0]) / 2, 0.1, (a[1] + b[1]) / 2); br.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); k.g.add(br); }
    for (const [x, z, r] of scatter(rand, 60, 10, 40)) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.4, 4 + r * 6, 5), std("#3a2a2a", { flatShading: true })); sp.position.set(x, -4 + r * 3, z); k.g.add(sp); }
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; if (Math.abs(Math.sin(a * 2)) < 0.12) continue; k.col.push(aabb(Math.cos(a) * 10.5, Math.sin(a) * 10.5, 1.4, 1.4)); }
    k.interact("vine", "Test a vine for strength", 6, 0, 6, "#6a9a4a", "hit");
  } else { // hedge garden
    for (let r = 12; r <= 28; r += 8) ring(Math.floor(r * 1.2), r, 0).forEach((p, i) => { if (i % 5 === 0) return; put(k.g, box(2.6, 2.2, 1.6, std("#2a4a2a", { flatShading: true }), p.x, 1.1, p.z)).rotation.y = -p.a; k.solid(p.x, p.z, 2.4, 2.4); });
    for (const p of ring(6, 9, 0.5)) { const beetle = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), std("#3a5a2a")); beetle.position.set(p.x, 1.2, p.z); beetle.scale.set(1, 0.8, 1.4); k.g.add(beetle); k.g.add(cyl(0.2, 0.3, 0.8, std("#3a5a2a"), p.x, 0.4, p.z, 6)); }
    k.interact("topiary", "Trim a topiary beetle", 9, 0, 0, "#6a9a4a", "chime");
  }
  glowMotes(k, "#d8ffc8", 60);
  return k.done(true);
};

// ================================================================ NEON

const NEON_COLORS = ["#ff3fa4", "#3ac8ff", "#ffd83a", "#3aff8a", "#b06aff"];

const alley: Variant = (rand, v) => {
  const k = new Kit(rand);
  k.g.add(ground("#1e1e26", ["#2a2a34", "#14141a", "#3a2a3a"], 20, { roughness: 0.4, metalness: 0.3 }));
  const sky = critters(k.g, rand, { count: 300, color: "#9fb4d8", size: 0.06, radius: [2, 30], height: [0, 18], mode: "fall", glow: false }); k.updates.push(sky.update);
  if (v === 0 || v === 3) { // back alley / dead end
    for (const side of [-1, 1]) for (let x = -36; x <= 36; x += 7) tower(k, x, side * (11 + rand() * 2), 6.5, 6, 12 + rand() * 18, "#22222c", NEON_COLORS);
    for (const [x, z] of [[-8, 6], [6, -6], [12, 6]]) { k.g.add(box(2.2, 1.3, 1.2, std("#2a5a3a"), x, 0.65, z)); k.solid(x, z, 2.2, 1.2); }
    const steam = critters(k.g, rand, { count: 40, color: "#c8c8d0", size: 1, radius: [3, 9], height: [0, 5], mode: "rise", glow: false, opacity: 0.4 }); k.updates.push(steam.update);
    const s = sign(v === 0 ? "OPEN 25 HRS" : "SMILE :)", NEON_COLORS[v === 0 ? 0 : 2], 5, 1.6); s.position.set(v === 0 ? -6 : 20, 6, v === 0 ? -8.8 : 0); if (v === 3) s.rotation.y = -Math.PI / 2; k.g.add(s);
    if (v === 3) { fence(k, 18, -8, 18, 8, "#7a7a7a"); }
    k.interact("vent", "Kick the steam vent", -2, 0, 7, "#c8c8d0", "zap", () => steam.scare());
  } else if (v === 1) { // night market lane
    for (const side of [-1, 1]) for (let x = -24; x <= 24; x += 6) { const st = new THREE.Group(); st.position.set(x, 0, side * 9); st.add(box(3.6, 1, 1.6, std("#3a2a2a"), 0, 0.5, 0)); st.add(box(4, 0.08, 2.2, std(NEON_COLORS[(x + 30) % 5], { emissive: new THREE.Color(NEON_COLORS[(x + 30) % 5]), emissiveIntensity: 0.4 }), 0, 2.4, side * -0.3)); for (const sx of [-1.8, 1.8]) st.add(cyl(0.05, 0.05, 2.4, std("#555"), sx, 1.2, 0, 6)); k.g.add(st); k.solid(x, side * 9, 3.8, 1.8); }
    for (let x = -24; x <= 24; x += 3) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), glow(["#ff6a3a", "#ffd83a"][Math.abs(x) % 2], 1.4)); l.position.set(x, 4, 0); k.g.add(l); }
    for (const side of [-1, 1]) for (let x = -36; x <= 36; x += 8) tower(k, x, side * 16, 7, 6, 14 + rand() * 20, "#1a1a24", NEON_COLORS);
    k.interact("fortune", "Ask the fortune robot", 6, 0, -7, "#b06aff", "zap");
  } else { // laundry court
    for (const p of ring(10, 20, 0.2)) tower(k, p.x, p.z, 8, 8, 14 + rand() * 6, "#2a2630", ["#ffd8a0", "#ffeac0"]);
    const cloths: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) { const z = -10 + i * 4; k.g.add(box(36, 0.02, 0.02, std("#ddd"), 0, 6 + (i % 2), z)); for (let x = -14; x <= 14; x += 2.5) { if (rand() < 0.3) continue; const c = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4), std(["#e84a4a", "#4a8ae8", "#e8e8e8", "#e8c84a"][Math.floor(rand() * 4)], { side: THREE.DoubleSide })); c.position.set(x, 5.2 + (i % 2), z); k.g.add(c); cloths.push(c); } }
    k.updates.push((t) => cloths.forEach((c, i) => (c.rotation.x = Math.sin(t * 2 + i) * 0.25)));
    k.interact("laundry", "Take down someone's laundry", 7, 0, 4, "#e8e8e8", "miss");
  }
  return k.done();
};

const rooftop: Variant = (rand, v) => {
  const k = new Kit(rand);
  k.g.add(box(44, 1, 44, std("#3a3a42"), 0, -0.5, 0));
  flatRect(k, 44, 44, "#4a4a52", 0, 0, 0.01, { roughness: 0.6 });
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; k.col.push(aabb(Math.cos(a) * 23, Math.sin(a) * 23, 3, 3)); }
  for (const s of [[0, 22, 44, 0.3], [0, -22, 44, 0.3], [22, 0, 0.3, 44], [-22, 0, 0.3, 44]]) k.g.add(box(s[2], 0.9, s[3], std("#5a5a62"), s[0], 0.45, s[1]));
  skyline(k, NEON_COLORS);
  const traffic = critters(k.g, rand, { count: 30, color: "#ff8a3a", size: 0.4, radius: [30, 60], height: [-6, 8], mode: "orbit", speed: 3 }); k.updates.push(traffic.update);
  if (v === 0) { // garden
    for (const [x, z] of [[-12, -6], [-12, 6], [12, -6], [12, 6]]) { k.g.add(box(4, 0.8, 2, std("#6a4a3a"), x, 0.4, z)); tufts(k, 40, 0, 1.2, "#3a8a3a", 0.6, 0.08, "#e83a3a"); k.solid(x, z, 4, 2); }
    put(k.g, at(new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std("#c8c8d0")), 16, 1.6, -16)).rotation.x = -0.6;
    k.interact("tomato", "Pick a rooftop tomato", 12, 0, -4, "#e83a3a", "chime");
  } else if (v === 1) { // billboard
    const bb = sign("LIQUID JOY", "#ff3fa4", 18, 6); bb.position.set(0, 9, -21); k.g.add(bb);
    for (const x of [-7, 7]) k.g.add(cyl(0.2, 0.2, 7, std("#555"), x, 3.5, -21, 8));
    let flick = 0; k.updates.push((t, dt) => { flick = Math.max(0, flick - dt); (bb.material as THREE.MeshBasicMaterial).opacity = flick > 0 ? (Math.sin(t * 40) > 0 ? 1 : 0.2) : 1; });
    k.interact("billboard", "Hit the billboard's breaker", 4, 0, -18, "#ff3fa4", "zap", () => (flick = 2));
  } else if (v === 2) { // water tanks
    for (const [x, z] of [[-10, -9], [11, 10], [14, -12]]) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.g.add(cyl(0.12, 0.12, 3, std("#5a4a3a"), x + sx * 1.3, 1.5, z + sz * 1.3, 6)); k.g.add(cyl(2, 2, 3, std("#6a4a2a"), x, 4.5, z, 14)); k.g.add(at(new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 14), std("#4a3a2a")), x, 6.6, z)); k.solid(x, z, 3.4, 3.4); }
    const pigeons = critters(k.g, rand, { count: 10, color: "#8a8a9a", size: 0.3, radius: [5, 14], height: [0.2, 0.2], mode: "scurry", shape: "box" }); k.updates.push(pigeons.update);
    k.interact("pigeon", "Feed the visor pigeon", -6, 0, 8, "#3ac8ff", "chime", () => pigeons.scare());
  } else { // helipad
    flatDisc(k, 7, "#3a3a44", 0.02);
    const h = new THREE.Mesh(new THREE.RingGeometry(5.5, 6, 48), glow("#ffd83a", 0.8)); h.rotation.x = -Math.PI / 2; h.position.y = 0.03; k.g.add(h);
    const lights: THREE.Mesh[] = []; ring(16, 8, 0).forEach((p) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), basic("#ff3a3a")); l.position.set(p.x, 0.15, p.z); k.g.add(l); lights.push(l); });
    k.updates.push((t) => lights.forEach((l, i) => (l.visible = Math.floor(t * 4 + i) % 4 !== 0)));
    for (const [x, z] of [[-16, -14], [16, 14], [-15, 14]]) crate(k, x, z, 1.8, "#3a5a8a");
    k.interact("windsock", "Check the windsock", 16, 0, -14, "#ff8a3a", "chime");
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2, 10, 1, true), std("#ff8a3a", { side: THREE.DoubleSide })); sock.position.set(16, 4, -14); sock.rotation.z = Math.PI / 2; k.g.add(sock); k.g.add(cyl(0.05, 0.05, 4, std("#888"), 16, 2, -14.4, 6));
    k.updates.push((t) => (sock.rotation.y = Math.sin(t * 0.7) * 0.6));
  }
  return k.done();
};

const underpass: Variant = (rand, v) => {
  const k = new Kit(rand);
  k.g.add(ground("#2a2a2c", ["#3a3a3c", "#1a1a1c", "#4a3a2a"], 20));
  if (v === 1) { // service tunnel
    const tun = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 90, 20, 1, true), std("#2a2a30", { side: THREE.BackSide })); tun.rotation.z = Math.PI / 2; tun.position.y = 4; k.g.add(tun);
    for (let x = -40; x <= 40; x += 6) { lamp(k.g, x, 9, 0, "#ffd89a", 4, 10, 0.12); for (const z of [-9, 9]) k.solid(x, z, 6, 2); }
    for (let i = 0; i < 6; i++) k.g.add(box(90, 0.25, 0.25, std(["#2a2a2a", "#8a2a2a", "#2a2a8a"][i % 3]), 0, 2 + i * 0.4, -8.5));
    k.interact("breaker", "Flip the tunnel breaker", 6, 0, -7, "#ffd89a", "zap");
    return k.done(true);
  }
  if (v === 0 || v === 3) { // highway underpass / broken overpass
    const deck = box(90, 1.2, 18, std("#4a4a50"), 0, 10, 0); k.g.add(deck);
    if (v === 3) deck.scale.x = 0.5, deck.position.x = -22;
    for (let x = -36; x <= (v === 3 ? 0 : 36); x += 9) for (const z of [-7, 7]) { k.g.add(box(1.6, 10, 1.6, std("#5a5a60"), x, 5, z)); k.solid(x, z, 1.8, 1.8); }
    const cars = new THREE.Group(); k.g.add(cars);
    const traffic = critters(k.g, rand, { count: 14, color: "#ffeac0", size: 0.4, radius: [40, 44], height: [11, 11], mode: "orbit", speed: 2 }); k.updates.push(traffic.update);
    for (const [x, z] of [[-5, 4], [6, -5], [12, 6]]) barrel(k, x, z, "#4a3a2a", true);
    for (const [x, z] of [[-14, -10], [-10, 12], [16, 12]]) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 4), std(["#3a5a8a", "#8a5a3a", "#5a8a3a"][Math.floor(rand() * 3)])); t.position.set(x, 0.9, z); t.rotation.y = Math.PI / 4; k.g.add(t); k.solid(x, z, 2.4, 2.4); }
    if (v === 3) { const car = box(2, 1.2, 4, std("#8a2a2a"), 1.5, 9, 2); car.rotation.x = 0.9; k.g.add(car); }
    k.interact("graffiti", "Add your tag to the pillar", -9, 0, -5, "#ff3fa4", "zap");
  } else { // canal
    flatRect(k, 90, 8, "#2a8a3a", 0, 0, 0.04, { emissive: new THREE.Color("#3aff6a"), emissiveIntensity: 0.4, roughness: 0.2 });
    for (let x = -40; x <= 40; x += 2) { if (Math.abs(x) < 3) continue; k.col.push(aabb(x, 0, 2, 7)); }
    k.g.add(box(4, 0.3, 9, std("#5a4a3a"), 0, 0.6, 0));
    for (const s of [-1, 1]) k.g.add(box(4, 0.8, 0.1, std("#7a7a7a", { metalness: 0.6 }), 0, 1.1, s * 4.4));
    for (const side of [-1, 1]) for (let x = -36; x <= 36; x += 8) tower(k, x, side * 18, 7, 6, 12 + rand() * 14, "#1e1e26", NEON_COLORS);
    const fish = critters(k.g, rand, { count: 8, color: "#aaffaa", size: 0.3, radius: [5, 30], height: [0.02, 0.02], mode: "orbit" }); k.updates.push(fish.update);
    k.interact("canal", "Toss a coin in the canal", 2, 0, 3, "#3aff6a", "splash", () => fish.scare());
  }
  return k.done();
};

const warehouse: Variant = (rand, v) => {
  const k = new Kit(rand);
  if (v === 2) { // container yard (outdoors)
    k.g.add(ground("#3a3a3a", ["#2a2a2a", "#4a4a4a", "#5a4a3a"], 20));
    const cols = ["#c84a2a", "#2a6ac8", "#2a8a4a", "#c8a82a", "#6a2a8a"];
    for (const [x, z, r] of scatter(rand, 22, 9, 34)) { const stack = 1 + Math.floor(r * 3); for (let i = 0; i < stack; i++) { const c = box(6, 2.4, 2.4, std(cols[Math.floor(rand() * 5)]), x, 1.2 + i * 2.45, z); c.rotation.y = Math.floor(r * 2) * Math.PI / 2; k.g.add(c); } k.solid(x, z, 6, 6); }
    const crane = new THREE.Group(); crane.position.set(-20, 0, -18); crane.add(box(1, 22, 1, std("#e8b82a"), 0, 11, 0)); const arm = box(26, 1, 1, std("#e8b82a"), 10, 22, 0); crane.add(arm); k.g.add(crane);
    k.updates.push((t) => (crane.rotation.y = Math.sin(t * 0.1) * 0.6));
    k.interact("crane", "Work the crane controls", -17, 0, -15, "#e8b82a", "horn");
    return k.done();
  }
  const R = 22;
  k.g.add(ground(v === 1 ? "#c8d8e0" : "#3a3a40", v === 1 ? ["#b8c8d8", "#e8f0f8"] : ["#2a2a30", "#4a4a50", "#5a5a3a"], 18, {}, R + 1));
  const walls = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 12, 8, 1, true), std(v === 1 ? "#8aa0b0" : "#4a4a54", { side: THREE.BackSide })); walls.position.y = 6; k.g.add(walls);
  const roof = new THREE.Mesh(new THREE.CircleGeometry(R, 8), std("#2a2a30")); roof.rotation.x = Math.PI / 2; roof.position.y = 12; k.g.add(roof);
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; k.col.push(aabb(Math.cos(a) * (R + 0.5), Math.sin(a) * (R + 0.5), 3, 3)); }
  for (const p of ring(6, 12, 0)) lamp(k.g, p.x, 11, p.z, v === 1 ? "#d8f0ff" : "#ffeac0", 10, 20, 0.15);
  if (v === 0) { // cargo shelves
    for (const z of [-14, -8, 8, 14]) for (const x of [-10, 10]) { k.g.add(box(10, 0.2, 2, std("#c86a2a"), x, 2, z)); k.g.add(box(10, 0.2, 2, std("#c86a2a"), x, 4.5, z)); for (let i = 0; i < 6; i++) crate(k, x - 4 + i * 1.6, z, 1.3, ["#8a6a3a", "#5a7a8a"][i % 2], i % 2 ? 2.1 : 0); k.solid(x, z, 10, 2); }
    const fork = new THREE.Group(); fork.position.set(-4, 0, 3); fork.add(box(1.6, 1.4, 2.4, std("#e8b82a"), 0, 0.9, 0)); fork.add(box(1.4, 0.1, 1.2, std("#555"), 0, 0.3, 1.8)); k.g.add(fork); k.solid(-4, 3, 2, 3);
    k.interact("forklift", "Honk the forklift", -4, 0, 5, "#e8b82a", "horn");
  } else if (v === 1) { // cold storage
    const hooks: THREE.Group[] = [];
    for (let x = -14; x <= 14; x += 3.5) { const h = new THREE.Group(); h.position.set(x, 9, -10); h.add(cyl(0.02, 0.02, 2, std("#9a9a9a"), 0, -1, 0, 4)); h.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), std("#c86a6a")), 0, -2.6, 0)); k.g.add(h); hooks.push(h); }
    k.updates.push((t) => hooks.forEach((h, i) => (h.rotation.z = Math.sin(t * 0.8 + i) * 0.06)));
    for (const [x, z] of [[-12, 8], [0, 12], [12, 8]]) { k.g.add(box(5, 2.6, 2.4, std("#e8f0f8"), x, 1.3, z)); k.solid(x, z, 5, 2.4); }
    glowMotes(k, "#ffffff", 120, "fall", [0, 11]);
    k.interact("freezer", "Open a freezer", 0, 0, 10, "#a8e0ff", "zap");
  } else { // factory floor
    const belts: THREE.Mesh[] = [];
    for (const z of [-9, 9]) { const b = box(34, 0.9, 2, std("#3a3a3a"), 0, 0.45, z); k.g.add(b); belts.push(b); k.solid(0, z, 34, 2); }
    const items: THREE.Mesh[] = []; for (let i = 0; i < 12; i++) { const it = box(0.8, 0.6, 0.8, std("#c8a83a"), -16 + i * 3, 1.2, i % 2 ? -9 : 9); k.g.add(it); items.push(it); }
    k.updates.push((_, dt) => items.forEach((it, i) => { it.position.x += dt * (i % 2 ? 2 : -2); if (it.position.x > 17) it.position.x = -17; if (it.position.x < -17) it.position.x = 17; }));
    const arms: THREE.Group[] = []; for (const x of [-8, 8]) { const a = new THREE.Group(); a.position.set(x, 0, -6); a.add(cyl(0.5, 0.6, 2, std("#e8b82a"), 0, 1, 0, 10)); const up = box(0.4, 3, 0.4, std("#e8b82a"), 0, 3, 0); a.add(up); k.g.add(a); arms.push(a); }
    k.updates.push((t) => arms.forEach((a, i) => (a.rotation.y = Math.sin(t * 1.5 + i * 2) * 1.2)));
    for (const [x, z] of [[-12, 0], [12, 0]]) { k.g.add(cyl(2, 2, 1.6, std("#5a5a5a", { metalness: 0.6 }), x, 0.8, z, 16)); const acid = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16), glow("#8aff3a", 1.2)); acid.rotation.x = -Math.PI / 2; acid.position.set(x, 1.62, z); k.g.add(acid); k.solid(x, z, 4, 4); }
    k.interact("estop", "Hit the emergency stop", 4, 0, -12, "#ff3a3a", "horn");
  }
  return k.done(true);
};

// ================================================================ LANDMARKS

const LANDMARK_WORLDS: Record<string, (rand: () => number) => Built> = {
  wizardtower: (rand) => {
    const k = new Kit(rand);
    k.g.add(ground("#4a6a3a", ["#3a5a2a", "#6a8a4a", "#5a4a6a"]));
    forest(k, 50, 24, 48, ["#2e5a24", "#3b6b2a"], 0.5);
    const tw = new THREE.Group(); tw.position.set(0, 0, -16); tw.rotation.z = 0.08;
    tw.add(cyl(3.2, 4, 18, std("#8a8098", { flatShading: true }), 0, 9, 0, 10));
    tw.add(at(new THREE.Mesh(new THREE.ConeGeometry(4.6, 7, 10), std("#3a2a6a", { flatShading: true })), 0, 21.5, 0));
    for (let i = 0; i < 6; i++) put(tw, at(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), glow(["#ffcf6a", "#b06aff"][i % 2], 1.2)), Math.cos(i) * 3.3, 4 + i * 2.6, Math.sin(i) * 3.3)).lookAt(Math.cos(i) * 10, 4 + i * 2.6, Math.sin(i) * 10 - 16);
    tw.add(box(1.6, 2.6, 0.3, std("#3a2412"), 0, 1.3, 3.9));
    k.g.add(tw); k.solid(0, -16, 8, 8);
    const books: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) { const b = box(0.6, 0.15, 0.8, std(["#8a2a2a", "#2a5a8a", "#6a8a2a", "#8a6a2a"][i % 4]), 0, 0, 0); k.g.add(b); books.push(b); }
    k.updates.push((t) => books.forEach((b, i) => { const a = t * 0.6 + (i / books.length) * Math.PI * 2; b.position.set(Math.cos(a) * (6 + (i % 3)), 18 + Math.sin(t * 2 + i) * 1.5, -16 + Math.sin(a) * (6 + (i % 3))); b.rotation.set(Math.sin(t * 3 + i) * 0.6, a, 0); }));
    const sparks = glowMotes(k, "#c8a0ff", 80, "rise", [0, 20]);
    k.interact("doorknocker", "Knock on the tower door", 0, 0, -11, "#b06aff", "spell", () => sparks.scare());
    return k.done();
  },
  banditcamp: (rand) => {
    const k = new Kit(rand);
    k.g.add(ground("#4a4232", ["#3a3428", "#5a5040", "#6a5a3a"]));
    forest(k, 60, 26, 48, ["#24481d", "#2e5a24"], 0.6);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; if (a > 2.8 && a < 3.5) continue; const x = Math.cos(a) * 20, z = Math.sin(a) * 20; const s = cyl(0.3, 0.35, 4, std("#5a3a20"), x, 2, z, 6); k.g.add(s); k.g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 6), std("#5a3a20")), x, 4.4, z)); k.solid(x, z, 1, 1); }
    for (const p of ring(5, 13, 0.3)) { const t = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 4), std(["#8a6a4a", "#6a5a3a", "#8a3a2a"][Math.floor(rand() * 3)], { flatShading: true })); t.position.set(p.x, 1.3, p.z); t.rotation.y = Math.PI / 4; k.g.add(t); k.solid(p.x, p.z, 3, 3); }
    barrel(k, 9, 0, "#3a2a1a", true);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.3), std("#1a1a1a", { side: THREE.DoubleSide })); flag.position.set(-12, 6, 0); k.g.add(flag); k.g.add(cyl(0.07, 0.07, 6.5, std("#3a2412"), -13, 3.2, 0, 6));
    k.g.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), basic("#e8e8e8")), -12, 6.1, 0.01));
    k.updates.push((t) => (flag.rotation.y = Math.sin(t * 2) * 0.3));
    k.interact("lute", "Steal a go on the bandits' lute", 8, 0, 3, "#ffcf6a", "chime");
    return k.done();
  },
  graveyard: (rand) => {
    const k = new Kit(rand);
    k.g.add(ground("#3a4232", ["#2a3428", "#4a4a3a", "#5a5248"]));
    for (const [x, z, r] of scatter(rand, 60, 8, 32)) { const s = box(0.9, 1.1 + r * 0.6, 0.25, std("#8a8a80", { flatShading: true }), x, 0.6, z); s.rotation.set((r - 0.5) * 0.3, r * 0.4, (r - 0.5) * 0.25); k.g.add(s); if (r > 0.8) flatRect(k, 1, 2, "#2a2018", x, z + 1.3, 0.03); }
    const maus = new THREE.Group(); maus.position.set(16, 0, -10); maus.add(box(6, 4.5, 6, std("#7a7a72"), 0, 2.25, 0)); put(maus, at(new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.4, 4), std("#5a5a52")), 0, 5.7, 0)).rotation.y = Math.PI / 4; put(maus, box(1.6, 2.6, 0.2, std("#1a1a1a"), -3.05, 1.3, 0)).rotation.y = Math.PI / 2; k.g.add(maus); k.solid(16, -10, 6.5, 6.5);
    for (const [x, z, r] of scatter(rand, 10, 14, 34)) deadTree(k, x, z, 4 + r * 3);
    const mist = critters(k.g, rand, { count: 90, color: "#c8d0d8", size: 1.6, radius: [5, 30], height: [0, 1], mode: "hover", opacity: 0.28, glow: false }); k.updates.push(mist.update);
    const ghosts = critters(k.g, rand, { count: 5, color: "#c8e8ff", size: 0.6, radius: [8, 20], height: [1, 3], mode: "orbit" }); k.updates.push(ghosts.update);
    lamp(k.g, 0, 3, 10, "#a8c8ff", 4, 12, 0.18);
    k.interact("grave", "Read an open grave's headstone", -7, 0, 6, "#a8c8ff", "death", () => ghosts.scare());
    return k.done();
  },
  colosseum: (rand) => {
    const k = new Kit(rand);
    underground(k, "#4a3a2a", ["#5a4a3a", "#3a2a1a", "#6a5a4a"], "#1a1410");
    flatDisc(k, 13, "#8a7a5a", 0.02);
    for (let tier = 0; tier < 4; tier++) { const r = 16 + tier * 3; const t = new THREE.Mesh(new THREE.CylinderGeometry(r + 2, r + 2, 1.2, 40, 1, true), std("#5a4a3a", { side: THREE.DoubleSide })); t.position.y = 0.6 + tier * 1.4; k.g.add(t); const top = new THREE.Mesh(new THREE.RingGeometry(r, r + 2.2, 40), std("#6a5a4a", { side: THREE.DoubleSide })); top.rotation.x = -Math.PI / 2; top.position.y = 1.2 + tier * 1.4; k.g.add(top); }
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; k.col.push(aabb(Math.cos(a) * 15.5, Math.sin(a) * 15.5, 2, 2)); }
    const crowd = critters(k.g, rand, { count: 80, color: "#c8b8a0", size: 0.5, radius: [17, 26], height: [1.8, 6], mode: "hover", shape: "box", glow: false, speed: 0.4 }); k.updates.push(crowd.update);
    for (const p of ring(6, 15, 0.2)) { k.g.add(cyl(0.1, 0.1, 6, std("#3a2a1a"), p.x, 3, p.z, 6)); const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), std(["#c8a83a", "#8a2a2a"][Math.floor(rand() * 2)], { side: THREE.DoubleSide })); b.position.set(p.x, 5, p.z); b.lookAt(0, 5, 0); k.g.add(b); }
    lamp(k.g, 0, 14, 0, "#ffd89a", 18, 40, 0.01);
    k.interact("crowd", "Raise your arms to the crowd", 10, 0, 0, "#ffd83a", "horn", () => crowd.scare());
    return k.done(true);
  },
  station: (rand) => {
    const k = new Kit(rand);
    underground(k, "#3a3a44", ["#2a2a34", "#4a4a54"], "#101218");
    flatRect(k, 70, 10, "#0a0a10", 0, 14, 0.02);
    for (const z of [11.5, 16.5]) k.g.add(box(70, 0.15, 0.2, std("#7a7a7a", { metalness: 0.7 }), 0, 0.1, z));
    for (let x = -30; x <= 30; x += 2.4) k.col.push(aabb(x, 14, 2.4, 9));
    for (let x = -24; x <= 24; x += 8) { k.g.add(box(4, 0.5, 1, std("#5a3a2a"), x, 0.6, 4)); const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), std("#d8d0c0")); shell.position.set(x + (rand() - 0.5) * 2, 1.3, 4); shell.scale.y = 1.4; k.g.add(shell); k.solid(x, 4, 4, 1); }
    const tram = new THREE.Group(); tram.position.set(-40, 0, 14); tram.add(box(12, 3.4, 3.4, new THREE.MeshStandardMaterial({ color: "#a8c8e8", transparent: true, opacity: 0.4, emissive: new THREE.Color("#4a8ab8"), emissiveIntensity: 0.6 }), 0, 2, 0)); k.g.add(tram);
    let arriving = 0; k.updates.push((_, dt) => { if (arriving > 0) { arriving -= dt; tram.position.x += dt * 12; if (tram.position.x > 40) tram.position.x = -40; } tram.visible = arriving > 0; });
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 0.8, 12, 1, true), std("#c9a14a", { metalness: 0.8, side: THREE.DoubleSide })); bell.position.set(0, 7, 8); k.g.add(bell);
    for (const p of ring(6, 10, 0)) lamp(k.g, p.x, 5, p.z, "#ffd89a", 4, 10, 0.18);
    k.interact("bell", "Ring the station bell", 0, 0, 8, "#c9a14a", "bell", () => (arriving = 6.5));
    return k.done(true);
  },
  hive: (rand) => {
    const k = new Kit(rand);
    underground(k, "#4a3a1a", ["#5a4a2a", "#3a2a10", "#6a5020"], "#2a1e0c");
    const comb = glow("#e8b83a", 0.35, { flatShading: true });
    for (const p of ring(40, 18, 0)) for (let h = 0; h < 6; h++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.6, 6), comb); c.position.set(p.x * (1 + h * 0.05), 1 + h * 2, p.z * (1 + h * 0.05)); c.rotation.set(Math.PI / 2, 0, -p.a); c.lookAt(0, c.position.y, 0); k.g.add(c); }
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; k.col.push(aabb(Math.cos(a) * 17.5, Math.sin(a) * 17.5, 2, 2)); }
    const bees = critters(k.g, rand, { count: 40, color: "#ffd83a", size: 0.3, radius: [6, 16], height: [1, 8], mode: "orbit", shape: "bird", speed: 2 }); k.updates.push(bees.update);
    lamp(k.g, 0, 8, 0, "#ffc85a", 14, 30, 0.01);
    k.interact("honey", "Dip a finger in the honey", 12, 0, 0, "#ffc85a", "heal", () => bees.scare());
    return k.done(true);
  },
  clinic: (rand) => {
    const k = new Kit(rand);
    const R = 18;
    k.g.add(ground("#d8e0e0", ["#c8d0d0", "#e8f0f0", "#a8b0b0"], 16, {}, R + 1));
    const w = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 8, 12, 1, true), std("#a8c0c0", { side: THREE.BackSide })); w.position.y = 4; k.g.add(w);
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; k.col.push(aabb(Math.cos(a) * (R + 0.5), Math.sin(a) * (R + 0.5), 3, 3)); }
    for (const p of ring(4, 12, 0.4)) { put(k.g, box(1.4, 0.9, 3, std("#e8e8e8"), p.x, 0.45, p.z)).rotation.y = -p.a; const lampM = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 0.3, 16), glow("#ffffff", 1.5)); lampM.position.set(p.x, 4, p.z); k.g.add(lampM); k.solid(p.x, p.z, 2, 2); }
    for (const p of ring(6, 15.5, 0.1)) { k.g.add(cyl(0.8, 0.8, 3, new THREE.MeshStandardMaterial({ color: "#7affb0", transparent: true, opacity: 0.4, emissive: new THREE.Color("#3aff8a"), emissiveIntensity: 0.5 }), p.x, 1.5, p.z, 14)); k.g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.8, 4, 8), std("#c8a8a8")), p.x, 1.5, p.z)); k.solid(p.x, p.z, 1.8, 1.8); }
    const s = sign("NO REFUNDS ON LIMBS", "#3aff8a", 6, 1.4); s.position.set(0, 6, -R + 0.4); k.g.add(s);
    lamp(k.g, 0, 7, 0, "#e8fff8", 20, 30, 0.01);
    k.interact("arm", "Try on a spare cyber-arm", 8, 0, -8, "#3ac8ff", "zap");
    return k.done(true);
  },
  arcade: (rand) => {
    const k = new Kit(rand);
    const R = 18;
    k.g.add(ground("#1a1424", ["#2a1a3a", "#0a0a14", "#3a1a4a"], 16, {}, R + 1));
    const w = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 8, 16, 1, true), std("#14101c", { side: THREE.BackSide })); w.position.y = 4; k.g.add(w);
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; k.col.push(aabb(Math.cos(a) * (R + 0.5), Math.sin(a) * (R + 0.5), 3, 3)); }
    const screens: THREE.Mesh[] = [];
    for (const r of [10, 14]) ring(r === 10 ? 10 : 14, r, 0.15).forEach((p) => { const c = new THREE.Group(); c.position.set(p.x, 0, p.z); c.lookAt(0, 0, 0); c.add(box(1.1, 2.2, 0.9, std("#1a1a24"), 0, 1.1, 0)); const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), basic(NEON_COLORS[Math.floor(rand() * 5)])); sc.position.set(0, 1.6, 0.46); c.add(sc); screens.push(sc); k.g.add(c); k.solid(p.x, p.z, 1.2, 1.2); });
    k.updates.push((t) => screens.forEach((s, i) => (s.material as THREE.MeshBasicMaterial).color.setHSL((t * 0.15 + i * 0.13) % 1, 0.9, 0.55)));
    for (const p of ring(6, 6, 0)) lamp(k.g, p.x, 7, p.z, NEON_COLORS[Math.floor(rand() * 5)], 8, 14, 0.12);
    const s = sign("HI-SCORE", "#ff3aff", 5, 1.6); s.position.set(0, 6, -R + 0.4); k.g.add(s);
    k.interact("cabinet", "Insert a coin", 0, 0, -8, "#ff3aff", "levelup");
    return k.done(true);
  },
  landfill: (rand) => {
    const k = new Kit(rand);
    k.g.add(ground("#4a4232", ["#5a5040", "#3a3a2a", "#6a5a3a"], 20));
    const junk = ["#8a8a8a", "#6a4a3a", "#3a5a8a", "#8a3a3a", "#c8c8c8"];
    for (const [x, z, r] of scatter(rand, 16, 12, 40)) { const heap = new THREE.Mesh(new THREE.ConeGeometry(4 + r * 4, 3 + r * 5, 7), std("#4a4030", { flatShading: true })); heap.position.set(x, 1.5 + r * 2, z); k.g.add(heap); for (let i = 0; i < 6; i++) { const b = box(0.6 + rand(), 0.6 + rand(), 0.6 + rand(), std(junk[Math.floor(rand() * 5)]), x + (rand() - 0.5) * 6, rand() * 3, z + (rand() - 0.5) * 6); b.rotation.set(rand() * 3, rand() * 3, rand() * 3); k.g.add(b); } if (Math.hypot(x, z) < 36) k.solid(x, z, 6, 6); }
    const throne = new THREE.Group(); throne.position.set(0, 0, -16); for (let i = 0; i < 3; i++) throne.add(box(1.4, 2.6, 1.2, std("#e8e8e0"), -1.6 + i * 1.6, 1.3 + (i === 1 ? 1.2 : 0), 0)); throne.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 16), std("#c8a83a", { metalness: 0.8 })), 0, 4.6, 0)); k.g.add(throne); k.solid(0, -16, 5, 2);
    const gulls = critters(k.g, rand, { count: 14, color: "#e8e8e8", size: 0.5, radius: [8, 22], height: [8, 14], mode: "orbit", shape: "bird" }); k.updates.push(gulls.update);
    k.interact("rummage", "Rummage in the trash", 9, 0, 6, "#c8a83a", "hit", () => gulls.scare());
    return k.done();
  },
  den: (rand) => {
    const k = new Kit(rand);
    k.g.add(ground("#3a3a2a", ["#2a2a20", "#4a4a38", "#5a4a3a"]));
    forest(k, 110, 16, 48, ["#1e3a1a", "#24481d"], 0.7, "#3a2a1a");
    const cave = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std("#4a4440", { flatShading: true, side: THREE.DoubleSide })); cave.position.set(0, 0, -20); cave.scale.set(1.4, 0.8, 1); k.g.add(cave); k.solid(0, -20, 18, 10);
    k.g.add(at(new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), basic("#050505")), 0, 2.4, -11.5));
    for (const [x, z, r] of scatter(rand, 30, 7, 16)) put(k.g, at(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5 + r * 0.4, 3, 6), std("#e8e0c8")), x, 0.08, z)).rotation.set(Math.PI / 2, 0, r * 6);
    const eyes = critters(k.g, rand, { count: 10, color: "#ffcf3a", size: 0.18, radius: [18, 26], height: [0.8, 1.2], mode: "hover" }); k.updates.push(eyes.update);
    k.interact("howl", "Howl back at the wolves", 8, 0, -6, "#ffcf3a", "horn", () => eyes.scare());
    return k.done();
  },
  witchhut: (rand) => {
    const k = new Kit(rand);
    k.g.add(ground("#2a3a2a", ["#1a2a1a", "#3a4a3a", "#3a2a3a"]));
    for (const [x, z, r] of scatter(rand, 10, 8, 30)) water(k.g, "#1a2a20", 0.03, 1.5 + r * 3).position.set(x, 0.03, z);
    for (const [x, z, r] of scatter(rand, 18, 14, 40)) deadTree(k, x, z, 3 + r * 4, "#2a2420");
    const hut = new THREE.Group(); hut.position.set(0, 0, -15);
    for (const sx of [-1.5, 1.5]) for (const sz of [-1.5, 1.5]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 2.6, 4, 8), std("#d8b878")); leg.position.set(sx, 1.6, sz); leg.rotation.z = sx * 0.2; hut.add(leg); }
    hut.add(box(4.4, 3, 4, std("#5a4a3a", { flatShading: true }), 0, 4.6, 0)); put(hut, at(new THREE.Mesh(new THREE.ConeGeometry(3.6, 3, 4), std("#3a3a2a", { flatShading: true })), 0, 7.6, 0)).rotation.y = Math.PI / 4;
    hut.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), glow("#8aff6a", 1.6)), 0, 4.8, 2.02));
    k.g.add(hut); k.solid(0, -15, 5, 5);
    k.updates.push((t) => (hut.position.y = Math.abs(Math.sin(t * 0.8)) * 0.15));
    const cauldron = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, Math.PI / 2.6, Math.PI / 1.6), std("#1a1a1a", { side: THREE.DoubleSide })); cauldron.position.set(7, 0.9, -6); k.g.add(cauldron); k.solid(7, -6, 2, 2);
    const brew = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16), glow("#8aff6a", 1.4)); brew.rotation.x = -Math.PI / 2; brew.position.set(7, 1.3, -6); k.g.add(brew);
    const bubbles = critters(k.g, rand, { count: 30, color: "#8aff6a", size: 0.2, radius: [0, 0.8], height: [0, 2.5], mode: "rise" }); const bRoot = new THREE.Group(); bRoot.position.set(7, 1.3, -6); k.g.add(bRoot); k.updates.push(bubbles.update);
    const mist = critters(k.g, rand, { count: 80, color: "#c8d8c8", size: 1.6, radius: [5, 28], height: [0, 1.5], mode: "hover", opacity: 0.25, glow: false }); k.updates.push(mist.update);
    k.interact("cauldron", "Stir the witch's cauldron", 7, 0, -4, "#8aff6a", "spell");
    return k.done();
  },
};

const VARIANTS: Record<string, Variant> = { meadow, woods, highland, bog, tunnels, fungus, lake, thorns, alley, rooftop, underpass, warehouse };

/** Builds a wilds world for presets like "meadow-2" or a landmark like "wizardtower". */
export function buildWild(preset: string, rand: () => number): Built | null {
  const m = /^([a-z]+)-(\d)$/.exec(preset);
  if (m && VARIANTS[m[1]]) return VARIANTS[m[1]](rand, Number(m[2]));
  const lm = LANDMARK_WORLDS[preset];
  return lm ? lm(rand) : null;
}

/** Base terrain of a preset ("meadow-2" → "meadow"). */
export const presetBase = (p: string) => p.replace(/-\d$/, "");
