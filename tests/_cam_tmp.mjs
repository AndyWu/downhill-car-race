import { chromium } from 'playwright';
const [track, ...specs] = process.argv.slice(2); // specs: s:steer
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'], executablePath: process.env.CHROME });
const page = await b.newPage({ viewport: { width: 640, height: 400 } });
await page.goto(`http://localhost:4544/?track=${track}&autostart=1&ai=0&q=low`);
await page.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 60000 });
await page.evaluate(() => window.__game.screenshotReady);
for (const sp of specs) {
  const [s, st] = sp.split(':').map(Number);
  for (const view of ['chase', 'side', 'far']) {
    const info = await page.evaluate(({ s, st, view }) => { const g = window.__game; g.setView(view); g.teleport(s, 8); g.setDebugInput({ steer: st }); let lat = 0;
      for (let k = 0; k < 200; k++) { g.advance(1/30); const v = g.vehicles.find((x) => x.isPlayer).body.state; const hw = g.world.track.sampleAt(v.s).width / 2; lat = Math.abs(v.lateral) - hw; if (lat > 0.9) break; }
      g.setDebugInput({ steer: 0 }); g.advance(0.8); const v = g.vehicles.find((x) => x.isPlayer).body.state; return { s: v.s.toFixed(0), lat: lat.toFixed(2), speed: v.speed.toFixed(1) }; }, { s, st, view });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `critique/maps/round-3/fixes/gameplay/${track}-cam-${view}-${s}.jpg`, type: 'jpeg', quality: 60, timeout: 120000 });
    console.log(track, view, s, JSON.stringify(info));
  }
}
await b.close();
