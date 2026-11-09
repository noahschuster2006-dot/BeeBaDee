// First-person cartoon hands: they bob while you walk, swing when you jump, and act out emotes.

import * as THREE from "three";
import type { AvatarLook, Emote } from "../../shared/types";

export class Hands {
  group = new THREE.Group();
  private left = new THREE.Group();
  private right = new THREE.Group();
  private key = "";
  private phase = 0;

  constructor() {
    this.group.add(this.left, this.right);
  }

  private build(look: AvatarLook) {
    const key = `${look.skin}${look.primary}${look.secondary}${look.outfit}`;
    if (key === this.key) return;
    this.key = key;
    for (const side of [this.left, this.right]) {
      side.clear();
      const skin = new THREE.MeshStandardMaterial({ color: look.skin });
      const sleeve = new THREE.MeshStandardMaterial({ color: look.outfit === "armor" ? look.secondary : look.primary });
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 6, 12), sleeve);
      arm.rotation.x = Math.PI / 2;
      arm.position.z = 0.25;
      side.add(arm);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 16), new THREE.MeshStandardMaterial({ color: look.secondary }));
      cuff.position.z = -0.02;
      side.add(cuff);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), skin);
      fist.scale.set(1, 0.85, 1.15);
      fist.position.z = -0.1;
      side.add(fist);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.06, 4, 8), skin);
      thumb.position.set(side === this.left ? 0.07 : -0.07, 0.02, -0.13);
      thumb.rotation.x = Math.PI / 2.4;
      side.add(thumb);
    }
  }

  /** moving: 0 idle, 1 walk, 2 run. */
  update(dt: number, t: number, look: AvatarLook, moving: number, air: boolean, emote: Emote, visible: boolean, bob: boolean) {
    this.build(look);
    this.group.visible = visible;
    if (!visible) return;
    this.phase += dt * (moving === 2 ? 11 : moving === 1 ? 7 : 1.5);
    const amp = moving ? (moving === 2 ? 0.05 : 0.03) : 0.008;
    const sway = bob ? Math.sin(this.phase) * amp : 0;
    const lift = bob ? Math.abs(Math.cos(this.phase)) * amp : 0;
    // resting pose, low in the corners of the view like a sketched comic panel
    this.left.position.set(-0.32 + sway * 0.5, -0.36 + lift + (air ? 0.08 : 0), -0.55);
    this.right.position.set(0.32 + sway * 0.5, -0.36 - lift + (air ? 0.08 : 0), -0.55);
    this.left.rotation.set(0.15, 0.25, 0.25);
    this.right.rotation.set(0.15, -0.25, -0.25);
    switch (emote) {
      case "wave":
        this.right.position.set(0.3, -0.05, -0.6);
        this.right.rotation.set(-0.6, -0.2, -0.4 + Math.sin(t * 9) * 0.5);
        break;
      case "clap": {
        const c = Math.abs(Math.sin(t * 10));
        this.left.position.set(-0.04 - c * 0.12, -0.2, -0.55);
        this.right.position.set(0.04 + c * 0.12, -0.2, -0.55);
        this.left.rotation.set(-0.3, 0.9, 1.3);
        this.right.rotation.set(-0.3, -0.9, -1.3);
        break;
      }
      case "cheer":
        this.left.position.set(-0.3, 0.12 + Math.sin(t * 8) * 0.04, -0.6);
        this.right.position.set(0.3, 0.12 - Math.sin(t * 8) * 0.04, -0.6);
        this.left.rotation.set(-1.2, 0, 0.2);
        this.right.rotation.set(-1.2, 0, -0.2);
        break;
      case "point":
        this.right.position.set(0.18, -0.18, -0.75);
        this.right.rotation.set(0, 0, 0);
        break;
      case "dance":
        this.left.position.y += Math.sin(t * 6) * 0.1;
        this.right.position.y -= Math.sin(t * 6) * 0.1;
        break;
    }
  }
}
