import { chromium } from '/home/user/downhill-car-race/node_modules/playwright/index.mjs';
import fs from 'fs';
const D='/home/user/downhill-car-race/critique/maps/round-10/screens/gameplay/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:480,height:270} });
await p.goto('http://localhost:4672/?autostart=1&track=corn&q=low&ai=0&truck=4');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:180000});
const r = await p.evaluate(()=>{
 const g=window.__game; const B=()=>g.vehicles[0].body; const S=()=>B().state;
 const out={held:[],wedge:[],scrape:[],straight:[]};
 let guard=0; while(g.state.countdown>0&&guard++<400) g.advance(0.25);
 // HELD: full lock into corn, hands steady, paddling
 for(const s0 of [300,700,1100,1500,2000,2600]) for(const side of [-1,1]){
  g.teleport(s0,12); g.advance(0.1); const tr=[]; const r0=S().respawns||0;
  for(let t=0;t<12;t+=0.5){ g.setDebugInput({steer:side,paddleL:1,paddleR:1}); g.advance(0.5);
   const st=S(); tr.push([t+0.5,+st.lateral.toFixed(2),+st.velocity.length().toFixed(1)]); }
  out.held.push({s0,side,tr,resc:(S().respawns||0)-r0,ds:Math.round(S().s-s0)});
 }
 // WEDGE: hands-off nose into corn wall at 3 spots, both sides
 for(const s0 of [300,700,1000,1400,1800,2400]) for(const side of [-1,1]){
  g.teleport(s0,0); g.advance(0.1); const sm=g.world.track.sampleAt(s0); const st=S(); const r0=st.respawns||0;
  let rescAt=null; let sp=[];
  for(let t=0;t<8;t+=0.25){ g.setDebugInput({steer:0,paddleL:0,paddleR:0}); g.advance(0.25); if((S().respawns||0)>r0&&rescAt==null) rescAt=t; if(t%2==1.75) sp.push(+S().velocity.length().toFixed(1)); }
  out.wedge.push({s0,side,rescAt,ds:Math.round(S().s-s0),lat:+S().lateral.toFixed(1)});
 }
 // STRAIGHT 40s
 for(const s0 of [40,400,900,1400,2000,2600]){
  g.teleport(s0,10); g.advance(0.1); const r0=S().respawns||0; const lat=[]; const surfs={};
  for(let t=0;t<40;t+=0.25){ g.setDebugInput({steer:0,paddleL:1,paddleR:1}); g.advance(0.25); const k=S().surface||S().surf||'?'; surfs[k]=(surfs[k]||0)+0.25; if(t%5==4.75) lat.push(+S().lateral.toFixed(1)); }
  out.straight.push({s0,ds:Math.round(S().s-s0),resc:(S().respawns||0)-r0,lat,surfs});
 }
 return out;});
fs.writeFileSync(D+'extra.json',JSON.stringify(r,null,1));
console.log(JSON.stringify(r.held.map(h=>[h.s0,h.side,h.tr.filter((_,i)=>i%4==3).map(x=>x[1]+'@'+x[2]).join(' '),h.resc,h.ds])));
console.log(JSON.stringify(r.wedge)); console.log(JSON.stringify(r.straight.map(s=>[s.s0,s.ds,s.resc,s.lat.join(','),JSON.stringify(s.surfs)])));
await b.close();
