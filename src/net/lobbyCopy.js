// Player-facing lobby copy + step computation. The UI agent renders these; lobbyView.js is the
// minimal fallback renderer. Keep sentences short: kids holding iPads will read them.

export const LOBBY_PHASES = {
  host: ['radio', 'offering', 'ready'],
  client: ['radio', 'scanOffer', 'answering', 'showAnswer', 'connected'],
};

export const LOBBY_COPY = {
  radio: {
    host: {
      title: 'Turn on the race radio',
      lead: 'This iPad will be the Race Host. The other iPads talk to it directly, so no internet is needed.',
      steps: [
        'Open Settings ▸ Personal Hotspot on THIS iPad.',
        'Switch on “Allow Others to Join”. Note the Wi-Fi password shown there.',
        'Come back to Soap Box Derby.',
      ],
      note: 'No Personal Hotspot option? Wi-Fi-only iPads don’t have one. Put every iPad on the same home Wi-Fi instead, or use a phone’s hotspot. It works the same way.',
      confirm: 'My hotspot is on',
      done: 'Hotspot is on',
    },
    client: {
      title: 'Join the race radio',
      lead: 'Connect to the Host iPad’s hotspot, then scan its code.',
      steps: [
        'Open Settings ▸ Wi-Fi on THIS iPad.',
        'Pick the Host iPad’s name (under “Personal Hotspots”) and type its password.',
        'Come back to Soap Box Derby.',
      ],
      note: 'Already on the same Wi-Fi as the Host? Tap the button below.',
      confirm: 'I’m on the Host’s Wi-Fi',
      done: 'On the Host’s Wi-Fi',
    },
  },
  offering: {
    step: 'Player {slot}: scan the code on this iPad',
    scanStep: 'Scan Player {slot}’s reply code',
    joinedStep: '{n} joined. Tap Start Race when everyone’s in',
    noneJoinedStep: 'Tap Start Race when everyone’s in',
    caption: 'Player {slot}: point your camera at this code',
    scanReply: 'Scan Player {slot}’s reply',
    scanCaption: 'Hold Player {slot}’s reply code up to this camera',
    showCode: 'Show my code again',
    full: 'All seats are filled. Tap Start Race!',
    preparing: 'Making a code…',
    start: 'Start Race',
    startHint: 'AI drivers race in any empty seats.',
  },
  scanOffer: {
    step: 'Scan the Host’s code',
    button: 'Scan the Host’s code',
    caption: 'Point this camera at the big code on the Host iPad',
    stop: 'Stop camera',
  },
  answering: { title: 'Making your reply…', caption: 'Hang on a second.' },
  showAnswer: {
    step: 'Show your reply code to the Host',
    caption: 'Turn this iPad so the Host iPad’s camera can see this code',
    slow: 'Taking a while? Make sure you’re on the Host’s Wi-Fi, then try again.',
    retry: 'Try again',
  },
  connected: { step: 'Wait for the Host to start', title: 'You’re in!', caption: 'Waiting for the Host to start the race.' },
  manual: {
    toggle: 'Can’t use the camera? Tap to paste the code',
    pasteLabel: 'Paste the other iPad’s code here',
    copy: 'Copy my code',
    copied: 'Copied!',
    submit: 'Use this code',
    hide: 'Hide',
  },
  notices: {
    camera: 'The camera isn’t available here, and that’s OK. Tap “paste the code” below instead.',
    wrongKind: 'That’s the other kind of code. Scan the other iPad’s code.',
    oldSession: 'That code is from an earlier race. Ask the Host for a fresh one.',
    connectFailed: 'Couldn’t reach that iPad. Check you’re both on the same hotspot or Wi-Fi, then try again.',
    full: 'The race is full (6 players).',
    badCode: 'That code didn’t read properly. Try again.',
  },
};
// Back-compat alias (round 1 name).
LOBBY_COPY.errors = LOBBY_COPY.notices;

/** Tiny template helper: fmt('Player {slot}', {slot: 2}) */
export function fmt(s, vars = {}) { return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')); }

/**
 * Checklist for the current state. Steps are ticked ('done') ONLY on real progress or an explicit
 * user confirmation. They are never pre-ticked.
 * @returns {{text:string, state:'todo'|'active'|'done'}[]}
 */
export function computeSteps(st) {
  const C = LOBBY_COPY;
  const R = C.radio[st.role];
  const steps = [];
  if (!st.radioConfirmed) {
    R.steps.forEach((text, i) => steps.push({ text, state: i === 0 ? 'active' : 'todo' }));
  } else steps.push({ text: R.done, state: 'done' });
  const after = st.radioConfirmed;
  if (st.role === 'host') {
    const joined = st.peers.filter((p) => p.state === 'open').length;
    const n = (st.slot ?? 0) + 1;
    if (st.slot) {
      steps.push({ text: fmt(C.offering.step, { slot: n }), state: !after ? 'todo' : st.scanning ? 'done' : 'active' });
      steps.push({ text: fmt(C.offering.scanStep, { slot: n }), state: after && st.scanning ? 'active' : 'todo' });
    }
    steps.push({ text: joined ? fmt(C.offering.joinedStep, { n: joined }) : C.offering.noneJoinedStep, state: after && (joined || !st.slot) ? 'active' : 'todo' });
  } else {
    const ph = st.phase;
    const scanned = ph === 'answering' || ph === 'showAnswer' || ph === 'connected';
    steps.push({ text: C.scanOffer.step, state: scanned ? 'done' : after ? 'active' : 'todo' });
    steps.push({ text: C.showAnswer.step, state: ph === 'connected' ? 'done' : scanned ? 'active' : 'todo' });
    steps.push({ text: C.connected.step, state: ph === 'connected' ? 'active' : 'todo' });
  }
  return steps;
}
