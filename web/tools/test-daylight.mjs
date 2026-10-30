import assert from 'node:assert/strict';
import {daylightProfile as profile} from '../src/daylight.ts';
const night=profile(0),day=profile(12),dawn=profile(6),dusk=profile(18);
assert.equal(night.stage,'夜晚');assert.equal(day.stage,'白晝');assert.equal(dawn.stage,'黎明');assert.equal(dusk.stage,'黃昏');
assert.equal(day.lamps,0);assert.equal(night.lamps,1);assert.ok(day.hemiIntensity>night.hemiIntensity);assert.notEqual(day.sky,night.sky);
assert.deepEqual(profile(24),night);assert.deepEqual(profile(NaN),profile(8));
for(let h=0;h<24;h+=.05){const p=profile(h);for(const k of ['lamps','daylight'])assert.ok(p[k]>=0&&p[k]<=1);assert.ok(p.hemiIntensity>=1.15,'night remains readable');assert.ok(Number.isFinite(p.sky));}
console.log('PASS visible day/night palettes, twilight stages, lamps, readable night and continuous campaign clock mapping');
