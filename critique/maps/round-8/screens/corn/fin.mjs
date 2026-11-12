import { chromium } from '/home/user/dcr-tracks/node_modules/playwright/index.mjs';
const D='/home/user/dcr-tracks/critique/maps/round-8/screens/corn/';
const b = await chromium.launch({ args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:800,height:450} });
await p.goto('http://localhost:4631/?autostart=1&track=corn&q=low');
await p.waitForFunction(()=>window.__game&&window.__game.vehicles.length>1,null,{timeout:120000}).catch(()=>{});
await p.waitForTimeout(1500);
const r=await p.evaluate(async()=>{const g=window.__game;g.advance(5);g.teleport(3120,9);let t=0,prev=0;const st=()=>g.vehicles[0].body.state;
 while(t<40&&!g.state.finished){const s=st();const d=(s.lateral-prev)/0.25;prev=s.lateral;g.setDebugInput({steer:Math.max(-1,Math.min(1,-(0.45*s.lateral+0.9*d))),paddleL:true,paddleR:true});g.advance(0.25);t+=0.25;}
 return {t,fin:g.state.finished,s:st().s,place:g.state.place,ft:g.state.finishTime,v:st().velocity.length()}});
console.log(JSON.stringify(r)); await p.screenshot({path:D+'finish_end.jpg',type:'jpeg',quality:70});
await p.evaluate(()=>window.__game.advance(4)); await p.screenshot({path:D+'finish_results.jpg',type:'jpeg',quality:70}); await b.close();
