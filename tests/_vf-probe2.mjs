import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 400, height: 225 } });
await pg.goto('http://localhost:4561/?track=village&q=low');
await pg.waitForFunction(() => window.__game, null, { timeout: 120000 });
await pg.evaluate(() => window.__game.screenshotReady);
const r = await pg.evaluate(() => { const g = window.__game; let out = []; g.scene.traverse((m) => { if (m.name === 'branch_2_2_0') { const p = m.geometry.attributes.position; let cnt = 0; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); if (Math.hypot(x - 7.5, z + 1460.4) < 4) { out.push([x.toFixed(1), p.getY(i).toFixed(2), z.toFixed(1)].join(',')); } } } }); return out.join(' | '); });
console.log(r); await b.close();
