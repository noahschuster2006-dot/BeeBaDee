// The game's drawn look: cel-shaded materials with pen-hatching in the shadows, and ink outlines.
// Every world, avatar and miniature is passed through toonify() so builders can stay simple.

import * as THREE from "three";

let gradient: THREE.DataTexture | null = null;
/** Three hard bands of light, like a cartoon cel. */
function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 150, 220, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export const styleSettings = { hatching: true };

/** Screen-space pen hatching in the darker tones: one direction for shade, cross-hatching for deep shadow. */
function addHatching(mat: THREE.Material) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHatch = { value: styleSettings.hatching ? 1 : 0 };
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform float uHatch;\nvoid main() {")
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        if (uHatch > 0.5) {
          float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          vec2 p = gl_FragCoord.xy;
          float a = abs(fract((p.x + p.y) * 0.125) - 0.5);
          float b = abs(fract((p.x - p.y) * 0.125) - 0.5);
          float ink = 0.0;
          if (lum < 0.36) ink = max(ink, smoothstep(0.14, 0.05, a) * smoothstep(0.36, 0.16, lum));
          if (lum < 0.2) ink = max(ink, smoothstep(0.16, 0.06, b) * smoothstep(0.2, 0.05, lum));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.35 + vec3(0.03, 0.025, 0.02), ink * 0.55);
        }`,
      );
  };
  mat.customProgramCacheKey = () => `hatch-${styleSettings.hatching ? 1 : 0}`;
}

const cache = new WeakMap<THREE.Material, THREE.Material>();

/** Converts a lit material into a cel-shaded, hatched one (keeps colour, textures, glow and transparency). */
export function toonMaterial(src: THREE.Material): THREE.Material {
  const hit = cache.get(src);
  if (hit) return hit;
  if (!(src instanceof THREE.MeshStandardMaterial) && !(src instanceof THREE.MeshPhongMaterial) && !(src instanceof THREE.MeshLambertMaterial)) return src;
  const s = src as THREE.MeshStandardMaterial;
  const m = new THREE.MeshToonMaterial({
    color: s.color.clone(),
    map: s.map ?? null,
    gradientMap: gradientMap(),
    emissive: s.emissive?.clone() ?? new THREE.Color(0),
    emissiveIntensity: s.emissiveIntensity ?? 0,
    emissiveMap: s.emissiveMap ?? null,
    transparent: s.transparent,
    opacity: s.opacity,
    side: s.side,
    depthWrite: s.depthWrite,
  });
  addHatching(m);
  if (s.transparent || s.opacity < 1) m.userData.outlineParameters = { visible: false };
  cache.set(src, m);
  return m;
}

/** Walk an object tree and make everything look drawn. */
export function toonify(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.keepMaterial) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(toonMaterial);
    else mesh.material = toonMaterial(mesh.material);
    const mat = mesh.material as THREE.Material;
    // glowing bulbs, signs and effects shouldn't get heavy ink rims
    if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && ((mat as THREE.MeshBasicMaterial).transparent || mat.blending === THREE.AdditiveBlending)) mat.userData.outlineParameters = { visible: false };
  });
  return root;
}

/** Paper grain for the full-screen sketchbook overlay (generated once, as a data URL). */
export function paperGrainUrl() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.random() * 55;
    img.data[i] = v; img.data[i + 1] = v * 0.97; img.data[i + 2] = v * 0.9; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // fibres
  ctx.strokeStyle = "rgba(120,100,70,0.08)";
  for (let i = 0; i < 160; i++) {
    ctx.beginPath();
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.random() * 20 - 10, y + Math.random() * 20 - 10, x + Math.random() * 30 - 15, y + Math.random() * 30 - 15);
    ctx.stroke();
  }
  return c.toDataURL("image/png");
}
