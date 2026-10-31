/** True entry/controls; only target placement is debug arranged in disposable contexts. */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT??'../melee-evidence/browser',url=process.env.QA_URL??'http://127.0.0.1:4194/survival.html?debug=1';
await mkdir(out,{recursive:true});
const report={source:process.env.QA_SOURCE_SHA??'local-unrecorded',scope:'real game staged entry, disposable storage, debug-arranged target, native keyboard/touch; no production save',devices:[]};
let browser;
try {
 browser=await puppeteer.launch({executablePath:process.env.QA_BROWSER??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const [name,width,height,mobile] of [['desktop',1366,768,false],['phone',390,844,true],['small-phone',360,640,true],['landscape',844,390,true]]){
  const ctx=await browser.createBrowserContext(),p=await ctx.newPage(),r={name,width,height,errors:[],frames:[]};report.devices.push(r);
  await p.setViewport({width,height,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});p.on('pageerror',e=>r.errors.push(String(e)));
  const click=async s=>{const el=await p.waitForSelector(s,{visible:true});mobile?await el.tap():await el.click();};
  await p.goto(url,{waitUntil:'networkidle0',timeout:120000});await p.waitForFunction(()=>window.__modu&&document.querySelector('#overlay').dataset.selectionStep==='0');
  await click('#roster .who:not([hidden])');for(let i=0;i<3;i++)await click('#ov-btn');await p.waitForFunction(()=>window.__modu.state().phase==='play');
  const state=()=>p.evaluate(()=>window.__modu.state());
  if(mobile)await click('#survivor-touch-unarmed');else await p.keyboard.press('KeyX');assert.equal((await state()).unarmedStance,true);
  assert.equal(await p.evaluate(()=>window.__modu.combatFixture(.85)),true);
  await p.screenshot({path:`${out}/${name}-ready.png`});
  await p.evaluate(()=>{window.__qaFrames=[];window.__qaCapture=true;let last=performance.now();function frame(t){window.__qaFrames.push(t-last);last=t;if(window.__qaCapture)requestAnimationFrame(frame);}requestAnimationFrame(frame);});
  const c=await p.createCDPSession();const writes=[];
  c.on('Page.screencastFrame',e=>{c.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});const index=r.frames.length;r.frames.push({index,time:e.metadata.timestamp});writes.push(writeFile(`${out}/${name}-${String(index).padStart(4,'0')}.jpg`,Buffer.from(e.data,'base64')));});
  await c.send('Page.startScreencast',{format:'jpeg',quality:80,maxWidth:1366,maxHeight:844,everyNthFrame:1});
  if(mobile)await click('#survivor-touch-secondary');else await p.keyboard.press('KeyR');
  await p.waitForFunction(()=>window.__modu.state().combatTargets[0].hp<100);r.afterPunch=await state();assert.equal(r.afterPunch.swingHand,'left');
  await p.waitForFunction(()=>window.__modu.state().action==='none');
  if(mobile)await click('#survivor-touch-shove');else await p.keyboard.press('KeyQ');
  await new Promise(resolve=>setTimeout(resolve,4000));
  await c.send('Page.stopScreencast');await Promise.all(writes);await c.detach();
  r.frameMs=await p.evaluate(()=>{window.__qaCapture=false;return window.__qaFrames;});r.after=await state();
  r.fps=r.frameMs.length/(r.frameMs.reduce((a,b)=>a+b,0)/1000);assert.ok(r.frames.length>=3,'continuous actual rendered frames');assert.deepEqual(r.errors,[]);
  await p.screenshot({path:`${out}/${name}-after.png`});await ctx.close();r.status='passed';
 }
} catch(e){report.error=String(e.stack||e);process.exitCode=1;}
finally{await browser?.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
