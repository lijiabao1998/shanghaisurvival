// Isolated DOM/browser controls test; not full game play or real-device ergonomics acceptance.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import puppeteer from 'puppeteer-core';
const bundle=await build({stdin:{contents:`import * as controls from './src/touch-controls.ts'; window.controls=controls;`,resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'iife'});
const browser=await puppeteer.launch({executablePath:process.env.QA_BROWSER??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 for(const [width,height,diameter,bottom] of [[390,844,130,52],[360,640,130,52],[844,390,100,28]]) {
  const p=await browser.newPage();await p.setViewport({width,height,isMobile:true,hasTouch:true});
  await p.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="overlay"></div>');
  await p.addScriptTag({content:bundle.outputFiles[0].text});
  await p.evaluate(()=>{window.events=[];for(const name of ['keydown','keyup','survivor-action'])window.addEventListener(name,e=>events.push([name,e.code??e.detail.phase]));controls.setTouchControlLabels({movementHint:'Move · Push to sprint',bag:'Bag'});controls.installTouchControls();controls.installTouchControls();});
  const rect=await p.$eval('#survivor-joystick',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:innerHeight-r.bottom,hint:e.dataset.hint};});
  assert.equal(rect.w,diameter+2);assert.equal(rect.bottom,bottom);assert.equal(rect.hint,'Move · Push to sprint');
  assert.equal(await p.$$eval('#survivor-touch-controls',e=>e.length),1);
  await p.evaluate(()=>{const el=document.getElementById('survivor-joystick'),r=el.getBoundingClientRect();el.setPointerCapture=()=>{};el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:r.right-2,clientY:r.y+r.height/2}));});
  assert.ok((await p.evaluate(()=>events)).some(e=>e[0]==='keydown'&&e[1]==='KeyD'));
  await p.evaluate(()=>{const el=document.getElementById('survivor-touch-action');el.setPointerCapture=()=>{};el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:2}));controls.setTouchControlsSuspended(true);});
  assert.ok(await p.$eval('#survivor-touch-controls',e=>e.hidden));
  const released=await p.evaluate(()=>events);assert.ok(released.some(e=>e[0]==='keyup'&&e[1]==='KeyD'));assert.ok(released.some(e=>e[0]==='survivor-action'&&e[1]==='end'));
  await p.evaluate(()=>{controls.setTouchControlsSuspended(false);controls.setTouchControlLabels({bag:'背包',action:'Use'});});
  assert.equal(await p.$eval('#survivor-touch-bag',e=>e.textContent),'背包');assert.equal(await p.$eval('#survivor-touch-action',e=>e.textContent),'Use');
  assert.equal(await p.$eval('#survivor-touch-controls',e=>e.hidden),false);
  await p.evaluate(()=>{const el=document.getElementById('survivor-joystick'),r=el.getBoundingClientRect();el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:3,clientX:r.right-2,clientY:r.y+r.height/2}));el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:3}));});
  assert.deepEqual((await p.evaluate(()=>events)).slice(-2).map(e=>e[0]),['keyup','keyup']);
  await p.evaluate(()=>document.getElementById('overlay').classList.add('on'));await new Promise(r=>setTimeout(r,10));
  assert.ok(await p.$eval('#survivor-touch-controls',e=>e.hidden));
  console.log(`PASS ${width}x${height}: joystick ${diameter}px bottom ${bottom}px, localization, suspend/release, cancel and overlay`);await p.close();
 }
} finally {await browser.close();}
