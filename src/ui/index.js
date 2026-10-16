// Diegetic UI: hand-painted plywood / chalk-on-barn-board menus. No HUD during the race.
import { CSS } from './styles.js';
import { createProjector } from './projection.js';

export const AI_NAMES = ['Barnaby', 'Clementine', 'Buster', 'Maeve', 'Ace'];
const SEAT_COLORS = ['#c63a24', '#2f7bbf', '#f2c230', '#3f7d3a', '#8a4fb0', '#e07a1f', '#2aa6a0', '#d65a9a', '#8a6a3a', '#6b7a86'];
const SVGNS = 'http://www.w3.org/2000/svg';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const ordinal = (n) => (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
const fmtTime = (s) => { if (s == null) return ''; const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };

const ORIENT_SVG = `<svg viewBox="0 0 200 200" aria-hidden="true">
 <g class="pad"><rect x="62" y="22" width="76" height="156" rx="12" fill="#1c1c1c" stroke="#f6f2e4" stroke-width="4"/>
 <rect x="69" y="36" width="62" height="124" rx="3" fill="#f2c230"/><circle cx="100" cy="168" r="4" fill="#f6f2e4" opacity=".7"/>
 <path d="M80 135 L100 62 L120 135 Z" fill="#c63a24" opacity=".85"/><rect x="92" y="135" width="16" height="12" fill="#3f1710"/></g>
 <g class="arc" fill="none" stroke="#f6f2e4" stroke-width="5" stroke-linecap="round"><path d="M40 70 A66 66 0 0 1 100 18"/><path d="M88 6 L102 18 L88 30"/></g></svg>`;

const peg = `<svg viewBox="0 0 64 64"><defs><linearGradient id="pg" x1="0" x2="1"><stop offset="0" stop-color="#e2bd86"/><stop offset="1" stop-color="#9c6e3a"/></linearGradient></defs>
 <rect x="26" y="4" width="12" height="40" rx="3" fill="url(#pg)" stroke="#2a170a" stroke-width="3"/><ellipse cx="32" cy="46" rx="22" ry="12" fill="url(#pg)" stroke="#2a170a" stroke-width="3"/>
 <rect x="23" y="40" width="6" height="14" rx="2" fill="#2a170a"/><rect x="35" y="40" width="6" height="14" rx="2" fill="#2a170a"/></svg>`;
const G = (inner, vb) => `<svg viewBox="${vb}" fill="none" stroke="#f6f2e4" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const GLYPHS = {
  padL: G('<path class="sw" d="M12 60 Q40 20 80 38"/><path class="sw" d="M66 22 L82 38 L64 50"/><path d="M8 78 q30 8 60 0" opacity=".5" stroke-dasharray="2 8"/>', '0 0 100 90'),
  padR: G('<path class="sw" d="M88 60 Q60 20 20 38"/><path class="sw" d="M34 22 L18 38 L36 50"/><path d="M92 78 q-30 8 -60 0" opacity=".5" stroke-dasharray="2 8"/>', '0 0 100 90'),
  hb: G('<path d="M20 80 L38 20"/><circle cx="40" cy="14" r="9"/><path d="M8 84 H60"/><path d="M52 34 q10 8 0 20" opacity=".6"/><path d="M56 28 q16 14 0 32" opacity=".4"/>', '0 0 70 95'),
  hl: G('<path d="M30 52 a18 18 0 1 1 30 0 q-6 6 -6 14 h-18 q0 -8 -6 -14z"/><path d="M36 74 h18 M39 82 h12"/><path d="M45 6 v10 M14 20 l8 7 M76 20 l-8 7 M4 46 h9 M77 46 h9" opacity=".7"/>', '0 0 90 90'),
  gear: G('<path d="M45 80 V30"/><circle cx="45" cy="22" r="10"/><path d="M14 52 h12 M64 52 h12 M20 70 h6 M64 70 h6" opacity=".6"/><text x="8" y="38" fill="#f6f2e4" stroke="none" font-size="14" font-family="Impact,sans-serif">F</text><text x="68" y="38" fill="#f6f2e4" stroke="none" font-size="14" font-family="Impact,sans-serif">R</text>', '0 0 90 90'),
};

export function createUI(root, opts = {}) {
  let aiRoster = AI_NAMES;
  const o = { trucks: [], ...opts };
  const cb = (name, ...a) => { try { return o[name] && o[name](...a); } catch (e) { console.error(`UI callback ${name}`, e); } };
  if (!document.getElementById('sbd-style')) document.head.append(h('style', { id: 'sbd-style' }, CSS));

  const el = h('div', { class: 'sbd-root' });
  root.append(el);
  // shared SVG filter: rough painted edges
  el.append(h('div', { html: `<svg width="0" height="0" style="position:absolute"><filter id="sbd-rough"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.2"/></filter></svg>` }));

  const screens = {};
  const mk = (name, cls, ...kids) => (screens[name] = el.appendChild(h('div', { class: `sbd-screen ${cls || ''}`, 'data-screen': name }, ...kids)));
  let current = null, orientForced = null;

  // ---------- orientation overlay ----------
  const orient = h('div', { class: 'sbd-orient', role: 'alert' },
    h('div', { html: ORIENT_SVG }), h('h2', {}, 'Turn your iPad sideways'),
    h('p', {}, 'The hill is wider than it is tall. Rotate to landscape to roll out.'));
  document.body.append(orient);
  function refreshOrient() {
    const portrait = orientForced != null ? orientForced : window.innerHeight > window.innerWidth * 1.02;
    orient.classList.toggle('on', !!portrait);
  }
  window.addEventListener('resize', refreshOrient);
  window.addEventListener('orientationchange', refreshOrient);
  refreshOrient();
  const tryLock = () => { try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) {} };

  // ---------- title ----------
  const gyroBtn = h('button', { class: 'sbd-btn chalk sbd-gyro', onClick: async () => {
    const r = await cb('onGyro'); api.setGyroState(r === false ? 'denied' : 'granted');
  } }, 'Tap to hold the wheel');
  const btn = (label, cls, fn, sub) => h('button', { class: `sbd-btn ${cls || ''}`, onClick: (e) => { tryLock(); fn(e); } }, label, sub ? h('small', {}, sub) : null);
  // ---------- weather chooser (title + garage), persisted ----------
  const WEATHERS = [['clear', 'Clear'], ['fog', 'Foggy'], ['snow', 'Snow'], ['rain', 'Heavy Rain'], ['storm', 'Stormy']];
  const TIMES = [['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']];
  let wx = { weather: 'clear', time: 'day' };
  try { const v = JSON.parse(localStorage.getItem('sbd-weather') || 'null'); if (v && WEATHERS.some((w) => w[0] === v.weather) && TIMES.some((t) => t[0] === v.time)) wx = { weather: v.weather, time: v.time }; } catch (e) {}
  const wxChips = [];
  function paintWx() { for (const c of wxChips) c.el.classList.toggle('on', wx[c.kind] === c.id); }
  function setWx(next, fire) {
    wx = { ...wx, ...next }; paintWx();
    try { localStorage.setItem('sbd-weather', JSON.stringify(wx)); } catch (e) {}
    if (fire) cb('onWeather', { ...wx });
  }
  function makeWeather(compact) {
    const row = (kind, list, label) => h('div', { class: 'sbd-wrow' }, h('span', { class: 'sbd-wlab' }, label),
      ...list.map(([id, text]) => { const el = h('button', { class: 'sbd-chip', 'aria-label': text, onClick: () => { tryLock(); setWx({ [kind]: id }, true); } }, text); wxChips.push({ el, kind, id }); return el; }));
    return h('div', { class: `sbd-ply sbd-weather${compact ? ' compact' : ''}` }, row('weather', WEATHERS, 'Weather'), row('time', TIMES, 'Time'));
  }
  const offlineMark = h('div', { class: 'sbd-offline' }, '\u2713 ready to race offline');
  mk('title', 'sbd-barn sbd-title-screen',
    h('div', { class: 'sbd-leftcol' },
      h('div', { class: 'sbd-ply sbd-sign' },
        h('h1', { class: 'sbd-title' }, 'Soap Box', h('span', {}, 'DERBY')),
        h('div', { class: 'sbd-stripe' }),
        h('p', {}, 'Homemade racers · one big hill · 3.2 km of gravity')),
      makeWeather(false)),
    h('div', { class: 'sbd-menu' },
      btn('Solo Race', 'primary', () => cb('onStartSolo'), null),
      btn('Host Family Race', '', () => cb('onHost'), 'up to 6 on one hotspot'),
      btn('Join Race', '', () => cb('onJoin'), 'scan the host’s code'),
      btn('Garage', '', () => api.show('garage')),
      btn('Family Pass', '', () => { api.show('familypass'); cb('onFamilyPass'); })),
    gyroBtn, offlineMark);

  // ---------- garage ----------
  let gi = 0;
  const statDefs = [
    ['Speed', (t) => 1 / Math.max(1e-4, (t.dragCoef || 1) * (t.frontalArea || 1) / ((t.mass || 100) * 0.01 + 1))],
    ['Grip', (t) => t.gripMul],
    ['Steering', (t) => (t.steerLock || 0) * (t.steerRate || 1)],
    ['Paddle power', (t) => t.paddleEfficiency],
    ['Brakes', (t) => t.brakeForce],
    ['Suspension', (t) => (t.suspension ? t.suspension.travel * 1 + 0.0 * t.suspension.stiffness : 0)],
  ];
  const statRanges = () => statDefs.map(([, f]) => { const v = o.trucks.map(f).filter(Number.isFinite); const mn = Math.min(...v), mx = Math.max(...v); return [mn, mx]; });
  const slot = h('div', { class: 'sbd-slot' });
  const gNum = h('div', { class: 'sbd-num' });
  const gName = h('h3'), gDesc = h('p', { class: 'desc' }), gStats = h('div', { class: 'sbd-stats' }), gDots = h('div', { class: 'sbd-dots' });
  mk('garage', 'sbd-barn sbd-garage',
    h('div', { class: 'sbd-head' }, h('h2', { class: 'sbd-title sbd-chalk', style: 'color:var(--chalk)' }, 'The Garage'),
      btn('Back', 'small chalk', () => api.show('title'))),
    h('div', { class: 'sbd-garage-body' },
      btn('‹', 'sbd-arrow', () => api.selectTruck(gi - 1)),
      h('div', { class: 'sbd-preview' }, slot, h('div', { class: 'sbd-floor' }), gNum),
      h('div', { class: 'sbd-ply sbd-card' }, gName, gDesc, gStats),
      btn('›', 'sbd-arrow', () => api.selectTruck(gi + 1))),
    h('div', { class: 'sbd-foot' }, gDots, makeWeather(true), btn('Pick this one', 'green', () => { cb('onSelectTruck', o.trucks[gi], gi); api.show('title'); })));
  // swipe in preview
  { let x0 = null; slot.parentElement.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    slot.parentElement.addEventListener('pointerup', (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) api.selectTruck(gi + (dx < 0 ? 1 : -1)); }); }

  function renderGarage() {
    const T = o.trucks; if (!T.length) { gName.textContent = 'No trucks'; return; }
    gi = (gi + T.length) % T.length; const t = T[gi];
    gName.textContent = t.name || t.id; gDesc.textContent = t.description || '';
    gNum.textContent = String(gi + 1).padStart(2, '0');
    const ranges = statRanges(); gStats.replaceChildren();
    statDefs.forEach(([label, f], i) => {
      const [mn, mx] = ranges[i]; const v = f(t);
      const all = T.map(f), rank = all.filter((x) => x < v - 1e-9).length / Math.max(1, T.length - 1);
      const lin = mx - mn > 1e-9 ? (v - mn) / (mx - mn) : 0.5;
      const pct = 0.07 + 0.88 * (0.55 * lin + 0.45 * rank); // blend linear + rank so differences are always visible
      const mark = h('i', { style: `left:${pct * 100}%` }), fill = h('em', { style: `width:${pct * 100}%` });
      gStats.append(h('div', { class: 'sbd-stat' }, h('span', {}, label), h('div', { class: 'sbd-tape' }, fill, mark)));
    });
    gDots.replaceChildren(...T.map((_, i) => h('b', { class: i === gi ? 'on' : '' })));
  }

  // ---------- lobby ----------
  const stepsEl = h('ol', { class: 'sbd-steps' });
  const qrBox = h('div', { class: 'sbd-qrbox' }, h('div', { class: 'ph' }, 'Code appears here'));
  const caption = h('div', { class: 'sbd-caption' });
  const actions = h('div', { class: 'sbd-actions' });
  const seatsEl = h('ul', { class: 'sbd-seats' });
  const statusEl = h('div', { class: 'sbd-status' });
  const lobbyTitle = h('h2', {}, 'Family Race');
  const startBtn = btn('Start Race', 'primary', () => cb('onStartRace'));
  const lobbyRole = { v: 'host' };
  let customSteps = false;
  function renderSteps(steps) {
    stepsEl.replaceChildren();
    steps.forEach((s) => { const t = typeof s === 'string' ? { text: s } : s; const st = t.state || (t.done ? 'done' : (t.active ? 'active' : '')); stepsEl.append(h('li', { class: st }, t.text)); });
  }
  mk('lobby', 'sbd-barn sbd-lobby',
    h('div', { class: 'sbd-ply sbd-modal' }, lobbyTitle,
      h('div', { class: 'sbd-lobby-cols' }, stepsEl, h('div', { class: 'sbd-qrcol' }, qrBox, caption, actions), seatsEl),
      statusEl,
      h('div', { class: 'sbd-foot' }, btn('Back', 'small chalk', () => { cb('onLobbyBack'); api.show('title'); }), startBtn)));

  const defaultSteps = {
    host: ['On this iPad: Settings › Personal Hotspot › Allow Others to Join.', 'On the other iPads: Settings › Wi-Fi › join this iPad’s network.', 'Others tap “Join Race” and scan the code shown here.', 'Hold up this iPad to read each reply code back, then press Start.'],
    client: ['Settings › Wi-Fi › join the host iPad’s Personal Hotspot.', 'Point the camera at the host’s code.', 'Show your reply code to the host’s camera.', 'Wait for the host to start the race.'],
  };

  // ---------- family pass ----------
  const passBody = h('div', { class: 'sbd-ticket' }, 'Checking pass…');
  mk('familypass', 'sbd-barn sbd-pass', h('div', { class: 'sbd-ply sbd-modal' }, h('h2', {}, 'Family Pass'),
    h('p', {}, 'One pass lets the whole family race together on up to 6 iPads. No internet needed once it’s set up.'), passBody,
    h('div', { class: 'sbd-foot' }, btn('Back', 'small chalk', () => api.show('title')), btn('Restore / Add iPad', 'green small', () => cb('onFamilyPassAction')))));

  // ---------- race (zero HUD) ----------
  const glyphs = h('div', { class: 'sbd-glyphs' },
    h('div', { class: 'g-pad', html: GLYPHS.padL }), h('div', { class: 'g-padr', html: GLYPHS.padR }),
    h('div', { class: 'g-hb', html: GLYPHS.hb }), h('div', { class: 'g-hl', html: GLYPHS.hl }), h('div', { class: 'g-gear', html: GLYPHS.gear }));
  const pegBtn = h('button', { class: 'sbd-peg', 'aria-label': 'Pause', html: peg, onClick: () => { api.show('pause'); cb('onPause'); } });
  const toast = h('div', { class: 'sbd-toast' });
  const rankEl = h('div', { class: 'sbd-rank', 'aria-hidden': 'true' }, h('b', {}, '-'), h('span', {}, '/-'));
  // horn: a visible, translucent bulb-horn button at the top-centre (also the H key)
  const hornBtn = h('button', { class: 'sbd-horn', 'aria-label': 'Honk', html: '<svg viewBox="0 0 64 40" width="100%" height="100%"><path d="M6 14h10l26-10v32L16 26H6z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><circle cx="52" cy="20" r="3" fill="currentColor"/><path d="M56 9q6 11 0 22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>' });
  hornBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); hornBtn.classList.add('hit'); setTimeout(() => hornBtn.classList.remove('hit'), 160); cb('onHonk'); });
  mk('race', '', glyphs, pegBtn, toast, rankEl, hornBtn);
  paintWx();

  const pauseScr = mk('pause', 'sbd-center', h('div', { class: 'sbd-ply sbd-pause' }, h('h2', {}, 'Paused'),
    btn('Keep rolling', 'green', () => { api.show('race'); cb('onResume'); }),
    btn('Back to the barn', 'chalk', () => { cb('onQuit'); api.show('title'); })));
  pauseScr.querySelector('.sbd-pause').style.color = 'var(--ink)';

  const placardWrap = h('div');
  mk('finish', 'sbd-center', placardWrap);

  // Glyph timing (zero-HUD): shown at low opacity during the countdown, fade to 0 over 3 s starting at GO
  // (ui.raceStarted()) regardless of touches. Only touch-idleness (10 s with NO touch at all) brings them
  // back, briefly, at <=35% opacity.
  let gTimer = null, idleTimer = null, safetyTimer = null;
  const glyphOn = () => { glyphs.classList.add('on'); };
  const glyphOff = () => { glyphs.classList.remove('on'); };
  // Idle flash is a newcomer hint only: before the first paddle stroke AND within the first 20 s of the race.
  let raceT0 = 0, stroke = false, dragStart = null;
  const hintsAllowed = () => !stroke && performance.now() - raceT0 < 8000; // idle flash is effectively off: the first one would be at 10 s
  function armIdle() { clearTimeout(idleTimer); if (hintsAllowed()) idleTimer = setTimeout(idleFlash, 10000); }
  function idleFlash() {
    if (current !== 'race' || !hintsAllowed()) return;
    glyphs.classList.add('on', 'faint'); clearTimeout(gTimer);
    gTimer = setTimeout(() => { glyphOff(); glyphs.classList.remove('faint'); armIdle(); }, 2200);
  }
  function noteStroke() { stroke = true; clearTimeout(idleTimer); }
  function noteInput() { if (current === 'race') armIdle(); } // touches never keep glyphs up
  window.addEventListener('pointerdown', (e) => { dragStart = [e.clientX, e.clientY]; }, { passive: true, capture: true });
  window.addEventListener('pointermove', (e) => { if (dragStart && current === 'race' && Math.hypot(e.clientX - dragStart[0], e.clientY - dragStart[1]) > 40) noteStroke(); }, { passive: true, capture: true });
  window.addEventListener('pointerup', () => { dragStart = null; }, { passive: true, capture: true });
  window.addEventListener('keydown', (e) => { if (['a', 'd', 'A', 'D', 'ArrowLeft', 'ArrowRight', 'q', 'e', 'z', 'x'].includes(e.key)) noteStroke(); }, { passive: true });
  window.addEventListener('pointerdown', noteInput, { passive: true, capture: true });
  window.addEventListener('keydown', noteInput, { passive: true });

  let standingsEl = null;
  // Running rows: ranked by projection from a 20 s rolling-average speed (see projection.js). Finished by time, DNF last.
  let projector = createProjector();
  function renderStandings(ul, list) {
    const running = list.filter((e) => e.time == null && e.status !== 'dnf' && e.s != null);
    const proj = new Map(projector(running, performance.now() / 1000, (performance.now() - raceT0) / 1000).map((r) => [r.e, r.eta]));
    const rows = list.map((e, i) => {
      const dnf = e.status === 'dnf', fin = e.time != null, run = !fin && !dnf;
      return { e, i, fin, dnf, run, eta: run ? (proj.has(e) ? proj.get(e) : e.eta) : null };
    });
    const key = (r) => (r.fin ? r.e.time : r.run ? 1e6 + (r.eta ?? 1e5) : 1e9);
    rows.sort((a, b) => key(a) - key(b) || (b.e.s ?? 0) - (a.e.s ?? 0) || a.i - b.i);
    ul.replaceChildren(...rows.map((r, i) => {
      const e = r.e;
      const txt = r.fin ? fmtTime(e.time) : r.run ? (r.eta != null ? `still rolling\u2026 ~${Math.max(1, Math.round(r.eta))}s` : 'still rolling\u2026') : 'DNF';
      return h('li', { class: (e.you ? 'me ' : '') + (r.run ? 'rolling' : '') }, h('b', {}, `${i + 1}.`), e.name, h('span', {}, txt));
    }));
  }
  // ---------- api ----------
  const api = {
    el, screens,
    show(name) {
      if (!screens[name]) return;
      const leaving = current; current = name;
      for (const [k, s] of Object.entries(screens)) s.classList.toggle('on', k === name || (name === 'pause' && k === 'race'));
      screens.race.classList.toggle('on', name === 'race' || name === 'pause');
      el.style.pointerEvents = 'none';
      if (name === 'race' && leaving !== 'pause') {
        raceT0 = performance.now(); stroke = false; rankEl.classList.remove('on');
        clearTimeout(gTimer); clearTimeout(idleTimer); clearTimeout(safetyTimer); glyphs.classList.remove('faint'); glyphOn();
        safetyTimer = setTimeout(() => { glyphOff(); armIdle(); }, 6000); // if main never calls raceStarted()
        armIdle();
      } else if (name !== 'race' && name !== 'pause') { clearTimeout(gTimer); clearTimeout(idleTimer); clearTimeout(safetyTimer); glyphOff(); }
      if (name === 'garage') renderGarage();
      if (name === 'lobby') api.setLobbyRole(lobbyRole.v);
      cb('onScreen', name);
    },
    hide() { current = null; for (const s of Object.values(screens)) s.classList.remove('on'); clearTimeout(gTimer); clearTimeout(idleTimer); clearTimeout(safetyTimer); },
    get screen() { return current; },
    setOrientationBlocked(b) { orientForced = b == null ? null : !!b; refreshOrient(); },
    // ---- lobby slots (for Agent 2 / main) ----
    setLobbyRole(role /* 'host'|'client' */) {
      lobbyRole.v = role; lobbyTitle.textContent = role === 'host' ? 'Host a Family Race' : 'Join a Family Race';
      startBtn.style.display = role === 'host' ? '' : 'none';
      if (!customSteps) renderSteps(defaultSteps[role]);
    },
    /** steps: string[] or [{text, state:'todo'|'active'|'done'}] */
    setLobbySteps(steps) { customSteps = !!steps; renderSteps(steps || defaultSteps[lobbyRole.v]); },
    /** Shows a QR (HTMLCanvasElement | HTMLImageElement | data: URL string) with caption. */
    showQR(src, text = '') {
      qrBox.classList.remove('scan'); qrBox.replaceChildren();
      if (typeof src === 'string') qrBox.append(h('img', { src, alt: 'QR code' }));
      else if (src) qrBox.append(src);
      else qrBox.append(h('div', { class: 'ph' }, 'Code appears here'));
      caption.textContent = text;
    },
    /** Shows camera feed (HTMLVideoElement) with framing reticle. */
    showScanner(video, text = 'Line the code up inside the corners') {
      qrBox.classList.add('scan'); qrBox.replaceChildren();
      if (video) { video.setAttribute('playsinline', ''); video.muted = true; qrBox.append(video); }
      qrBox.append(h('div', { class: 'sbd-reticle' }, h('b'), h('i')));
      caption.textContent = text;
    },
    /** Slot under the QR caption for the net lobby's button bar (element or null to clear). */
    setLobbyActions(el) { actions.replaceChildren(); if (el) actions.append(el); },
    /** Shows a small chalk "ready to race offline" mark on the title screen. */
    setOfflineReady(b) { offlineMark.classList.toggle('on', !!b); },
    clearQR() { api.showQR(null, ''); },
    setCaption(t) { caption.textContent = t; },
    setLobbyStatus(t) { statusEl.textContent = t || ''; },
    setStartEnabled(b) { startBtn.toggleAttribute('disabled', !b); },
    /** list: [{name, you?, ready?, kind?:'host'|'human'}]; empty seats auto-fill with named AI. */
    /** Names used for AI backfill (e.g. from AI_ROSTER, worst -> best or lineup order). */
    setAINames(names) { aiRoster = Array.isArray(names) && names.length ? names.map((n) => (typeof n === 'string' ? n : n.name)) : AI_NAMES; },
    /** list: [{name, you?, ready?, kind?:'host'|'human'}]; remaining seats (default 10) fill with AI names
     *  (opts.aiNames, else setAINames(), else built-ins), then 'Open seat'. */
    setPlayers(list = [], { seats = 10, aiBackfill = true, aiNames = null } = {}) {
      seatsEl.replaceChildren(); let ai = 0; const names = aiNames || aiRoster;
      seatsEl.style.setProperty('--rows', seats); seatsEl.classList.toggle('dense', seats > 6);
      for (let i = 0; i < seats; i++) {
        const p = list[i], col = SEAT_COLORS[i % SEAT_COLORS.length];
        if (p) seatsEl.append(h('li', { class: 'sbd-seat human' }, h('span', { class: 'dot', style: `--c:${p.color || col}` }), p.name + (p.you ? ' (you)' : ''), h('span', { class: 'tag' }, p.kind === 'host' ? 'HOST' : (p.ready === false ? '\u2026' : 'READY'))));
        else if (aiBackfill && ai < names.length) seatsEl.append(h('li', { class: 'sbd-seat ai' }, h('span', { class: 'dot', style: `--c:${col}` }), names[ai++], h('span', { class: 'tag' }, 'AI')));
        else seatsEl.append(h('li', { class: 'sbd-seat' }, h('span', { class: 'dot' }), 'Open seat'));
      }
    },
    // ---- garage ----
    selectTruck(i) { gi = i; renderGarage(); cb('onPreviewTruck', o.trucks[gi], gi); },
    get selectedTruck() { return gi; },
    /** Element where main can mount a 3D preview canvas (garage). */
    getPreviewSlot() { return slot; },
    setTrucks(t) { o.trucks = t; renderGarage(); },
    // ---- misc ----
    setGyroState(s /* 'idle'|'granted'|'denied' */) {
      gyroBtn.classList.toggle('ok', s === 'granted');
      gyroBtn.firstChild.textContent = s === 'granted' ? 'Wheel is yours ✓' : s === 'denied' ? 'Motion blocked – use touch steering' : 'Tap to hold the wheel';
    },
    showGyroButton(b) { gyroBtn.style.display = b ? '' : 'none'; },
    setFamilyPass(textOrNode) { passBody.replaceChildren(textOrNode.nodeType ? textOrNode : document.createTextNode(textOrNode)); },
    /** Top-left chalk rank during the race, e.g. setRank(3, 10) -> "3/10". Hidden until first call and outside races. */
    setRank(place, total) {
      if (!place) { rankEl.classList.remove('on'); return; }
      rankEl.firstChild.textContent = String(place); rankEl.lastChild.textContent = `/${total || ''}`;
      rankEl.classList.add('on');
    },
    /** Current {weather:'clear'|'fog'|'snow'|'rain'|'storm', time:'day'|'dusk'|'night'}. */
    getWeather() { return { ...wx }; },
    /** Set programmatically (e.g. from URL params / host message); does not fire onWeather unless fire=true. */
    setWeather(next, fire = false) { setWx(next || {}, fire); },
    notifyInput: noteInput,
    /** Optional: main can call on the player's first paddle stroke (UI also detects drags/keys itself). */
    notifyStroke: noteStroke,
    /** Call at GO: glyphs fade out over 3 s from now. */
    raceStarted() { raceT0 = performance.now(); clearTimeout(safetyTimer); clearTimeout(gTimer); glyphs.classList.remove('faint'); glyphOff(); armIdle(); },
    glyphOpacity() { return parseFloat(getComputedStyle(glyphs).opacity); },
    toast(text, ms = 2200) { toast.textContent = text; toast.classList.add('on'); setTimeout(() => toast.classList.remove('on'), ms); },
    /** info: {place, total, time (s), standings?: [{name, time, you}], name?} */
    /** Live-update the results list. standings: [{name, you, time?, status?:'finished'|'running'|'dnf', eta?}]. */
    updateFinish(standings) { if (standingsEl && standings) renderStandings(standingsEl, standings); },
    showFinish(info = {}) {
      const { place = 1, total = 6, time, standings } = info;
      projector = createProjector(); standingsEl = standings ? h('ul', { class: 'sbd-standings' }) : null; if (standings) renderStandings(standingsEl, standings);
      const card = h('div', { class: `sbd-ply sbd-placard p${place}` },
        h('div', { class: 'sbd-ribbon', html: `<svg viewBox="0 0 100 100"><path d="M30 50 L18 98 L38 86 L50 98 L50 60Z" fill="#c63a24"/><path d="M70 50 L82 98 L62 86 L50 98 L50 60Z" fill="#a42c19"/><circle cx="50" cy="38" r="30" fill="#f2c230" stroke="#2a170a" stroke-width="4"/><circle cx="50" cy="38" r="20" fill="none" stroke="#a87e10" stroke-width="3"/></svg>` }),
        h('div', { class: 'sbd-place' }, String(place), h('sup', {}, ordinal(place))),
        h('div', { class: 'of' }, `out of ${total}`),
        time != null ? h('div', { class: 'time' }, fmtTime(time)) : null,
        standingsEl,
        h('div', { class: 'sbd-row' }, btn('Race again', 'primary', () => cb('onRematch')), btn('Garage', 'small', () => api.show('garage')), btn('Barn', 'small chalk', () => { cb('onQuit'); api.show('title'); })));
      const flags = Array.from({ length: 14 }, (_, i) => `<path d="M${20 + i * 70} ${28 + Math.sin(i / 13 * Math.PI) * 18} l30 0 l-15 46z" fill="${['#c63a24', '#f2c230', '#f6f2e4', '#3f7d3a', '#2f7bbf'][i % 5]}" stroke="#2a170a" stroke-width="2"/>`).join('');
      const bunting = h('div', { class: 'sbd-bunting', html: `<svg viewBox="0 0 1000 110" preserveAspectRatio="none"><path d="M0 14 Q500 74 1000 14" fill="none" stroke="#2a170a" stroke-width="3"/>${flags}</svg>` });
      card.style.animationDelay = `${info.delay ?? 0.5}s`;
      placardWrap.replaceChildren(bunting, card); api.show('finish');
    },
    destroy() { el.remove(); orient.remove(); window.removeEventListener('resize', refreshOrient); },
  };
  api.setPlayers([]); renderSteps(defaultSteps.host);
  renderGarage();
  api.show('title');
  return api;
}
