import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {roofGeometry,cityGeometry,interiorGeometry} from './src/world.ts'`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {roofGeometry,cityGeometry,interiorGeometry}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function ringArea(r){return Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;}
function inside(p,r){let v=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])v=!v;}return v;}
function check(b, make, height){const g=make(b),p=g.getAttribute('position');let total=0,triangles=0;for(let i=0;i<p.count;i+=3){if(![i,i+1,i+2].every(k=>Math.abs(p.getY(k)-height)<1e-5))continue;const t=[i,i+1,i+2].map(k=>[p.getX(k),-p.getZ(k)]);const a=ringArea(t);if(a<1e-8)continue;total+=a;triangles++;const c=[t.reduce((s,v)=>s+v[0],0)/3,t.reduce((s,v)=>s+v[1],0)/3];assert.ok(inside(c,b.footprint)&&!b.holes.some(h=>inside(c,h)),`${b.id} triangle stays inside actual footprint`);}const expected=ringArea(b.footprint)-b.holes.reduce((s,h)=>s+ringArea(h),0);assert.ok(Math.abs(total-expected)<Math.max(.02,expected*1e-5),`${b.id}: area ${total} vs ${expected}`);assert.ok(triangles>0);g.dispose();}
const cases=[
{id:'concave-L',footprint:[[0,0],[5,0],[5,1],[1,1],[1,5],[0,5]],holes:[],height_m:8},
{id:'courtyard',footprint:[[0,0],[8,0],[8,8],[0,8]],holes:[[[2,2],[2,6],[6,6],[6,2]]],height_m:8},
{id:'closed-ring',footprint:[[0,0],[3,0],[3,3],[0,3],[0,0]],holes:[],height_m:8},
];
for(const b of cases){const before=JSON.stringify(b);check(b,b=>roofGeometry([b]),8);check(b,b=>cityGeometry({buildings:[b],spawn:[0,0]}),8);check(b,b=>interiorGeometry([b]),.035);assert.equal(JSON.stringify(b),before,'triangulation never mutates source');console.log(`PASS ${b.id}: roof, combined city roof, interior floor area and centroids`);}
const data=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8'));
for(const b of data.buildings)check(b,b=>roofGeometry([b]),b.height_m);
console.log(`PASS ${data.buildings.length} real CMAB roofs: polygon-minus-holes area and triangle centroids (no browser)`);
