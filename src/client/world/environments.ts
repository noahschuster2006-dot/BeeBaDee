// Ever-changing worlds around the table. Each scene's preset builds a procedural landscape;
// the AI GM can change weather and time of day at any moment.

import * as THREE from "three";
import type { EnvironmentState, TimeOfDay, Weather } from "../../shared/types";
import { aabb, at, box, canvasTex, cyl, dotTexture, noiseTexture, rngFrom, std, type Collider, type WorldPiece } from "./kit";

type Builder = (rand: () => number) => { group: THREE.Group; colliders: Collider[]; update?: (t: number) => void; enclosed?: boolean };

export interface Atmosphere { sky: string; fog: string; fogNear: number; fogFar: number; hemiSky: string; hemiGround: string; hemi: number; sun: number; sunColor: string }

function ground(color: string, spots: string[], rep = 30, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(60, 48), std("#fff", { map: noiseTexture(color, spots, [rep, rep], 900), ...o }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

/** Scatter positions in a ring around the table. */
function scatter(rand: () => number, n: number, rMin: number, rMax: number) {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = rMin + Math.sqrt(rand()) * (rMax - rMin);
    out.push([Math.cos(a) * r, Math.sin(a) * r, rand()]);
  }
  return out;
}

function ringWall(g: THREE.Group, colliders: Collider[], radius: number, height: number, m: THREE.Material, segments = 28) {
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const len = (2 * Math.PI * radius) / segments + 0.2;
    const seg = box(len, height, 1.2, m, Math.cos(a) * radius, height / 2, Math.sin(a) * radius);
    seg.rotation.y = -a + Math.PI / 2;
    g.add(seg);
  }
  // colliders as a ring of boxes
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    colliders.push(aabb(Math.cos(a) * (radius + 0.4), Math.sin(a) * (radius + 0.4), 3.2, 3.2));
  }
}

function glowMat(color: string, intensity = 1.5) {
  return new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4 });
}

function signTex(text: string, color: string) {
  return canvasTex(256, 96, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(6, 6, 244, 84);
    ctx.fillStyle = color; ctx.font = "bold 46px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.fillText(text, 128, 50);
  });
}

const BUILDERS: Record<string, Builder> = {
  forest: (rand) => {
    const g = new THREE.Group();
    const col: Collider[] = [];
    g.add(ground("#3e5a2a", ["#2c4220", "#5a7a35", "#6b5a3a"]));
    const road = new THREE.Mesh(new THREE.RingGeometry(9, 11.5, 64), std("#6b5a40"));
    road.rotation.x = -Math.PI / 2; road.position.y = 0.01; road.receiveShadow = true;
    g.add(road);
    const trunkM = std("#4a3320");
    const leafMs = ["#2e5a24", "#3b6b2a", "#24481d", "#4d7a2e"].map((c) => std(c));
    for (const [x, z, r] of scatter(rand, 120, 13, 48)) {
      const h = 3 + r * 4;
      g.add(cyl(0.18 + r * 0.15, 0.3 + r * 0.2, h, trunkM, x, h / 2, z, 8));
      const pine = r > 0.45;
      const leaf = leafMs[Math.floor(r * 10) % 4];
      if (pine) for (let k = 0; k < 3; k++) g.add(at(new THREE.Mesh(new THREE.ConeGeometry(1.6 - k * 0.4, 2.2, 9), leaf), x, h - 0.6 + k * 1.1, z));
      else { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 + r, 0), leaf); s.position.set(x, h + 0.6, z); s.castShadow = true; g.add(s); }
      col.push(aabb(x, z, 0.7, 0.7));
    }
    for (const [x, z, r] of scatter(rand, 40, 7.5, 30)) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + r * 0.6, 0), std("#7a7a72"));
      rock.position.set(x, 0.2, z); rock.rotation.set(r * 3, r * 5, 0); rock.castShadow = true;
      g.add(rock);
    }
    for (const [x, z, r] of scatter(rand, 30, 7.5, 25)) {
      g.add(cyl(0.03, 0.04, 0.2, std("#e8dcc0"), x, 0.1, z, 6));
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(r > 0.5 ? "#c0392b" : "#d9a441")), x, 0.18, z));
    }
    return { group: g, colliders: col };
  },

  crypt: (rand) => {
    const g = new THREE.Group();
    const col: Collider[] = [];
    const stone = std("#fff", { map: noiseTexture("#55524e", ["#3a3835", "#6e6a62"], [3, 1]) });
    g.add(ground("#4a4744", ["#2f2d2a", "#5f5a52"], 24));
    ringWall(g, col, 22, 7, stone);
    const roof = new THREE.Mesh(new THREE.CircleGeometry(23, 32), std("#1b1a19"));
    roof.rotation.x = Math.PI / 2; roof.position.y = 7; g.add(roof);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = Math.cos(a) * 14, z = Math.sin(a) * 14;
      g.add(cyl(0.6, 0.7, 7, stone, x, 3.5, z, 10));
      col.push(aabb(x, z, 1.3, 1.3));
    }
    const candleLights: THREE.PointLight[] = [];
    for (const [x, z] of scatter(rand, 16, 8, 20)) {
      g.add(box(0.9, 0.6, 2, std("#3d3a36"), x, 0.3, z));
      col.push(aabb(x, z, 1, 2.1));
      g.add(cyl(0.04, 0.04, 0.25, std("#efe6cf"), x + 0.3, 0.72, z, 6));
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: "#ffcc66" })), x + 0.3, 0.88, z));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const l = new THREE.PointLight("#ff9e4a", 5, 12, 2);
      l.position.set(Math.cos(a) * 12, 2.2, Math.sin(a) * 12);
      g.add(l);
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({ color: "#ffb35a" })), l.position.x, l.position.y, l.position.z));
      candleLights.push(l);
    }
    return { group: g, colliders: col, enclosed: true, update: (t) => candleLights.forEach((l, i) => (l.intensity = 5 + Math.sin(t * 11 + i * 2) * 0.8)) };
  },

  ossuary: (rand) => {
    const base = BUILDERS.crypt(rand);
    const bone = std("#e2d9c2", { roughness: 0.9 });
    for (const [x, z, r] of scatter(rand, 60, 9, 20)) {
      const pile = new THREE.Group();
      for (let k = 0; k < 6; k++) pile.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.15 + r * 0.08, 8, 6), bone), (rand() - 0.5) * 0.6, k * 0.12, (rand() - 0.5) * 0.6));
      pile.position.set(x, 0.1, z);
      base.group.add(pile);
    }
    const river = new THREE.Mesh(new THREE.RingGeometry(16.5, 18.5, 64), new THREE.MeshStandardMaterial({ color: "#0a0612", emissive: new THREE.Color("#2a0d40"), emissiveIntensity: 0.6, roughness: 0.1 }));
    river.rotation.x = -Math.PI / 2; river.position.y = 0.02;
    base.group.add(river);
    const throne = new THREE.Group();
    throne.add(box(2.4, 0.6, 2.4, bone, 0, 0.3, 0));
    throne.add(box(2, 3.2, 0.5, bone, 0, 1.9, -0.9));
    for (let k = 0; k < 7; k++) throne.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), bone), -0.9 + k * 0.3, 3.6, -0.9));
    throne.position.set(0, 0, -12);
    base.group.add(throne);
    base.colliders.push(aabb(0, -12, 2.6, 2.6));
    return base;
  },

  cavern: (rand) => {
    const g = new THREE.Group();
    const col: Collider[] = [];
    g.add(ground("#2a3140", ["#1a1f2a", "#3a4558", "#2f5a4a"], 20));
    const rock = std("#323a4c", { roughness: 0.95, flatShading: true });
    for (const [x, z, r] of scatter(rand, 90, 9, 45)) {
      const h = 1 + r * 6;
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.5 + r * 1.2, h, 7), rock);
      s.position.set(x, h / 2, z); s.castShadow = true;
      g.add(s);
      if (r > 0.3) col.push(aabb(x, z, 0.9 + r, 0.9 + r));
      const st = new THREE.Mesh(new THREE.ConeGeometry(0.3 + r * 0.8, 2 + r * 4, 7), rock);
      st.position.set(x + 2, 12 - (1 + r * 2), z - 1); st.rotation.x = Math.PI;
      g.add(st);
    }
    const roof = new THREE.Mesh(new THREE.SphereGeometry(48, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std("#141822", { side: THREE.BackSide, flatShading: true }));
    roof.scale.y = 0.27;
    g.add(roof);
    const mossM = glowMat("#4effc0", 0.6);
    for (const [x, z, r] of scatter(rand, 50, 7.5, 30)) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.4 + r * 0.9, 10), mossM);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z);
      g.add(m);
    }
    const lights: THREE.PointLight[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = Math.cos(a) * 9.5, z = Math.sin(a) * 9.5;
      g.add(cyl(0.05, 0.07, 2.4, std("#222831"), x, 1.2, z, 6));
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: "#9fd4ff" }));
      orb.position.set(x, 2.5, z);
      g.add(orb);
      const l = new THREE.PointLight("#7fbfff", 4, 10, 2);
      l.position.copy(orb.position);
      g.add(l);
      lights.push(l);
      col.push(aabb(x, z, 0.3, 0.3));
    }
    return { group: g, colliders: col, enclosed: true, update: (t) => lights.forEach((l, i) => (l.intensity = 4 + Math.sin(t * 1.3 + i) * 1.2)) };
  },

  gallery: (rand) => {
    const g = new THREE.Group();
    const col: Collider[] = [];
    g.add(ground("#4a5a48", ["#3a4a38", "#6a7a5a"], 16));
    const carved = std("#8a9a7a", { roughness: 0.7 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = Math.cos(a) * 12, z = Math.sin(a) * 12;
      g.add(cyl(0.7, 0.9, 9, carved, x, 4.5, z, 8));
      g.add(box(2, 0.4, 2, carved, x, 9, z));
      col.push(aabb(x, z, 1.8, 1.8));
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.5), std(i % 2 ? "#2e6b3a" : "#c9b45a", { side: THREE.DoubleSide }));
      banner.position.set(Math.cos(a) * 11.2, 5.5, Math.sin(a) * 11.2);
      banner.lookAt(0, 5.5, 0);
      g.add(banner);
    }
    const leafM = std("#3f7a3a", { side: THREE.DoubleSide });
    for (const [x, z, r] of scatter(rand, 60, 15, 40)) {
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(1.5 + r * 2, 8), leafM);
      leaf.position.set(x, 4 + r * 10, z); leaf.rotation.set(r * 2, r * 4, r);
      g.add(leaf);
    }
    const sun = new THREE.PointLight("#c8ffb0", 8, 30, 1.5);
    sun.position.set(0, 12, 0);
    g.add(sun);
    return { group: g, colliders: col };
  },

  bloom: (rand) => {
    const g = new THREE.Group();
    const col: Collider[] = [];
    g.add(ground("#3a3448", ["#c8c0e0", "#262033", "#5a4a70"], 18));
    const petal = new THREE.MeshStandardMaterial({ color: "#f2ecff", emissive: new THREE.Color("#c9b8ff"), emissiveIntensity: 0.5, roughness: 0.4, side: THREE.DoubleSide });
    const bulbs: THREE.Object3D[] = [];
    for (const [x, z, r] of scatter(rand, 45, 8, 30)) {
      const f = new THREE.Group();
      f.add(cyl(0.08, 0.12, 1 + r * 2, std("#cfc6e8"), 0, (1 + r * 2) / 2, 0, 6));
      for (let k = 0; k < 6; k++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.5 + r * 0.6, 10, 6, 0, Math.PI, 0, Math.PI / 2), petal);
        p.position.y = 1 + r * 2; p.rotation.set(0.6, (k / 6) * Math.PI * 2, 0);
        f.add(p);
      }
      f.position.set(x, 0, z);
      g.add(f);
      bulbs.push(f);
      col.push(aabb(x, z, 0.5, 0.5));
    }
    const rootM = glowMat("#eae2ff", 0.9);
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const curve = new THREE.CatmullRomCurve3([0, 1, 2, 3].map((k) => new THREE.Vector3(Math.cos(a) * (8 + k * 6), 0.1 + Math.sin(k) * 0.3 + k * 1.5, Math.sin(a) * (8 + k * 6) + Math.sin(k * 2) * 2)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.12, 6), rootM));
    }
    const roof = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std("#120f1a", { side: THREE.BackSide }));
    roof.scale.y = 0.35;
    g.add(roof);
    const glow = new THREE.PointLight("#d6c8ff", 10, 30, 1.5);
    glow.position.set(0, 6, -10);
    g.add(glow);
    return { group: g, colliders: col, enclosed: true, update: (t) => { bulbs.forEach((b, i) => b.scale.setScalar(1 + Math.sin(t * 1.5 + i) * 0.05)); glow.intensity = 9 + Math.sin(t * 2) * 2; } };
  },

  neoncity: (rand) => {
    const g = new THREE.Group();
    const col: Collider[] = [];
    g.add(ground("#16171d", ["#0c0c10", "#26283a", "#1a1a24"], 28, { roughness: 0.25, metalness: 0.4 }));
    const winTex = canvasTex(128, 256, (ctx) => {
      ctx.fillStyle = "#0b0c12"; ctx.fillRect(0, 0, 128, 256);
      for (let y = 6; y < 256; y += 14) for (let x = 6; x < 128; x += 14) {
        const on = Math.random() > 0.55;
        ctx.fillStyle = on ? ["#ffd27a", "#7af0ff", "#ff7ad9", "#e6e6ff"][Math.floor(Math.random() * 4)] : "#15161f";
        ctx.fillRect(x, y, 8, 9);
      }
    }, [1, 1]);
    const signs = ["NOODLES", "24H", "CRED", "BAR", "RAMEN", "CYBER", "HOTEL", "DOCS"];
    const neonColors = ["#ff3fa4", "#3af0ff", "#ffd23a", "#9a5cff", "#3aff8a"];
    const flicker: THREE.Mesh[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rand() * 0.1;
      const r = 20 + rand() * 12;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = 15 + rand() * 40;
      const w = 6 + rand() * 5;
      const m = new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.9, roughness: 0.6 });
      const b = box(w, h, w, m, x, h / 2, z);
      b.lookAt(0, h / 2, 0);
      g.add(b);
      col.push(aabb(x, z, w, w));
      const color = neonColors[i % neonColors.length];
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.5), new THREE.MeshBasicMaterial({ map: signTex(signs[i % signs.length], color), transparent: true }));
      sign.position.set(Math.cos(a) * (r - w / 2 - 0.2), 4 + rand() * 6, Math.sin(a) * (r - w / 2 - 0.2));
      sign.lookAt(0, sign.position.y, 0);
      g.add(sign);
      flicker.push(sign);
    }
    // market stalls
    for (const [x, z, r] of scatter(rand, 14, 9, 16)) {
      const stall = new THREE.Group();
      stall.add(box(2.4, 1, 1.2, std("#2a2a33"), 0, 0.5, 0));
      const tarp = box(2.8, 0.05, 1.8, std(neonColors[Math.floor(r * 5)], { emissive: new THREE.Color(neonColors[Math.floor(r * 5)]), emissiveIntensity: 0.25 }), 0, 2.3, 0.2);
      stall.add(tarp);
      for (const sx of [-1.3, 1.3]) stall.add(cyl(0.04, 0.04, 2.3, std("#555"), sx, 1.15, 0.8, 6));
      stall.position.set(x, 0, z);
      stall.lookAt(0, 0, 0);
      g.add(stall);
      col.push(aabb(x, z, 2.4, 2.4));
    }
    const lights: THREE.PointLight[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const l = new THREE.PointLight(neonColors[i % 5], 10, 18, 1.6);
      l.position.set(Math.cos(a) * 12, 4, Math.sin(a) * 12);
      g.add(l);
      lights.push(l);
    }
    return { group: g, colliders: col, update: (t) => flicker.forEach((s, i) => ((s.material as THREE.MeshBasicMaterial).opacity = Math.sin(t * 20 + i * 7) > 0.97 ? 0.3 : 1)) };
  },

  corplobby: (rand) => {
    const g = new THREE.Group();
    const col: Collider[] = [];
    g.add(ground("#e8e8ec", ["#d0d0d8", "#f5f5f8", "#c0c0cc"], 10, { roughness: 0.15, metalness: 0.1 }));
    const white = std("#f2f2f5", { roughness: 0.3 });
    ringWall(g, col, 24, 18, new THREE.MeshStandardMaterial({ color: "#a8c8ff", transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.6 }));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = Math.cos(a) * 15, z = Math.sin(a) * 15;
      g.add(cyl(0.9, 0.9, 18, white, x, 9, z, 20));
      col.push(aabb(x, z, 1.8, 1.8));
      g.add(cyl(0.95, 0.95, 0.2, glowMat("#3ac8ff", 2), x, 3, z, 20));
    }
    for (const [x, z, r] of scatter(rand, 8, 9, 13)) {
      g.add(box(1.4, 0.6, 1.4, std("#dcdce2"), x, 0.3, z));
      g.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + r * 0.3, 0), std("#2f6b3a", { flatShading: true })), x, 1.2, z));
      col.push(aabb(x, z, 1.5, 1.5));
    }
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: signTex("HALCYON", "#3ac8ff"), transparent: true }));
    logo.position.set(0, 9, -22);
    g.add(logo);
    const sun = new THREE.PointLight("#e8f4ff", 20, 40, 1.2);
    sun.position.set(0, 16, 0);
    g.add(sun);
    return { group: g, colliders: col, enclosed: true };
  },

  servervault: (rand) => {
    const g = new THREE.Group();
    const col: Collider[] = [];
    g.add(ground("#1a2030", ["#10141e", "#28304a"], 14, { roughness: 0.3, metalness: 0.5 }));
    ringWall(g, col, 22, 8, std("#0e121c"));
    const rackTex = canvasTex(64, 128, (ctx) => {
      ctx.fillStyle = "#11141c"; ctx.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 8) { ctx.fillStyle = "#1c2230"; ctx.fillRect(4, y, 56, 6); ctx.fillStyle = Math.random() > 0.5 ? "#3aff8a" : "#3ac8ff"; ctx.fillRect(50, y + 2, 4, 2); }
    });
    const rackM = new THREE.MeshStandardMaterial({ map: rackTex, emissiveMap: rackTex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.7 });
    const racks: THREE.Mesh[] = [];
    for (let ring = 0; ring < 2; ring++) {
      const r = 11 + ring * 5;
      const n = 14 + ring * 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.1;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const rack = box(1.2, 3.2, 1.2, rackM, x, 1.6, z);
        rack.lookAt(0, 1.6, 0);
        g.add(rack);
        racks.push(rack);
        col.push(aabb(x, z, 1.3, 1.3));
      }
    }
    const cyl1 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4, 24, 1, true), new THREE.MeshStandardMaterial({ color: "#9fdcff", transparent: true, opacity: 0.25, roughness: 0, metalness: 0.5 }));
    cyl1.position.set(0, 2, -9);
    g.add(cyl1);
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), glowMat("#ffffff", 3));
    shard.position.set(0, 2, -9);
    g.add(shard);
    col.push(aabb(0, -9, 2.4, 2.4));
    const l = new THREE.PointLight("#7fd8ff", 12, 25, 1.5);
    l.position.set(0, 4, -9);
    g.add(l);
    return { group: g, colliders: col, enclosed: true, update: (t) => { shard.rotation.y = t; shard.position.y = 2 + Math.sin(t * 2) * 0.15; rackM.emissiveIntensity = 0.6 + Math.sin(t * 6) * 0.1; } };
  },
};

export function buildEnvironment(env: EnvironmentState): WorldPiece & { enclosed: boolean } {
  const rand = rngFrom(env.seed || 1);
  const b = (BUILDERS[env.preset] ?? BUILDERS.forest)(rand);
  return { group: b.group, colliders: b.colliders, seats: [], interactables: [], update: b.update, bounds: 34, enclosed: !!b.enclosed };
}

// ---------- atmosphere: time of day + weather ----------

const PRESET_TINT: Record<string, Partial<Atmosphere>> = {
  crypt: { sky: "#050506", fog: "#0b0a0c", fogNear: 8, fogFar: 30, hemi: 0.75, sun: 0, hemiSky: "#a89a8a" },
  ossuary: { sky: "#08040c", fog: "#120818", fogNear: 8, fogFar: 30, hemi: 0.75, sun: 0, hemiSky: "#9a7aba" },
  cavern: { sky: "#05070c", fog: "#0a1220", fogNear: 10, fogFar: 40, hemi: 0.9, sun: 0, hemiSky: "#8aaee0" },
  bloom: { sky: "#0c0a14", fog: "#1a1528", fogNear: 10, fogFar: 38, hemi: 0.9, sun: 0, hemiSky: "#d0c4ff" },
  gallery: { hemiSky: "#c8e8b0" },
  neoncity: { hemiSky: "#6a4aa0", hemiGround: "#101018" },
  corplobby: { sky: "#d8e4f2", fog: "#d8e4f2", fogNear: 20, fogFar: 60, hemi: 1.1, sun: 0.4 },
  servervault: { sky: "#04070d", fog: "#081220", fogNear: 10, fogFar: 34, hemi: 0.85, sun: 0, hemiSky: "#7ab4ff" },
  pub: { sky: "#120a05", fog: "#120a05", fogNear: 30, fogFar: 60, hemi: 1.0, sun: 0, hemiSky: "#ffd9a8", hemiGround: "#4a2a14" },
};

const TIME: Record<TimeOfDay, Atmosphere> = {
  dawn: { sky: "#e8a77a", fog: "#d9a587", fogNear: 18, fogFar: 70, hemiSky: "#ffd2b0", hemiGround: "#3a2a20", hemi: 0.75, sun: 1.2, sunColor: "#ffb07a" },
  day: { sky: "#8fc4ef", fog: "#b8d8f0", fogNear: 25, fogFar: 90, hemiSky: "#dff0ff", hemiGround: "#4a5a3a", hemi: 0.9, sun: 2.2, sunColor: "#fff4e0" },
  dusk: { sky: "#d9734a", fog: "#a85a4a", fogNear: 16, fogFar: 65, hemiSky: "#ffb07a", hemiGround: "#2a1a24", hemi: 0.6, sun: 1.1, sunColor: "#ff8a4a" },
  night: { sky: "#0a0e1c", fog: "#0c1222", fogNear: 12, fogFar: 55, hemiSky: "#7a8ac0", hemiGround: "#1a1a26", hemi: 0.7, sun: 0.4, sunColor: "#9ab0ff" },
};

export function atmosphereFor(env: EnvironmentState): Atmosphere {
  const base = { ...TIME[env.time] };
  const tint = PRESET_TINT[env.preset] ?? {};
  const a = { ...base, ...tint } as Atmosphere;
  if (env.weather === "fog") { a.fogNear = 2; a.fogFar = Math.min(a.fogFar, 22); }
  if (env.weather === "storm" || env.weather === "rain") { a.fogFar *= 0.7; a.sun *= 0.5; a.hemi *= 0.85; }
  return a;
}

/** Particle weather that follows the camera. */
export class WeatherFx {
  points: THREE.Points | null = null;
  private kind: Weather = "clear";
  private vel: Float32Array = new Float32Array(0);
  flash = 0;

  constructor(private scene: THREE.Scene) {}

  set(kind: Weather) {
    if (kind === this.kind && this.points) return;
    this.kind = kind;
    if (this.points) { this.scene.remove(this.points); this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); this.points = null; }
    const cfg: Partial<Record<Weather, { n: number; color: string; size: number; blend?: boolean }>> = {
      rain: { n: 4000, color: "#9fb4d8", size: 0.06 }, storm: { n: 6000, color: "#a8bcdf", size: 0.07 },
      snow: { n: 2500, color: "#ffffff", size: 0.12 }, spores: { n: 900, color: "#bfffe8", size: 0.1, blend: true },
      embers: { n: 700, color: "#ff8a3a", size: 0.09, blend: true }, ash: { n: 1600, color: "#8a8580", size: 0.08 },
      fog: { n: 300, color: "#c8c8d0", size: 1.6 },
    };
    const c = cfg[kind];
    if (!c) return;
    const pos = new Float32Array(c.n * 3);
    this.vel = new Float32Array(c.n);
    for (let i = 0; i < c.n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 18;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      this.vel[i] = 0.5 + Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: c.color, size: c.size * (kind === "rain" || kind === "storm" ? 1 : 1.6), map: dotTexture(), transparent: true, opacity: kind === "fog" ? 0.08 : 0.8, depthWrite: false, blending: c.blend ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  update(dt: number, t: number, center: THREE.Vector3) {
    if (this.kind === "storm") {
      if (Math.random() < dt * 0.15) this.flash = 1;
      this.flash = Math.max(0, this.flash - dt * 3);
    } else this.flash = 0;
    if (!this.points) return;
    this.points.position.set(center.x, 0, center.z);
    const p = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = p.array as Float32Array;
    const n = arr.length / 3;
    for (let i = 0; i < n; i++) {
      const v = this.vel[i];
      switch (this.kind) {
        case "rain": case "storm": arr[i * 3 + 1] -= dt * (16 + v * 6); arr[i * 3] += dt * (this.kind === "storm" ? 3 : 0.5); break;
        case "snow": case "ash": arr[i * 3 + 1] -= dt * v * 0.8; arr[i * 3] += Math.sin(t + i) * dt * 0.3; break;
        case "spores": arr[i * 3 + 1] += Math.sin(t * 0.5 + i) * dt * 0.15 - dt * 0.05; arr[i * 3] += Math.cos(t * 0.3 + i) * dt * 0.2; break;
        case "embers": arr[i * 3 + 1] += dt * v * 0.9; arr[i * 3] += Math.sin(t * 2 + i) * dt * 0.4; break;
        case "fog": arr[i * 3] += dt * 0.3 * v; arr[i * 3 + 1] = 0.5 + (i % 5) * 0.5; break;
      }
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += 18;
      if (arr[i * 3 + 1] > 18) arr[i * 3 + 1] -= 18;
      if (arr[i * 3] > 20) arr[i * 3] -= 40;
    }
    p.needsUpdate = true;
  }
}
