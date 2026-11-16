import pw from 'playwright'; const {chromium}=pw;
import fs from 'fs';
const D='/home/user/downhill-car-race/critique/maps/round-10b/screens/corn/';
const log=(...a)=>fs.appendFileSync(D+'full.log',a.join(' ')+'\n');
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:640,height:360} });
await p.goto('http://localhost:4691/?autostart=1&track=corn&q=low');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:120000}).catch(()=>{});
await p.waitForTimeout(1500);
await p.screenshot({path:D+'grid_0.jpg',type:'jpeg',quality:70});
const r = await p.evaluate(async()=>{
 const g=window.__game; const st=()=>g.vehicles[0].body.state; const out={tr:[],shots:0};
 let prevLat=0, out_n=0, n=0, crawl=0, maxCrawl=0, minv=99;
 const r0=st().respawns||0;
 for(let t=0;t<900;t+=0.1){
  const s=st(); const lat=s.lateral; 
  // PD steer toward lateral 0: steering sign +1 => lateral increases (right)
  let d=-(0.5*lat+0.8*(lat-prevLat)/0.1); d=Math.max(-1,Math.min(1,d)); prevLat=lat;
  g.setDebugInput({steer:d,paddleL:1,paddleR:1});
  g.advance(0.1); n++; const v=st().velocity.length(); if(Math.abs(st().lateral)>2.2) out_n++;
  if(v<1.5){crawl+=0.1;maxCrawl=Math.max(maxCrawl,crawl);}else crawl=0; minv=Math.min(minv,v);
  if(Math.abs(t/30-Math.round(t/30))<0.04) out.tr.push([t,Math.round(st().s),+v.toFixed(1),(st().respawns||0)-r0, g.state.place||0].join('/'));
  if(g.state.finished||st().s>3190){out.fin=t;break;}
 }
 out.s=Math.round(st().s); out.resc=(st().respawns||0)-r0; out.outPct=+(100*out_n/n).toFixed(1); out.maxCrawl=maxCrawl; out.minv=+minv.toFixed(2); out.place=g.state.place; out.finished=g.state.finished;
 out.pack=g.vehicles.map(v=>Math.round(v.body.state.s)).join(',');
 return out;});
log(JSON.stringify(r));
await p.screenshot({path:D+'run_end.jpg',type:'jpeg',quality:70});
await b.close();
