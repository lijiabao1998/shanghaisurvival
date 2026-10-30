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
async function equipment(p,primary,secondary){await p.keyboard.press('Tab');await p.click('#survivor-kit-tab-equipment');if(await p.$('[data-focus-key="unequip-secondary"]'))await p.click('[data-focus-key="unequip-secondary"]');await p.click(`[data-focus-key="primary-${primary}"]`);if(secondary)await p.click(`[data-focus-key="secondary-${secondary}"]`);await p.keyboard.press('Escape');}
try{
 let p=await init({width:1280,height:800,deviceScaleFactor:1});
 // Avoid pointer aiming while keyboard J uses the target's arranged facing.
 for(let i=0;i<9;i++)await p.mouse.wheel({deltaY:-100});
 await frame(p,'00-desktop-ready');
 // Implemented by the game only behind ?debug. The isolated browser context has its own local QA autosave.
 assert.equal(await p.evaluate(()=>typeof window.__modu.combatFixture),'function','debug combatFixture required');
 assert.equal(await p.evaluate(()=>window.__modu.combatFixture()),true);report.fixtures.push('combatFixture: debug-only sparring removes unrelated enemies without awarding kills; arranges one target with delayed attacks in clear space');
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
 await p.close();p=await init({width:1280,height:800,deviceScaleFactor:1});
 await p.evaluate(()=>window.__modu.give('pistol'));await equipment(p,'qsz92-9','pipe');
 assert.equal(await p.evaluate(()=>window.__modu.combatFixture()),true);const beforeOff=await state(p);await p.keyboard.press('KeyR');await wait(100);const off=await frame(p,'20-left-pipe');assert.equal(off.swingHand,'left');assert.equal(off.arsenal.rounds['9mm'],beforeOff.arsenal.rounds['9mm']);await wait(800);assert.ok((await state(p)).combatTargets[0].hp<=55,'left-hand strike actually damages target');
 await p.keyboard.press('Tab');assert.equal((await state(p)).bagOpen,true);const n=(await state(p)).swingCount;await p.keyboard.press('KeyR');await wait(300);assert.equal((await state(p)).swingCount,n);await p.keyboard.press('Escape');
 await p.keyboard.press('Escape');assert.equal((await state(p)).paused,true);await p.keyboard.press('KeyJ');await wait(200);assert.equal((await state(p)).swingCount,n);await p.keyboard.press('Escape');
 report.checks.push('Offhand pipe animates left and spends no pistol ammunition; bag/pause block attack');
 await p.reload({waitUntil:'networkidle0'});const resume=await p.$('#campaign-mode button');if(resume){for(const b of await p.$$('#campaign-mode button')){if((await b.evaluate(e=>e.textContent)).includes('繼續')){await b.click();break;}}await p.waitForFunction(()=>window.__modu.state().phase==='play');assert.equal((await state(p)).survivorSystems.hands.secondary,'pipe');report.checks.push('Saved dual-hand equipment survives reload');}
 const mobile=await init({width:844,height:390,isMobile:true,hasTouch:true});
 const mobileOrigin=(await state(mobile)).spawn;const joy=await (await mobile.$('#survivor-joystick')).boundingBox();const moveClient=await mobile.createCDPSession();
 await moveClient.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:joy.x+joy.width/2,y:joy.y+joy.height/2}]});
 await moveClient.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:joy.x+joy.width/2,y:joy.y+3}]});await wait(3000);await moveClient.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const moved=(await state(mobile)).spawn;assert.ok(Math.hypot(moved[0]-mobileOrigin[0],moved[1]-mobileOrigin[1])>5,'move away from contextual helper first');
 assert.equal(await mobile.evaluate(()=>window.__modu.combatFixture()),true);
 const box=await (await mobile.$('#survivor-touch-action')).boundingBox();const client=await mobile.createCDPSession();
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
 await record(mobile,'mobile-strike',6500);
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(1000);assert.equal((await state(mobile)).touchActionHeld,false);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await wait(70);await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await wait(1000);assert.equal((await state(mobile)).touchActionHeld,false);
 assert.ok(report.frames.filter(f=>f.name.startsWith('mobile-strike-')).some(f=>f.state.combatTargets[0].hp<=55),'real touch strike must damage fixture target');
 report.checks.push('Real emulated touch hold/end/cancel; chronological mobile motion frames');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.failure=e.stack;console.error(e);process.exitCode=1;for(const [i,p] of (await browser.pages()).entries()){try{await p.screenshot({path:`${out}/failure-${i}.png`});}catch{}}}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
