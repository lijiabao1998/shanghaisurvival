import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT??'/tmp/shanghai-weapons';await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.QA_BROWSER??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={checks:[],errors:[],scope:'Natural UI acquisition; debug state and route are read-only. No grant/teleport/loot fixtures.'};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const p=await browser.newPage();p.on('pageerror',e=>report.errors.push(e.message));const state=()=>p.evaluate(()=>window.__modu.state());
async function clickText(selector,text){for(const b of await p.$$(selector)){if((await b.evaluate(e=>e.textContent)).includes(text)){await b.click();return;}}throw Error('Missing '+text);}
try {
 await p.setViewport({width:1440,height:900});await p.goto(process.env.QA_URL??'http://127.0.0.1:4193/survival.html?debug',{waitUntil:'networkidle0'});await p.waitForFunction(()=>window.__modu);await p.click('.who');await p.click('#ov-btn');await p.waitForFunction(()=>window.__modu.state().phase==='play');
 let s=await state();assert.equal(s.arsenal.owned.length,0);
 const sites=s.searchSites.filter(c=>c.weapon&&!c.looted).sort((a,b)=>Math.hypot(a.x-s.spawn[0],a.z-s.spawn[1])-Math.hypot(b.x-s.spawn[0],b.z-s.spawn[1]));
 let site,path;for(const candidate of sites){const route=await p.evaluate(c=>window.__modu.route(c.x,c.z),candidate);if(route.length){site=candidate;path=route;break;}}assert.ok(site,'reachable guaranteed weapon site');
 const directions=[['KeyD','KeyS'],['KeyD'],['KeyD','KeyW'],['KeyW'],['KeyA','KeyW'],['KeyA'],['KeyA','KeyS'],['KeyS']];
 for(const waypoint of path){for(let n=0;n<300;n++){s=await state();assert.equal(s.phase,'play');const dx=waypoint.x-s.spawn[0],dz=waypoint.z-s.spawn[1];if(Math.hypot(dx,dz)<.55)break;const index=(Math.round(Math.atan2(dz,dx)/(Math.PI/4))+8)%8;for(const key of directions[index])await p.keyboard.down(key);await delay(70);for(const key of directions[index])await p.keyboard.up(key);if(n===299)throw Error('Natural navigation stalled');}}
 await p.keyboard.down('KeyE');await p.waitForFunction(id=>window.__modu.state().arsenal.owned.includes(id),{timeout:12000},site.weapon);await p.keyboard.up('KeyE');s=await state();const calibre=s.arsenal.rounds['9mm']?'9mm':'5.8-rifle';assert.equal(s.arsenal.rounds[calibre],6);assert.equal(s.searchSites.find(c=>c.x===site.x&&c.z===site.z).looted,true);report.checks.push('Natural WASD walk and held E yields a guaranteed gun and exactly six matching rounds');
 await p.screenshot({path:`${out}/01-natural-acquisition.png`});await p.keyboard.press('Tab');await p.click('#survivor-kit-tab-equipment');await p.click(`[data-focus-key="primary-${site.weapon}"]`);assert.equal((await state()).arsenal.equipped,site.weapon);await p.screenshot({path:`${out}/02-equipped.png`});await p.keyboard.press('Escape');
 await p.keyboard.press('KeyG');await p.waitForFunction(c=>window.__modu.state().arsenal.rounds[c]===5,{timeout:3000},calibre);report.checks.push('Acquired gun equipped through inventory; G consumes exactly one matching round');
 await delay(3300);await p.reload({waitUntil:'networkidle0'});await clickText('#campaign-mode button','繼續');await p.waitForFunction(()=>window.__modu.state().phase==='play');s=await state();assert.equal(s.arsenal.equipped,site.weapon);assert.equal(s.arsenal.rounds[calibre],5);assert.equal(s.searchSites.find(c=>c.x===site.x&&c.z===site.z).looted,true);report.checks.push('Reload/resume preserves gun, equipment, five rounds and exhausted original site');
 await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await p.keyboard.press('Tab');await p.click('#survivor-kit-tab-equipment');await p.screenshot({path:`${out}/03-mobile-equipment.png`});assert.deepEqual(report.errors,[]);
}catch(e){report.failure=e.stack;process.exitCode=1;await p.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.error(e);}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
