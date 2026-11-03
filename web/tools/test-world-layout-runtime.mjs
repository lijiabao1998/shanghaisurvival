import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';
const source=readFileSync(new URL('../src/survival.ts',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const js=(await transform(source,{loader:'ts',target:'es2022'})).code;
function fn(name){const start=js.indexOf(`function ${name}(`);assert.ok(start>=0);let p=js.indexOf('{',start),depth=1,end=p+1;for(;depth;end++){if(js[end]==='{')depth++;if(js[end]==='}')depth--;}return js.slice(start,end);}
const rooms=Array.from({length:9},(_,i)=>({id:`room-${i}`}));
const groups=new Map(rooms.map(r=>[r.id,{visible:true}]));
const ordinary={x:1,z:2,looted:true};
const boxes=rooms.map((r,i)=>({roomId:r.id,expandedRoom:i>=3,looted:i<3}));
const ctx={densityGroup:{visible:false},laneGroup:{visible:false},LANE_LAYOUT_VERSION:'laoximen-lanes-v1',densityEnabledForLayout:v=>v==='menghua-infill-v1',worldLayout:undefined,interiorRooms:[],plannedInteriorRooms:rooms,interiorGroups:groups,containers:[ordinary,...boxes]};
vm.createContext(ctx);vm.runInContext(fn('configureWorldLayout'),ctx);
ctx.configureWorldLayout(undefined);assert.equal(ctx.interiorRooms.length,3);assert.equal(ctx.densityGroup.visible,false);assert.deepEqual([...groups.values()].map(g=>g.visible),[true,true,true,false,false,false,false,false,false]);assert.equal(boxes.filter(c=>c.roomEnabled).length,3);
ctx.configureWorldLayout('menghua-infill-v1');assert.equal(ctx.interiorRooms.length,9);assert.equal(ctx.densityGroup.visible,true);assert.equal(boxes.filter(c=>c.roomEnabled).length,9);
ctx.configureWorldLayout('laoximen-lanes-v1');assert.equal(ctx.interiorRooms.length,9);assert.equal(ctx.laneGroup.visible,true);assert.equal(ctx.densityGroup.visible,false,'lane fabric replaces the four v1 infill boxes');assert.equal(boxes.filter(c=>c.roomEnabled).length,9);
ctx.configureWorldLayout('menghua-infill-v1');assert.equal(ctx.laneGroup.visible,false,'v1 saves never see lane houses');
ctx.configureWorldLayout(undefined);assert.equal(ctx.interiorRooms.length,3);assert.equal(ctx.laneGroup.visible,false);assert.deepEqual(ordinary,{x:1,z:2,looted:true});assert.deepEqual(boxes.map(c=>c.looted),[true,true,true,false,false,false,false,false,false]);
// New games use the lane fabric; a resumed save keeps the layout it was created with.
assert.ok(source.includes("configureWorldLayout(resume?resume.worldLayout:LANE_LAYOUT_VERSION)"));
assert.ok(source.indexOf("configureWorldLayout(resume?resume.worldLayout:LANE_LAYOUT_VERSION)")<source.indexOf('  resetWorld();\n  if(resume)'));
assert.match(source,/c\.looted \|\| c\.roomEnabled===false/,'hidden expansion loot cannot be collected through invisible rooms');
assert.match(source,/c\.mesh\.visible=c\.roomEnabled!==false/);
console.log('PASS actual layout switch: legacy three rooms, v1 and lane layouts nine rooms, lane houses only in their layout, hidden loot disabled, depletion and ordinary indices untouched');
