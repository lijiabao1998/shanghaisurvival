import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MeleeKind } from './melee-motion';

export type MeleeToolId = 'cleaver' | 'wrench';
/** Arcade balance only, not real-world injury or tool specifications. Uses the
 * existing blade/blunt timing, stamina and swept-hit rules from melee-motion. */
export const TOOL_COMBAT: Readonly<Record<MeleeToolId, Readonly<{
  kind: MeleeKind; damage: number; reach: number; knockback: number; name: string;
}>>> = Object.freeze({
  cleaver: Object.freeze({ kind: 'blade', damage: 39, reach: 1.35, knockback: .8, name: '菜刀' }),
  wrench: Object.freeze({ kind: 'wrench', damage: 34, reach: 1.45, knockback: 1.2, name: '扳手' }),
});
export function isMeleeTool(value: unknown): value is MeleeToolId {
  return value === 'cleaver' || value === 'wrench';
}

/** Original low-poly props. Grip origin and +Y shaft match buildWeapon('pipe');
 * mount at the same hand offset/rotation. Width X, thin blade/head axis Z.
 * No textures, runtime collision, gameplay state or per-part draw calls. */
export function buildMeleeTool(id: MeleeToolId): THREE.Group {
  if (!isMeleeTool(id)) throw new RangeError('Unknown melee tool');
  const group = new THREE.Group();
  group.name = `melee-tool:${id}`;
  group.userData = { visualId: id, shaftAxis: '+Y', stylised: true, parts: [] as string[] };
  const metal = new THREE.MeshStandardMaterial({ color: id === 'cleaver' ? 0xaeb6b7 : 0x858f94, roughness: .48, metalness: .65 });
  const grip = new THREE.MeshStandardMaterial({ color: id === 'cleaver' ? 0x614635 : 0x454c46, roughness: .94, metalness: .02 });
  const batches: THREE.BufferGeometry[][] = [[], []];
  const box = (name: string, x: number, y: number, z: number, cx: number, cy: number, cz = 0, material = 0) => {
    const geometry = new THREE.BoxGeometry(x, y, z);
    geometry.translate(cx, cy, cz);
    batches[material].push(geometry); group.userData.parts.push(name);
  };
  if (id === 'cleaver') {
    box('wood-handle', .047, .15, .038, 0, .025, 0, 1);
    box('steel-ferrule', .052, .018, .042, 0, .106);
    // Broad rectangular kitchen blade, with a distinct thin cutting-edge strip.
    box('blade', .157, .205, .014, .044, .2185);
    box('cutting-edge', .009, .205, .006, .127, .2185);
    box('spine', .012, .205, .019, -.0365, .2185);
    for (const y of [-.018, .066]) box('handle-rivet', .012, .012, .041, 0, y);
  } else {
    box('steel-shank', .038, .335, .026, 0, .125);
    box('grip-inset', .042, .145, .032, 0, .024, 0, 1);
    // U-shaped open-ended jaw: open air between .035-wide shoulders. No face
    // bridges the mouth (x ±.025, y .338.. .411), so its outline reads at scale.
    box('jaw-heel', .12, .046, .031, 0, .315);
    box('jaw-left', .035, .073, .031, -.0425, .3745);
    box('jaw-right', .035, .073, .031, .0425, .3745);
    box('butt', .05, .025, .032, 0, -.044);
  }
  for (let i = 0; i < batches.length; i++) {
    const geometry = mergeGeometries(batches[i], false);
    batches[i].forEach(g => g.dispose());
    if (!geometry) throw new Error('Incompatible melee geometry');
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, i === 0 ? metal : grip);
    mesh.name = i === 0 ? 'metal-batch' : 'grip-batch'; group.add(mesh);
  }
  return group;
}
