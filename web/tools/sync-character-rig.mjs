// Refresh web/vendor/character-rig from a DefendTaipei-Lab checkout (Taipei is the baseline).
// Usage: node tools/sync-character-rig.mjs ../../defendtaipei
// Never edit the vendored files by hand: change them in defendtaipei/packages/character-rig, then sync.
import { createHash } from 'node:crypto';
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('usage: node tools/sync-character-rig.mjs <path-to-defendtaipei>');
const from = join(src, 'packages/character-rig');
const to = new URL('../vendor/character-rig/', import.meta.url).pathname;
const meta = JSON.parse(readFileSync(join(to, 'SOURCE.json'), 'utf8'));
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
const files = {};
const walk = (d) => {
  for (const n of readdirSync(d).sort()) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(to, p)] = createHash('sha256').update(readFileSync(p)).digest('hex');
  }
};
walk(to);
const pkg = JSON.parse(readFileSync(join(to, 'package.json'), 'utf8'));
writeFileSync(
  join(to, 'SOURCE.json'),
  JSON.stringify({ ...meta, version: pkg.version, files: Object.fromEntries(Object.entries(files).sort()) }, null, 2) + '\n',
);
console.log(`synced @lijiabao/character-rig ${pkg.version}: ${Object.keys(files).length} files`);
