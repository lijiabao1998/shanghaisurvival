/** Street life between the lane houses: tangled overhead wires along and across the streets, bamboo
 * laundry poles spanning narrow lanes, parked e-bikes and bicycles, blue road-name signs at corners and
 * stone lane-entrance frames carrying the real lane names. Decorative only: no collision, no saves. */
import * as THREE from 'three';
import { hash01, type LaneHouse, type LaneRoad } from './lane-fabric.ts';
import type { SignAtlas } from './lane-houses.ts';

type V3 = [number, number, number];
type Batch = { p: number[]; c: number[]; uv: number[] };
const tmp = new THREE.Color();
function quad(out: Batch, a: V3, b: V3, c: V3, d: V3, color: number, uv?: [number, number][]) {
  tmp.setHex(color);
  for (const [i, v] of [a, b, c, a, c, d].entries()) {
    out.p.push(...v);
    out.c.push(tmp.r, tmp.g, tmp.b);
    if (uv) out.uv.push(...uv[[0, 1, 2, 0, 2, 3][i]]);
  }
}
const CLOTHES = [0xc0392b, 0x2e5fa8, 0xe8e6e0, 0xd98aa0, 0xd8b13a, 0x7b7f86, 0x3d7a5a, 0xf0ece4] as const;
const BIKE = [0x2b2d30, 0x8a1f1f, 0x1f3f75, 0xd8d8d2, 0x2f5f4a] as const;

export function createLaneLife(houses: LaneHouse[], roads: LaneRoad[], atlas: SignAtlas, center: [number, number], radius: number) {
  const wires: number[] = [];
  const props: Batch = { p: [], c: [], uv: [] };
  const signs: Batch = { p: [], c: [], uv: [] };
  const glow: Batch = { p: [], c: [], uv: [] };
  const pool = (x: number, y: number, r: number, color: number) => {
    tmp.setHex(color);
    const [cr, cg, cb] = [tmp.r, tmp.g, tmp.b];
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
      glow.p.push(...W(x, y, 0.05), ...W(x + Math.cos(a0) * r, y + Math.sin(a0) * r, 0.05), ...W(x + Math.cos(a1) * r, y + Math.sin(a1) * r, 0.05));
      glow.c.push(cr, cg, cb, 0, 0, 0, 0, 0, 0);
    }
  };
  const W = (x: number, y: number, h: number): V3 => [x, h, -y];
  /** axis box oriented by unit direction (ux, uy) in data space */
  const box = (x: number, y: number, ux: number, uy: number, w: number, d: number, y0: number, y1: number, color: number) => {
    const nx = -uy, ny = ux;
    const c = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => [x + ux * a + nx * b, y + uy * a + ny * b]);
    const lo = c.map(p => W(p[0], p[1], y0)), hi = c.map(p => W(p[0], p[1], y1));
    for (let i = 0; i < 4; i++) quad(props, lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i], i % 2 ? tmp.setHex(color).multiplyScalar(0.85).getHex() : color);
    quad(props, hi[0], hi[1], hi[2], hi[3], color);
  };
  const sag = (a: V3, b: V3, drop: number, pieces = 6) => {
    for (let i = 0; i < pieces; i++) {
      const t0 = i / pieces, t1 = (i + 1) / pieces;
      const at = (t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - drop * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
      wires.push(...at(t0), ...at(t1));
    }
  };

  // ---- wires along each row front, and across streets/lanes where both sides are built
  type Cover = { t0: number; t1: number; house: LaneHouse };
  const bySeg = new Map<string, { L: Cover[]; R: Cover[]; seg: [number, number][]; front: number; kind: string }>();
  for (const h of houses) {
    const [a, b] = h.lane.seg, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const t = (p: [number, number]) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
    const ta = t(h.footprint[0]), tb = t(h.footprint[1]);
    const key = `${a[0]},${a[1]},${b[0]},${b[1]}`;
    const entry = bySeg.get(key) ?? { L: [], R: [], seg: [a, b], front: h.lane.front, kind: h.lane.kind };
    (h.lane.side > 0 ? entry.L : entry.R).push({ t0: Math.min(ta, tb), t1: Math.max(ta, tb), house: h });
    bySeg.set(key, entry);
    // wire bundle along the front, pinned at each party wall
    const f0 = h.footprint[0], f1 = h.footprint[1], fl = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
    const nx = (h.footprint[3][0] - f0[0]) / h.lane.depth, ny = (h.footprint[3][1] - f0[1]) / h.lane.depth;
    for (const [k, hgt] of [[0, 4.85], [1, 5.15]] as const) {
      if (k === 1 && hash01(h.id + 'w2') < 0.5) continue;
      let s = 0;
      for (const w of h.lane.units) {
        const p = (q: number): V3 => W(f0[0] + ((f1[0] - f0[0]) * q) / fl - nx * 0.08, f0[1] + ((f1[1] - f0[1]) * q) / fl - ny * 0.08, hgt);
        sag(p(s), p(s + w), 0.12 + 0.1 * hash01(h.id + s), 3);
        s += w;
      }
    }
  }
  let crossings = 0, laundry = 0;
  for (const { L, R, seg, front, kind } of bySeg.values()) {
    const [a, b] = seg, len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = -uy, ny = ux;
    const covered = (list: Cover[], t: number) => list.some(c => t > c.t0 + 0.3 && t < c.t1 - 0.3);
    const pt = (t: number, side: number, hgt: number) => W(a[0] + ux * t + nx * side * (front - 0.06), a[1] + uy * t + ny * side * (front - 0.06), hgt);
    for (let t = 3; t < len - 2; t += kind === 'lane' ? 3.4 : 8.5) {
      if (!covered(L, t) || !covered(R, t)) continue;
      const hsh = hash01(`${a}|${t}`);
      if (kind !== 'lane' || hsh < 0.45) {
        sag(pt(t, 1, 5.0 + hsh * 0.4), pt(t + (hsh - 0.5) * 2, -1, 4.9 + hsh * 0.5), kind === 'lane' ? 0.35 : 0.8);
        crossings++;
      }
      // bamboo poles with washing across a narrow lane
      if (kind === 'lane' && hsh > 0.5) {
        const y = 3.3 + hsh * 0.5;
        const p0 = pt(t, 1, y), p1 = pt(t, -1, y);
        const dx = p1[0] - p0[0], dz = p1[2] - p0[2], span = Math.hypot(dx, dz);
        const tx = -dz / span * 0.02, tz = dx / span * 0.02;
        quad(props, [p0[0] + tx, y, p0[2] + tz], [p1[0] + tx, y, p1[2] + tz], [p1[0] - tx, y + 0.04, p1[2] - tz], [p0[0] - tx, y + 0.04, p0[2] - tz], 0xb59a5c);
        for (let q = 0.12; q < 0.88; q += 0.16) {
          if (hash01(`${t}:${q}`) < 0.3) continue;
          const c = CLOTHES[Math.floor(hash01(`${a}:${q}:${t}`) * CLOTHES.length)], h = 0.45 + 0.45 * hash01(`${q}${t}`);
          const x0 = p0[0] + dx * q, z0 = p0[2] + dz * q, x1 = p0[0] + dx * (q + 0.1), z1 = p0[2] + dz * (q + 0.1);
          quad(props, [x0, y, z0], [x1, y, z1], [x1, y - h, z1], [x0, y - h, z0], c);
        }
        laundry++;
      }
    }
  }

  // ---- parked e-bikes and bicycles along the fronts
  let bikes = 0;
  for (const h of houses) {
    if (bikes >= 260 || hash01(h.id + 'bike') > 0.55) continue;
    const f0 = h.footprint[0], f1 = h.footprint[1], fl = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
    const ux = (f1[0] - f0[0]) / fl, uy = (f1[1] - f0[1]) / fl;
    const nx = (h.footprint[3][0] - f0[0]) / h.lane.depth, ny = (h.footprint[3][1] - f0[1]) / h.lane.depth;
    const n = 1 + Math.floor(hash01(h.id + 'bn') * 3);
    for (let i = 0; i < n; i++) {
      const s = fl * (0.15 + 0.7 * hash01(h.id + 'bs' + i)), off = h.lane.kind === 'lane' ? 0.45 : 0.75;
      const x = f0[0] + ux * s - nx * off, y = f0[1] + uy * s - ny * off;
      // parked slightly askew, wheels along the wall
      const ang = (hash01(h.id + 'ba' + i) - 0.5) * 0.5, cx = Math.cos(ang), sx = Math.sin(ang);
      const bx = ux * cx - uy * sx, by = ux * sx + uy * cx;
      const col = BIKE[Math.floor(hash01(h.id + 'bc' + i) * BIKE.length)];
      const ebike = hash01(h.id + 'be' + i) < 0.6;
      for (const w of [-0.58, 0.58]) box(x + bx * w, y + by * w, bx, by, 0.5, 0.06, 0.05, 0.55, 0x1a1a1a);
      if (ebike) {
        box(x, y, bx, by, 0.9, 0.3, 0.3, 0.62, col);
        box(x - bx * 0.22, y - by * 0.22, bx, by, 0.42, 0.26, 0.62, 0.72, 0x1d1d1d);
        box(x + bx * 0.55, y + by * 0.55, bx, by, 0.1, 0.5, 0.95, 1.0, 0x2a2a2a);
        box(x + bx * 0.5, y + by * 0.5, bx, by, 0.08, 0.08, 0.5, 0.97, 0x3a3a3a);
      } else {
        box(x, y, bx, by, 1.0, 0.04, 0.5, 0.55, col);
        box(x - bx * 0.2, y - by * 0.2, bx, by, 0.05, 0.05, 0.3, 0.85, col);
        box(x - bx * 0.2, y - by * 0.2, bx, by, 0.24, 0.12, 0.85, 0.9, 0x1d1d1d);
        box(x + bx * 0.48, y + by * 0.48, bx, by, 0.06, 0.48, 0.92, 0.96, 0x3a3a3a);
      }
      bikes++;
    }
  }

  // ---- road-name signs at corners and stone frames at named lane entrances
  const plate = (key: string, x: number, y: number, ux: number, uy: number, h: number, w: number, hh: number, out = 0.03) => {
    const cell = atlas.cell(key);
    if (!cell) return;
    const [u0, v0, u1, v1] = cell;
    for (const sgn of [1, -1]) {
      const nx = -uy * sgn * out, ny = ux * sgn * out, ex = ux * sgn * w / 2, ey = uy * sgn * w / 2;
      quad(signs, W(x - ex + nx, y - ey + ny, h), W(x + ex + nx, y + ey + ny, h), W(x + ex + nx, y + ey + ny, h + hh), W(x - ex + nx, y - ey + ny, h + hh), 0xffffff,
        [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  };
  let roadSigns = 0, gates = 0;
  for (const r of roads) {
    if (!r.name || r.centerline.length < 2 || ['footway', 'path', 'steps'].includes(r.type)) continue;
    for (const end of [0, r.centerline.length - 1]) {
      const p = r.centerline[end], q = r.centerline[end === 0 ? 1 : end - 1];
      if (Math.hypot(p[0] - center[0], p[1] - center[1]) > radius) continue;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 6) continue;
      const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len, nx = -uy, ny = ux, half = r.width_m / 2;
      if (r.name.endsWith('弄') && r.width_m <= 6) {
        // lane entrance: two brick piers, a stone lintel and the lane name on both faces
        const x = p[0] + ux * 2.2, y = p[1] + uy * 2.2;
        for (const s of [-1, 1]) box(x + nx * s * (half + 0.1), y + ny * s * (half + 0.1), ux, uy, 0.42, 0.42, 0, 3.55, 0x8a5c4a);
        box(x, y, nx, ny, r.width_m + 0.8, 0.46, 3.4, 3.9, 0xb5ae9e);
        plate('road:' + r.name, x, y, nx, ny, 3.48, 1.1, 0.34, 0.25); // on both faces of the lintel
        // bare bulb hanging under the lintel, lighting the lane mouth
        box(x, y, ux, uy, 0.02, 0.02, 3.0, 3.4, 0x222222);
        quad(glow, W(x - 0.08, y, 2.88), W(x + 0.08, y, 2.88), W(x + 0.08, y, 3.02), W(x - 0.08, y, 3.02), 0xffd08a);
        quad(glow, W(x, y - 0.08, 2.88), W(x, y + 0.08, 2.88), W(x, y + 0.08, 3.02), W(x, y - 0.08, 3.02), 0xffd08a);
        pool(x, y, 3.2, 0x5c3c18);
        gates++;
      } else {
        const x = p[0] + ux * 3 + nx * (half + 0.9), y = p[1] + uy * 3 + ny * (half + 0.9);
        box(x, y, ux, uy, 0.07, 0.07, 0, 2.9, 0x4a5050);
        plate('road:' + r.name, x, y, ux, uy, 2.55, 0.95, 0.27);
        roadSigns++;
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'laoximen-lane-life';
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const mesh = (b: Batch, material: THREE.Material, uv: boolean) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  };
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1b1c1d });
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const signMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, map: atlas.texture });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glowMesh = mesh(glow, glowMat, false);
  glowMesh.name = 'lane-gate-glow';
  glowMesh.renderOrder = 2;
  glowMesh.visible = false;
  group.add(new THREE.LineSegments(wireGeometry, wireMat), mesh(props, propMat, false), mesh(signs, signMat, true), glowMesh);
  const setNight = (amount: number) => {
    const a = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
    glowMesh.visible = a > 0.02;
    glowMat.color.setScalar(a * 1.6);
  };
  return { group, setNight, stats: { wireSegments: wires.length / 6, crossings, laundry, bikes, roadSigns, gates, propTriangles: props.p.length / 9 } };
}
