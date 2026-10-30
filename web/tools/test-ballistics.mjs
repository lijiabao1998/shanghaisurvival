import assert from 'node:assert/strict';
import {createRound,stepRound} from '../src/ballistics.ts';
const make=(extra={})=>createRound({origin:{x:0,y:1.35,z:0},direction:{x:1,y:0,z:0},speed:100,range:40,damage:80,...extra});
const target=(id,x,z=0)=>({id,x,z,radius:.4,bottom:0,top:1.8});
const clear=()=>false;
let count=0;const test=(name,fn)=>{fn();console.log(`PASS ${name}`);count++;};
test('finite flight, gravity and frame partition invariance',()=>{
 const a=make(),b=make();assert.equal(stepRound(a,.01,[],clear),null);assert.ok(a.position.x<1.001&&a.position.x>.999);assert.ok(a.position.y<1.35);
 stepRound(a,.09,[],clear);for(let i=0;i<10;i++)stepRound(b,.01,[],clear);assert.ok(Math.abs(a.position.y-b.position.y)<1e-9);assert.ok(Math.abs(a.position.y-(1.35-.5*9.8*.1**2))<1e-9);
});
test('nearest target independent of list order; damage attenuates with distance',()=>{
 const r=make();const hit=stepRound(r,.2,[target('far',12),target('near',6)],clear);assert.equal(hit.kind,'target');assert.equal(hit.targetId,'near');assert.ok(hit.damage<80&&hit.damage>44);assert.ok(hit.position.x<6);assert.equal(r.alive,false);assert.equal(stepRound(r,.1,[],clear),null);
});
test('swept fast projectile cannot skip a narrow target',()=>{
 const r=make({speed:1000});const hit=stepRound(r,.1,[{...target('thin',8.017),radius:.001}],clear);assert.equal(hit.targetId,'thin');
});
test('thin wall blocks targets behind it, not targets before it',()=>{
 const wall=(x,y,z,r)=>Math.abs(x-4)<r+.001;
 const a=stepRound(make(),.2,[target('behind',6)],wall);assert.equal(a.kind,'wall');
 const b=stepRound(make(),.2,[target('front',2),target('behind',6)],wall);assert.equal(b.targetId,'front');
});
test('ground, range and vertical misses resolve without damage',()=>{
 assert.equal(stepRound(make({origin:{x:0,y:.001,z:0},speed:10}),.2,[],clear).kind,'ground');
 assert.equal(stepRound(make({range:2}),.2,[],clear).kind,'range');
 const r=make({origin:{x:0,y:3,z:0},range:10});assert.equal(stepRound(r,.2,[target('under',4)],clear).kind,'range');
});
test('invalid inputs cannot create or advance rounds; no bonus hit on pause',()=>{
 for(const value of [NaN,Infinity,-1,0,2001])assert.equal(make({speed:value}),null);
 assert.equal(make({direction:{x:0,y:0,z:0}}),null);
 const r=make(),raw=JSON.stringify(r);for(const dt of [0,-1,NaN,Infinity,2])assert.equal(stepRound(r,dt,[],clear),null);assert.equal(JSON.stringify(r),raw);
});
test('starts in a wall stop immediately; zero-gravity trajectory supported',()=>{
 assert.equal(stepRound(make(),.1,[],()=>true).kind,'wall');const r=make({gravity:0});stepRound(r,.1,[],clear);assert.equal(r.position.y,1.35);
});
console.log(`${count} pure simulated-ballistic checks passed; not a browser test or real-world measurement.`);
