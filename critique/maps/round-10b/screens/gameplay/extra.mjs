import { chromium } from '/home/user/downhill-car-race/node_modules/playwright/index.mjs';
import fs from 'fs';
const D='/home/user/downhill-car-race/critique/maps/round-10b/screens/gameplay/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:480,height:270} });
await p.goto('http://localhost:4692/?autostart=1&track=corn&q=low&ai=0&truck=4');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:180000});
const r = await p.evaluate(()=>{
 const g=window.__game; const S=()=>g.vehicles[0].body.state; const out={held:[],nudge:[]};
 let guard=0; while(g.state.countdown>0&&guard++<400) g.advance(0.25);
 for(const s0 of [300,700,1500,2600]) for(const side of [-1,1]){
  g.teleport(s0,12); g.advance(0.1); const tr=[]; const r0=S().respawns||0; let peak=0;
  for(let t=0;t<12;t+=0.5){ g.setDebugInput({steer:side,paddleL:1,paddleR:1}); g.advance(0.5); const st=S(); peak=Math.max(peak,Math.abs(st.lateral)); tr.push([t+0.5,+st.lateral.toFixed(2),+st.velocity.length().toFixed(1)]); }
  out.held.push({s0,side,peak:+peak.toFixed(2),tr,resc:(S().respawns||0)-r0});
 }
 // hands-off at offset, no paddling vs paddling: does the cart steer itself back to centre?
 for(const s0 of [300,900,1500]) for(const lat0 of [0.6,1.2,1.8]) for(const pad of [0,1]){
  g.teleport(s0,10); g.advance(0.1); g.setDebugInput({steer:0,paddleL:pad,paddleR:pad});
  // push lateral by a short steer pulse
  const tr=[]; for(let i=0;i<8;i++){ g.setDebugInput({steer:0.6,paddleL:pad,paddleR:pad}); g.advance(0.25); if(Math.abs(S().lateral)>=lat0) break; }
  const start=+S().lateral.toFixed(2);
  for(let t=0;t<8;t+=0.5){ g.setDebugInput({steer:0,paddleL:pad,paddleR:pad}); g.advance(0.5); tr.push(+S().lateral.toFixed(2)); }
  out.nudge.push({s0,lat0,pad,start,tr});
 }
 return out;});
fs.writeFileSync(D+'extra.json',JSON.stringify(r,null,1));
console.log(JSON.stringify(r.held.map(h=>[h.s0,h.side,h.peak,h.tr.filter((_,i)=>i%4==3).map(x=>x[1]+'@'+x[2]).join(' '),h.resc])));
console.log(JSON.stringify(r.nudge.map(n=>[n.s0,n.lat0,n.pad,n.start,n.tr.join(',')])));
await b.close();
