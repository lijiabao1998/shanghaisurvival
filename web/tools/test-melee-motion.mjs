import assert from 'node:assert/strict';
import { MELEE_PROFILES, meleePose, sweptMeleeAngle, angleInSweep } from '../src/melee-motion.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const kinds = ['blade', 'blunt', 'wrench', 'unarmed'];

test('profiles have ordered, bounded phases and positive cost', () => {
  for (const p of Object.values(MELEE_PROFILES)) {
    assert.ok(p.duration > 0 && p.stamina > 0);
    assert.ok(0 < p.activeStart && p.activeStart < p.activeEnd && p.activeEnd < 1);
  }
});
test('each attack loads, strikes, then recovers without a pose jump', () => {
  for (const kind of kinds) {
    const p = MELEE_PROFILES[kind];
    assert.equal(meleePose(kind, 0).phase, 'windup');
    assert.equal(meleePose(kind, (p.activeStart + p.activeEnd) / 2).phase, 'active');
    assert.equal(meleePose(kind, 0.99).phase, 'recovery');
    for (const boundary of [p.activeStart, p.activeEnd]) {
      const before = meleePose(kind, boundary - 1e-7), after = meleePose(kind, boundary + 1e-7);
      for (const key of ['armX', 'armY', 'armZ', 'torsoYaw', 'lean', 'kneeBend']) near(before[key], after[key]);
    }
    near(meleePose(kind, 0).armX, meleePose(kind, 1).armX);
    near(meleePose(kind, 0).torsoYaw, meleePose(kind, 1).torsoYaw);
  }
});
test('windup and recovery alone do not deal damage', () => {
  for (const kind of kinds) {
    const p = MELEE_PROFILES[kind];
    assert.equal(sweptMeleeAngle(kind, 0, p.activeStart), null);
    assert.equal(sweptMeleeAngle(kind, p.activeEnd, 1), null);
    assert.equal(sweptMeleeAngle(kind, 0.5, 0.5), null);
  }
});
test('a long frame sweeps the entire active arc', () => {
  for (const kind of kinds) {
    const p = MELEE_PROFILES[kind], arc = sweptMeleeAngle(kind, 0, 1);
    near(arc.from, p.startAngle); near(arc.to, p.endAngle);
    assert.ok(angleInSweep(0, arc.from, arc.to));
    assert.ok(!angleInSweep(Math.PI, arc.from, arc.to));
  }
});
test('adjacent frame arcs are contiguous and track pose', () => {
  for (const kind of kinds) {
    const p = MELEE_PROFILES[kind], mid = (p.activeStart + p.activeEnd) / 2;
    const a = sweptMeleeAngle(kind, 0, mid), b = sweptMeleeAngle(kind, mid, 1);
    near(a.to, b.from); near(a.to, meleePose(kind, mid).sweepAngle);
  }
});
test('left and right share timing but mirror pose and active arc', () => {
  for (const kind of kinds) {
    const p = MELEE_PROFILES[kind];
    for (const t of [0, p.activeStart / 2, p.activeStart, (p.activeStart + p.activeEnd) / 2, p.activeEnd, 0.9, 1]) {
      const right = meleePose(kind, t, 'right'), left = meleePose(kind, t, 'left');
      assert.equal(left.phase, right.phase);
      for (const key of ['sweepAngle', 'torsoYaw', 'armY', 'armZ']) near(left[key], -right[key]);
      for (const key of ['armX', 'offArmX', 'lean', 'kneeBend']) near(left[key], right[key]);
    }
    const right = sweptMeleeAngle(kind, 0, 1, 'right'), left = sweptMeleeAngle(kind, 0, 1, 'left');
    near(left.from, -right.from); near(left.to, -right.to);
    assert.equal(angleInSweep(-0.7, left.from, left.to), angleInSweep(0.7, right.from, right.to));
    assert.equal(angleInSweep(2.5, left.from, left.to), false);
    assert.deepEqual(sweptMeleeAngle(kind, 0, 1), right);
    assert.deepEqual(meleePose(kind, 0.5), meleePose(kind, 0.5, 'right'));
  }
});
test('target body tolerance covers a near miss but not an unrelated direction', () => {
  assert.equal(angleInSweep(0.3, 0, 0.1), false);
  assert.equal(angleInSweep(0.3, 0, 0.1, 0.2), true);
  assert.equal(angleInSweep(-0.8, 0, 0.1, 0.2), false);
});
test('arc direction and ±π wrapping preserve coverage', () => {
  assert.equal(angleInSweep(Math.PI, 3, -3), true);
  assert.equal(angleInSweep(-Math.PI, -3, 3), true);
  assert.equal(angleInSweep(0, 3, -3), false);
  assert.equal(angleInSweep(0.2, 0.5, -0.5), true);
});
test('invalid or reversed timing and angles fail closed', () => {
  assert.equal(sweptMeleeAngle('blunt', NaN, 1), null);
  assert.equal(sweptMeleeAngle('blunt', 0.8, 0.2), null);
  assert.equal(angleInSweep(NaN, 0, 1), false);
  assert.equal(angleInSweep(0, 0, 1, -1), false);
});
console.log(`${passed} melee motion checks passed`);
