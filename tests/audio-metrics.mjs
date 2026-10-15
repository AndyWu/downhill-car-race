import { chromium } from '/home/user/downhill-car-race/node_modules/playwright/index.mjs';
import fs from 'fs';
const b = await chromium.launch(); const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(['error','warning'].includes(m.type())) errs.push(m.text()); });
await p.goto('http://localhost:5199/tests/ui-preview.html');
const res = await p.evaluate(async (cfg)=>{
  const { createAudio } = await import('/src/audio/index.js');
  const out = {};
  for (const [name, conf] of Object.entries(cfg)) {
    let seed = 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const SR = 44100, DUR = 10;
    const oc = new OfflineAudioContext(2, SR * DUR, SR);
    const a = createAudio({ context: oc }); a.unlock();
    const listener = { matrixWorld: { elements: [1,0,0,0,0,1,0,0,0,0,1,0,0,2,0,1] }, updateWorldMatrix(){} };
    const step = 1/30;
    for (let i = 0; i * step < DUR - 0.05; i++) {
      oc.suspend(i * step || 0.0001).then(() => {
        a.update(step, { speed: conf.speed ?? 8, surface: conf.surface, wheelContacts: 4, bumps: conf.bumps, paddleL: 0, paddleR: 0, handbrake: 0, listener, dusk: 0 });
        oc.resume();
      });
    }
    const buf = await oc.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, m = new Float32Array(n);
    for (let i = 0; i < n; i++) m[i] = 0.5 * (L[i] + R[i]);
    // metrics (skip first 1 s)
    let sum = 0, peak = 0; const st = SR;
    for (let i = st; i < n; i++) { sum += m[i] * m[i]; peak = Math.max(peak, Math.abs(m[i]), Math.abs(L[i]), Math.abs(R[i])); }
    const rms = Math.sqrt(sum / (n - st));
    // spectral centroid via averaged 4096 FFT frames
    const N = 4096, re = new Float64Array(N), im = new Float64Array(N);
    let cnum = 0, cden = 0, hf = 0, tot = 0;
    const fft = () => { for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(ang * k), wi = Math.sin(ang * k); const ur = re[i+k], ui = im[i+k]; const vr = re[i+k+len/2]*wr - im[i+k+len/2]*wi, vi = re[i+k+len/2]*wi + im[i+k+len/2]*wr; re[i+k] = ur+vr; im[i+k] = ui+vi; re[i+k+len/2] = ur-vr; im[i+k+len/2] = ui-vi; } } };
    const bands = new Float64Array(6); const edges = [0, 250, 800, 2000, 4000, 8000, 22050];
    for (let f0 = st; f0 + N < n; f0 += N * 2) {
      for (let i = 0; i < N; i++) { re[i] = m[f0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; }
      fft();
      for (let k = 1; k < N / 2; k++) { const mag = re[k]*re[k] + im[k]*im[k], f = k * SR / N; cnum += f * mag; cden += mag; for (let e = 0; e < 6; e++) if (f >= edges[e] && f < edges[e+1]) bands[e] += mag; }
    }
    const bt = bands.reduce((x, y) => x + y, 0);
    // WAV (int16 mono) base64
    const i16 = new Int16Array(n); for (let i = 0; i < n; i++) i16[i] = Math.max(-1, Math.min(1, m[i])) * 32767;
    let bin = ''; const u8 = new Uint8Array(i16.buffer); for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    out[name] = { rms, peak, crest: peak / rms, centroid: cnum / cden, bands: Array.from(bands).map(x => x / bt), b64: btoa(bin), sr: SR };
  }
  return out;
}, {
  dirt: { surface: 'dirt', bumps: 0.2 }, gravel: { surface: 'gravel', bumps: 0.35 }, mud: { surface: 'mud', bumps: 0.3 },
  water: { surface: 'water', bumps: 0.1 }, rock: { surface: 'rock', bumps: 0.7 }, sand: { surface: 'sand', bumps: 0.1 }, ambient: { surface: 'dirt', bumps: 0.2, speed: 0 },
});
const wav = (b64, sr) => { const d = Buffer.from(b64, 'base64'); const h = Buffer.alloc(44); h.write('RIFF',0); h.writeUInt32LE(36 + d.length,4); h.write('WAVEfmt ',8); h.writeUInt32LE(16,16); h.writeUInt16LE(1,20); h.writeUInt16LE(1,22); h.writeUInt32LE(sr,24); h.writeUInt32LE(sr*2,28); h.writeUInt16LE(2,32); h.writeUInt16LE(16,34); h.write('data',36); h.writeUInt32LE(d.length,40); return Buffer.concat([h,d]); };
console.log('clip      rms(dBFS) peak   crest  centroid  bands<250/800/2k/4k/8k/>8k');
for (const [k, v] of Object.entries(res)) {
  fs.writeFileSync(`/tmp/claude-0/audio-${k}.wav`, wav(v.b64, v.sr));
  console.log(k.padEnd(8), (20*Math.log10(v.rms)).toFixed(1).padStart(8), v.peak.toFixed(2).padStart(6), v.crest.toFixed(1).padStart(6), String(Math.round(v.centroid)).padStart(8), v.bands.map(x=>(x*100).toFixed(0).padStart(3)).join(' '));
}
console.log('errors', errs);
fs.writeFileSync('/tmp/claude-0/audio-metrics.json', JSON.stringify(Object.fromEntries(Object.entries(res).map(([k,v])=>[k,{...v,b64:undefined}]))));
await b.close();
