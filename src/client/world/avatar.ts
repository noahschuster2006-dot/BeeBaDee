// Procedural, customisable humanoid avatars with simple procedural animation (walk, run, jump, emotes, sit).

import * as THREE from "three";
import type { AvatarLook, Emote } from "../../shared/types";

export interface AvatarRig {
  root: THREE.Group;
  body: THREE.Group; // scaled by height
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group; armR: THREE.Group;
  foreL: THREE.Group; foreR: THREE.Group;
  legL: THREE.Group; legR: THREE.Group;
  shinL: THREE.Group; shinR: THREE.Group;
  cape?: THREE.Object3D;
  wings?: THREE.Object3D[];
  phase: number;
  blend: number; // 0 idle → 1 walking
  look: AvatarLook;
  eyeGlow?: THREE.MeshStandardMaterial;
}

const mat = (color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

function limb(len: number, radius: number, m: THREE.Material) {
  const g = new THREE.Group();
  const cap = mesh(new THREE.CapsuleGeometry(radius, len - radius * 2, 4, 10), m, 0, -len / 2, 0);
  g.add(cap);
  return g;
}

export function buildAvatar(look: AvatarLook): AvatarRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(look.height);
  root.add(body);

  const skin = mat(look.skin);
  const prim = mat(look.primary);
  const sec = mat(look.secondary);
  const hairM = mat(look.hairColor, { roughness: 0.9 });
  const metal = mat(look.secondary, { metalness: 0.7, roughness: 0.35 });
  const w = look.build;

  // legs
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  body.add(hips);
  const pants = look.outfit === "armor" ? metal : sec;
  const mkLeg = (side: number) => {
    const leg = limb(0.46, 0.085, pants);
    leg.position.set(0.1 * side * w, 0, 0);
    const shin = limb(0.44, 0.075, pants);
    shin.position.y = -0.46;
    const boot = mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), mat("#2a211b"), 0, -0.42, 0.04);
    shin.add(boot);
    leg.add(shin);
    hips.add(leg);
    return [leg, shin] as const;
  };
  const [legL, shinL] = mkLeg(1);
  const [legR, shinR] = mkLeg(-1);

  // torso
  const torso = new THREE.Group();
  hips.add(torso);
  const chestM = look.outfit === "armor" ? metal : prim;
  const chest = mesh(new THREE.CapsuleGeometry(0.17 * w, 0.32, 4, 12), chestM, 0, 0.27, 0);
  chest.scale.set(1.05, 1, 0.68);
  torso.add(chest);
  const belt = mesh(new THREE.CylinderGeometry(0.165 * w, 0.165 * w, 0.06, 14), mat("#3a2a1a"), 0, 0.06, 0);
  belt.scale.z = 0.72;
  torso.add(belt);

  if (look.outfit === "robe" || look.outfit === "cloak") {
    const skirt = mesh(new THREE.CylinderGeometry(0.17 * w, 0.32 * w, 0.85, 16, 1, true), look.outfit === "robe" ? prim : sec, 0, -0.36, 0);
    skirt.scale.z = 0.8;
    (skirt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    torso.add(skirt);
  }
  if (look.outfit === "armor") {
    for (const s of [1, -1]) torso.add(mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal, 0.2 * s * w, 0.47, 0));
    torso.add(mesh(new THREE.BoxGeometry(0.2, 0.22, 0.04), prim, 0, 0.3, 0.12));
  }
  if (look.outfit === "jacket") {
    const collar = mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16, Math.PI * 1.4), sec, 0, 0.5, 0.02);
    collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.3);
    torso.add(collar);
    torso.add(mesh(new THREE.BoxGeometry(0.03, 0.4, 0.02), sec, 0, 0.26, 0.125));
  }
  if (look.outfit === "hoodie") {
    const hood = mesh(new THREE.SphereGeometry(0.15, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), prim, 0, 0.5, -0.1);
    hood.rotation.x = -1.2;
    torso.add(hood);
    torso.add(mesh(new THREE.BoxGeometry(0.22, 0.1, 0.02), sec, 0, 0.18, 0.125));
  }
  if (look.outfit === "tunic") {
    torso.add(mesh(new THREE.BoxGeometry(0.3 * w, 0.06, 0.25), sec, 0, 0.45, 0));
  }

  // arms
  const sleeve = look.outfit === "armor" ? metal : prim;
  const mkArm = (side: number) => {
    const arm = limb(0.3, 0.065, sleeve);
    arm.position.set(0.24 * side * w, 0.47, 0);
    const fore = limb(0.28, 0.058, look.outfit === "tunic" ? skin : sleeve);
    fore.position.y = -0.3;
    const hand = mesh(new THREE.SphereGeometry(0.06, 10, 8), skin, 0, -0.29, 0);
    fore.add(hand);
    arm.add(fore);
    torso.add(arm);
    return [arm, fore] as const;
  };
  const [armL, foreL] = mkArm(1);
  const [armR, foreR] = mkArm(-1);

  // head
  const head = new THREE.Group();
  head.position.y = 0.62;
  torso.add(head);
  head.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), skin, 0, -0.03, 0));
  let eyeGlow: THREE.MeshStandardMaterial | undefined;
  const eyeMat = mat(look.eyes, { emissive: new THREE.Color(look.eyes), emissiveIntensity: look.head === "robot" || look.head === "bug" ? 1.4 : 0.1 });
  eyeGlow = eyeMat;
  const eyes = (z: number, y: number, r: number, spread: number) => {
    for (const s of [1, -1]) head.add(mesh(new THREE.SphereGeometry(r, 10, 8), eyeMat, spread * s, y, z));
  };

  switch (look.head) {
    case "human": {
      head.add(mesh(new THREE.SphereGeometry(0.13, 18, 14), skin, 0, 0.12, 0));
      eyes(0.115, 0.14, 0.018, 0.045);
      head.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), skin, 0, 0.1, 0.13));
      break;
    }
    case "bug": {
      const shell = mesh(new THREE.SphereGeometry(0.15, 18, 14), mat(look.skin, { roughness: 0.3, metalness: 0.2 }), 0, 0.14, 0);
      shell.scale.set(1, 1.25, 1);
      head.add(shell);
      for (const s of [1, -1]) {
        const e = mesh(new THREE.SphereGeometry(0.05, 12, 10), eyeMat, 0.07 * s, 0.14, 0.11);
        e.scale.set(1, 1.3, 0.6);
        head.add(e);
      }
      for (const s of [1, -1]) {
        const ant = mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.28, 6), sec, 0.06 * s, 0.38, 0);
        ant.rotation.z = -0.35 * s;
        head.add(ant);
        head.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeMat, 0.11 * s, 0.51, 0));
      }
      break;
    }
    case "robot": {
      head.add(mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), metal, 0, 0.13, 0));
      const visor = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), eyeMat, 0, 0.15, 0.125);
      head.add(visor);
      head.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 6), metal, 0.08, 0.31, 0));
      head.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), eyeMat, 0.08, 0.38, 0));
      break;
    }
    case "beast": {
      head.add(mesh(new THREE.SphereGeometry(0.14, 18, 14), skin, 0, 0.12, 0));
      const snout = mesh(new THREE.SphereGeometry(0.07, 12, 10), skin, 0, 0.08, 0.12);
      snout.scale.set(1, 0.8, 1);
      head.add(snout);
      head.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), mat("#222"), 0, 0.1, 0.19));
      for (const s of [1, -1]) {
        const ear = mesh(new THREE.ConeGeometry(0.05, 0.12, 8), skin, 0.09 * s, 0.27, 0);
        ear.rotation.z = -0.3 * s;
        head.add(ear);
      }
      eyes(0.12, 0.16, 0.02, 0.05);
      break;
    }
    case "skull": {
      const bone = mat("#e9e3d0", { roughness: 0.6 });
      head.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), bone, 0, 0.13, 0));
      head.add(mesh(new THREE.BoxGeometry(0.13, 0.06, 0.1), bone, 0, 0.02, 0.05));
      for (const s of [1, -1]) head.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), mat("#111", { emissive: new THREE.Color(look.eyes), emissiveIntensity: 0.8 }), 0.05 * s, 0.13, 0.1));
      break;
    }
  }

  // hair (not for robots/skulls/bugs)
  if (look.head === "human" || look.head === "beast") {
    switch (look.hair) {
      case "short": head.add(mesh(new THREE.SphereGeometry(0.137, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), hairM, 0, 0.14, -0.01)); break;
      case "long": {
        head.add(mesh(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, 0, 0.13, -0.01));
        head.add(mesh(new THREE.BoxGeometry(0.25, 0.32, 0.08), hairM, 0, -0.02, -0.1));
        break;
      }
      case "mohawk": head.add(mesh(new THREE.BoxGeometry(0.04, 0.12, 0.26), hairM, 0, 0.27, -0.01)); break;
      case "bun": {
        head.add(mesh(new THREE.SphereGeometry(0.137, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), hairM, 0, 0.14, -0.01));
        head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), hairM, 0, 0.26, -0.09));
        break;
      }
      case "spiky":
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const spike = mesh(new THREE.ConeGeometry(0.04, 0.14, 6), hairM, Math.cos(a) * 0.08, 0.25, Math.sin(a) * 0.08 - 0.02);
          spike.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
          head.add(spike);
        }
        break;
    }
  }

  // hats
  const hatM = mat(look.secondary);
  switch (look.hat) {
    case "wizard": {
      head.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), hatM, 0, 0.23, 0));
      const cone = mesh(new THREE.ConeGeometry(0.13, 0.42, 16), hatM, 0, 0.45, -0.02);
      cone.rotation.x = -0.15;
      head.add(cone);
      break;
    }
    case "hood": {
      const h = mesh(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hatM, 0, 0.12, -0.02);
      head.add(h);
      break;
    }
    case "crown": {
      const gold = mat("#e8c14a", { metalness: 0.9, roughness: 0.25 });
      head.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 12, 1, true), gold, 0, 0.27, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        head.add(mesh(new THREE.ConeGeometry(0.025, 0.07, 4), gold, Math.cos(a) * 0.12, 0.33, Math.sin(a) * 0.12));
      }
      break;
    }
    case "visor": head.add(mesh(new THREE.BoxGeometry(0.28, 0.05, 0.05), mat("#1af0ff", { emissive: new THREE.Color("#1af0ff"), emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }), 0, 0.15, 0.13)); break;
    case "horns":
      for (const s of [1, -1]) {
        const horn = mesh(new THREE.ConeGeometry(0.035, 0.2, 8), mat("#eae0c8"), 0.1 * s, 0.3, 0);
        horn.rotation.z = -0.5 * s;
        head.add(horn);
      }
      break;
    case "antennae":
      for (const s of [1, -1]) {
        const ant = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 6), hatM, 0.05 * s, 0.37, 0);
        ant.rotation.z = -0.25 * s;
        head.add(ant);
        head.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(look.primary, { emissive: new THREE.Color(look.primary), emissiveIntensity: 0.8 }), 0.085 * s, 0.49, 0));
      }
      break;
    case "tophat":
      head.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.015, 20), mat("#1a1a1a"), 0, 0.25, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 20), mat("#1a1a1a"), 0, 0.36, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.03, 20), mat(look.primary), 0, 0.27, 0));
      break;
  }

  // accessories
  let cape: THREE.Object3D | undefined;
  let wings: THREE.Object3D[] | undefined;
  switch (look.accessory) {
    case "cape": {
      const g = new THREE.PlaneGeometry(0.46 * w, 0.95, 1, 6);
      g.translate(0, -0.47, 0);
      const c = mesh(g, mat(look.secondary, { side: THREE.DoubleSide }), 0, 0.5, -0.13);
      c.rotation.x = 0.1;
      torso.add(c);
      cape = c;
      break;
    }
    case "backpack":
      torso.add(mesh(new THREE.BoxGeometry(0.28, 0.34, 0.14), mat("#6b4a2b"), 0, 0.3, -0.18));
      { const roll = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), mat("#a8885a"), 0, 0.5, -0.18); roll.rotation.z = Math.PI / 2; torso.add(roll); }
      break;
    case "wings": {
      wings = [];
      for (const s of [1, -1]) {
        const g = new THREE.CircleGeometry(0.42, 12, 0, Math.PI / 2);
        const wm = mesh(g, mat(look.primary, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, emissive: new THREE.Color(look.primary), emissiveIntensity: 0.3 }), 0.05 * s, 0.4, -0.12);
        wm.rotation.set(0, s > 0 ? -0.4 : Math.PI + 0.4, 0);
        torso.add(wm);
        wings.push(wm);
      }
      break;
    }
    case "scarf": {
      const sc = mesh(new THREE.TorusGeometry(0.1, 0.04, 8, 16), mat(look.secondary), 0, 0.55, 0);
      sc.rotation.x = Math.PI / 2;
      torso.add(sc);
      torso.add(mesh(new THREE.BoxGeometry(0.06, 0.28, 0.03), mat(look.secondary), 0.06, 0.4, 0.12));
      break;
    }
  }

  return { root, body, hips, torso, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, cape, wings, phase: Math.random() * 6, blend: 0, look, eyeGlow };
}

export function disposeAvatar(r: AvatarRig) {
  r.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
}

/** Procedural animation. `moving`: 0 idle, 1 walk, 2 run. */
export function animateAvatar(r: AvatarRig, dt: number, t: number, moving: number, air: boolean, emote: Emote, seated: boolean) {
  const target = moving > 0 ? 1 : 0;
  r.blend += (target - r.blend) * Math.min(1, dt * 8);
  const speed = moving === 2 ? 11 : 7;
  r.phase += dt * speed * (moving > 0 ? 1 : 0.25);
  const sw = Math.sin(r.phase);
  const amp = (moving === 2 ? 0.9 : 0.55) * r.blend;

  // reset
  r.hips.position.y = 0.92;
  r.hips.rotation.set(0, 0, 0);
  r.torso.rotation.set(0, 0, 0);
  r.head.rotation.set(0, 0, 0);
  r.armL.rotation.set(0, 0, 0.08);
  r.armR.rotation.set(0, 0, -0.08);
  r.foreL.rotation.set(0, 0, 0);
  r.foreR.rotation.set(0, 0, 0);

  // legs
  r.legL.rotation.set(sw * amp, 0, 0);
  r.legR.rotation.set(-sw * amp, 0, 0);
  r.shinL.rotation.set(Math.max(0, -Math.cos(r.phase)) * amp * 1.2, 0, 0);
  r.shinR.rotation.set(Math.max(0, Math.cos(r.phase)) * amp * 1.2, 0, 0);
  r.armL.rotation.x = -sw * amp * 0.8;
  r.armR.rotation.x = sw * amp * 0.8;
  r.foreL.rotation.x = -0.3 * r.blend;
  r.foreR.rotation.x = -0.3 * r.blend;
  r.hips.position.y += Math.abs(Math.cos(r.phase)) * 0.04 * r.blend;
  r.torso.rotation.x = (moving === 2 ? 0.18 : 0.05) * r.blend;

  // idle breathing
  const breath = Math.sin(t * 1.6 + r.phase) * 0.012 * (1 - r.blend);
  r.torso.position.y = breath;
  r.head.rotation.y = Math.sin(t * 0.4 + r.phase) * 0.15 * (1 - r.blend);

  if (air) {
    r.legL.rotation.x = 0.5;
    r.legR.rotation.x = -0.1;
    r.shinL.rotation.x = 0.8;
    r.shinR.rotation.x = 0.4;
    r.armL.rotation.z = 0.9;
    r.armR.rotation.z = -0.9;
  }

  if (seated) {
    r.hips.position.y = 0.5;
    r.legL.rotation.x = -1.5;
    r.legR.rotation.x = -1.5;
    r.shinL.rotation.x = 1.5;
    r.shinR.rotation.x = 1.5;
    r.armL.rotation.x = -0.6;
    r.armR.rotation.x = -0.6;
    r.foreL.rotation.x = -0.5;
    r.foreR.rotation.x = -0.5;
  }

  if (!air && moving === 0) {
    switch (emote) {
      case "wave":
        r.armR.rotation.set(0, 0, -2.6 + Math.sin(t * 9) * 0.35);
        r.foreR.rotation.set(0, 0, -0.3);
        break;
      case "dance":
        r.hips.position.y = 0.9 + Math.abs(Math.sin(t * 6)) * 0.06;
        r.hips.rotation.y = Math.sin(t * 3) * 0.5;
        r.armL.rotation.set(-1.2 + Math.sin(t * 6) * 0.6, 0, 0.6);
        r.armR.rotation.set(-1.2 - Math.sin(t * 6) * 0.6, 0, -0.6);
        r.legL.rotation.x = Math.max(0, Math.sin(t * 6)) * 0.5;
        r.legR.rotation.x = Math.max(0, -Math.sin(t * 6)) * 0.5;
        r.head.rotation.z = Math.sin(t * 6) * 0.2;
        break;
      case "clap": {
        const c = Math.abs(Math.sin(t * 10));
        r.armL.rotation.set(-1.2, 0, -0.3 - c * 0.3);
        r.armR.rotation.set(-1.2, 0, 0.3 + c * 0.3);
        r.foreL.rotation.x = -0.6;
        r.foreR.rotation.x = -0.6;
        break;
      }
      case "cheer":
        r.armL.rotation.set(0, 0, 2.8 + Math.sin(t * 8) * 0.15);
        r.armR.rotation.set(0, 0, -2.8 - Math.sin(t * 8) * 0.15);
        r.hips.position.y = 0.92 + Math.abs(Math.sin(t * 5)) * 0.12;
        break;
      case "sit":
        if (!seated) {
          r.hips.position.y = 0.3;
          r.legL.rotation.x = -1.5;
          r.legR.rotation.x = -1.5;
          r.shinL.rotation.x = 1.9;
          r.shinR.rotation.x = 1.9;
          r.armL.rotation.set(-0.4, 0, 0.3);
          r.armR.rotation.set(-0.4, 0, -0.3);
        }
        break;
      case "point":
        r.armR.rotation.set(-1.5, 0, 0);
        r.head.rotation.x = 0.1;
        break;
      case "bow":
        r.torso.rotation.x = 0.9;
        r.armL.rotation.x = 0.4;
        r.armR.rotation.x = 0.4;
        break;
      case "laugh":
        r.torso.rotation.x = -0.15 + Math.sin(t * 14) * 0.06;
        r.head.rotation.x = -0.3;
        r.armL.rotation.set(-0.6, 0, 0.3);
        r.armR.rotation.set(-0.6, 0, -0.3);
        break;
    }
  }

  if (r.cape) r.cape.rotation.x = 0.1 + r.blend * (moving === 2 ? 0.9 : 0.45) + Math.sin(t * 3) * 0.04;
  if (r.wings) r.wings.forEach((wg, i) => (wg.rotation.y = (i === 0 ? -0.4 : Math.PI + 0.4) + Math.sin(t * (air ? 18 : 2)) * (air ? 0.5 : 0.08) * (i === 0 ? 1 : -1)));
}

/** Canvas-texture sprite used for nameplates and chat bubbles. */
export function textSprite(lines: { text: string; color?: string; size?: number; bold?: boolean }[], opts: { bg?: string; maxWidth?: number; scale?: number } = {}) {
  const pad = 14;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const maxW = opts.maxWidth ?? 480;
  const wrapped: { text: string; color: string; font: string; size: number }[] = [];
  for (const l of lines) {
    const size = l.size ?? 28;
    const font = `${l.bold ? "700" : "500"} ${size}px system-ui, sans-serif`;
    ctx.font = font;
    let cur = "";
    for (const word of l.text.split(" ")) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > maxW && cur) { wrapped.push({ text: cur, color: l.color ?? "#fff", font, size }); cur = word; }
      else cur = test;
    }
    wrapped.push({ text: cur, color: l.color ?? "#fff", font, size });
  }
  const widths = wrapped.map((l) => { ctx.font = l.font; return ctx.measureText(l.text).width; });
  c.width = Math.ceil(Math.max(...widths) + pad * 2);
  c.height = Math.ceil(wrapped.reduce((s, l) => s + l.size * 1.25, 0) + pad * 1.4);
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    const r = 18;
    ctx.beginPath();
    ctx.roundRect(0, 0, c.width, c.height, r);
    ctx.fill();
  }
  let y = pad * 0.7;
  wrapped.forEach((l) => {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = opts.bg ? 0 : 6;
    ctx.fillText(l.text, c.width / 2, y);
    y += l.size * 1.25;
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  const k = (opts.scale ?? 0.0022);
  sprite.scale.set(c.width * k, c.height * k, 1);
  return sprite;
}
