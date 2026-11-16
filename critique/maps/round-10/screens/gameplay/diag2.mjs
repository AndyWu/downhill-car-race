import { chromium } from '/home/user/downhill-car-race/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:480,height:270} });
await p.goto('http://localhost:4672/?autostart=1&track=corn&q=low&ai=0&truck=4');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:180000});
const r=await p.evaluate(()=>{const g=window.__game;const S=()=>g.vehicles[0].body.state;const out={};
 while(g.state.countdown>0) g.advance(0.25);
 for(const mode of ['zero','pd','pdsoft','pdsmall']){ g.teleport(40,10); g.advance(0.1); let pl=0; const o=[]; let sgn=0;
  for(let t=0;t<20;t+=0.25){const lat=S().lateral;let d=0;
   if(mode==='pd') d=-(0.5*lat+0.8*(lat-pl)/0.25); if(mode==='pdsoft') d=-(0.15*lat+0.3*(lat-pl)/0.25); if(mode==='pdsmall') d=Math.abs(lat)>1.2? -Math.sign(lat)*0.3:0;
   d=Math.max(-1,Math.min(1,d));pl=lat;g.setDebugInput({steer:d,paddleL:1,paddleR:1});g.advance(0.25); if(t%5==4.75)o.push(S().s-40|0, +S().velocity.length().toFixed(1));}
  out[mode]=o.join(' ');}
 return out;});
console.log(JSON.stringify(r));await b.close();
