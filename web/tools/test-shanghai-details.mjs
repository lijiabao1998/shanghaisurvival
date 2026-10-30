import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {lilongFacade,createLilongInterior,createShelterFloor} from './src/shanghai-details.ts';export {makeInsideTest,makeCollider,wallGridOf} from './src/world.ts';export {selectShelter} from './src/shelter.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {lilongFacade,createLilongInterior,createShelterFloor,makeInsideTest,makeCollider,wallGridOf,selectShelter}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const data=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8')),before=JSON.stringify(data);
let decorated=0,vertices=0;
for(const b of data.buildings){
 const d=lilongFacade({...b,height_m:Math.min(b.height_m,6.4)});
 assert.equal(d.positions.length,d.colors.length);assert.ok(d.positions.every(Number.isFinite));
 assert.deepEqual(d,lilongFacade({...b,height_m:Math.min(b.height_m,6.4)}),'deterministic details');
 if(d.features)decorated++;vertices+=d.positions.length/3;
}
assert.ok(decorated>300,'whole map receives gates, not one staged facade');
assert.ok(vertices<300000,'bounded batch geometry budget');
const collides=makeCollider(wallGridOf(data,false)),inside=makeInsideTest(data),s=selectShelter(data.buildings,data.spawn,collides,inside),b=data.buildings.find(b=>b.id===s.id);
const mesh=createLilongInterior(b,s);assert.ok(mesh.userData.features>=4,'real safehouse contains readable domestic details');
const p=mesh.geometry.getAttribute('position'),localInside=makeInsideTest({buildings:[b],spawn:s.inside});
const dx=s.inside[0]-s.door[0],dy=s.inside[1]-s.door[1],len=Math.hypot(dx,dy),ux=dy/len,uy=-dx/len;
for(let i=0;i<p.count;i++){
 const x=p.getX(i),z=-p.getZ(i);
 assert.ok(localInside(x,z),'furniture stays inside the selected shelter footprint');
 assert.ok(Math.abs((x-s.door[0])*ux+(z-s.door[1])*uy)>=.599,'1.2m central doorway lane clear');
}
for(let i=0;i<=18;i++){const t=i/18;assert.equal(collides(s.outside[0]+(s.inside[0]-s.outside[0])*t,s.outside[1]+(s.inside[1]-s.outside[1])*t,.4),false);}
assert.equal(JSON.stringify(data),before,'no input/map mutation');
console.log(`PASS ${decorated} lilong gateways, ${vertices} facade vertices; safehouse ${mesh.userData.features} domestic parts, ${p.count} vertices, inside footprint and clear doorway; unchanged source`);
const runtime=readFileSync(new URL('../src/survival.ts',import.meta.url),'utf8');
assert.ok(runtime.includes("roomView.onclick=()=>{shelterPanel.classList.toggle('room-view');syncRoomView();}"),'real room-view control, not screenshot-only hiding');
assert.ok(runtime.includes("shelterPanel.classList.remove('room-view')"),'exit clears room-view mode');
assert.ok(runtime.includes("phase, mode, inShelter, shelter:"),'read-only state exposes actual shelter entry for browser verification');
console.log('PASS static room-view control and read-only shelter QA state contracts (browser flow still pending)');

for(const fixture of [b,{id:'courtyard',footprint:[[0,0],[8,0],[8,8],[0,8]],holes:[[[2,2],[2,6],[6,6],[6,2]]],height_m:8},{id:'concave',footprint:[[0,0],[5,0],[5,1],[1,1],[1,5],[0,5]],holes:[],height_m:8}]){
 const floor=createShelterFloor(fixture).geometry.getAttribute('position');
 const within=makeInsideTest({buildings:[fixture],spawn:[0,0]});
 for(let i=0;i<floor.count;i+=3){
  let x=0,z=0;for(let j=0;j<3;j++){assert.ok(Math.abs(floor.getY(i+j)-.035)<1e-5);x+=floor.getX(i+j)/3;z-=floor.getZ(i+j)/3;}
  assert.ok(within(x,z),'floor triangles preserve footprint concavity and holes');
 }
}
assert.ok(!runtime.includes('new THREE.CircleGeometry(2,24)'),'no circular shelter staging pad');
console.log('PASS real/concave/courtyard floor geometry preserves outline and holes');
