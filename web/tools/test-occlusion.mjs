import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildingOccludesPlayer} from '../src/occlusion.ts';
const rect=(x,z,w,d,h=12)=>({footprint:[[x,z],[x+w,z],[x+w,z+d],[x,z+d]],holes:[],height_m:h});
let passed=0;function test(name,fn){fn();passed++;console.log(`PASS ${name}`);}
test('foreground wall hides player',()=>assert.equal(buildingOccludesPlayer(rect(2,-6,4,4),0,0),true));
test('background building does not hide player',()=>assert.equal(buildingOccludesPlayer(rect(-6,2,4,4,100),0,0),false));
test('ray clears low roof but intersects high roof',()=>{assert.equal(buildingOccludesPlayer(rect(12,-16,4,4,3),0,0),false);assert.equal(buildingOccludesPlayer(rect(12,-16,4,4,25),0,0),true);});
test('interior player hides roof',()=>assert.equal(buildingOccludesPlayer(rect(-2,-2,4,4),0,0),true));
test('concave notch is not filled as a bounding box',()=>{const b={footprint:[[0,0],[8,0],[8,2],[2,2],[2,8],[0,8]],holes:[],height_m:3};assert.equal(buildingOccludesPlayer(b,4,4),false);});
test('courtyard is empty, but high courtyard wall blocks camera',()=>{const b=rect(-10,-10,20,20,3);b.holes=[[[-8,-8],[-8,8],[8,8],[8,-8]]];assert.equal(buildingOccludesPlayer(b,0,0),false);b.height_m=25;assert.equal(buildingOccludesPlayer(b,0,0),true);});
test('zero length edges and closed rings stay safe',()=>{const b=rect(2,-6,4,4);b.footprint.splice(1,0,b.footprint[0]);b.footprint.push(b.footprint[0]);assert.equal(buildingOccludesPlayer(b,0,0),true);});
test('invalid height uses same 12 metre fallback as world renderer',()=>{for(const h of [NaN,Infinity,-1,0,2,250])assert.equal(buildingOccludesPlayer(rect(2,-6,4,4,h),0,0),true);});
test('nonfinite positions fail closed without mutating geometry',()=>{const b=rect(2,-6,4,4);const before=JSON.stringify(b);assert.equal(buildingOccludesPlayer(b,NaN,0),false);buildingOccludesPlayer(b,0,0);assert.equal(JSON.stringify(b),before);});
test('collinear edge avoids NaN',()=>{const b={footprint:[[2,-2],[8,-8],[9,-7],[3,-1]],holes:[],height_m:12};assert.equal(typeof buildingOccludesPlayer(b,0,0),'boolean');});
const map=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8'));
test('real CMAB map is deterministic and leaves data unchanged',()=>{const before=JSON.stringify(map.buildings);let hidden=0;for(const b of map.buildings){const probes=[map.spawn,[b.footprint[0][0]-2,b.footprint[0][1]+2]];for(const probe of probes){const a=buildingOccludesPlayer(b,...probe);assert.equal(a,buildingOccludesPlayer(b,...probe));if(a)hidden++;}}assert.ok(hidden>0&&hidden<map.buildings.length*2);assert.equal(JSON.stringify(map.buildings),before);console.log(`  two probes per building: ${hidden}/${map.buildings.length*2} occluding`);});
console.log(`${passed} non-browser occlusion checks passed`);
