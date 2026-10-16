// Drives Agent 4's lobby slots on the `ui` object (see docs/requests.md):
//   setLobbyRole, setLobbySteps, showQR, showScanner, clearQR, setCaption, setPlayers,
//   setStartEnabled, and (optional) setLobbyActions(el). The UI's onStartRace / onLobbyBack
//   callbacks should call lobby.startRace() / lobby.close({ keepPeers:false }) (main.js).
//
// Action buttons (confirm hotspot, scan reply, paste-the-code drawer, retry) come from
// lobbyPanel.js. If the UI has no setLobbyActions slot yet, the bar is placed directly under
// the QR caption.

import { createLobbyPanel } from './lobbyPanel.js';

export function isAgent4UI(ui) { return !!(ui && typeof ui.showQR === 'function' && typeof ui.setLobbySteps === 'function'); }

export function createUiAdapter(ui, { name = 'Player' } = {}) {
  const panel = createLobbyPanel();
  let roleSet = false, lastKind = null, placed = false;

  function placeBar() {
    if (placed && panel.bar.isConnected) return;
    if (typeof ui.setLobbyActions === 'function') { ui.setLobbyActions(panel.bar); placed = true; return; }
    // Fallback: put the bar right after the QR box's caption (same column).
    const host = ui.el?.querySelector?.('.sbd-qrcol') || document.querySelector('.sbd-qrcol');
    if (host) { host.append(panel.bar); placed = true; }
  }

  function render(state, actions) {
    if (!roleSet) { ui.setLobbyRole?.(state.role); roleSet = true; }
    ui.setLobbySteps?.(state.steps);
    if (state.phase === 'closed') { ui.clearQR?.(); panel.bar.remove(); placed = false; lastKind = null; return; }

    const c = panel.center(state, actions);
    if (c.kind === 'qr') { if (!c.el.isConnected) ui.showQR(c.el, c.caption); else ui.setCaption?.(c.caption); }
    else if (c.kind === 'video') { if (!c.el.isConnected) ui.showScanner?.(c.el, c.caption); else ui.setCaption?.(c.caption); c.el.play?.().catch(() => {}); }
    else { if (lastKind !== 'placeholder') ui.clearQR?.(); ui.setCaption?.(c.caption); }
    lastKind = c.kind;

    panel.updateBar(state, actions);
    placeBar();

    // 10 seats: humans first, then AI backfill named from the AI roster (worst → best)
    const humans = state.seatList.filter((p) => p.kind !== 'ai');
    ui.setPlayers?.(humans, { seats: state.seats, aiBackfill: true, aiNames: state.aiNames, lineup: state.seatList });
    ui.setStartEnabled?.(state.role === 'host' && (state.phase === 'offering' || state.phase === 'radio'));
  }
  return { render };
}
