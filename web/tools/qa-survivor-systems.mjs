// Browser acceptance. Fixtures below are labelled; the first loop uses real UI only.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT??'/tmp/shanghai-survivor-evidence';await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.QA_BROWSER??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={scope:'isolated candidate; not production',commit:process.env.GITHUB_SHA??'local',checks:[],errors:[],fixtures:[]};
const url=process.env.QA_URL??'http://127.0.0.1:4173/survival.html?debug';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const state=p=>p.evaluate(()=>window.__modu.state());
const press=async(p,key)=>{await p.keyboard.press(key);await delay(80);};
async function init(viewport){const context=await browser.createBrowserContext();const p=await context.newPage();await p.setViewport(viewport);p.on('pageerror',e=>report.errors.push(e.message));await p.goto(url,{waitUntil:'networkidle0'});await p.waitForFunction(()=>window.__modu);return p;}
async function newGame(p){await p.click('.who');await p.click('#ov-btn');await p.waitForFunction(()=>window.__modu.state().phase==='play');}
try{
 const p=await init({width:1440,height:900});await newGame(p);assert.match(await p.title(),/上海/);await p.screenshot({path:`${out}/01-desktop-play.png`});
 // Natural walk to the nearby safehouse, put supplies, paid rest, return.
 await p.keyboard.down('KeyW');await p.keyboard.down('KeyD');await delay(650);await p.keyboard.up('KeyW');await p.keyboard.up('KeyD');await press(p,'KeyE');
 await p.waitForSelector('#shelter-panel:not([hidden])');
 await p.locator('.shelter-stock>div:nth-child(1) button:nth-of-type(1)').click();
 await p.locator('.shelter-stock>div:nth-child(2) button:nth-of-type(1)').click();
 await p.locator('#shelter-panel > button').filter(el=>el.textContent.includes('休息')).click();
 await p.screenshot({path:`${out}/02-natural-safehouse.png`});
 await p.locator('#shelter-panel > button').filter(el=>el.textContent.includes('返回')).click();
 report.checks.push('Natural new game, WASD walk, E safehouse, store two supplies, paid rest and exit');
 await press(p,'Tab');assert.equal((await state(p)).bagOpen,true);await p.click('#survivor-kit-tab-body');await p.screenshot({path:`${out}/03-desktop-body.png`});
 const pausedHP=(await state(p)).hp;await delay(800);assert.equal((await state(p)).hp,pausedHP);await press(p,'Escape');assert.equal((await state(p)).bagOpen,false);
 await p.reload({waitUntil:'networkidle0'});await p.locator('#campaign-mode button').filter(el=>el.textContent.includes('繼續')).click();await p.waitForFunction(()=>window.__modu.state().phase==='play');report.checks.push('Natural save/reload/resume and paused inventory');
 // Isolated inventory/injury fixture; subsequent equip, treatment and attack are real UI inputs.
 await p.evaluate(()=>{window.__modu.give('pistol');window.__modu.give('medkit',2);window.__modu.give('water',25);window.__modu.hurt(20);});report.fixtures.push('debug grant pistol, two medical kits, 25 water and a 20 HP injury');
 await press(p,'Tab');await p.click('#survivor-kit-tab-equipment');await p.click('[data-focus-key="primary-qsz92-9"]');await p.click('[data-focus-key="secondary-pipe"]');
 assert.equal((await state(p)).survivorSystems.hands.secondary,'pipe');await p.screenshot({path:`${out}/04-dual-equipment.png`});
 await press(p,'Escape');const ammoBefore=(await state(p)).arsenal.rounds['9mm'];await press(p,'KeyR');const off=await state(p);assert.equal(off.swingHand,'left');assert.equal(off.action,'swing');assert.equal(off.arsenal.rounds['9mm'],ammoBefore);await delay(700);
 await press(p,'Tab');await p.click('#survivor-kit-tab-equipment');await p.click('[data-focus-key="unequip-secondary"]');await p.click('[data-focus-key="primary-pipe"]');await p.click('[data-focus-key="secondary-qsz92-9"]');await press(p,'Escape');await press(p,'KeyR');assert.equal((await state(p)).shootHand,'left');assert.equal((await state(p)).arsenal.rounds['9mm'],ammoBefore-1);await delay(400);
 report.checks.push('Actual left-hand pipe swing and left-hand pistol fire share action gate and correct ammo');
 await press(p,'Tab');await p.click('#survivor-kit-tab-body');assert.ok((await state(p)).survivorSystems.condition.bleeding>0);await p.screenshot({path:`${out}/05-wounded-body.png`});await p.click('[data-focus-key="treat-medkit"]');assert.equal((await state(p)).survivorSystems.condition.bleeding,0);assert.equal((await state(p)).inventory.medkit,1);
 await p.click('#survivor-kit-tab-inventory');await p.screenshot({path:`${out}/06-heavy-inventory.png`});assert.ok((await state(p)).weight>12);await press(p,'Escape');
 const beforeReload=await state(p);await p.reload({waitUntil:'networkidle0'});await p.locator('#campaign-mode button').filter(el=>el.textContent.includes('繼續')).click();assert.deepEqual((await state(p)).survivorSystems,beforeReload.survivorSystems);assert.equal((await state(p)).arsenal.rounds['9mm'],beforeReload.arsenal.rounds['9mm']);report.checks.push('Treatment consumes exactly one kit; heavy inventory and dual-hand state survive reload');
 const mobile=await init({width:390,height:844,isMobile:true,hasTouch:true});await newGame(mobile);await mobile.click('#survivor-touch-bag');await mobile.click('#survivor-kit-tab-body');await mobile.screenshot({path:`${out}/07-mobile-body.png`});
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await mobile.click('.survivor-kit__close');assert.equal((await state(mobile)).bagOpen,false);
 await mobile.click('#survivor-touch-bag');await mobile.click('#survivor-kit-tab-inventory');await mobile.screenshot({path:`${out}/08-mobile-inventory.png`});
 await mobile.setViewport({width:844,height:390,isMobile:true,hasTouch:true});await mobile.screenshot({path:`${out}/09-mobile-landscape.png`});
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);report.checks.push('390×844 touch bag/body/close/reopen plus 844×390 landscape have no document overflow');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.failure=e.stack;console.error(e);process.exitCode=1;}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
