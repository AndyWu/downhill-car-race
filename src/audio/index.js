// Procedural WebAudio engine for the soap box derby. No audio files: everything is synthesised,
// so it works offline. API: createAudio() -> { unlock, update(dt, params), oneShot(name), ... }
//
// update params (all optional except listener is strongly advised):
//   speed (m/s), surface ('dirt'|'mud'|'water'|'rock'|'sand'|'gravel'|'grass' or {type}),
//   wheelContacts (number 0..4 or array of bools/numbers), paddleL, paddleR (0..1 impulse),
//   handbrake (0..1), bumps (0..1 roughness/bump), suspensionLoad (0..1, optional),
//   flagRipple (Hz, optional), dusk (0..1, optional), listener (Object3D),
//   others: [{ position:{x,y,z}, speed }] (other cars, spatialised)

const SURF = {
  //            band Hz, Q,  roll gain, grain rate/speed, grain freq, grain Q
  dirt:   { f: 900,  q: 0.8, g: 0.10, rate: 3.0, gf: 1400, gq: 1.2, hiss: 0.0 },
  gravel: { f: 2200, q: 0.7, g: 0.14, rate: 6.0, gf: 3200, gq: 0.9, hiss: 0.0 },
  rock:   { f: 500,  q: 1.5, g: 0.09, rate: 1.4, gf: 700,  gq: 2.5, hiss: 0.0 },
  sand:   { f: 4500, q: 0.5, g: 0.12, rate: 0.6, gf: 5200, gq: 0.5, hiss: 1.0 },
  mud:    { f: 260,  q: 1.8, g: 0.14, rate: 1.2, gf: 320,  gq: 3.0, hiss: 0.0 },
  water:  { f: 1800, q: 0.6, g: 0.16, rate: 4.0, gf: 2600, gq: 0.7, hiss: 0.5 },
  grass:  { f: 1200, q: 0.5, g: 0.06, rate: 1.0, gf: 2000, gq: 0.6, hiss: 0.4 },
};

import { renderBank } from './bank.js';

export function createAudio() {
  let ctx = null, master = null, comp = null, bus = null;
  let noiseBuf = null, brownBuf = null, bank = null;
  let ready = false;
  const state = { surface: 'dirt', paddleL: 0, paddleR: 0, handbrake: 0, timers: {}, acc: {}, mutedUntil: 0, muted: false };
  const n = {}; // persistent nodes
  let wasHb = 0, lastSpeed = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function makeBuffers() {
    const len = ctx.sampleRate * 3;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = brownBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  }
  const loopSrc = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0; s.start(0, Math.random() * 2); return s; };
  const filt = (type, f, q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  function lfo(freq, depth, target, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = gain(depth); o.connect(g); g.connect(target); o.start(); return { o, g };
  }
  function panner(x, y, z) {
    const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = 3; p.maxDistance = 400; p.rolloffFactor = 1.4;
    setPos(p, x, y, z); return p;
  }
  function setPos(p, x, y, z) {
    if (p.positionX) { const t = ctx.currentTime; p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03); }
    else p.setPosition(x, y, z);
  }

  // ---- build the persistent graph ----
  function build() {
    ctx.destination.channelCount = Math.min(2, ctx.destination.maxChannelCount || 2);
    makeBuffers();
    bank = renderBank(ctx); // physically-modelled foley, rendered once
    master = gain(0.9);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.05;
    bus = gain(1);
    bus.connect(comp); comp.connect(limiter); limiter.connect(master); master.connect(ctx.destination);

    // wind past the flag: bandpassed noise, speed-scaled, with cloth flutter AM
    n.windSrc = loopSrc(noiseBuf);
    n.windBP = filt('bandpass', 500, 0.7);
    n.windHP = filt('highpass', 120, 0.5);
    n.windAM = gain(0.6);
    n.windGain = gain(0);
    n.windSrc.connect(n.windBP); n.windBP.connect(n.windHP); n.windHP.connect(n.windAM); n.windAM.connect(n.windGain); n.windGain.connect(bus);
    n.flutter = lfo(9, 0.35, n.windAM.gain, 'triangle'); // cloth flutter, frequency set from speed/ripple

    // rolling bed on surface
    n.rollSrc = loopSrc(noiseBuf);
    n.rollBP = filt('bandpass', 900, 0.8);
    n.rollGain = gain(0);
    n.rollSrc.connect(n.rollBP); n.rollBP.connect(n.rollGain); n.rollGain.connect(bus);
    n.hissSrc = loopSrc(noiseBuf);
    n.hissHP = filt('highpass', 4000, 0.4);
    n.hissGain = gain(0);
    n.hissSrc.connect(n.hissHP); n.hissHP.connect(n.hissGain); n.hissGain.connect(bus);

    // wooden handbrake scrub
    n.scrubSrc = loopSrc(brownBuf);
    n.scrubBP = filt('bandpass', 320, 3);
    n.scrubGain = gain(0);
    n.scrubSrc.connect(n.scrubBP); n.scrubBP.connect(n.scrubGain); n.scrubGain.connect(bus);


    // ambient: breeze in leaves
    n.breezeSrc = loopSrc(noiseBuf);
    n.breezeLP = filt('bandpass', 1800, 0.6);
    n.breezeGain = gain(0.02);
    n.breezeSrc.connect(n.breezeLP); n.breezeLP.connect(n.breezeGain); n.breezeGain.connect(bus);
    lfo(0.11, 0.015, n.breezeGain.gain); lfo(0.07, 500, n.breezeLP.frequency);

    // insects at dusk: AM'd high tones (stereo-ish spatial)
    n.insect = [0, 1].map((i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 4300 + i * 520;
      const am = gain(0); const out = gain(0);
      o.connect(am); am.connect(out);
      lfo(i ? 31 : 24, 0.5, am.gain, 'square'); am.gain.value = 0.5;
      const p = panner(i ? 14 : -12, 1, -6 + i * 3); out.connect(p); p.connect(bus); o.start();
      return out;
    });

    // other-car voices
    n.cars = [];
    for (let i = 0; i < 5; i++) {
      const src = loopSrc(i % 2 ? noiseBuf : brownBuf);
      const bp = filt('bandpass', 600 + i * 90, 1.2);
      const g = gain(0); const p = panner(0, 0, -50);
      src.connect(bp); bp.connect(g); g.connect(p); p.connect(bus);
      n.cars.push({ g, p, bp, rattleT: 0, creakT: 0 });
    }
    // crowd bed near the finish (loop, gain driven by finishDist)
    const cr = play('cheer', { vol: 0, loop: true }); n.crowd = cr && cr.g;
    ready = true;
  }

  // ---- one-shot synth primitives ----
  function env(g, t, a, peak, d) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function burst({ f = 1000, q = 1, type = 'bandpass', a = 0.003, d = 0.08, vol = 0.3, buf = noiseBuf, sweep = 0, dest = bus, when = 0 }) {
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const fl = filt(type, f, q); const g = gain(0);
    if (sweep) { fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(Math.max(40, f * sweep), t + a + d); }
    env(g, t, a, vol, d);
    s.connect(fl); fl.connect(g); g.connect(dest);
    s.start(t, Math.random() * 2, a + d + 0.05);
  }
  function tone({ f = 440, f2 = null, type = 'sine', a = 0.002, d = 0.1, vol = 0.2, dest = bus, when = 0, fmRatio = 0, fmDepth = 0 }) {
    const t = ctx.currentTime + when;
    f = Math.min(f, 12000); if (f2) f2 = Math.min(f2, 12000);
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = gain(0); env(g, t, a, vol, d);
    if (fmRatio) {
      const m = ctx.createOscillator(); m.frequency.value = f * fmRatio;
      const mg = gain(fmDepth); m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + a + d + 0.05);
      if (f2) m.frequency.exponentialRampToValueAtTime(f2 * fmRatio, t + a + d);
    }
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + d + 0.05);
  }
  function play(name, { rate = 1, vol = 0.3, dest = bus, when = 0, lp = 0, loop = false } = {}) {
    const list = bank[name]; if (!list) return null;
    const src = ctx.createBufferSource(); src.buffer = list[(Math.random() * list.length) | 0];
    src.playbackRate.value = rate; src.loop = loop;
    const g = gain(vol); let tail = src;
    if (lp) { const f = filt('lowpass', lp, 0.7); src.connect(f); tail = f; }
    tail.connect(g); g.connect(dest); src.start(ctx.currentTime + when);
    return { src, g };
  }
  const metalClick = (vol = 0.12, dest = bus, when = 0) => play(Math.random() < 0.4 ? 'bolt' : 'tick', { vol: vol * 4, dest, when, rate: rnd(0.85, 1.3) });
  const woodTick = (vol = 0.2, f = 700) => play('knock', { vol: vol * 1.5, rate: f / 700 * rnd(0.8, 1.2) });

  const SOUNDS = {
    headlight() { metalClick(0.25); play('knock', { vol: 0.3, rate: 1.6 }); },
    gear() { play('plank', { vol: 0.7, rate: 0.55 }); metalClick(0.2, bus, 0.03); metalClick(0.12, bus, 0.09); },
    mud() { play('mud', { vol: 1.0, rate: rnd(0.8, 1) }); play('mud', { vol: 0.7, rate: rnd(1, 1.3), when: 0.08 }); play('drip', { vol: 0.3, when: 0.15 }); },
    water() { play('splash', { vol: 1.0, rate: rnd(0.9, 1.1) }); play('drip', { vol: 0.5, when: 0.2, rate: rnd(0.8, 1.2) }); },
    paddle() { play('plank', { vol: 0.55, rate: rnd(0.65, 0.85) }); play('creak', { vol: 0.12, rate: rnd(1.1, 1.6), when: 0.02 }); },
    handbrake() { for (let i = 0; i < 5; i++) { metalClick(0.1, bus, i * 0.045); woodTick(0.12, 500 + i * 60); } },
    bump() { play('plank', { vol: 0.7, rate: rnd(0.55, 0.8) }); },
    rockHit() { play('knock', { vol: 0.8, rate: rnd(0.6, 0.9) }); metalClick(0.15); },
    splat() { SOUNDS.mud(); },
    cowbell() { const r = rnd(0.95, 1.08); play('cowbell', { vol: 0.35, rate: r }); play('cowbell', { vol: 0.28, rate: r, when: 0.16 }); },
    cheer() { const h = play('cheer', { vol: 0.0 }); if (!h) return; const t = ctx.currentTime; h.g.gain.setValueAtTime(0.0001, t); h.g.gain.linearRampToValueAtTime(0.55, t + 0.8); h.g.gain.setValueAtTime(0.55, t + 2.4); h.g.gain.exponentialRampToValueAtTime(0.0001, t + 3.9); },
    finish() { SOUNDS.cheer(); SOUNDS.cowbell(); },
    countdown() { tone({ f: 440, type: 'triangle', d: 0.18, vol: 0.2 }); },
    go() { tone({ f: 880, type: 'triangle', d: 0.45, vol: 0.25 }); },
    click() { woodTick(0.25, 900); },
  };

  // birdsong: FM chirp phrases
  function chirp(pan) {
    const p = panner(pan[0], pan[1], pan[2]); p.connect(bus);
    const base = rnd(2400, 5200), notes = 2 + (Math.random() * 5 | 0), kind = Math.random();
    for (let i = 0; i < notes; i++) {
      const f = base * rnd(0.85, 1.25);
      tone({ f, f2: f * (kind < 0.5 ? rnd(1.2, 1.7) : rnd(0.55, 0.85)), a: 0.004, d: rnd(0.04, 0.1), vol: 0.05, dest: p, when: i * rnd(0.09, 0.16), fmRatio: rnd(1.5, 3), fmDepth: f * rnd(0.2, 0.6) });
    }
    setTimeout(() => { try { p.disconnect(); } catch (e) {} }, 2500);
  }
  function cow() {
    const p = panner(rnd(-1, 1) > 0 ? 120 : -120, 2, rnd(-150, -60)); p.connect(bus);
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(85, t + 1.6);
    const f1 = filt('bandpass', 500, 6), f2 = filt('bandpass', 900, 5);
    const g = gain(0); env(g, t, 0.3, 0.5, 1.5);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(p);
    o.start(t); o.stop(t + 2);
    setTimeout(() => { try { p.disconnect(); } catch (e) {} }, 3000);
  }

  function updateListener(l) {
    if (!l) return null;
    l.updateWorldMatrix?.(true, false);
    const e = l.matrixWorld.elements;
    const pos = [e[12], e[13], e[14]];
    const fwd = [-e[8], -e[9], -e[10]], up = [e[4], e[5], e[6]];
    const L = ctx.listener, t = ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos[0], t, 0.02); L.positionY.setTargetAtTime(pos[1], t, 0.02); L.positionZ.setTargetAtTime(pos[2], t, 0.02);
      L.forwardX.setTargetAtTime(fwd[0], t, 0.02); L.forwardY.setTargetAtTime(fwd[1], t, 0.02); L.forwardZ.setTargetAtTime(fwd[2], t, 0.02);
      L.upX.setTargetAtTime(up[0], t, 0.02); L.upY.setTargetAtTime(up[1], t, 0.02); L.upZ.setTargetAtTime(up[2], t, 0.02);
    } else { L.setPosition(...pos); L.setOrientation(...fwd, ...up); }
    return pos;
  }

  function tick(name, dt, rate, fn) { // poisson-ish scheduler
    state.acc[name] = (state.acc[name] || 0) + dt * rate;
    let guard = 4;
    while (state.acc[name] >= 1 && guard--) { state.acc[name] -= 1; fn(); }
    if (state.acc[name] > 4) state.acc[name] = 0;
  }
  const poisson = (name, dt, rate, fn) => { // stochastic variant
    if (Math.random() < 1 - Math.exp(-rate * dt)) fn();
  };

  const api = {
    get ready() { return ready; },
    get context() { return ctx; },
    /** Call from a user gesture (touchend/click). Safe to call repeatedly. */
    unlock() {
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false;
          ctx = new AC({ latencyHint: 'interactive' });
          build();
        }
        if (ctx.state !== 'running') ctx.resume();
        // iOS: play a silent buffer inside the gesture
        const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
        return true;
      } catch (e) { console.warn('audio unlock failed', e); return false; }
    },
    setMuted(m) { state.muted = !!m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05); },
    setVolume(v) { if (master) master.gain.setTargetAtTime(clamp(v, 0, 1), ctx.currentTime, 0.05); },
    /** Pause audio when app is backgrounded. */
    suspend() { ctx && ctx.suspend(); }, resume() { ctx && ctx.resume(); },

    update(dt, p = {}) {
      if (!ready || ctx.state !== 'running') return;
      dt = clamp(dt || 0.016, 0.001, 0.1);
      const t = ctx.currentTime, tc = 0.06;
      const speed = Math.max(0, p.speed || 0);
      const sp = clamp(speed / 28, 0, 1.4);
      let contacts = p.wheelContacts;
      if (Array.isArray(contacts)) contacts = contacts.reduce((a, c) => a + (c ? 1 : 0), 0);
      if (contacts == null) contacts = 4;
      const ground = clamp(contacts / 4, 0, 1);
      const surfName = (typeof p.surface === 'object' && p.surface ? p.surface.type : p.surface) || 'dirt';
      const S = SURF[surfName] || SURF.dirt;
      const bumps = clamp(p.bumps ?? (p.surface && p.surface.bump) ?? 0.2, 0, 1);
      const rough = clamp(0.15 + bumps, 0, 1.2);
      const dusk = clamp(p.dusk ?? 0, 0, 1);
      const lpos = updateListener(p.listener);

      // surface-enter splashes
      if (surfName !== state.surface) {
        if (speed > 2 && (surfName === 'mud' || surfName === 'water')) api.oneShot(surfName);
        state.surface = surfName;
      }
      // sudden decel = hit
      if (lastSpeed - speed > 6 * dt * 10 && lastSpeed > 6) api.oneShot('rockHit');
      lastSpeed = speed;

      // wind + flag flutter
      n.windGain.gain.setTargetAtTime(Math.pow(sp, 1.6) * 0.5 + 0.01, t, tc);
      n.windBP.frequency.setTargetAtTime(350 + sp * 2600, t, tc);
      n.windBP.Q.setTargetAtTime(0.5 + sp * 0.5, t, tc);
      n.flutter.o.frequency.setTargetAtTime(p.flagRipple || (4 + sp * 14), t, 0.1);
      n.flutter.g.gain.setTargetAtTime(0.15 + sp * 0.3, t, 0.1);

      // tyre bed + granular crunch
      const rollG = 0.6 * S.g * Math.pow(sp, 0.8) * ground;
      n.rollGain.gain.setTargetAtTime(rollG, t, tc);
      n.rollBP.frequency.setTargetAtTime(S.f * (0.7 + sp * 0.7), t, 0.1);
      n.rollBP.Q.setTargetAtTime(S.q, t, 0.1);
      n.hissHP.frequency.setTargetAtTime(S.f > 3000 ? 3500 : 2500, t, 0.1);
      n.hissGain.gain.setTargetAtTime(S.hiss * 0.1 * sp * ground, t, tc);
      if (ground > 0.1 && speed > 0.8) {
        const rate = S.rate * speed * ground * 0.8, v = 0.55 * Math.min(1, 0.3 + sp);
        const GR = { dirt: ['dirt', 1, 0], gravel: ['gravel', 1, 0], rock: ['knock', 0.9, 0], sand: ['dirt', 0.9, 2200], grass: ['dirt', 0.8, 1800], mud: ['mud', 0.9, 0], water: ['drip', 1, 0] }[surfName] || ['dirt', 1, 0];
        poisson('grain', dt, rate, () => play(GR[0], { rate: GR[1] * rnd(0.8, 1.25) * (0.85 + sp * 0.3), vol: v * rnd(0.4, 1) * (GR[0] === 'mud' ? 0.8 : GR[0] === 'knock' ? 0.6 : 0.5), lp: GR[2] }));
        if (surfName === 'rock' || surfName === 'gravel') poisson('ping', dt, 0.2 * speed * bumps, () => metalClick(0.05));
      }
      // bumps thump
      if (bumps > 0.55 && ground > 0.5) poisson('thump', dt, speed * 0.12 * bumps, () => SOUNDS.bump());

      // chassis creak driven by load + roughness
      const load = clamp(p.suspensionLoad ?? (rough * sp * 0.9 + 0.1 * (1 - ground)), 0, 1);
      poisson('creak', dt, 0.4 + load * 4, () => play('creak', { vol: 0.08 + 0.2 * load, rate: rnd(0.8, 1.3) * (0.9 + load * 0.3) }));
      // rattling bolts
      poisson('bolt', dt, speed * rough * 1.1, () => play('bolt', { vol: 0.12 + 0.12 * rough, rate: rnd(0.9, 1.25) }));

      // paddles: rising edge
      for (const side of ['paddleL', 'paddleR']) {
        const v = p[side] || 0;
        if (v > 0.25 && state[side] <= 0.25) {
          const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
          if (pan) { pan.pan.value = side === 'paddleL' ? -0.5 : 0.5; pan.connect(bus); const old = bus; bus = pan; SOUNDS.paddle(); bus = old; setTimeout(() => pan.disconnect(), 800); }
          else SOUNDS.paddle();
        }
        state[side] = v;
      }

      // handbrake
      const hb = clamp(p.handbrake || 0, 0, 1);
      if (Math.abs(hb - wasHb) > 0.08) { const steps = Math.abs(hb - wasHb) * 10 | 0; for (let i = 0; i < Math.max(1, steps); i++) { metalClick(0.1, bus, i * 0.04); woodTick(0.1, 500 + Math.random() * 200); } wasHb = hb; }
      else if (hb < 0.02) wasHb = hb;
      n.scrubGain.gain.setTargetAtTime(hb * clamp(speed / 6, 0, 1) * 0.35 * ground, t, 0.05);
      n.scrubBP.frequency.setTargetAtTime(220 + speed * 14, t, 0.1);

      // ambient bed: ducks as the wind rises
      const duck = 1 - clamp(sp, 0, 0.8) * 0.8;
      poisson('bird', dt, (0.7 - dusk * 0.55) * duck, () => chirp([rnd(-60, 60), rnd(5, 25), rnd(-80, 20)]));
      poisson('cow', dt, 0.012 * duck, cow);
      const ins = dusk * duck * 0.012;
      n.insect.forEach((g) => g.gain.setTargetAtTime(ins, t, 1));
      n.breezeGain.gain.setTargetAtTime(0.02 * duck + 0.005, t, 0.5);

      // crowd swell near the finish arch (finishDist in metres) + cowbell when passing an opponent
      if (n.crowd) {
        const fd = p.finishDist;
        const target = fd == null ? 0 : clamp(1 - fd / 260, 0, 1) ** 1.5 * 0.4;
        n.crowd.gain.setTargetAtTime(target, t, 0.6);
      }
      let place = p.place;
      if (place == null && p.s != null && p.others && p.others.some((o) => o.s != null)) place = 1 + p.others.filter((o) => o.s > p.s).length;
      if (place != null) {
        if (state.place != null && place < state.place && speed > 1) { api.oneShot('cowbell'); }
        state.place = place;
      }

      // other cars (spatial)
      const others = p.others || [];
      for (let i = 0; i < n.cars.length; i++) {
        const c = n.cars[i], o = others[i];
        if (!o || !o.position) { c.g.gain.setTargetAtTime(0, t, 0.1); continue; }
        const osp = clamp((o.speed || 0) / 28, 0, 1.3);
        setPos(c.p, o.position.x, o.position.y, o.position.z);
        c.g.gain.setTargetAtTime(0.35 * Math.pow(osp, 0.9), t, 0.08);
        c.bp.frequency.setTargetAtTime(350 + osp * 900, t, 0.1);
        if (osp > 0.05 && Math.random() < 1 - Math.exp(-osp * 6 * dt)) {
          const d = ctx.createGain(); d.gain.value = 1; d.connect(c.p); // rattle through car's panner
          metalClick(0.1, d); setTimeout(() => d.disconnect(), 400);
        }
      }
    },

    /** names: headlight gear mud water paddle handbrake bump rockHit splat finish countdown go click */
    oneShot(name) {
      if (!ready || ctx.state !== 'running') return;
      const f = SOUNDS[name]; if (f) { try { f(); } catch (e) { console.warn('oneShot', name, e); } }
    },
    names: Object.keys(SOUNDS),
  };
  return api;
}
