import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const base='https://game.lijiabao.uk/shanghaisurvival/';
for(const name of ['index.html','survival.html','stress.html']){
 const html=readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
 for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  const value=m[1];if(/^(?:https?:|data:|#)/.test(value))continue;
  const url=new URL(value,base+name);
  assert.ok(url.href.startsWith(base),`${name}: ${value} escapes game subdirectory`);
  const relative=decodeURIComponent(url.pathname.slice('/shanghaisurvival/'.length));
  assert.ok(existsSync(resolve('dist',relative)),`${name}: ${value} target absent`);
 }
}
console.log('PASS built entry dependencies resolve under /shanghaisurvival/ and all local targets exist');
