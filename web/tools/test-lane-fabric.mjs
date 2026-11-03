// Lane fabric planning on the real Menghua Street map: placement rules, determinism and walkability.
// Geometry only (no browser). Run from web/.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLaneFabric, makeLaneInsideTest, frontMargin, LANE_LAYOUT_VERSION } from '../src/lane-fabric.ts';
import { parseSnapshot } from '../src/campaign.ts';

const block = JSON.parse(readFileSync(new URL('../public/data/block.json', import.meta.url), 'utf8'));
const keepOpen = [[...block.spawn, 6.5], [...block.entrance, 3], ...block.landmarks.map(l => [l.x, l.y, l.name.includes('文庙') ? 55 : 28])];
const options = { center: block.spawn, radius: 320, keepOpen };
const plan = planLaneFabric(block, options);
let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };

const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
const pointSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = dx * dx + dy * dy, t = d ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const edges = ring => ring.map((p, i) => [p, ring[(i + 1) % ring.length]]);
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const segSeg = (a, b, c, d) => (((cross(a, b, c) > 0) !== (cross(a, b, d) > 0)) && ((cross(c, d, a) > 0) !== (cross(c, d, b) > 0)))
  ? 0 : Math.min(pointSeg(c, a, b), pointSeg(d, a, b), pointSeg(a, c, d), pointSeg(b, c, d));
const ringDistance = (p, q) => {
  if (p.some(v => inRing(v[0], v[1], q)) || q.some(v => inRing(v[0], v[1], p))) return 0;
  let best = Infinity;
  for (const [a, b] of edges(p)) for (const [c, d] of edges(q)) best = Math.min(best, segSeg(a, b, c, d));
  return best;
};

test('plans a dense old-town fabric around Menghua Street, deterministically', () => {
  assert.equal(plan.layoutVersion, LANE_LAYOUT_VERSION);
  assert.ok(plan.houses.length > 400 && plan.units > 1000, `${plan.houses.length} rows / ${plan.units} houses`);
  assert.equal(JSON.stringify(planLaneFabric(block, options)), JSON.stringify(plan));
  assert.equal(new Set(plan.houses.map(h => h.id)).size, plan.houses.length);
  assert.match(plan.provenance, /fictional/);
  const menghua = plan.houses.filter(h => h.lane.name === '梦花街').length;
  assert.ok(menghua >= 10, `Menghua Street is lined with rows (${menghua})`);
});

test('every row is a real frontage: widths sum to the front, 2–3 storeys, sane depth', () => {
  for (const h of plan.houses) {
    const [a, b, , d] = h.footprint;
    const front = Math.hypot(b[0] - a[0], b[1] - a[1]), depth = Math.hypot(d[0] - a[0], d[1] - a[1]);
    assert.ok(Math.abs(front - h.lane.units.reduce((s, w) => s + w, 0)) < 1e-6, h.id);
    assert.ok(Math.abs(depth - h.lane.depth) < 1e-6 && h.lane.depth >= 5 && h.lane.depth <= 9.5, h.id);
    assert.ok(h.lane.floors.every(f => f === 2 || f === 3) && h.lane.floors.length === h.lane.units.length);
    assert.equal(h.lane.shop.length, h.lane.units.length);
    assert.ok(h.height_m > 6 && h.height_m < 14, h.id);
    assert.equal(h.door_edge, 0);
  }
});

test('rows keep off every road and its footpath, and off existing CMAB buildings', () => {
  for (const h of plan.houses) {
    for (const r of block.roads) {
      const need = r.width_m / 2 + frontMargin(r) - 0.11;
      for (let i = 1; i < r.centerline.length; i++)
        for (const [a, b] of edges(h.footprint)) assert.ok(segSeg(a, b, r.centerline[i - 1], r.centerline[i]) >= need - 1e-6, `${h.id} encroaches ${r.id}`);
    }
    for (const b of block.buildings) {
      const xs = b.footprint.map(p => p[0]), ys = b.footprint.map(p => p[1]);
      const hx = h.footprint.map(p => p[0]), hy = h.footprint.map(p => p[1]);
      if (Math.max(...hx) < Math.min(...xs) - 2 || Math.min(...hx) > Math.max(...xs) + 2 || Math.max(...hy) < Math.min(...ys) - 2 || Math.min(...hy) > Math.max(...ys) + 2) continue;
      assert.ok(ringDistance(h.footprint, b.footprint) >= 1.09, `${h.id} touches ${b.id}`);
    }
  }
});

test('different rows never overlap and leave a back passage; landmarks and doorways stay open', () => {
  for (let i = 0; i < plan.houses.length; i++)
    for (let j = i + 1; j < plan.houses.length; j++) {
      const p = plan.houses[i].footprint, q = plan.houses[j].footprint;
      if (Math.hypot(p[0][0] - q[0][0], p[0][1] - q[0][1]) > 40) continue;
      assert.ok(ringDistance(p, q) >= 1.19, `${plan.houses[i].id} / ${plan.houses[j].id}`);
    }
  for (const [x, y, r] of keepOpen)
    for (const h of plan.houses) {
      assert.ok(!inRing(x, y, h.footprint));
      for (const [a, b] of edges(h.footprint)) assert.ok(pointSeg([x, y], a, b) >= r - 1e-6);
    }
});

test('the street network stays walkable: shelter door and road points reachable as before the fabric', () => {
  const step = 0.5, R = 0.36, x0 = block.spawn[0] - 330, y0 = block.spawn[1] - 330, n = Math.ceil(660 / step);
  const cmab = block.buildings.map(b => ({ b, minX: Math.min(...b.footprint.map(p => p[0])), maxX: Math.max(...b.footprint.map(p => p[0])), minY: Math.min(...b.footprint.map(p => p[1])), maxY: Math.max(...b.footprint.map(p => p[1])) }));
  const inCmab = (x, y) => cmab.some(c => x >= c.minX && x <= c.maxX && y >= c.minY && y <= c.maxY && inRing(x, y, c.b.footprint) && !c.b.holes.some(hh => inRing(x, y, hh)));
  const reachability = blockedAt => {
    const free = new Uint8Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = x0 + i * step, y = y0 + j * step;
      free[i * n + j] = [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]].every(([dx, dy]) => !blockedAt(x + dx, y + dy)) ? 1 : 0;
    }
    const seen = new Uint8Array(n * n), queue = [];
    const start = Math.round((block.spawn[0] - x0) / step) * n + Math.round((block.spawn[1] - y0) / step);
    assert.equal(free[start], 1);
    seen[start] = 1;
    queue.push(start);
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi], i = Math.floor(c / n), j = c % n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a2 = i + di, b2 = j + dj;
        if (a2 < 0 || b2 < 0 || a2 >= n || b2 >= n) continue;
        const k = a2 * n + b2;
        if (!seen[k] && free[k]) { seen[k] = 1; queue.push(k); }
      }
    }
    return (x, y) => {
      const i = Math.round((x - x0) / step), j = Math.round((y - y0) / step);
      for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) if (seen[(i + di) * n + j + dj]) return true;
      return false;
    };
  };
  const laneInside = makeLaneInsideTest(plan.houses);
  const before = reachability(inCmab), after = reachability((x, y) => laneInside(x, y) || inCmab(x, y));
  assert.ok(after(...block.entrance), 'shelter door');
  let total = 0, wasOk = 0, ok = 0;
  for (const r of block.roads) for (const p of r.centerline) {
    if (Math.hypot(p[0] - block.spawn[0], p[1] - block.spawn[1]) > 300) continue;
    total++;
    if (before(p[0], p[1])) wasOk++;
    if (after(p[0], p[1])) ok++;
  }
  // Some OSM centrelines already run through CMAB roofs; the fabric must not cut off anything else.
  assert.ok(ok >= wasOk - Math.ceil(total * 0.01), `${ok}/${total} reachable with the fabric, ${wasOk} without`);
  console.log(`  reachable road points ${ok}/${total} (without the fabric ${wasOk}/${total})`);
});

test('saves record the lane layout explicitly; v1 and legacy saves stay valid', () => {
  const base = { version: 1, mapId: 'block.json', characterId: 'guard', elapsed: 0, hp: 100, stamina: 100, battery: 100,
    outbreak: { hydration: 100, satiety: 100, exposure: 0 }, inventory: { water: 1, food: 1, medkit: 0, battery: 0, ammo: 0, pistol: 0 },
    stash: { water: 0, food: 0, medkit: 0, battery: 0, ammo: 0, pistol: 0 }, ammo: 0, hasPistol: false, pistolEquipped: false,
    position: [1, 2], shelterId: 'x', inShelter: false, looted: 0, kills: 0, containers: [], enemies: [], status: 'alive', restCount: 0 };
  for (const worldLayout of [undefined, 'menghua-infill-v1', LANE_LAYOUT_VERSION]) {
    const s = worldLayout ? { ...base, worldLayout } : base;
    assert.deepEqual(parseSnapshot(JSON.stringify(s), 'block.json'), s);
  }
  assert.equal(parseSnapshot(JSON.stringify({ ...base, worldLayout: 'laoximen-lanes-v2' }), 'block.json'), null);
});

console.log(`${count} lane fabric checks passed (${plan.houses.length} rows, ${plan.units} houses; geometry only, not a browser test)`);
