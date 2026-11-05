// The vendored shared character kit must match SOURCE.json byte-for-byte (no hand edits; sync from Taipei).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = new URL('../vendor/character-rig/', import.meta.url).pathname;
const meta = JSON.parse(readFileSync(join(dir, 'SOURCE.json'), 'utf8'));
const seen = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (relative(dir, p) !== 'SOURCE.json') seen.push(relative(dir, p));
  }
};
walk(dir);
assert.deepEqual(seen.sort(), Object.keys(meta.files).sort(), 'vendored file list differs from SOURCE.json');
for (const f of seen) {
  const h = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex');
  assert.equal(h, meta.files[f], `${f} was edited by hand; change defendtaipei/packages/character-rig and run tools/sync-character-rig.mjs`);
}
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
assert.equal(pkg.name, '@lijiabao/character-rig');
assert.equal(pkg.version, meta.version);
// Shanghai's rig and fabric must import the shared kit, not a private fork.
const human = readFileSync(new URL('../src/human.ts', import.meta.url), 'utf8');
assert.match(human, /from '\.\.\/vendor\/character-rig\/src\/index\.ts'/);
assert.doesNotMatch(human, /^class Parts/m);
const fabric = readFileSync(new URL('../src/fabric.ts', import.meta.url), 'utf8');
assert.match(fabric, /vendor\/character-rig\/src\/fabric\.ts/);
console.log(`character-rig ${pkg.version}: ${seen.length} vendored files match SOURCE.json`);
