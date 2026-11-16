import pw from 'playwright'; const {chromium}=pw;
const D='/home/user/downhill-car-race/critique/maps/round-10/screens/corn/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:640,height:360} });
await p.goto('http://localhost:4671/?autostart=1&track=corn&q=low');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:120000}).catch(()=>{});
await p.waitForTimeout(1500);
const ev=(f,a)=>p.evaluate(f,a);
await ev(()=>window.__game.advance(8));
const shot=n=>p.screenshot({path:D+n+'.jpg',type:'jpeg',quality:70});
await ev(()=>{const g=window.__game;g.setDebugInput({steer:0,paddleL:1,paddleR:1});g.teleport(585,10);g.advance(1.2);g.teleport(600,10);g.advance(0.3);g.setDebugInput({steer:1,paddleL:1,paddleR:1});g.advance(1.5)});
await shot('lock600_1.5s');
await ev(()=>window.__game.advance(1.5)); await shot('lock600_3s');
await ev(()=>window.__game.advance(2.5)); await shot('lock600_5.5s');
// idle lock 965 R crash spot
await ev(()=>{const g=window.__game;g.setDebugInput({steer:0,paddleL:1,paddleR:1});g.teleport(950,12);g.advance(1.2);g.teleport(965,12);g.advance(0.3);g.setDebugInput({steer:0,paddleL:0,paddleR:0});g.teleport(1060,9);g.advance(0.2);});
await shot('s1060');
const r=await ev(async()=>{const g=window.__game;const o=[];for(let i=0;i<10;i++){g.advance(0.5);const s=g.vehicles[0].body.state;o.push([Math.round(s.s),+s.velocity.length().toFixed(1),+s.lateral.toFixed(1)].join('/'));}return o.join(' ')});
console.log('1060 coast',r); await shot('s1085');
// finish
await ev(()=>{const g=window.__game;g.setDebugInput({steer:0,paddleL:1,paddleR:1});g.teleport(3100,9);g.advance(14);});
await p.waitForTimeout(1500); await shot('finish');
await b.close();
