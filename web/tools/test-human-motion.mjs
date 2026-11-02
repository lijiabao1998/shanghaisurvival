// DefendTaipei animator in Shanghai: the visible swing follows the damage arc, plus pose-system invariants.
// Runs the actual survival.ts pose mapping (poseSurvivor) and hand mount (mountHandItem). Not a browser test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as THREE from 'three';
import { buildRig, buildWeapon, ROSTER } from '../src/characters.ts';
import { animate, cloneRig, makeRig, mirrorKey } from '../src/human.ts';
import { MELEE_PROFILES, meleePose } from '../src/melee-motion.ts';
import { createLegacyArsenal, WEAPONS } from '../src/arsenal.ts';
import { createSurvivorSystems } from '../src/survivor-systems.ts';

const source = readFileSync(new URL('../src/survival.ts', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const body = source.indexOf('{', start);
  let end = body + 1, depth = 1;
  while (depth && end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
  return stripTypeScriptTypes(source.slice(start, end));
}
let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };

function survivor(kind, hand, stroke) {
  const rig = buildRig(ROSTER[0]);
  const arsenal = createLegacyArsenal(false, 0);
  const c = vm.createContext({
    rig, THREE, unarmedStance: false, arsenal, survivorSystems: createSurvivorSystems(arsenal), WEAPONS,
    action: 'swing', shootHand: 'right', sneaking: false, swingStroke: stroke, swingHand: hand, grounded: true,
    MELEE_PROFILES, currentSwingProfile: () => ({ kind }), animateHuman: animate,
  });
  for (const name of ['mountHandItem', 'poseSurvivor']) vm.runInContext(extract(name), c);
  const tool = buildWeapon('pipe');
  c.mountHandItem(rig, tool, hand, 'tool');
  return { c, rig, tool };
}
const tipBearing = ({ c, rig, tool }, t) => {
  for (let i = 0; i < 3; i++) c.poseSurvivor(1, 0, t); // long steps let the springs settle on the target pose
  rig.root.updateMatrixWorld(true);
  const tip = tool.localToWorld(new THREE.Vector3(0, 0.72, 0));
  return Math.atan2(tip.x, tip.z);
};

test('visible tool tip follows the damage arc for both strokes and both hands', () => {
  for (const kind of ['blade', 'blunt', 'wrench'])
    for (const hand of ['right', 'left'])
      for (const stroke of [0, 1]) {
        const p = MELEE_PROFILES[kind], s = survivor(kind, hand, stroke);
        const marks = [p.activeStart, (p.activeStart + p.activeEnd) / 2, p.activeEnd];
        const seen = marks.map(t => tipBearing(s, t));
        const want = marks.map(t => meleePose(kind, t, hand, stroke).sweepAngle);
        // The wind-up sits just behind the arc start; from contact on, tool and damage agree closely.
        assert.ok(Math.abs(seen[0] - want[0]) < 0.6, `${kind} ${hand} ${stroke} start ${seen[0].toFixed(2)} vs ${want[0].toFixed(2)}`);
        assert.ok(Math.abs(seen[1] - want[1]) < 0.3, `${kind} ${hand} ${stroke} contact ${seen[1].toFixed(2)} vs ${want[1].toFixed(2)}`);
        assert.ok(Math.abs(seen[2] - want[2]) < 0.35, `${kind} ${hand} ${stroke} end ${seen[2].toFixed(2)} vs ${want[2].toFixed(2)}`);
        const dir = Math.sign(want[2] - want[0]);
        assert.ok(dir * seen[0] < dir * seen[1] && dir * seen[1] < dir * seen[2], `${kind} ${hand} ${stroke} sweeps across: ${seen.map(x => x.toFixed(2))}`);
        console.log(`  ${kind} ${hand} stroke ${stroke}: tip ${seen.map(x => x.toFixed(2)).join(' → ')} | arc ${want.map(x => x.toFixed(2)).join(' → ')}`);
      }
});

test('a right-hand forehand opens on the anatomical right (-X) where the right hand is', () => {
  const rig = buildRig(ROSTER[0]);
  rig.root.updateMatrixWorld(true);
  assert.ok(rig.handR.getWorldPosition(new THREE.Vector3()).x < 0);
  assert.ok(meleePose('blunt', MELEE_PROFILES.blunt.activeStart, 'right', 0).sweepAngle < 0);
});

test('mirrorKey swaps sides and negates only sideways rotations', () => {
  assert.deepEqual(mirrorKey('uaRz', true), ['uaLz', -1]);
  assert.deepEqual(mirrorKey('laLy', true), ['laRy', -1]);
  assert.deepEqual(mirrorKey('thL', true), ['thR', 1]);
  assert.deepEqual(mirrorKey('hipYaw', true), ['hipYaw', -1]);
  assert.deepEqual(mirrorKey('spX', true), ['spX', 1]);
  assert.deepEqual(mirrorKey('stepZ', true), ['stepZ', 1]);
  assert.deepEqual(mirrorKey('uaRz', false), ['uaRz', 1]);
});

test('visual hit-stop holds every joint, then motion resumes', () => {
  const rig = buildRig(ROSTER[1]);
  for (let i = 0; i < 30; i++) animate(rig, 'walk', 3.3, 1 / 60);
  const snap = () => [rig.thL, rig.thR, rig.uaL, rig.spine, rig.hips].map(j => j.rotation.x + j.position.y).join();
  const before = snap();
  rig.freeze = 0.06;
  animate(rig, 'walk', 3.3, 0.03);
  assert.equal(snap(), before);
  animate(rig, 'walk', 3.3, 0.03);
  animate(rig, 'walk', 3.3, 0.03);
  assert.notEqual(snap(), before);
});

test('crowd clones share geometry and materials but animate independently', () => {
  const template = makeRig({ gender: 'f', hair: 0x222222, top: 0x646b56, bottom: 0x333333, shoes: 0x111111, infected: true, height: 1.6 });
  const a = cloneRig(template), b = cloneRig(template);
  assert.equal(a.meshes.length, template.meshes.length);
  assert.equal(a.meshes[0].geometry, template.meshes[0].geometry);
  assert.equal(a.meshes[0].material, template.meshes[0].material);
  assert.notEqual(a.uaR, template.uaR);
  for (let i = 0; i < 40; i++) animate(a, 'walk', 1.6, 1 / 60);
  assert.notEqual(a.thL.rotation.x, b.thL.rotation.x);
  assert.equal(template.thL.rotation.x, 0);
});

test('infected shamble leans forward and reaches only while hunting', () => {
  const template = makeRig({ gender: 'm', hair: 0x222222, top: 0x646b56, bottom: 0x333333, shoes: 0x111111, infected: true });
  const plain = cloneRig(template), infected = cloneRig(template);
  infected.shamble = 1;
  for (let i = 0; i < 90; i++) { animate(plain, 'walk', 1.4, 1 / 60); animate(infected, 'walk', 1.4, 1 / 60); }
  assert.ok(infected.spine.rotation.x > plain.spine.rotation.x + 0.15, 'slumped torso');
  assert.ok(infected.uaL.rotation.x > -0.6, 'arms hang while wandering');
  infected.reach = true;
  for (let i = 0; i < 90; i++) animate(infected, 'walk', 1.6, 1 / 60);
  assert.ok(infected.uaL.rotation.x < -1 && infected.uaR.rotation.x < -0.9, 'arms reach for prey');
});

test('jump tucks the legs without dropping the pelvis; death falls over', () => {
  const rig = buildRig(ROSTER[2]);
  for (let i = 0; i < 20; i++) animate(rig, 'idle', 0, 1 / 30);
  const standing = rig.hips.position.y;
  rig.air = true;
  for (let i = 0; i < 20; i++) animate(rig, 'idle', 0, 1 / 30);
  assert.ok(rig.thL.rotation.x < -0.5 && rig.shL.rotation.x > 0.8, 'knees come up');
  assert.ok(rig.hips.position.y > standing - 0.05, 'pelvis keeps standing height');
  for (let i = 0; i < 10; i++) animate(rig, 'death', 0, 0.2);
  assert.ok(Math.abs(rig.body.rotation.x) + Math.abs(rig.body.rotation.z) > 1, 'body lies down');
});

console.log(`${count} DefendTaipei animator checks passed (no browser)`);
