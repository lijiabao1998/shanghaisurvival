/** Real Chromium, four isolated contexts. No debug start/teleport or production storage. */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.QA_URL??'http://127.0.0.1:4173/survival.html?debug=1',out=process.env.QA_OUTPUT??'evidence/menu';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.QA_BROWSER??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const report={source:process.env.QA_SOURCE_SHA??'local-unrecorded',url:base,devices:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 for(const [name,width,height,mobile] of [['desktop',1366,768,false],['phone',390,844,true],['small-phone',360,640,true],['landscape',844,390,true]]){
  const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[],httpErrors=[];
  await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))httpErrors.push([r.status(),r.url()]);});
  const state=()=>page.evaluate(()=>window.__modu.state());
  const click=async selector=>{const e=await page.waitForSelector(selector,{visible:true,timeout:45000});if(mobile)await e.tap();else await e.click();};
  const shot=async label=>page.screenshot({path:`${out}/${name}-${label}.png`});
  await page.goto(base,{waitUntil:'networkidle0',timeout:60000});await page.waitForFunction(()=>window.__modu&&document.querySelector('#overlay').dataset.selectionStep==='0');
  assert.equal(await page.$$eval('#roster .who',els=>els.filter(e=>!e.hidden).length),4);
  await shot('01-characters');
  await click('#title-settings-button');await page.waitForFunction(()=>!document.querySelector('#game-settings-dialog').hidden);
  assert.equal(await page.$eval('#settings-return',e=>e.hidden),true);
  await page.select('#settings-language','en');
  await page.focus('#settings-volume');await page.keyboard.press('Home');for(let i=0;i<37;i++)await page.keyboard.press('ArrowRight');
  await shot('02-title-settings');await click('#settings-resume');
  assert.equal(await page.$$eval('#game-settings-dialog',e=>e.length),1,'shared title/play settings');
  await page.focus('#title-settings-button');await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement.id),'title-settings-button','title Tab must not be swallowed by game');
  await click('#roster .who:not([hidden])');await click('#ov-btn');assert.equal(await page.$eval('#overlay',e=>e.dataset.selectionStep),'1');await click('#ov-btn');assert.equal(await page.$eval('#overlay',e=>e.dataset.selectionStep),'2');
  await shot('03-departure');await click('#ov-btn');await page.waitForFunction(()=>window.__modu.state().phase==='play');
  const first=await state();assert.equal(first.preferences.volume,.37);assert.equal(first.preferences.language,'en');
  let joystick=null;
  if(mobile){joystick=await page.$eval('#survivor-joystick',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:innerHeight-r.bottom};});assert.ok(joystick.bottom>20);assert.ok(joystick.y>height*.35);await page.touchscreen.touchStart(joystick.x+joystick.width*.5,joystick.y+joystick.height*.5);await page.touchscreen.touchMove(joystick.x+joystick.width*.8,joystick.y+joystick.height*.5);}else await page.keyboard.down('d');
  await pause(130);await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__modu.state().input.settingsOpen);if(mobile)await page.touchscreen.touchEnd();else await page.keyboard.up('d');
  const frozen=await state();assert.equal(frozen.paused,true);assert.deepEqual(frozen.input.heldKeys,[]);assert.equal(frozen.attackHeld,false);assert.equal(frozen.touchActionHeld,false);await pause(220);assert.deepEqual((await state()).spawn,frozen.spawn);
  await shot('04-paused');await click('#settings-resume');await page.waitForFunction(()=>!window.__modu.state().paused);await shot('05-game');
  if(mobile)await click('#survivor-touch-menu');else await click('#game-settings-button');await page.waitForFunction(()=>window.__modu.state().input.settingsOpen);
  await click('#settings-return');await page.waitForFunction(()=>window.__modu?.state().phase==='menu'&&!!document.querySelector('#campaign-resume'),{timeout:45000});
  const savedBefore=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('shanghai-survivors:')).map(k=>[k,localStorage.getItem(k)])));
  await click('#roster .who:not([hidden])');await click('#ov-btn');await click('#ov-btn');await click('.selection-overwrite input');
  page.once('dialog',d=>d.dismiss());await click('#ov-btn');await pause(120);
  assert.equal(await page.$eval('#overlay',e=>e.dataset.selectionStep),'2');assert.ok(await page.$('#shanghai-selection'));
  assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('shanghai-survivors:')).map(k=>[k,localStorage.getItem(k)]))),savedBefore,'cancel must not write save');
  await shot('06-cancel-keeps-step');await click('#campaign-resume');await page.waitForFunction(()=>window.__modu.state().phase==='play');
  const resumed=await state();assert.equal(resumed.worldLayout,first.worldLayout);assert.deepEqual(resumed.inventory,first.inventory);
  await page.keyboard.press('Escape');await shot('07-resumed-settings');
  assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);
  report.devices.push({name,width,height,joystick,firstBudget:first.renderBudget,resumedBudget:resumed.renderBudget,errors,httpErrors,passed:true});
  await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await context.close();
 }
}finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
