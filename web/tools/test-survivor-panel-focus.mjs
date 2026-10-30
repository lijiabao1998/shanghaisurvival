// Execute the actual close/key handler bodies with focused DOM doubles. Browser
// integration remains covered by the natural keyboard QA, not claimed here.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/survivor-panel.ts',import.meta.url),'utf8');
const closeBody=source.match(/  function close\(\) \{([\s\S]*?)\n  \}/)?.[1];
const keyBody=source.match(/overlay.addEventListener\('keydown', event => \{([\s\S]*?)\n  \}\);/)?.[1];
assert.ok(closeBody&&keyBody);
function fixture(kind){
 const document={activeElement:null};
 class HTMLElement {isConnected=true;focus(){if(this.acceptsFocus)document.activeElement=this;}blur(){if(document.activeElement===this)document.activeElement=document.body;}}
 const body=new HTMLElement();document.body=body;
 const child=new HTMLElement();const opener=new HTMLElement();opener.acceptsFocus=kind==='button';opener.isConnected=kind!=='detached';
 document.activeElement=child;
 const overlay={hidden:false,contains:el=>el===child};
 const ctx=vm.createContext({document,HTMLElement,overlay,previousFocus:kind==='null'?null:opener,options:{close(){ctx.closed++;}},closed:0});
 vm.runInContext(`function close(){${closeBody}}`,ctx);
 return {ctx,document,child,opener,overlay};
}
for(const kind of ['body','disabled','detached','null','button']){
 const f=fixture(kind);vm.runInContext('close()',f.ctx);
 assert.equal(f.overlay.hidden,true);assert.equal(f.ctx.previousFocus,null);
 assert.equal(f.document.activeElement,kind==='button'?f.opener:f.document.body,kind);
}
// First Escape closes once; a synthetic stale-child event after close must not
// cancel propagation, prevent default, or call the host close hook again.
const f=fixture('body');let stopped=0,prevented=0;
f.ctx.event={key:'Escape',stopPropagation(){stopped++;},preventDefault(){prevented++;}};
vm.runInContext(`(function(){${keyBody}})()`,f.ctx);
assert.equal(f.ctx.closed,1);assert.equal(stopped,1);assert.equal(prevented,1);
vm.runInContext(`(function(){${keyBody}})()`,f.ctx);
assert.equal(f.ctx.closed,1);assert.equal(stopped,1);assert.equal(prevented,1);
console.log('PASS panel focus restore, unavailable opener blur, first Escape close and hidden-overlay key propagation');
