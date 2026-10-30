// Executes the real settings controller in a minimal DOM adapter. Not browser layout/accessibility certification.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundled=await build({stdin:{contents:`import * as api from './src/game-settings';globalThis.api=api;`,resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'iife'});
class Events{listeners=new Map();addEventListener(k,fn){const list=this.listeners.get(k)??[];list.push(fn);this.listeners.set(k,list);}dispatchEvent(e){for(const fn of this.listeners.get(e.type)??[])fn(e);this['on'+e.type]?.(e);return !e.defaultPrevented;}}
const registry=new Map();let document;
class Element extends Events{
 constructor(tag){super();this.tagName=tag.toUpperCase();this.attrs=new Map();this.children=[];this.hidden=false;this.textContent='';this.value='';this.checked=false;}
 set id(v){this._id=v;registry.set(v,this);}get id(){return this._id;}
 setAttribute(k,v){this.attrs.set(k,v);if(k==='id')this.id=v;}hasAttribute(k){return this.attrs.has(k);}
 append(e){this.children.push(e);}focus(){document.activeElement=this;}
 set innerHTML(html){this.children=[];for(const m of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/g)){const id=/\bid="([^"]+)"/.exec(m[2]);if(!id)continue;const e=new Element(m[1]);e.id=id[1];if(/\bdisabled\b/.test(m[2]))e.setAttribute('disabled','');this.children.push(e);}}
 querySelector(selector){return this.children.find(e=>'#'+e.id===selector)??null;}
 querySelectorAll(selector){const tags=selector.toUpperCase().split(',');return this.children.filter(e=>tags.includes(e.tagName));}
}
class Event{constructor(type,init={}){Object.assign(this,init);this.type=type;this.defaultPrevented=false;this.stopped=false;}preventDefault(){this.defaultPrevented=true;}stopPropagation(){this.stopped=true;}}
document={head:new Element('head'),body:new Element('body'),activeElement:null,createElement:t=>new Element(t)};
const window=new Events(),storage=new Map([['sandbox','UNCHANGED']]);let rejectWrite=false;
const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(rejectWrite)throw Error('quota');storage.set(k,v);}};
const context={document,window,HTMLElement:Element,CustomEvent:Event,localStorage};vm.runInNewContext(bundled.outputFiles[0].text,context);const {api}=context;
let allowed=true,opens=0,resumes=0,saves=0,previews=0,menuEvents=0,languages=0;
window.addEventListener('shanghai-menu-open',()=>menuEvents++);window.addEventListener('shanghai-language-change',()=>languages++);
const ctl=api.installGameSettings({canOpen:()=>allowed,open:()=>opens++,resume:()=>resumes++,saveReturn:()=>{saves++;return false;},audioPreview:()=>previews++});
const get=id=>registry.get(id),click=id=>get(id).dispatchEvent(new Event('click'));
let count=0;function test(name,fn){fn();count++;console.log(`PASS ${name}`);}
test('visibility and permission, open only once with focus, resume returns focus',()=>{
 assert.equal(ctl.isOpen(),false);assert.equal(get('game-settings-button').hidden,true);ctl.setPlaying(true);assert.equal(get('game-settings-button').hidden,false);
 const prior=new Element('button');prior.focus();allowed=false;ctl.open();assert.equal(opens,0);allowed=true;click('game-settings-button');assert.equal(opens,1);assert.equal(menuEvents,1);assert.equal(ctl.isOpen(),true);assert.equal(document.activeElement.id,'settings-resume');
 ctl.open();assert.equal(opens,1);click('settings-resume');assert.equal(resumes,1);assert.equal(ctl.isOpen(),false);assert.equal(document.activeElement,prior);ctl.close();assert.equal(resumes,1);
});
test('failed save-return stays open and never resumes or loses sandbox data',()=>{
 ctl.open();click('settings-return');assert.equal(saves,1);assert.equal(ctl.isOpen(),true);assert.equal(resumes,1);assert.match(get('settings-feedback').textContent,/存檔失敗/);assert.equal(storage.get('sandbox'),'UNCHANGED');
});
test('Tab wraps ends, middle native tab stays available, Escape closes and stops bubbling',()=>{
 const root=get('game-settings-dialog');get('settings-return').focus();const forward=new Event('keydown',{key:'Tab',shiftKey:false});root.dispatchEvent(forward);assert.ok(forward.defaultPrevented);assert.equal(document.activeElement.id,'settings-volume');
 const backward=new Event('keydown',{key:'Tab',shiftKey:true});root.dispatchEvent(backward);assert.ok(backward.defaultPrevented);assert.equal(document.activeElement.id,'settings-return');
 get('settings-mute').focus();const middle=new Event('keydown',{key:'Tab'});root.dispatchEvent(middle);assert.equal(middle.defaultPrevented,false);
 const escape=new Event('keydown',{key:'Escape'});root.dispatchEvent(escape);assert.ok(escape.defaultPrevented&&escape.stopped);assert.equal(ctl.isOpen(),false);assert.equal(resumes,2);
});
test('range, mute, language and preview events invoke real controller updates',()=>{
 ctl.open();get('settings-volume').value='73';get('settings-volume').dispatchEvent(new Event('input'));assert.equal(api.gameSettings.volume,.73);assert.match(get('settings-volume-label').textContent,/73%/);
 get('settings-mute').checked=true;get('settings-mute').dispatchEvent(new Event('change'));assert.equal(api.gameSettings.muted,true);
 get('settings-language').value='en';get('settings-language').dispatchEvent(new Event('change'));assert.equal(api.gameSettings.language,'en');assert.equal(languages,1);assert.equal(get('settings-resume').textContent,'Resume game');click('settings-preview');assert.equal(previews,1);
 rejectWrite=true;get('settings-volume').value='25';get('settings-volume').dispatchEvent(new Event('input'));assert.equal(api.gameSettings.volume,.25);assert.match(get('settings-feedback').textContent,/cannot be stored/);assert.equal(storage.get('sandbox'),'UNCHANGED');
});
test('global game keyboard skips open menu before preventing Tab/Space defaults',()=>{
 const source=readFileSync(new URL('../src/survival.ts',import.meta.url),'utf8');const start=source.indexOf("addEventListener('keydown', e => {");assert.ok(start>=0);const body=source.slice(start,source.indexOf("addEventListener('keyup'",start));
 assert.match(body,/if\s*\(settingsMenu\.isOpen\(\)\)\s*return;/);assert.ok(body.indexOf('settingsMenu.isOpen()')<body.indexOf('e.preventDefault()'));
});
console.log(`${count} real settings-controller fake-DOM checks passed; no browser launched`);
