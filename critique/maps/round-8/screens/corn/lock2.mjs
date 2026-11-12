import { chromium } from '/home/user/dcr-tracks/node_modules/playwright/index.mjs';
import fs from 'fs';
const b = await chromium.launch({ args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:480,height:270} });
await p.goto('http://localhost:4631/?autostart=1&track=corn&q=low&norender=0');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:120000}).catch(()=>{});
await p.waitForTimeout(1500);
const out = await p.evaluate(async()=>{
  const g=window.__game; const res={}; g.advance(8);
  const body=()=>g.vehicles[0].body.state;
  const cases=[[328,14,-1],[600,10,1],[965,12,1],[1448,14,1],[800,14,1]];
  for (const [s,v,d] of cases){
    g.setDebugInput({steer:0,paddleL:true,paddleR:true}); g.teleport(s-15,v); g.advance(1.2); // straight lead-in
    g.teleport(s,v); g.advance(0.3);
    const v0=body().velocity.length();
    g.setDebugInput({steer:d,paddleL:true,paddleR:true}); const tr=[];
    for(let i=0;i<6;i++){ g.advance(0.5); const st=body(); tr.push([(i+1)*0.5, +st.velocity.length().toFixed(1), +st.lateral.toFixed(1)].join('/')); }
    res[`${s}@${v}${d>0?'R':'L'}`]={v0:+v0.toFixed(1),trace:tr.join(' '),resp:body().respawns};
  } return res; });
console.log(JSON.stringify(out,null,1)); await b.close();
