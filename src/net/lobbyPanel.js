// Shared lobby widgets used by both the Agent-4 UI adapter and the fallback modal:
//   center(state, actions) → { kind:'qr'|'video'|'placeholder', el?, caption }
//   bar: action buttons + the "Can't use the camera? Tap to paste the code" drawer + soft notices.

import { renderQR } from './qr.js';
import { fmt } from './lobbyCopy.js';

const CSS = `
.sbd-net-actions{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;max-width:440px;font:inherit;text-align:center}
.sbd-net-actions .row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.sbd-net-actions button{font:inherit;font-weight:700;font-size:15px;border:0;border-radius:10px;padding:10px 16px;min-height:44px;background:#b8401d;color:#fff;cursor:pointer}
.sbd-net-actions button.sec{background:rgba(0,0,0,.12);color:inherit}
.sbd-net-actions button.link{background:none;color:inherit;text-decoration:underline;font-weight:500;padding:6px 8px;min-height:36px;opacity:.85}
.sbd-net-actions .note{margin:0;font-size:14px;opacity:.85;line-height:1.3}
.sbd-net-actions textarea{width:100%;min-height:52px;font:12px ui-monospace,monospace;border-radius:8px;border:1px solid rgba(0,0,0,.3);padding:6px;box-sizing:border-box;background:#fffdf7;color:#222}
.sbd-net-actions .paste{display:flex;flex-direction:column;gap:6px;width:100%}
`;

export function createLobbyPanel() {
  if (typeof document !== 'undefined' && !document.getElementById('sbd-net-actions-css')) {
    const st = document.createElement('style'); st.id = 'sbd-net-actions-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const bar = document.createElement('div');
  bar.className = 'sbd-net-actions';
  let lastCode = null, qrCanvas = null, pasteOpen = false, pasteVal = '', copied = false;

  const qr = (code) => {
    if (code !== lastCode) { qrCanvas = renderQR(code, { size: 520 }); qrCanvas.className = 'qr'; lastCode = code; }
    return qrCanvas;
  };

  function center(st, actions) {
    const C = st.copy;
    const n = (st.slot ?? 0) + 1;
    if (st.phase === 'radio' || st.phase === 'idle') return { kind: 'placeholder', caption: C.radio[st.role].lead };
    if (st.role === 'host') {
      if (st.phase !== 'offering') return { kind: 'placeholder', caption: '' };
      if (!st.slot) return { kind: 'placeholder', caption: C.offering.full };
      if (st.scanning) {
        if (st.cameraOn && actions.video) return { kind: 'video', el: actions.video, caption: fmt(C.offering.scanCaption, { slot: n }) };
        return { kind: 'placeholder', caption: fmt(C.offering.scanCaption, { slot: n }) };
      }
      if (!st.offerCode) return { kind: 'placeholder', caption: C.offering.preparing };
      return { kind: 'qr', el: qr(st.offerCode), caption: fmt(C.offering.caption, { slot: n }) };
    }
    switch (st.phase) {
      case 'scanOffer':
        if (st.scanning && st.cameraOn && actions.video) return { kind: 'video', el: actions.video, caption: C.scanOffer.caption };
        return { kind: 'placeholder', caption: C.scanOffer.caption };
      case 'answering': return { kind: 'placeholder', caption: C.answering.caption };
      case 'showAnswer': return { kind: 'qr', el: qr(st.answerCode), caption: C.showAnswer.caption };
      case 'connected': return { kind: 'placeholder', caption: C.connected.caption };
      default: return { kind: 'placeholder', caption: '' };
    }
  }

  function btn(label, onClick, cls = '') {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
  }
  function p(text) { const e = document.createElement('p'); e.className = 'note'; e.textContent = text; return e; }

  function updateBar(st, actions) {
    const C = st.copy;
    const n = (st.slot ?? 0) + 1;
    const row = document.createElement('div'); row.className = 'row';
    const kids = [];
    let myCode = null, allowPaste = true;
    if (st.phase === 'radio' || st.phase === 'idle') {
      row.append(btn(C.radio[st.role].confirm, () => actions.confirmRadio()));
      kids.push(p(C.radio[st.role].note));
    } else if (st.role === 'host' && st.phase === 'offering') {
      if (st.slot && !st.scanning) {
        row.append(btn(fmt(C.offering.scanReply, { slot: n }), () => actions.scanAnswer()));
        if (st.offerCode) row.append(btn(C.offering.newCode, () => actions.refreshOffer(), 'sec'));
        myCode = st.offerCode;
      }
      if (st.scanning) {
        row.append(btn(C.offering.showCode, () => actions.stopScan(), 'sec'));
        if (st.cameraOn) row.append(btn('Flip camera', () => actions.flipCamera(), 'sec'));
      }
      if (!st.slot) allowPaste = false;
    } else if (st.role === 'client') {
      if (st.phase === 'scanOffer') {
        if (!st.scanning) row.append(btn(C.scanOffer.button, () => actions.scanOffer()));
        else { row.append(btn(C.scanOffer.stop, () => actions.stopScan(), 'sec')); if (st.cameraOn) row.append(btn('Flip camera', () => actions.flipCamera(), 'sec')); }
      } else if (st.phase === 'showAnswer') {
        myCode = st.answerCode;
        allowPaste = false;
        if (st.slow) { kids.push(p(C.showAnswer.slow)); row.append(btn(C.showAnswer.retry, () => actions.retry())); }
      } else allowPaste = false;
    } else allowPaste = false;
    if (st.notice) kids.unshift(p(st.notice));

    const nodes = [];
    if (row.childNodes.length) nodes.push(row);
    nodes.push(...kids);
    if (allowPaste || myCode) {
      if (!pasteOpen) nodes.push(btn(C.manual.toggle, () => { pasteOpen = true; updateBar(st, actions); }, 'link'));
      else {
        const box = document.createElement('div'); box.className = 'paste';
        if (myCode) {
          const mine = document.createElement('textarea'); mine.readOnly = true; mine.value = myCode; mine.setAttribute('aria-label', 'My code'); mine.dataset.testid = 'my-code';
          box.append(mine, btn(copied ? C.manual.copied : C.manual.copy, () => {
            mine.select();
            Promise.resolve(navigator.clipboard?.writeText(myCode)).catch(() => document.execCommand?.('copy'));
            copied = true; updateBar(st, actions); setTimeout(() => { copied = false; }, 1500);
          }, 'sec'));
        }
        if (allowPaste) {
          const ta = document.createElement('textarea'); ta.placeholder = C.manual.pasteLabel; ta.setAttribute('aria-label', C.manual.pasteLabel); ta.value = pasteVal;
          ta.addEventListener('input', () => { pasteVal = ta.value; });
          box.append(ta, btn(C.manual.submit, () => { const v = pasteVal; pasteVal = ''; actions.submitCode(v); }));
        }
        box.append(btn(C.manual.hide, () => { pasteOpen = false; updateBar(st, actions); }, 'link'));
        nodes.push(box);
      }
    }
    bar.replaceChildren(...nodes);
    bar.hidden = !nodes.length;
  }

  return { bar, center, updateBar };
}
