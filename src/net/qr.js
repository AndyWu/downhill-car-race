// QR rendering (qrcode-generator) and camera scanning (getUserMedia + jsQR on an offscreen
// canvas in a requestAnimationFrame loop).

import qrcode from 'qrcode-generator';

/**
 * Draw a high-contrast QR (black on white, 4-module quiet zone, integer module size).
 * @returns {HTMLCanvasElement}
 */
export function renderQR(text, { canvas = document.createElement('canvas'), size = 360, ecl = 'L' } = {}) {
  const qr = qrcode(0, ecl);
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const mod = Math.max(2, Math.floor(size / (n + quiet * 2)));
  const px = mod * (n + quiet * 2);
  canvas.width = px; canvas.height = px;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, px, px);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + quiet) * mod, (r + quiet) * mod, mod, mod);
  canvas.style.imageRendering = 'pixelated';
  canvas.dataset.modules = String(n);
  return canvas;
}

/**
 * Camera QR scanner.
 * @param {{onResult:(text:string)=>void, facingMode?:'environment'|'user', video?:HTMLVideoElement, maxDim?:number}} o
 * @returns {{video:HTMLVideoElement, start():Promise<void>, stop():void, flip():Promise<void>, running:boolean}}
 */
export function createScanner({ onResult, facingMode = 'environment', video, maxDim = 640 } = {}) {
  video ??= document.createElement('video');
  video.setAttribute('playsinline', ''); video.muted = true; video.autoplay = true;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream = null, raf = 0, jsQR = null, frame = 0, last = '', lastAt = 0;
  const api = { video, running: false, facingMode, start, stop, flip };

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera not available (needs HTTPS / Home-Screen app). Use the text code instead.');
    jsQR ??= (await import('jsqr')).default;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: api.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = stream;
    await video.play().catch(() => {});
    api.running = true;
    loop();
  }
  function loop() {
    if (!api.running) return;
    raf = requestAnimationFrame(loop);
    if ((frame++ & 1) || video.readyState < 2) return; // decode every 2nd frame (~30 Hz)
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;
    const k = Math.min(1, maxDim / Math.max(vw, vh));
    const w = Math.round(vw * k), h = Math.round(vh * k);
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const res = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
    if (res && res.data) {
      const t = performance.now();
      if (res.data !== last || t - lastAt > 2000) { last = res.data; lastAt = t; onResult?.(res.data); }
    }
  }
  function stop() {
    api.running = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null; video.srcObject = null;
  }
  async function flip() {
    api.facingMode = api.facingMode === 'environment' ? 'user' : 'environment';
    if (api.running) { stop(); await start(); }
  }
  return api;
}
