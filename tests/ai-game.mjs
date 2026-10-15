// 90 s headless in-game AI check through the built app (window.__game.advance). Run: node tests/ai-game.mjs [truck=0]
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
const PORT = 4391, DIST = '/tmp/ai-game-dist';
const trucks = (process.argv[2] || '0').split(',').map(Number); // player truck(s); AI i gets truck (T+1+i)%10 in main.js
import fs from 'node:fs';
// If main.js doesn't yet use profile.truckId, build a temporary patched copy (never touches src/main.js).
let root = process.cwd();
if (!fs.readFileSync('src/main.js', 'utf8').includes('truckId')) {
  root = '/tmp/ai-game-src';
  execSync(`rm -rf ${root} && mkdir -p ${root} && cp -r src public index.html package.json vite.config.* ${root}/ 2>/dev/null; ln -s ${process.cwd()}/node_modules ${root}/node_modules`, { shell: '/bin/bash' });
  const m = fs.readFileSync(root + '/src/main.js', 'utf8').replace('makeVehicle(truckIdx + 1 + i,', "makeVehicle(Math.max(0, TRUCKS.findIndex((t) => t.id === AI_PROFILES[i % AI_PROFILES.length].truckId)),");
  fs.writeFileSync(root + '/src/main.js', m);
  console.log('(patched temp copy: AI trucks from profile.truckId)');
}
execSync(`npx vite build --outDir ${DIST} --emptyOutDir`, { stdio: 'ignore', cwd: root });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', DIST], { stdio: 'ignore', detached: true, cwd: root });
await new Promise((r) => setTimeout(r, 3500));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const truck of trucks) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/?autostart=1&truck=${truck}&ai=5&q=low`);
    await page.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 60000 });
    const out = await page.evaluate(() => {
      const g = window.__game; const names = ['You', 'Barnaby', 'Clementine', 'Buster', 'Maeve', 'Ace'];
      g.setDebugInput({ steer: 0 });
      g.advance(4);
      const rows = [];
      for (let t = 30; t <= 90; t += 30) { g.advance(t === 30 ? 26 : 30); rows.push(g.vehicles.map((v, i) => [names[i], Math.round(v.body.state.s), +v.body.state.speed.toFixed(1)])); }
      return rows;
    });
    const last = out[out.length - 1].slice(1).sort((a, b) => b[1] - a[1]);
    console.log(`player truck ${truck}: s@90 ` + last.map((r) => `${r[0]} ${r[1]}`).join(' > '));
    await page.close();
  }
} finally { await browser.close(); try { process.kill(-server.pid); } catch {} }
