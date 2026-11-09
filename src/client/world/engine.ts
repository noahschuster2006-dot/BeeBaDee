// The 3D world: VRChat-style movement and camera, avatars, the pub and campaign worlds, the table.

import * as THREE from "three";
import type { ServerMsg } from "../../shared/protocol";
import type { AvatarLook, Emote, EnvironmentState, Transform } from "../../shared/types";
import { net, onServer } from "../net";
import { local, me, store, transforms } from "../store";
import { animateAvatar, buildAvatar, disposeAvatar, textSprite, type AvatarRig } from "./avatar";
import { sound } from "./audio";
import { DiceTray } from "./dice3d";
import { atmosphereFor, buildEnvironment, WeatherFx } from "./environments";
import { aabb, disposeGroup, type Collider, type Interactable, type Seat, type WorldPiece } from "./kit";
import { buildPub } from "./pub";
import { GameTable, TABLE } from "./table";
import { voice } from "./voice";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { styleSettings, toonify } from "./style";
import { Hands } from "./hands";
import { settings } from "../settings";

const RADIUS = 0.35;
const WALK = 3.2;
const RUN = 6.2;
const GRAVITY = 22;
const JUMP = 7.5;

interface Remote { rig: AvatarRig; lookKey: string; plate: THREE.Sprite; plateKey: string; bubble?: THREE.Sprite; bubbleUntil: number; tr: Transform; pos: THREE.Vector3; ry: number }

export const EMOTES: { key: string; emote: Emote; label: string; icon: string }[] = [
  { key: "1", emote: "wave", label: "Wave", icon: "👋" },
  { key: "2", emote: "dance", label: "Dance", icon: "💃" },
  { key: "3", emote: "clap", label: "Clap", icon: "👏" },
  { key: "4", emote: "cheer", label: "Cheer", icon: "🙌" },
  { key: "5", emote: "sit", label: "Sit", icon: "🪑" },
  { key: "6", emote: "point", label: "Point", icon: "👉" },
  { key: "7", emote: "bow", label: "Bow", icon: "🙇" },
  { key: "8", emote: "laugh", label: "Laugh", icon: "😂" },
];

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(68, 1, 0.05, 400);
  private clock = new FrameClock();
  private sun = new THREE.DirectionalLight("#ffffff", 1);
  private hemi = new THREE.HemisphereLight("#ffffff", "#333333", 0.6);
  private world: WorldPiece | null = null;
  private worldKey = "";
  private atmoKey = "";
  private table = new GameTable();
  private dice: DiceTray;
  private weather: WeatherFx;
  private remotes = new Map<string, Remote>();
  private keys = new Set<string>();
  private yaw = Math.PI;
  private pitch = -0.18;
  private dist = 3.6;
  private pos = new THREE.Vector3(0, 0, 7);
  private vel = new THREE.Vector3();
  private onGround = true;
  private ry = Math.PI;
  private emote: Emote = "none";
  private seat: Seat | null = null;
  private rig: AvatarRig | null = null;
  private rigKey = "";
  private myPlate: THREE.Sprite | null = null;
  private myPlateKey = "";
  private lastSent = 0;
  private lastSentTr = "";
  private colliders: Collider[] = [];
  private nearby: Interactable | Seat | null = null;
  private pings: { x: number; y: number; t: number; color: string }[] = [];
  private floaters: { s: THREE.Sprite; age: number }[] = [];
  private raycaster = new THREE.Raycaster();
  private dragging = false;
  private disposed = false;
  private onResize = () => this.resize();
  private outline: OutlineEffect;
  private hands = new Hands();
  private moving = 0;
  private bobT = 0;
  private frame = 0;
  private appliedQuality = "";

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.outline = new OutlineEffect(this.renderer, { defaultThickness: 0.0042, defaultColor: [0.09, 0.07, 0.06], defaultAlpha: 1 });
    this.scene.add(this.camera);
    this.camera.add(this.hands.group);
    store.set({ firstPerson: settings.get().firstPerson });
    this.scene.add(this.sun, this.sun.target, this.hemi, this.table.group);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -22; sc.right = sc.top = 22; sc.far = 80;
    this.sun.position.set(14, 26, 10);
    this.scene.fog = new THREE.Fog("#000", 20, 80);
    this.dice = new DiceTray(this.scene);
    this.weather = new WeatherFx(this.scene);
    this.resize();
    window.addEventListener("resize", this.onResize);
    this.bindInput();
    onServer((m) => this.onMsg(m));
    this.loop();
    (window as unknown as { __bbd?: Engine; __bbdStore?: typeof store }).__bbd = this; // handy for debugging in the console
    (window as unknown as { __bbdStore?: typeof store }).__bbdStore = store;
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
  }

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- input ----------

  private typing() {
    const el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable);
  }

  private bindInput() {
    const c = this.canvas;
    c.addEventListener("click", (e) => {
      sound.start();
      const locked = document.pointerLockElement === c;
      // aim at a square on the table and click to move your miniature there (first person: the crosshair)
      const sq = locked ? this.aimSquare(null) : this.aimSquare(e);
      if (sq && !e.shiftKey && this.tryMoveMini(sq)) return;
      if (locked) return;
      if (this.hitBoard(e)) { store.set({ panel: "board" }); return; }
      if (!store.get().panel) void c.requestPointerLock?.();
    });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("mousedown", (e) => { if (e.button === 2) this.dragging = true; });
    window.addEventListener("mouseup", () => (this.dragging = false));
    window.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === c || this.dragging) {
        const sens = settings.get().sensitivity;
        const inv = settings.get().invertY ? -1 : 1;
        this.yaw -= e.movementX * 0.0025 * sens;
        this.pitch = Math.max(-1.35, Math.min(1.2, this.pitch - e.movementY * 0.0022 * sens * inv));
      }
    });
    c.addEventListener("wheel", (e) => {
      if (store.get().firstPerson) return;
      this.dist = Math.max(1.4, Math.min(9, this.dist + Math.sign(e.deltaY) * 0.4));
    }, { passive: true });
    window.addEventListener("keydown", (e) => {
      if (this.typing()) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (store.get().panel === "board" && k !== "tab" && k !== "escape") return; // the board has its own keys
      if (k === "e") this.interact();
      if (k === "c") { const fp = !store.get().firstPerson; store.set({ firstPerson: fp }); settings.set({ firstPerson: fp }); }
      if (k === "tab") { e.preventDefault(); store.set((s) => ({ panel: s.panel === "board" ? null : "board" })); document.exitPointerLock?.(); }
      if (k === "k") { store.set((s) => ({ panel: s.panel === "sheet" ? null : "sheet" })); document.exitPointerLock?.(); }
      if (k === "enter") { e.preventDefault(); document.exitPointerLock?.(); store.set({ chatFocus: true }); }
      if (k === "escape") store.set({ panel: null });
      if (k === "v") voice.holdPtt(true);
      if (k === "m" && voice.active) { voice.setMuted(!voice.muted); store.toast(voice.muted ? "🔇 Muted" : "🎙️ Unmuted"); }
      const em = EMOTES.find((x) => x.key === k);
      if (em) this.setEmote(this.emote === em.emote ? "none" : em.emote);
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === "v") voice.holdPtt(false);
    });
    window.addEventListener("blur", () => this.keys.clear());
  }

  setEmote(e: Emote) {
    this.emote = e;
    net.emote(e);
  }

  /** Board square under the mouse (or under the crosshair when e is null), if looking at the table. */
  private aimSquare(e: MouseEvent | null): readonly [number, number] | null {
    const ndc = new THREE.Vector2(0, 0);
    if (e) {
      const r = this.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    }
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.table.boardObject)[0];
    if (!hit || hit.distance > 9) return null;
    return this.table.boardSquare(hit.point);
  }

  /** Move my token to a square, if it's my turn (or we're exploring). */
  private tryMoveMini(sq: readonly [number, number]) {
    const s = store.get().state;
    if (!s || s.phase !== "campaign") return false;
    const mine = s.board.tokens.find((t) => t.ownerId === store.get().you);
    if (!mine) return false;
    const cur = s.combat.active ? s.combat.order[s.combat.turn] : null;
    if (s.combat.active && cur !== mine.id) { store.toast("Wait for your turn — or press Tab for the board."); return true; }
    const prop = s.board.props.find((p) => p.x === sq[0] && p.y === sq[1]);
    if (prop && Math.max(Math.abs(prop.x - mine.x), Math.abs(prop.y - mine.y)) <= 1) net.board({ type: "interact", tokenId: mine.id, propId: prop.id });
    else net.board({ type: "move", tokenId: mine.id, x: sq[0], y: sq[1] });
    sound.sfx("dice");
    return true;
  }

  private hitBoard(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(this.table.boardObject).length > 0 || this.raycaster.intersectObject(this.table.group, true).some((h) => h.distance < 12);
  }

  private interact() {
    const n = this.nearby;
    if (!n) return;
    if ("ry" in n) { // seat
      if (this.seat?.id === n.id) { this.standUp(); return; }
      this.seat = n;
      this.setEmote("none");
      return;
    }
    document.exitPointerLock?.();
    switch (n.kind) {
      case "quest": store.set({ panel: "quest" }); break;
      case "mirror": store.set({ panel: "avatar" }); break;
      case "desk": store.set({ panel: "creator" }); break;
      case "table": store.set({ panel: "board" }); break;
      case "dice": net.roll("1d20", "Luck"); break;
      case "fx": if (n.fx) net.worldFx(n.fx); break;
      case "jukebox": {
        const on = !store.get().musicOn;
        store.set({ musicOn: on });
        sound.setMusic(on);
        store.toast(on ? "🎵 Music on" : "🔇 Music off");
        break;
      }
    }
  }

  private standUp() {
    if (!this.seat) return;
    const fwd = new THREE.Vector3(Math.sin(this.seat.ry), 0, Math.cos(this.seat.ry));
    this.pos.copy(this.seat.pos).addScaledVector(fwd, 0.7);
    this.pos.y = 0;
    this.seat = null;
  }

  // ---------- server events ----------

  private onMsg(m: ServerMsg) {
    switch (m.t) {
      case "dice": {
        const s = store.get();
        const pid = Object.values(s.state?.players ?? {}).find((p) => p.character?.name === m.by || p.name === m.by)?.id;
        const tr = pid ? transforms[pid] : undefined;
        const from = tr ? new THREE.Vector3(tr.x, 0, tr.z) : new THREE.Vector3((Math.random() - 0.5) * 6, 0, 3);
        const dir = from.clone().setY(0).normalize();
        const at = new THREE.Vector3(dir.x * (TABLE.w / 2 - 0.5), 0, dir.z * (TABLE.d / 2 - 0.4));
        this.dice.throw(m.values, at, TABLE.h);
        sound.sfx("dice");
        break;
      }
      case "chat": {
        const msg = m.msg;
        if (msg.fromId && (msg.channel === "ic" || msg.channel === "ooc" || msg.channel === "emote")) this.bubble(msg.fromId, msg.text);
        if (msg.channel === "gm") sound.sfx("chat");
        break;
      }
      case "fx": {
        sound.sfx(m.kind === "scene" ? "scene" : m.kind);
        const s = store.get().state;
        const tok = s?.board.tokens.find((t) => t.id === m.tokenId);
        if (tok && m.text) {
          const p = this.table.squareToWorld(tok.x, tok.y, tok.size);
          const color = m.kind === "hit" ? "#ff5a5a" : m.kind === "heal" ? "#6dff9a" : m.kind === "miss" ? "#cccccc" : m.kind === "levelup" ? "#ffd84a" : "#c9a0ff";
          const sp = textSprite([{ text: m.text, size: 54, bold: true, color }], { scale: 0.004 });
          sp.position.copy(p).add(new THREE.Vector3(0, 0.5, 0));
          this.scene.add(sp);
          this.floaters.push({ s: sp, age: 0 });
        }
        break;
      }
      case "worldfx": this.world?.onFx?.(m.id); break;
      case "ping": {
        const pl = store.get().state?.players[m.from];
        this.pings.push({ x: m.x, y: m.y, t: this.clock.elapsedTime, color: pl?.look.primary ?? "#fff" });
        break;
      }
      case "state": {
        const s = m.state;
        const cur = s.combat.active ? s.board.tokens.find((t) => t.id === s.combat.order[s.combat.turn]) : null;
        if (cur && cur.ownerId === store.get().you && this.lastTurnId !== cur.id + s.combat.round) {
          this.lastTurnId = cur.id + s.combat.round;
          sound.sfx("turn");
        }
        break;
      }
    }
  }
  private lastTurnId = "";

  private bubble(pid: string, text: string) {
    const r = this.remotes.get(pid);
    const holder = pid === store.get().you ? this.rig?.root : r?.rig.root;
    if (!holder) return;
    const sp = textSprite([{ text: text.slice(0, 140), size: 26, color: "#1a1a1a" }], { bg: "rgba(255,255,255,0.92)", maxWidth: 420, scale: 0.0026 });
    sp.position.y = 2.55 * (pid === store.get().you ? local.look.height : r!.rig.look.height);
    sp.renderOrder = 10;
    if (pid === store.get().you) {
      if (this.myBubble) { this.rig?.root.remove(this.myBubble); this.myBubble.material.map?.dispose(); }
      this.myBubble = sp;
      this.myBubbleUntil = this.clock.elapsedTime + 7;
    } else if (r) {
      if (r.bubble) { r.rig.root.remove(r.bubble); r.bubble.material.map?.dispose(); }
      r.bubble = sp;
      r.bubbleUntil = this.clock.elapsedTime + 7;
    }
    holder.add(sp);
  }
  private myBubble: THREE.Sprite | null = null;
  private myBubbleUntil = 0;

  // ---------- world management ----------

  /** Debug helper (window.__bbd.preview("crystal")): show any world without playing to it. */
  preview(preset: string | null, time: EnvironmentState["time"] = "night", weather: EnvironmentState["weather"] = "clear") {
    this.forced = preset ? { preset, time, weather, seed: 7 } : null;
  }
  private forced: EnvironmentState | null = null;

  private syncWorld() {
    const st = store.get().state;
    if (!st) return;
    const s = this.forced ? { ...st, phase: "campaign" as const, env: this.forced } : st;
    const env: EnvironmentState = s.env;
    const key = s.phase === "pub" ? "pub" : `${env.preset}:${env.seed}`;
    if (key !== this.worldKey) {
      this.worldKey = key;
      if (this.world) { this.scene.remove(this.world.group); this.world.dispose?.(); disposeGroup(this.world.group); }
      this.world = s.phase === "pub" ? buildPub() : buildEnvironment(env);
      toonify(this.world.group);
      this.scene.add(this.world.group);
      store.set({ fade: true });
      setTimeout(() => store.set({ fade: false }), 450);
      // the table is always the centrepiece and an interactable
      this.world.interactables.push({ id: "table", pos: new THREE.Vector3(0, 1, 0), radius: 4.6, label: "Open the game board", kind: "table" });
      this.colliders = [...this.world.colliders, aabb(0, 0, TABLE.w + 0.3, TABLE.d + 0.3)];
      if (this.seat) this.seat = null;
      // respawn around the table when the world changes
      const a = Math.random() * Math.PI * 2;
      this.pos.set(Math.cos(a) * 5.5, 0, Math.sin(a) * 4.5);
      this.yaw = Math.atan2(this.pos.x, this.pos.z);
      sound.setMood(s.phase === "pub" ? "pub" : (s.campaign ?? "realm"));
    }
    const atmoKey = `${key}:${env.time}:${env.weather}`;
    if (atmoKey !== this.atmoKey) {
      this.atmoKey = atmoKey;
      const a = atmosphereFor(s.phase === "pub" ? { ...env, preset: "pub" } : env);
      this.scene.background = new THREE.Color(a.sky);
      const fog = this.scene.fog as THREE.Fog;
      fog.color.set(a.fog);
      fog.near = a.fogNear;
      fog.far = a.fogFar;
      this.hemi.color.set(a.hemiSky);
      this.hemi.groundColor.set(a.hemiGround);
      this.hemi.intensity = a.hemi;
      this.sun.intensity = a.sun;
      this.sun.color.set(a.sunColor);
      this.weather.set(s.phase === "pub" ? "clear" : env.weather);
    }
    if (s.phase === "campaign") sound.setMood(s.combat.active ? "combat" : (s.campaign ?? "realm"));
  }

  private syncMyRig() {
    const look = local.look;
    const key = JSON.stringify(look);
    if (key !== this.rigKey) {
      if (this.rig) { this.scene.remove(this.rig.root); disposeAvatar(this.rig); }
      this.rig = buildAvatar(look);
      this.rigKey = key;
      this.scene.add(this.rig.root);
      this.myPlateKey = "";
    }
    const p = me();
    const name = p?.character && store.get().state?.phase === "campaign" ? `${p.name} · ${p.character.name}` : (p?.name ?? "");
    const plateKey = `${name}:${p?.talking}:${store.get().micOn}`;
    if (plateKey !== this.myPlateKey && this.rig) {
      this.myPlateKey = plateKey;
      if (this.myPlate) { this.rig.root.remove(this.myPlate); this.myPlate.material.map?.dispose(); this.myPlate.material.dispose(); }
      this.myPlate = this.plate(name, !!p?.talking, false);
      this.myPlate.position.y = 2.15 * look.height;
      this.rig.root.add(this.myPlate);
    }
  }

  private plate(name: string, talking: boolean, host: boolean) {
    return textSprite([{ text: `${talking ? "🔊 " : ""}${host ? "👑 " : ""}${name}`, size: 30, bold: true, color: talking ? "#7dffa0" : "#ffffff" }], { bg: talking ? "rgba(20,80,40,0.7)" : "rgba(0,0,0,0.45)", scale: 0.0024 });
  }

  private syncRemotes(dt: number, t: number) {
    const s = store.get();
    const players = s.state?.players ?? {};
    for (const [pid, tr] of Object.entries(transforms)) {
      if (pid === s.you) continue;
      const p = players[pid];
      if (!p || !p.connected) continue;
      const lookKey = JSON.stringify(p.look);
      let r = this.remotes.get(pid);
      if (!r || r.lookKey !== lookKey) {
        if (r) { this.scene.remove(r.rig.root); disposeAvatar(r.rig); }
        const rig = buildAvatar(p.look as AvatarLook);
        this.scene.add(rig.root);
        r = { rig, lookKey, plate: new THREE.Sprite(), plateKey: "", tr, pos: new THREE.Vector3(tr.x, tr.y, tr.z), ry: tr.ry, bubbleUntil: 0 };
        this.remotes.set(pid, r);
      }
      const name = p.character && s.state?.phase === "campaign" ? `${p.name} · ${p.character.name}` : p.name;
      const pk = `${name}:${p.talking}:${p.host}`;
      if (pk !== r.plateKey) {
        r.rig.root.remove(r.plate);
        r.plate.material.map?.dispose();
        r.plate = this.plate(name, !!p.talking, p.host);
        r.plate.position.y = 2.15 * p.look.height;
        r.rig.root.add(r.plate);
        r.plateKey = pk;
      }
      r.tr = tr;
      r.pos.lerp(new THREE.Vector3(tr.x, tr.y, tr.z), Math.min(1, dt * 12));
      r.ry = lerpAngle(r.ry, tr.ry, Math.min(1, dt * 12));
      r.rig.root.position.copy(r.pos);
      r.rig.root.rotation.y = r.ry;
      animateAvatar(r.rig, dt, t, tr.moving, tr.air, tr.emote, !!tr.seat);
      if (r.bubble && t > r.bubbleUntil) { r.rig.root.remove(r.bubble); r.bubble.material.map?.dispose(); r.bubble = undefined; }
    }
    for (const [pid, r] of this.remotes) {
      if (!transforms[pid] || !players[pid]?.connected) {
        this.scene.remove(r.rig.root);
        disposeAvatar(r.rig);
        this.remotes.delete(pid);
      }
    }
  }

  // ---------- simulation ----------

  private step(dt: number, t: number) {
    const s = store.get();
    const panel = s.panel;
    const typing = this.typing();
    const k = this.keys;
    const input = new THREE.Vector2(
      (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0),
      (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0),
    );
    const blockMove = typing || panel === "avatar" || panel === "creator" || panel === "board";
    if (blockMove) input.set(0, 0);
    if (this.seat && input.lengthSq() > 0) this.standUp();
    let moving = 0;
    if (!this.seat) {
      const run = k.has("shift");
      const speed = run ? RUN : WALK;
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const dir = new THREE.Vector3().addScaledVector(fwd, input.y).addScaledVector(right, input.x);
      if (dir.lengthSq() > 0) {
        dir.normalize();
        moving = run ? 2 : 1;
        if (this.emote !== "none") this.setEmote("none");
        this.ry = lerpAngle(this.ry, Math.atan2(dir.x, dir.z), Math.min(1, dt * 12));
      }
      const accel = this.onGround ? 14 : 4;
      this.vel.x += (dir.x * speed - this.vel.x) * Math.min(1, dt * accel);
      this.vel.z += (dir.z * speed - this.vel.z) * Math.min(1, dt * accel);
      if (k.has(" ") && this.onGround && !blockMove) { this.vel.y = JUMP; this.onGround = false; }
      this.vel.y -= GRAVITY * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }
      this.collide();
    }

    // place my avatar
    if (this.rig) {
      if (this.seat) {
        this.rig.root.position.set(this.seat.pos.x, this.seat.pos.y - 0.5, this.seat.pos.z);
        this.rig.root.rotation.y = this.seat.ry;
        this.ry = this.seat.ry;
      } else {
        this.rig.root.position.copy(this.pos);
        this.rig.root.rotation.y = this.ry;
      }
      animateAvatar(this.rig, dt, t, moving, !this.onGround, this.emote, !!this.seat);
      const fpHidden = s.firstPerson && panel !== "avatar" && panel !== "creator";
      this.rig.root.visible = !fpHidden;
      this.moving = this.seat ? 0 : moving;
      if (this.myPlate) this.myPlate.visible = !s.firstPerson;
      if (this.myBubble && t > this.myBubbleUntil) { this.rig.root.remove(this.myBubble); this.myBubble.material.map?.dispose(); this.myBubble = null; }
    }

    // network
    const p = this.rig?.root.position ?? this.pos;
    const tr: Transform = { x: round(p.x), y: round(p.y), z: round(p.z), ry: round(this.ry), moving, air: !this.onGround, emote: this.emote, seat: this.seat?.id };
    const trKey = JSON.stringify(tr);
    if (t - this.lastSent > 1 / 15 && (trKey !== this.lastSentTr || t - this.lastSent > 1)) {
      net.move(tr);
      this.lastSent = t;
      this.lastSentTr = trKey;
      transforms[s.you] = tr;
    }

    // nearby interactables & seats
    let best: Interactable | Seat | null = null;
    let bestD = Infinity;
    const here = this.seat ? this.seat.pos : this.pos;
    for (const it of this.world?.interactables ?? []) {
      const d = horizontal(here, it.pos);
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    for (const seat of this.world?.seats ?? []) {
      const d = horizontal(here, seat.pos);
      if (d < 1.2 && d < bestD) { best = seat; bestD = d; }
    }
    this.nearby = best;
    const label = best ? ("ry" in best ? (this.seat?.id === best.id ? "Stand up" : "Sit") : best.label) : null;
    const prompt = label ? `E — ${label}` : null;
    if (prompt !== s.prompt) store.set({ prompt });
  }

  private collide() {
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.colliders) {
        if (this.pos.y > (c.top ?? 99)) continue;
        const cx = Math.max(c.minX, Math.min(this.pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(this.pos.z, c.maxZ));
        const dx = this.pos.x - cx;
        const dz = this.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < RADIUS * RADIUS) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            this.pos.x = cx + (dx / d) * RADIUS;
            this.pos.z = cz + (dz / d) * RADIUS;
          } else {
            // inside the box: push out the shortest way
            const pushes = [c.minX - RADIUS - this.pos.x, c.maxX + RADIUS - this.pos.x, c.minZ - RADIUS - this.pos.z, c.maxZ + RADIUS - this.pos.z];
            const i = pushes.map(Math.abs).indexOf(Math.min(...pushes.map(Math.abs)));
            if (i < 2) this.pos.x += pushes[i]; else this.pos.z += pushes[i];
          }
        }
      }
    }
    const b = this.world?.bounds ?? 30;
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > b) { this.pos.x *= b / r; this.pos.z *= b / r; }
  }

  private updateCamera(dt: number) {
    const s = store.get();
    const look = local.look;
    const base = this.rig?.root.position ?? this.pos;
    const eye = new THREE.Vector3(base.x, base.y + 1.62 * look.height, base.z);
    if (s.panel === "avatar" || s.panel === "creator") {
      // mirror view: look at yourself
      const ang = this.ry;
      const camPos = new THREE.Vector3(base.x + Math.sin(ang) * 2.6, base.y + 1.35 * look.height, base.z + Math.cos(ang) * 2.6);
      this.camera.position.lerp(camPos, Math.min(1, dt * 6));
      this.camera.lookAt(base.x - Math.sin(ang) * 0.6 * (s.panel === "avatar" ? 1 : 0), base.y + 1.1 * look.height, base.z - Math.cos(ang) * 0.6 * (s.panel === "avatar" ? 1 : 0));
      return;
    }
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    if (s.firstPerson) {
      const st = settings.get();
      this.bobT += dt * (this.moving === 2 ? 11 : this.moving === 1 ? 7 : 0);
      const bob = st.headBob && this.moving ? Math.abs(Math.sin(this.bobT)) * (this.moving === 2 ? 0.07 : 0.04) : 0;
      this.camera.position.copy(eye).addScaledVector(new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 0.12);
      this.camera.position.y += bob;
      this.camera.lookAt(this.camera.position.clone().add(dir));
    } else {
      const target = eye.clone().add(new THREE.Vector3(0, 0.1, 0));
      let d = this.dist;
      // keep the camera inside the pub walls
      if (this.worldKey === "pub") {
        for (let tries = 0; tries < 12; tries++) {
          const p = target.clone().addScaledVector(dir, -d);
          if (Math.abs(p.x) < 12.6 && Math.abs(p.z) < 10.6 && p.y < 5 && p.y > 0.2) break;
          d *= 0.82;
        }
      }
      const camPos = target.clone().addScaledVector(dir, -d);
      camPos.y = Math.max(0.25, camPos.y);
      this.camera.position.copy(camPos);
      this.camera.lookAt(target);
    }
  }

  private loop = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (!store.get().state) return;
    this.syncWorld();
    this.syncMyRig();
    this.step(dt, t);
    this.syncRemotes(dt, t);
    this.updateCamera(dt);
    this.world?.update?.(t, dt, this.pos);
    const s = store.get();
    this.pings = this.pings.filter((p) => t - p.t < 2.6);
    this.table.hover = s.state?.phase === "campaign" && !s.panel ? this.aimSquare(null) : null;
    this.table.update(t, dt, s.state, s.you, transforms, this.pings);
    this.dice.update(dt);
    this.weather.update(dt, t, this.camera.position);
    if (this.weather.flash > 0) this.hemi.intensity += this.weather.flash * 2;
    for (const f of this.floaters) { f.age += dt; f.s.position.y += dt * 0.5; f.s.material.opacity = Math.max(0, 1 - f.age / 1.6); }
    for (const f of this.floaters.filter((x) => x.age > 1.6)) { this.scene.remove(f.s); f.s.material.map?.dispose(); f.s.material.dispose(); }
    this.floaters = this.floaters.filter((x) => x.age <= 1.6);
    this.sun.target.position.set(this.pos.x, 0, this.pos.z);
    this.sun.position.set(this.pos.x + 14, 26, this.pos.z + 10);
    // voice positions
    const speakers: Record<string, { x: number; y: number; z: number }> = {};
    for (const [pid, r] of this.remotes) speakers[pid] = r.pos;
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    voice.update({ x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, fx: f.x, fz: f.z }, speakers);
    const st = settings.get();
    if (this.camera.fov !== st.fov) { this.camera.fov = st.fov; this.camera.updateProjectionMatrix(); }
    if (this.appliedQuality !== st.quality) {
      this.appliedQuality = st.quality;
      this.renderer.setPixelRatio(st.quality === "high" ? Math.min(2, window.devicePixelRatio) : st.quality === "balanced" ? 1 : 0.75);
      this.renderer.shadowMap.enabled = st.quality !== "low";
      this.resize();
    }
    styleSettings.hatching = st.hatching;
    if (this.frame++ % 20 === 0) toonify(this.scene); // avatars, minis, dice and effects created since
    this.hands.update(dt, t, local.look, this.moving, !this.onGround, this.emote, s.firstPerson && !s.panel && !this.seat, st.headBob);
    if (st.outlines) this.outline.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
    if (this.weather.flash > 0) this.hemi.intensity -= this.weather.flash * 2;
  };
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
const round = (v: number) => Math.round(v * 1000) / 1000;
const horizontal = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

/** Minimal frame timer (THREE.Clock is deprecated). */
class FrameClock {
  private last = performance.now();
  elapsedTime = 0;
  getDelta() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.elapsedTime += dt;
    return dt;
  }
}
