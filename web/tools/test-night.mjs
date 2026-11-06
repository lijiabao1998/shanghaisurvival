import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAVE_VERSION, dayPhase, emptyInventory, loadSnapshot, parseSnapshot, saveSnapshot, CAMPAIGN_START_HOUR, REAL_SECONDS_PER_GAME_HOUR, SUNRISE_HOUR, SUNSET_HOUR, MAX_SECONDS } from '../src/campaign.ts';
import { DAWN_HOUR, DARK_DAYLIGHT, DUSK_WARNING_HOUR, DUSK_WARNING_TEXT, NIGHT_PATROL_LIMIT, NIGHT_PATROL_OFFSET, NIGHT_PATROL_RADIUS, NIGHT_SENSE_MULTIPLIER, NIGHT_WANDER_MULTIPLIER, SHELTER_THREAT_RADIUS, duskWarning, nightRouses, nightSenseMultiplier, nightWanderMultiplier, skipToDawn, SKIP_TO_DAWN_TEXT } from '../src/night.ts';

const fresh = () => ({ version: SAVE_VERSION, mapId: 'block.json', characterId: 'guard', elapsed: 360, hp: 75, stamina: 40, battery: 80,
  outbreak: { hydration: 50, satiety: 40, exposure: 25 }, inventory: emptyInventory(), stash: { ...emptyInventory(), water: 2, food: 2 },
  ammo: 6, hasPistol: true, pistolEquipped: false, position: [3, 4], shelterId: 'building-1', inShelter: true, looted: 1, kills: 1,
  containers: [{ x: 4, z: 5, looted: true }, { x: 6, z: 7, looted: false }],
  enemies: [{ x: 8, z: 9, hp: 0, state: 'dead', faction: 'infected' }, { x: 10, z: 11, hp: 50, state: 'chase', faction: 'raider' }], status: 'alive', restCount: 0 });
const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }; };
const shelter = { x: 0, z: 0 };
const night = (SUNSET_HOUR - CAMPAIGN_START_HOUR) * REAL_SECONDS_PER_GAME_HOUR;
const sleeper = (x, extra = {}) => ({ x, z: 0, hx: x, hz: 0, patrolX: x, patrolZ: 0, state: 'sleep', faction: 'infected', returning: false, ...extra });

assert.equal(dayPhase(0).hour, CAMPAIGN_START_HOUR);
assert.equal(dayPhase(REAL_SECONDS_PER_GAME_HOUR).hour, CAMPAIGN_START_HOUR + 1);
assert.equal(dayPhase(night).hour, SUNSET_HOUR);
assert.equal(dayPhase(night).daylight, 0);
assert.equal(NIGHT_SENSE_MULTIPLIER, 1.35);
assert.equal(nightSenseMultiplier(0, 'infected'), NIGHT_SENSE_MULTIPLIER);
assert.equal(nightSenseMultiplier(DARK_DAYLIGHT - 0.01, 'infected'), NIGHT_SENSE_MULTIPLIER);
assert.equal(nightSenseMultiplier(DARK_DAYLIGHT, 'infected'), 1);
assert.equal(nightSenseMultiplier(0, 'military'), 1);
assert.equal(nightWanderMultiplier(0, 'infected'), NIGHT_WANDER_MULTIPLIER);
assert.equal(nightWanderMultiplier(0.2, 'infected'), 1);

assert.equal(duskWarning(DUSK_WARNING_HOUR - 0.01), null);
assert.equal(duskWarning(DUSK_WARNING_HOUR), DUSK_WARNING_TEXT);
assert.equal(duskWarning(SUNSET_HOUR - 0.01), DUSK_WARNING_TEXT);
assert.equal(duskWarning(SUNSET_HOUR), null);
assert.match(DUSK_WARNING_TEXT[0], /黃昏/);

const clear = { elapsed: night, inShelter: true, shelter, threats: [] };
const duskElapsed = (DUSK_WARNING_HOUR - CAMPAIGN_START_HOUR) * REAL_SECONDS_PER_GAME_HOUR;
const minute = REAL_SECONDS_PER_GAME_HOUR / 60;
assert.equal(dayPhase(duskElapsed).hour, DUSK_WARNING_HOUR);
assert.equal(duskWarning(dayPhase(duskElapsed).hour), DUSK_WARNING_TEXT);
assert.ok(dayPhase(duskElapsed).daylight > 0);
assert.equal(skipToDawn({ ...clear, elapsed: duskElapsed }).reason, 'still-day');
const justBefore = night - minute;
assert.ok(dayPhase(justBefore).hour < SUNSET_HOUR);
assert.ok(dayPhase(justBefore).daylight > 0);
assert.equal(skipToDawn({ ...clear, elapsed: justBefore }).reason, 'still-day');
const afterSunset = night + minute;
assert.ok(dayPhase(afterSunset).hour > SUNSET_HOUR);
assert.equal(dayPhase(afterSunset).daylight, 0);
assert.equal(skipToDawn({ ...clear, elapsed: afterSunset }).ok, true);
const skipped = skipToDawn(clear);
assert.equal(skipped.ok, true);
assert.ok(Math.abs(dayPhase(skipped.elapsed).hour - DAWN_HOUR) < 1e-6);
assert.equal(dayPhase(skipped.elapsed).day, 2);
assert.ok(dayPhase(skipped.elapsed).daylight > 0);
assert.equal(skipToDawn({ ...clear, elapsed: 0 }).reason, 'still-day');
assert.equal(skipToDawn({ ...clear, inShelter: false }).reason, 'not-shelter');
assert.equal(skipToDawn({ ...clear, shelter: null }).reason, 'not-shelter');

const nearby = skipToDawn({ ...clear, threats: [{ x: SHELTER_THREAT_RADIUS, z: 0, state: 'wander' }] });
assert.equal(nearby.ok, false);
assert.equal(nearby.reason, 'enemies-near');
assert.equal(SKIP_TO_DAWN_TEXT['enemies-near'][0], '安全屋附近還有敵人，不能快轉到天亮。');
assert.equal(skipToDawn({ ...clear, threats: [{ x: SHELTER_THREAT_RADIUS + 0.02, z: 0, state: 'sleep' }] }).ok, true);
assert.equal(skipToDawn({ ...clear, threats: [{ x: 1, z: 1, state: 'dead' }] }).ok, true);
const chased = skipToDawn({ ...clear, threats: [{ x: 80, z: 80, state: 'chase' }] });
assert.equal(chased.ok, false);
assert.equal(chased.reason, 'chased');
assert.match(SKIP_TO_DAWN_TEXT.chased[0], /不能快轉/);
assert.equal(skipToDawn({ ...clear, threats: [{ x: 1, z: 1, state: 'chase' }, { x: 2, z: 0, state: 'wander' }] }).reason, 'chased');

const beforeDawn = ((24 + 5) - CAMPAIGN_START_HOUR) * REAL_SECONDS_PER_GAME_HOUR;
const early = skipToDawn({ ...clear, elapsed: beforeDawn });
assert.equal(early.ok, true);
assert.equal(dayPhase(early.elapsed).day, dayPhase(beforeDawn).day);
assert.ok(Math.abs(dayPhase(early.elapsed).hour - DAWN_HOUR) < 1e-6);

let overflow = false;
for (let elapsed = MAX_SECONDS - 1; elapsed > MAX_SECONDS - 40_000; elapsed -= 15) {
  const phase = dayPhase(elapsed);
  if (phase.hour > SUNRISE_HOUR && phase.hour < SUNSET_HOUR) continue;
  const decision = skipToDawn({ elapsed, inShelter: true, shelter, threats: [] });
  if (!decision.ok && decision.reason === 'time-limit') { overflow = true; break; }
  if (decision.ok) assert.ok(decision.elapsed <= MAX_SECONDS);
}
assert.equal(overflow, true);

const saved = fresh();
const store = memory();
assert.equal(saveSnapshot(store, 'save', saved), true);
const raw = store.getItem('save');
const refused = skipToDawn({ elapsed: saved.elapsed, inShelter: true, shelter, threats: [{ x: 2, z: 0, state: 'wander' }] });
assert.equal(refused.reason, 'enemies-near');
assert.equal(store.getItem('save'), raw);
const advanced = structuredClone(saved);
const allowed = skipToDawn({ elapsed: advanced.elapsed, inShelter: true, shelter, threats: [] });
advanced.elapsed = allowed.elapsed;
assert.equal(advanced.version, SAVE_VERSION);
assert.deepEqual(Object.keys(parseSnapshot(JSON.stringify(advanced), 'block.json')).sort(), Object.keys(parseSnapshot(raw, 'block.json')).sort());
assert.equal(loadSnapshot(store, 'save', 'block.json').elapsed, saved.elapsed);
assert.equal(loadSnapshot(store, 'save', 'block.json').version, SAVE_VERSION);

const bodies = [5, 10, 15, 20, 25, 30, 35, 41, 43].map(x => sleeper(x));
bodies.push(sleeper(8, { faction: 'raider' }), sleeper(9, { state: 'dead' }), sleeper(12, { state: 'chase' }));
const orders = nightRouses(bodies, { x: 0, z: 0 }, 0, () => false);
assert.equal(orders.length, NIGHT_PATROL_LIMIT);
assert.deepEqual(orders.map(order => order.index), [0, 1, 2, 3, 4, 5]);
assert.equal(orders[0].x, 5 + NIGHT_PATROL_OFFSET);
assert.ok(orders.every(order => Math.hypot(bodies[order.index].x, bodies[order.index].z) <= NIGHT_PATROL_RADIUS));
assert.deepEqual(nightRouses(bodies, { x: 0, z: 0 }, 0.4, () => false), []);
const blocked = nightRouses(bodies, { x: 0, z: 0 }, 0, (x) => x === 5 + NIGHT_PATROL_OFFSET);
assert.equal(blocked[0].index, 1);
const patrolling = nightRouses([sleeper(0, { patrolX: 4, patrolZ: 0 })], { x: 0, z: 0 }, 0, () => false);
assert.deepEqual(patrolling, [{ index: 0, x: 4, z: 0 }]);
const full = Array.from({ length: NIGHT_PATROL_LIMIT }, (_, index) => sleeper(index + 1, { state: 'wander' }));
full.push(sleeper(8));
assert.deepEqual(nightRouses(full, { x: 0, z: 0 }, 0, () => false), []);
const returning = nightRouses([sleeper(1, { state: 'wander', returning: true }), sleeper(8)], { x: 0, z: 0 }, 0, () => false);
assert.deepEqual(returning.map(order => order.index), [1]);

const survival = readFileSync(new URL('../src/survival.ts', import.meta.url), 'utf8');
for (const needle of ['skipToDawn(', 'skipToDawnText(', 'duskWarning(', 'nightRouses(', 'nightSenseMultiplier(', 'nightWanderMultiplier(', "id='shelter-skip'"]) assert.ok(survival.includes(needle), needle);
assert.equal(survival.includes('nightElapsed'), false);
assert.equal(/version:\s*2/.test(readFileSync(new URL('../src/campaign.ts', import.meta.url), 'utf8')), false);

console.log('PASS night patrol, dusk warning, shelter skip refusals and compatible elapsed');
