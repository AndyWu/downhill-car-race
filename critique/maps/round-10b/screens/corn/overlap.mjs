import pw from 'playwright'; const {chromium}=pw;
import fs from 'fs';
const D='/home/user/downhill-car-race/critique/maps/round-10b/screens/corn/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:640,height:360} });
await p.goto('http://localhost:4691/?autostart=1&track=corn&q=low');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:120000}).catch(()=>{});
await p.waitForTimeout(1500);
const r = await p.evaluate(async()=>{
 const g=window.__game; const ev=[]; let cur={}; let tot=0; let samples=0;
 for(let t=0;t<200;t+=0.1){
  g.setDebugInput({steer:0,paddleL:0,paddleR:0}); g.advance(0.1);
  const ai=g.vehicles.slice(1);
  for(let i=0;i<ai.length;i++)for(let j=i+1;j<ai.length;j++){
   const A=ai[i].body.state,B=ai[j].body.state; const dd=Math.hypot(A.position.x-B.position.x,A.position.z-B.position.z);
   const k=i+'-'+j; samples++;
   if(dd<1.0){tot++; if(!cur[k]) cur[k]={t:+t.toFixed(1),s:Math.round(A.s),min:dd,n:0}; cur[k].n++; cur[k].min=Math.min(cur[k].min,dd);}
   else if(cur[k]){ev.push(cur[k]);delete cur[k];}
  }
 }
 return {tot,events:ev.map(e=>[e.t,e.s,+e.min.toFixed(2),e.n*0.1].join('/')).join(' ')};
});
fs.appendFileSync(D+'overlap.log',JSON.stringify(r)+'\n'); console.log(JSON.stringify(r));
await b.close();
