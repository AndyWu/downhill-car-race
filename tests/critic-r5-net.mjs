// Critic R5: real-game snapshot bytes on the wire. node tests/critic-r3-net.mjs
// Two-page multiplayer race test using the text-code fallback (offer/answer codes carried via page.evaluate).
//   node tests/net-race.mjs   (builds + previews on its own unless BASE_URL is given)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 4176;
const base = process.env.BASE_URL || `http://localhost:${PORT}`;
let server = null;
if (!process.env.BASE_URL) {
  await new Promise((r) => spawn('npx', ['vite', 'build', '--outDir', (process.env.CRITIC_DIST || 'dist'), '--emptyOutDir'], { stdio: 'ignore' }).on('exit', r));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', (process.env.CRITIC_DIST || 'dist')], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
}
let fail = 0;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const errors = [];
const mk = async (qs, tag) => {
  const p = await (await browser.newContext({ viewport: { width: 320, height: 180 } })).newPage();
  p.on('console', (m) => { if (process.env.VERBOSE) console.log(tag, m.type(), m.text()); if (m.type() === 'error') errors.push(tag + ': ' + m.text()); });
  p.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
  await p.goto(base + '/' + qs);
  await p.waitForFunction(() => window.__game && window.__game.lobby, null, { timeout: 90000 });
  return p;
};
const host = await mk('?menu=host&q=low&norender=1', 'host');
const client = await mk('?menu=join&q=low&norender=1', 'client');
const offer = await host.waitForFunction(() => window.__game.lobby.state.offerCode, null, { timeout: 30000 }).then((h) => h.jsonValue());
check(!!offer, 'host produced an offer code (' + offer.length + ' chars)');
client.evaluate((c) => { window.__game.lobby.submitCode(c); }, offer); // resolves only once connected, so don't await
const answer = await client.waitForFunction(() => window.__game.lobby.state.answerCode, null, { timeout: 30000 }).then((h) => h.jsonValue());
check(!!answer, 'client produced an answer code');
host.evaluate((c) => { window.__game.lobby.submitCode(c); }, answer);
await client.waitForFunction(() => window.__game.lobby.state.phase === 'connected', null, { timeout: 30000 }).catch(async () => {
  console.log('host state', JSON.stringify(await host.evaluate(() => ({ ...window.__game.lobby.state, copy: undefined }))));
  console.log('client state', JSON.stringify(await client.evaluate(() => ({ ...window.__game.lobby.state, copy: undefined }))));
  console.log(errors); process.exit(1);
});
check(true, 'client connected');
await host.waitForFunction(() => window.__game.lobby.peers.size === 1, null, { timeout: 30000 });
await host.evaluate(() => window.__game.lobby.startRace());
await host.waitForFunction(() => window.__game.state.mode === 'race', null, { timeout: 30000 });
await client.waitForFunction(() => window.__game.state.mode === 'race', null, { timeout: 30000 });
check(true, 'both pages in race mode');
await client.evaluate(() => window.__game.setDebugInput({ paddleL: 1, paddleR: 1 }));
await host.evaluate(() => window.__game.setDebugInput({ paddleL: 1, paddleR: 1 }));
await host.waitForTimeout(3000);
const st = () => host.evaluate(() => { const s = window.__game.sync || (window.__game.lobby && window.__game.lobby.sync); return s ? { ...s.stats, enc: s.encoderStats ? { ...s.encoderStats } : null, t: performance.now() } : null; });
const cst = () => client.evaluate(() => { const s = window.__game.sync || (window.__game.lobby && window.__game.lobby.sync); return s ? { ...s.stats, t: performance.now() } : null; });
const a = await st(), ca = await cst();
await host.waitForTimeout(10000);
const b = await st(), cb = await cst();
const dt = (b.t - a.t) / 1000;
const snaps = b.snapshotsTx - a.snapshotsTx, bytes = b.sentBytes - a.sentBytes, inputs = b.inputsRx - a.inputsRx;
console.log('REALGAME', JSON.stringify({ seconds: +dt.toFixed(2), hostSentBytes: bytes, hostBps: Math.round(bytes / dt), snapshotsTx: snaps, snapHz: +(snaps / dt).toFixed(1), avgBytesPerSnapshot: snaps ? +((bytes - 0) / snaps).toFixed(1) : null, bytesPerCar6: snaps ? +(bytes / snaps / 6).toFixed(1) : null, clientRxSnaps: cb.snapshotsRx - ca.snapshotsRx, clientSentBytes: cb.sentBytes - ca.sentBytes, enc: b.enc }));
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close(); if (server) try { process.kill(-server.pid); } catch {}
