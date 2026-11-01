import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundled=await build({stdin:{contents:`export * from './src/staged-character-menu.ts';export {ROSTER} from './src/characters.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {CHARACTER_GROUPS,ROSTER,selectionAdvance,selectionBack,canDepart,installStagedCharacterMenu}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
assert.equal(CHARACTER_GROUPS.length,3);assert.ok(CHARACTER_GROUPS.every(g=>g.ids.length===4));
assert.deepEqual(CHARACTER_GROUPS.flatMap(g=>g.ids).sort(),ROSTER.map(c=>c.id).sort());
assert.equal(selectionAdvance(0,false),0);assert.equal(selectionAdvance(0,true),1);assert.equal(selectionAdvance(1,true),2);assert.equal(selectionAdvance(2,true),2);assert.equal(selectionBack(0),0);assert.equal(selectionBack(2),1);
assert.equal(canDepart(1,true,true,true),false);assert.equal(canDepart(2,true,false,true),false);assert.equal(canDepart(2,true,true,true),true);assert.equal(canDepart(2,true,false,false),true);
console.log('PASS all 12 original characters in three groups; guarded three-step state and overwrite consent');
// Execute the actual DOM controller against a minimal DOM double. This is not screenshot/browser QA.
class E{constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.hidden=false;this.disabled=false;this.onclick=null;this.classList={add(){},remove(){}};this.events={};this.textContent='';}append(...els){for(const el of els){el.remove();el.parent=this;this.children.push(el);}}prepend(el){el.remove();el.parent=this;this.children.unshift(el);}before(el){const p=this.parent;el.remove();el.parent=p;p.children.splice(p.children.indexOf(this),0,el);}remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}querySelectorAll(){return this.children.filter(c=>c.className==='who');}closest(){return overlay;}addEventListener(k,fn){this.events[k]=fn;}removeEventListener(k){delete this.events[k];}focus(){this.focused=true;}click(){if(!this.disabled)this.onclick?.call(this,{});}}
const overlay=new E(),head=new E(),roster=new E(),pick=new E(),next=new E('button'),modes=new E(),note=new E(),resume=new E('button');overlay.append(roster,pick,next,modes,note);modes.append(resume);let starts=0,resumes=0,sandbox=true,save=true,english=false;
next.onclick=()=>starts++;resume.onclick=()=>resumes++;ROSTER.forEach(c=>{const b=new E('button');b.className='who';b.onclick=()=>{pick.textContent=c.name;};roster.append(b);});
globalThis.document={createElement:t=>new E(t),head};globalThis.window={addEventListener(){},removeEventListener(){}};
const menu=installStagedCharacterMenu({roster,pick,next,modes,note,resume,characterIds:ROSTER.map(c=>c.id),hasSave:()=>save,isSandbox:()=>sandbox,translate:(h,s,e)=>english?e:h});
const chrome=overlay.children.find(e=>e.id==='shanghai-selection'),nav=chrome.children.find(e=>e.className==='selection-categories'),warning=chrome.children.find(e=>e.className==='selection-overwrite'),back=chrome.children.find(e=>e.className==='selection-back');
assert.equal(roster.children.filter(e=>!e.hidden).length,4);assert.equal(next.disabled,true);resume.click();assert.equal(resumes,1);assert.equal(starts,0);
nav.children[1].click();assert.equal(roster.children[0].hidden,false);roster.children[0].click();assert.equal(next.disabled,false);next.click();assert.equal(overlay.attrs['data-selection-step'],'1');assert.equal(starts,0);next.click();assert.equal(overlay.attrs['data-selection-step'],'2');assert.equal(next.disabled,true);next.click();assert.equal(starts,0);
warning.children[0].checked=true;warning.children[0].onchange();next.click();assert.equal(starts,1);
back.click();assert.equal(overlay.attrs['data-selection-step'],'1');next.click();assert.equal(next.disabled,true);
back.click();sandbox=false;modes.events.click();next.click();assert.equal(next.disabled,false);next.click();assert.equal(starts,2);
english=true;menu.refreshLanguage();assert.equal(next.textContent,'Depart ▶');menu.dispose();menu.dispose();assert.equal(overlay.attrs['data-selection-step'],undefined);assert.equal(roster.children.filter(e=>!e.hidden).length,12);assert.equal(resume.parent,modes);assert.ok(!overlay.children.includes(chrome));
console.log('PASS actual controller: 4-card grouping, continuation, no premature start, consent/reset/back, independent quick mode, language and dispose');
