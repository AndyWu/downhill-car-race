import { chromium } from '/home/user/dcr-tracks/node_modules/playwright/index.mjs';
const D='/home/user/dcr-tracks/critique/maps/round-8/screens/corn/';
const b = await chromium.launch({ args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:640,height:360} });
await p.goto('http://localhost:4631/?autostart=1&track=corn&q=low');
await p.waitForFunction(()=>window.__game&&window.__game.vehicles.length>1,null,{timeout:120000}).catch(()=>{});
await p.waitForTimeout(1500);
const r = await p.evaluate(async()=>{
 const g=window.__game; const st=()=>g.vehicles[0].body.state; let prev=0,out=[],over=0,n=0,minv=99,t=0;
 let slow=0,maxslow=0;
 while(t<520 && !g.state.finished){
  const s=st(); const lat=s.lateral; const half=(g.world.track.sampleAt(Math.max(0,s.s)).width||3.5)/2;
  const d=(lat-prev)/0.25; prev=lat; const steer=Math.max(-1,Math.min(1,-(0.45*lat+0.9*d)));
  g.setDebugInput({steer,paddleL:true,paddleR:true}); g.advance(0.25); t+=0.25; n++;
  if(Math.abs(lat)>half)over++; const v=st().velocity.length(); if(t>10)minv=Math.min(minv,v);
  if(v<1.5){slow+=0.25;maxslow=Math.max(maxslow,slow)}else slow=0;
  if(n%80==0) out.push([t,Math.round(st().s),+v.toFixed(1),g.state.place||0,st().respawns||0].join('/'));
 }
 return {t,finished:g.state.finished,place:g.state.place,finishTime:g.state.finishTime,s:st().s,resp:st().respawns,over:+(over/n).toFixed(2),minv,maxslow,out:out.join(' ')};
});
console.log(JSON.stringify(r));
await p.screenshot({path:D+'finish_end.jpg',type:'jpeg',quality:70});
await b.close();
