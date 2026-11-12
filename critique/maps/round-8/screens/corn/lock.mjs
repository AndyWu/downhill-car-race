import { chromium } from '/home/user/dcr-tracks/node_modules/playwright/index.mjs';
import fs from 'fs';
const b = await chromium.launch({ args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:640,height:360} });
p.on('pageerror',e=>console.log('ERR',String(e)));
await p.goto('http://localhost:4631/?autostart=1&track=corn&q=low');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:120000}).catch(()=>{});
await p.waitForTimeout(2000);
const out = await p.evaluate(async()=>{
  const g=window.__game; const res={};
  g.advance(8);
  const P=()=>g.vehicles.find(v=>v.isPlayer||v.player)||g.vehicles[0];
  const cases=[[328,14,1],[328,14,-1],[600,14,-1],[600,10,1],[600,14,1],[965,12,-1],[965,12,1],[1195,14,1],[1770,14,1],[1990,14,-1],[2100,14,1],[1448,14,1],[2574,14,-1],[800,14,1]];
  for (const [s,v,d] of cases){
    g.teleport(s,v); g.setDebugInput({steer:d,paddleL:true,paddleR:true});
    const body=()=>P().body.state; const r0=body().respawns||0; const tr=[];
    for(let i=0;i<12;i++){ g.advance(0.5); const st=body(); tr.push([+((i+1)*0.5).toFixed(1), +st.velocity.length().toFixed(1), +st.lateral.toFixed(1), Math.round(st.s)].join('/')); }
    const vRel=body().velocity.length();
    g.setDebugInput({steer:0,paddleL:true,paddleR:true});
    const tr2=[]; for(let i=0;i<8;i++){ g.advance(0.5); const st=body(); tr2.push(+st.velocity.length().toFixed(1)); }
    res[`${s}@${v}${d>0?'R':'L'}`]={vAt3:tr[5].split('/')[1], v6:tr[11].split('/')[1], rel:tr2, resp:(body().respawns||0)-r0, trace:tr.join(' ')};
  }
  return res;
});
fs.writeFileSync('/home/user/dcr-tracks/critique/maps/round-8/screens/corn/lock.json', JSON.stringify(out,null,1));
for (const k in out) console.log(k, 'v@3s',out[k].vAt3,'v@6s',out[k].v6,'after-release',out[k].rel.join(','),'resp',out[k].resp);
await b.close();
