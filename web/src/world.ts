/** 街區幾何、碰撞與空間查詢：survival 與後續玩法共用。 */
import * as THREE from 'three';
import { UniformGrid } from './spatial';

export type Point = [number, number];
export type Building = { id: string; footprint: Point[]; holes: Point[][]; height_m: number };
export type Block = { buildings: Building[]; spawn: Point };
export type Wall = { a: Point; b: Point };

/** 把建築輪廓擠成一個合併 mesh（牆 + 屋頂），一整片街區只有 1 個 draw call。 */
export function cityGeometry(block: Block): THREE.BufferGeometry {
  const verts: number[] = [];
  const v = (p: Point, y: number) => { verts.push(p[0], y, -p[1]); };
  const quad = (a: Point, b: Point, y0: number, y1: number) => {
    v(a, y0); v(b, y0); v(b, y1);
    v(a, y0); v(b, y1); v(a, y1);
  };
  for (const b of block.buildings) {
    const h = Number.isFinite(b.height_m) && b.height_m > 2 && b.height_m < 250 ? b.height_m : 12;
    const ring = b.footprint;
    for (let i = 0; i < ring.length; i++) quad(ring[i], ring[(i + 1) % ring.length], 0, h);
    for (const hole of b.holes) {
      for (let i = 0; i < hole.length; i++) quad(hole[i], hole[(i + 1) % hole.length], 0, h);
    }
    for (let i = 1; i < ring.length - 1; i++) { v(ring[0], h); v(ring[i], h); v(ring[i + 1], h); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

export function wallGridOf(block: Block): UniformGrid<Wall> {
  const grid = new UniformGrid<Wall>(8);
  for (const b of block.buildings) {
    const ring = b.footprint;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      grid.insert({
        minX: Math.min(a[0], c[0]) - 0.5, maxX: Math.max(a[0], c[0]) + 0.5,
        minY: Math.min(a[1], c[1]) - 0.5, maxY: Math.max(a[1], c[1]) + 0.5,
      }, { a, b: c });
    }
  }
  return grid;
}

/** 回傳「這個位置是否撞牆」。radius 是身體半徑。 */
export function makeCollider(grid: UniformGrid<Wall>) {
  const scratch: Wall[] = [];
  return (x: number, z: number, radius = 0.4): boolean => {
    scratch.length = 0;
    grid.query({ minX: x - radius, maxX: x + radius, minY: z - radius, maxY: z + radius }, scratch);
    for (const w of scratch) {
      const ex = w.b[0] - w.a[0], ey = w.b[1] - w.a[1];
      const t = Math.max(0, Math.min(1, ((x - w.a[0]) * ex + (z - w.a[1]) * ey) / (ex * ex + ey * ey)));
      if (Math.hypot(x - w.a[0] - t * ex, z - w.a[1] - t * ey) < radius) return true;
    }
    return false;
  };
}

function inRing(x: number, z: number, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > z) !== (yj > z) && x < (xj - xi) * (z - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 回傳「這個位置是否在某棟建築的實心範圍內」。 */
export function makeInsideTest(block: Block) {
  return (x: number, z: number): boolean => {
    for (const b of block.buildings) {
      if (inRing(x, z, b.footprint) && !b.holes.some(h => inRing(x, z, h))) return true;
    }
    return false;
  };
}

export type OpenSpot = { x: number; z: number };

/** 在屋外、不撞牆的隨機空地取點；找不到就回傳 null。 */
export function sampleOpenSpot(
  collides: (x: number, z: number, r?: number) => boolean,
  inside: (x: number, z: number) => boolean,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  minDistFrom: OpenSpot | null,
  minDist: number,
  margin = 1.2,
  tries = 60,
): OpenSpot | null {
  for (let i = 0; i < tries; i++) {
    const x = bounds.minX + margin + Math.random() * (bounds.maxX - bounds.minX - margin * 2);
    const z = bounds.minY + margin + Math.random() * (bounds.maxY - bounds.minY - margin * 2);
    if (inside(x, z) || collides(x, z, 0.6)) continue;
    if (minDistFrom && Math.hypot(x - minDistFrom.x, z - minDistFrom.z) < minDist) continue;
    return { x, z };
  }
  return null;
}
