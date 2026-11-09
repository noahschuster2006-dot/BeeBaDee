// Helpers for building detailed, living environments: scatter, lamps, critters, interactive spots and effects.

import * as THREE from "three";
import { at, box, canvasTex, cyl, dotTexture, noiseTexture, std, type Collider, type Interactable } from "./kit";

export interface Built {
  group: THREE.Group;
  colliders: Collider[];
  update?: (t: number, dt: number) => void;
  enclosed?: boolean;
  interactables?: Interactable[];
  onFx?: (id: string) => void;
}
export type Builder = (rand: () => number) => Built;

export function ground(color: string, spots: string[], rep = 30, o: Partial<THREE.MeshStandardMaterialParameters> = {}, radius = 60) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), std("#fff", { map: noiseTexture(color, spots, [rep, rep], 900), ...o }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

export function scatter(rand: () => number, n: number, rMin: number, rMax: number) {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = rMin + Math.sqrt(rand()) * (rMax - rMin);
    out.push([Math.cos(a) * r, Math.sin(a) * r, rand()]);
  }
  return out;
}

/** Evenly spaced positions around a ring, facing the centre. */
export function ring(n: number, r: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + offset;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, a };
  });
}

export const glow = (color: string, intensity = 1.5, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4, ...o });

export const basic = (color: string, o: Partial<THREE.MeshBasicMaterialParameters> = {}) => new THREE.MeshBasicMaterial({ color, ...o });

export function lamp(g: THREE.Group, x: number, y: number, z: number, color: string, intensity = 6, distance = 12, size = 0.15) {
  const bulb = at(new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), basic(color)), x, y, z);
  const light = new THREE.PointLight(color, intensity, distance, 1.6);
  light.position.set(x, y, z);
  g.add(bulb, light);
  return { bulb, light };
}

export function signTex(text: string, color: string, w = 256, h = 96) {
  return canvasTex(w, h, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = color; ctx.font = `bold ${Math.floor(h * 0.48)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

export function sign(text: string, color: string, w = 4, h = 1.5) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTex(text, color), transparent: true, side: THREE.DoubleSide }));
}

/** Small creatures that bring a place to life. */
export function critters(g: THREE.Group, rand: () => number, o: {
  count: number; color: string; size?: number; radius: [number, number]; height: [number, number];
  speed?: number; mode: "orbit" | "hover" | "scurry" | "fall" | "rise"; glow?: boolean; shape?: "dot" | "bird" | "box"; opacity?: number;
}) {
  const geo = o.shape === "bird" ? birdGeo() : o.shape === "box" ? new THREE.BoxGeometry(1, 0.5, 1.6) : null;
  const items: { obj: THREE.Object3D; a: number; r: number; h: number; s: number; p: number }[] = [];
  let points: THREE.Points | null = null;
  if (!geo) {
    const pos = new Float32Array(o.count * 3);
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    points = new THREE.Points(g2, new THREE.PointsMaterial({ color: o.color, size: o.size ?? 0.15, map: dotTexture(), transparent: true, opacity: o.opacity ?? 1, depthWrite: false, blending: o.glow === false ? THREE.NormalBlending : THREE.AdditiveBlending }));
    points.frustumCulled = false;
    g.add(points);
  }
  const mat = o.glow ? basic(o.color) : std(o.color);
  for (let i = 0; i < o.count; i++) {
    const obj = geo ? new THREE.Mesh(geo, mat) : new THREE.Object3D();
    if (geo) { obj.scale.setScalar(o.size ?? 0.3); g.add(obj); }
    items.push({ obj, a: rand() * Math.PI * 2, r: o.radius[0] + rand() * (o.radius[1] - o.radius[0]), h: o.height[0] + rand() * (o.height[1] - o.height[0]), s: (0.4 + rand()) * (o.speed ?? 1) * (rand() < 0.5 ? -1 : 1), p: rand() * 10 });
  }
  let scare = 0;
  const update = (t: number, dt: number) => {
    scare = Math.max(0, scare - dt);
    const boost = 1 + scare * 4;
    items.forEach((c, i) => {
      let x = 0, y = 0, z = 0;
      switch (o.mode) {
        case "orbit": c.a += c.s * dt * 0.3 * boost; x = Math.cos(c.a) * c.r; z = Math.sin(c.a) * c.r; y = c.h + Math.sin(t * 2 + c.p) * 0.6 + scare * 3; break;
        case "hover": x = Math.cos(c.a) * c.r + Math.sin(t * 0.7 + c.p) * 1.5; z = Math.sin(c.a) * c.r + Math.cos(t * 0.5 + c.p) * 1.5; y = c.h + Math.sin(t * 1.3 + c.p) * 0.5; break;
        case "scurry": c.a += c.s * dt * 0.25 * boost; x = Math.cos(c.a) * c.r; z = Math.sin(c.a) * c.r; y = 0.05 + Math.abs(Math.sin(t * 12 + c.p)) * 0.05; break;
        case "fall": y = c.h - ((t * Math.abs(c.s) * 0.6 + c.p) % c.h); x = Math.cos(c.a) * c.r + Math.sin(t + c.p) * 0.6; z = Math.sin(c.a) * c.r; break;
        case "rise": y = ((t * Math.abs(c.s) * 0.8 + c.p) % c.h); x = Math.cos(c.a) * c.r + Math.sin(t * 2 + c.p) * 0.3; z = Math.sin(c.a) * c.r; break;
      }
      if (geo) {
        c.obj.position.set(x, y, z);
        c.obj.rotation.y = -c.a + (c.s > 0 ? 0 : Math.PI);
        if (o.shape === "bird") c.obj.scale.y = (o.size ?? 0.3) * (0.6 + Math.abs(Math.sin(t * 10 + c.p)));
      } else if (points) {
        const arr = (points.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
    });
    if (points) (points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  };
  return { update, scare: () => (scare = 2) };
}

function birdGeo() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([0, 0, 0.4, -1, 0.3, -0.2, 0, 0, -0.3, 0, 0, 0.4, 1, 0.3, -0.2, 0, 0, -0.3]);
  g.setAttribute("position", new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Visual effects any builder can trigger: expanding rings, sparks, flashes. */
export class Fx {
  private items: { obj: THREE.Object3D; age: number; life: number; tick: (k: number, o: THREE.Object3D) => void }[] = [];
  constructor(private g: THREE.Group) {}

  ring(pos: THREE.Vector3, color: string, size = 6, life = 1.4) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), basic(color, { transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos);
    this.add(m, life, (k, o) => { o.scale.setScalar(0.5 + k * size); ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k; });
  }

  burst(pos: THREE.Vector3, color: string, n = 40, spread = 3, life = 1.6) {
    const p = new Float32Array(n * 3);
    const v = Array.from({ length: n }, () => new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread, (Math.random() - 0.5) * spread));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.25, map: dotTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.position.copy(pos);
    pts.frustumCulled = false;
    this.add(pts, life, (k) => {
      v.forEach((vv, i) => { p[i * 3] = vv.x * k; p[i * 3 + 1] = vv.y * k - k * k * 2; p[i * 3 + 2] = vv.z * k; });
      geo.attributes.position.needsUpdate = true;
      (pts.material as THREE.PointsMaterial).opacity = 1 - k;
    });
  }

  flash(pos: THREE.Vector3, color: string, intensity = 30, life = 0.8) {
    const l = new THREE.PointLight(color, intensity, 25, 1.5);
    l.position.copy(pos);
    this.add(l, life, (k, o) => ((o as THREE.PointLight).intensity = intensity * (1 - k)));
  }

  private add(obj: THREE.Object3D, life: number, tick: (k: number, o: THREE.Object3D) => void) {
    this.g.add(obj);
    this.items.push({ obj, age: 0, life, tick });
  }

  update(dt: number) {
    for (const it of this.items) { it.age += dt; it.tick(Math.min(1, it.age / it.life), it.obj); }
    for (const it of this.items.filter((x) => x.age >= x.life)) {
      this.g.remove(it.obj);
      if (it.obj instanceof THREE.Mesh || it.obj instanceof THREE.Points) { it.obj.geometry.dispose(); (it.obj.material as THREE.Material).dispose(); }
    }
    this.items = this.items.filter((x) => x.age < x.life);
  }
}

export function spot(id: string, label: string, x: number, y: number, z: number, radius = 2.5): Interactable {
  return { id, label, kind: "fx", fx: id, pos: new THREE.Vector3(x, y, z), radius };
}

export function tree(g: THREE.Group, x: number, z: number, h: number, leaf: THREE.Material, trunk: THREE.Material, pine: boolean) {
  g.add(cyl(0.18 + h * 0.03, 0.3 + h * 0.04, h, trunk, x, h / 2, z, 8));
  if (pine) for (let k = 0; k < 3; k++) g.add(at(new THREE.Mesh(new THREE.ConeGeometry(1.6 - k * 0.4, 2.2, 9), leaf), x, h - 0.6 + k * 1.1, z));
  else { const s = at(new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + h * 0.12, 0), leaf), x, h + 0.6, z); s.castShadow = true; g.add(s); }
}

export function cottage(g: THREE.Group, x: number, z: number, a: number, wall: string, roof: string, rand: () => number) {
  const h = new THREE.Group();
  h.position.set(x, 0, z);
  h.rotation.y = a;
  const w = 3.5 + rand() * 1.5, d = 3 + rand();
  h.add(box(w, 2.4, d, std(wall), 0, 1.2, 0));
  const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.8, 1.8, 4), std(roof, { flatShading: true }));
  r.position.y = 3.3; r.rotation.y = Math.PI / 4; r.scale.z = d / w; r.castShadow = true;
  h.add(r);
  h.add(box(0.8, 1.4, 0.1, std("#3a2412"), 0, 0.7, d / 2 + 0.02));
  const win = basic("#ffcf7a");
  for (const sx of [-1, 1]) h.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), win), sx * w * 0.3, 1.5, d / 2 + 0.03));
  h.add(box(0.5, 1.2, 0.5, std("#6a6058"), w * 0.3, 3.8, -d * 0.2));
  g.add(h);
  return h;
}

export { at, box, cyl, std, canvasTex, noiseTexture };
