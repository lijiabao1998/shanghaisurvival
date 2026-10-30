// Layout migration boundary and real movement; candidate localhost only.
import puppeteer from 'puppeteer-core';import assert from 'node:assert/strict';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';
const out=process.env.QA_OUTPUT??'/tmp/shanghai-world-layout-evidence';await mkdir(out,{recursive:true});
const url=process.env.QA_URL??'http://127.0.0.1:4173/survival.html?debug';assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname));
const browser=await puppeteer.launch({executablePath:process.env.QA_BROWSER??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={commit:process.env.GITHUB_SHA??'local',checks:[],fixtures:[],renderSamples:[],errors:[],passed:false};const state=p=>p.evaluate(()=>window.__modu.state());
const map=JSON.parse(await readFile(new URL('../public/data/block.json',import.meta.url),'utf8'));
const compiled=await build({stdin:{contents:"export {makeCollider,makeInsideTest,wallGridOf} from './src/world.ts';export {selectShelter} from './src/shelter.ts';",resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false});
const {makeCollider,makeInsideTest,wallGridOf,selectShelter}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
async function saved(p){return p.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('shanghai-survivors:systems-v1:'));return {key,data:JSON.parse(localStorage.getItem(key))};});}
async function ready(p){await p.waitForFunction(()=>window.__modu);}
async function resumeAtomic(p){return p.evaluate(()=>{const b=[...document.querySelectorAll('#campaign-mode button')].find(b=>b.textContent.includes('繼續'));if(!b)throw Error('Missing continue');b.click();const s=window.__modu.state();document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true}));return s;});}
async function stage(p,seed){const inert=new URL('/__qa_layout_fixture__.html',url).href;const intercept=r=>r.url()===inert?r.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Isolated layout fixture</title>'}):r.continue();await p.setRequestInterception(true);p.on('request',intercept);await p.goto(inert,{waitUntil:'load'});p.off('request',intercept);await p.setRequestInterception(false);await p.evaluate(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),seed);await p.goto(url,{waitUntil:'networkidle0'});await ready(p);}
function assertLayout(s,modern){assert.equal(s.worldLayout,modern?'menghua-infill-v1':'legacy');assert.equal(s.densityBuildings.length,modern?4:0);assert.equal(s.interiorRooms.length,modern?9:3);if(modern){assert.equal(s.densityMeshes.meshes,3);assert.equal(s.densityMeshes.floorMeshes,1);}else assert.equal(s.densityMeshes,null);}
async function sampleRender(p,device,layout){
 const frames=await p.evaluate(()=>new Promise(resolve=>{const times=[];let previous;const sample=t=>{if(previous!==undefined)times.push(t-previous);previous=t;if(times.length===30)resolve(times);else requestAnimationFrame(sample);};requestAnimationFrame(sample);}));
 const sorted=[...frames].sort((a,b)=>a-b),budget=(await state(p)).renderBudget;assert.ok(budget&&Number.isFinite(budget.calls)&&budget.calls>0);assert.ok(budget.calls<2000&&budget.triangles<1500000,'coarse runaway geometry guard, not FPS acceptance');
 report.renderSamples.push({device,layout,frames:30,medianMs:(sorted[14]+sorted[15])/2,p95Ms:sorted[28],renderBudget:budget,environment:'GitHub headless Chromium SwiftShader viewport emulation, NOT physical mobile GPU/FPS acceptance',guard:'calls<2000, triangles<1500000; only catastrophic draw/geometry growth gate'});
}
async function unpause(p){if((await state(p)).paused)await p.keyboard.press('Escape');}
const touchSessions=new WeakMap();
async function touchSession(p){if(!touchSessions.has(p))touchSessions.set(p,await p.createCDPSession());return touchSessions.get(p);}
async function directionDown(p,keys){
 if(!p.viewport().isMobile){for(const k of keys)await p.keyboard.down(k);return;}
 const pad=await p.waitForSelector('#survivor-joystick',{visible:true}),box=await pad.boundingBox();assert.ok(box);
 const x=box.x+box.width/2,y=box.y+box.height/2,offset=box.width*.17,dx=(Number(keys.includes('KeyD'))-Number(keys.includes('KeyA')))*offset,dy=(Number(keys.includes('KeyS'))-Number(keys.includes('KeyW')))*offset;
 const session=await touchSession(p);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});
}
async function directionUp(p,keys){if(p.viewport().isMobile)await(await touchSession(p)).send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else for(const k of keys)await p.keyboard.up(k);}
async function moveTo(p,target){
 const started=Date.now(),trail=[];let unchanged=0,last=null;
 while(Date.now()-started<25000){
  const at=(await state(p)).spawn,dx=target[0]-at[0],dz=target[1]-at[1];if(Math.hypot(dx,dz)<.16)return;
  const axis=Math.abs(dx)>Math.abs(dz)?0:1,delta=axis===0?dx:dz;
  let keys=axis===0?(delta>0?['KeyD','KeyS']:['KeyA','KeyW']):(delta>0?['KeyW','KeyD']:['KeyA','KeyS']);
  // Full eight-direction joystick control avoids axis-only quantization near diagonal waypoints.
  if(p.viewport().isMobile&&Math.min(Math.abs(dx),Math.abs(dz))/Math.max(Math.abs(dx),Math.abs(dz))>.4142)keys=[dx>0?(dz>0?'KeyD':'KeyS'):(dz>0?'KeyW':'KeyA')];
  trail.push({at,remaining:Math.hypot(dx,dz),keys});if(trail.length>30)trail.shift();
  if(last&&Math.hypot(at[0]-last[0],at[1]-last[1])<.005)unchanged++;else unchanged=0;
  assert.ok(unchanged<25,`movement stalled at ${at}, target ${target}`);last=at;
  try{await directionDown(p,keys);await p.waitForFunction(old=>{const s=window.__modu.state();return Math.hypot(s.spawn[0]-old[0],s.spawn[1]-old[1])>.02;},{polling:'raf',timeout:5000},at);}catch(error){throw new Error(`No movement simulation while held at ${at}, target ${target}, state ${JSON.stringify(await state(p))}: ${error.message}`);}finally{await directionUp(p,keys);}
 }
 throw new Error(`Doorway walk timed out toward ${target}; at ${(await state(p)).spawn}; movement trail ${JSON.stringify(trail)}`);
}
async function corridor(p,from,to){if(!(await state(p)).sneaking){if(p.viewport().isMobile){const box=await(await p.waitForSelector('#survivor-touch-crouch',{visible:true})).boundingBox();assert.ok(box);await p.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);}else await p.keyboard.press('KeyC');}const length=Math.hypot(to[0]-from[0],to[1]-from[1]),n=Math.ceil(length/.3);for(let i=1;i<=n;i++)await moveTo(p,[from[0]+(to[0]-from[0])*i/n,from[1]+(to[1]-from[1])*i/n]);}

try{for(const mobile of [false,true]){
 const device=mobile?'mobile':'desktop',context=await browser.createBrowserContext(),p=await context.newPage();await p.setViewport(mobile?{width:390,height:844,isMobile:true,hasTouch:true}:{width:1440,height:900});
 p.on('pageerror',e=>report.errors.push({device,message:e.message}));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))report.errors.push({device,message:m.text()});});
 await p.goto(url,{waitUntil:'networkidle0'});await ready(p);if(mobile){await p.tap('.who');await p.tap('#ov-btn');}else{await p.click('.who');await p.click('#ov-btn');}await p.waitForFunction(()=>window.__modu.state().phase==='play');
 const initial=await state(p);assertLayout(initial,true);await sampleRender(p,device,'new');await p.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('shanghai-survivors:systems-v1:')));const seed=await saved(p);assert.equal(seed.data.worldLayout,'menghua-infill-v1');
 // A short real walk starts at the actual natural spawn, not a position fixture.
 const combined={...map,buildings:[...map.buildings,...initial.densityBuildings]},collision=makeCollider(wallGridOf(combined,false)),inside=makeInsideTest(combined);
 const road=map.roads.find(r=>r.id==='osm_40109239_0');let route=null;
 for(let i=1;i<road.centerline.length&&!route;i++){const a=road.centerline[i-1],b=road.centerline[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);for(let t=1;t<l;t+=.5){const target=[a[0]+dx*t/l,a[1]+dz*t/l],d=Math.hypot(target[0]-initial.spawn[0],target[1]-initial.spawn[1]);if(d<2||d>5)continue;let clear=true;for(let k=0;k<=30;k++){const x=initial.spawn[0]+(target[0]-initial.spawn[0])*k/30,z=initial.spawn[1]+(target[1]-initial.spawn[1])*k/30;if(collision(x,z,.4)||inside(x,z)){clear=false;break;}}if(clear){route=target;break;}}}
 assert.ok(route,'actual spawn has a legal 2-5m path to named street');await corridor(p,initial.spawn,route);report.checks.push({device,kind:'natural-spawn-to-street',from:initial.spawn,to:(await state(p)).spawn,input:mobile?'touch joystick':'keyboard',fixture:false});await p.screenshot({path:`${out}/${device}-natural-road-walk.png`});
 await p.reload({waitUntil:'networkidle0'});await ready(p);const freshReload=await resumeAtomic(p);assertLayout(freshReload,true);report.checks.push({device,kind:'new-layout-reload',buildings:4,rooms:9});
 // Isolated legacy fixture differs only by removal of the layout opt-in marker.
 const legacy=structuredClone(seed);delete legacy.data.worldLayout;await stage(p,legacy);const old=await resumeAtomic(p);assertLayout(old,false);assert.deepEqual(old.spawn,legacy.data.position);assert.deepEqual(old.worldPositions.containers,legacy.data.containers.map(({x,z})=>({x,z})));assert.deepEqual(old.worldPositions.enemies,legacy.data.enemies.map(({x,z})=>({x,z})));await sampleRender(p,device,'legacy');report.checks.push({device,kind:'legacy-exact-position-preservation',player:true,containers:old.worldPositions.containers.length,enemies:old.worldPositions.enemies.length});await p.screenshot({path:`${out}/${device}-legacy-layout.png`});
 // Adversarial isolated legacy fixture: original legal ground overlaps a NEW wall.
 const originalCollision=makeCollider(wallGridOf(map,false)),originalInside=makeInsideTest(map),newWallCollision=makeCollider(wallGridOf({buildings:initial.densityBuildings,spawn:map.spawn},false));
 const overlapPoints=[];
 for(const b of initial.densityBuildings)for(let i=0;i<b.footprint.length;i++){const a=b.footprint[i],z=b.footprint[(i+1)%b.footprint.length];for(const t of [.2,.8]){const point=[a[0]+(z[0]-a[0])*t,a[1]+(z[1]-a[1])*t];if(!originalInside(...point)&&!originalCollision(...point,.4)&&newWallCollision(...point,.36))overlapPoints.push(point);}}
 assert.ok(overlapPoints.length>=2,'legacy-overlap points are original legal ground but collide with new walls');
 const overlap=structuredClone(legacy);overlap.data.position=overlapPoints[0];Object.assign(overlap.data.containers[0],{x:overlapPoints[1][0],z:overlapPoints[1][1]});overlap.data.inShelter=false;
 await stage(p,overlap);const overlapped=await resumeAtomic(p);assertLayout(overlapped,false);assert.deepEqual(overlapped.spawn,overlapPoints[0],'legacy player on new wall must not relocate to safehouse');assert.deepEqual(overlapped.worldPositions.containers,overlap.data.containers.map(({x,z})=>({x,z})),'legacy container on new wall must not invalidate/relocate save');assert.deepEqual(overlapped.worldPositions.enemies,overlap.data.enemies.map(({x,z})=>({x,z})));
 report.fixtures.push({device,kind:'legacy-overlap',changedFields:{worldLayout:'deleted',position:overlapPoints[0],ordinaryContainerIndex:0,containerPosition:overlapPoints[1],inShelter:false},geometryProof:{originalInside:false,originalCollisionAtRadius04:false,newWallCollisionAtRadius036:true},warning:'adversarial isolated test fixture, NOT a real user save'});
 report.checks.push({device,kind:'legacy-overlap-no-invisible-new-collision',playerPreserved:true,containerPreserved:true,enemiesPreserved:true,buildings:0,rooms:3});await p.screenshot({path:`${out}/${device}-legacy-overlap.png`});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 for(const building of initial.densityBuildings){const door=selectShelter([building],map.spawn,collision,inside);assert.ok(door,'new footprint has traversable actual doorway');const f=structuredClone(seed);f.data.position=door.outside;f.data.inShelter=false;f.data.enemies=f.data.enemies.map(e=>({...e,hp:0,state:'dead'}));await stage(p,f);const at=await resumeAtomic(p);assertLayout(at,true);assert.deepEqual(at.spawn,door.outside);await unpause(p);await corridor(p,door.outside,door.inside);assert.ok(makeInsideTest({buildings:[building],spawn:map.spawn})(...(await state(p)).spawn));await p.screenshot({path:`${out}/${device}-${building.id.split(':').at(-1)}-new-building.png`});await corridor(p,door.inside,door.outside);report.checks.push({device,kind:'new-building-real-doorway',id:building.id,entry:true,exit:true,input:mobile?'touch joystick':'keyboard'});report.fixtures.push({device,id:building.id,position:door.outside,enemies:'dead',warning:'isolated doorway-start fixture followed by real movement, not full spawn traversal'});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
 await context.close();await writeFile(`${out}/${device}-report.json`,JSON.stringify(report,null,2));
}assert.deepEqual(report.errors,[]);report.passed=true;}catch(e){report.failure=e.stack;process.exitCode=1;console.error(e);for(const [i,p] of(await browser.pages()).entries())try{await p.screenshot({path:`${out}/failure-${i}.png`});}catch{}}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
