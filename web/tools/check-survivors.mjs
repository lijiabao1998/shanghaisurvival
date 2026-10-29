import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'],defaultViewport:{width:1280,height:800}});
try {
const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5178/survival.html?debug',{waitUntil:'networkidle0'});
await page.waitForFunction(()=>window.__modu);
assert.equal(await page.title(),'上海倖存者 · 天亮之前');
assert.equal(await page.$$eval('.who',x=>x.length),12);
await page.screenshot({path:'../docs/screenshots/survivors-menu.png'});
await page.click('.who');await page.click('#ov-btn');
let state=await page.evaluate(()=>__modu.state());assert.equal(state.phase,'play');assert.ok(state.factions.military>0&&state.factions.police>0&&state.factions.raider>0);
await page.keyboard.press('KeyC');assert.equal((await page.evaluate(()=>__modu.state())).sneaking,true);
await page.keyboard.press('Escape');const before=(await page.evaluate(()=>__modu.state())).timeLeft;await new Promise(r=>setTimeout(r,250));assert.equal((await page.evaluate(()=>__modu.state())).timeLeft,before);await page.keyboard.press('Escape');
await page.keyboard.press('KeyT');state=await page.evaluate(()=>__modu.state());assert.equal(state.inventory.water,2);assert.equal(state.inventory.food,0);
await page.keyboard.press('KeyR');assert.equal((await page.evaluate(()=>__modu.state())).phase,'play');
await page.evaluate(()=>__modu.outbreakTest(425,3,90));await page.keyboard.press('KeyR');assert.equal((await page.evaluate(()=>__modu.state())).phase,'play');
await page.evaluate(()=>__modu.outbreakTest(425,3,0));await page.screenshot({path:'../docs/screenshots/survivors-play.png'});await page.keyboard.press('KeyR');assert.equal((await page.evaluate(()=>__modu.state())).phase,'win');
await page.click('#ov-btn');state=await page.evaluate(()=>__modu.state());assert.equal(state.looted,0);assert.equal(state.outbreak.exposure,0);assert.equal(state.inventory.food,1);
await page.evaluate(()=>__modu.outbreakTest(481,3,0));await new Promise(r=>setTimeout(r,150));assert.equal((await page.evaluate(()=>__modu.state())).phase,'lose');
assert.deepEqual(errors,[]);console.log('PASS browser: menu, roster, factions, start, sneak, pause, trade, early/unsafe evacuation rejected, evacuation win, reset, timeout loss, no JS errors');
} finally {await browser.close();}
