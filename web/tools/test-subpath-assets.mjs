import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const base='https://game.lijiabao.uk/shanghaisurvival/';
for(const name of ['index.html','street.html','survival.html','stress.html']){
 const html=readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
 for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  const value=m[1];if(/^(?:https?:|data:|#)/.test(value))continue;
  const url=new URL(value,base+name);
  assert.ok(url.href.startsWith(base),`${name}: ${value} escapes game subdirectory`);
  const relative=decodeURIComponent(url.pathname.slice('/shanghaisurvival/'.length));
  assert.ok(existsSync(resolve('dist',relative)),`${name}: ${value} target absent`);
 }
}
// The game is the site root; the old survival.html only forwards there and keeps ?debug / ?play.
const game=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
assert.match(game,/<title>上海倖存者 · 天亮之前<\/title>/,'site root is the survival game');
const redirect=readFileSync(new URL('../dist/survival.html',import.meta.url),'utf8');
assert.ok(redirect.includes("location.replace('./' + location.search + location.hash)"),'old game link forwards with its query');
assert.ok(redirect.includes('url=./'),'no-script fallback forwards too');
console.log('PASS built entry dependencies resolve under /shanghaisurvival/, the game is the site root and survival.html forwards to it');
