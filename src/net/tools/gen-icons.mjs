// Generates PWA icons as PNG with zero dependencies (raw PNG encoding via node:zlib).
//   node src/net/tools/gen-icons.mjs        → public/icons/*.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../../public/icons');

// ---- PNG encoder ----
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- tiny vector scene (normalised 0..1 coords, y down) ----
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function sdRoundRect(px, py, cx, cy, hw, hh, r, ang) {
  const c = Math.cos(-ang), s = Math.sin(-ang);
  let x = (px - cx) * c - (py - cy) * s, y = (px - cx) * s + (py - cy) * c;
  const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function shade(u, v, scale) {
  // undo safe-zone scale (maskable icons keep content inside central 80 %)
  const x = (u - 0.5) / scale + 0.5, y = (v - 0.5) / scale + 0.5;
  let col = mix(hex('#f2a65a'), hex('#fde3a7'), Math.min(1, Math.max(0, v * 1.4)));
  if (Math.hypot(x - 0.74, y - 0.26) < 0.12) col = hex('#fff4d6');
  const slope = 0.32, ang = Math.atan(slope);
  const hillY = 0.56 + slope * (x - 0.5);
  if (y > hillY) col = hex('#5b3d22');
  if (y > hillY && y < hillY + 0.07) col = hex('#c99a5e');
  if (y > hillY + 0.07 && ((x * 37 + y * 11) % 1) < 0.08) col = hex('#4a3019');
  // soap box car riding the slope
  const cx = 0.44, cy = 0.56 + slope * (cx - 0.5) - 0.13;
  const n = [-Math.sin(ang), Math.cos(ang)]; // slope normal (down)
  const wheel = (o) => { const wx = cx + Math.cos(ang) * o + n[0] * 0.075, wy = cy + Math.sin(ang) * o + n[1] * 0.075; return Math.hypot(x - wx, y - wy); };
  if (Math.hypot(x - (cx - 0.04 * Math.cos(ang) - n[0] * 0.085), y - (cy - 0.04 * Math.sin(ang) - n[1] * 0.085)) < 0.055) col = hex('#3a2a1a'); // helmet
  if (sdRoundRect(x, y, cx, cy, 0.25, 0.065, 0.05, ang) < 0) col = hex('#c8341c');
  if (sdRoundRect(x, y, cx + 0.03 * Math.cos(ang), cy + 0.03 * Math.sin(ang), 0.06, 0.02, 0.015, ang) < 0) col = hex('#f6efe1'); // number plate
  for (const o of [-0.16, 0.16]) { const d = wheel(o); if (d < 0.07) col = hex('#1b1712'); if (d < 0.03) col = hex('#b9b2a4'); }
  return col;
}
function render(size, { scale = 1 } = {}) {
  const SS = 4, buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let acc = [0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, scale);
      acc = acc.map((v, i) => v + c[i]);
    }
    const o = (py * size + px) * 4;
    buf[o] = acc[0] / (SS * SS); buf[o + 1] = acc[1] / (SS * SS); buf[o + 2] = acc[2] / (SS * SS); buf[o + 3] = 255;
  }
  return encodePNG(size, size, buf);
}

mkdirSync(OUT, { recursive: true });
const jobs = [
  ['icon-192.png', 192, {}], ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { scale: 0.78 }],
  ['apple-touch-icon-180.png', 180, {}],
];
for (const [name, size, opts] of jobs) { const png = render(size, opts); writeFileSync(join(OUT, name), png); console.log(name, png.length, 'bytes'); }
