// Player-facing lobby copy + phase definitions. UI agent renders these; lobbyView.js is the
// minimal fallback renderer. Keep sentences short: these are read by kids holding iPads.

export const LOBBY_PHASES = {
  host: ['radio', 'offering', 'ready'],
  client: ['radio', 'scanOffer', 'answering', 'showAnswer', 'connected'],
};

export const LOBBY_COPY = {
  radio: {
    host: {
      title: 'Turn on the race radio',
      lead: 'This iPad will be the Race Host. The other iPads talk to it directly — no internet needed.',
      steps: [
        'Open Settings ▸ Personal Hotspot on THIS iPad.',
        'Switch on “Allow Others to Join”. Note the Wi-Fi password shown there.',
        'Come back to Soap Box Derby and keep this screen on.',
        'Tap “Host Family Race” below.',
      ],
      note: 'No Personal Hotspot option? (Wi-Fi-only iPads don’t have one.) Then put every iPad on the same home Wi-Fi, or use a phone’s hotspot — it works the same way.',
      action: 'Host Family Race',
    },
    client: {
      title: 'Join the race radio',
      lead: 'Connect to the Host iPad’s hotspot, then scan its code.',
      steps: [
        'Open Settings ▸ Wi-Fi on THIS iPad.',
        'Pick the Host iPad’s name (under “Personal Hotspots”) and type its password.',
        'Come back to Soap Box Derby.',
        'Tap “Scan Host Code” and point the camera at the Host iPad’s screen.',
      ],
      note: 'Already on the same Wi-Fi as the Host? Skip straight to scanning.',
      action: 'Scan Host Code',
    },
  },
  offering: {
    title: 'Player {slot}: scan this code',
    lead: 'Hold the joining iPad’s camera up to this code. Then show its answer code to THIS iPad’s camera.',
    waiting: 'Looking for Player {slot}’s answer code…',
    connecting: 'Player {slot} found — connecting…',
    start: 'Start Race',
    startHint: 'Empty seats will be raced by the AI drivers.',
  },
  scanOffer: {
    title: 'Scan the Host’s code',
    lead: 'Point this camera at the big code on the Host iPad.',
  },
  answering: { title: 'Building your answer…', lead: 'Hang on a second.' },
  showAnswer: {
    title: 'Show this to the Host',
    lead: 'Turn this iPad so the Host iPad’s camera can see this code.',
  },
  connected: { title: 'You’re in!', lead: 'Waiting for the Host to start the race.' },
  manual: {
    toggle: 'Camera not working? Use text code',
    pasteLabel: 'Paste the other iPad’s code here',
    copy: 'Copy my code',
    submit: 'Use this code',
  },
  errors: {
    camera: 'The camera could not start. Allow camera access in Settings ▸ Safari, or use the text code.',
    wrongKind: 'That’s the wrong code — scan the other iPad’s code.',
    oldSession: 'That code is from an earlier race. Ask the Host for a fresh one.',
    connectFailed: 'Couldn’t reach that iPad. Check both are on the same hotspot/Wi-Fi and try again.',
    full: 'The race is full (6 players).',
  },
};

/** Tiny template helper: fmt('Player {slot}', {slot: 2}) */
export function fmt(s, vars = {}) { return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')); }
