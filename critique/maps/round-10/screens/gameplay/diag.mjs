import { chromium } from '/home/user/downhill-car-race/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:480,height:270} });
await p.goto('http://localhost:4672/?autostart=1&track=corn&q=low&ai=0&truck=4');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:180000});
const r=await p.evaluate(()=>{const g=window.__game;const V=g.vehicles;const S=()=>V[0].body.state;let pl=0;const o=[];
 while(g.state.countdown>0) g.advance(0.25);
 for(let t=0;t<40;t+=0.25){const lat=S().lateral;let d=-(0.5*lat+0.8*(lat-pl)/0.25);d=Math.max(-1,Math.min(1,d));pl=lat;
  g.setDebugInput({steer:d,paddleL:1,paddleR:1});g.advance(0.25);
  if(t%5==4.75)o.push([t+0.25|0,S().s|0,+S().lateral.toFixed(1),+S().velocity.length().toFixed(1),S().respawns||0,V.slice(1).filter(v=>Math.abs(v.body.state.s-S().s)<6).length].join('/'));}
 return o.join(' ');});
console.log(r);await b.close();
