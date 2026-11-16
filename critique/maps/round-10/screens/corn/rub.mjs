import pw from 'playwright'; const {chromium}=pw;
const D='/home/user/downhill-car-race/critique/maps/round-10/screens/corn/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:640,height:360} });
await p.goto('http://localhost:4671/?autostart=1&track=corn&q=low');
await p.waitForFunction(()=>window.__game&&window.__game.state.mode==='race',null,{timeout:120000}).catch(()=>{});
await p.waitForTimeout(1500);
const ev=(f,a)=>p.evaluate(f,a);
await ev(()=>{window.__game.advance(8)});
const lead=(s,v)=>ev(([s,v])=>{const g=window.__game;g.setDebugInput({steer:0,paddleL:1,paddleR:1});g.teleport(s-15,v);g.advance(1.2);g.teleport(s,v);g.advance(0.3);},[s,v]);
const run=(opts)=>ev(async(o)=>{const g=window.__game;const st=()=>g.vehicles[0].body.state;const r0=st().respawns||0;let resc=null;const tr=[];
 g.setDebugInput({steer:o.d,paddleL:o.pad?1:0,paddleR:o.pad?1:0});
 for(let i=1;i<=o.n;i++){g.advance(0.5);const s=st();if(resc==null&&(s.respawns||0)>r0)resc=i*0.5; if(i%o.k==0)tr.push([i*0.5,+s.velocity.length().toFixed(1),+s.lateral.toFixed(1),Math.round(s.s)].join('/'));}
 return {resc,nresc:(st().respawns||0)-r0,tr:tr.join(' ')}},opts);
for (const [s,d] of [[600,1],[600,-1],[1448,1],[1931,-1],[2574,1],[965,-1]]){ await lead(s,s==600?10:13); const r=await run({d,pad:true,n:28,k:2}); console.log('RUB paddle',s,d,JSON.stringify(r)); }
for (const [s,d] of [[965,1],[1448,-1]]){ await lead(s,13); const r=await run({d,pad:false,n:36,k:2}); console.log('IDLE lock',s,d,JSON.stringify(r)); }
// release test: lock 3s then centre steer and paddle, does cart rejoin
await lead(1448,13); await run({d:1,pad:true,n:6,k:6}); let r=await run({d:0,pad:true,n:12,k:2}); console.log('RELEASE',JSON.stringify(r));
// nose-in
for (const [yaw,lat,pad,d] of [[1,2.0,true,0],[1,2.0,true,1],[1,2.0,false,0],[1,2.5,true,-1]]){
 await lead(1000,8);
 await ev(([yaw,lat])=>{const g=window.__game;const st=g.vehicles[0].body.state;const smp=g.world.track.sampleAt(1000);
  const x=smp.position.x+smp.right.x*lat, z=smp.position.z+smp.right.z*lat; st.position.x=x; st.position.z=z; st.velocity.set(0,0,0); st.angularVelocity&&st.angularVelocity.set(0,0,0);
  const ang=Math.atan2(smp.right.x,smp.right.z); st.quaternion.setFromAxisAngle({x:0,y:1,z:0},ang); g.advance(0.2);},[yaw,lat]);
 const r=await run({d,pad,n:30,k:2}); console.log('NOSEIN lat',lat,'pad',pad,'steer',d,JSON.stringify(r)); }
await b.close();
