// Geometric connectivity proof for a radius-.36 actor; not a browser/gameplay acceptance claim.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export * from './src/interior-rooms';export * from './src/density-plan';export {createCityVisibility} from './src/city-visibility';export {makeCollider,wallGridOf,makeInsideTest,roofGeometry} from './src/world';export {selectShelter} from './src/shelter';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`),block=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8'));
const before=JSON.stringify(block),base=m.makeCollider(m.wallGridOf(block,false)),inside=m.makeInsideTest(block),shelter=m.selectShelter(block.buildings,block.spawn,base,inside);
const rooms=m.planInteriorRooms(block,[shelter.id],9),density=m.planDensityBuildings(block);assert.equal(rooms.length,9);assert.equal(density.buildings.length,4);
const added=m.makeCollider(m.wallGridOf({buildings:density.buildings,spawn:block.spawn},false));
const collision=(layout,x,z,r=.36)=>base(x,z,r)||(m.densityEnabledForLayout(layout)&&added(x,z,r))||rooms.slice(0,m.densityEnabledForLayout(layout)?9:3).some(room=>m.roomFurnitureCollision(room,x,z,r));
const expanded=(x,z,r=.36)=>collision(m.DENSITY_LAYOUT_VERSION,x,z,r),legacy=(x,z,r=.36)=>collision(undefined,x,z,r);
const clear=(a,b,collide=expanded)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.06));for(let i=0;i<=n;i++)if(collide(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n,.36))return false;return true;};
const legacyFixture=JSON.parse(readFileSync(new URL('./fixtures/interior-v1-three.json',import.meta.url),'utf8'));
assert.deepEqual(rooms.slice(0,3),legacyFixture,'legacy three-room layout identity remains exact');
const originalIds=block.buildings.map(b=>b.id),densityBefore=JSON.stringify(density.buildings),visibility=m.createCityVisibility(density.buildings,true),floor=m.roofGeometry(density.buildings),renderStats=visibility.stats();
assert.equal(visibility.group.children.length,3);assert.equal(renderStats.meshes,3);
const renderVertices=renderStats.wallVertices+renderStats.roofVertices+floor.getAttribute('position').count;
assert.ok(renderVertices<60000,'four low-rise buildings incl floor stay below explicit 60k unique-vertex budget');
assert.equal(JSON.stringify(density.buildings),densityBefore);assert.deepEqual(block.buildings.map(b=>b.id),originalIds);
for(const mesh of visibility.group.children){assert.ok([...mesh.geometry.getAttribute('position').array].every(Number.isFinite));mesh.geometry.dispose();mesh.material.dispose();}floor.dispose();
const targets=rooms.map(r=>({id:r.id,outside:r.entrance.outside}));
for(const room of rooms){const {door,inside,outside}=room.entrance,dx=inside[0]-door[0],dz=inside[1]-door[1],l=Math.hypot(dx,dz),end=[door[0]+dx/l*4.7,door[1]+dz/l*4.7];assert.ok(clear(outside,end),`${room.id} central corridor blocked by combined collider`);}
const combinedInside=m.makeInsideTest({buildings:[...block.buildings,...density.buildings],spawn:block.spawn});
for(const b of density.buildings){const entry=m.selectShelter([b],block.spawn,expanded,combinedInside);assert.ok(entry,`${b.id} has reachable doorway`);assert.ok(clear(entry.outside,entry.inside),`${b.id} doorway obstructed`);targets.push({id:b.id,outside:entry.outside});}
// Deterministic A*: 0.25m cells, continuous swept-edge samples <=.06m, actor radius .36.
// No merely positive box-gap assertion: every reported route must connect to exact endpoints.
const step=.25,margin=60,all=[block.spawn,...targets.map(t=>t.outside)],minX=Math.floor((Math.min(...all.map(p=>p[0]))-margin)/step)*step,minZ=Math.floor((Math.min(...all.map(p=>p[1]))-margin)/step)*step;
const nx=Math.ceil((Math.max(...all.map(p=>p[0]))+margin-minX)/step)+1,nz=Math.ceil((Math.max(...all.map(p=>p[1]))+margin-minZ)/step)+1;
const pos=id=>[minX+(id%nx)*step,minZ+Math.floor(id/nx)*step],cache=new Map();
const free=id=>{if(!cache.has(id)){const p=pos(id);cache.set(id,!expanded(...p));}return cache.get(id);};
function endpoint(p){const x=Math.round((p[0]-minX)/step),z=Math.round((p[1]-minZ)/step),options=[];for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){const id=(z+dz)*nx+x+dx;if(free(id)&&clear(p,pos(id)))options.push(id);}options.sort((a,b)=>Math.hypot(...pos(a).map((v,i)=>v-p[i]))-Math.hypot(...pos(b).map((v,i)=>v-p[i])));assert.ok(options.length,'exact endpoint can attach to grid');return options[0];}
const start=endpoint(block.spawn);
function route(target){const goal=endpoint(target),heap=[],cost=new Map([[start,0]]),parent=new Map(),closed=new Set();
 const heuristic=id=>Math.hypot(...pos(id).map((v,i)=>v-pos(goal)[i]));
 const push=(id,f)=>{heap.push({id,f});let i=heap.length-1;while(i){const j=(i-1)>>1;if(heap[j].f<=f)break;[heap[i],heap[j]]=[heap[j],heap[i]];i=j;}};
 const pop=()=>{const result=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;while(true){let j=i*2+1;if(j>=heap.length)break;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[i].f<=heap[j].f)break;[heap[i],heap[j]]=[heap[j],heap[i]];i=j;}}return result.id;};
 push(start,heuristic(start));while(heap.length){const id=pop();if(closed.has(id))continue;closed.add(id);if(id===goal){const ids=[id];while(parent.has(ids[0]))ids.unshift(parent.get(ids[0]));const points=[block.spawn,...ids.map(pos),target];for(let i=1;i<points.length;i++)assert.ok(clear(points[i-1],points[i]),'entire reconstructed route swept clear');return {meters:+cost.get(id).toFixed(2),nodes:ids.length,explored:closed.size};}
  const x=id%nx,z=Math.floor(id/nx);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const xx=x+dx,zz=z+dz;if(xx<0||zz<0||xx>=nx||zz>=nz)continue;const next=zz*nx+xx;if(closed.has(next)||!free(next)||!clear(pos(id),pos(next)))continue;const value=cost.get(id)+Math.hypot(dx,dz)*step;if(value>=(cost.get(next)??Infinity))continue;cost.set(next,value);parent.set(next,id);push(next,value+heuristic(next));}}
 return null;
}
const results=[];for(const target of targets){const path=route(target.outside);results.push({id:target.id,...path});assert.ok(path,`No bounded swept-clear spawn path to ${target.id}`);}
let wallWitness=0,furnitureWitness=0,samples=0;
for(const b of density.buildings){const xs=b.footprint.map(p=>p[0]),zs=b.footprint.map(p=>p[1]);for(let x=Math.min(...xs)-.5;x<=Math.max(...xs)+.5;x+=.2)for(let z=Math.min(...zs)-.5;z<=Math.max(...zs)+.5;z+=.2){const reference=base(x,z,.36)||rooms.slice(0,3).some(r=>m.roomFurnitureCollision(r,x,z,.36));assert.equal(legacy(x,z),reference);assert.equal(collision('unknown',x,z),reference);if(!reference&&added(x,z,.36))wallWitness++;samples++;}}
for(const room of rooms.slice(3))for(const f of room.furniture){const [x,z]=f.center,reference=base(x,z,.36)||rooms.slice(0,3).some(r=>m.roomFurnitureCollision(r,x,z,.36));assert.equal(legacy(x,z),reference);if(!reference&&expanded(x,z))furnitureWitness++;}
assert.ok(wallWitness>0);assert.ok(furnitureWitness>0);assert.equal(JSON.stringify(block),before);
const runtime=readFileSync(new URL('../src/survival.ts',import.meta.url),'utf8').replace(/\s+/g,'');assert.ok(runtime.includes('densityEnabledForLayout(worldLayout)&&densityCollision(x,z,r)'));assert.ok(runtime.includes("plannedInteriorRooms.slice(0,layout==='menghua-infill-v1'?9:3)"),'runtime retains legacy three-room gate');
console.log(JSON.stringify({passed:true,radius:.36,gridStep:step,sweptSample:.06,bounds:{minX,minZ,nx,nz},results,legacy:{samples,wallWitness,furnitureWitness},render:{cityMeshes:3,floorMeshes:1,totalMeshes:4,uniqueVertices:renderVertices,budget:60000},scope:'geometry only; not browser traversal'},null,2));
