import * as THREE from 'three';

// Street furniture is procedural illustration, not measured OSM feature data.
// Roads and buildings stay unmodified; decorations intentionally have no collision.
type Point = [number, number];
type Road = { id: string; centerline: Point[]; width_m: number; type: string };
type Building = { footprint: Point[]; holes: Point[][] };
type Placement = { p: Point; angle: number; side: number; kind: 'lamp' | 'tree' | 'bin' | 'scooter' | 'car'; variant: number };
type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] };

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function distance(a: Point, b: Point): number { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  if (!l2) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function inRing(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [px, py] = ring[j];
    if ((y > p[1]) !== (py > p[1]) && p[0] < (px - x) * (p[1] - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}
function clearBuilding(p: Point, buildings: Building[], clearance: number): boolean {
  for (const b of buildings) {
    if (inRing(p, b.footprint) && !b.holes.some(h => inRing(p, h))) return false;
    for (const ring of [b.footprint, ...b.holes]) {
      for (let i = 0; i < ring.length; i++) {
        if (segmentDistance(p, ring[i], ring[(i + 1) % ring.length]) < clearance) return false;
      }
    }
  }
  return true;
}

/** Add seeded, explicitly illustrative details along OSM road edges. */
export function addStreetDetails(scene: THREE.Scene, roads: Road[], buildings: Building[], spawn: Point, entrance: Point) {
  const placements: Placement[] = [];
  const roadSegments = roads.flatMap(r => r.centerline.slice(1).map((b, i) => ({ a: r.centerline[i], b, width: r.width_m })));
  const limits = { lamp: 22, tree: 18, bin: 14, scooter: 16, car: 7 };
  const counts = { lamp: 0, tree: 0, bin: 0, scooter: 0, car: 0 };
  const kinds: Placement['kind'][] = ['lamp', 'scooter', 'tree', 'bin', 'lamp', 'car', 'tree', 'scooter'];
  for (const road of roads) {
    const seed = hash(road.id);
    let travelled = 0;
    let next = 5 + seed % 9;
    for (let i = 1; i < road.centerline.length; i++) {
      const a = road.centerline[i - 1], b = road.centerline[i];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < .01) continue;
      while (next < travelled + len) {
        const t = (next - travelled) / len;
        const step = Math.round(next);
        const h = hash(`${road.id}:${step}`), kind = kinds[h % kinds.length];
        // More setback for large props. These positions are not present-day surveys.
        const setback = kind === 'car' ? 2.2 : kind === 'tree' ? 1.8 : 1.25;
        for (const side of [h & 1 ? 1 : -1, h & 1 ? -1 : 1]) {
          const offset = road.width_m / 2 + setback;
          const p: Point = [a[0] + dx * t + dy / len * offset * side, a[1] + dy * t - dx / len * offset * side];
          const clearance = kind === 'car' ? 2.3 : kind === 'tree' ? 1.8 : 1.1;
          if (counts[kind] >= limits[kind] || p[0] < 3 || p[1] < 3 || p[0] > 247 || p[1] > 247 || distance(p, spawn) < 9 || distance(p, entrance) < 7) continue;
          if (placements.some(prev => distance(p, prev.p) < (kind === 'car' || prev.kind === 'car' ? 7 : 4.5))) continue;
          if (roadSegments.some(s => segmentDistance(p, s.a, s.b) < s.width / 2 + .35)) continue;
          if (!clearBuilding(p, buildings, clearance)) continue;
          placements.push({ p, angle: Math.atan2(-dy, dx), side, kind, variant: h % 3 });
          counts[kind]++;
          break;
        }
        next += 12 + h % 8;
      }
      travelled += len;
    }
  }

  const group = new THREE.Group();
  group.name = '示意街景';
  const mats = {
    pole: new THREE.MeshStandardMaterial({ color: 0x555e5d, roughness: 1 }),
    light: new THREE.MeshStandardMaterial({ color: 0xe3dcc0, roughness: .8, emissive: 0x282417 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x6a6556, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x6e8565, roughness: 1 }),
    leaf2: new THREE.MeshStandardMaterial({ color: 0x879473, roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x4c5657, roughness: .9 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x242e30, roughness: 1 }),
    bin: new THREE.MeshStandardMaterial({ color: 0x657a69, roughness: 1 }),
    red: new THREE.MeshStandardMaterial({ color: 0xa96352, roughness: .85 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xc8bea4, roughness: .8 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x697e86, roughness: .85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x688086, roughness: .45 }),
  };
  const batches = new Map<string, Batch>();
  const geometries = {
    pole: new THREE.CylinderGeometry(.08, .11, 4.4, 6),
    arm: new THREE.BoxGeometry(1, .08, .08),
    lamp: new THREE.BoxGeometry(.55, .16, .35),
    trunk: new THREE.CylinderGeometry(.17, .25, 2.6, 6),
    crown: new THREE.IcosahedronGeometry(1.45, 1),
    bin: new THREE.BoxGeometry(.72, .9, .62),
    lid: new THREE.BoxGeometry(.8, .09, .7),
    car: new THREE.BoxGeometry(3.8, .62, 1.55),
    cabin: new THREE.BoxGeometry(1.8, .6, 1.35),
    window: new THREE.BoxGeometry(1.45, .38, 1.38),
    scooter: new THREE.BoxGeometry(1.6, .34, .45),
    saddle: new THREE.BoxGeometry(.48, .17, .4),
    wheel: new THREE.CylinderGeometry(.26, .26, .13, 8),
    handle: new THREE.BoxGeometry(.1, .8, .1),
  };
  function part(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, pos: THREE.Vector3, rotation: THREE.Euler, scale = new THREE.Vector3(1, 1, 1)) {
    const batch = batches.get(name) ?? { geometry, material, matrices: [] };
    batch.matrices.push(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rotation), scale));
    batches.set(name, batch);
  }
  function addAt(p: Placement, dx: number, y: number, dz: number) {
    const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
    return new THREE.Vector3(p.p[0] + dx * cos + dz * sin, y, -p.p[1] - dx * sin + dz * cos);
  }
  for (const p of placements) {
    const yaw = new THREE.Euler(0, p.angle, 0);
    if (p.kind === 'lamp') {
      part('pole', geometries.pole, mats.pole, addAt(p, 0, 2.2, 0), yaw);
      part('arm', geometries.arm, mats.pole, addAt(p, .45, 4.35, 0), yaw);
      part('lamp', geometries.lamp, mats.light, addAt(p, .85, 4.32, 0), yaw);
    } else if (p.kind === 'tree') {
      part('trunk', geometries.trunk, mats.bark, addAt(p, 0, 1.3, 0), yaw);
      const mat = p.variant === 0 ? mats.leaf2 : mats.leaf;
      part(p.variant === 0 ? 'crown2' : 'crown', geometries.crown, mat, addAt(p, 0, 3.15, 0), yaw, new THREE.Vector3(1, 1.1, 1));
    } else if (p.kind === 'bin') {
      part('bin', geometries.bin, mats.bin, addAt(p, 0, .45, 0), yaw);
      part('lid', geometries.lid, mats.metal, addAt(p, 0, .94, 0), yaw);
    } else {
      const color = p.variant === 0 ? mats.red : p.variant === 1 ? mats.cream : mats.blue;
      if (p.kind === 'car') {
        part(`car${p.variant}`, geometries.car, color, addAt(p, 0, .58, 0), yaw);
        part(`cabin${p.variant}`, geometries.cabin, color, addAt(p, -.25, 1.15, 0), yaw);
        part('glass', geometries.window, mats.glass, addAt(p, -.25, 1.17, 0), yaw);
        for (const x of [-1.2, 1.2]) for (const z of [-.76, .76]) part('wheels', geometries.wheel, mats.tire, addAt(p, x, .27, z), new THREE.Euler(Math.PI / 2, p.angle, 0));
      } else {
        part(`scooter${p.variant}`, geometries.scooter, color, addAt(p, 0, .62, 0), yaw);
        part('saddle', geometries.saddle, mats.tire, addAt(p, -.22, .88, 0), yaw);
        part('handle', geometries.handle, mats.metal, addAt(p, .66, 1.02, 0), yaw);
        for (const x of [-.55, .55]) part('wheels', geometries.wheel, mats.tire, addAt(p, x, .27, 0), new THREE.Euler(Math.PI / 2, p.angle, 0));
      }
    }
  }
  for (const { geometry, material, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  scene.add(group);
  return { group, counts, total: placements.length };
}
