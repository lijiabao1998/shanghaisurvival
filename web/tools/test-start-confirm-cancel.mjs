// Execute the actual start() guard/disposal boundary, not a reimplemented guard.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/survival.ts',import.meta.url),'utf8');
const begin=source.indexOf('function start(chosen: CharSpec, resume: Snapshot | null = null) {');
const end=source.indexOf('  if(!resume)savedGame=null;',begin);
assert.ok(begin>=0&&end>begin);
const body=source.slice(source.indexOf('{',begin)+1,end);
function setup({mode='sandbox',status='alive',answer=false}={}){
 const calls={disposed:0,confirmed:0,started:0},classes=new Set();
 const state={document:{querySelector:()=>null},mode,savedGame:{status,inventory:{water:9},worldLayout:'legacy'},stagedMenu:{dispose(){calls.disposed++;}},confirm(){calls.confirmed++;return answer;},tr:(h)=>h,el:{overlay:{classList:{add:x=>classes.add(x)}}},continued(){calls.started++;}};
 vm.createContext(state);vm.runInContext(`function start(chosen,resume=null){${body}\ncontinued();}`,state);
 return {state,calls,classes,setAnswer(v){state.confirm=()=>{calls.confirmed++;return v;};}};
}
const x=setup(),menu=x.state.stagedMenu,save=JSON.stringify(x.state.savedGame);
x.state.start({id:'teacher'});assert.deepEqual(x.calls,{disposed:0,confirmed:1,started:0});assert.equal(x.state.stagedMenu,menu);assert.equal(JSON.stringify(x.state.savedGame),save);assert.ok(x.classes.has('on'));
x.state.start({id:'teacher'});assert.equal(x.calls.disposed,0);assert.equal(x.calls.started,0);assert.equal(x.state.stagedMenu,menu);
x.setAnswer(true);x.state.start({id:'teacher'});assert.equal(x.calls.disposed,1);assert.equal(x.calls.started,1);assert.equal(x.state.stagedMenu,null);
for(const options of [{mode:'quick'},{status:'dead'}]){const s=setup(options);s.state.start({});assert.deepEqual(s.calls,{disposed:1,confirmed:0,started:1});}
const r=setup();r.state.start({},r.state.savedGame);assert.deepEqual(r.calls,{disposed:1,confirmed:0,started:1});
assert.ok(!body.includes('舊正式版存檔仍保留'),'no misleading promise that a separate official save is kept');
console.log('PASS actual start boundary: cancel/repeated cancel preserves staged menu and save; accepted retry disposes once; resume/quick/dead guards unchanged');
