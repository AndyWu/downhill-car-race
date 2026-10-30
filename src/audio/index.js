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
  sand:   { f: 1900, q: 0.7, g: 0.2, rate: 0.5, gf: 800, gq: 0.6, hiss: 0.6 },
  mud:    { f: 260,  q: 1.8, g: 0.14, rate: 1.2, gf: 320,  gq: 3.0, hiss: 0.0 },
  water:  { f: 1800, q: 0.6, g: 0.16, rate: 4.0, gf: 2600, gq: 0.7, hiss: 0.5 },
  cobble: { f: 1500, q: 0.9, g: 0.16, rate: 5.5, gf: 2200, gq: 1.4, hiss: 0.1 },
  asphalt:{ f: 1100, q: 0.6, g: 0.14, rate: 0.5, gf: 1800, gq: 0.6, hiss: 0.3 },
  kerb:   { f: 700,  q: 1.2, g: 0.18, rate: 9.0, gf: 900,  gq: 2.0, hiss: 0.0 },
  grass:  { f: 1200, q: 0.5, g: 0.06, rate: 1.0, gf: 2000, gq: 0.6, hiss: 0.4 },
};

import { renderBank } from './bank.js';

export function createAudio(options = {}) {
  // options.context: inject an (Offline)AudioContext for offline rendering / tests; it is treated as always running.
  const offlineMode = !!options.context;
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
    n.hissHP = filt('bandpass', 3000, 0.45);
    n.hissGain = gain(0);
    n.hissSrc.connect(n.hissHP); n.hissHP.connect(n.hissGain); n.hissGain.connect(bus);

    // wooden handbrake scrub
    n.scrubSrc = loopSrc(brownBuf);
    n.scrubBP = filt('bandpass', 320, 3);
    n.scrubGain = gain(0);
    n.scrubSrc.connect(n.scrubBP); n.scrubBP.connect(n.scrubGain); n.scrubGain.connect(bus);


    // ambient sub-bus (breeze, birds, insects, tractor): weather can muffle it
    n.amb = gain(1); n.ambLP = filt('lowpass', 20000, 0.5); n.amb.connect(n.ambLP); n.ambLP.connect(bus);
    // ambient: breeze in leaves
    n.breezeSrc = loopSrc(noiseBuf);
    n.breezeLP = filt('lowpass', 800, 0.7);
    n.breezeGain = gain(0);
    n.breezeSrc.connect(n.breezeLP); n.breezeLP.connect(n.breezeGain); n.breezeGain.connect(n.amb);
    lfo(0.11, 0.05, n.breezeGain.gain); lfo(0.07, 200, n.breezeLP.frequency);
    // distant tractor: low sawtooth drone with a slow chug
    { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 47; const lp = filt('lowpass', 210, 0.8); n.tractor = gain(0); const am = gain(0.5); const ch = gain(0.5);
      o.connect(lp); lp.connect(am); am.connect(n.tractor); n.tractor.connect(n.amb); lfo(6.5, 0.4, am.gain, 'triangle'); o.start(); }

    // insects at dusk: AM'd high tones (stereo-ish spatial)
    n.insect = [0, 1].map((i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 4300 + i * 520;
      const am = gain(0); const out = gain(0);
      o.connect(am); am.connect(out);
      lfo(i ? 31 : 24, 0.5, am.gain, 'square'); am.gain.value = 0.5;
      const p = panner(i ? 14 : -12, 1, -6 + i * 3); out.connect(p); p.connect(n.amb); o.start();
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
    // weather: rain bed (hiss + roar), storm gusts
    n.rainSrcA = loopSrc(noiseBuf); n.rainBP = filt('bandpass', 4200, 0.5); n.rainHiss = gain(0);
    n.rainSrcA.connect(n.rainBP); n.rainBP.connect(n.rainHiss); n.rainHiss.connect(bus);
    n.rainSrcB = loopSrc(brownBuf); n.rainLP = filt('lowpass', 1100, 0.7); n.rainRoar = gain(0);
    n.rainSrcB.connect(n.rainLP); n.rainLP.connect(n.rainRoar); n.rainRoar.connect(bus);
    n.gustSrc = loopSrc(noiseBuf); n.gustBP = filt('bandpass', 380, 0.9); n.gustGain = gain(0);
    n.gustMod = gain(0.6); n.gustSrc.connect(n.gustBP); n.gustBP.connect(n.gustMod); n.gustMod.connect(n.gustGain); n.gustGain.connect(bus);
    lfo(0.13, 400, n.gustBP.frequency); lfo(0.21, 0.4, n.gustMod.gain); // gusts: slow amplitude swell
    // track ambience: corn rustle bed, tyre squeal (asphalt)
    n.cornSrc = loopSrc(noiseBuf); n.cornBP = filt('bandpass', 3200, 0.7); n.cornGain = gain(0); n.cornMod = gain(0.7);
    n.cornSrc.connect(n.cornBP); n.cornBP.connect(n.cornMod); n.cornMod.connect(n.cornGain); n.cornGain.connect(n.amb); lfo(0.4, 0.3, n.cornMod.gain);
    n.sqSrc = loopSrc(noiseBuf); n.sqBP = filt('bandpass', 2300, 16); n.sqGain = gain(0);
    n.sqSrc.connect(n.sqBP); n.sqBP.connect(n.sqGain); n.sqGain.connect(bus); lfo(23, 600, n.sqBP.frequency);
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
    bump() { play('plank', { vol: 0.45, rate: rnd(0.55, 0.8) }); },
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
    const p = panner(pan[0], pan[1], pan[2]); p.connect(n.amb);
    const base = rnd(2400, 5200), notes = 2 + (Math.random() * 5 | 0), kind = Math.random();
    for (let i = 0; i < notes; i++) {
      const f = base * rnd(0.85, 1.25);
      tone({ f, f2: f * (kind < 0.5 ? rnd(1.2, 1.7) : rnd(0.55, 0.85)), a: 0.004, d: rnd(0.04, 0.1), vol: 0.14, dest: p, when: i * rnd(0.09, 0.16), fmRatio: rnd(1.5, 3), fmDepth: f * rnd(0.2, 0.6) });
    }
    setTimeout(() => { try { p.disconnect(); } catch (e) {} }, 2500);
  }
  function cow() {
    const p = panner(rnd(-1, 1) > 0 ? 120 : -120, 2, rnd(-150, -60)); p.connect(n.amb);
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

  // ---- per-track ambience ----
  let trackId = 'country';
  function farPan(x, y, z, life = 3500) { const p = panner(x, y, z); const lp = filt('lowpass', 3200, 0.6); lp.connect(p); p.connect(n.amb); setTimeout(() => { try { lp.disconnect(); p.disconnect(); } catch (e) {} }, life); return lp; }
  function churchBell() {
    const d = farPan(rnd(-90, 90), 14, rnd(-140, -80), 9000), f0 = [196, 233, 261][(Math.random() * 3) | 0], strikes = 1 + ((Math.random() * 4) | 0);
    for (let k = 0; k < strikes; k++) [[0.5, 4], [1, 3.4], [1.19, 2.8], [1.5, 2.4], [2, 1.8], [2.5, 1.4], [3, 1.0], [4.1, 0.7]].forEach(([m, t60], i) => tone({ f: f0 * m * 2, a: 0.003, d: t60, vol: 0.2 / (1 + i * 0.6), dest: d, when: k * 1.15 }));
  }
  function chatter() {
    const d = farPan(rnd(-70, 70), 1.7, rnd(-60, -25), 3000), g = gain(0.7); g.connect(d);
    for (let v = 0; v < 2; v++) voice({ type: 'sawtooth', path: [[0, rnd(110, 130)], [0.6, rnd(130, 190)], [1.3, rnd(105, 150)]], dur: 1.3, vol: 0.05, a: 0.1, rel: 0.2, formants: [[500 + v * 80, 4, 1], [1500, 5, 0.6], [2500, 6, 0.3]], am: [rnd(4, 6.5), 0.9], dest: g, when: v * 0.25 });
  }
  function dogBark() {
    const d = farPan(rnd(-100, 100), 1, rnd(-120, -40), 2500), n2 = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n2; i++) voice({ type: 'sawtooth', path: [[0, 520], [0.09, 340]], dur: 0.12, vol: 0.3, a: 0.008, rel: 0.05, formants: [[700, 6, 1], [1400, 6, 0.5], [2600, 6, 0.2]], dest: d, when: i * 0.24 });
  }
  function crow() {
    const d = farPan(rnd(-80, 80), rnd(10, 30), rnd(-90, -20), 3000), n2 = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n2; i++) voice({ type: 'sawtooth', path: [[0, 780], [0.2, 520]], dur: 0.24, vol: 0.2, a: 0.02, rel: 0.06, formants: [[1100, 6, 1], [2200, 6, 0.5]], am: [65, 0.5], dest: d, when: i * 0.36 });
  }
  function tannoy() {
    const d = farPan(rnd(-1, 1) > 0 ? 60 : -60, 6, -30, 4000);
    tone({ f: 880, type: 'triangle', d: 0.5, vol: 0.12, dest: d }); tone({ f: 659, type: 'triangle', d: 0.7, vol: 0.12, dest: d, when: 0.4 });
    const bp = gain(1); const f = filt('bandpass', 1700, 1.2); bp.connect(f); f.connect(d);
    voice({ type: 'sawtooth', path: [[0, 115], [0.5, 135], [1.1, 112], [1.6, 128]], dur: 1.6, vol: 0.12, a: 0.05, rel: 0.2, formants: [[550, 5, 1], [1600, 6, 0.8], [2500, 6, 0.4]], am: [5.5, 0.8], dest: bp, when: 1.0 });
  }

  const WEATHER = {
    clear: { rain: 0, gust: 0, ambLP: 20000, amb: 1, bird: 1 },
    fog:   { rain: 0, gust: 0, ambLP: 4500, amb: 0.8, bird: 0.35 },
    snow:  { rain: 0, gust: 0.1, ambLP: 1300, amb: 0.6, bird: 0.1 },
    rain:  { rain: 0.6, gust: 0.2, ambLP: 6000, amb: 0.7, bird: 0.1 },
    storm: { rain: 1, gust: 1, ambLP: 5000, amb: 0.7, bird: 0 },
  };
  let W = WEATHER.clear, weatherName = 'clear';

  // ---- horns: one procedural voice per truck id ----
  // voice: oscillator with a frequency path [[t,f],...], optional vibrato / AM buzz, formant bandpasses, envelope.
  function voice({ type = 'sawtooth', path, dur = 0.4, vol = 0.3, a = 0.01, rel = 0.08, formants = [], vib = null, am = null, dest, when = 0 }) {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(path[0][1], t);
    for (let i = 1; i < path.length; i++) o.frequency.linearRampToValueAtTime(path[i][1], t + path[i][0]);
    if (vib) { const l = ctx.createOscillator(); l.frequency.value = vib[0]; const lg = gain(vib[1]); l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + rel + 0.05); }
    const g = gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + Math.max(a, dur - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
    let tail = o; const sum = gain(1);
    if (formants.length) formants.forEach(([f, q, gn]) => { const b = filt('bandpass', f, q); const fg = gain(gn); tail.connect(b); b.connect(fg); fg.connect(sum); });
    else tail.connect(sum);
    let out = sum;
    if (am) { const ag = gain(1 - am[1]); const l = ctx.createOscillator(); l.type = 'square'; l.frequency.value = am[0]; const lg = gain(am[1] * 0.5); l.connect(lg); lg.connect(ag.gain); l.start(t); l.stop(t + dur + rel + 0.05); ag.gain.value = 1 - am[1] * 0.5; sum.connect(ag); out = ag; }
    out.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + rel + 0.05);
  }
  const HORNS = {
    'barrel-bomber'(d) { // rubber bulb horn: honk-HONK
      voice({ path: [[0, 360], [0.05, 330], [0.18, 310]], dur: 0.2, vol: 0.5, formants: [[900, 4, 1], [1800, 5, 0.8], [2800, 6, 0.5]], dest: d });
      voice({ path: [[0, 430], [0.05, 400], [0.3, 360]], dur: 0.38, vol: 0.55, formants: [[1000, 4, 1], [1900, 5, 0.8], [2900, 6, 0.5]], dest: d, when: 0.24 }); },
    'pallet-pounder'(d) { // two-tone truck horn
      voice({ type: 'square', path: [[0, 233], [0.8, 233]], dur: 0.8, vol: 0.28, formants: [[466, 6, 1], [700, 4, 0.6], [1400, 4, 0.3]], dest: d });
      voice({ type: 'square', path: [[0, 293], [0.8, 293]], dur: 0.8, vol: 0.28, formants: [[586, 6, 1], [880, 4, 0.6], [1760, 4, 0.3]], dest: d }); },
    'rust-bucket'(d) { // a-OO-ga
      voice({ type: 'sawtooth', path: [[0, 220], [0.22, 420], [0.34, 520], [0.55, 300], [0.75, 190]], dur: 0.75, vol: 0.4, a: 0.03, rel: 0.1, formants: [[420, 3, 1], [850, 4, 0.35]], dest: d }); },
    'wagon-wheel-willy'(d) { // bicycle bell: ding-ding
      for (let i = 0; i < 3; i++) { const w = i * 0.17; [[2300, 0.5, 0.5], [3550, 0.3, 0.3], [5700, 0.16, 0.18]].forEach(([f, t60, a]) => tone({ f, a: 0.001, d: t60, vol: a, dest: d, when: w })); } },
    'bathtub-betty'(d) { // duck call: quack quack
      for (let i = 0; i < 2; i++) voice({ type: 'sawtooth', path: [[0, 520], [0.05, 640], [0.2, 400]], dur: 0.2, vol: 0.5, a: 0.015, rel: 0.05, formants: [[640, 5, 1], [1250, 6, 0.55]], am: [85, 0.6], dest: d, when: i * 0.3 }); },
    'door-dasher'(d) { // kazoo: da-da-daaa
      [[440, 0, 0.14], [440, 0.2, 0.14], [587, 0.4, 0.5]].forEach(([f, w, dd]) => voice({ type: 'sawtooth', path: [[0, f], [dd, f * 1.01]], dur: dd, vol: 0.38, a: 0.02, formants: [[1800, 3, 1], [3000, 4, 1], [4200, 5, 0.6]], am: [140, 0.5], vib: [6, 4], dest: d, when: w })); },
    'crate-comet'(d) { // clown horn
      voice({ type: 'square', path: [[0, 900], [0.12, 1300]], dur: 0.14, vol: 0.28, formants: [[2000, 4, 1], [3400, 5, 0.7]], dest: d });
      voice({ type: 'square', path: [[0, 820], [0.28, 1600]], dur: 0.3, vol: 0.28, formants: [[2000, 4, 1], [3400, 5, 0.7]], dest: d, when: 0.17 }); },
    'tin-lizzie'(d) { // steam whistle with breath
      voice({ type: 'sine', path: [[0, 640], [0.9, 650]], dur: 0.9, vol: 0.35, a: 0.06, rel: 0.2, vib: [5, 6], formants: [[650, 8, 1], [1300, 8, 0.5]], dest: d });
      burst({ f: 3000, q: 1.5, a: 0.1, d: 0.8, vol: 0.06, dest: d }); },
    'ladder-larry'(d) { // fire siren wail
      voice({ type: 'triangle', path: [[0, 600], [0.45, 1000], [0.9, 600], [1.35, 1000]], dur: 1.35, vol: 0.32, a: 0.05, rel: 0.2, formants: [[900, 2, 1], [1800, 3, 0.4]], dest: d }); },
    'sled-dog'(d) { // sleigh bells
      for (let i = 0; i < 14; i++) { const w = i * 0.045 + Math.random() * 0.02, f = 3000 + Math.random() * 3500; tone({ f, a: 0.001, d: 0.22, vol: 0.12, dest: d, when: w }); tone({ f: f * 1.51, a: 0.001, d: 0.12, vol: 0.06, dest: d, when: w }); } },
  };
  const HORN_GAIN = { 'barrel-bomber': 1.5, 'pallet-pounder': 1.0, 'rust-bucket': 0.9, 'wagon-wheel-willy': 1.0, 'bathtub-betty': 1.4, 'door-dasher': 1.5, 'crate-comet': 2.1, 'tin-lizzie': 0.45, 'ladder-larry': 0.5, 'sled-dog': 1.9 }; // loudness-matched (see tests/audio-metrics.mjs)
  const hornAt = {};
  function posOf(o) {
    if (!o) return null;
    if (typeof o.getWorldPosition === 'function') { const v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, }; try { const r = o.getWorldPosition(v); return { x: r.x, y: r.y, z: r.z }; } catch (e) {} }
    if (o.matrixWorld && o.matrixWorld.elements) { const e = o.matrixWorld.elements; return { x: e[12], y: e[13], z: e[14] }; }
    if (o.position) return { x: o.position.x, y: o.position.y, z: o.position.z };
    if (o.x != null) return { x: o.x, y: o.y || 0, z: o.z || 0 };
    return null;
  }

  const api = {
    get ready() { return ready; },
    get context() { return ctx; },
    /** Call from a user gesture (touchend/click). Safe to call repeatedly. */
    unlock() {
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC && !offlineMode) return false;
          ctx = offlineMode ? options.context : new AC({ latencyHint: 'interactive' });
          build();
        }
        if (!offlineMode && ctx.state !== 'running') ctx.resume();
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
      if (!ready || (!offlineMode && ctx.state !== 'running')) return;
      dt = clamp(dt || 0.016, 0.001, 0.1);
      const t = ctx.currentTime, tc = 0.06;
      const speed = Math.max(0, p.speed || 0);
      const sp = clamp(speed / 28, 0, 1.4);
      let contacts = p.wheelContacts;
      if (Array.isArray(contacts)) contacts = contacts.reduce((a, c) => a + (c ? 1 : 0), 0);
      if (contacts == null) contacts = 4;
      const ground = clamp(contacts / 4, 0, 1);
      const surfName = (typeof p.surface === 'object' && p.surface ? p.surface.type : p.surface) || 'dirt';
      const S = SURF[surfName] || (surfName === 'cobbles' ? SURF.cobble : surfName === 'tarmac' ? SURF.asphalt : SURF.dirt);
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
      n.hissHP.frequency.setTargetAtTime(surfName === 'sand' ? 2800 : 3000, t, 0.1);
      n.hissGain.gain.setTargetAtTime(S.hiss * 0.1 * sp * ground, t, tc);
      if (ground > 0.1 && speed > 0.8) {
        const rate = S.rate * speed * ground * 0.8, v = 0.55 * Math.min(1, 0.3 + sp);
        const GR = { dirt: ['dirt', 1, 0], gravel: ['gravel', 1, 0], rock: ['knock', 1.35, 0], sand: ['dirt', 0.6, 800], grass: ['dirt', 0.8, 1800], mud: ['mud', 0.9, 0], water: ['drip', 1, 0], cobble: ['knock', 1.9, 2600], cobbles: ['knock', 1.9, 2600], kerb: ['plank', 1.3, 2000], asphalt: ['dirt', 1.1, 2200], tarmac: ['dirt', 1.1, 2200] }[surfName] || ['dirt', 1, 0];
        poisson('grain', dt, rate, () => play(GR[0], { rate: GR[1] * rnd(0.8, 1.25) * (0.85 + sp * 0.3), vol: v * rnd(0.4, 1) * (GR[0] === 'mud' ? 0.42 : GR[0] === 'knock' ? 0.3 : GR[0] === 'drip' ? 0.7 : 0.7), lp: GR[2] }));
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

      // ambient bed: ducks as the wind rises; weather muffles / thins it
      const duck = 1 - clamp(sp, 0, 1) * 0.5;
      poisson('bird', dt, (0.7 - dusk * 0.55) * duck * W.bird, () => chirp([rnd(-60, 60), rnd(5, 25), rnd(-80, 20)]));
      poisson('cow', dt, 0.012 * duck * W.bird, cow);
      const ins = dusk * duck * 0.012;
      n.insect.forEach((g) => g.gain.setTargetAtTime(ins * (W.bird > 0.3 ? 1 : 0), t, 1));
      n.breezeGain.gain.setTargetAtTime(0.12 * duck + 0.05 * W.gust, t, 0.5);
      if (n.tractor) n.tractor.gain.setTargetAtTime(0.05 * duck, t, 0.5);
      n.amb.gain.setTargetAtTime(W.amb, t, 1.0); n.ambLP.frequency.setTargetAtTime(W.ambLP, t, 1.0);
      n.rainHiss.gain.setTargetAtTime(0.14 * W.rain, t, 1.0); n.rainRoar.gain.setTargetAtTime(0.15 * W.rain, t, 1.0);
      n.gustGain.gain.setTargetAtTime(0.1 * W.gust, t, 0.8);
      if (W.rain > 0) poisson('patter', dt, 26 * W.rain, () => play('drip', { vol: 0.07 * W.rain, rate: rnd(1.4, 2.6), lp: 5000 }));

      // per-track ambience
      const slip = clamp(p.slip ?? (Math.abs(p.steer || 0) * clamp(speed / 12, 0, 1)), 0, 1);
      const asphalt = surfName === 'asphalt' || surfName === 'tarmac';
      n.sqGain.gain.setTargetAtTime(asphalt && ground > 0.5 ? 0.11 * Math.pow(slip, 1.5) * (speed > 3 ? 1 : 0) : 0, t, 0.05);
      n.sqBP.frequency.setTargetAtTime(1900 + speed * 25, t, 0.2);
      n.cornGain.gain.setTargetAtTime(trackId === 'corn' ? (0.05 + 0.1 * clamp(sp, 0, 1)) : 0, t, 0.6);
      if (trackId === 'village') {
        poisson('bell', dt, 1 / 70, churchBell); poisson('chat', dt, 0.12 * duck, chatter); poisson('dog', dt, 0.03, dogBark);
      } else if (trackId === 'corn') {
        poisson('crow', dt, 0.14 * duck * (W.bird > 0.05 ? 1 : 0.3), crow); n.breezeGain.gain.setTargetAtTime(0.18 * duck + 0.05 * W.gust, t, 0.5);
      } else if (trackId === 'circuit') {
        poisson('pa', dt, 1 / 25, tannoy);
      }
      let crowdNear = p.crowd;
      if (crowdNear == null && trackId === 'circuit' && p.s != null) { const L = p.lapLength || 1072.7, lp = ((p.s % L) + L) % L, dd = Math.min(lp, L - lp); crowdNear = clamp(1 - dd / 140, 0, 1); }
      state.crowdNear = crowdNear || 0;

      // crowd swell near the finish arch (finishDist in metres) + cowbell when passing an opponent
      if (n.crowd) {
        const fd = p.finishDist;
        const target = fd == null ? 0 : clamp(1 - fd / 260, 0, 1) ** 1.5 * 0.4;
        n.crowd.gain.setTargetAtTime(Math.max(target, state.crowdNear * state.crowdNear * 0.38), t, 0.6);
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
      if (!ready || (!offlineMode && ctx.state !== 'running')) return;
      const f = SOUNDS[name]; if (f) { try { f(); } catch (e) { console.warn('oneShot', name, e); } }
    },
    names: Object.keys(SOUNDS),
    /** Horn per truck id. pos: Object3D | {x,y,z} | null (null = your own car, centred). Rate-limited per id. */
    honk(truckId, pos = null) {
      if (!ready || (!offlineMode && ctx.state !== 'running')) return;
      const now = ctx.currentTime, key = truckId + (pos ? '@o' : '@me');
      if (hornAt[key] && now - hornAt[key] < 0.15) return; hornAt[key] = now;
      const fn = HORNS[truckId] || HORNS['barrel-bomber']; const pp = posOf(pos);
      const out = gain((pos ? 1.0 : 0.8) * (HORN_GAIN[truckId] || 1)); let node = out, panNode = null;
      if (pp) { panNode = panner(pp.x, pp.y, pp.z); panNode.refDistance = 6; panNode.rolloffFactor = 1.1; out.connect(panNode); panNode.connect(bus); }
      else out.connect(bus);
      try { fn(out); } catch (e) { console.warn('honk', truckId, e); }
      setTimeout(() => { try { out.disconnect(); panNode && panNode.disconnect(); } catch (e) {} }, 3000);
    },
    hornIds: Object.keys(HORNS),
    /** 'country'|'village'|'corn'|'circuit': switches ambience (village bell/chatter/dogs, corn crows/rustle, circuit crowd/PA/squeal). */
    setTrack(id) { trackId = ['village', 'corn', 'circuit'].includes(id) ? id : 'country'; },
    get track() { return trackId; },
    /** Fire ambience one-shots on demand: 'bell'|'bark'|'caw'|'tannoy'|'chatter'. */
    ambience(name) { if (!ready) return; ({ bell: churchBell, bark: dogBark, caw: crow, tannoy, chatter })[name]?.(); },
    hornIds2: undefined,
    /** 'clear'|'fog'|'snow'|'rain'|'storm' */
    setWeather(name) { W = WEATHER[name] || WEATHER.clear; weatherName = WEATHER[name] ? name : 'clear'; },
    get weather() { return weatherName; },
    /** Thunder rumble after `delaySec` (call alongside the lightning flash with the flash-to-sound delay). */
    thunder(delaySec = 1.5, vol = 0.8) {
      if (!ready || (!offlineMode && ctx.state !== 'running')) return;
      play('thunder', { when: Math.max(0, delaySec), vol: 0.9 * vol, rate: rnd(0.85, 1.1) });
    },
  };
  return api;
}
