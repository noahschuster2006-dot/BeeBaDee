// Detailed environments for every campaign scene. Each world has its own landmarks, ambient life
// and at least one shared interaction (press E) that everyone at the table sees and hears.

import * as THREE from "three";
import { sound } from "./audio";
import { aabb, type Collider, type Interactable } from "./kit";
import {
  Fx, at, basic, box, canvasTex, cottage, critters, cyl, glow, ground, lamp, ring, scatter, sign, spot, std, tree, type Builder, type Built,
} from "./worldkit";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function make(g: THREE.Group, colliders: Collider[], parts: { updates: ((t: number, dt: number) => void)[]; inter: Interactable[]; fx: Record<string, () => void>; enclosed?: boolean }): Built {
  return {
    group: g, colliders, enclosed: parts.enclosed, interactables: parts.inter,
    update: (t, dt) => parts.updates.forEach((u) => u(t, dt)),
    onFx: (id) => parts.fx[id]?.(),
  };
}

/** Domed roof for underground places. */
function dome(g: THREE.Group, color: string, r = 46, squash = 0.3) {
  const d = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(color, { side: THREE.BackSide, flatShading: true }));
  d.scale.y = squash;
  g.add(d);
}

function water(g: THREE.Group, color: string, y = 0.02, r = 60, emissive?: string) {
  const w = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4, transparent: true, opacity: 0.9, emissive: emissive ? new THREE.Color(emissive) : undefined, emissiveIntensity: emissive ? 0.12 : 0 }));
  w.rotation.x = -Math.PI / 2;
  w.position.y = y;
  g.add(w);
  return w;
}

export const WORLDS: Record<string, Builder> = {
  // ============================== REALM ==============================
  village: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#4f6b35", ["#3f5a28", "#6a8a40", "#7a6a48"]));
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(8, 32), std("#fff", { map: canvasTex(256, 256, (c) => { c.fillStyle = "#7a7268"; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${40 + Math.random() * 40},${40 + Math.random() * 30},30,0.4)`; c.strokeStyle = "rgba(0,0,0,0.3)"; const x = Math.random() * 256, y = Math.random() * 256; c.beginPath(); c.roundRect(x, y, 14, 10, 3); c.fill(); c.stroke(); } }, [4, 4]) }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.01; g.add(plaza);
    ring(9, 15, 0.2).forEach((p, i) => { cottage(g, p.x, p.z, -p.a - Math.PI / 2, ["#c8b08a", "#d8c8a8", "#a89070"][i % 3], ["#6a3a2a", "#4a3a2a", "#7a5a3a"][i % 3], rand); col.push(aabb(p.x, p.z, 5, 5)); });
    const smoke = critters(g, rand, { count: 60, color: "#bbbbbb", size: 0.9, radius: [15, 15], height: [4, 10], mode: "rise", glow: false, speed: 0.6 });
    // well, gallows, market stalls
    g.add(cyl(1, 1, 0.9, std("#6a6058"), 9, 0.45, -3, 16)); g.add(box(2.4, 0.15, 0.15, std("#4a2c14"), 9, 2.2, -3));
    for (const sx of [-1, 1]) g.add(box(0.15, 2.2, 0.15, std("#4a2c14"), 9 + sx * 1.1, 1.1, -3));
    col.push(aabb(9, -3, 2.2, 2.2));
    const gal = new THREE.Group(); gal.position.set(-10, 0, 6);
    gal.add(box(3, 0.3, 3, std("#5a3a20"), 0, 1.2, 0)); gal.add(box(0.25, 4, 0.25, std("#3a2412"), -1, 3, 0)); gal.add(box(2.2, 0.25, 0.25, std("#3a2412"), 0, 5, 0));
    const noose = cyl(0.03, 0.03, 1.4, std("#c8a878"), 0.6, 4.3, 0, 6); gal.add(noose); g.add(gal); col.push(aabb(-10, 6, 3, 3));
    ring(4, 10, 1).forEach((p, i) => { const s = new THREE.Group(); s.position.set(p.x, 0, p.z); s.rotation.y = -p.a; s.add(box(2.2, 0.9, 1, std("#6b4423"), 0, 0.45, 0)); s.add(box(2.6, 0.06, 1.6, std(["#a83a3a", "#3a6aa8", "#c8a83a", "#3a8a5a"][i]), 0, 2.2, 0.2)); for (const sx of [-1.2, 1.2]) s.add(cyl(0.05, 0.05, 2.2, std("#3a2412"), sx, 1.1, 0.8, 6)); g.add(s); col.push(aabb(p.x, p.z, 2.4, 2.4)); });
    // church with bell tower (far north)
    g.add(box(5, 6, 8, std("#a8a090"), 0, 3, -24)); g.add(box(2.5, 12, 2.5, std("#9a9284"), 0, 6, -19)); col.push(aabb(0, -22, 6, 10));
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 1.2, 16, 1, true), std("#c9a14a", { metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide })); bell.position.set(0, 10.5, -19); g.add(bell);
    const chickens = critters(g, rand, { count: 9, color: "#f2efe6", size: 0.25, radius: [8, 12], height: [0, 0], mode: "scurry", shape: "box" });
    const crows = critters(g, rand, { count: 10, color: "#151515", size: 0.5, radius: [10, 22], height: [12, 18], mode: "orbit", shape: "bird" });
    const bellSwing = { v: 0 };
    return make(g, col, {
      updates: [smoke.update, chickens.update, crows.update, (t, dt) => { bellSwing.v *= 0.98; bell.rotation.z = Math.sin(t * 4) * bellSwing.v; fx.update(dt); }],
      inter: [spot("ring-bell", "Pull the church bell rope", 0, 1, -17.5), spot("chickens", "Chase the chickens", 10, 1, 6, 3)],
      fx: {
        "ring-bell": () => { bellSwing.v = 0.6; sound.sfx("bell"); fx.ring(V(0, 0.2, -19), "#ffe0a0", 30); crows.scare(); },
        chickens: () => { chickens.scare(); sound.sfx("chime"); fx.burst(V(10, 0.5, 6), "#ffffff", 30, 2); },
      },
    });
  },

  marsh: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    water(g, "#1c2a22", 0.0, 60, "#0a2a1a");
    g.add(ground("#3a4430", ["#2a3420", "#4a5a3a"], 20, {}, 9));
    const reedM = std("#6a7a3a");
    for (const [x, z, r] of scatter(rand, 260, 9, 40)) { const h = 1 + r * 1.5; const reed = cyl(0.02, 0.03, h, reedM, x, h / 2, z, 4); reed.rotation.z = (r - 0.5) * 0.3; g.add(reed); }
    const deadM = std("#3a3228");
    for (const [x, z, r] of scatter(rand, 18, 12, 35)) { g.add(cyl(0.2, 0.35, 4 + r * 3, deadM, x, 2, z, 6)); for (let k = 0; k < 3; k++) { const br = cyl(0.05, 0.12, 2, deadM, x, 3 + k, z, 5); br.rotation.z = (k - 1) * 0.9; br.rotation.y = r * 6 + k; g.add(br); } col.push(aabb(x, z, 0.8, 0.8)); }
    const posts: THREE.PointLight[] = [];
    ring(8, 10).forEach((p) => { g.add(cyl(0.08, 0.1, 2.6, std("#2a2018"), p.x, 1.3, p.z, 6)); const l = lamp(g, p.x, 2.7, p.z, "#ffb050", 0, 9); posts.push(l.light); });
    const wisps = critters(g, rand, { count: 14, color: "#9affd0", size: 0.5, radius: [12, 26], height: [0.8, 2.5], mode: "hover" });
    const flies = critters(g, rand, { count: 80, color: "#3a3a3a", size: 0.06, radius: [8, 20], height: [0.5, 2], mode: "hover", glow: false });
    return make(g, col, {
      updates: [wisps.update, flies.update, (t, dt) => { fx.update(dt); }],
      inter: [spot("light-posts", "Light the causeway lanterns", 10, 1, 0), spot("wisp", "Follow a will-o'-wisp", -12, 1, 4, 3)],
      fx: {
        "light-posts": () => { posts.forEach((l, i) => setTimeout(() => (l.intensity = 6), i * 200)); sound.sfx("chime"); },
        wisp: () => { wisps.scare(); fx.flash(V(-12, 2, 4), "#9affd0", 25); fx.burst(V(-12, 1, 4), "#9affd0"); sound.sfx("spell"); },
      },
    });
  },

  stilts: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    water(g, "#203038", -0.05);
    g.add(ground("#6a5a40", ["#5a4a30", "#7a6a50"], 12, {}, 8.5));
    const plank = std("#6b5030");
    ring(10, 16, 0.3).forEach((p, i) => {
      const h = new THREE.Group(); h.position.set(p.x, 0, p.z); h.rotation.y = -p.a;
      for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) h.add(cyl(0.12, 0.15, 3, std("#3a2a18"), lx, 1.5, lz, 6));
      h.add(box(3.6, 2.2, 3.6, std(["#7a6a58", "#8a7a60", "#6a5a48"][i % 3]), 0, 4.1, 0));
      h.add(at(new THREE.Mesh(new THREE.ConeGeometry(3, 1.6, 4), std("#4a3a2a", { flatShading: true })), 0, 6, 0)).children.at(-1)!.rotation.set(0, Math.PI / 4, 0);
      h.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), basic("#ffc870")), 0, 4.3, 1.81));
      g.add(h); col.push(aabb(p.x, p.z, 4, 4));
      // rope bridge to the next house
      const n = ring(10, 16, 0.3)[(i + 1) % 10];
      const mid = V((p.x + n.x) / 2, 3, (p.z + n.z) / 2);
      const len = Math.hypot(n.x - p.x, n.z - p.z) - 3.6;
      const br = box(len, 0.08, 1, plank, mid.x, 2.9, mid.z); br.rotation.y = -Math.atan2(n.z - p.z, n.x - p.x); g.add(br);
    });
    for (const [x, z, r] of scatter(rand, 6, 11, 25)) { const boat = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 2.4, 4, 8), std("#5a3a20")); boat.rotation.z = Math.PI / 2; boat.rotation.y = r * 6; boat.scale.y = 0.4; boat.position.set(x, 0.1, z); g.add(boat); }
    const gulls = critters(g, rand, { count: 12, color: "#e8e8e8", size: 0.5, radius: [8, 26], height: [9, 16], mode: "orbit", shape: "bird" });
    const fogbell = at(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 0.8, 12, 1, true), std("#8a7a5a", { metalness: 0.8, side: THREE.DoubleSide })), 8, 2.6, -2); g.add(fogbell);
    g.add(cyl(0.08, 0.08, 3, std("#3a2a18"), 8, 1.5, -2, 6));
    return make(g, col, {
      updates: [gulls.update, (t, dt) => { fogbell.rotation.z = Math.sin(t * 3) * 0.05; fx.update(dt); }],
      inter: [spot("fogbell", "Ring the fog bell", 8, 1, -2)],
      fx: { fogbell: () => { sound.sfx("bell"); gulls.scare(); fx.ring(V(8, 0.1, -2), "#c8d8e8", 20); } },
    });
  },

  fortress: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#5a4a38", ["#4a3a28", "#6a5a48", "#3a3a3a"], 24));
    const log = std("#5a3a20");
    for (const p of ring(56, 20)) { const h = 4.5 + Math.sin(p.a * 9) * 0.4; const l = cyl(0.3, 0.32, h, log, p.x, h / 2, p.z, 7); g.add(l); g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 7), log), p.x, h + 0.3, p.z)); }
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; col.push(aabb(Math.cos(a) * 20.5, Math.sin(a) * 20.5, 3, 3)); }
    const torches: THREE.PointLight[] = [];
    ring(4, 18, Math.PI / 4).forEach((p) => {
      const t = new THREE.Group(); t.position.set(p.x, 0, p.z);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) t.add(cyl(0.15, 0.15, 7, log, lx, 3.5, lz, 6));
      t.add(box(2.8, 0.2, 2.8, log, 0, 6, 0)); t.add(box(2.8, 1, 0.15, log, 0, 6.6, 1.4));
      g.add(t); col.push(aabb(p.x, p.z, 2.6, 2.6));
      torches.push(lamp(g, p.x, 7.5, p.z, "#ff8a3a", 8, 16, 0.2).light);
    });
    const banners: THREE.Mesh[] = [];
    ring(6, 13, 0.4).forEach((p, i) => {
      g.add(cyl(0.06, 0.06, 5, std("#2a2018"), p.x, 2.5, p.z, 6));
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2, 1, 6), std(i % 2 ? "#8a1a1a" : "#2a2a2a", { side: THREE.DoubleSide }));
      b.geometry.translate(0.6, -1, 0); b.position.set(p.x, 5, p.z); g.add(b); banners.push(b);
    });
    for (const [x, z] of scatter(rand, 8, 9, 16)) { const tent = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.4, 4), std("#8a7a5a", { flatShading: true })); tent.position.set(x, 1.2, z); tent.rotation.y = rand(); g.add(tent); col.push(aabb(x, z, 2.6, 2.6)); }
    const drum = cyl(0.9, 0.9, 1.1, std("#7a4a2a"), -8, 0.55, 8, 16); g.add(drum); col.push(aabb(-8, 8, 1.8, 1.8));
    const fire = lamp(g, 8, 0.6, 8, "#ff7a2a", 10, 12, 0.35);
    return make(g, col, {
      updates: [(t, dt) => { banners.forEach((b, i) => (b.rotation.y = Math.sin(t * 2 + i) * 0.3)); fire.light.intensity = 9 + Math.random() * 3; torches.forEach((l) => (l.intensity = 7 + Math.random() * 2)); fx.update(dt); }],
      inter: [spot("wardrum", "Beat the war drum", -8, 1, 8)],
      fx: { wardrum: () => { sound.sfx("boom"); fx.ring(V(-8, 0.1, 8), "#ff8a3a", 18); drum.scale.y = 0.85; setTimeout(() => (drum.scale.y = 1), 150); } },
    });
  },

  mountain: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#e8eef4", ["#c8d0dc", "#ffffff", "#9aa4b0"], 20));
    const rock = std("#7a7e88", { flatShading: true });
    for (const [x, z, r] of scatter(rand, 40, 14, 48)) { const h = 6 + r * 18; const s = new THREE.Mesh(new THREE.ConeGeometry(2 + r * 4, h, 6), rock); s.position.set(x, h / 2, z); s.castShadow = true; g.add(s); g.add(at(new THREE.Mesh(new THREE.ConeGeometry(1 + r * 1.6, h * 0.3, 6), std("#ffffff")), x, h * 0.86, z)); col.push(aabb(x, z, 3 + r * 4, 3 + r * 4)); }
    const pineM = std("#2a4a3a"), trunk = std("#4a3320");
    for (const [x, z, r] of scatter(rand, 30, 9, 30)) { tree(g, x, z, 3 + r * 3, pineM, trunk, true); g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.8, 9), std("#ffffff")), x, 3 + r * 3 + 1.8, z)); col.push(aabb(x, z, 0.8, 0.8)); }
    // the giant's bell frame
    const frame = new THREE.Group(); frame.position.set(-12, 0, -10);
    for (const sx of [-3, 3]) frame.add(box(0.6, 7, 0.6, std("#5a3a20"), sx, 3.5, 0));
    frame.add(box(7, 0.6, 0.6, std("#5a3a20"), 0, 7, 0));
    const bells: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25 + i * 0.08, 0.5 + i * 0.12, 0.8 + i * 0.15, 14, 1, true), std(["#c9a14a", "#a87a3a", "#d8b86a"][i % 3], { metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide })); b.geometry.translate(0, -0.6, 0); b.position.set(-2.4 + i * 1.2, 6.7, 0); frame.add(b); bells.push(b); }
    g.add(frame); col.push(aabb(-12, -10, 7, 1.2));
    const eagles = critters(g, rand, { count: 4, color: "#4a3a2a", size: 1.2, radius: [14, 30], height: [18, 26], mode: "orbit", shape: "bird", speed: 0.5 });
    let ringing = 0;
    return make(g, col, {
      updates: [eagles.update, (t, dt) => { ringing = Math.max(0, ringing - dt); bells.forEach((b, i) => (b.rotation.z = Math.sin(t * 5 + i) * (ringing / 4) * 0.5)); fx.update(dt); }],
      inter: [spot("bells", "Shake the giant's bells", -12, 1, -8, 3)],
      fx: { bells: () => { ringing = 4; bells.forEach((_, i) => setTimeout(() => sound.sfx("chime"), i * 120)); fx.ring(V(-12, 0.1, -10), "#ffe8a0", 16); eagles.scare(); } },
    });
  },

  abbey: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    water(g, "#1a2430", 0.15, 30, "#0a1a2a");
    g.add(ground("#5a5650", ["#4a4640", "#6a665e"], 20, {}, 30));
    const stone = std("#8a867c");
    for (const p of ring(14, 15)) {
      g.add(cyl(0.7, 0.8, 10, stone, p.x, 5, p.z, 10)); col.push(aabb(p.x, p.z, 1.6, 1.6));
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.35, 8, 16, Math.PI), stone); arch.position.set(p.x, 10, p.z); arch.rotation.y = -p.a + Math.PI / 2 + Math.PI / 14; g.add(arch);
    }
    const glassCols = ["#c83a3a", "#3a6ac8", "#c8a83a", "#3ac86a", "#a03ac8"];
    ring(10, 22).forEach((p, i) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), new THREE.MeshBasicMaterial({ map: canvasTex(64, 128, (c) => { for (let y = 0; y < 128; y += 16) for (let x = 0; x < 64; x += 16) { c.fillStyle = glassCols[(x + y + i * 16) / 16 % 5 | 0]; c.fillRect(x, y, 15, 15); } c.strokeStyle = "#111"; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 30, Math.PI, 0); c.stroke(); }), transparent: true, opacity: 0.85, side: THREE.DoubleSide })); w.position.set(p.x, 7, p.z); w.lookAt(0, 7, 0); g.add(w); });
    for (const [x, z, r] of scatter(rand, 16, 8, 13)) { const pew = box(2.4, 0.5, 0.6, std("#4a3020"), x, 0.35 + Math.sin(r * 9) * 0.05, z); pew.rotation.y = r * 2; g.add(pew); }
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, 2.4, 20, 1, true), std("#a88a4a", { metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }));
    bell.geometry.translate(0, -1.2, 0); bell.position.set(0, 9, -11); g.add(bell);
    g.add(box(6, 0.4, 0.4, stone, 0, 9.2, -11));
    const ghosts = critters(g, rand, { count: 20, color: "#bcd8ff", size: 0.7, radius: [9, 14], height: [1, 4], mode: "hover" });
    for (const [x, z] of scatter(rand, 10, 9, 14)) lamp(g, x, 1.2, z, "#ffcf7a", 2, 5, 0.06);
    let swing = 0;
    return make(g, col, {
      enclosed: true,
      updates: [ghosts.update, (t, dt) => { swing *= 0.985; bell.rotation.x = Math.sin(t * 3) * swing; fx.update(dt); }],
      inter: [spot("abbeybell", "Pull the abbey bell's rotten rope", 0, 1, -9, 3)],
      fx: { abbeybell: () => { swing = 0.5; sound.sfx("bell"); setTimeout(() => sound.sfx("bell"), 900); fx.ring(V(0, 0.3, -11), "#ffffff", 30, 2); fx.flash(V(0, 6, -11), "#e8f0ff", 40); ghosts.scare(); } },
    });
  },

  dragonroost: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#2a4a3a", ["#1a3a2a", "#3a6a4a", "#4a8a5a"], 18, { roughness: 0.6, metalness: 0.3 }));
    const rock = std("#3a4a40", { flatShading: true, roughness: 0.4 });
    for (const p of ring(30, 26)) { const h = 6 + Math.abs(Math.sin(p.a * 5)) * 10; const s = new THREE.Mesh(new THREE.ConeGeometry(4, h, 5), rock); s.position.set(p.x, h / 2, p.z); g.add(s); col.push(aabb(p.x, p.z, 5, 5)); }
    const gold = std("#e8c14a", { metalness: 0.9, roughness: 0.25 });
    const pile = new THREE.Group(); pile.position.set(0, 0, -15);
    pile.add(at(new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold), 0, 0, 0));
    for (let i = 0; i < 60; i++) { const coin = cyl(0.25, 0.25, 0.05, gold, (rand() - 0.5) * 9, rand() * 0.4, (rand() - 0.5) * 7, 10); coin.rotation.set(rand() * 3, 0, rand() * 3); pile.add(coin); }
    pile.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 16), gold), 1.5, 2, 0));
    g.add(pile); col.push(aabb(0, -15, 8, 8));
    const bone = std("#e8dfc8");
    for (const [x, z, r] of scatter(rand, 30, 8, 22)) { const b = cyl(0.08, 0.1, 1 + r * 2, bone, x, 0.1, z, 6); b.rotation.z = Math.PI / 2; b.rotation.y = r * 6; g.add(b); }
    const chain = new THREE.Group();
    for (let i = 0; i < 12; i++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.12, 8, 12), std("#1a1a1a", { metalness: 0.8 })); l.position.set(-8 + i * 0.7, 0.4, -10); l.rotation.y = i % 2 ? Math.PI / 2 : 0; chain.add(l); }
    g.add(chain);
    const pools: THREE.Mesh[] = [];
    for (const [x, z, r] of scatter(rand, 8, 9, 20)) { const p = new THREE.Mesh(new THREE.CircleGeometry(1 + r * 2, 20), glow("#6aff3a", 0.8, { transparent: true, opacity: 0.85 })); p.rotation.x = -Math.PI / 2; p.position.set(x, 0.03, z); g.add(p); pools.push(p); }
    const smoke = critters(g, rand, { count: 50, color: "#6aff6a", size: 0.6, radius: [9, 20], height: [0.2, 3], mode: "rise", speed: 0.3 });
    return make(g, col, {
      updates: [smoke.update, (t, dt) => { pools.forEach((p, i) => ((p.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + Math.sin(t * 2 + i) * 0.3)); fx.update(dt); }],
      inter: [spot("hoard", "Run your hands through the gold", 0, 1, -10, 3)],
      fx: { hoard: () => { sound.sfx("dice"); fx.burst(V(0, 1, -12), "#ffd84a", 60, 4); fx.flash(V(0, 2, -12), "#ffd84a", 20); } },
    });
  },

  barrow: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#3a3a40", ["#2a2a30", "#4a4a52"], 20));
    dome(g, "#2a2a2e", 30, 0.35);
    const stone = std("#4a4a52");
    const statues: THREE.Group[] = [];
    ring(16, 13).forEach((p) => {
      const s = new THREE.Group(); s.position.set(p.x, 0, p.z); s.rotation.y = -p.a - Math.PI / 2;
      s.add(box(0.9, 0.3, 0.9, stone, 0, 0.15, 0)); s.add(box(0.6, 1.2, 0.4, std("#3a3a44", { metalness: 0.6 }), 0, 1.0, 0)); s.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), std("#3a3a44", { metalness: 0.6 })), 0, 1.8, 0));
      s.add(box(0.08, 1.8, 0.08, std("#6a6a72", { metalness: 0.9 }), 0.35, 1.2, 0.25));
      s.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.05), basic("#6ab0ff")), 0.08, 1.85, 0.2)); s.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.05), basic("#6ab0ff")), -0.08, 1.85, 0.2));
      g.add(s); statues.push(s); col.push(aabb(p.x, p.z, 1, 1));
    });
    const braziers: THREE.PointLight[] = [];
    ring(6, 9, 0.25).forEach((p) => { g.add(cyl(0.5, 0.3, 1, std("#2a2a2a", { metalness: 0.7 }), p.x, 0.5, p.z, 10)); braziers.push(lamp(g, p.x, 1.3, p.z, "#5a9aff", 6, 10, 0.3).light); col.push(aabb(p.x, p.z, 1, 1)); });
    const motes = critters(g, rand, { count: 60, color: "#7ab8ff", size: 0.12, radius: [6, 20], height: [0.5, 6], mode: "hover" });
    return make(g, col, {
      enclosed: true,
      updates: [motes.update, (t, dt) => { braziers.forEach((l, i) => (l.intensity = 5 + Math.sin(t * 7 + i) * 1.5)); fx.update(dt); }],
      inter: [spot("brazier", "Stir the ghost-fire brazier", 9, 1, 0, 2.5)],
      fx: { brazier: () => { sound.sfx("spell"); braziers.forEach((l) => (l.intensity = 25)); fx.burst(V(9, 1.5, 0), "#7ab8ff", 50); statues.forEach((s, i) => setTimeout(() => (s.rotation.y += 0.3), i * 50)); } },
    });
  },

  throneroom: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#16161c", ["#0a0a10", "#26262e"], 16, { roughness: 0.6, metalness: 0.4 }));
    dome(g, "#0e0e14", 34, 0.5);
    const pillar = std("#22222a", { metalness: 0.4 });
    ring(12, 16).forEach((p) => { g.add(cyl(1.4, 1.6, 18, pillar, p.x, 9, p.z, 8)); col.push(aabb(p.x, p.z, 3, 3)); });
    const throne = new THREE.Group(); throne.position.set(0, 0, -22);
    throne.add(box(6, 1.5, 4, std("#1a1a1a"), 0, 0.75, 0));
    for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.15, 6, 12), std("#c9a14a", { metalness: 0.9 })); c.position.set(-2 + (i % 5), 2 + Math.floor(i / 5) * 1.2 + (i % 2) * 0.3, -1.4); throne.add(c); }
    throne.add(box(4, 6, 0.8, std("#1a1a1a"), 0, 4, -1.6));
    g.add(throne); col.push(aabb(0, -22, 7, 5));
    const mist = critters(g, rand, { count: 200, color: "#2a2238", size: 1.4, opacity: 0.35, radius: [4, 26], height: [0.1, 1.2], mode: "hover", glow: false });
    const bells: THREE.Mesh[] = [];
    ring(6, 11, 0.5).forEach((p) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1, 1.4, 14, 1, true, 0, Math.PI * 1.6), std("#5a4a2a", { metalness: 0.8, side: THREE.DoubleSide })); b.position.set(p.x, 8, p.z); g.add(b); g.add(cyl(0.03, 0.03, 10, std("#222"), p.x, 13.5, p.z, 4)); bells.push(b); });
    return make(g, col, {
      enclosed: true,
      updates: [mist.update, (t, dt) => { bells.forEach((b, i) => (b.rotation.y = t * 0.1 + i)); fx.update(dt); }],
      inter: [spot("deadbell", "Strike a broken bell", 11 * Math.cos(0.5), 1, 11 * Math.sin(0.5), 3)],
      fx: { deadbell: () => { sound.sfx("boom"); fx.ring(V(0, 0.2, 0), "#2a0a3a", 30, 2.5); } },
    });
  },

  // ============================== HOLLOW ==============================
  bugtown: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#2a2a3a", ["#1a1a2a", "#3a3a52", "#4a3a2a"], 20));
    dome(g, "#121420", 44, 0.4);
    const paper = ["#f0d8a8", "#e8c8f0", "#c8e8f0", "#f0c8c8"];
    const houses: THREE.Group[] = [];
    ring(12, 15, 0.1).forEach((p, i) => {
      const h = new THREE.Group(); h.position.set(p.x, 0, p.z); h.rotation.y = -p.a;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 3.2, 8), glow(paper[i % 4], 0.45, { transparent: true, opacity: 0.92 }));
      body.position.y = 1.6; h.add(body);
      h.add(at(new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.6, 8), std("#5a3a2a")), 0, 4, 0));
      h.add(box(0.7, 1.2, 0.1, std("#3a2412"), 0, 0.6, 1.95));
      g.add(h); houses.push(h); col.push(aabb(p.x, p.z, 4, 4));
    });
    const lanterns: THREE.Mesh[] = [];
    for (const [x, z, r] of scatter(rand, 40, 8, 22)) { const y = 5 + r * 6; g.add(cyl(0.01, 0.01, 12 - y, std("#333"), x, y + (12 - y) / 2, z, 3)); const l = new THREE.Mesh(new THREE.SphereGeometry(0.3 + r * 0.2, 10, 8), glow(paper[Math.floor(r * 4)], 1.2)); l.position.set(x, y, z); g.add(l); lanterns.push(l); }
    // the great lantern (north)
    const great = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), glow("#9fd4ff", 2.5));
    great.position.set(0, 7, -12); g.add(great);
    const greatLight = new THREE.PointLight("#9fd4ff", 25, 40, 1.4); greatLight.position.copy(great.position); g.add(greatLight);
    g.add(cyl(0.2, 0.3, 6, std("#3a2a1a"), 0, 3, -12, 8)); col.push(aabb(0, -12, 1, 1));
    const mothRoot = new THREE.Group(); mothRoot.position.set(0, 0, -12); g.add(mothRoot);
    const moths = critters(mothRoot, rand, { count: 26, color: "#f2e8d0", size: 0.25, radius: [1.5, 4], height: [5, 9], mode: "orbit", shape: "bird", speed: 2 });
    const spores = critters(g, rand, { count: 120, color: "#d8f0ff", size: 0.12, radius: [6, 30], height: [1, 12], mode: "fall", speed: 0.4 });
    let boost = 0;
    return make(g, col, {
      enclosed: true,
      updates: [spores.update, (t, dt) => { moths.update(t, dt); great.rotation.y = t * 0.5; boost = Math.max(0, boost - dt * 0.5); greatLight.intensity = 22 + Math.sin(t * 3) * 4 + boost * 60; lanterns.forEach((l, i) => (l.position.x += Math.sin(t + i) * 0.002)); fx.update(dt); }],
      inter: [spot("greatlantern", "Feed the Great Lantern a little soul", 0, 1, -10, 3)],
      fx: { greatlantern: () => { boost = 1; sound.sfx("heal"); fx.burst(V(0, 7, -12), "#9fd4ff", 80, 6); fx.ring(V(0, 0.1, -12), "#9fd4ff", 25); moths.scare(); } },
    });
  },

  fungal: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#2a2234", ["#3a2a4a", "#1a1a24", "#4a3a5a"], 22));
    dome(g, "#100c16", 46, 0.38);
    const caps = ["#c06ad0", "#d0a03a", "#6ad0c0", "#d04a6a"];
    const puffs: THREE.Mesh[] = [];
    for (const [x, z, r] of scatter(rand, 45, 9, 40)) {
      const h = 2 + r * 9;
      g.add(cyl(0.3 + r * 0.5, 0.5 + r * 0.6, h, std("#e8dcc8"), x, h / 2, z, 10));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.5 + r * 3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glow(caps[Math.floor(r * 4)], 0.35));
      cap.position.set(x, h, z); cap.scale.y = 0.6; cap.castShadow = true; g.add(cap);
      for (let k = 0; k < 5; k++) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.15 + r * 0.2, 8, 6), glow("#ffffff", 1)), x + Math.cos(k * 1.3) * (1 + r * 2), h + 0.4 + r, z + Math.sin(k * 1.3) * (1 + r * 2)));
      col.push(aabb(x, z, 1.4, 1.4));
    }
    for (const [x, z, r] of scatter(rand, 14, 7.5, 18)) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.5 + r * 0.4, 14, 10), glow("#c8a0ff", 0.8, { transparent: true, opacity: 0.85 })); p.position.set(x, 0.5, z); g.add(p); puffs.push(p); }
    const spores = critters(g, rand, { count: 160, color: "#e8b0ff", size: 0.15, radius: [6, 30], height: [0.5, 10], mode: "hover" });
    return make(g, col, {
      enclosed: true,
      updates: [spores.update, (t, dt) => { puffs.forEach((p, i) => p.scale.setScalar(1 + Math.sin(t * 1.5 + i) * 0.12)); fx.update(dt); }],
      inter: [spot("puff", "Poke a puffball", puffs[0]?.position.x ?? 8, 1, puffs[0]?.position.z ?? 0, 2.2)],
      fx: { puff: () => { sound.sfx("miss"); const p = puffs[0]?.position ?? V(8, 0, 0); fx.burst(p.clone(), "#e8b0ff", 80, 4, 2.2); spores.scare(); } },
    });
  },

  aqueduct: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#3a4048", ["#2a3038", "#4a5058"], 18));
    dome(g, "#14181e", 44, 0.4);
    const stone = std("#6a6e74");
    const flows: THREE.Mesh[] = [];
    ring(6, 18).forEach((p) => {
      for (let k = -2; k <= 2; k++) { const x = p.x + Math.cos(p.a + Math.PI / 2) * k * 3, z = p.z + Math.sin(p.a + Math.PI / 2) * k * 3; g.add(box(1, 8, 1, stone, x, 4, z)); col.push(aabb(x, z, 1.2, 1.2)); }
      const top = box(16, 1, 2.4, stone, p.x, 8.5, p.z); top.rotation.y = -p.a + Math.PI / 2; g.add(top);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 8.5), new THREE.MeshBasicMaterial({ map: canvasTex(32, 128, (c) => { for (let y = 0; y < 128; y++) { c.fillStyle = `rgba(${90 + Math.random() * 60},${200 + Math.random() * 55},${120 + Math.random() * 40},0.7)`; c.fillRect(0, y, 32, 1); } }, [1, 2]), transparent: true, side: THREE.DoubleSide }));
      fl.position.set(p.x * 0.97, 4.25, p.z * 0.97); fl.lookAt(0, 4.25, 0); g.add(fl); flows.push(fl);
    });
    const pool = water(g, "#1a3a2a", 0.03, 60, "#1a5a2a");
    const drips = critters(g, rand, { count: 80, color: "#9aff9a", size: 0.1, radius: [10, 22], height: [8, 8], mode: "fall", speed: 3 });
    const sluice = box(1.5, 2.5, 0.4, std("#4a3a2a", { metalness: 0.6 }), 8, 1.25, 8); g.add(sluice); col.push(aabb(8, 8, 1.6, 0.6));
    void pool;
    return make(g, col, {
      enclosed: true,
      updates: [drips.update, (t, dt) => { flows.forEach((f) => { const m = (f.material as THREE.MeshBasicMaterial).map!; m.offset.y -= dt * 0.8; }); fx.update(dt); }],
      inter: [spot("sluice", "Heave the sluice gate", 8, 1, 7)],
      fx: { sluice: () => { sound.sfx("splash"); sluice.position.y = 2.8; setTimeout(() => (sluice.position.y = 1.25), 2500); fx.burst(V(8, 0.5, 8.5), "#9affb0", 90, 5); fx.ring(V(8, 0.1, 8), "#9affb0", 12); } },
    });
  },

  silk: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#2a2838", ["#1a1828", "#3a3848"], 20));
    dome(g, "#100e18", 44, 0.45);
    const silkM = new THREE.LineBasicMaterial({ color: "#e8e0ff", transparent: true, opacity: 0.55 });
    const strands: THREE.Line[] = [];
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2, b = a + (rand() - 0.5) * 2;
      const r1 = 8 + rand() * 30, r2 = 8 + rand() * 30;
      const geo = new THREE.BufferGeometry().setFromPoints([V(Math.cos(a) * r1, rand() * 16, Math.sin(a) * r1), V(Math.cos(b) * r2, 4 + rand() * 14, Math.sin(b) * r2)]);
      const l = new THREE.Line(geo, silkM); g.add(l); strands.push(l);
    }
    // radial web overhead
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 15, 0), V(Math.cos(a) * 34, 6, Math.sin(a) * 34)]), silkM)); }
    for (let r = 6; r < 34; r += 5) { const pts = Array.from({ length: 33 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return V(Math.cos(a) * r, 15 - r * 0.27, Math.sin(a) * r); }); g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), silkM)); }
    const cocoons: THREE.Mesh[] = [];
    for (const [x, z, r] of scatter(rand, 30, 9, 26)) { const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.5 + r * 0.4, 1 + r, 6, 10), glow("#f0e8ff", 0.25 + r * 0.6)); c.position.set(x, 3 + r * 8, z); g.add(c); cocoons.push(c); g.add(cyl(0.01, 0.01, 14, std("#ddd"), x, c.position.y + 7, z, 3)); }
    const climbers = critters(g, rand, { count: 8, color: "#1a1a22", size: 0.5, radius: [10, 20], height: [2, 12], mode: "hover", shape: "box", glow: false });
    for (const [x, z] of scatter(rand, 8, 9, 16)) lamp(g, x, 2.5, z, "#d8c8ff", 3, 8, 0.12);
    let shake = 0;
    return make(g, col, {
      enclosed: true,
      updates: [climbers.update, (t, dt) => { shake = Math.max(0, shake - dt); cocoons.forEach((c, i) => (c.rotation.z = Math.sin(t * (1 + shake * 10) + i) * (0.05 + shake * 0.3))); strands.forEach((s, i) => (s.position.y = Math.sin(t * 20 + i) * shake * 0.15)); fx.update(dt); }],
      inter: [spot("pluck", "Pluck a web strand", 9, 1, 3)],
      fx: { pluck: () => { shake = 2; sound.sfx("chime"); climbers.scare(); } },
    });
  },

  bloomroad: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(9, 7, 3, 24), std("#4a4054", { flatShading: true })); plat.position.y = -1.5; g.add(plat);
    const abyss = new THREE.Mesh(new THREE.CircleGeometry(80, 32), basic("#020206")); abyss.rotation.x = -Math.PI / 2; abyss.position.y = -40; g.add(abyss);
    const root = std("#6a5a6a", { flatShading: true });
    for (const p of ring(7, 20)) { const curve = new THREE.CatmullRomCurve3([V(p.x * 0.5, -1, p.z * 0.5), V(p.x, 6, p.z), V(p.x * 1.6, -5, p.z * 1.6)]); g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.9, 8), root)); }
    const flowerM = new THREE.MeshStandardMaterial({ color: "#f8f2ff", emissive: new THREE.Color("#d8c8ff"), emissiveIntensity: 0.6, side: THREE.DoubleSide });
    const flowers: THREE.Object3D[] = [];
    for (const [x, z, r] of scatter(rand, 40, 7, 8.8)) { const f = new THREE.Group(); f.position.set(x, 0, z); for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.25 + r * 0.2, 6), flowerM); p.position.y = 0.4; p.rotation.set(-1, (k / 5) * Math.PI * 2, 0); f.add(p); } g.add(f); flowers.push(f); }
    const petals = critters(g, rand, { count: 160, color: "#f0e8ff", size: 0.2, radius: [4, 30], height: [0, 20], mode: "fall", speed: 0.5 });
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; col.push(aabb(Math.cos(a) * 9.6, Math.sin(a) * 9.6, 2, 2)); }
    return make(g, col, {
      updates: [petals.update, (t, dt) => { flowers.forEach((f, i) => (f.rotation.y = Math.sin(t + i) * 0.3)); fx.update(dt); }],
      inter: [spot("bloomflower", "Breathe in a pale flower (why?)", 6, 1, 2, 2)],
      fx: { bloomflower: () => { sound.sfx("spell"); fx.burst(V(6, 0.6, 2), "#f8f0ff", 100, 3, 2.5); fx.flash(V(6, 2, 2), "#e8d8ff", 20); } },
    });
  },

  crystal: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#1a1c2a", ["#2a2c4a", "#101220"], 18, { roughness: 0.6, metalness: 0.4 }));
    dome(g, "#0c0e18", 40, 0.45);
    const tints = ["#9ae0ff", "#ff9ae0", "#c89aff", "#9affc8"];
    const singers: THREE.Mesh[] = [];
    for (const [x, z, r] of scatter(rand, 60, 8, 36)) {
      const cl = new THREE.Group(); cl.position.set(x, 0, z);
      for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.6 + r * 1.8, 0), glow(tints[(k + Math.floor(r * 4)) % 4], 0.7, { transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.2 })); c.scale.y = 2.5; c.position.set((rand() - 0.5) * 1.5, 0.8 + r, (rand() - 0.5) * 1.5); c.rotation.set((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6); cl.add(c); if (k === 0) singers.push(c); }
      g.add(cl); if (r > 0.3) col.push(aabb(x, z, 1.8, 1.8));
    }
    for (let i = 0; i < 5; i++) { const a = i * 1.25; lamp(g, Math.cos(a) * 14, 4, Math.sin(a) * 14, tints[i % 4], 8, 18, 0.01); }
    const motes = critters(g, rand, { count: 100, color: "#d8f0ff", size: 0.1, radius: [5, 30], height: [0.5, 10], mode: "hover" });
    let song = 0;
    return make(g, col, {
      enclosed: true,
      updates: [motes.update, (t, dt) => { song = Math.max(0, song - dt * 0.4); singers.forEach((c, i) => ((c.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(t * 2 + i) * 0.2 + song * (1 + Math.sin(t * 20 + i)))); fx.update(dt); }],
      inter: [spot("sing", "Hum to the crystals", 9, 1, -4)],
      fx: { sing: () => { song = 2; [0, 1, 2, 3].forEach((k) => setTimeout(() => sound.sfx("chime"), k * 180)); fx.ring(V(0, 0.1, 0), "#c89aff", 35, 2); } },
    });
  },

  garden: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#3a5a3a", ["#2a4a2a", "#4a6a3a", "#e8e0f0"], 24));
    dome(g, "#141a16", 44, 0.42);
    const hedge = std("#2a5a2a");
    for (const p of ring(24, 17)) { const h = box(3.6, 2, 1.2, hedge, p.x, 1, p.z); h.rotation.y = -p.a + Math.PI / 2; g.add(h); col.push(aabb(p.x, p.z, 2.6, 2.6)); }
    const topiary: THREE.Mesh[] = [];
    ring(6, 11, 0.3).forEach((p, i) => { const t = new THREE.Mesh(i % 2 ? new THREE.SphereGeometry(1.3, 14, 10) : new THREE.ConeGeometry(1.2, 3, 10), hedge); t.position.set(p.x, 1.5, p.z); g.add(t); topiary.push(t); col.push(aabb(p.x, p.z, 2.4, 2.4)); g.add(cyl(0.6, 0.7, 0.6, std("#a89a8a"), p.x, 0.3, p.z)); });
    const bloomM = glow("#f8f0ff", 0.5);
    for (const [x, z] of scatter(rand, 120, 8, 30)) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), bloomM), x, 0.2, z));
    const fountain = new THREE.Group(); fountain.position.set(0, 0, -13);
    fountain.add(cyl(3, 3.2, 0.8, std("#a8a090"), 0, 0.4, 0, 24)); fountain.add(cyl(0.4, 0.5, 2.5, std("#a8a090"), 0, 1.6, 0, 12)); fountain.add(cyl(1.4, 1.2, 0.4, std("#a8a090"), 0, 2.9, 0, 18));
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2, 12, 1, true), basic("#bfe8ff", { transparent: true, opacity: 0.4 })); jet.position.y = 4; fountain.add(jet);
    g.add(fountain); col.push(aabb(0, -13, 6.4, 6.4));
    const butterflies = critters(g, rand, { count: 30, color: "#ffd0f0", size: 0.2, radius: [8, 20], height: [0.5, 3], mode: "hover", shape: "bird", speed: 1.5 });
    lamp(g, 0, 10, 0, "#e8f0d8", 10, 40, 0.01);
    return make(g, col, {
      enclosed: true,
      updates: [butterflies.update, (t, dt) => { jet.scale.y = 1 + Math.sin(t * 4) * 0.1; topiary.forEach((tp, i) => (tp.rotation.y = Math.sin(t * 0.5 + i) * 0.1)); fx.update(dt); }],
      inter: [spot("fountain", "Splash in the old fountain", 0, 1, -9.5, 3)],
      fx: { fountain: () => { sound.sfx("splash"); jet.scale.set(2, 3, 2); setTimeout(() => jet.scale.set(1, 1, 1), 1200); fx.burst(V(0, 4, -13), "#bfe8ff", 90, 5); butterflies.scare(); } },
    });
  },

  palace: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#e8e4dc", ["#d8d4cc", "#f8f4ec", "#c8c4bc"], 12, { roughness: 0.2, metalness: 0.1 }));
    const white = std("#f4f0e8", { roughness: 0.4 });
    ring(14, 14).forEach((p) => { g.add(cyl(0.8, 0.9, 14, white, p.x, 7, p.z, 16)); g.add(box(2, 0.6, 2, white, p.x, 14.2, p.z)); col.push(aabb(p.x, p.z, 1.8, 1.8)); });
    g.add(cyl(26, 26, 0.6, std("#e8e4dc"), 0, 14.8, 0, 32));
    const moon = new THREE.Mesh(new THREE.CircleGeometry(4, 32), basic("#fff8e0")); moon.position.set(0, 9, -24); g.add(moon);
    g.add(lamp(g, 0, 9, -22, "#fff8e0", 30, 50, 0.01).light);
    const chandelier = new THREE.Group(); chandelier.position.set(0, 12, 0);
    chandelier.add(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 8, 32), std("#c9a14a", { metalness: 0.9 })));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; chandelier.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.12), basic("#fff2c0")), Math.cos(a) * 2.4, 0.2, Math.sin(a) * 2.4)); }
    chandelier.rotation.x = Math.PI / 2; g.add(chandelier);
    g.add(cyl(0.02, 0.02, 3, std("#888"), 0, 13.5, 0, 4));
    ring(8, 13, 0.2).forEach((p, i) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5), std(i % 2 ? "#3a4a8a" : "#e8d8a0", { side: THREE.DoubleSide })); b.position.set(p.x * 0.95, 9, p.z * 0.95); b.lookAt(0, 9, 0); g.add(b); });
    const petals = critters(g, rand, { count: 60, color: "#ffffff", size: 0.15, radius: [4, 20], height: [0, 14], mode: "fall", speed: 0.3 });
    let swing = 0;
    return make(g, col, {
      enclosed: true,
      updates: [petals.update, (t, dt) => { swing *= 0.99; chandelier.rotation.z = Math.sin(t * 2) * swing; fx.update(dt); }],
      inter: [spot("chandelier", "Swing on the chandelier rope", 2, 1, 8, 3)],
      fx: { chandelier: () => { swing = 0.4; sound.sfx("chime"); fx.burst(V(0, 12, 0), "#fff2c0", 40, 3); } },
    });
  },

  radiance: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#fff8e0", ["#fff0c0", "#ffffff", "#f8e8a0"], 12, { emissive: new THREE.Color("#ffe8a0"), emissiveIntensity: 0.4 }));
    const pillars: THREE.Mesh[] = [];
    ring(10, 18).forEach((p) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 40, 12, 1, true), basic("#fffbe8", { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.position.set(p.x, 20, p.z); g.add(m); pillars.push(m); });
    const rootCurve = new THREE.CatmullRomCurve3([V(0, -2, -22), V(2, 8, -20), V(-2, 18, -22), V(0, 40, -21)]);
    const root = new THREE.Mesh(new THREE.TubeGeometry(rootCurve, 40, 2.2, 12), glow("#ffffff", 2)); g.add(root); col.push(aabb(0, -21, 5, 5));
    const motes = critters(g, rand, { count: 200, color: "#fff2a0", size: 0.25, radius: [4, 30], height: [0, 16], mode: "rise", speed: 0.4 });
    const petals = critters(g, rand, { count: 60, color: "#ffffff", size: 0.2, radius: [4, 20], height: [0, 16], mode: "fall", speed: 0.4 });
    lamp(g, 0, 12, -18, "#fff0c0", 40, 60, 0.01);
    return make(g, col, {
      updates: [motes.update, petals.update, (t, dt) => { pillars.forEach((p, i) => ((p.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 1.2 + i) * 0.12)); root.rotation.y = Math.sin(t * 0.3) * 0.05; fx.update(dt); }],
      inter: [spot("touchlight", "Reach into the light", 0, 1, -17, 3.5)],
      fx: { touchlight: () => { sound.sfx("spell"); fx.flash(V(0, 4, -18), "#ffffff", 80, 1.5); fx.ring(V(0, 0.1, -18), "#fff8c0", 40, 2.5); } },
    });
  },

  // ============================== NEON ==============================
  neonbar: (rand) => interior(rand, {
    floor: "#2a1a2a", wall: "#1a1222", accent: ["#ff3fa4", "#3af0ff", "#ffd23a"], signs: ["NOODLES", "OPEN 25H", "LUCKY", "NO CHROME ON TABLES"], rain: true, booths: true,
    machine: { id: "arcade", label: "Play 'Saint Blaster 3000'", color: "#3af0ff" },
  }),
  club: (rand) => interior(rand, {
    floor: "#120a1a", wall: "#08060e", accent: ["#ff3aff", "#3af0ff", "#7a5cff"], signs: ["DATA HAVEN", "JACK IN", "NO MEAT ALLOWED"], dancefloor: true, lasers: true,
    machine: { id: "drop", label: "Drop the beat", color: "#ff3aff" },
  }),
  gangden: (rand) => {
    const b = interior(rand, { floor: "#1a1418", wall: "#120e14", accent: ["#ff3fa4", "#ffd23a"], signs: ["CHROME SAINTS", "SANTA LUCÍA PROTEGE"], pews: true, machine: { id: "holosaint", label: "Light a candle for Saint Lucía", color: "#ffd23a" } });
    const statue = new THREE.Group(); statue.position.set(0, 0, -12);
    statue.add(box(2, 1, 2, std("#3a3a44", { metalness: 0.8 }), 0, 0.5, 0)); statue.add(cyl(0.6, 0.9, 3.2, std("#c8c8d8", { metalness: 1, roughness: 0.15 }), 0, 2.6, 0, 12)); statue.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), std("#c8c8d8", { metalness: 1, roughness: 0.15 })), 0, 4.6, 0));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 32), glow("#ffd23a", 3)); halo.position.set(0, 5, -0.2); statue.add(halo);
    b.group.add(statue); b.colliders.push(aabb(0, -12, 2.4, 2.4));
    const prev = b.update!;
    b.update = (t, dt) => { prev(t, dt); halo.rotation.z = t; };
    return b;
  },
  garage: (rand) => {
    const b = interior(rand, { floor: "#2a2a2e", wall: "#1a1a1e", accent: ["#ffa03a", "#3af0ff"], signs: ["RIPPER'S AUTO", "NO REFUNDS"], machine: { id: "horn", label: "Honk DOLLY's horn", color: "#ff3a3a" } });
    const car = new THREE.Group(); car.position.set(-10, 0, -6); car.rotation.y = 0.6;
    car.add(box(4, 0.9, 1.9, std("#c8202a", { metalness: 0.6, roughness: 0.3 }), 0, 0.75, 0)); car.add(box(2.2, 0.7, 1.7, std("#c8202a", { metalness: 0.6, roughness: 0.3 }), -0.2, 1.5, 0));
    for (const [wx, wz] of [[-1.3, 0.95], [1.3, 0.95], [-1.3, -0.95], [1.3, -0.95]]) { const w = cyl(0.4, 0.4, 0.3, std("#111"), wx, 0.4, wz, 14); w.rotation.x = Math.PI / 2; car.add(w); }
    const lights = [at(new THREE.Mesh(new THREE.SphereGeometry(0.15), basic("#fff8c0")), 2, 0.9, 0.6), at(new THREE.Mesh(new THREE.SphereGeometry(0.15), basic("#fff8c0")), 2, 0.9, -0.6)];
    car.add(...lights); b.group.add(car); b.colliders.push(aabb(-10, -6, 4.4, 4.4));
    const sparks = critters(b.group, rand, { count: 40, color: "#ffc03a", size: 0.1, radius: [11, 12], height: [0, 2], mode: "fall", speed: 4 });
    const prev = b.update!;
    b.update = (t, dt) => { prev(t, dt); sparks.update(t, dt); };
    return b;
  },
  lab: (rand) => interior(rand, { floor: "#e8ecf0", wall: "#d8dde4", accent: ["#3aff8a", "#3ac8ff"], signs: ["PROJECT LAZARUS", "SMILE: YOU ARE PROPERTY"], tubes: true, bright: true, machine: { id: "alarm", label: "Press the big red button", color: "#ff2a2a" } }),
  sewer: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#2a2e28", ["#1a1e18", "#3a3e30"], 20));
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 70, 32, 1, true, 0, Math.PI), std("#3a3a34", { side: THREE.BackSide, map: canvasTex(128, 128, (c) => { c.fillStyle = "#4a4a40"; c.fillRect(0, 0, 128, 128); c.strokeStyle = "#2a2a24"; for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 32) c.strokeRect(x + (y % 32 ? 16 : 0), y, 32, 16); }, [12, 6]) }));
    tunnel.rotation.z = Math.PI / 2; tunnel.position.y = 0; g.add(tunnel);
    for (const side of [-1, 1]) { const ch = new THREE.Mesh(new THREE.PlaneGeometry(4, 70), glow("#4aff3a", 0.25, { transparent: true, opacity: 0.85, roughness: 0.1 })); ch.rotation.x = -Math.PI / 2; ch.position.set(side * 12, 0.03, 0); g.add(ch); }
    for (let z = -30; z < 30; z += 6) for (const side of [-1, 1]) { const pipe = cyl(0.4, 0.4, 8, std("#5a4a3a", { metalness: 0.6 }), side * 20, 8 + (z % 12 === 0 ? 2 : 0), z, 10); pipe.rotation.z = Math.PI / 2; g.add(pipe); }
    for (let z = -28; z < 30; z += 8) lamp(g, 0, 12, z, "#c8ff9a", 12, 20, 0.15);
    const rats = critters(g, rand, { count: 14, color: "#5a5048", size: 0.18, radius: [8, 16], height: [0, 0], mode: "scurry", shape: "box" });
    const ratEyes = critters(g, rand, { count: 30, color: "#ff2020", size: 0.08, radius: [17, 20], height: [1, 8], mode: "hover" });
    const drips = critters(g, rand, { count: 60, color: "#9aff6a", size: 0.08, radius: [5, 20], height: [14, 14], mode: "fall", speed: 3 });
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.1, 8, 16), std("#c83a3a", { metalness: 0.7 })); valve.position.set(9, 1.3, -6); g.add(valve); g.add(cyl(0.15, 0.15, 1.3, std("#5a4a3a"), 9, 0.65, -6, 8));
    for (let i = 0; i < 40; i++) col.push(aabb(i < 20 ? -22 : 22, -35 + (i % 20) * 3.5, 4, 4));
    return make(g, col, {
      enclosed: true,
      updates: [rats.update, ratEyes.update, drips.update, (t, dt) => fx.update(dt)],
      inter: [spot("valve", "Spin the rusty valve", 9, 1, -6)],
      fx: { valve: () => { sound.sfx("zap"); valve.rotation.z += 3; fx.burst(V(9, 1.5, -6), "#e8e8e8", 120, 4, 2.5); rats.scare(); } },
    });
  },
  cyberspace: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    const grid = new THREE.GridHelper(120, 120, "#ff3aff", "#3af0ff"); (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.5; g.add(grid);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 32), basic("#05020a")); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; g.add(floor);
    const cubes: THREE.Mesh[] = [];
    for (const [x, z, r] of scatter(rand, 70, 10, 45)) { const c = new THREE.Mesh(new THREE.BoxGeometry(1 + r * 3, 1 + r * 3, 1 + r * 3), new THREE.MeshBasicMaterial({ color: r > 0.5 ? "#3af0ff" : "#ff3aff", wireframe: true })); c.position.set(x, 2 + r * 14, z); g.add(c); cubes.push(c); }
    for (const p of ring(10, 28)) { const h = 14 + Math.abs(Math.sin(p.a * 3)) * 24; const tw = new THREE.Mesh(new THREE.BoxGeometry(3, h, 3), new THREE.MeshBasicMaterial({ color: "#7a5cff", wireframe: true })); tw.position.set(p.x, h / 2, p.z); g.add(tw); }
    const cathedral = new THREE.Mesh(new THREE.ConeGeometry(8, 30, 4, 1, true), new THREE.MeshBasicMaterial({ color: "#ffffff", wireframe: true, transparent: true, opacity: 0.6 })); cathedral.position.set(0, 15, -30); g.add(cathedral);
    const data = critters(g, rand, { count: 200, color: "#3af0ff", size: 0.2, radius: [3, 40], height: [0, 20], mode: "rise", speed: 1.5 });
    const banner = sign("BY PROCEEDING YOU AGREE TO OUR TERMS", "#ff3aff", 16, 1.6); banner.position.set(0, 10, -18); g.add(banner);
    return make(g, col, {
      updates: [data.update, (t, dt) => { cubes.forEach((c, i) => { c.rotation.x = t * 0.3 + i; c.rotation.y = t * 0.2 + i; }); cathedral.rotation.y = t * 0.1; grid.position.z = (t * 2) % 1; fx.update(dt); }],
      inter: [spot("node", "Poke a data node", 8, 1, 4)],
      fx: { node: () => { sound.sfx("zap"); fx.burst(V(8, 1, 4), "#3af0ff", 120, 6); fx.ring(V(0, 0.05, 0), "#ff3aff", 40, 1.5); data.scare(); } },
    });
  },
  docks: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    water(g, "#0a1420", -0.4);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(70, 1, 40), std("#3a3a40", { roughness: 0.8, metalness: 0.2 })); deck.position.set(0, -0.5, 6); g.add(deck);
    const cont = ["#c83a2a", "#2a6ac8", "#e8b23a", "#3a9a5a", "#e8e8e8"];
    for (const [x, z, r] of scatter(rand, 40, 11, 26)) { if (z < -12) continue; const stack = 1 + Math.floor(r * 3); for (let k = 0; k < stack; k++) { const c = box(6, 2.6, 2.4, std(cont[(Math.floor(r * 10) + k) % 5], { metalness: 0.4, roughness: 0.6 }), x, 1.3 + k * 2.6, z); c.rotation.y = Math.round(r * 2) * Math.PI / 2; g.add(c); } col.push(aabb(x, z, 6.2, 6.2)); }
    const cranes: THREE.Group[] = [];
    for (const x of [-18, 18]) {
      const cr = new THREE.Group(); cr.position.set(x, 0, -14);
      for (const sx of [-2, 2]) cr.add(box(0.6, 24, 0.6, std("#e8a03a"), sx, 12, 0));
      const arm = new THREE.Group(); arm.position.y = 24; arm.add(box(28, 1, 1, std("#e8a03a"), 6, 0, 0)); arm.add(cyl(0.05, 0.05, 12, std("#222"), 16, -6, 0, 4)); arm.add(box(3, 1.5, 2, std("#c83a2a"), 16, -12, 0));
      cr.add(arm); g.add(cr); cranes.push(arm); col.push(aabb(x, -14, 5, 2));
    }
    const ship = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 12), std("#1a1a24")); ship.position.set(0, 2, -30); g.add(ship);
    for (let i = 0; i < 8; i++) lamp(g, -28 + i * 8, 6, -24, "#ffd0a0", 4, 14, 0.2);
    const gulls = critters(g, rand, { count: 8, color: "#e8e8e8", size: 0.5, radius: [10, 30], height: [12, 20], mode: "orbit", shape: "bird" });
    let horn = 0;
    return make(g, col, {
      updates: [gulls.update, (t, dt) => { horn = Math.max(0, horn - dt); cranes.forEach((a, i) => (a.rotation.y = Math.sin(t * 0.15 + i * 2) * 0.8 + horn * Math.sin(t * 6) * 0.1)); fx.update(dt); }],
      inter: [spot("cranehorn", "Sound the crane horn", -18, 1, -11, 3)],
      fx: { cranehorn: () => { horn = 2; sound.sfx("horn"); gulls.scare(); fx.ring(V(-18, 0.1, -14), "#ffd0a0", 25); } },
    });
  },
  penthouse: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#1a1a20", ["#101016", "#2a2a32"], 10, { roughness: 0.6, metalness: 0.5 }, 22));
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 10, 32, 1, true), new THREE.MeshStandardMaterial({ color: "#7aa0c8", transparent: true, opacity: 0.18, roughness: 0, metalness: 0.9, side: THREE.DoubleSide })); glass.position.y = 5; g.add(glass);
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; col.push(aabb(Math.cos(a) * 22.5, Math.sin(a) * 22.5, 3, 3)); }
    const winTex = canvasTex(64, 128, (c) => { c.fillStyle = "#06070c"; c.fillRect(0, 0, 64, 128); for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) { c.fillStyle = Math.random() > 0.6 ? ["#ffd27a", "#7af0ff", "#ff7ad9"][Math.floor(Math.random() * 3)] : "#10121a"; c.fillRect(x, y, 4, 5); } });
    for (const [x, z, r] of scatter(rand, 70, 40, 90)) { const h = 20 + r * 60; const m = new THREE.MeshBasicMaterial({ map: winTex }); const b = new THREE.Mesh(new THREE.BoxGeometry(6, h, 6), m); b.position.set(x, h / 2 - 50, z); g.add(b); }
    const desk = box(5, 1, 2.4, std("#3a3440", { metalness: 0.8, roughness: 0.2 }), 0, 0.5, -14); g.add(desk); col.push(aabb(0, -14, 5.4, 2.8));
    const cars = critters(g, rand, { count: 14, color: "#ff3fa4", size: 0.9, radius: [30, 60], height: [-10, 6], mode: "orbit", shape: "box", glow: true });
    lamp(g, 0, 8, 0, "#e8f0ff", 10, 30, 0.01);
    const bottle = cyl(0.1, 0.12, 0.5, std("#2a5a2a"), 1.5, 1.25, -14, 10); g.add(bottle);
    return make(g, col, {
      updates: [cars.update, (t, dt) => fx.update(dt)],
      inter: [spot("champagne", "Pop Mr. Vale's champagne", 1.5, 1, -12)],
      fx: { champagne: () => { sound.sfx("miss"); fx.burst(V(1.5, 1.5, -14), "#fff8c0", 80, 3); } },
    });
  },
  datacore: (rand) => {
    const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
    g.add(ground("#05060c", ["#0a0c18", "#101428"], 10, { roughness: 0.6, metalness: 0.6 }));
    dome(g, "#03040a", 40, 0.6);
    const eye = new THREE.Group(); eye.position.set(0, 12, -22);
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(6, 32, 24), std("#e8eef8", { roughness: 0.2 })));
    const iris = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), glow("#3af0ff", 2)); iris.position.z = 5.9; eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), basic("#000")); pupil.position.z = 6; eye.add(pupil);
    g.add(eye);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(10 + i * 4, 0.08, 6, 64), glow(i % 2 ? "#3af0ff" : "#ffffff", 2)); r.position.copy(eye.position); g.add(r); rings.push(r); }
    const streams = critters(g, rand, { count: 240, color: "#3af0ff", size: 0.15, radius: [8, 34], height: [0, 30], mode: "rise", speed: 2 });
    lamp(g, 0, 10, -14, "#3af0ff", 30, 50, 0.01);
    let blink = 0;
    return make(g, col, {
      enclosed: true,
      updates: [streams.update, (t, dt) => { rings.forEach((r, i) => { r.rotation.x = t * (0.2 + i * 0.1); r.rotation.y = t * (0.15 - i * 0.05); }); blink = Math.max(0, blink - dt * 3); eye.scale.y = 1 - blink * 0.9; iris.position.x = Math.sin(t * 0.7) * 1.5; pupil.position.x = iris.position.x; fx.update(dt); }],
      inter: [spot("stare", "Stare back at ORACLE", 0, 1, -12, 4)],
      fx: { stare: () => { blink = 1; sound.sfx("zap"); fx.flash(V(0, 12, -16), "#3af0ff", 60); fx.ring(V(0, 0.1, -10), "#3af0ff", 40, 2); } },
    });
  },
};

/** Shared builder for neon interiors: bars, clubs, labs, garages, gang chapels. */
function interior(rand: () => number, o: {
  floor: string; wall: string; accent: string[]; signs: string[]; machine: { id: string; label: string; color: string };
  rain?: boolean; booths?: boolean; dancefloor?: boolean; lasers?: boolean; tubes?: boolean; pews?: boolean; bright?: boolean;
}): Built {
  const g = new THREE.Group(); const col: Collider[] = []; const fx = new Fx(g);
  const R = 18;
  g.add(ground(o.floor, [o.wall, "#000000", o.accent[0]], 16, { roughness: 0.75, metalness: 0.15 }, R + 1));
  const walls = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 9, 24, 1, true), std(o.wall, { side: THREE.BackSide, emissive: new THREE.Color(o.accent[0]), emissiveIntensity: 0.04 }));
  walls.position.y = 4.5; g.add(walls);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(R, 24), std(o.wall)); ceil.rotation.x = Math.PI / 2; ceil.position.y = 9; g.add(ceil);
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; col.push(aabb(Math.cos(a) * (R + 0.5), Math.sin(a) * (R + 0.5), 3, 3)); }
  const signs: THREE.Mesh[] = [];
  ring(o.signs.length * 2, R - 0.3, 0.3).forEach((p, i) => { const s = sign(o.signs[i % o.signs.length], o.accent[i % o.accent.length], 4.5, 1.4); s.position.set(p.x, 5.5, p.z); s.lookAt(0, 5.5, 0); g.add(s); signs.push(s); });
  const lights: THREE.PointLight[] = [];
  ring(8, 12, 0.5).forEach((p, i) => lights.push(lamp(g, p.x, 7.5, p.z, o.accent[i % o.accent.length], o.bright ? 14 : 12, 18, 0.12).light));
  if (!o.bright) lamp(g, 0, 8.5, 0, "#ffe8d0", 10, 30, 0.01);
  if (o.bright) lamp(g, 0, 8.5, 0, "#ffffff", 30, 40, 0.01);
  if (o.booths) ring(8, 15, 0.2).forEach((p, i) => { const b = new THREE.Group(); b.position.set(p.x, 0, p.z); b.rotation.y = -p.a - Math.PI / 2; b.add(box(3, 0.6, 1, std("#2a1a2a"), 0, 0.3, 0.8)); b.add(box(3, 1.4, 0.3, std(o.accent[i % o.accent.length], { emissive: new THREE.Color(o.accent[i % o.accent.length]), emissiveIntensity: 0.25 }), 0, 0.9, 1.3)); b.add(box(2, 0.1, 1, std("#3a3a44"), 0, 0.8, -0.2)); g.add(b); col.push(aabb(p.x, p.z, 3, 3)); });
  if (o.pews) for (let k = 0; k < 8; k++) for (const side of [-1, 1]) { const z = -8 + k * 2.2; if (Math.abs(z) < 6) continue; g.add(box(4, 0.8, 0.5, std("#3a2a2a"), side * 9, 0.4, z)); col.push(aabb(side * 9, z, 4, 0.6)); }
  const tubes: THREE.Mesh[] = [];
  if (o.tubes) ring(10, 14, 0.15).forEach((p) => { g.add(cyl(1, 1, 0.3, std("#9aa0a8", { metalness: 0.8 }), p.x, 0.15, p.z, 16)); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 4, 16, 1, true), new THREE.MeshStandardMaterial({ color: "#7affb0", transparent: true, opacity: 0.35, emissive: new THREE.Color("#3aff8a"), emissiveIntensity: 0.4 })); t.position.set(p.x, 2.3, p.z); g.add(t); tubes.push(t); g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1, 4, 8), std("#c8b8a8")), p.x, 2.2, p.z)); col.push(aabb(p.x, p.z, 2.2, 2.2)); });
  const floorTiles: THREE.Mesh[] = [];
  if (o.dancefloor) for (let x = -5; x <= 5; x++) for (const z of [-11, -10, -9, 9, 10, 11]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), basic(o.accent[(x + z + 20) % o.accent.length], { transparent: true, opacity: 0.6 })); t.rotation.x = -Math.PI / 2; t.position.set(x, 0.02, z); g.add(t); floorTiles.push(t); }
  const lasers: THREE.Mesh[] = [];
  if (o.lasers) for (let i = 0; i < 8; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 30, 4), basic(o.accent[i % o.accent.length], { transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending })); l.position.set(0, 8.8, -14); l.geometry.translate(0, -15, 0); g.add(l); lasers.push(l); }
  if (o.rain) ring(6, R - 0.4, 1.1).forEach((p) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ color: "#2a3a5a", emissive: new THREE.Color("#1a2a4a"), emissiveIntensity: 0.6, transparent: true, opacity: 0.7 })); w.position.set(p.x, 3.5, p.z); w.lookAt(0, 3.5, 0); g.add(w); });
  // the machine (arcade cabinet / DJ deck / red button / car horn / candle rack)
  const m = new THREE.Group(); m.position.set(11, 0, 6); m.rotation.y = -Math.PI / 2 - 0.5;
  m.add(box(1.4, 2.4, 1, std("#1a1a24"), 0, 1.2, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), basic(o.machine.color)); screen.position.set(0, 1.7, 0.51); m.add(screen);
  m.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.12), basic("#ff3a3a")), 0.2, 1.05, 0.55));
  g.add(m); col.push(aabb(11, 6, 1.6, 1.6));
  const crowd = critters(g, rand, { count: 10, color: "#2a2a3a", size: 0.6, radius: [7, 11], height: [0.6, 0.6], mode: "hover", shape: "box", glow: false });
  let hype = 0;
  return make(g, col, {
    enclosed: true,
    updates: [crowd.update, (t, dt) => {
      hype = Math.max(0, hype - dt * 0.5);
      signs.forEach((s, i) => ((s.material as THREE.MeshBasicMaterial).opacity = Math.sin(t * 17 + i * 5) > 0.96 ? 0.4 : 1));
      lights.forEach((l, i) => (l.intensity = (o.bright ? 14 : 11) + Math.sin(t * 2 + i) * 1.5 + hype * 15));
      floorTiles.forEach((f, i) => ((f.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.abs(Math.sin(t * (2 + hype * 6) + i * 0.7)) * 0.6));
      lasers.forEach((l, i) => { l.rotation.z = Math.sin(t * (0.8 + hype * 3) + i) * 0.8; l.rotation.x = Math.cos(t * 0.6 + i * 2) * 0.6; });
      tubes.forEach((tb, i) => ((tb.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + Math.sin(t + i) * 0.15 + hype));
      (screen.material as THREE.MeshBasicMaterial).color.setHSL((t * 0.2) % 1, 0.9, 0.5 + hype * 0.3);
      fx.update(dt);
    }],
    inter: [spot(o.machine.id, o.machine.label, 10, 1, 5.5)],
    fx: {
      [o.machine.id]: () => {
        hype = 2; crowd.scare();
        sound.sfx(o.machine.id === "alarm" ? "horn" : o.machine.id === "horn" ? "horn" : o.machine.id === "holosaint" ? "heal" : "zap");
        fx.burst(V(11, 2, 6), o.machine.color, 80, 4); fx.flash(V(11, 3, 6), o.machine.color, 30);
      },
    },
  });
}
