// Lane house art and street life built in Node (no DOM): budgets, finite geometry, signage and occlusion fading.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLaneFabric } from '../src/lane-fabric.ts';
import { createLaneVisibility, buildSignAtlas, laneHouseGeometry, SHOP_SIGNS } from '../src/lane-houses.ts';
import { createLaneLife } from '../src/lane-life.ts';

const block = JSON.parse(readFileSync(new URL('../public/data/block.json', import.meta.url), 'utf8'));
const keepOpen = [[...block.spawn, 6.5], [...block.entrance, 3], ...block.landmarks.map(l => [l.x, l.y, l.name.includes('文庙') ? 55 : 28])];
const { houses } = planLaneFabric(block, { center: block.spawn, radius: 320, keepOpen });
const names = block.roads.map(r => r.name).filter(Boolean);
let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };

test('signs are simplified Chinese as on Shanghai streets, every plate resolves in the atlas', () => {
  const atlas = buildSignAtlas(names);
  assert.equal(atlas.texture, null, 'no canvas in Node, geometry still builds');
  for (const s of SHOP_SIGNS) assert.ok(atlas.cell('shop:' + s), s);
  for (let n = 1; n <= 160; n++) assert.ok(atlas.cell('no:' + n));
  for (const n of new Set(names)) assert.ok(atlas.cell('road:' + n), n);
  // traditional forms would read as Hong Kong or Taiwan, not Shanghai
  assert.ok(!SHOP_SIGNS.join('').match(/[煙貨髮饅頭麵館雜鋪鐘錶藥廳號糧飲]/), 'simplified characters only');
});

test('a row has tiled roof slopes, walls and plates; every vertex is finite', () => {
  const atlas = buildSignAtlas(names);
  const g = laneHouseGeometry(houses[0], atlas, new Map());
  for (const b of [g.walls, g.roof, g.signs]) assert.ok(b.p.every(Number.isFinite));
  assert.ok(g.roof.p.length > 0 && g.roof.uv.length === (g.roof.p.length / 3) * 2, 'roof carries tile UVs');
  assert.ok(g.walls.p.length / 9 > 50);
  // ridge above the eaves: highest roof vertex is near the planned ridge height
  const ys = [];
  for (let i = 1; i < g.roof.p.length; i += 3) ys.push(g.roof.p[i]);
  assert.ok(Math.max(...ys) <= houses[0].height_m + 0.6 && Math.max(...ys) > houses[0].height_m - 1.5);
});

test('the whole fabric stays within a mobile budget in five meshes (one night-only glow) and fades the row hiding the player', () => {
  const v = createLaneVisibility(houses, names);
  const s = v.stats();
  assert.equal(s.meshes, 5);
  assert.ok(s.glowTriangles > 0 && s.glowTriangles < 120000, `${s.glowTriangles} glow triangles`);
  assert.equal(s.units, houses.reduce((a, h) => a + h.lane.units.length, 0));
  const tris = s.wallTriangles + s.roofTriangles + s.signTriangles;
  assert.ok(tris < 320000, `${tris} triangles`);
  const h = houses.find(x => x.lane.name === '梦花街') ?? houses[0];
  const cx = h.footprint.reduce((a, p) => a + p[0], 0) / 4, cy = h.footprint.reduce((a, p) => a + p[1], 0) / 4;
  v.update(cx, cy);
  assert.ok(v.fadedIds().includes(h.id), 'standing inside a row hides it');
  v.update(block.spawn[0] + 500, block.spawn[1] + 500);
  assert.ok(!v.fadedIds().includes(h.id));
  console.log(`  ${s.houses} rows, ${s.units} houses, ${tris} triangles, ${s.glowTriangles} night-glow triangles`);
  v.dispose();
});

test('street life: wires, laundry, bikes, corner signs and named lane gates, bounded', () => {
  const atlas = buildSignAtlas(names);
  const life = createLaneLife(houses, block.roads, atlas, block.spawn, 320);
  const s = life.stats;
  assert.ok(s.wireSegments > 1000 && s.crossings > 40, JSON.stringify(s));
  assert.ok(s.laundry > 10 && s.bikes > 50 && s.bikes <= 260);
  assert.ok(s.roadSigns > 10 && s.gates >= 1, 'corner road-name plates and at least one 弄 entrance');
  assert.ok(s.propTriangles < 60000);
  for (const child of life.group.children) {
    const p = child.geometry.getAttribute('position').array;
    assert.ok(p.every(Number.isFinite));
  }
  console.log('  ' + JSON.stringify(s));
});

console.log(`${count} lane house checks passed (Node geometry, not a browser test)`);
