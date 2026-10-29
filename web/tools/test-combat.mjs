import assert from 'node:assert/strict';
import { sweepMove, segmentClear } from '../src/combat.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
const wall = (x, z, r) => Math.abs(x - 0.55) < r && Math.abs(z) < 10;
const empty = () => false;
test('open movement reaches exact destination', () => {
  assert.deepEqual(sweepMove(0, 0, 3, 4, 0.34, empty), {x: 3, z: 4, blocked: false});
});
test('knockback stops before a thin wall instead of tunnelling', () => {
  const result = sweepMove(0, 0, 1.5, 0, 0.34, wall);
  assert.ok(result.blocked); assert.ok(result.x < 0.55); assert.ok(!wall(result.x, result.z, 0.34));
});
test('long-range line of sight blocks walls between old sparse samples', () => {
  assert.equal(segmentClear(0, 0, 30, 0, wall), false);
});
test('line of sight works in reverse', () => {
  assert.equal(segmentClear(30, 0, 0, 0, wall), false);
});
test('clear line of sight remains clear', () => {
  assert.equal(segmentClear(0, 20, 30, 20, wall), true);
});
test('projectile sweep detects intervening targets', () => {
  let target = false;
  const hit = sweepMove(0, 0, 2, 0, 0.12, x => {
    if (Math.abs(x - 0.6) < 0.12) { target = true; return true; }
    return false;
  });
  assert.equal(target, true); assert.equal(hit.blocked, true); assert.ok(hit.x < 0.6);
});
test('wall blocks before target', () => {
  let target = false;
  sweepMove(0, 0, 2, 0, 0.12, (x, z, r) => {
    if (wall(x, z, r)) return true;
    if (x > 1) { target = true; return true; }
    return false;
  });
  assert.equal(target, false);
});
test('starting embedded is blocked', () => {
  assert.equal(sweepMove(0.55, 0, 2, 0, 0.12, wall).blocked, true);
});
test('zero movement is stable', () => {
  assert.deepEqual(sweepMove(1, 2, 0, 0, 0.34, empty), {x: 1, z: 2, blocked: false});
});
test('invalid movement fails closed without unbounded work', () => {
  for (const dx of [NaN, Infinity, 1e8]) assert.equal(sweepMove(0, 0, dx, 0, 0.34, empty).blocked, true);
});
console.log(`${passed} combat checks passed`);
