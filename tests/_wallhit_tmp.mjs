import * as THREE from 'three';
import { createWorld } from '../src/scene/index.js';
import { createVehicleBody, placeOnGround } from '../src/core/physics.js';
import { TRUCKS } from '../src/vehicles/index.js';
const TRACK=process.env.TRACK||'corn', V=Number(process.env.V||14), ANG=Number(process.env.ANG||20);
const world = await createWorld(new THREE.Scene(), { seed: 1, trackId: TRACK });
const spec=TRUCKS[0];
for (const s0 of (process.env.SS||'300,700,1100,1700,2300').split(',').map(Number)) for (const side of [-1,1]) {
  const f=world.track.sampleAt(s0); const body=createVehicleBody(spec,world);
  const x=f.position.x+f.right.x*side*(f.width/2-0.5), z=f.position.z+f.right.z*side*(f.width/2-0.5);
  const T=f.tangent.clone();T.y=0;T.normalize();
  const dir=T.clone().applyAxisAngle(new THREE.Vector3(0,1,0),-side*ANG*Math.PI/180);
  placeOnGround(body,world,x,z,dir,dir.clone().multiplyScalar(V));
  let minV=99, vAt=[], resc0=0, maxB=0;
  for(let t=0;t<8;t+=1/60){ body.step(1/60,{steer:0,paddleL:0,paddleR:0,handbrake:0});
    const st=body.state; if(t>0.3) minV=Math.min(minV,st.forwardSpeed);
    maxB=Math.max(maxB,Math.abs(st.lateral)-f.width/2);
    if(Math.abs(t-2)<0.01||Math.abs(t-4)<0.01) vAt.push(st.forwardSpeed.toFixed(1)); }
  console.log(TRACK,'s',s0,'side',side,'minFwd',minV.toFixed(1),'v@2,4',vAt.join('/'),'beyond',maxB.toFixed(1),'resp',body.state.respawns||0);
}
