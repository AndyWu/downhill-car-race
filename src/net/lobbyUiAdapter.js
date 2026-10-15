// Drives Agent 4's lobby slots on the `ui` object (see docs/requests.md):
//   setLobbyRole, setLobbySteps, showQR, showScanner, clearQR, setCaption, setLobbyStatus,
//   setPlayers, setStartEnabled. The UI's onStartRace / onLobbyBack callbacks should call
//   lobby.startRace() / lobby.close({ keepPeers:false }) (wired by main.js).

import { renderQR } from './qr.js';
import { fmt } from './lobbyCopy.js';

export function isAgent4UI(ui) { return !!(ui && typeof ui.showQR === 'function' && typeof ui.setLobbySteps === 'function'); }

export function createUiAdapter(ui, { name = 'Player' } = {}) {
  let lastQR = null, qrCanvas = null, roleSet = false, lastScanner = null;
  const qr = (code) => { if (code !== lastQR) { qrCanvas = renderQR(code, { size: 520 }); lastQR = code; } return qrCanvas; };

  function render(state, actions) {
    const C = state.copy;
    if (!roleSet) { ui.setLobbyRole?.(state.role); roleSet = true; }
    const radio = C.radio[state.role];
    const past = state.phase !== 'radio' && state.phase !== 'idle';
    const steps = radio.steps.map((text) => ({ text, state: past ? 'done' : 'todo' }));
    const video = state.cameraOn ? actions.video : null;
    const showScanner = (caption) => { if (video && lastScanner !== video) { ui.showScanner?.(video, caption); lastScanner = video; } else ui.setCaption?.(caption); };

    if (state.role === 'host') {
      if (state.phase === 'offering') {
        if (state.slot) {
          steps.push({ text: fmt(C.offering.title, { slot: state.slot + 1 }), state: 'active' });
          if (state.offerCode) ui.showQR?.(qr(state.offerCode), fmt(C.offering.lead, { slot: state.slot + 1 }));
          showScanner(fmt(C.offering.waiting, { slot: state.slot + 1 }));
        } else { ui.clearQR?.(); }
        ui.setStartEnabled?.(true);
      }
      const players = [{ name, you: true, ready: true, kind: 'host' },
        ...state.peers.filter((p) => p.state === 'open' || p.state === 'connecting').map((p) => ({ name: p.name, you: false, ready: p.state === 'open', kind: 'human' }))];
      ui.setPlayers?.(players);
    } else {
      if (state.phase === 'scanOffer') { steps.push({ text: C.scanOffer.title, state: 'active' }); ui.clearQR?.(); showScanner(C.scanOffer.lead); }
      else if (state.phase === 'answering') { ui.setCaption?.(C.answering.title); }
      else if (state.phase === 'showAnswer') { steps.push({ text: C.showAnswer.title, state: 'active' }); lastScanner = null; ui.showQR?.(qr(state.answerCode), C.showAnswer.lead); }
      else if (state.phase === 'connected') { steps.push({ text: C.connected.title, state: 'done' }); ui.clearQR?.(); ui.setLobbyStatus?.(C.connected.lead); }
      ui.setStartEnabled?.(false);
      ui.setPlayers?.([{ name: 'Host', you: false, ready: state.phase === 'connected', kind: 'host' }, { name, you: true, ready: state.phase === 'connected', kind: 'human' }]);
    }
    ui.setLobbySteps?.(steps);
    if (state.error) ui.setLobbyStatus?.(state.error);
    else if (state.busy) ui.setLobbyStatus?.('Preparing code…');
    if (state.phase === 'closed' || state.phase === 'ready') ui.clearQR?.();
  }
  return { render };
}
