// Procedural canvas textures for the salvaged trucks (wood grain, rust, rope, paint/decal atlas).
// All generated lazily once per page and shared by every truck.
import * as THREE from 'three';

let cache = null;

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function finish(c, { repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// draw `fn(dx,dy)` wrapped so the texture tiles seamlessly
function wrap(ctx, w, h, fn) {
  for (let dx = -w; dx <= w; dx += w) for (let dy = -h; dy <= h; dy += h) fn(dx, dy);
}

function woodTexture() {
  const W = 512, H = 512, r = mulberry(11);
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#d3bc92'; g.fillRect(0, 0, W, H);
  // broad tonal bands
  for (let i = 0; i < 40; i++) {
    const y = r() * H, hh = 6 + r() * 30;
    g.fillStyle = `rgba(${90 + r() * 40},${60 + r() * 30},${30 + r() * 20},${0.05 + r() * 0.08})`;
    wrap(g, W, H, (dx, dy) => g.fillRect(dx, y + dy, W, hh));
  }
  // grain streaks
  for (let i = 0; i < 420; i++) {
    const y = r() * H, x = r() * W, len = 60 + r() * 380, dark = r() < 0.7;
    g.strokeStyle = dark ? `rgba(70,45,22,${0.08 + r() * 0.22})` : `rgba(240,225,190,${0.08 + r() * 0.15})`;
    g.lineWidth = 0.6 + r() * 1.8;
    const wob = (r() - 0.5) * 5;
    wrap(g, W, H, (dx, dy) => {
      g.beginPath(); g.moveTo(x + dx, y + dy);
      g.bezierCurveTo(x + dx + len * 0.3, y + dy + wob, x + dx + len * 0.6, y + dy - wob, x + dx + len, y + dy + wob * 0.3);
      g.stroke();
    });
  }
  // knots with rings
  for (let k = 0; k < 5; k++) {
    const x = r() * W, y = r() * H, rr = 6 + r() * 12;
    wrap(g, W, H, (dx, dy) => {
      for (let i = 5; i > 0; i--) {
        g.fillStyle = `rgba(${55 + i * 8},${34 + i * 5},${15 + i * 3},${0.25 + (5 - i) * 0.1})`;
        g.beginPath(); g.ellipse(x + dx, y + dy, rr * i / 3.2, rr * i / 6, 0, 0, 7); g.fill();
      }
    });
  }
  // cracks
  for (let i = 0; i < 12; i++) {
    const x = r() * W, y = r() * H, len = 40 + r() * 140;
    g.strokeStyle = 'rgba(30,20,10,0.55)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - 0.5) * 5); g.stroke();
  }
  // grey weathering and speckle
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1);
  }
  return finish(c);
}

function rustTexture() {
  const W = 512, H = 512, r = mulberry(23);
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#9a9c98'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { // big blotches of rust
    const x = r() * W, y = r() * H, rad = 20 + r() * 80;
    const col = [[150, 70, 25], [120, 55, 22], [170, 95, 40], [90, 45, 25]][(r() * 4) | 0];
    wrap(g, W, H, (dx, dy) => {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      gr.addColorStop(0, `rgba(${col},${0.35 + r() * 0.4})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    });
  }
  for (let i = 0; i < 160; i++) { // drip streaks
    const x = r() * W, y = r() * H, len = 30 + r() * 160;
    g.strokeStyle = `rgba(95,45,18,${0.1 + r() * 0.25})`; g.lineWidth = 1 + r() * 3;
    wrap(g, W, H, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + (r() - 0.5) * 6, y + dy + len); g.stroke(); });
  }
  for (let i = 0; i < 50; i++) { // bright paint chips / scratches
    g.fillStyle = `rgba(220,220,215,${0.2 + r() * 0.3})`;
    g.fillRect(r() * W, r() * H, 2 + r() * 10, 1 + r() * 3);
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)';
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
  return finish(c);
}

function ropeTexture() {
  const W = 64, H = 64, r = mulberry(5);
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#b79b6a'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(60,42,20,0.75)'; g.lineWidth = 5;
  for (let i = -H; i < W + H; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); }
  g.strokeStyle = 'rgba(235,215,170,0.5)'; g.lineWidth = 2;
  for (let i = -H + 6; i < W + H; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); }
  for (let i = 0; i < 500; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(r() * W, r() * H, 1, 1); }
  return finish(c);
}

// ---- paint / decal atlas: 4x4 cells of 256px. Cell 0 is the plain mottled paint. ----
export const DECAL = {
  plain: 0, plateA: 1, plateB: 2, n7: 3, n42: 4, n13: 5, n9: 6, bomber: 7,
  flames: 8, checker: 9, n3: 10, n88: 11, betty: 12, fragile: 13, willy: 14, comet: 15,
};
export const CELL = 0.25;

function outlined(g, text, x, y, font, fill, stroke, lw) {
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = stroke; g.strokeText(text, x, y);
  g.fillStyle = fill; g.fillText(text, x, y);
}

function paintNumber(g, ox, oy, text, fill, stroke, size = 170, rot = -0.06) {
  g.save(); g.translate(ox + 128, oy + 128); g.rotate(rot);
  outlined(g, text, 0, 6, `900 ${size}px Impact, "Arial Black", sans-serif`, fill, stroke, 14);
  // drips
  g.fillStyle = fill;
  for (let i = 0; i < 4; i++) { g.fillRect(-60 + i * 38, size * 0.35, 5, 14 + (i * 13) % 30); }
  g.restore();
}

function atlasTexture() {
  const S = 1024, C = 256, r = mulberry(77);
  const c = canvas(S, S), g = c.getContext('2d');
  const cell = (i) => [(i % 4) * C, ((i / 4) | 0) * C];
  // 0: plain paint, mottled; multiplies with vertex colour
  g.fillStyle = '#ececec'; g.fillRect(0, 0, C, C);
  for (let i = 0; i < 60; i++) {
    const x = r() * C, y = r() * C, rad = 8 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const v = r() < 0.5 ? 0 : 255;
    gr.addColorStop(0, `rgba(${v},${v},${v},${0.05 + r() * 0.1})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 40; i++) { // chips: dark flecks and rust
    g.fillStyle = r() < 0.5 ? 'rgba(90,60,35,0.5)' : 'rgba(70,70,70,0.45)';
    g.fillRect(r() * C, r() * C, 1 + r() * 5, 1 + r() * 3);
  }
  for (let i = 0; i < 20; i++) {
    g.strokeStyle = 'rgba(40,40,40,0.25)'; g.lineWidth = 1;
    const x = r() * C, y = r() * C; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 20); g.stroke();
  }
  // plates
  let [ox, oy] = cell(DECAL.plateA);
  g.fillStyle = '#e8c630'; g.fillRect(ox + 8, oy + 56, 240, 144);
  g.strokeStyle = '#2a2410'; g.lineWidth = 6; g.strokeRect(ox + 14, oy + 62, 228, 132);
  outlined(g, 'KY 5-77', ox + 128, oy + 128, '900 64px Impact, sans-serif', '#1d1a0a', '#e8c630', 1);
  [ox, oy] = cell(DECAL.plateB);
  g.fillStyle = '#e9ecef'; g.fillRect(ox + 8, oy + 56, 240, 144);
  g.fillStyle = '#1e4aa0'; g.fillRect(ox + 8, oy + 56, 240, 34);
  g.strokeStyle = '#1e4aa0'; g.lineWidth = 5; g.strokeRect(ox + 14, oy + 62, 228, 132);
  outlined(g, 'SOAP BOX', ox + 128, oy + 74, '700 26px Arial', '#fff', '#1e4aa0', 1);
  outlined(g, 'DERBY 1', ox + 128, oy + 140, '900 62px Impact, sans-serif', '#15213d', '#e9ecef', 1);
  // hand-painted numbers (transparent bg)
  [ox, oy] = cell(DECAL.n7); paintNumber(g, ox, oy, '7', '#f4f1e6', '#1a1a1a');
  [ox, oy] = cell(DECAL.n42); paintNumber(g, ox, oy, '42', '#f2c200', '#1a1a1a', 130);
  [ox, oy] = cell(DECAL.n13); paintNumber(g, ox, oy, '13', '#f4f1e6', '#7a1010', 130, 0.05);
  [ox, oy] = cell(DECAL.n9); paintNumber(g, ox, oy, '9', '#d8352a', '#f4f1e6', 170, 0.04);
  [ox, oy] = cell(DECAL.n3); paintNumber(g, ox, oy, '3', '#f4f1e6', '#102a5a');
  [ox, oy] = cell(DECAL.n88); paintNumber(g, ox, oy, '88', '#f4f1e6', '#1a1a1a', 130);
  // stencil / script names
  [ox, oy] = cell(DECAL.bomber); outlined(g, 'BOMBER', ox + 128, oy + 128, '900 66px Impact, sans-serif', '#f0e6c8', '#1a1a1a', 8);
  [ox, oy] = cell(DECAL.betty); outlined(g, 'Betty', ox + 128, oy + 128, 'italic 900 80px "Brush Script MT", cursive, serif', '#e7508a', '#fff', 6);
  [ox, oy] = cell(DECAL.willy); outlined(g, 'WILLY', ox + 128, oy + 128, '900 72px Georgia, serif', '#f4d03a', '#4a1a0a', 9);
  [ox, oy] = cell(DECAL.comet); outlined(g, 'COMET', ox + 128, oy + 128, 'italic 900 70px Impact, sans-serif', '#ffffff', '#c1272d', 9);
  [ox, oy] = cell(DECAL.fragile);
  outlined(g, 'FRAGILE', ox + 128, oy + 100, '900 50px Arial Black, sans-serif', '#2a1a10', '#2a1a10', 1);
  outlined(g, 'THIS END UP', ox + 128, oy + 160, '700 28px Arial', '#2a1a10', '#2a1a10', 1);
  // flames
  [ox, oy] = cell(DECAL.flames);
  for (let i = 0; i < 5; i++) {
    const cols = ['#c8220e', '#f07a10', '#ffd020'];
    for (let k = 0; k < 3; k++) {
      g.fillStyle = cols[k]; g.beginPath();
      const x0 = ox + 12 + i * 46, w = 46 - k * 8, h = 150 - k * 36 - (i % 2) * 24;
      g.moveTo(x0, oy + 200); g.quadraticCurveTo(x0 + w * 0.2, oy + 200 - h * 0.6, x0 + w * 0.7 + k * 4, oy + 200 - h);
      g.quadraticCurveTo(x0 + w * 0.7, oy + 200 - h * 0.4, x0 + w + 10, oy + 200); g.fill();
    }
  }
  // checker band
  [ox, oy] = cell(DECAL.checker);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
    g.fillStyle = (i + j) % 2 ? '#111' : '#f2f2f2'; g.fillRect(ox + i * 16, oy + 96 + j * 16, 16, 16);
  }
  return finish(c, { repeat: false, aniso: 8 });
}

export function getTextures() {
  if (cache) return cache;
  if (typeof document === 'undefined') return (cache = {});
  cache = { wood: woodTexture(), rust: rustTexture(), rope: ropeTexture(), atlas: atlasTexture() };
  return cache;
}
