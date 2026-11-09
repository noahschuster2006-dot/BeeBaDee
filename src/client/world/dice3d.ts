// Physical-looking dice that tumble onto the table whenever anyone rolls.

import * as THREE from "three";
import { textSprite } from "./avatar";

interface Die { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; age: number; label?: THREE.Sprite; value: number; sides: number; floor: number; settled: boolean }

const GEOS: Record<number, () => THREE.BufferGeometry> = {
  4: () => new THREE.TetrahedronGeometry(0.11),
  6: () => new THREE.BoxGeometry(0.13, 0.13, 0.13),
  8: () => new THREE.OctahedronGeometry(0.1),
  10: () => new THREE.DodecahedronGeometry(0.095),
  12: () => new THREE.DodecahedronGeometry(0.1),
  20: () => new THREE.IcosahedronGeometry(0.11),
  100: () => new THREE.DodecahedronGeometry(0.1),
};

const COLORS: Record<number, string> = { 4: "#4ab0ff", 6: "#f2f2f2", 8: "#9a5cff", 10: "#3aff8a", 12: "#ff8a3a", 20: "#e8304a", 100: "#ffd23a" };

export class DiceTray {
  private dice: Die[] = [];
  constructor(private scene: THREE.Scene) {}

  throw(values: { sides: number; value: number }[], at: THREE.Vector3, floorY: number) {
    const list = values.slice(0, 12);
    list.forEach((v, i) => {
      const geo = (GEOS[v.sides] ?? GEOS[20])();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: COLORS[v.sides] ?? "#e8304a", roughness: 0.25, metalness: 0.1, flatShading: true }));
      m.castShadow = true;
      m.position.set(at.x + (Math.random() - 0.5) * 0.6 + i * 0.05, floorY + 1.2 + Math.random() * 0.4, at.z + (Math.random() - 0.5) * 0.6);
      const toCenter = new THREE.Vector3(-at.x, 0, -at.z).normalize().multiplyScalar(1.2 + Math.random());
      this.scene.add(m);
      this.dice.push({ mesh: m, vel: new THREE.Vector3(toCenter.x, 0.5, toCenter.z), spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20), age: 0, value: v.value, sides: v.sides, floor: floorY, settled: false });
    });
  }

  update(dt: number) {
    for (const d of this.dice) {
      d.age += dt;
      if (!d.settled) {
        d.vel.y -= 9.8 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        d.mesh.rotation.x += d.spin.x * dt;
        d.mesh.rotation.y += d.spin.y * dt;
        d.mesh.rotation.z += d.spin.z * dt;
        const floor = d.floor + 0.07;
        if (d.mesh.position.y < floor) {
          d.mesh.position.y = floor;
          d.vel.y = Math.abs(d.vel.y) * 0.4;
          d.vel.x *= 0.6;
          d.vel.z *= 0.6;
          d.spin.multiplyScalar(0.5);
        }
        if (d.age > 1.3) {
          d.settled = true;
          const crit = d.sides === 20 && (d.value === 20 || d.value === 1);
          d.label = textSprite([{ text: String(d.value), size: 64, bold: true, color: crit ? (d.value === 20 ? "#7dffa0" : "#ff6a6a") : "#ffffff" }], { scale: 0.003 });
          d.label.position.copy(d.mesh.position).add(new THREE.Vector3(0, 0.25 + (this.dice.indexOf(d) % 3) * 0.12, 0));
          this.scene.add(d.label);
        }
      }
      if (d.age > 5) {
        const k = Math.max(0, 1 - (d.age - 5));
        d.mesh.scale.setScalar(k);
        if (d.label) d.label.material.opacity = k;
      }
    }
    const done = this.dice.filter((d) => d.age > 6);
    for (const d of done) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
      if (d.label) { this.scene.remove(d.label); d.label.material.map?.dispose(); d.label.material.dispose(); }
    }
    this.dice = this.dice.filter((d) => d.age <= 6);
  }
}
