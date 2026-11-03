/** Grey-tile gable roofs on the exact surveyed outline of near-rectangular low-rise CMAB buildings.
 * The ridge runs along the long axis of the minimum-area bounding rectangle; each half of the outline is
 * one plane, so the roof covers exactly the footprint and the walls are topped up to it. Collision and
 * source coordinates are untouched. */
import * as THREE from 'three';

type Point = [number, number];
export const ROOF_PITCH = Math.tan((26 * Math.PI) / 180);
export type RoofFrame = { ux: number; uy: number; vx: number; vy: number; cx: number; cy: number; half: number; minU: number; maxU: number };

const area = (r: Point[]) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
};

/** Ridge frame for buildings that read as one roof: near-rectangular, 4.5–14 m deep, at most 45 m long. */
export function roofFrame(ring: Point[], holes: Point[][] = []): RoofFrame | null {
  if (holes.length || ring.length < 4) return null;
  let best: (RoofFrame & { rect: number }) | null = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, vx = -uy, vy = ux;
    const us = ring.map(p => p[0] * ux + p[1] * uy), vs = ring.map(p => p[0] * vx + p[1] * vy);
    const w = Math.max(...us) - Math.min(...us), h = Math.max(...vs) - Math.min(...vs);
    if (!best || w * h < best.rect) {
      const cu = (Math.max(...us) + Math.min(...us)) / 2, cv = (Math.max(...vs) + Math.min(...vs)) / 2;
      // ridge along the long side
      const long = w >= h;
      const f = long
        ? { ux, uy, vx, vy, half: h / 2, minU: Math.min(...us) - cu, maxU: Math.max(...us) - cu }
        : { ux: vx, uy: vy, vx: -ux, vy: -uy, half: w / 2, minU: Math.min(...vs) - cv, maxU: Math.max(...vs) - cv };
      best = { ...f, cx: ux * cu + vx * cv, cy: uy * cu + vy * cv, rect: w * h };
    }
  }
  if (!best) return null;
  const rectangularity = area(ring) / best.rect, depth = best.half * 2, length = best.maxU - best.minU;
  if (rectangularity < 0.85 || depth < 4.5 || depth > 14 || length > 45) return null;
  const { rect: _r, ...frame } = best;
  return frame;
}

/** Signed distance across the ridge, and the roof height there. */
export const across = (f: RoofFrame, p: Point) => (p[0] - f.cx) * f.vx + (p[1] - f.cy) * f.vy;
export const roofHeight = (f: RoofFrame, eave: number, p: Point) => eave + ROOF_PITCH * Math.max(0, f.half - Math.abs(across(f, p)));

function clip(ring: Point[], f: RoofFrame, side: 1 | -1): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length], dp = across(f, p) * side, dq = across(f, q) * side;
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Roof slopes (render coordinates, tile UVs in 1.6 m repeats), gable infill above the eaves and the ridge line. */
export function pitchedRoof(ring: Point[], f: RoofFrame, eave: number) {
  const roof: number[] = [], uv: number[] = [], gables: number[] = [];
  const cos = Math.cos(Math.atan(ROOF_PITCH));
  const v = (p: Point, out: number[]) => out.push(p[0], roofHeight(f, eave, p), -p[1]);
  for (const side of [1, -1] as const) {
    const half = clip(ring, f, side);
    if (half.length < 3) continue;
    const contour = half.map(p => new THREE.Vector2(p[0], p[1]));
    for (const tri of THREE.ShapeUtils.triangulateShape(contour, []))
      for (const k of tri) {
        const p = half[k];
        v(p, roof);
        uv.push(((p[0] - f.cx) * f.ux + (p[1] - f.cy) * f.uy) / 1.6, (f.half - Math.abs(across(f, p))) / cos / 1.6);
      }
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], da = across(f, a), db = across(f, b);
    const pieces: Array<[Point, Point]> = [];
    if ((da > 0) !== (db > 0) && Math.abs(da - db) > 1e-9) {
      const t = da / (da - db), m: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      pieces.push([a, m], [m, b]);
    } else pieces.push([a, b]);
    for (const [p, q] of pieces) {
      const hp = roofHeight(f, eave, p), hq = roofHeight(f, eave, q);
      if (hp - eave < 1e-3 && hq - eave < 1e-3) continue;
      gables.push(p[0], eave, -p[1], q[0], eave, -q[1], q[0], hq, -q[1], p[0], eave, -p[1], q[0], hq, -q[1], p[0], hp, -p[1]);
    }
  }
  const ridge: [Point, Point] = [
    [f.cx + f.ux * f.minU, f.cy + f.uy * f.minU],
    [f.cx + f.ux * f.maxU, f.cy + f.uy * f.maxU],
  ];
  return { roof, uv, gables, ridge, top: eave + ROOF_PITCH * f.half };
}
