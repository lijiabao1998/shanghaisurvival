/** Natural expedition first; only later, explicitly labelled isolated sparring fixtures. */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT??'evidence/natural-tools',url=process.env.QA_URL??'http://127.0.0.1:4173/survival.html?debug=1';
await mkdir(out,{recursive:true});
const report={source:process.env.QA_SOURCE_SHA??'unrecorded',natural:{scope:'native desktop controls, read-only route observations; no teleport/grants/AI suppression/time edits',events:[],errors:[]},sparring:[]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let browser,activePage;
const state=p=>p.evaluate(()=>window.__modu.state());
async function click(p,s,mobile=false){const el=await p.waitForSelector(s,{visible:true,timeout:45000});mobile?await el.tap():await el.click();}
async function shot(p,name){await p.screenshot({path:`${out}/${name}.png`});}
async function init(width,height,mobile=false){const ctx=await browser.createBrowserContext(),p=await ctx.newPage();activePage=p;await p.setViewport({width,height,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});await p.goto(url,{waitUntil:'domcontentloaded',timeout:120000});await p.waitForFunction(()=>window.__modu&&document.querySelector('#overlay').dataset.selectionStep==='0',{timeout:120000});return{ctx,p};}
async function newGame(p){await click(p,'#roster .who:not([hidden])');for(let i=0;i<3;i++)await click(p,'#ov-btn');await p.waitForFunction(()=>window.__modu.state().phase==='play');}
async function walk(p,target,label,events=report.natural.events,mobile=false){
 const began=Date.now(),trail=[],held=new Set();let stalled=0,last=(await state(p)).spawn;
 let joy=null;if(mobile){joy=await(await p.$('#survivor-joystick')).boundingBox();await p.touchscreen.touchStart(joy.x+joy.width/2,joy.y+joy.height/2);}
 try{
  while(Date.now()-began<120000){
   const s=await state(p);assert.equal(s.phase,'play',`natural expedition ended: ${label}`);assert.ok(s.hp>0);const pos=s.spawn;
   if(Math.hypot(pos[0]-target[0],pos[1]-target[1])<.18){events.push({label,seconds:(Date.now()-began)/1000,trail,arrived:pos});return;}
   const path=await p.evaluate(([x,z])=>window.__modu.navigationProbe(x,z),target);assert.ok(path.length,`No collision-safe observed route to ${label} from ${pos}`);
   let next=path.find(v=>Math.hypot(v.x-pos[0],v.z-pos[1])>.18)??path.at(-1);
   const dx=next.x-pos[0],dz=next.z-pos[1],length=Math.hypot(dx,dz),right=(dx+dz)/(Math.SQRT2*length),fwd=(dz-dx)/(Math.SQRT2*length);
   const want=new Set();if(right>.34)want.add('KeyD');if(right<-.34)want.add('KeyA');if(fwd>.34)want.add('KeyW');if(fwd<-.34)want.add('KeyS');
   // Keyboard/joystick are eight-way, not the planner's continuous heading.
   // Near a narrow door, a short native diagonal correction supplies the missing cross-track component.
   if(stalled>8&&want.size===2){if(Math.abs(right)>Math.abs(fwd)){want.delete('KeyW');want.delete('KeyS');}else{want.delete('KeyA');want.delete('KeyD');}}
   const steerRight=Number(want.has('KeyD'))-Number(want.has('KeyA')),steerForward=Number(want.has('KeyW'))-Number(want.has('KeyS')),steerLength=Math.hypot(steerRight,steerForward)||1;
   if(mobile)await p.touchscreen.touchMove(joy.x+joy.width/2+steerRight/steerLength*joy.width*.3,joy.y+joy.height/2-steerForward/steerLength*joy.height*.3);
   else {for(const k of held)if(!want.has(k)){await p.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
   await delay(140);const after=(await state(p)).spawn;
   if(Math.hypot(after[0]-last[0],after[1]-last[1])<.02)stalled++;else stalled=0;
   trail.push({at:Date.now()-began,pos:after,hp:s.hp});last=after;assert.ok(stalled<60,`movement stalled on ${label}`);
  }
  throw Error(`Timed out walking natural route ${label}`);
 }finally{if(mobile)await p.touchscreen.touchEnd();for(const k of held)await p.keyboard.up(k);}
}
async function perf(p,label){
 const before=await state(p);const frames=await p.evaluate(()=>new Promise(resolve=>{const samples=[];let last=performance.now(),start=last;function tick(t){samples.push(t-last);last=t;if(t-start<10000)requestAnimationFrame(tick);else resolve(samples);}requestAnimationFrame(tick);}));
 const sorted=frames.filter(x=>x>0).sort((a,b)=>a-b),after=await state(p);
 return{label,scope:'10 seconds live rAF without screenshot/screencast; software renderer, not physical GPU benchmark',fps:1000*sorted.length/sorted.reduce((a,b)=>a+b,0),p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],beforeBudget:before.renderBudget,afterBudget:after.renderBudget,beforeHP:before.hp,afterHP:after.hp,frames};
}
try{
 browser=await puppeteer.launch({executablePath:process.env.QA_BROWSER??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const {ctx,p}=await init(1366,768);p.on('pageerror',e=>report.natural.errors.push(String(e)));const started=Date.now();await newGame(p);report.natural.initial=await state(p);await shot(p,'natural-01-entry');report.natural.performance=[await perf(p,'before expedition')];
 await p.keyboard.press('KeyF'); // Ordinary flashlight toggle reduces visibility; no enemy state edits.
 for(const tool of ['cleaver','wrench']){
  const s=await state(p),site=s.roomTools.find(t=>t.tool===tool);assert.ok(site,`natural ${tool} site exists`);const room=s.interiorRooms.find(r=>r.entrance.id===site.buildingId);assert.ok(room);
  await walk(p,room.entrance.outside,`${tool}-outside`);await walk(p,room.entrance.inside,`${tool}-door`);await walk(p,[site.x,site.z],`${tool}-pickup`);
  await shot(p,`natural-${tool}-before`);await p.keyboard.down('KeyE');
  try{await p.waitForFunction(id=>window.__modu.state().roomTools.find(t=>t.id===id)?.looted,{timeout:60000},site.id);}finally{await p.keyboard.up('KeyE');}
  report.natural.events.push({label:`claimed-${tool}`,state:await state(p)});await shot(p,`natural-${tool}-after`);await walk(p,room.entrance.outside,`${tool}-exit`);
 }
 const beforeHome=await state(p);await walk(p,beforeHome.shelter.outside,'return-safehouse');await p.keyboard.press('KeyE');await p.waitForSelector('#shelter-panel:not([hidden])');
 await click(p,'.shelter-stock>div:nth-child(1) button:nth-of-type(1)');await click(p,'.shelter-stock>div:nth-child(2) button:nth-of-type(1)');
 const rests=(await state(p)).restCount;for(const b of await p.$$('#shelter-panel > button'))if((await b.evaluate(e=>e.textContent)).includes('休息')){await b.click();break;}
 assert.equal((await state(p)).restCount,rests+1);await shot(p,'natural-06-paid-rest');
 for(const b of await p.$$('#shelter-panel > button'))if((await b.evaluate(e=>e.textContent)).includes('返回')){await b.click();break;}
 await p.waitForFunction(()=>!window.__modu.state().inShelter);report.natural.performance.push(await perf(p,'after expedition/rest'));
 await p.keyboard.press('Tab');await click(p,'#survivor-kit-tab-equipment');await click(p,'[data-focus-key="primary-cleaver"]');await click(p,'[data-focus-key="secondary-wrench"]');await shot(p,'natural-07-earned-equipment');await click(p,'.survivor-kit__close');
 report.natural.beforeSave=await state(p);await p.keyboard.press('Escape');await click(p,'#settings-return');await p.waitForFunction(()=>window.__modu?.state().phase==='menu'&&!!document.querySelector('#campaign-resume'),{timeout:120000});
 const saves=await p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('shanghai-survivors:')).map(k=>[k,localStorage.getItem(k)])));assert.ok(Object.keys(saves).length);
 await click(p,'#campaign-resume');await p.waitForFunction(()=>window.__modu.state().phase==='play');report.natural.resumed=await state(p);assert.deepEqual(report.natural.resumed.survivorSystems.hands,{primary:'cleaver',secondary:'wrench'});assert.ok(report.natural.resumed.roomTools.every(t=>t.looted));await shot(p,'natural-08-resumed');
 report.natural.wallSeconds=(Date.now()-started)/1000;report.natural.passed=true;assert.deepEqual(report.natural.errors,[]);await ctx.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 // New isolated contexts import the naturally earned save, then arrange sparring targets only.
 for(const [name,width,height,mobile] of [['desktop',1366,768,false],['phone',390,844,true],['small-phone',360,640,true],['landscape',844,390,true]]){
  const {ctx,p}=await init(width,height,mobile),r={name,scope:'imported naturally earned save + explicitly arranged target; not natural-world combat',errors:[],strikes:[],frames:[]};report.sparring.push(r);p.on('pageerror',e=>r.errors.push(String(e)));
  await p.evaluate(values=>{for(const[k,v]of Object.entries(values))localStorage.setItem(k,v);},saves);await p.reload({waitUntil:'domcontentloaded'});await p.waitForSelector('#campaign-resume',{visible:true,timeout:120000});await click(p,'#campaign-resume',mobile);await p.waitForFunction(()=>window.__modu.state().phase==='play');
  // Observe initial render resources before repeated hand changes; ownership remains the earned save.
  r.travel=[];const staging=(await state(p)).interiorRooms.find(room=>room.entrance.id==='cmab_327821_0').entrance.outside;await walk(p,staging,'sparring-approach',r.travel,mobile);
  r.before=await state(p);await shot(p,`${name}-tools-before`);const c=await p.createCDPSession(),writes=[];
  c.on('Page.screencastFrame',e=>{c.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});const index=r.frames.length;r.frames.push({index,time:e.metadata.timestamp});writes.push(writeFile(`${out}/${name}-tools-${String(index).padStart(4,'0')}.jpg`,Buffer.from(e.data,'base64')));});
  await c.send('Page.startScreencast',{format:'jpeg',quality:60,maxWidth:960,maxHeight:844,everyNthFrame:1});
  for(const [tool,hand,damage]of [['cleaver','right',39],['wrench','left',34],['wrench','right',34],['cleaver','left',39]]){
   if(tool==='wrench'&&hand==='right'){
    if(mobile)await click(p,'#survivor-touch-bag',true);else await p.keyboard.press('Tab');await click(p,'#survivor-kit-tab-equipment',mobile);
    await click(p,'[data-focus-key="primary-pipe"]',mobile);await click(p,'[data-focus-key="secondary-cleaver"]',mobile);await click(p,'[data-focus-key="primary-wrench"]',mobile);await click(p,'.survivor-kit__close',mobile);
   }
   assert.equal(await p.evaluate(()=>window.__modu.combatFixture(.85)),true);
   // Both hand actions use native touch on mobile; approach above stays clear of Home/Talk context.
   if(hand==='left'){if(mobile)await click(p,'#survivor-touch-secondary',true);else await p.keyboard.press('KeyR');}
   else if(mobile){assert.match(await p.$eval('#survivor-touch-action',e=>e.textContent),/打|Hit/);await click(p,'#survivor-touch-action',true);}else await p.keyboard.press('KeyJ');
   await p.waitForFunction(()=>window.__modu.state().combatTargets[0].hp<100);const impact=await state(p);assert.equal(impact.swingTool,tool);assert.equal(impact.swingHand,hand);assert.equal(impact.combatTargets[0].hp,100-damage);
   r.strikes.push({tool,hand,damage,impact,time:Date.now()});await p.waitForFunction(()=>window.__modu.state().action==='none');await shot(p,`${name}-${tool}-${hand}-after`);
  }
  await c.send('Page.stopScreencast');await Promise.all(writes);await c.detach();r.after=await state(p);assert.deepEqual(r.errors,[]);assert.ok(r.frames.length>=8);await shot(p,`${name}-tools-after`);r.passed=true;await ctx.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 }
 report.passed=true;
}catch(e){report.error=String(e.stack||e);process.exitCode=1;await activePage?.screenshot({path:`${out}/failure.png`}).catch(()=>{});try{report.failureState=await state(activePage);}catch{}}
finally{await browser?.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
