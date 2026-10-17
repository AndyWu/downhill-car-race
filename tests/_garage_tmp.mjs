import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:4393/?q=low');
await p.waitForFunction(() => window.__game && __game.audio, null, { timeout: 60000 });
await p.evaluate(() => { const a = __game.audio; window.__h = []; const o = a.honk.bind(a); a.honk = (...x) => { window.__h.push(x[0] + ':' + a.context.state); return o(...x); }; });
await p.click('button:has-text("Garage")'); await p.waitForTimeout(1500);
for (let i = 0; i < 3; i++) {
  console.log('label:', await p.textContent('.sbd-tryhorn'));
  await p.click('.sbd-tryhorn'); await p.waitForTimeout(1200);
  await p.click('.sbd-arrow >> nth=1'); await p.waitForTimeout(800);
}
console.log('honks:', JSON.stringify(await p.evaluate(() => window.__h)));
await p.click('.sbd-arrow >> nth=0'); await p.waitForTimeout(500);
await p.screenshot({ path: process.argv[2] + '/garage-honk.png' });
console.log('errors', errs.slice(0, 5)); await b.close();
