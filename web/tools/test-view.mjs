import assert from 'node:assert/strict';
import {viewHeight,roomViewHeight} from '../src/view.ts';
assert.equal(viewHeight(16/9,false),44);
assert.equal(viewHeight(16/9,true),44);
assert.equal(viewHeight(1,true),44);
assert.ok(Math.abs(viewHeight(390/844,true)-2*16/(390/844)*.62)<1e-9);
assert.equal(viewHeight(16/9,false,2),22);
assert.equal(viewHeight(NaN,false,NaN),44);
console.log('PASS Taipei-aligned desktop/portrait/landscape orthographic scale, zoom and invalid inputs');

assert.equal(roomViewHeight(16/9),8);
assert.ok(Math.abs(roomViewHeight(390/844)*(390/844)-6)<1e-9,'portrait keeps 6m horizontal room framing');
assert.equal(roomViewHeight(NaN),8);
assert.equal(roomViewHeight(0),8);
assert.equal(viewHeight(16/9,false,1.4),44/1.4,'room view never mutates stored street zoom');
console.log('PASS close room framing for desktop and portrait; separate street zoom');
