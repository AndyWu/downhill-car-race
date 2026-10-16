import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const sv = spawn('npx', ['vite', 'preview', '--port', '4191', '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise(r => setTimeout(r, 3000));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({viewport:{width:320,height:180}})).newPage();
await p.goto('http://localhost:4191/?autostart=1&ai=0&q=low&norender=1');
await p.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 120000 });
const full = process.argv[2] === 'full';
console.log(JSON.stringify(await p.evaluate((full) => {
  const g = window.__game; const rows = [];
  for (let t = 0; t < 10; t++) {
    g.startRace({ truck: t, ai: 0, countdown: 0 });
    const run = (inp, s0 = 430) => { g.setDebugInput(inp); g.teleport(s0, 2); g.advance(0.05); const a = g.state.s; g.advance(10); return [+(g.state.s - a).toFixed(1), +g.state.speed.toFixed(1)]; };
    const c = run({steer:0}), pd = run({steer:0,paddleL:1,paddleR:1});
    // terminal coast speed over several stretches
    const tops = [];
    for (const s0 of [300, 900, 1500, 2200]) { g.setDebugInput({steer:0}); g.teleport(s0, 3); let mx = 0; for (let i=0;i<30;i++){ g.advance(1); mx = Math.max(mx, g.state.speed);} tops.push(+mx.toFixed(1)); }
    const row = { id: g.vehicles[0].spec.id, coast: c, paddle: pd, ratio: +(pd[0]/c[0]).toFixed(2), tops };
    if (full) { g.setDebugInput({steer:0}); g.teleport(10, 0); g.advance(0.1); let tt = 0; while (!g.state.finished && tt < 500) { g.advance(5); tt += 5; if (g.state.s < 0) break; } row.finishT = g.state.finished ? +g.state.finishTime.toFixed(0) : null; row.sEnd = Math.round(g.state.s); }
    rows.push(row);
  }
  return rows;
}, full)));
process.kill(-sv.pid); await b.close();
