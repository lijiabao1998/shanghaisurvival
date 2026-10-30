import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.env.EVIDENCE_DIR||'../selection-evidence';await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const url=process.env.QA_URL||'http://127.0.0.1:4193/survival.html?debug';
const report={checks:[],errors:[]};
try {
for(const [device,width,height] of [['desktop',1440,900],['mobile',390,844]]){
 const context=await browser.createBrowserContext();const page=await context.newPage();await page.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.setRequestInterception(true);let release;
 const gate=r=>{if(r.url().includes('/data/'))release=()=>r.continue();else r.continue();};page.on('request',gate);
 const nav=page.goto(url,{waitUntil:'domcontentloaded'});await nav;
 await page.waitForSelector('#entry-loading:not([hidden])');await page.screenshot({path:`${output}/${device}-loading.png`});
 for(let i=0;!release&&i<200;i++)await new Promise(r=>setTimeout(r,50));assert.ok(release,'data request was observed');release();
 await page.waitForSelector('#entry-loading[hidden]',{timeout:90000});
 assert.equal(await page.$$eval('.who',els=>els.length),12);
 assert.ok(await page.$eval('#overlay',e=>e.scrollWidth<=e.clientWidth+1),'menu does not overflow horizontally');
 assert.ok(await page.$eval('#overlay .card',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),'card fits viewport');
 await page.click('[data-category=care]');assert.equal(await page.$$eval('.who:not([hidden])',els=>els.length),4);
 await page.click('[data-character=nurse]');assert.ok(await page.$$eval('.who:not([hidden])',els=>els.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})),'all visible role cards inside viewport');await page.screenshot({path:`${output}/${device}-roles.png`,fullPage:true});
 await page.click('#ov-btn');assert.equal(await page.$eval('#overlay',e=>e.dataset.selectionStep),'1');
 await page.click('#ov-btn');assert.equal(await page.$eval('#overlay',e=>e.dataset.selectionStep),'2');
 await page.screenshot({path:`${output}/${device}-confirm.png`,fullPage:true});
 await page.click('#selection-back');await page.click('#selection-back');assert.equal(await page.$eval('[data-character=nurse]',e=>e.getAttribute('aria-pressed')),'true');
 assert.equal(await page.evaluate(()=>localStorage.length),0,'navigation alone must not save');
 await page.click('#ov-btn');await page.click('#ov-btn');await page.click('#ov-btn');
 await page.waitForFunction(()=>window.__modu?.state().phase==='play'&&document.querySelector('#entry-loading').hidden,{timeout:90000});
 assert.equal(await page.$eval('#who-name',e=>e.textContent),'小林');
 await page.screenshot({path:`${output}/${device}-new-game.png`});
 page.off('request',gate);await page.setRequestInterception(false);await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#entry-loading[hidden]',{timeout:90000});
 await page.click('#resume-existing button');await page.waitForFunction(()=>window.__modu?.state().phase==='play'&&document.querySelector('#entry-loading').hidden,{timeout:90000});
 assert.equal(await page.$eval('#who-name',e=>e.textContent),'小林');
 report.checks.push(`${device}: real pending-data loader, category 4/12, three stages, back retains selection, no pre-start save, new game and resume`);await context.close();
}
const page=await browser.newPage();await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/data/')?r.respond({status:503,body:'unavailable'}):r.continue());await page.goto(url);await page.waitForSelector('#entry-loading.failed');assert.equal(await page.$eval('.entry-mark i',e=>getComputedStyle(e).animationName),'none');assert.equal(await page.$eval('#entry-retry',e=>e.hidden),false);await page.screenshot({path:`${output}/failure-retry.png`});report.checks.push('503 has visible failure/retry, reduced motion disables animation');assert.deepEqual(report.errors,[]);
}finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(report);
