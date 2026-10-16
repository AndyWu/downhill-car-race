// Input: wheel-like device-tilt steering, split-screen swipe paddles, thumb zones, keyboard fallback.
// Zone layout (fractions of viewport), exported so UI can draw glyphs:
export const ZONES = {
  handbrake: { x0: 0, x1: 0.26, y0: 0.58, y1: 1 },   // lower-left: press & drag down
  headlight: { x0: 0.66, x1: 0.80, y0: 0.58, y1: 1 }, // lower-right: tap
  gear: { x0: 0.80, x1: 1, y0: 0.50, y1: 1 },        // lower-right corner: drag up = forward, down = reverse
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const inZone = (z, nx, ny) => nx >= z.x0 && nx <= z.x1 && ny >= z.y0 && ny <= z.y1;

export function createInput(dom) {
  const win = typeof window !== 'undefined' ? window : null;
  const IOS = !!win && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const isTouch = !!win && (('ontouchstart' in win) || navigator.maxTouchPoints > 0);

  const S = {
    enabled: true, debug: null,
    keys: new Set(), keySteer: 0, keyHB: 0,
    pendL: 0, pendR: 0,
    touchHB: 0, headlight: false, reverse: false,
    // motion
    hasMotion: false, gx: 0, gy: 0, gz: 0, relAngle: 0, zero: 0, steerMotion: 0, motionOK: false,
    lastT: 0, orientCbs: [], stallMs: 0, frames: 0, ring: [],
  };
  const DEBUG = /[?&]debug=input/.test(location.search);
  const out = { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false };
  const DEAD = 3 * Math.PI / 180, FULL = 45 * Math.PI / 180;

  // ---------- keyboard ----------
  const kd = (e) => {
    if (!S.enabled || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (!e.repeat) {
      if (k === 'q') S.pendL = Math.min(1, S.pendL + 0.85);
      else if (k === 'e') S.pendR = Math.min(1, S.pendR + 0.85);
      else if (k === 'l') S.headlight = !S.headlight;
      else if (k === 'r') S.reverse = !S.reverse;
      else if (k === 'c') calibrate();
    }
    S.keys.add(k);
    if (' arrowleft arrowright arrowup arrowdown'.split(' ').includes(k) || k === ' ') e.preventDefault();
  };
  const ku = (e) => S.keys.delete(e.key.toLowerCase());
  win && win.addEventListener('keydown', kd);
  win && win.addEventListener('keyup', ku);
  win && win.addEventListener('blur', () => S.keys.clear());

  // ---------- device motion steering ----------
  function screenAngle() {
    const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
    return a * Math.PI / 180;
  }
  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null) return;
    const k = S.hasMotion ? 0.3 : 1;
    S.gx += (a.x - S.gx) * k; S.gy += (a.y - S.gy) * k; S.gz += ((a.z || 0) - S.gz) * k;
    S.hasMotion = true;
    const mag = Math.hypot(S.gx, S.gy, S.gz) || 1;
    S.flat = Math.abs(S.gz) / mag > 0.8; // lying flat: angle meaningless
    if (S.flat) return;
    const sg = IOS ? -1 : 1;
    // clockwise rotation of the device (as the user sees it) about the screen normal
    const theta = Math.atan2(-sg * S.gx, sg * S.gy);
    S.relAngle = wrapPi(theta + screenAngle());
    S.ring.push(S.relAngle); if (S.ring.length > RING) S.ring.shift();
    if (S.calLeft > 0) {
      S.calS += Math.sin(S.relAngle); S.calC += Math.cos(S.relAngle);
      if (--S.calLeft === 0) S.zero = Math.atan2(S.calS, S.calC);
    }
  }
  win && win.addEventListener('devicemotion', onMotion);
  // Calibrate from the samples collected BEFORE this call (a ~0.5 s ring buffer, i.e. the countdown): take the median,
  // drop samples more than 8 deg from it, circular-mean the rest. A player already turning at GO therefore can't bake the turn
  // into zero. With too little history (first gesture) fall back to the next 10 samples.
  const RING = 40;
  const wrapped = (a, ref) => wrapPi(a - ref);
  function calibrate() {
    S.steerMotion = 0;
    const r = S.ring;
    if (r.length >= 8) {
      const ref = r[r.length - 1];
      const rel = r.map((a) => wrapped(a, ref)).sort((x, y) => x - y);
      const med = rel[rel.length >> 1];
      const keep = rel.filter((x) => Math.abs(x - med) < 8 * Math.PI / 180);
      const mean = keep.reduce((a, b) => a + b, 0) / Math.max(1, keep.length);
      S.zero = wrapPi(ref + mean); S.calLeft = 0;
    } else { S.zero = S.relAngle; S.calLeft = 10; S.calS = 0; S.calC = 0; }
  }
  function motionSteer(dt) {
    if (!S.hasMotion || !isTouch || S.flat) return null;
    let a = wrapPi(S.relAngle - S.zero);
    const sgn = Math.sign(a); a = Math.max(0, Math.abs(a) - DEAD);
    const tgt = clamp(sgn * a / (FULL - DEAD), -1, 1);
    S.steerMotion += (tgt - S.steerMotion) * Math.min(1, dt * 12);
    return S.steerMotion;
  }

  // ---------- touch ----------
  const ptrs = new Map();
  const W = () => win.innerWidth, H = () => win.innerHeight;
  function ignoreTarget(t) { return t && t.closest && t.closest('button,a,input,select,textarea,[data-ui],.ui-interactive'); }
  function down(e) {
    if (!S.enabled || e.pointerType === 'mouse' && !S.mouseTouch) { if (DEBUG) console.log('[input] down ignored: enabled=', S.enabled, e.pointerType); return; }
    if (ignoreTarget(e.target)) { if (DEBUG) console.log('[input] down ignored: target', e.target && (e.target.tagName + '.' + e.target.className)); return; }
    const nx = e.clientX / W(), ny = e.clientY / H();
    const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientY * 0 + e.clientX, y: e.clientY, t0: e.timeStamp, tl: e.timeStamp, role: 'swipe', side: nx < 0.5 ? 'L' : 'R', accum: 0, dir: 0, moved: 0 };
    if (nx < 0.5 && inZone(ZONES.handbrake, nx, ny)) p.role = 'handbrake';
    else if (nx >= 0.5 && inZone(ZONES.gear, nx, ny)) p.role = 'gear';
    else if (nx >= 0.5 && inZone(ZONES.headlight, nx, ny)) p.role = 'headlight';
    p.stall0 = S.stallMs; p.frames0 = S.frames;
    ptrs.set(e.pointerId, p);
    if (DEBUG) console.log('[input] down', p.role, p.side, Math.round(e.clientX), Math.round(e.clientY), e.pointerType);
    if (p.role === 'handbrake') S.touchHB = 0.25;
    try { dom.setPointerCapture && dom.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault && e.preventDefault();
  }
  function emitStroke(p, dist, speed) {
    const strength = clamp(Math.abs(dist) / (H() * 0.16), 0.15, 1) * clamp(0.45 + speed / 1.2, 0.45, 1);
    if (p.side === 'L') S.pendL = Math.min(1, S.pendL + strength); else S.pendR = Math.min(1, S.pendR + strength);
  }
  function move(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const now = e.timeStamp;
    const dy = e.clientY - p.y, dx = e.clientX - p.x, dtms = Math.max(1, now - p.tl);
    p.x = e.clientX; p.y = e.clientY; p.tl = now; p.moved += Math.abs(dx) + Math.abs(dy);
    if (p.role === 'handbrake') {
      S.touchHB = clamp(0.25 + (p.y - p.y0) / (H() * 0.2), 0, 1);
    } else if (p.role === 'gear') {
      const d = p.y - p.y0;
      if (d < -H() * 0.07) S.reverse = false; else if (d > H() * 0.07) S.reverse = true;
    } else if (p.role === 'swipe') {
      const vy = Math.abs(dy) / dtms; // px/ms
      const sgn = Math.sign(dy);
      if (sgn === 0) return;
      if (p.dir !== 0 && sgn !== p.dir) {
        if (Math.abs(p.accum) > H() * 0.035) emitStroke(p, p.accum, vy);
        p.accum = 0;
      }
      p.dir = sgn; p.accum += dy;
      if (Math.abs(p.accum) > H() * 0.22) { emitStroke(p, p.accum, vy); p.accum = 0; }
    }
    e.preventDefault && e.preventDefault();
  }
  function up(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.role === 'handbrake') S.touchHB = 0;
    if (p.role === 'headlight' || p.role === 'swipe') {
      // Headlight = a tap that is released inside the headlight zone (whatever role the press was given), still, and brief.
      // The time window is 600 ms plus any frame-stall credit; presses/releases within two frames always count (stalled page).
      const nx = e.clientX / W(), ny = e.clientY / H();
      const held = e.timeStamp - p.t0, allowed = 600 + (S.stallMs - p.stall0);
      const sameFrame = S.frames - p.frames0 <= 2;
      const inZ = inZone(ZONES.headlight, nx, ny);
      if (DEBUG) console.log('[input] up', p.role, 'inZone', inZ, 'held', Math.round(held), 'allowed', Math.round(allowed), 'moved', Math.round(p.moved));
      if (inZ && p.moved < 24 && (held < allowed || sameFrame || (held < 2000 && S.stallMs > 0))) {
        S.headlight = !S.headlight; if (DEBUG) console.log('[input] headlight ->', S.headlight);
        p.accum = 0; return;
      }
    }
    if (p.role === 'swipe' && Math.abs(p.accum) > H() * 0.035) emitStroke(p, p.accum, 0.6);
  }
  if (dom) {
    dom.style.touchAction = 'none';
    // capture phase: nothing in the UI layer can swallow a release (a tap needs its pointerup)
    win.addEventListener('pointerdown', down, { passive: false, capture: true });
    win.addEventListener('pointermove', move, { passive: false, capture: true });
    win.addEventListener('pointerup', up, { capture: true });
    win.addEventListener('pointercancel', up, { capture: true });
  }

  // ---------- orientation / fullscreen / permissions ----------
  function isLandscape() { return win.innerWidth >= win.innerHeight; }
  function notifyOrient() { for (const cb of S.orientCbs) try { cb(isLandscape()); } catch { /* ignore */ } }
  win && win.addEventListener('resize', notifyOrient);
  win && win.addEventListener('orientationchange', notifyOrient);

  async function requestPermissions() {
    const jobs = [];
    for (const C of [win.DeviceMotionEvent, win.DeviceOrientationEvent]) {
      if (C && typeof C.requestPermission === 'function') jobs.push(C.requestPermission().then((r) => r === 'granted').catch(() => false));
    }
    try {
      const el = document.documentElement;
      if (isTouch && !document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      }
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
    } catch { /* unsupported */ }
    const res = jobs.length ? await Promise.all(jobs) : [true];
    S.motionOK = res.every(Boolean);
    calibrate(); // the player is now holding the wheel: whatever pose they hold is straight ahead
    return { motion: S.motionOK, landscape: isLandscape() };
  }

  // ---------- read ----------
  function read(simDt) {
    const now = performance.now();
    const dt = simDt != null ? simDt : clamp((now - (S.lastT || now)) / 1000, 0, 0.1); S.lastT = now;
    const K = S.keys;
    const kt = ((K.has('d') || K.has('arrowright')) ? 1 : 0) - ((K.has('a') || K.has('arrowleft')) ? 1 : 0);
    S.keySteer += (kt - S.keySteer) * Math.min(1, dt * (kt === 0 ? 8 : 5));
    S.keyHB += ((K.has(' ') ? 1 : 0) - S.keyHB) * Math.min(1, dt * 12);
    const ms = motionSteer(dt);
    let steer = Math.abs(S.keySteer) > 0.02 || ms === null ? S.keySteer : ms;
    out.steer = clamp(steer, -1, 1);
    out.paddleL = Math.min(1, S.pendL); out.paddleR = Math.min(1, S.pendR);
    S.pendL = S.pendR = 0;
    // one shared lever curve for touch, keyboard and debug input: the lever travels up at <= 4/s, releases instantly
    let hbTarget = Math.max(S.touchHB, S.keyHB);
    out.headlight = S.headlight; out.reverse = S.reverse;
    if (S.debug) {
      const d = S.debug;
      if (d.steer != null) out.steer = d.steer;
      // debug paddles act as a stroke cadence (~every 0.33 s) so tests can "paddle continuously"
      const sdt = simDt != null ? simDt : dt; // simulation time keeps advance() deterministic
      if (d.paddleL) { S.dbgL = (S.dbgL || 0) - sdt; if (S.dbgL <= 0) { out.paddleL = d.paddleL; S.dbgL = 0.33; } }
      if (d.paddleR) { S.dbgR = (S.dbgR || 0) - sdt; if (S.dbgR <= 0) { out.paddleR = d.paddleR; S.dbgR = 0.33; } }
      if (d.handbrake != null) hbTarget = d.handbrake;
      if (d.headlight != null) out.headlight = !!d.headlight;
      if (d.reverse != null) out.reverse = !!d.reverse;
    }
    S.hbOut = hbTarget <= (S.hbOut || 0) ? clamp(hbTarget, 0, 1) : Math.min(clamp(hbTarget, 0, 1), (S.hbOut || 0) + 4 * dt);
    out.handbrake = S.hbOut;
    return out;
  }

  return {
    noteFrame() { S.frames++; },
    // called at the END of every frame with its duration: a frame that hogged the thread delayed any pointer events queued behind it
    noteFrameEnd(ms) { if (ms > 100) S.stallMs += ms - 50; }, read, requestPermissions, calibrate, isLandscape, isTouch,
    setEnabled(v) { S.enabled = !!v; if (!v) { ptrs.clear(); S.touchHB = 0; } },
    setDebugInput(i) { S.debug = i ? { ...i } : null; S.dbgL = S.dbgR = 0; },
    setHeadlight(v) { S.headlight = !!v; }, setReverse(v) { S.reverse = !!v; },
    enableMouseAsTouch(v = true) { S.mouseTouch = v; },
    onOrientationChange(cb) { S.orientCbs.push(cb); },
    get hasMotion() { return S.hasMotion; },
    get rawAngleDeg() { return (S.relAngle - S.zero) * 180 / Math.PI; },
    ZONES,
  };
}
