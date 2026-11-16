import { chromium } from '/home/user/downhill-car-race/node_modules/playwright/index.mjs';
import fs from 'fs';
const mode = process.argv[2] || 'good'; // good | relaxed
const D='/home/user/downhill-car-race/critique/maps/round-10/screens/gameplay/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:640,height:360} });
await p.goto('http://localhost:4672/?autostart=1&track=corn&q=low&ai=9&truck=4');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:180000});
const r = await p.evaluate((mode)=>{
 const g=window.__game; const V=g.vehicles; const names=V.map((v,i)=>i?(v.name||'AI'+i):'You');
 const out={mode,grid:names.map((n,i)=>n+':'+i),finish:{},rescues:[],stuck:[],order90:null,lead:[],tl:[]};
 const last=V.map(v=>v.body.state.respawns||0); const slow=V.map(()=>0); const slowStart=V.map(()=>null);
 let prevLat=0, t=0, leader=-1, lc=0;
 const rng=(()=>{let x=12345;return()=>{x=(x*1103515245+12345)&0x7fffffff;return x/0x7fffffff;}})();
 // countdown
 g.setDebugInput({steer:0,paddleL:0,paddleR:0}); 
 let guard=0; while(g.state.countdown>0&&guard++<400) g.advance(0.25);
 let noise=0;
 for(;t<420;t+=0.25){
  const s=V[0].body.state; const lat=s.lateral;
  let d, pad=1;
  if(mode==='good'){ d=-(0.15*lat+0.3*(lat-prevLat)/0.25); }
  else { noise=0.9*noise+0.3*(rng()-0.5); d=-(0.1*lat+0.15*(lat-prevLat)/0.25)+noise; pad=0.7; }
  d=Math.max(-1,Math.min(1,d)); prevLat=lat;
  if(V[0].finished) g.setDebugInput({steer:0,paddleL:0,paddleR:0}); else g.setDebugInput({steer:d,paddleL:pad,paddleR:pad});
  g.advance(0.25);
  V.forEach((v,i)=>{ const st=v.body.state; const rc=st.respawns||0;
    if(rc!==last[i]){ out.rescues.push({who:names[i],t:+t.toFixed(1),s:Math.round(st.s),fin:!!v.finished}); last[i]=rc; }
    if(i&&!v.finished){ if(st.velocity.length()<1.5){ if(slowStart[i]==null) slowStart[i]=[t,st.s,st.lateral]; } else if(slowStart[i]){ const dur=t-slowStart[i][0]; if(dur>=1.5) out.stuck.push({who:names[i],t:+slowStart[i][0].toFixed(1),s:Math.round(slowStart[i][1]),lat:+slowStart[i][2].toFixed(1),dur:+dur.toFixed(1)}); slowStart[i]=null; } } });
  const ord=V.map((v,i)=>[i,v.finished?1e6-v.finishTime:v.body.state.s]).sort((a,c)=>c[1]-a[1]); if(ord[0][0]!==leader){ if(leader!==-1) lc++; leader=ord[0][0]; out.lead.push([+t.toFixed(0),names[leader]]); }
  if(Math.abs(t-90)<0.01) out.order90=V.map((v,i)=>[names[i],Math.round(v.body.state.s)]).sort((a,c)=>c[1]-a[1]).map(x=>x.join('('))
  if(t%60===0) out.tl.push(V.map(v=>Math.round(v.body.state.s)).join(','));
  V.forEach((v,i)=>{ if(v.finished&&!(names[i] in out.finish)) out.finish[names[i]]=+v.finishTime.toFixed(1); });
  if(V.every(v=>v.finished)) break;
 }
 out.t=t; out.leadChanges=lc; out.unfinished=V.filter(v=>!v.finished).map((v,i)=>v.body.state.s|0);
 return out;},mode);
fs.writeFileSync(D+'race-'+mode+'.json',JSON.stringify(r,null,1));
console.log(JSON.stringify(r));
await p.screenshot({path:D+'race-end-'+mode+'.jpg',type:'jpeg',quality:70});
await b.close();
