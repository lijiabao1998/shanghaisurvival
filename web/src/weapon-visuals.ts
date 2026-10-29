import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type FirearmVisualId = 'qsz92-9' | 'qbz95-1' | 'qbz191';

/**
 * Stylised game props, not dimensionally accurate replicas or equipment claims.
 * Mount the group at the hand (same armR hand offset as buildWeapon). Its origin
 * is the grip; the muzzle points down local -Y, width is X and profile height Z.
 * Unlike the existing pipe's +Y shaft, do not inherit its shaft direction.
 * Geometry stays in metres and uses just three materials per disposable prop.
 */
export function buildFirearm(id: FirearmVisualId): THREE.Group {
  if (!['qsz92-9', 'qbz95-1', 'qbz191'].includes(id)) throw new RangeError('Unknown firearm visual');
  const group = new THREE.Group();
  group.name = `firearm:${id}`;
  group.userData = { visualId: id, muzzleAxis: '-Y', stylised: true };
  const body = new THREE.MeshStandardMaterial({ color: 0x30363b, roughness: .78, metalness: .25 });
  const polymer = new THREE.MeshStandardMaterial({ color: id === 'qbz191' ? 0x454c42 : 0x22272b, roughness: .93, metalness: .05 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x69716c, roughness: .7, metalness: .3 });
  const box = (name: string, x: number, y: number, z: number, cy: number, cz: number, material = body) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material);
    mesh.name = name;
    mesh.position.set(0, cy, cz);
    group.add(mesh);
    return mesh;
  };
  const barrel = (length: number, cy: number, cz: number) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, length, 6, 1), body);
    mesh.name = 'barrel'; mesh.position.set(0, cy, cz); group.add(mesh);
  };
  if (id === 'qsz92-9') {
    box('slide', .039, .205, .045, -.055, .035);
    box('frame', .043, .145, .035, -.032, .001, polymer);
    box('grip', .038, .061, .095, .024, -.052, polymer);
    box('trigger-guard', .031, .065, .012, -.039, -.045, polymer);
    box('front-sight', .009, .012, .01, -.135, .062, accent);
    box('rear-sight', .025, .012, .01, .027, .062, accent);
  } else if (id === 'qbz95-1') {
    // Compact bullpup silhouette: the magazine sits behind the hand pivot.
    box('receiver', .071, .40, .10, .04, .035, polymer);
    box('rear-body', .077, .16, .14, .28, .015, polymer);
    box('butt', .083, .026, .15, .373, .015, accent);
    box('fore-end', .064, .16, .075, -.20, .025, polymer);
    barrel(.13, -.335, .041);
    box('grip', .045, .065, .13, 0, -.075, polymer);
    box('magazine', .042, .09, .16, .16, -.085);
    box('carry-front', .022, .027, .065, -.11, .105);
    box('carry-rear', .022, .027, .065, .13, .105);
    box('carry-top', .028, .27, .025, .01, .147, accent);
  } else {
    // Conventional stock and a visibly longer, separated fore-end.
    box('receiver', .065, .205, .10, -.012, .028);
    box('stock-neck', .034, .13, .035, .15, .047);
    box('stock', .063, .16, .10, .265, .012, polymer);
    box('butt', .073, .025, .14, .357, -.005, accent);
    box('fore-end', .065, .23, .083, -.229, .025, polymer);
    barrel(.09, -.39, .041);
    box('grip', .045, .066, .13, .009, -.072, polymer);
    box('magazine', .042, .078, .16, -.105, -.085);
    box('rail', .034, .405, .016, -.128, .087, accent);
    box('front-sight', .02, .02, .035, -.295, .112);
    box('rear-sight', .02, .02, .035, .024, .112);
  }
  // Bake component transforms, then batch by material: three meshes/draw calls
  // per prop instead of one per component. Keep tiny descriptive metadata for
  // silhouette checks, not invisible Object3Ds that still need scene traversal.
  const parts: { name: string; y: number; z: number }[] = [];
  for (const material of [body, polymer, accent]) {
    const geometries: THREE.BufferGeometry[] = [];
    for (const child of [...group.children]) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      if (mesh.material !== material) continue;
      parts.push({ name: mesh.name, y: mesh.position.y, z: mesh.position.z });
      mesh.updateMatrix();
      geometries.push(mesh.geometry.applyMatrix4(mesh.matrix));
      group.remove(mesh);
    }
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!geometry) throw new Error('Incompatible firearm geometry attributes');
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const merged = new THREE.Mesh(geometry, material);
    merged.name = material === body ? 'body-batch' : material === polymer ? 'polymer-batch' : 'accent-batch';
    group.add(merged);
  }
  group.userData.parts = parts;
  return group;
}
