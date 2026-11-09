// Proximity voice chat: peer-to-peer WebRTC audio between players, positioned in 3D like VRChat.
// The game server only relays the signalling messages.

import { net, onServer } from "../net";
import { store } from "../store";

interface Peer { pc: RTCPeerConnection; panner?: PannerNode; gain?: GainNode; audioEl?: HTMLAudioElement; makingOffer: boolean }

const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

export class Voice {
  private peers = new Map<string, Peer>();
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private talking = false;
  private lastLoud = 0;
  private pushToTalk = false;
  private pttHeld = false;
  muted = false;

  constructor() {
    onServer((m) => {
      if (m.t === "rtc") void this.signal(m.from, m.data as SignalData);
      if (m.t === "state" && this.stream) this.syncPeers();
    });
  }

  get active() { return !!this.stream; }

  async enable(ctx: AudioContext) {
    if (this.stream) return;
    this.ctx = ctx;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      store.toast("Microphone access was blocked — check your browser permissions.", "error");
      return;
    }
    const src = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    src.connect(this.analyser);
    store.set({ micOn: true });
    this.syncPeers();
  }

  disable() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    for (const id of [...this.peers.keys()]) this.drop(id);
    store.set({ micOn: false });
    if (this.talking) { this.talking = false; net.talking(false); }
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !m && (!this.pushToTalk || this.pttHeld)));
  }

  setPushToTalk(on: boolean) { this.pushToTalk = on; this.setMuted(this.muted); }
  holdPtt(held: boolean) { this.pttHeld = held; this.setMuted(this.muted); }

  /** Keep one connection per other connected player. The lower id makes the offer. */
  private syncPeers() {
    const s = store.get();
    if (!s.state || !this.stream) return;
    const others = Object.values(s.state.players).filter((p) => p.id !== s.you && p.connected).map((p) => p.id);
    for (const id of others) if (!this.peers.has(id)) this.connect(id, s.you < id);
    for (const id of [...this.peers.keys()]) if (!others.includes(id)) this.drop(id);
  }

  private connect(id: string, initiator: boolean) {
    const pc = new RTCPeerConnection(ICE);
    const peer: Peer = { pc, makingOffer: false };
    this.peers.set(id, peer);
    this.stream!.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
    pc.onicecandidate = (e) => { if (e.candidate) net.rtc(id, { ice: e.candidate.toJSON() }); };
    pc.ontrack = (e) => this.attach(id, e.streams[0]);
    pc.onnegotiationneeded = async () => {
      if (!initiator) return;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        net.rtc(id, { sdp: pc.localDescription!.toJSON() });
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") { this.drop(id); setTimeout(() => this.syncPeers(), 2000); } };
  }

  private async signal(from: string, data: SignalData) {
    if (!this.stream) return;
    let peer = this.peers.get(from);
    if (!peer) { this.connect(from, store.get().you < from); peer = this.peers.get(from)!; }
    const pc = peer.pc;
    try {
      if (data.sdp) {
        const polite = store.get().you > from;
        const collision = data.sdp.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
        if (collision && !polite) return;
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === "offer") {
          await pc.setLocalDescription();
          net.rtc(from, { sdp: pc.localDescription!.toJSON() });
        }
      } else if (data.ice) {
        await pc.addIceCandidate(data.ice).catch(() => {});
      }
    } catch (e) {
      console.warn("[voice] signalling error", e);
    }
  }

  private attach(id: string, stream: MediaStream) {
    const peer = this.peers.get(id);
    if (!peer || !this.ctx) return;
    // Chrome needs the stream attached to a media element before WebAudio receives samples.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => {});
    peer.audioEl = el;
    const src = this.ctx.createMediaStreamSource(stream);
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 2;
    panner.maxDistance = 30;
    panner.rolloffFactor = 1.4;
    const gain = this.ctx.createGain();
    gain.gain.value = 1.4;
    src.connect(panner).connect(gain).connect(this.ctx.destination);
    peer.panner = panner;
    peer.gain = gain;
  }

  private drop(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.gain?.disconnect();
    p.audioEl?.pause();
    this.peers.delete(id);
  }

  /** Called every frame with listener and speaker positions. */
  update(listener: { x: number; y: number; z: number; fx: number; fz: number }, speakers: Record<string, { x: number; y: number; z: number }>) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(listener.x, t, 0.05);
      L.positionY.setTargetAtTime(listener.y, t, 0.05);
      L.positionZ.setTargetAtTime(listener.z, t, 0.05);
      L.forwardX.setTargetAtTime(listener.fx, t, 0.05);
      L.forwardY.setTargetAtTime(0, t, 0.05);
      L.forwardZ.setTargetAtTime(listener.fz, t, 0.05);
    }
    for (const [id, p] of this.peers) {
      const s = speakers[id];
      if (!s || !p.panner) continue;
      p.panner.positionX.setTargetAtTime(s.x, t, 0.05);
      p.panner.positionY.setTargetAtTime(s.y + 1.6, t, 0.05);
      p.panner.positionZ.setTargetAtTime(s.z, t, 0.05);
    }
    // local talking indicator
    if (this.analyser && this.stream) {
      const buf = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += (v - 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      const live = !this.muted && (!this.pushToTalk || this.pttHeld);
      const loud = live && rms > 6;
      const nowMs = performance.now();
      if (loud) this.lastLoud = nowMs;
      // start instantly, stop after a short hold so the indicator doesn't flicker between words
      const now = loud || nowMs - this.lastLoud < 450;
      if (now !== this.talking) { this.talking = now; net.talking(now); }
    }
  }
}

interface SignalData { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }

export const voice = new Voice();
