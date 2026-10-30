import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundled=await build({stdin:{contents:`export * from './src/facade-signage.ts'`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {FACADE_SIGN_CATALOG,facadeSignPlacement,createFacadeSignage}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const block=JSON.parse(readFileSync('public/data/block.json','utf8')),before=JSON.stringify(block);
assert.equal(FACADE_SIGN_CATALOG.length,9);assert.equal(new Set(FACADE_SIGN_CATALOG.map(x=>x.buildingId)).size,9);
for(const s of FACADE_SIGN_CATALOG){const b=block.buildings.find(b=>b.id===s.buildingId),p=facadeSignPlacement(b);assert.equal(p.length,4);assert.ok(p.flat().every(Number.isFinite));assert.ok(p.every(v=>v[1]>=2.55));assert.deepEqual(p,facadeSignPlacement(b));assert.match(s.plate,/^里弄 \d\d$/);}
assert.equal(JSON.stringify(block),before);console.log('PASS 9 deterministic fictional signs, source coordinates unchanged, above traversable doors');

const texts=[];globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({clearRect(){},fillRect(){},strokeRect(){},fillText(...v){texts.push(v)}})})};
const signs=createFacadeSignage(block.buildings);assert.deepEqual(signs.stats,{signs:9,textures:1});assert.equal(new Set(signs.group.children.map(m=>m.material)).size,1);
for(const mesh of signs.group.children){assert.equal(mesh.geometry.getAttribute('position').count,4);assert.ok([...mesh.geometry.getAttribute('uv').array].every(v=>v>=0&&v<=1));}
assert.equal(texts.length,27);signs.update([FACADE_SIGN_CATALOG[0].buildingId]);assert.equal(signs.group.children[0].visible,false);assert.ok(signs.group.children.slice(1).every(m=>m.visible));signs.update([]);assert.ok(signs.group.children.every(m=>m.visible));
console.log('PASS shared atlas/material, 9 quads, finite UVs, 27 text draws and facade occlusion visibility');
