import assert from 'node:assert/strict';
import { FACTIONS, profileFor } from '../src/factions.ts';
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test('six-encounter mix is deterministic and half infected', () => {
  const counts = { infected: 0, military: 0, police: 0, raider: 0 };
  for (let i = 0; i < 120; i++) {
    counts[profileFor(i).id]++;
    assert.equal(profileFor(i), profileFor(i + 6));
  }
  assert.deepEqual(counts, { infected: 60, military: 20, police: 20, raider: 20 });
});
test('military ranged attack is telegraphed', () => {
  const p = FACTIONS.military;
  assert.equal(p.range, 12); assert.equal(p.damage, 18);
  assert.equal(p.cooldown, 3); assert.equal(p.warningSeconds, 1.5);
});
test('infected preserve original combat values', () => {
  const p = FACTIONS.infected;
  assert.equal(p.speed, 1.6); assert.equal(p.range, 1.3);
  assert.equal(p.damage, 30); assert.equal(p.cooldown, 1.7);
});
test('police are slower close-range enemies; raiders are faster melee', () => {
  assert.equal(FACTIONS.police.range, 2); assert.equal(FACTIONS.police.damage, 12);
  assert.ok(FACTIONS.police.speed < FACTIONS.infected.speed);
  assert.ok(FACTIONS.raider.speed > FACTIONS.infected.speed);
  assert.equal(FACTIONS.raider.damage, 16); assert.ok(FACTIONS.raider.range <= 2);
});
test('profiles are complete, finite and immutable', () => {
  assert.equal(Object.keys(FACTIONS).length, 4);
  for (const [id, p] of Object.entries(FACTIONS)) {
    assert.equal(id, p.id); assert.ok(p.label.length > 0);
    assert.ok(Number.isInteger(p.color) && p.color >= 0 && p.color <= 0xffffff);
    for (const key of ['speed', 'range', 'damage', 'cooldown']) assert.ok(Number.isFinite(p[key]) && p[key] > 0);
    assert.ok(p.warningSeconds >= 0 && p.warningSeconds < p.cooldown);
    assert.ok(Object.isFrozen(p));
    assert.throws(() => { p.damage = 999; }, TypeError);
  }
  assert.ok(Object.isFrozen(FACTIONS));
});
test('invalid encounter indexes are rejected', () => {
  for (const n of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => profileFor(n), RangeError);
});
console.log(`${passed} faction tests passed`);
