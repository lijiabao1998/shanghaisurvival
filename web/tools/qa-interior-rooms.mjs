// Actual doorway/loot input test. Save fixtures place each isolated character outside the door;
// enemies are marked dead. This does NOT claim a natural walk from map spawn or combat balance QA.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT??'/tmp/shanghai-interior-evidence';await mkdir(out,{recursive:true});
const url=process.env.QA_URL??'http://127.0.0.1:4173/survival.html?debug';
const browser=await puppeteer.launch({executablePath:process.env.QA_BROWSER??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={scope:'candidate real input; isolated entrance-position/dead-enemy fixtures, NOT full spawn traversal',commit:process.env.GITHUB_SHA??'local',checks:[],errors:[],fixtures:[]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const state=p=>p.evaluate(()=>window.__modu.state());
async function saved(p){return p.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('shanghai-survivors:systems-v1:'));return key?{key,data:JSON.parse(localStorage.getItem(key))}:null;});}
async function resume(p,navigate=false){if(navigate)await p.goto(url,{waitUntil:'networkidle0'});else await p.reload({waitUntil:'networkidle0'});await p.waitForFunction(()=>window.__modu);let found=false;for(const b of await p.$$('#campaign-mode button'))if((await b.evaluate(e=>e.textContent)).includes('繼續')){await b.click();found=true;break;}assert.ok(found,'continue button exists');await p.waitForFunction(()=>window.__modu.state().phase==='play');}
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
async function holdLoot(p,mobile,expectedItem=null){
 await delay(200);
 const before=expectedItem?(await state(p)).inventory[expectedItem]:null;
 const held=()=>expectedItem?p.waitForFunction(({item,before})=>window.__modu.state().inventory[item]===before+1,{polling:'raf',timeout:30000},{item:expectedItem,before}):delay(1500);
 if(!mobile){try{await p.keyboard.down('KeyE');await held();}finally{await p.keyboard.up('KeyE');}return;}
 const button=await p.waitForSelector('#survivor-touch-action',{visible:true}),box=await button.boundingBox();assert.ok(box);
 const cdp=await p.createCDPSession();try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await held();}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
}
try{
 for(const mobile of [false,true]){
  const name=mobile?'mobile':'desktop',context=await browser.createBrowserContext(),p=await context.newPage();
  await p.setViewport(mobile?{width:390,height:844,isMobile:true,hasTouch:true}:{width:1440,height:900});p.on('pageerror',e=>report.errors.push(`${name}: ${e.message}`));
  await p.goto(url,{waitUntil:'networkidle0'});await p.waitForFunction(()=>window.__modu);await p.click('.who');await p.click('#ov-btn');await p.waitForFunction(()=>window.__modu.state().phase==='play');
  await p.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('shanghai-survivors:systems-v1:')));
  const baseline=await saved(p),rooms=(await state(p)).interiorRooms;assert.equal(rooms.length,3);
  for(let index=0;index<rooms.length;index++){
   const room=rooms[index],loot=room.loot[0],fixture=structuredClone(baseline.data);
   fixture.position=[...room.entrance.outside];fixture.inShelter=false;fixture.interiorLoot={};fixture.enemies=fixture.enemies.map(e=>({...e,hp:0,state:'dead'}));
   // Leave gameplay first: pagehide/visibilitychange deliberately persist even while paused.
   // A same-origin inert document retains storage access without patching the game's save handlers.
   const fixtureUrl=new URL('/__qa_interior_fixture__.html',url).href;
   const intercept=request=>request.url()===fixtureUrl?request.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Isolated QA fixture staging</title>'}):request.continue();
   await p.setRequestInterception(true);p.on('request',intercept);
   await p.goto(fixtureUrl,{waitUntil:'load'});p.off('request',intercept);await p.setRequestInterception(false);
   await p.evaluate(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:baseline.key,data:fixture});
   const fixtureEvidence={viewport:name,room:room.id,position:fixture.position,enemies:'all dead',origin:'natural new-game save; only position/inShelter/interiorLoot/enemies changed',staged:(await saved(p)).data.position};report.fixtures.push(fixtureEvidence);assert.deepEqual(fixtureEvidence.staged,fixture.position);
   await resume(p,true);const before=await state(p);fixtureEvidence.actual=before.spawn;fixtureEvidence.savedAfterResume=(await saved(p)).data.position;assert.deepEqual(fixtureEvidence.savedAfterResume,fixture.position,'no lifecycle handler overwrote staged fixture');assert.ok(Math.hypot(before.spawn[0]-fixture.position[0],before.spawn[1]-fixture.position[1])<.1,`fixture retained at real door outside: expected ${fixture.position}, actual ${before.spawn}`);
   await corridor(p,room.entrance.outside,room.entrance.inside);assert.equal((await state(p)).activeInterior,room.id,'walked naturally through real door');
   await corridor(p,room.entrance.inside,loot.position);assert.equal((await state(p)).inShelter,false,'ordinary room has no safehouse modal/teleport');
   await p.screenshot({path:`${out}/${name}-${index+1}-interior-before.png`});const amount=(await state(p)).inventory[loot.item];
   await holdLoot(p,mobile,loot.item);assert.equal((await state(p)).inventory[loot.item],amount+1,'exactly one room supply granted');
   let snapshot=await saved(p);assert.equal(snapshot.data.interiorLoot[loot.id],true);assert.equal(snapshot.data.containers.length,baseline.data.containers.length,'ordinary save indices/count unchanged');
   await p.screenshot({path:`${out}/${name}-${index+1}-looted.png`});
   await resume(p);assert.equal((await saved(p)).data.interiorLoot[loot.id],true);const count=(await state(p)).inventory[loot.item];await holdLoot(p,mobile);assert.equal((await state(p)).inventory[loot.item],count,'no repeated loot after reload');
   await corridor(p,loot.position,room.entrance.inside);await corridor(p,room.entrance.inside,room.entrance.outside);assert.equal((await state(p)).activeInterior,null,'walked back outside');
   await p.screenshot({path:`${out}/${name}-${index+1}-outside-after.png`});
   report.checks.push({viewport:name,room:room.id,item:loot.item,input:mobile?'actual touch joystick doorway traversal + touch crouch + CDP touch hold on action button':'keyboard doorway traversal + held E',entry:true,lootOnce:true,reloadDepleted:true,exit:true});
  }
  await context.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;process.exitCode=1;console.error(error);for(const [i,p] of(await browser.pages()).entries())try{await p.screenshot({path:`${out}/failure-${i}.png`});await writeFile(`${out}/failure-${i}.txt`,await p.evaluate(()=>document.body.innerText));}catch{}}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
