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
async function resume(p){await p.reload({waitUntil:'networkidle0'});await p.waitForFunction(()=>window.__modu);let found=false;for(const b of await p.$$('#campaign-mode button'))if((await b.evaluate(e=>e.textContent)).includes('繼續')){await b.click();found=true;break;}assert.ok(found,'continue button exists');await p.waitForFunction(()=>window.__modu.state().phase==='play');}
async function moveTo(p,target){
 const started=Date.now();let unchanged=0,last=null;
 while(Date.now()-started<25000){
  const at=(await state(p)).spawn,dx=target[0]-at[0],dz=target[1]-at[1];if(Math.hypot(dx,dz)<.16)return;
  const axis=Math.abs(dx)>Math.abs(dz)?0:1,delta=axis===0?dx:dz;
  const keys=axis===0?(delta>0?['KeyD','KeyS']:['KeyA','KeyW']):(delta>0?['KeyW','KeyD']:['KeyA','KeyS']);
  if(last&&Math.hypot(at[0]-last[0],at[1]-last[1])<.005)unchanged++;else unchanged=0;
  assert.ok(unchanged<25,`movement stalled at ${at}, target ${target}`);last=at;
  try{for(const k of keys)await p.keyboard.down(k);await delay(25);}finally{for(const k of keys)await p.keyboard.up(k);}
 }
 throw new Error(`Doorway walk timed out toward ${target}; at ${(await state(p)).spawn}`);
}
async function corridor(p,from,to){const length=Math.hypot(to[0]-from[0],to[1]-from[1]),n=Math.ceil(length/.3);for(let i=1;i<=n;i++)await moveTo(p,[from[0]+(to[0]-from[0])*i/n,from[1]+(to[1]-from[1])*i/n]);}
async function holdLoot(p,mobile){
 await delay(200);
 if(!mobile){try{await p.keyboard.down('KeyE');await delay(4000);}finally{await p.keyboard.up('KeyE');}return;}
 const button=await p.waitForSelector('#survivor-touch-action',{visible:true}),box=await button.boundingBox();assert.ok(box);
 const cdp=await p.createCDPSession();try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await delay(4000);}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
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
   // Pause before fixture injection to prevent the old run's periodic save racing the fixture.
   await p.keyboard.press('Escape');assert.equal((await state(p)).paused,true);
   await p.evaluate(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:baseline.key,data:fixture});
   report.fixtures.push({viewport:name,room:room.id,position:fixture.position,enemies:'all dead',origin:'natural new-game save; only position/inShelter/interiorLoot/enemies changed'});
   await resume(p);const before=await state(p);assert.ok(Math.hypot(before.spawn[0]-fixture.position[0],before.spawn[1]-fixture.position[1])<.1,'fixture retained at real door outside');
   await corridor(p,room.entrance.outside,room.entrance.inside);assert.equal((await state(p)).activeInterior,room.id,'walked naturally through real door');
   await corridor(p,room.entrance.inside,loot.position);assert.equal((await state(p)).inShelter,false,'ordinary room has no safehouse modal/teleport');
   await p.screenshot({path:`${out}/${name}-${index+1}-interior-before.png`});const amount=(await state(p)).inventory[loot.item];
   await holdLoot(p,mobile);assert.equal((await state(p)).inventory[loot.item],amount+1,'exactly one room supply granted');
   let snapshot=await saved(p);assert.equal(snapshot.data.interiorLoot[loot.id],true);assert.equal(snapshot.data.containers.length,baseline.data.containers.length,'ordinary save indices/count unchanged');
   await p.screenshot({path:`${out}/${name}-${index+1}-looted.png`});
   await resume(p);assert.equal((await saved(p)).data.interiorLoot[loot.id],true);const count=(await state(p)).inventory[loot.item];await holdLoot(p,mobile);assert.equal((await state(p)).inventory[loot.item],count,'no repeated loot after reload');
   await corridor(p,loot.position,room.entrance.inside);await corridor(p,room.entrance.inside,room.entrance.outside);assert.equal((await state(p)).activeInterior,null,'walked back outside');
   await p.screenshot({path:`${out}/${name}-${index+1}-outside-after.png`});
   report.checks.push({viewport:name,room:room.id,item:loot.item,input:mobile?'keyboard doorway traversal + actual CDP touch hold on action button':'keyboard doorway traversal + held E',entry:true,lootOnce:true,reloadDepleted:true,exit:true});
  }
  await context.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;process.exitCode=1;console.error(error);for(const [i,p] of(await browser.pages()).entries())try{await p.screenshot({path:`${out}/failure-${i}.png`});await writeFile(`${out}/failure-${i}.txt`,await p.evaluate(()=>document.body.innerText));}catch{}}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
