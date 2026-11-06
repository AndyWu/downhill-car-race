import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT=4564, DIST='/tmp/claude-0/-home-user-downhill-car-race/2fdcd979-bd76-58f2-8bbb-e0accdb3ad7c/scratchpad/dist';
const server = spawn('npx', ['vite','preview','--port',String(PORT),'--strictPort','--outDir',DIST], {stdio:'ignore',detached:true});
await new Promise(r=>setTimeout(r,3500));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:'+PORT+'/?autostart=1&truck=0&ai=9&q=low&track='+(process.env.TRK||'village'));
  await page.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 60000 });
  const r = await page.evaluate(([who,t0,t1]) => { const g=window.__game; g.setDebugInput({steer:0}); g.advance(t0); const out=[]; const v=g.vehicles.find(x=>x.name===who); for(let t=t0;t<t1;t+=1){ g.advance(1); const s=v.body.state; out.push([t+1,Math.round(s.s),s.lateral.toFixed(1),s.speed.toFixed(1),s.surface,s.respawns||0, v.ai.dbg&&JSON.stringify(v.ai.dbg,(k,x)=>typeof x==='number'?+x.toFixed(1):x)].join(' ')); } return out; }, [process.env.WHO||'Vance', Number(process.env.T0||60), Number(process.env.T1||84)]);
  console.log(r.join('\n'));
} finally { await browser.close(); try { process.kill(-server.pid); } catch {} }
