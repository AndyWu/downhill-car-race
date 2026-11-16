import pw from 'playwright'; const {chromium}=pw;
import fs from 'fs';
const D='/home/user/downhill-car-race/critique/maps/round-10b/screens/corn/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:640,height:360} });
await p.goto('http://localhost:4691/?autostart=1&track=corn&q=low');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:120000}).catch(()=>{});
await p.waitForTimeout(1500);
await p.screenshot({path:D+'hud_grid.jpg',type:'jpeg',quality:70});
const hud = await p.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>/lap/i.test(e.id+' '+e.className+' '+(e.children.length?'':e.textContent))).map(e=>e.tagName+'#'+e.id+'.'+e.className+' vis='+(e.offsetParent!==null)+' '+(e.textContent||'').slice(0,30)).slice(0,15));
fs.appendFileSync(D+'sloppy.log','HUD lap-ish: '+JSON.stringify(hud)+'\n');
const r = await p.evaluate(async(seed)=>{
 let sd=seed; const rnd=()=>{sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;};
 const g=window.__game; const st=()=>g.vehicles[0].body.state; const out={tr:[],pass:0};
 let prevLat=0,out_n=0,n=0,crawl=0,maxCrawl=0,noise=0,pad=0,minv=99, pairClose=0,pairN=0,minPair=99;
 const r0=st().respawns||0;
 for(let t=0;t<1000;t+=0.1){
  const s=st(); const lat=s.lateral;
  if(Math.round(t*10)%3===0) noise=(rnd()*2-1)*0.3;
  if(Math.round(t*10)%5===0) pad=rnd()<0.2?1:0;
  let d=-(0.35*lat+0.6*(lat-prevLat)/0.1)+noise; d=Math.max(-1,Math.min(1,d)); prevLat=lat;
  g.setDebugInput({steer:d,paddleL:pad,paddleR:pad});
  g.advance(0.1); n++; const v=st().velocity.length(); if(Math.abs(st().lateral)>2.2) out_n++;
  if(v<1.5){crawl+=0.1;maxCrawl=Math.max(maxCrawl,crawl);}else crawl=0; minv=Math.min(minv,v);
  // AI pair overlap
  const ai=g.vehicles.slice(1);
  for(let i=0;i<ai.length;i++)for(let j=i+1;j<ai.length;j++){const a=ai[i].body.state.position,c=ai[j].body.state.position;const dd=Math.hypot(a.x-c.x,a.z-c.z);minPair=Math.min(minPair,dd);pairN++;if(dd<1.2)pairClose++;}
  if(Math.round(t*10)%300===0) out.tr.push([Math.round(t),Math.round(st().s),+v.toFixed(1),(st().respawns||0)-r0].join('/'));
  if(g.state.finished||st().s>3190){out.fin=t;break;}
 }
 out.s=Math.round(st().s); out.resc=(st().respawns||0)-r0; out.outPct=+(100*out_n/n).toFixed(1); out.maxCrawl=+maxCrawl.toFixed(1); out.minv=+minv.toFixed(2); out.place=g.state.place;
 out.pairClose=pairClose; out.minPair=+minPair.toFixed(2); out.pairN=pairN;
 out.pack=g.vehicles.map(v=>Math.round(v.body.state.s)).join(',');
 return out;}, 12345);
fs.appendFileSync(D+'sloppy.log',JSON.stringify(r)+'\n');
await p.screenshot({path:D+'sloppy_end.jpg',type:'jpeg',quality:70});
await b.close();
