import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 400, height: 225 } });
await pg.goto('http://localhost:4561/?track=village&q=low');
await pg.waitForFunction(() => window.__game, null, { timeout: 120000 });
await pg.evaluate(() => window.__game.screenshotReady);
const r = await pg.evaluate((a) => { const g = window.__game, T = g.world.track; const p = T.sampleAt(a[0], a[1]); const out = []; for (let d = -14; d <= 14; d += 1) { const x = p.position.x + p.right.x * d, z = p.position.z + p.right.z * d; out.push([d, +(g.world.heightAt(x, z) - p.position.y).toFixed(2)]); } return JSON.stringify(out); }, [+process.argv[2], JSON.parse(process.argv[3] || "{}")]);
console.log(r); await b.close();
