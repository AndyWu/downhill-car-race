import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
for (const vp of [{ width: 1180, height: 820 }, { width: 1366, height: 1024 }, { width: 844, height: 390 }]) {
const p = await b.newPage({ viewport: vp });
await p.goto('http://localhost:4394/?q=low');
await p.waitForFunction(() => window.__game && __game.audio, null, { timeout: 60000 });
await p.click('button:has-text("Garage")'); await p.waitForTimeout(1200);
const r = await p.evaluate(() => { const c = document.querySelector('.sbd-card').getBoundingClientRect(); const rows = [...document.querySelectorAll('.sbd-stat')].map(e => e.getBoundingClientRect().bottom <= c.bottom + 1); const hb = document.querySelector('.sbd-tryhorn').getBoundingClientRect(); return { allRowsVisible: rows.every(Boolean), rows: rows.length, hornVisible: hb.bottom <= c.bottom && hb.height > 0 }; });
console.log(vp.width + 'x' + vp.height, JSON.stringify(r)); await p.close(); }
await b.close();
