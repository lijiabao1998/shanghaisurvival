import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {selectShelter} from '../src/shelter.ts';
const bundle=await build({stdin:{contents:`export {makeCollider,wallGridOf,makeInsideTest} from './src/world.ts'`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {makeCollider,wallGridOf,makeInsideTest}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const data=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8'));
const collide=makeCollider(wallGridOf(data,false)),inside=makeInsideTest(data);
const s=selectShelter(data.buildings,data.spawn,collide,inside);
assert.ok(s,'default real map has a usable shelter');
assert.ok(inside(...s.inside));assert.ok(!inside(...s.outside));
for(let i=0;i<=100;i++){const t=i/100;assert.equal(collide(s.outside[0]+(s.inside[0]-s.outside[0])*t,s.outside[1]+(s.inside[1]-s.outside[1])*t,.36),false);}
assert.equal(selectShelter([],data.spawn,collide,inside),null);
assert.equal(selectShelter(data.buildings,data.spawn,()=>true,inside),null);
assert.deepEqual(s,selectShelter(data.buildings,data.spawn,collide,inside),'selection stable across reload');
console.log('PASS real CMAB doorway: existing building, indoor/outdoor, player-radius traversable, deterministic, unavailable cases');
console.log(JSON.stringify({shelter:s,spawn:data.spawn,distance:Math.hypot(s.outside[0]-data.spawn[0],s.outside[1]-data.spawn[1])}));
