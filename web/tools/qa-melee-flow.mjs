/** Local browser evidence. Debug fixtures arrange combat only; all strikes use real controls. */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT??'/tmp/melee-flow-evidence';await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.QA_BROWSER??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const url=process.env.QA_URL??'http://127.0.0.1:4187/survival.html?debug';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const report={commit:process.env.GITHUB_SHA??'local',scope:'local candidate only, debug-arranged targets; real keyboard and touch attack inputs',checks:[],frames:[],errors:[],fixtures:[]};
const state=p=>p.evaluate(()=>window.__modu.state());
async function init(viewport){const context=await browser.createBrowserContext(),p=await context.newPage();await p.setViewport(viewport);p.on('pageerror',e=>report.errors.push(e.message));await p.goto(url,{waitUntil:'networkidle0'});await p.waitForFunction(()=>window.__modu);await p.click('.who');await p.click('#ov-btn');await p.waitForFunction(()=>window.__modu.state().phase==='play');return p;}
async function frame(p,name){const s=await state(p);report.frames.push({name,time:Date.now(),state:s});await p.screenshot({path:`${out}/${name}.png`});return s;}
async function record(p,prefix,ms=6500){
 const c=await p.createCDPSession();let i=0;const pending=[];
 c.on('Page.screencastFrame',event=>{
  const index=i++,name=`${prefix}-${String(index).padStart(3,'0')}`;
  // Acknowledge immediately: capture never serially pauses the animation loop.
  c.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
  pending.push((async()=>{const time=Date.now();const snapshot=await state(p);report.frames.push({name,ext:'jpg',time,captureTime:event.metadata.timestamp,state:snapshot});await writeFile(`${out}/${name}.jpg`,Buffer.from(event.data,'base64'));})());
 });
 await c.send('Page.startScreencast',{format:'jpeg',quality:85,maxWidth:1280,maxHeight:800,everyNthFrame:1});
 await wait(ms);await c.send('Page.stopScreencast');await Promise.all(pending);await c.detach();assert.ok(i>=3,'at least three real rendered frames');
}
async function assertHealthySave(p,label){
 await p.evaluate(()=>dispatchEvent(new Event('pagehide')));await wait(350);
 const text=await p.$eval('#radio',e=>e.textContent);assert.ok(!text.includes('存檔失敗'),`${label} fixture must produce a valid autosave`);
 report.saveChecks??=[];report.saveChecks.push({label,text});
}
async function checkCombatLayout(p,label){
 const geometry=await p.evaluate(()=>{
  const box=selector=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,visible:c.display!=='none'&&c.visibility!=='hidden'&&r.width>0&&r.height>0,text:e.textContent,font:parseFloat(c.fontSize)};};
  const controls=['#survivor-touch-menu','#survivor-touch-bag','#survivor-touch-action','#survivor-touch-crouch','#survivor-joystick'].map(selector=>{const b=box(selector);const e=b&&document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {selector,...b,reachable:!!e?.closest(selector)};});
  return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,panels:['#hud','#dispatch'].map(selector=>({selector,...box(selector)})),bars:['#bar-hp','#bar-sta','#bar-bat'].map(selector=>({selector,...box(selector)})),who:box('#who'),radio:box('#radio'),controls};
 });
 report.layouts??=[];report.layouts.push({label,...geometry});assert.equal(geometry.overflow,false,`${label} no document overflow`);
 const cx=geometry.width/2,cy=geometry.height/2,halfWidth=geometry.width<600?65:80,halfHeight=55;
 for(const r of geometry.panels)if(r.visible)assert.ok(r.x+r.width<=cx-halfWidth||r.x>=cx+halfWidth||r.y+r.height<=cy-halfHeight||r.y>=cy+halfHeight,`${label} ${r.selector} must leave central combat rectangle clear`);
 for(const b of geometry.bars)assert.ok(b.visible&&b.width>0&&b.height>0,`${label} ${b.selector} remains visible`);
 for(const b of geometry.controls)assert.ok(b.visible&&b.reachable&&b.x>=0&&b.y>=0&&b.x+b.width<=geometry.width+1&&b.y+b.height<=geometry.height+1,`${label} ${b.selector} remains reachable on screen`);
 return geometry;
}
async function equipment(p,primary,secondary){await p.keyboard.press('Tab');await p.click('#survivor-kit-tab-equipment');if(await p.$('[data-focus-key="unequip-secondary"]'))await p.click('[data-focus-key="unequip-secondary"]');await p.click(`[data-focus-key="primary-${primary}"]`);if(secondary)await p.click(`[data-focus-key="secondary-${secondary}"]`);await p.keyboard.press('Escape');}
try{
 let p=await init({width:1280,height:800,deviceScaleFactor:1});
 // Avoid pointer aiming while keyboard J uses the target's arranged facing.
 for(let i=0;i<9;i++)await p.mouse.wheel({deltaY:-100});
 await frame(p,'00-desktop-ready');
 // Implemented by the game only behind ?debug. The isolated browser context has its own local QA autosave.
 assert.equal(await p.evaluate(()=>typeof window.__modu.combatFixture),'function','debug combatFixture required');
 assert.equal(await p.evaluate(()=>window.__modu.combatFixture()),true);report.fixtures.push('combatFixture: debug-only sparring removes unrelated enemies without awarding kills; arranges one target with delayed attacks in clear space');await assertHealthySave(p,'desktop fixture');
 await (await p.createCDPSession()).send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:400,button:'left',clickCount:1});
 await record(p,'desktop-strike',9000);
 await (await p.createCDPSession()).send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button:'left',clickCount:1});await wait(1000);
 report.desktopAfter=await state(p);
 const desktopFrames=report.frames.filter(f=>f.name.startsWith('desktop-strike-'));
 assert.ok(desktopFrames.some(f=>f.state.combatTargets[0].hp<=55),'real desktop strike must reduce fixture HP');
 assert.ok(desktopFrames.some(f=>f.state.swingStroke===1),'held attack must chain to reverse stroke');
 assert.ok(report.desktopAfter.swingCount>=2);
 report.checks.push('Actual browser target HP falls 100→55 or lower; held attacks produce reverse stroke');
 report.checks.push('Desktop real held mouse attack input recorded using nonblocking CDP screencast frames');
 // Separate continuous walking/attack record: same real keyboard controls, no
 // animation-clock manipulation or synthetic pose sequence.
 await p.evaluate(()=>window.__modu.combatFixture());
 const movingBefore=await state(p);
 await p.keyboard.down('KeyD'); await p.keyboard.down('KeyJ');
 await record(p,'moving-strike',5500);
 await p.keyboard.up('KeyJ'); await p.keyboard.up('KeyD');
 const movingAfter=await state(p);
 report.motion={before:movingBefore,after:movingAfter};
 assert.ok(Math.hypot(movingAfter.spawn[0]-movingBefore.spawn[0],movingAfter.spawn[1]-movingBefore.spawn[1])>.1,'held attack allows collision-checked combat steps');
 report.checks.push('Continuous real moving+attack inputs recorded separately from stationary target HP verification');

 await p.close();p=await init({width:1280,height:800,deviceScaleFactor:1});
 await p.evaluate(()=>window.__modu.give('pistol'));await equipment(p,'qsz92-9','pipe');
 assert.equal(await p.evaluate(()=>window.__modu.combatFixture()),true);await assertHealthySave(p,'offhand fixture');const beforeOff=await state(p);await p.keyboard.press('KeyR');await wait(100);const off=await frame(p,'20-left-pipe');assert.equal(off.swingHand,'left');assert.equal(off.arsenal.rounds['9mm'],beforeOff.arsenal.rounds['9mm']);await wait(800);assert.ok((await state(p)).combatTargets[0].hp<=55,'left-hand strike actually damages target');
 await p.keyboard.press('Tab');assert.equal((await state(p)).bagOpen,true);const n=(await state(p)).swingCount;await p.keyboard.press('KeyR');await wait(300);assert.equal((await state(p)).swingCount,n);await p.keyboard.press('Escape');
 await p.keyboard.press('Escape');assert.equal((await state(p)).paused,true);await p.keyboard.press('KeyJ');await wait(200);assert.equal((await state(p)).swingCount,n);await p.keyboard.press('Escape');
 report.checks.push('Offhand pipe animates left and spends no pistol ammunition; bag/pause block attack');
 await p.reload({waitUntil:'networkidle0'});const resume=await p.$('#campaign-mode button');if(resume){for(const b of await p.$$('#campaign-mode button')){if((await b.evaluate(e=>e.textContent)).includes('繼續')){await b.click();break;}}await p.waitForFunction(()=>window.__modu.state().phase==='play');assert.equal((await state(p)).survivorSystems.hands.secondary,'pipe');report.checks.push('Saved dual-hand equipment survives reload');}
 const mobile=await init({width:844,height:390,isMobile:true,hasTouch:true});
 await checkCombatLayout(mobile,'844x390 landscape');
 // Use observed travel rather than assuming real time equals simulated time on software GPU.
 assert.equal(await mobile.evaluate(()=>window.__modu.combatFixture()),true);
 const mobileOrigin=(await state(mobile)).spawn;const joy=await (await mobile.$('#survivor-joystick')).boundingBox();const moveClient=await mobile.createCDPSession();
 const center={x:joy.x+joy.width/2,y:joy.y+joy.height/2};let heading=-Math.PI/2;let walked=false;
 await moveClient.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[center]});
 for(let attempt=0;attempt<20;attempt++){
  const before=(await state(mobile)).spawn;
  await moveClient.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:center.x+Math.cos(heading)*48,y:center.y+Math.sin(heading)*48}]});
  await wait(1500);const after=(await state(mobile)).spawn;
  report.mobileTravel??=[];report.mobileTravel.push({before,after,heading});
  if(Math.hypot(after[0]-mobileOrigin[0],after[1]-mobileOrigin[1])>6){walked=true;break;}
  if(Math.hypot(after[0]-before[0],after[1]-before[1])<.2)heading+=Math.PI/2;
 }
 await moveClient.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok(walked,'naturally walk away from contextual helper first');
 assert.equal(await mobile.evaluate(()=>window.__modu.combatFixture()),true);
 await assertHealthySave(mobile,'mobile fixture after travel');
 const box=await (await mobile.$('#survivor-touch-action')).boundingBox();const client=await mobile.createCDPSession();
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
 await record(mobile,'mobile-strike',6500);
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(1000);assert.equal((await state(mobile)).touchActionHeld,false);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await wait(70);await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await wait(1000);assert.equal((await state(mobile)).touchActionHeld,false);
 assert.ok(report.frames.filter(f=>f.name.startsWith('mobile-strike-')).some(f=>f.state.combatTargets[0].hp<=55),'real touch strike must damage fixture target');
 report.checks.push('Real emulated touch hold/end/cancel; chronological mobile motion frames');
 await mobile.tap('#survivor-touch-menu');assert.equal((await state(mobile)).paused,true);await mobile.tap('#survivor-touch-menu');assert.equal((await state(mobile)).paused,false);
 await mobile.tap('#survivor-touch-bag');assert.equal((await state(mobile)).bagOpen,true);await mobile.tap('.survivor-kit__close');assert.equal((await state(mobile)).bagOpen,false);
 await mobile.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await wait(200);
 const portrait=await mobile.evaluate(()=>{const visible=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return getComputedStyle(e).display!=='none'&&r.width>0&&r.height>0;};return {overflow:document.documentElement.scrollWidth>innerWidth,who:visible('#who'),radio:visible('#radio'),hp:visible('#bar-hp'),stamina:visible('#bar-sta'),battery:visible('#bar-bat')};});
 assert.deepEqual(portrait,{overflow:false,who:true,radio:true,hp:true,stamina:true,battery:true});report.portrait=portrait;await frame(mobile,'30-mobile-portrait-restored');
 await mobile.setViewport({width:568,height:320,isMobile:true,hasTouch:true});await wait(200);await checkCombatLayout(mobile,'568x320 landscape');await frame(mobile,'31-mobile-small-landscape');
 await mobile.setViewport({width:844,height:390,isMobile:true,hasTouch:true});await wait(200);await checkCombatLayout(mobile,'844x390 rotated back');await frame(mobile,'32-mobile-landscape-clear');
 report.checks.push('Landscape HUD leaves central combat area clear at 844x390 and568x320; all touch controls reachable; real pause/bag work; portrait restores full HUD without overflow');
 // Isolated storage failure must be visible, not mistaken for decorative radio text.
 await mobile.evaluate(()=>{window.__qaStorageSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('QA simulated full storage','QuotaExceededError');};dispatchEvent(new Event('pagehide'));});
 try{
  await mobile.waitForFunction(()=>{const e=document.querySelector('#radio');return e.classList.contains('critical')&&e.textContent.includes('存檔失敗')&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0;});
  await checkCombatLayout(mobile,'844x390 critical save warning');await frame(mobile,'33-mobile-storage-warning');
  await mobile.setViewport({width:568,height:320,isMobile:true,hasTouch:true});await wait(200);await checkCombatLayout(mobile,'568x320 critical save warning');await frame(mobile,'34-mobile-small-storage-warning');
 }finally{await mobile.evaluate(()=>{Storage.prototype.setItem=window.__qaStorageSetItem;delete window.__qaStorageSetItem;dispatchEvent(new Event('pagehide'));});}
 await mobile.waitForFunction(()=>!document.querySelector('#radio').classList.contains('critical'));await assertHealthySave(mobile,'storage recovered');
 report.checks.push('Valid fixture autosaves; simulated storage failure stays visible as critical right-column warning in both landscape sizes, then clears after recovery');

 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.failure=e.stack;console.error(e);process.exitCode=1;for(const [i,p] of (await browser.pages()).entries()){try{await p.screenshot({path:`${out}/failure-${i}.png`});}catch{}}}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
