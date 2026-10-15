// Minimal fallback lobby modal so the network flow is testable without the real UI.
// Agent 4's UI can replace it by providing ui.renderLobby(state, actions).

import { createLobbyPanel } from './lobbyPanel.js';

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
.sbd-lobby .cols{display:grid;grid-template-columns:1fr 1.3fr .7fr;gap:16px;align-items:start}
@media (max-width:640px){.sbd-lobby .cols{grid-template-columns:1fr}}
.sbd-lobby .steps{list-style:none;margin:0;padding:0}.sbd-lobby .steps li{margin:6px 0;display:flex;gap:8px;color:#6b604d}
.sbd-lobby .steps li.active{color:#1d1a14;font-weight:600}.sbd-lobby .steps li.done{color:#3d6b2a}
.sbd-lobby .steps .mk{width:1em;flex:none;text-align:center}
.sbd-lobby .centre{display:flex;flex-direction:column;align-items:center;gap:6px}
.sbd-lobby .box{background:#fff;border-radius:10px;padding:6px;width:min(320px,70vw)}
.sbd-lobby .box canvas,.sbd-lobby .box video{width:100%;height:auto;display:block;image-rendering:pixelated}
.sbd-lobby .box.vid{background:#111}.sbd-lobby .box video{image-rendering:auto}
.sbd-lobby .cap{margin:0;text-align:center;color:#4a4235}
.sbd-lobby .foot{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}
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
  const panel = createLobbyPanel();

  function h(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'class') n.className = v;
      else n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false && c !== '') n.append(c instanceof Node ? c : String(c));
    return n;
  }

  const MARK = { done: '✓', active: '›', todo: '·' };
  function render(state, actions) {
    const C = state.copy;
    const title = state.phase === 'radio' || state.phase === 'idle' ? C.radio[state.role].title
      : state.role === 'host' ? 'Host a Family Race' : state.phase === 'connected' ? C.connected.title : 'Join a Family Race';
    const steps = h('ol', { class: 'steps' }, state.steps.map((s) => h('li', { class: s.state }, h('span', { class: 'mk' }, MARK[s.state] || ''), s.text)));
    const c = panel.center(state, actions);
    if (c.kind === 'video') queueMicrotask(() => c.el.play?.().catch(() => {})); // re-attaching can pause on iOS
    const centre = h('div', { class: 'centre' },
      c.el ? h('div', { class: 'box' + (c.kind === 'video' ? ' vid' : '') }, c.el) : '',
      c.caption ? h('p', { class: 'cap' }, c.caption) : '');
    panel.updateBar(state, actions);
    const players = h('ul', { class: 'peers' }, state.peers.filter((p) => p.state !== 'new').map((p) => h('li', {}, `${p.state === 'open' ? '✓' : '…'} ${p.name}`)));
    const foot = h('div', { class: 'foot' },
      h('button', { class: 'sec', onclick: () => actions.cancel() }, 'Back'),
      state.role === 'host' && state.phase === 'offering' ? h('button', { onclick: () => actions.startRace() }, C.offering.start) : '',
      state.role === 'host' && state.phase === 'offering' ? h('span', { class: 'note' }, C.offering.startHint) : '');
    const card = h('div', { class: 'card' }, h('h2', {}, title), h('div', { class: 'cols' }, steps, h('div', {}, centre, panel.bar), players), foot);
    el.replaceChildren(card);
    el.hidden = state.phase === 'ready' || state.phase === 'idle';
  }

  return { el, render, destroy() { el.remove(); } };
}
