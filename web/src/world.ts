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

export function wallGridOf(block: Block, interiors = false): UniformGrid<Wall> {
  const grid = new UniformGrid<Wall>(8);
  const add = (w: Wall) => grid.insert({
    minX: Math.min(w.a[0], w.b[0]) - 0.5, maxX: Math.max(w.a[0], w.b[0]) + 0.5,
    minY: Math.min(w.a[1], w.b[1]) - 0.5, maxY: Math.max(w.a[1], w.b[1]) + 0.5,
  }, w);
  for (const b of block.buildings) {
    const door = doorEdgeIndex(b.footprint);
    for (const seg of ringSegments(b.footprint, b.height_m, door)) {
      if (!seg.solid) continue;
      add({ a: seg.a, b: seg.b });
    }
    for (const hole of b.holes) {
      for (const seg of ringSegments(hole, b.height_m, -1)) add({ a: seg.a, b: seg.b });
    }
    if (interiors) for (const w of interiorWalls(b)) add(w);
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

// ---------------------------------------------------------------- 門與室內

const DOOR_W = 1.6;
const PART_H = 2.6;

/** The longest edge of the ring, if it is wide enough to hold a doorway. */
export function doorEdgeIndex(ring: Point[]): number {
  let best = -1;
  let longest = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > longest) { longest = d; best = i; }
  }
  return longest > 2.8 ? best : -1;
}

export type Seg = { a: Point; b: Point; y0: number; y1: number; solid: boolean };

/** Split one ring edge into wall pieces, leaving a doorway with a lintel. */
function ringSegments(ring: Point[], height: number, doorEdge: number): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.01) continue;
    if (i !== doorEdge || len < 2.8) {
      segs.push({ a, b, y0: 0, y1: height, solid: true });
      continue;
    }
    const t = DOOR_W / 2 / len;
    const p1: Point = [a[0] + (b[0] - a[0]) * (0.5 - t), a[1] + (b[1] - a[1]) * (0.5 - t)];
    const p2: Point = [a[0] + (b[0] - a[0]) * (0.5 + t), a[1] + (b[1] - a[1]) * (0.5 + t)];
    segs.push({ a, b: p1, y0: 0, y1: height, solid: true });
    segs.push({ a: p2, b, y0: 0, y1: height, solid: true });
    segs.push({ a: p1, b: p2, y0: 2.1, y1: height, solid: false });
  }
  return segs;
}

function boundsOf(ring: Point[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of ring) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, maxX, minY, maxY };
}

/** Two to four rooms per footprint; every split leaves a gap to walk through. */
export function interiorWalls(b: Building): Wall[] {
  const ring = b.footprint;
  if (ring.length < 3) return [];
  const bb = boundsOf(ring);
  const inset = 0.45;
  const x0 = bb.minX + inset, x1 = bb.maxX - inset;
  const y0 = bb.minY + inset, y1 = bb.maxY - inset;
  const w = x1 - x0, h = y1 - y0;
  if (w < 2.6 || h < 2.6) return [];
  const gap = 1.3;
  const out: Wall[] = [];

  const splitAcross = (at: number, from: number, to: number, vertical: boolean) => {
    const mid = (from + to) / 2;
    if (vertical) {
      out.push({ a: [at, from], b: [at, mid - gap / 2] });
      out.push({ a: [at, mid + gap / 2], b: [at, to] });
    } else {
      out.push({ a: [from, at], b: [mid - gap / 2, at] });
      out.push({ a: [mid + gap / 2, at], b: [to, at] });
    }
  };

  if (w >= h) {
    splitAcross(x0 + w * 0.5, y0, y1, true);
    if (w > 9.5) splitAcross(x0 + w * 0.78, y0, y1, true);
    if (h > 10) splitAcross(y0 + h * 0.55, x0, x0 + w * 0.5, false);
  } else {
    splitAcross(y0 + h * 0.5, x0, x1, false);
    if (h > 9.5) splitAcross(y0 + h * 0.78, x0, x1, false);
    if (w > 10) splitAcross(x0 + w * 0.55, y0, y0 + h * 0.5, true);
  }
  return out;
}

/** Walls only, with doorways punched. `maxH` squashes them for a cutaway view. */
export function cityWalls(bs: Building[], maxH?: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const push = (p: Point, y: number) => { pos.push(p[0], y, -p[1]); };
  const quad = (a: Point, b: Point, y0: number, y1: number) => {
    push(a, y0); push(b, y0); push(b, y1);
    push(a, y0); push(b, y1); push(a, y1);
  };
  for (const b of bs) {
    const raw = Number.isFinite(b.height_m) && b.height_m > 2 && b.height_m < 250 ? b.height_m : 12;
    const h = maxH ? Math.min(raw, maxH) : raw;
    const door = doorEdgeIndex(b.footprint);
    for (const seg of ringSegments(b.footprint, raw, door)) {
      const y0 = Math.min(seg.y0, h);
      const y1 = Math.min(seg.y1, h);
      if (y1 - y0 > 0.02) quad(seg.a, seg.b, y0, y1);
    }
    for (const hole of b.holes) {
      for (const seg of ringSegments(hole, raw, -1)) {
        const y1 = Math.min(seg.y1, h);
        if (y1 > 0.02) quad(seg.a, seg.b, 0, y1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Roof slabs for a group of buildings, each at its own height. */
export function roofGeometry(bs: Building[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const b of bs) {
    const h = Number.isFinite(b.height_m) && b.height_m > 2 && b.height_m < 250 ? b.height_m : 12;
    const ring = b.footprint;
    for (let i = 1; i < ring.length - 1; i++) {
      for (const p of [ring[0], ring[i], ring[i + 1]]) pos.push(p[0], h, -p[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Floors and partitions for a group of buildings, in one vertex-coloured mesh. */
export function interiorGeometry(bs: Building[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const floor = new THREE.Color(0x6d6250);
  const part = new THREE.Color(0xb3ab9a);
  const add = (p: Point, y: number, c: THREE.Color) => {
    pos.push(p[0], y, -p[1]);
    col.push(c.r, c.g, c.b);
  };
  for (const b of bs) {
    const ring = b.footprint;
    for (let i = 1; i < ring.length - 1; i++) {
      for (const p of [ring[0], ring[i], ring[i + 1]]) add(p, 0.035, floor);
    }
    for (const w of interiorWalls(b)) {
      const a = w.a, c = w.b;
      add(a, 0, part); add(c, 0, part); add(c, PART_H, part);
      add(a, 0, part); add(c, PART_H, part); add(a, PART_H, part);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
