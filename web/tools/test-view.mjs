import assert from 'node:assert/strict';
import {viewHeight} from '../src/view.ts';
assert.equal(viewHeight(16/9,false),44);
assert.equal(viewHeight(16/9,true),44);
assert.equal(viewHeight(1,true),44);
assert.ok(Math.abs(viewHeight(390/844,true)-2*16/(390/844)*.62)<1e-9);
assert.equal(viewHeight(16/9,false,2),22);
assert.equal(viewHeight(NaN,false,NaN),44);
console.log('PASS Taipei-aligned desktop/portrait/landscape orthographic scale, zoom and invalid inputs');
