import assert from 'node:assert/strict';
import { findLocalPath } from '../src/navigation.ts';

const rectangles = (...boxes) => (x, z, r = 0) => boxes.some(([a, b, c, d]) => x >= a-r && x <= c+r && z >= b-r && z <= d+r);
function safePath(start, end, path, blocked) {
  assert.ok(path.length, 'expected a route');
  assert.deepEqual(path.at(-1), { x: end[0], z: end[1] });
  let [x, z] = start;
  for (const p of path) {
    const count = Math.max(1, Math.ceil(Math.hypot(p.x-x, p.z-z) / 0.05));
    for (let i = 0; i <= count; i++) assert.equal(blocked(x+(p.x-x)*i/count, z+(p.z-z)*i/count, .34), false, 'segment enters obstacle');
    assert.ok(Math.hypot(p.x-start[0], p.z-start[1]) <= 40);
    [x, z] = [p.x, p.z];
  }
}
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`ok ${name}`); }
test('direct, exact endpoints and zero distance', () => {
  assert.deepEqual(findLocalPath(.2, .3, 3.8, 4.6, () => false), [{ x: 3.8, z: 4.6 }]);
  assert.deepEqual(findLocalPath(0, 0, 0, 0, () => false), [{ x: 0, z: 0 }]);
});
test('routes around a thin wall without tunnelling', () => {
  const blocked = rectangles([2.09, -2, 2.11, 2]);
  safePath([0,0], [5,.2], findLocalPath(0,0,5,.2,blocked), blocked);
});
test('escapes U-shaped obstacle through its opening', () => {
  const blocked = rectangles([-3,-3,-2.5,3], [2.5,-3,3,3], [-3,-3,3,-2.5]);
  safePath([0,0], [0,-5], findLocalPath(0,0,0,-5,blocked), blocked);
});
test('closed room cannot be escaped', () => {
  const blocked = rectangles([-3,-3,-2.5,3], [2.5,-3,3,3], [-3,-3,3,-2.5], [-3,2.5,3,3]);
  assert.deepEqual(findLocalPath(0,0,0,-5,blocked), []);
});
test('diagonal blocked corners cannot be squeezed through', () => {
  const blocked = rectangles([.5,-.5,1.5,.5], [-.5,.5,.5,1.5], [-1.5,-.5,-.5,.5], [-.5,-1.5,.5,-.5]);
  assert.deepEqual(findLocalPath(0,0,3,3,blocked), []);
});
test('blocked start and target fail', () => {
  const blocked = rectangles([-1,-1,1,1]);
  assert.deepEqual(findLocalPath(0,0,5,0,blocked), []);
  assert.deepEqual(findLocalPath(5,0,0,0,blocked), []);
});
test('invalid input and out-of-range target do no collision work', () => {
  const fail = () => { throw Error('unexpected collision work'); };
  for (const args of [[NaN,0,0,0,500], [0,0,Infinity,0,500], [0,0,41,0,500], [0,0,0,0,0], [0,0,0,0,-1], [0,0,0,0,1.5], [0,0,0,0,NaN]]) {
    assert.deepEqual(findLocalPath(...args.slice(0,4), fail, args[4]), []);
  }
});
test('deterministic and low budget fails rather than returning partial path', () => {
  const blocked = rectangles([2,-2,2.2,2]);
  assert.deepEqual(findLocalPath(0,0,5,0,blocked), findLocalPath(0,0,5,0,blocked));
  assert.deepEqual(findLocalPath(0,0,5,0,blocked,1), []);
});
test('500-node cap bounds collision work even with enormous budget', () => {
  const wall = rectangles([2,-45,3,45]);
  let calls = 0;
  const blocked = (...args) => { calls++; return wall(...args); };
  assert.deepEqual(findLocalPath(0,0,5,0,blocked,Number.MAX_SAFE_INTEGER), []);
  const capped = calls;
  calls = 0;
  assert.deepEqual(findLocalPath(0,0,5,0,blocked,500), []);
  assert.equal(calls, capped);
  assert.ok(calls <= 500*8*14+164, `unexpected collision work: ${calls}`);
  console.log(`  bounded callback calls: ${calls}`);
});
console.log(`${checks} navigation checks passed (pure logic; no browser/gameplay acceptance).`);
