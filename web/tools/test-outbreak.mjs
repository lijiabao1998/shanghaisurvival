import assert from 'node:assert/strict';
import { createOutbreak, stepOutbreak, applySupply, canEvacuate } from '../src/outbreak.ts';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}
const quiet = { running: false, nearbyThreat: false };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);

test('fresh state is independent and starts supplied', () => {
  const a = createOutbreak(), b = createOutbreak();
  assert.deepEqual(a, { hydration: 100, satiety: 100, exposure: 0 });
  a.hydration = 0;
  assert.equal(b.hydration, 100);
});
test('eight-minute quiet night creates resource pressure', () => {
  const s = createOutbreak();
  stepOutbreak(s, 480, quiet);
  close(s.hydration, 28); close(s.satiety, 52); assert.equal(s.exposure, 0);
});
test('running consumes resources faster', () => {
  const s = createOutbreak();
  stepOutbreak(s, 100, { ...quiet, running: true });
  close(s.hydration, 77); close(s.satiety, 86);
});
test('nearby threat raises exposure; distance lowers it', () => {
  const s = createOutbreak();
  stepOutbreak(s, 50, { ...quiet, nearbyThreat: true }); close(s.exposure, 60);
  stepOutbreak(s, 100, quiet); close(s.exposure, 48);
});
test('large steps clamp every meter', () => {
  const s = createOutbreak();
  stepOutbreak(s, 10000, { running: true, nearbyThreat: true });
  assert.deepEqual(s, { hydration: 0, satiety: 0, exposure: 100 });
  stepOutbreak(s, 10000, quiet); assert.equal(s.exposure, 0);
});
test('invalid and negative time never changes state', () => {
  const s = createOutbreak();
  for (const dt of [-1, 0, NaN, Infinity]) stepOutbreak(s, dt, quiet);
  assert.deepEqual(s, createOutbreak());
});
test('supplies replenish distinct meters and clamp limits', () => {
  const s = { hydration: 20, satiety: 30, exposure: 80 };
  applySupply(s, 'water'); applySupply(s, 'food'); applySupply(s, 'medkit');
  assert.deepEqual(s, { hydration: 60, satiety: 65, exposure: 50 });
  for (let i = 0; i < 4; i++) { applySupply(s, 'water'); applySupply(s, 'food'); applySupply(s, 'medkit'); }
  assert.deepEqual(s, { hydration: 100, satiety: 100, exposure: 0 });
});
test('evacuation requires every boundary condition', () => {
  const s = createOutbreak();
  assert.equal(canEvacuate(s, 420, 3, 5), true);
  assert.equal(canEvacuate(s, 479.99, 3, 5), true);
  assert.equal(canEvacuate(s, 480, 3, 0), false);
  assert.equal(canEvacuate(s, 481, 3, 0), false);
  for (const args of [[419.99, 3, 5], [420, 2, 5], [420, 3, 5.01], [420, 3, -1], [NaN, 3, 0]])
    assert.equal(canEvacuate(s, ...args), false);
  s.exposure = 85; assert.equal(canEvacuate(s, 420, 3, 0), false);
  s.exposure = 84.99; assert.equal(canEvacuate(s, 420, 3, 0), true);
  s.exposure = NaN; assert.equal(canEvacuate(s, 420, 3, 0), false);
});
test('ordinary steps are frame-rate independent', () => {
  const a = createOutbreak(), b = createOutbreak();
  stepOutbreak(a, 60, { running: true, nearbyThreat: true });
  for (let i = 0; i < 3600; i++) stepOutbreak(b, 1 / 60, { running: true, nearbyThreat: true });
  for (const key of Object.keys(a)) close(a[key], b[key]);
});
console.log(`${passed} outbreak tests passed`);
