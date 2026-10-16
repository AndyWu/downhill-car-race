// 90 s headless in-game AI check through the built app (window.__game.advance). Run: node tests/ai-game.mjs [truck=0]
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
const PORT = 4391, DIST = '/tmp/ai-game-dist';
const trucks = (process.argv[2] || '0').split(',').map(Number); // player truck(s); AI i gets truck (T+1+i)%10 in main.js
import fs from 'node:fs';
// If main.js doesn't yet use profile.truckId, build a temporary patched copy (never touches src/main.js).
let root = process.cwd();
const mainSrc = fs.readFileSync('src/main.js', 'utf8');
const needTrucks = !mainSrc.includes('truckId'), need9 = /Math\.min\(5, parseInt\(params\.get\('ai'\)/.test(mainSrc);
if (needTrucks || need9) {
  root = '/tmp/ai-game-src';
  execSync(`rm -rf ${root} && mkdir -p ${root} && cp -r src public index.html package.json vite.config.* vite.sw-manifest.js ${root}/ 2>/dev/null; ln -s ${process.cwd()}/node_modules ${root}/node_modules`, { shell: '/bin/bash' });
  let m = fs.readFileSync(root + '/src/main.js', 'utf8');
  if (needTrucks) m = m.replace('makeVehicle(truckIdx + 1 + i,', "makeVehicle(Math.max(0, TRUCKS.findIndex((t) => t.id === AI_PROFILES[i % AI_PROFILES.length].truckId)),");
  if (need9) m = m.replace(/Math\.min\(5, parseInt\(params\.get\('ai'\)/, "Math.min(9, parseInt(params.get('ai')").replace(/: 5,\n(\s*)(\/\/|\w)/, ': 9,\n$1$2');
  fs.writeFileSync(root + '/src/main.js', m);
  console.log('(patched temp copy of main.js:' + (needTrucks ? ' truckId' : '') + (need9 ? ' ai<=9' : '') + ')');
}
execSync(`npx vite build --outDir ${DIST} --emptyOutDir`, { stdio: 'ignore', cwd: root });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', DIST], { stdio: 'ignore', detached: true, cwd: root });
await new Promise((r) => setTimeout(r, 3500));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const truck of trucks) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/?autostart=1&truck=${truck}&ai=9&q=low`);
    await page.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 60000 });
    const out = await page.evaluate((full) => {
      const g = window.__game; const names = g.vehicles.map((v, i) => (i ? v.name || ('AI' + i) : 'You'));
      g.setDebugInput({ steer: 0 });
      g.advance(4);
      const rows = [];
      for (let t = 30; t <= (full ? 300 : 90); t += 30) { g.advance(t === 30 ? 26 : 30); rows.push(g.vehicles.map((v, i) => [names[i], Math.round(v.body.state.s), +v.body.state.speed.toFixed(1)])); }
      return rows;
    }, !!process.env.FULL);
    const ai = out[out.length - 1].slice(1);                 // vehicle order == AI roster order (worst -> best)
    const rankOf = (arr) => { const o = arr.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = []; o.forEach((e, k) => { r[e[1]] = k; }); return r; };
    const rs = rankOf(ai.map((r) => r[1])), rk = rankOf(ai.map((_, i) => i));
    let d = 0; for (let i = 0; i < ai.length; i++) d += (rs[i] - rk[i]) ** 2;
    const rho = 1 - (6 * d) / (ai.length * (ai.length ** 2 - 1));
    const last = [...ai].sort((a, b) => b[1] - a[1]);
    console.log(`player truck ${truck}: rho(skill,s@${process.env.FULL ? 300 : 90}) ${rho.toFixed(2)}  ` + last.map((r) => `${r[0]} ${r[1]}`).join(' > '));
    await page.close();
  }
} finally { await browser.close(); try { process.kill(-server.pid); } catch {} }
