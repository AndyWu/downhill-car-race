// Minimal fallback lobby modal so the network flow is testable without the real UI.
// Agent 4's UI can replace it by providing ui.renderLobby(state, actions).

import { renderQR } from './qr.js';
import { fmt } from './lobbyCopy.js';

const CSS = `
.sbd-lobby{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(10,12,8,.82);font:16px/1.35 system-ui,-apple-system,sans-serif;color:#1d1a14;padding:16px;box-sizing:border-box}
.sbd-lobby *{box-sizing:border-box}
.sbd-lobby .card{background:#f6efe1;border-radius:14px;max-width:880px;width:100%;max-height:100%;overflow:auto;padding:20px 24px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.sbd-lobby h2{margin:0 0 6px;font-size:24px}
.sbd-lobby .lead{margin:0 0 12px;color:#4a4235}
.sbd-lobby ol{margin:0 0 12px 1.2em;padding:0}.sbd-lobby li{margin:4px 0}
.sbd-lobby .note{font-size:14px;color:#6b604d;margin:0 0 14px}
.sbd-lobby .row{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}
.sbd-lobby .qr{background:#fff;padding:6px;border-radius:8px;width:min(360px,80vw);height:auto;display:block}
.sbd-lobby video{width:220px;max-width:40vw;border-radius:8px;background:#000;transform:scaleX(var(--mirror,1))}
.sbd-lobby button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:12px 18px;background:#b8401d;color:#fff;margin:4px 8px 4px 0;min-height:44px}
.sbd-lobby button.sec{background:#d9cdb4;color:#1d1a14}
.sbd-lobby .err{background:#ffd9cf;color:#7a1a00;border-radius:8px;padding:8px 12px;margin:0 0 12px}
.sbd-lobby textarea{width:100%;font:12px ui-monospace,monospace;min-height:56px;border-radius:8px;border:1px solid #bba;padding:6px}
.sbd-lobby .peers{list-style:none;margin:8px 0;padding:0}.sbd-lobby .peers li{padding:2px 0}
.sbd-lobby details{margin-top:10px}
`;

export function createLobbyView(root = document.body) {
  if (!document.getElementById('sbd-lobby-css')) {
    const st = document.createElement('style'); st.id = 'sbd-lobby-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'sbd-lobby';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  root.appendChild(el);
  let lastQR = null, qrCanvas = null, manualOpen = false;

  function h(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'class') n.className = v;
      else n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
    return n;
  }

  function qr(code) {
    if (code !== lastQR) { qrCanvas = renderQR(code, { size: 480 }); qrCanvas.className = 'qr'; lastQR = code; }
    return qrCanvas;
  }

  function manual(state, actions, myCode) {
    const C = state.copy.manual;
    const d = h('details', {});
    if (manualOpen) d.open = true;
    d.addEventListener('toggle', () => { manualOpen = d.open; });
    const paste = h('textarea', { placeholder: C.pasteLabel, 'aria-label': C.pasteLabel });
    d.append(h('summary', {}, C.toggle));
    if (myCode) {
      const mine = h('textarea', { readonly: '', 'aria-label': 'My code', 'data-testid': 'my-code' });
      mine.value = myCode;
      d.append(mine, h('button', { class: 'sec', onclick: () => { mine.select(); navigator.clipboard?.writeText(myCode).catch(() => document.execCommand('copy')); } }, C.copy));
    }
    d.append(paste, h('button', { onclick: () => actions.submitCode(paste.value) }, C.submit));
    return d;
  }

  function render(state, actions) {
    const C = state.copy;
    const card = h('div', { class: 'card' });
    const err = state.error ? h('p', { class: 'err', role: 'alert' }, state.error) : '';
    const vid = () => {
      const v = actions.video;
      if (!v || !state.cameraOn) return '';
      queueMicrotask(() => v.play?.().catch(() => {})); // re-attaching can pause on iOS
      return h('div', {}, v, h('br'), h('button', { class: 'sec', onclick: () => actions.flipCamera() }, 'Flip camera'));
    };
    const peerList = () => h('ul', { class: 'peers' }, state.peers.map((p) => h('li', {}, `${p.state === 'open' ? '✓' : '…'} ${p.name} (${p.state})`)));

    if (state.phase === 'radio') {
      const R = C.radio[state.role];
      card.append(h('h2', {}, R.title), h('p', { class: 'lead' }, R.lead), h('ol', {}, R.steps.map((s) => h('li', {}, s))), h('p', { class: 'note' }, R.note),
        h('button', { onclick: () => actions.begin() }, R.action), h('button', { class: 'sec', onclick: () => actions.cancel() }, 'Back'));
    } else if (state.phase === 'offering') {
      const O = C.offering;
      card.append(h('h2', {}, state.slot ? fmt(O.title, { slot: state.slot + 1 }) : 'All seats filled'), err, h('p', { class: 'lead' }, O.lead));
      card.append(h('div', { class: 'row' },
        state.offerCode ? qr(state.offerCode) : h('p', {}, state.busy ? 'Preparing code…' : ''),
        h('div', {}, vid(), h('p', {}, state.slot ? fmt(O.waiting, { slot: state.slot + 1 }) : ''), peerList())));
      card.append(h('button', { onclick: () => actions.startRace() }, O.start), h('span', { class: 'note' }, ' ' + O.startHint));
      card.append(manual(state, actions, state.offerCode));
    } else if (state.phase === 'scanOffer' || state.phase === 'answering') {
      const S = C[state.phase];
      card.append(h('h2', {}, S.title), err, h('p', { class: 'lead' }, S.lead), vid(), manual(state, actions, null));
    } else if (state.phase === 'showAnswer') {
      const S = C.showAnswer;
      card.append(h('h2', {}, S.title), err, h('p', { class: 'lead' }, S.lead), qr(state.answerCode), manual(state, actions, state.answerCode));
    } else if (state.phase === 'connected') {
      card.append(h('h2', {}, C.connected.title), h('p', { class: 'lead' }, C.connected.lead));
    } else if (state.phase === 'ready') {
      card.append(h('h2', {}, 'Racing!'), peerList());
    } else {
      card.append(h('p', {}, '…'));
    }
    el.replaceChildren(card);
    el.hidden = state.phase === 'ready' || state.phase === 'idle';
  }

  return { el, render, destroy() { el.remove(); } };
}
