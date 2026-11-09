// The Gilded Mug: the social hub. Walk around, sit, check the mirror, pick an adventure.

import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { CAMPAIGNS, CAMPAIGN_ORDER } from "../../shared/campaigns";
import { Fx, spot } from "./worldkit";
import { sound } from "./audio";
import { aabb, at, box, canvasTex, cyl, noiseTexture, std, woodTexture, type Collider, type Interactable, type Seat, type WorldPiece } from "./kit";

export const PUB = { w: 26, d: 22, h: 5.2 };

export function buildPub(): WorldPiece {
  const g = new THREE.Group();
  const colliders: Collider[] = [];
  const seats: Seat[] = [];
  const inter: Interactable[] = [];
  const { w, d, h } = PUB;
  const hw = w / 2;
  const hd = d / 2;

  // floor & walls
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std("#ffffff", { map: woodTexture("#7a5230", 64, [6, 5]) }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);
  const wallTex = noiseTexture("#b49870", ["#8c7350", "#cbb48e", "#6e5a3e"], [4, 1], 900);
  const wallM = std("#ffffff", { map: wallTex });
  const trimM = std("#4a2e18");
  const addWall = (x: number, z: number, len: number, rotY: number) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, h), wallM);
    wall.position.set(x, h / 2, z);
    wall.rotation.y = rotY;
    wall.receiveShadow = true;
    g.add(wall);
    const wains = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), trimM);
    wains.position.set(x, 0.55, z);
    wains.rotation.y = rotY;
    wains.translateZ(0.01);
    g.add(wains);
  };
  addWall(0, -hd, w, 0);
  addWall(0, hd, w, Math.PI);
  addWall(-hw, 0, d, Math.PI / 2);
  addWall(hw, 0, d, -Math.PI / 2);
  colliders.push(aabb(0, -hd - 0.5, w + 2, 1), aabb(0, hd + 0.5, w + 2, 1), aabb(-hw - 0.5, 0, 1, d + 2), aabb(hw + 0.5, 0, 1, d + 2));

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std("#3a2414"));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = h;
  g.add(ceil);
  const beamM = std("#2e1c0e");
  for (let x = -hw + 2; x < hw; x += 4) g.add(box(0.35, 0.4, d, beamM, x, h - 0.2, 0, false));
  for (const x of [-7, 7]) for (const z of [-5, 5]) {
    g.add(box(0.45, h, 0.45, beamM, x, h / 2, z));
    colliders.push(aabb(x, z, 0.55, 0.55));
  }

  // rugs
  const rug = (x: number, z: number, rw: number, rd: number, color: string) => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), std("#fff", {
      map: canvasTex(128, 128, (ctx) => {
        ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = "rgba(255,220,150,0.5)"; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 112, 112);
        ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 3; ctx.strokeRect(20, 20, 88, 88);
      }),
    }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.01, z);
    r.receiveShadow = true;
    g.add(r);
  };
  rug(0, 0, 11, 8, "#6b1f1f");
  rug(-9.5, 6, 4, 5, "#1f3b6b");

  // bar (north wall)
  const barM = std("#5a3519", { roughness: 0.5 });
  g.add(box(10, 1.1, 0.9, barM, 2, 0.55, -hd + 2.2));
  g.add(box(10.3, 0.08, 1.1, std("#2d1a0b", { roughness: 0.3 }), 2, 1.12, -hd + 2.2));
  colliders.push(aabb(2, -hd + 2.2, 10, 0.9));
  g.add(box(10, 2.6, 0.4, std("#3f2510"), 2, 1.9, -hd + 0.3));
  for (let i = 0; i < 3; i++) g.add(box(9.6, 0.06, 0.45, std("#2a170a"), 2, 1.2 + i * 0.75, -hd + 0.5));
  const bottleColors = ["#2f7d3a", "#8a2d2d", "#c9a14a", "#3a5fa0", "#6a3a8a", "#d8d8d8"];
  for (let i = 0; i < 36; i++) {
    const bx = -2.6 + (i % 12) * 0.8 + Math.random() * 0.2;
    const by = 1.23 + Math.floor(i / 12) * 0.75;
    const col = bottleColors[i % bottleColors.length];
    const b = cyl(0.06, 0.07, 0.32, std(col, { roughness: 0.15, transparent: true, opacity: 0.85 }), bx, by + 0.16, -hd + 0.5, 8);
    g.add(b);
    g.add(cyl(0.02, 0.03, 0.12, std(col), bx, by + 0.38, -hd + 0.5, 6));
  }
  for (let i = 0; i < 6; i++) {
    const sx = -2 + i * 1.6;
    const sz = -hd + 3.2;
    g.add(cyl(0.22, 0.2, 0.08, std("#6b3d1b"), sx, 0.72, sz));
    g.add(cyl(0.05, 0.05, 0.7, std("#2c1a0c"), sx, 0.35, sz, 8));
    seats.push({ id: `stool${i}`, pos: new THREE.Vector3(sx, 0.76, sz), ry: Math.PI });
  }
  // barrels and mugs
  for (const [x, z] of [[8.5, -hd + 0.8], [9.4, -hd + 0.8], [9, -hd + 1.6], [-4.4, -hd + 0.9]]) {
    g.add(cyl(0.42, 0.42, 0.95, std("#6d4423"), x, 0.48, z, 14));
    g.add(cyl(0.44, 0.44, 0.05, std("#222", { metalness: 0.6 }), x, 0.2, z, 14));
    g.add(cyl(0.44, 0.44, 0.05, std("#222", { metalness: 0.6 }), x, 0.76, z, 14));
    colliders.push(aabb(x, z, 0.85, 0.85));
  }

  // round tables with chairs
  const tableAt = (x: number, z: number, n: number) => {
    g.add(cyl(0.8, 0.8, 0.07, std("#7a4a22", { roughness: 0.55 }), x, 0.78, z, 24));
    g.add(cyl(0.08, 0.12, 0.75, std("#3d2410"), x, 0.38, z, 8));
    colliders.push(aabb(x, z, 1.4, 1.4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = x + Math.cos(a) * 1.25;
      const cz = z + Math.sin(a) * 1.25;
      const chair = new THREE.Group();
      chair.position.set(cx, 0, cz);
      const face = Math.atan2(-Math.cos(a), -Math.sin(a));
      chair.rotation.y = face;
      chair.add(box(0.48, 0.06, 0.48, std("#5a3519"), 0, 0.46, 0));
      chair.add(box(0.48, 0.55, 0.06, std("#5a3519"), 0, 0.75, -0.21));
      for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) chair.add(box(0.05, 0.45, 0.05, std("#3d2410"), lx, 0.22, lz));
      g.add(chair);
      seats.push({ id: `chair${x}_${z}_${i}`, pos: new THREE.Vector3(cx, 0.5, cz), ry: face });
    }
    // mugs
    for (let i = 0; i < 2; i++) g.add(cyl(0.07, 0.07, 0.15, std("#c9c0a8"), x + (i - 0.5) * 0.4, 0.89, z + 0.2, 10));
  };
  tableAt(-9, -6, 4);
  tableAt(9.5, 6.5, 4);
  tableAt(-9.5, 6, 3);
  tableAt(10, -3, 3);

  // fireplace (west wall)
  const stone = std("#ffffff", { map: noiseTexture("#6b6660", ["#4a4744", "#8a857c"], [2, 2], 500) });
  g.add(box(3.6, 3.2, 1.2, stone, -hw + 0.6, 1.6, -1.5));
  g.add(box(2, 1.4, 0.5, std("#120a05"), -hw + 1.02, 0.7, -1.5));
  colliders.push(aabb(-hw + 0.6, -1.5, 1.4, 3.8));
  const fireGroup = new THREE.Group();
  fireGroup.position.set(-hw + 1.15, 0.15, -1.5);
  g.add(fireGroup);
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 + Math.random() * 0.1, 0.6 + Math.random() * 0.4, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? "#ffb02e" : "#ff6a1a", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    f.position.set((Math.random() - 0.5) * 0.25, 0.3, (Math.random() - 0.5) * 1.0);
    fireGroup.add(f);
    flames.push(f);
  }
  for (let i = 0; i < 3; i++) fireGroup.add(cyl(0.07, 0.07, 1, std("#3a2210"), 0, 0.05, (i - 1) * 0.3).rotateZ(Math.PI / 2));
  const fireLight = new THREE.PointLight("#ff8a3a", 18, 14, 1.6);
  fireLight.position.set(-hw + 2, 1.2, -1.5);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  g.add(fireLight);

  // lanterns
  const lanterns: THREE.PointLight[] = [];
  for (const [x, z] of [[-6, -4], [6, -4], [-6, 5], [6, 5]]) {
    g.add(cyl(0.01, 0.01, 1.2, std("#222"), x, h - 0.6, z, 4));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffd38a" })), x, h - 1.3, z));
    const l = new THREE.PointLight("#ffc76a", 14, 14, 1.5);
    l.position.set(x, h - 1.4, z);
    g.add(l);
    lanterns.push(l);
  }

  // quest board (south-west wall)
  const qb = new THREE.Group();
  qb.position.set(-5.5, 0, hd - 0.15);
  qb.rotation.y = Math.PI;
  qb.add(box(4.2, 2.6, 0.12, std("#5c3a1c"), 0, 2, 0));
  qb.add(box(4, 2.4, 0.04, std("#a07d4f"), 0, 2, 0.07));
  CAMPAIGN_ORDER.forEach((id, i) => {
    const c = CAMPAIGNS[id];
    const note = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshStandardMaterial({
      map: canvasTex(220, 300, (ctx) => {
        ctx.fillStyle = "#efe2c2"; ctx.fillRect(0, 0, 220, 300);
        ctx.fillStyle = c.color; ctx.fillRect(0, 0, 220, 44);
        ctx.fillStyle = "#1a1208"; ctx.font = "bold 22px Georgia"; ctx.textAlign = "center";
        wrap(ctx, c.name, 110, 80, 190, 26);
        ctx.font = "16px Georgia"; ctx.fillStyle = "#4a3a20";
        wrap(ctx, c.tagline, 110, 170, 190, 20);
        ctx.fillStyle = "#8a1a1a"; ctx.font = "bold 18px Georgia"; ctx.fillText("REWARD", 110, 280);
      }),
    }));
    note.position.set((i - 1) * 1.3, 2, 0.1);
    note.rotation.z = (i - 1) * 0.05;
    qb.add(note);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.4), new THREE.MeshBasicMaterial({ map: canvasTex(512, 72, (ctx) => { ctx.fillStyle = "#2a1a0c"; ctx.fillRect(0, 0, 512, 72); ctx.fillStyle = "#f2c66d"; ctx.font = "bold 42px Georgia"; ctx.textAlign = "center"; ctx.fillText("QUEST BOARD", 256, 52); }) }));
  sign.position.set(0, 3.55, 0.08);
  qb.add(sign);
  g.add(qb);
  inter.push({ id: "quest", pos: new THREE.Vector3(-5.5, 1, hd - 1.2), radius: 2.4, label: "Choose an adventure", kind: "quest" });

  // mirror (east wall) — VRChat-style
  const mirror = new Reflector(new THREE.PlaneGeometry(4, 3), { textureWidth: 1024, textureHeight: 768, color: 0xb8c4d0, clipBias: 0.003 });
  mirror.position.set(hw - 0.06, 1.75, 1);
  mirror.rotation.y = -Math.PI / 2;
  g.add(mirror);
  g.add(box(0.1, 3.3, 4.3, std("#c9a14a", { metalness: 0.8, roughness: 0.3 }), hw - 0.03, 1.75, 1));
  inter.push({ id: "mirror", pos: new THREE.Vector3(hw - 1.5, 1, 1), radius: 2.6, label: "Change your look", kind: "mirror" });
  // wardrobe
  const wardrobe = box(1.6, 2.6, 0.8, std("#4a2c14"), hw - 0.45, 1.3, 4.6);
  g.add(wardrobe);
  colliders.push(aabb(hw - 0.45, 4.6, 0.9, 1.6));

  // scribe's desk (north-east) — character creation
  g.add(box(2, 0.08, 1, std("#6b4423"), hw - 2.5, 0.85, -hd + 1.4));
  for (const [lx, lz] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) g.add(box(0.08, 0.85, 0.08, std("#3d2410"), hw - 2.5 + lx, 0.42, -hd + 1.4 + lz));
  g.add(box(0.6, 0.08, 0.45, std("#efe2c2"), hw - 2.6, 0.92, -hd + 1.4));
  g.add(cyl(0.04, 0.04, 0.2, std("#f2ead0"), hw - 1.9, 0.99, -hd + 1.3, 8));
  const candle = new THREE.PointLight("#ffcf7a", 2.5, 4, 2);
  candle.position.set(hw - 1.9, 1.2, -hd + 1.3);
  g.add(candle);
  colliders.push(aabb(hw - 2.5, -hd + 1.4, 2.1, 1.1));
  inter.push({ id: "desk", pos: new THREE.Vector3(hw - 2.5, 1, -hd + 2.4), radius: 2.2, label: "Create or edit your character", kind: "desk" });

  // music box (south-east)
  const jb = new THREE.Group();
  jb.position.set(hw - 1.2, 0, hd - 1.2);
  jb.add(box(1, 1.4, 0.7, std("#6a2f5a"), 0, 0.7, 0));
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 20, 1, true, 0, Math.PI), new THREE.MeshBasicMaterial({ color: "#ff9ad5", transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  glow.position.y = 1.55;
  glow.rotation.y = Math.PI;
  jb.add(glow);
  g.add(jb);
  colliders.push(aabb(hw - 1.2, hd - 1.2, 1.1, 0.8));
  inter.push({ id: "jukebox", pos: new THREE.Vector3(hw - 1.2, 1, hd - 2.1), radius: 1.8, label: "Change the music", kind: "jukebox" });

  // dice tray (south) — practise rolling
  g.add(cyl(0.6, 0.6, 0.9, std("#3d2410"), 4, 0.45, hd - 2.5, 16));
  g.add(cyl(0.55, 0.5, 0.06, std("#1f4a2a"), 4, 0.92, hd - 2.5, 24));
  colliders.push(aabb(4, hd - 2.5, 1.2, 1.2));
  inter.push({ id: "dice", pos: new THREE.Vector3(4, 1, hd - 2.5), radius: 1.9, label: "Roll a d20 for luck", kind: "dice" });

  // the door
  g.add(box(2.2, 3.2, 0.2, std("#4a2c14"), 4, 1.6, hd - 0.05));
  g.add(cyl(0.08, 0.08, 0.04, std("#c9a14a", { metalness: 0.9 }), 3.3, 1.5, hd - 0.18, 10).rotateX(Math.PI / 2));

  // dartboard (west wall, south) and the bard's corner
  const dart = new THREE.Group(); dart.position.set(-hw + 0.08, 1.8, 6); dart.rotation.y = Math.PI / 2;
  ["#1a1a1a", "#e8dcc0", "#a82a2a", "#e8dcc0", "#2a7a3a", "#a82a2a"].forEach((c, i) => { const r = new THREE.Mesh(new THREE.CircleGeometry(0.45 - i * 0.07, 24), std(c)); r.position.z = i * 0.002; dart.add(r); });
  g.add(dart);
  const darts: THREE.Mesh[] = [];
  const fxp = new Fx(g);
  const lute = new THREE.Group(); lute.position.set(-hw + 1.2, 0, 9.3);
  lute.add(box(1.6, 0.3, 1.4, std("#5a3519"), 0, 0.15, 0));
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), std("#a0602a")); body.scale.z = 0.4; body.position.set(0, 0.9, 0); lute.add(body);
  lute.add(box(0.06, 0.6, 0.04, std("#3a2412"), 0, 1.3, 0));
  g.add(lute);
  inter.push(spot("darts", "Throw a dart", -hw + 2, 1, 6, 2.5), spot("lute", "Strum the abandoned lute", -hw + 2, 1, 9, 2));

  // ambient
  const hemi = new THREE.HemisphereLight("#ffd9a8", "#2a1608", 0.55);
  g.add(hemi);

  const update = (t: number, _dt: number, viewer: THREE.Vector3) => {
    // mirrors are expensive: only render when someone is close (like VRChat's mirror toggles)
    mirror.visible = Math.hypot(viewer.x - mirror.position.x, viewer.z - mirror.position.z) < 10;
    flames.forEach((f, i) => {
      f.scale.y = 0.8 + Math.sin(t * 9 + i * 1.7) * 0.25 + Math.random() * 0.1;
      f.position.y = 0.3 + Math.sin(t * 7 + i) * 0.03;
    });
    fireLight.intensity = 16 + Math.sin(t * 13) * 2 + Math.random() * 2;
    lanterns.forEach((l, i) => (l.intensity = 14 + Math.sin(t * 3 + i) * 0.8));
    glow.rotation.y = Math.PI + Math.sin(t * 1.5) * 0.1;
    (glow.material as THREE.MeshBasicMaterial).color.setHSL((t * 0.05) % 1, 0.8, 0.7);
  };

  const onFx = (id: string) => {
    if (id === "darts") {
      const d = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.18, 6), std("#c83a3a"));
      const off = new THREE.Vector2((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9);
      d.rotation.z = -Math.PI / 2; d.position.set(-hw + 0.15, 1.8 + off.y, 6 + off.x);
      g.add(d); darts.push(d);
      if (darts.length > 6) g.remove(darts.shift()!);
      sound.sfx(off.length() < 0.12 ? "levelup" : "miss");
      if (off.length() < 0.12) fxp.burst(new THREE.Vector3(-hw + 0.3, 1.8, 6), "#ffd84a", 40, 1.5);
    }
    if (id === "lute") { sound.sfx("chime"); setTimeout(() => sound.sfx("chime"), 250); fxp.burst(new THREE.Vector3(-hw + 1.2, 1.2, 9.3), "#ffd0a0", 20, 1.5); }
  };
  return { group: g, colliders, seats, interactables: inter, update: (t: number, dt: number, viewer: THREE.Vector3) => { update(t, dt, viewer); fxp.update(dt); }, onFx, bounds: 12.5 };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = word; y += lh; }
    else line = test;
  }
  ctx.fillText(line, x, y);
}
