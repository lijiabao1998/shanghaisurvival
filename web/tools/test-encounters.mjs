import * as THREE from 'three';
import {viewHeight} from '../src/view.ts';
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {build} from 'esbuild';
const bundled=await build({stdin:{contents:`export {planEncounters,inOpeningView} from './src/encounters.ts';export {makeCollider,makeInsideTest,wallGridOf} from './src/world.ts';export {sweepMove} from './src/combat.ts';export {profileFor} from './src/factions.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {planEncounters,inOpeningView,makeCollider,makeInsideTest,wallGridOf,sweepMove,profileFor}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const d=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8')),points=d.buildings.flatMap(b=>b.footprint),bounds={minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))};
const collides=makeCollider(wallGridOf(d,false)),insideBuilding=makeInsideTest(d),spawn={x:d.spawn[0],z:d.spawn[1]};
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const seed of [1,7,42,319,2026]){
 const opts={count:240,spawn,bounds,roads:d.roads,collides,insideBuilding,rng:seeded(seed)};
 const result=planEncounters(opts);assert.equal(result.placements.length,240);assert.ok(result.placements.every(Boolean));
 const counts={};for(let i=0;i<240;i++){const p=result.placements[i];assert.equal(p.faction,profileFor(i).id);counts[p.faction]=(counts[p.faction]??0)+1;assert.ok(!collides(p.x,p.z,.4));assert.ok(!insideBuilding(p.x,p.z));if(p.faction==='raider')assert.ok(Math.hypot(p.x-spawn.x,p.z-spawn.z)>=45);if(p.patrol)assert.equal(sweepMove(p.x,p.z,p.patrol.x-p.x,p.patrol.z-p.z,.34,collides).blocked,false);}
 assert.deepEqual(counts,{infected:120,military:40,police:40,raider:40});
 for(const i of [0,2,4]){const p=result.placements[i],distance=Math.hypot(p.x-spawn.x,p.z-spawn.z);assert.equal(p.source,'opening');assert.ok(distance>=10&&distance<=18);assert.ok(inOpeningView(p,spawn));const a=9/16,h=viewHeight(a,true),camera=new THREE.OrthographicCamera(-h*a/2,h*a/2,h/2,-h/2,.1,2400);camera.position.set(spawn.x+40,57,-spawn.z+40);camera.lookAt(spawn.x,1,-spawn.z);camera.updateMatrixWorld();for(const y of [0,1.72]){const projected=new THREE.Vector3(p.x,y,-p.z).project(camera);assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1,'actual Three camera phone projection');}assert.equal(sweepMove(spawn.x,spawn.z,p.x-spawn.x,p.z-spawn.z,.34,collides).blocked,false);}
 assert.deepEqual(result,planEncounters({...opts,rng:seeded(seed)}));console.log(`PASS real map seed ${seed}: 240, factions unchanged, first 3 visible/reachable, all outdoor; fallbacks ${result.warnings.length}`);
}
const blocked=planEncounters({count:6,spawn:{x:0,z:0},bounds:{minX:-20,maxX:20,minY:-20,maxY:20},roads:[],collides:()=>true,rng:seeded(1)});assert.equal(blocked.placements.length,6);assert.ok(blocked.placements.every(p=>p===null));assert.ok(blocked.warnings.length>=6);console.log('PASS blocked map keeps 6 unavailable slots with explicit reasons; no unsafe positions');
const noRoad=planEncounters({count:12,spawn:{x:0,z:0},bounds:{minX:-60,maxX:60,minY:-60,maxY:60},roads:[],collides:()=>false,rng:seeded(1)});assert.ok(noRoad.placements.every(Boolean));assert.ok(noRoad.placements.some(p=>p.source==='fallback'));console.log('PASS no-roads validated fallback');
