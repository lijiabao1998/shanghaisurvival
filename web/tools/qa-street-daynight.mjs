// Isolated candidate acceptance. Clock fixtures change only disposable browser
// storage copied from a naturally started test game, never a user's save.
import puppeteer from 'puppeteer-core';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const out=process.env.QA_OUTPUT??'/tmp/shanghai-street-daynight-evidence';await mkdir(out,{recursive:true});
const url=process.env.QA_URL??'http://127.0.0.1:4173/survival.html?debug';
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname),'fixtures may run only against local candidate server');
const browser=await puppeteer.launch({executablePath:process.env.QA_BROWSER??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={scope:'local candidate in fresh isolated browser contexts; no production storage',commit:process.env.GITHUB_SHA??'local',checks:[],fixtures:[],states:{},errors:[],httpErrors:[],requestFailures:[],passed:false};
const map=JSON.parse(await readFile(new URL('../public/data/block.json',import.meta.url),'utf8'));
const compiled=await build({stdin:{contents:`export {makeCollider,makeInsideTest,wallGridOf} from './src/world.ts';export {selectShelter} from './src/shelter.ts';export {buildingAppearance} from './src/shanghai-details.ts';export {buildingOccludesPlayer} from './src/occlusion.ts';`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false});
const {makeCollider,makeInsideTest,wallGridOf,selectShelter,buildingAppearance,buildingOccludesPlayer}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const collides=makeCollider(wallGridOf(map,false)),inside=makeInsideTest(map);
function streetView(placements){
 const pairs=placements.filter(p=>p.kind==='lamp').flatMap(lamp=>placements.filter(p=>p.kind==='tree').map(tree=>({lamp,tree,d:Math.hypot(lamp.x-tree.x,lamp.z-tree.z)}))).filter(p=>p.d<=22).sort((a,b)=>a.d-b.d);
 for(const pair of pairs){const x=(pair.lamp.x+pair.tree.x)/2,z=(pair.lamp.z+pair.tree.z)/2;
  for(const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]])if(!inside(x+dx,z+dz)&&!collides(x+dx,z+dz,.5))return {...pair,position:[x+dx,z+dz]};
 }
 throw new Error('No legal nearby tree/lamp viewpoint; refuse to claim streetscape screenshot from spawn');
}
function facadeView(appearance){
 const candidates=map.buildings.filter(b=>buildingAppearance(b.id)===appearance).map(b=>({b,entrance:selectShelter([b],map.spawn,collides,inside)})).filter(v=>v.entrance).sort((a,b)=>Math.hypot(a.entrance.outside[0]-map.spawn[0],a.entrance.outside[1]-map.spawn[1])-Math.hypot(b.entrance.outside[0]-map.spawn[0],b.entrance.outside[1]-map.spawn[1]));
 const points=map.buildings.flatMap(b=>b.footprint),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
 const bounds=[Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs)];
 for(const {b,entrance:e} of candidates){
  let hash=2166136261;for(const c of b.id)hash=Math.imul(hash^c.charCodeAt(0),16777619);hash>>>=0;
  const rendered={...b,height_m:Math.min(b.height_m,6.4+(hash%3)*2.8)};
  const nx=(e.outside[0]-e.door[0])/1.8,nz=(e.outside[1]-e.door[1])/1.8;
  for(const distance of [4,6,8,10,12,14])for(const side of [0,3,-3,6,-6,9,-9]){
   const x=e.door[0]+nx*distance-nz*side,z=e.door[1]+nz*distance+nx*side;
   if(x<bounds[0]+1||x>bounds[1]-1||z<bounds[2]+1||z>bounds[3]-1||inside(x,z)||collides(x,z,.5)||buildingOccludesPlayer(rendered,x,z))continue;
   // Match the game's fixed orthographic camera and actual five wheel steps.
   // Include rooftop additions up to 2.8 m, not just the facade's base vertices.
   const height=44/Math.pow(1.1,5),aspect=1440/900;
   const camera=new THREE.OrthographicCamera(-height*aspect/2,height*aspect/2,height/2,-height/2,.1,2000);
   camera.position.set(x+40,57,-z+40);camera.lookAt(x,1,-z);camera.updateMatrixWorld();
   const projected=b.footprint.flatMap(([bx,bz])=>[0,rendered.height_m+2.8].map(y=>new THREE.Vector3(bx,y,-bz).project(camera)));
   if(!projected.every(p=>Math.abs(p.x)<.82&&Math.abs(p.y)<.82))continue;
   return {buildingId:b.id,appearance,position:[x,z],entrance:e,renderHeight:rendered.height_m,zoom:Math.pow(1.1,5)};
  }
 }
 throw new Error(`No legal framed non-occluding ${appearance} building viewpoint`);
}
const state=p=>p.evaluate(()=>window.__modu.state());
async function ready(p){await p.waitForFunction(()=>!!window.__modu,{timeout:60000});}
async function frame(p){await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function clickText(p,selector,text,mobile){await p.waitForSelector(selector,{visible:true});for(const b of await p.$$(selector)){if((await b.evaluate(el=>el.textContent)).includes(text)){if(mobile)await b.tap();else await b.click();return;}}throw new Error(`Missing ${text}`);}
async function init(label,viewport,seed){
 const context=await browser.createBrowserContext(),p=await context.newPage();p.setDefaultTimeout(45000);await p.setViewport(viewport);
 p.on('pageerror',e=>report.errors.push({label,message:e.message}));
 p.on('response',r=>{if(r.status()>=400&&!new URL(r.url()).pathname.endsWith('/favicon.ico'))report.httpErrors.push({label,status:r.status(),url:r.url()});});
 p.on('requestfailed',r=>{if(!r.url().endsWith('/favicon.ico'))report.requestFailures.push({label,url:r.url(),error:r.failure()?.errorText});});
 if(seed)await p.evaluateOnNewDocument(({key,value})=>localStorage.setItem(key,value),seed);
 await p.goto(url,{waitUntil:'networkidle0',timeout:60000});await ready(p);return {p,context};
}
async function snapshot(p){return p.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('shanghai-survivors:systems-v1:'));if(!key)throw new Error('No natural current-schema save');const value=localStorage.getItem(key);return {key,value};});}
async function resume(p,mobile){await clickText(p,'#campaign-mode button','繼續第',mobile);await p.waitForFunction(()=>window.__modu.state().phase==='play'&&window.__modu.state().mode==='sandbox');await frame(p);}
try{
 for(const [device,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844,isMobile:true,hasTouch:true}]]){
  const mobile=device==='mobile';const {p,context}=await init(`${device}-natural`,viewport);
  if(mobile){await p.tap('.who');await p.tap('#ov-btn');}else{await p.click('.who');await p.click('#ov-btn');}
  await p.waitForFunction(()=>window.__modu.state().phase==='play'&&window.__modu.state().mode==='sandbox');await frame(p);
  const natural=await state(p);assert.ok(natural.streetDetails.slabs>0);assert.equal(natural.streetDetails.meshes,3);assert.ok(natural.streetDetails.lamps>0);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  report.states[`${device}Natural`]=natural;await p.screenshot({path:`${out}/${device}-01-natural.png`});
  const viewpoint=streetView(natural.streetPlacements??[]);
  const seed=await snapshot(p),saved=JSON.parse(seed.value);assert.equal(saved.status,'alive');
  await p.reload({waitUntil:'networkidle0',timeout:60000});await ready(p);await resume(p,mobile);
  const continued=await state(p);assert.deepEqual(continued.inventory,saved.inventory);assert.deepEqual(continued.stash,saved.stash);assert.deepEqual(continued.survivorSystems,saved.survivorSystems);
  report.states[`${device}Resumed`]=continued;report.checks.push(`${device}: real new-game controls, existing save creation and reload/resume, inventory/stash/dual-hand state retained; no horizontal overflow`);
  await p.screenshot({path:`${out}/${device}-02-natural-resumed.png`});await context.close();
  if(!mobile)for(const appearance of ['maintained','shuttered','weathered']){
    const view=facadeView(appearance),fixture=structuredClone(saved);fixture.elapsed=120;fixture.position=view.position;fixture.inShelter=false;
    const f=await init(`facade-${appearance}`,viewport,{key:seed.key,value:JSON.stringify(fixture)});await resume(f.p,false);
    await f.p.mouse.move(720,450);for(let i=0;i<5;i++){await f.p.mouse.wheel({deltaY:-100});await frame(f.p);}
    await f.p.waitForFunction(()=>window.__modu.state().streetZoom>1.6);await frame(f.p);
    const current=await state(f.p);assert.ok(Math.hypot(current.spawn[0]-view.position[0],current.spawn[1]-view.position[1])<.1,'facade fixture position restored unchanged');
    assert.equal(current.fadedBuildings.includes(view.buildingId),false,'target roof and facade must remain solid');
    assert.equal(current.cityMeshes.meshes,3,'city still uses fixed three batched meshes');assert.ok(current.cityMeshes.wallVertices>0&&current.cityMeshes.roofVertices>0);
    report.states[`facade${appearance}`]=current;
    report.fixtures.push({device:'desktop',label:`facade-${appearance}`,changedFields:{elapsed:120,position:view.position,inShelter:false},viewpoint:view,cityMeshes:current.cityMeshes,source:'isolated copy of natural test save, legitimate mouse-wheel zoom',warning:'authored appearance and clock/position fixture; not a claim that the real address is damaged, locked or has a finished interior'});
    await f.p.screenshot({path:`${out}/desktop-facade-${appearance}.png`});await f.context.close();
  }
  for(const [label,elapsed,expected] of [['noon',120,'白晝'],['midnight',480,'夜晚']]){
    const fixture=structuredClone(saved);fixture.elapsed=elapsed;fixture.position=viewpoint.position;fixture.inShelter=false;
    const f=await init(`${device}-fixture-${label}`,viewport,{key:seed.key,value:JSON.stringify(fixture)});
    await resume(f.p,mobile);await f.p.waitForFunction(stage=>window.__modu.state().dayNight.stage===stage,{},expected);await frame(f.p);
    const s=await state(f.p);assert.ok(Math.hypot(s.spawn[0]-viewpoint.position[0],s.spawn[1]-viewpoint.position[1])<.1,'fixture restore moved away from legal street viewpoint');assert.equal(s.dayNight.stage,expected);assert.ok(label==='noon'?s.dayNight.lamps===0:s.dayNight.lamps===1);
    assert.ok(Math.abs(s.dayNight.hour-(label==='noon'?12:0))<.3);assert.equal(s.streetDetails.meshes,3);
    report.states[`${device}Fixture${label}`]=s;
    report.fixtures.push({device,label,changedFields:{elapsed,position:viewpoint.position,inShelter:false},viewpoint,source:'natural test save copied into separate disposable browser context',warning:'clock and position fixture, not a naturally survived day/night cycle or live user save'});
    await f.p.screenshot({path:`${out}/${device}-fixture-${label}.png`});await f.context.close();
  }
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);assert.deepEqual(report.requestFailures,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;console.error(error);for(const [i,p] of (await browser.pages()).entries()){try{await p.screenshot({path:`${out}/failure-${i}.png`});await writeFile(`${out}/failure-${i}.json`,JSON.stringify(await p.evaluate(()=>({text:document.body.innerText,state:window.__modu?.state(),storage:{...localStorage}})),null,2));}catch{}}}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
