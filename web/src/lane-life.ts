/** Street life between the lane houses: tangled overhead wires along and across the streets, bamboo
 * laundry poles spanning narrow lanes, wall-mounted 晾衣架, street 電箱, closed 鐵門 shop curtains,
 * 骑楼 colonnades on wider streets, utility poles, parked e-bikes and bicycles, blue road-name signs at
 * corners and stone lane-entrance frames carrying the real lane names. Decorative only: no collision, no saves. */
import * as THREE from 'three';
import { hash01, type LaneHouse, type LaneRoad } from './lane-fabric.ts';
import { GATE_NAMES, KIOSK_NAMES, BANNERS, type SignAtlas } from './lane-houses.ts';

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
const shadeHex = (color: number, k: number) => tmp.setHex(color).multiplyScalar(k).getHex();
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
  let roadSigns = 0, gates = 0, lanterns = 0, banners = 0, kiosks = 0;
  for (const r of roads) {
    if (r.centerline.length < 2 || ['footway', 'path', 'steps'].includes(r.type)) continue;
    // unnamed narrow lanes get an invented 里/坊 name on half of them: it should read as Shanghai, not as a survey
    const invented = !r.name && r.width_m <= 6 && ['service', 'residential', 'living_street', 'unclassified'].includes(r.type) && hash01(r.id + 'gate') < 0.5
      ? GATE_NAMES[Math.floor(hash01(r.id + 'gn') * GATE_NAMES.length)] : null;
    if (!r.name && !invented) continue;
    for (const end of invented ? [0] : [0, r.centerline.length - 1]) {
      const p = r.centerline[end], q = r.centerline[end === 0 ? 1 : end - 1];
      if (Math.hypot(p[0] - center[0], p[1] - center[1]) > radius) continue;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 6) continue;
      const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len, nx = -uy, ny = ux, half = r.width_m / 2;
      if (invented || (r.name!.endsWith('弄') && r.width_m <= 6)) {
        // lane entrance: two brick piers, a stone lintel and the lane name on both faces
        const x = p[0] + ux * 2.2, y = p[1] + uy * 2.2;
        for (const s of [-1, 1]) box(x + nx * s * (half + 0.1), y + ny * s * (half + 0.1), ux, uy, 0.42, 0.42, 0, 3.55, 0x8a5c4a);
        box(x, y, nx, ny, r.width_m + 0.8, 0.46, 3.4, 3.9, 0xb5ae9e);
        if (invented) {
          box(x, y, nx, ny, 1.6, 0.5, 3.9, 4.35, 0xb5ae9e); // small pediment over the lintel
          plate('gate:' + invented, x, y, nx, ny, 3.95, 1.3, 0.34, 0.26);
        } else plate('road:' + r.name!, x, y, nx, ny, 3.48, 1.1, 0.34, 0.25); // on both faces of the lintel
        const key = r.id + ':' + end;
        if (hash01(key + 'lantern') < 0.4) for (const s of [-1, 1]) {
          // red lantern on each pier, glowing at night
          const lx = x + nx * s * (half + 0.1) + ux * 0.4, ly = y + ny * s * (half + 0.1) + uy * 0.4;
          box(lx, ly, ux, uy, 0.02, 0.02, 3.0, 3.3, 0x222222);
          box(lx, ly, ux, uy, 0.34, 0.34, 2.55, 3.0, 0xb8261c);
          box(lx, ly, ux, uy, 0.2, 0.2, 2.5, 2.56, 0xd8a640);
          quad(glow, W(lx - nx * 0.2, ly - ny * 0.2, 2.6), W(lx + nx * 0.2, ly + ny * 0.2, 2.6), W(lx + nx * 0.2, ly + ny * 0.2, 2.95), W(lx - nx * 0.2, ly - ny * 0.2, 2.95), 0xb02a12);
          lanterns++;
        }
        if (hash01(key + 'banner') < 0.22) {
          // red cloth banner strung across the lane a few metres in
          const bx = p[0] + ux * 5, by = p[1] + uy * 5;
          plate('banner:' + BANNERS[Math.floor(hash01(key + 'bt') * BANNERS.length)], bx, by, nx, ny, 3.3, Math.min(r.width_m + 0.4, 5.2), 0.55, 0.01);
          banners++;
        }
        // bare bulb hanging under the lintel, lighting the lane mouth
        box(x, y, ux, uy, 0.02, 0.02, 3.0, 3.4, 0x222222);
        quad(glow, W(x - 0.08, y, 2.88), W(x + 0.08, y, 2.88), W(x + 0.08, y, 3.02), W(x - 0.08, y, 3.02), 0xffd08a);
        quad(glow, W(x, y - 0.08, 2.88), W(x, y + 0.08, 2.88), W(x, y + 0.08, 3.02), W(x, y - 0.08, 3.02), 0xffd08a);
        pool(x, y, 3.2, 0x5c3c18);
        gates++;
      } else {
        const x = p[0] + ux * 3 + nx * (half + 0.9), y = p[1] + uy * 3 + ny * (half + 0.9);
        box(x, y, ux, uy, 0.07, 0.07, 0, 2.9, 0x4a5050);
        plate('road:' + r.name!, x, y, ux, uy, 2.55, 0.95, 0.27);
        roadSigns++;
        if (r.width_m > 6 && hash01(r.id + end + 'kiosk') < 0.35) {
          // corner 烟紙店: a narrow shopfront box with a lit counter window
          const kx = x + ux * 2.2 + nx * 0.6, ky = y + uy * 2.2 + ny * 0.6;
          box(kx, ky, ux, uy, 2.0, 1.3, 0, 2.5, 0x8c7a62);
          box(kx, ky, ux, uy, 2.2, 1.5, 2.5, 2.62, 0x3e4a44);
          const name = KIOSK_NAMES[Math.floor(hash01(r.id + end + 'kn') * KIOSK_NAMES.length)];
          plate('kiosk:' + name, kx - nx * 0.66, ky - ny * 0.66, ux, uy, 2.05, 1.9, 0.42, 0.02);
          const fx = kx - nx * 0.68, fy = ky - ny * 0.68;
          quad(glow, W(fx - ux * 0.8, fy - uy * 0.8, 0.9), W(fx + ux * 0.8, fy + uy * 0.8, 0.9), W(fx + ux * 0.8, fy + uy * 0.8, 1.9), W(fx - ux * 0.8, fy - uy * 0.8, 1.9), 0xd9a050);
          pool(fx - nx * 0.8, fy - ny * 0.8, 2.6, 0x4a3214);
          kiosks++;
        }
      }
    }
  }

  // ---- denser lane clutter: 電箱, wall 晾衣架, closed 鐵門, 骑楼 colonnades, utility poles
  // Capped counts keep propTriangles under the mobile budget; decorative only (no collision).
  let eboxes = 0, racks = 0, rollDoors = 0, arcades = 0, poles = 0, vboards = 0;
  for (const h of houses) {
    const f0 = h.footprint[0], f1 = h.footprint[1], fl = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
    if (fl < 3.2) continue;
    const ux = (f1[0] - f0[0]) / fl, uy = (f1[1] - f0[1]) / fl;
    const nx = (h.footprint[3][0] - f0[0]) / h.lane.depth, ny = (h.footprint[3][1] - f0[1]) / h.lane.depth;
    // street-side electrical cabinets (green or grey) with a conduit climbing the wall
    if (eboxes < 140 && hash01(h.id + 'ebox') < 0.3) {
      const s = fl * (0.06 + 0.12 * hash01(h.id + 'ex'));
      const x = f0[0] + ux * s - nx * 0.2, y = f0[1] + uy * s - ny * 0.2;
      const green = hash01(h.id + 'eg') < 0.58;
      box(x, y, ux, uy, 0.58, 0.3, 0.04, 1.28, green ? 0x3f6b52 : 0x6a6e6c);
      box(x, y, ux, uy, 0.5, 0.24, 0.16, 1.18, green ? 0x2f5542 : 0x55595a);
      box(x + ux * 0.02, y + uy * 0.02, ux, uy, 0.05, 0.05, 1.28, Math.min(4.2, 2.6 + h.lane.floors[0] * 0.8), 0x3a3d3e);
      eboxes++;
    }
    // wall-mounted folding drying racks with hung clothes
    if (racks < 120 && hash01(h.id + 'rack') < 0.34) {
      const s = fl * (0.3 + 0.45 * hash01(h.id + 'rs'));
      const x = f0[0] + ux * s - nx * 0.06, y = f0[1] + uy * s - ny * 0.06;
      const yh = 3.05 + 0.55 * hash01(h.id + 'rh');
      const reach = 1.05 + 0.55 * hash01(h.id + 'rr');
      box(x, y, ux, uy, 0.08, 0.08, yh - 0.04, yh + 0.08, 0x4a5550);
      for (const drop of [0, 0.2]) {
        box(x - nx * (reach * 0.5), y - ny * (reach * 0.5), ux, uy, 0.035, reach, yh - drop, yh - drop + 0.035, 0x6a7570);
      }
      // X-brace under the outer arm
      const ox = x - nx * reach, oy = y - ny * reach;
      box(ox, oy, ux, uy, 0.04, 0.04, yh - 0.55, yh + 0.02, 0x5a6560);
      for (let i = 0; i < 4; i++) {
        if (hash01(h.id + 'rc' + i) < 0.22) continue;
        const d = 0.22 + i * 0.26;
        const c = CLOTHES[Math.floor(hash01(h.id + 'rcl' + i) * CLOTHES.length)];
        const ch = 0.42 + 0.38 * hash01(h.id + 'rch' + i);
        const px = x - nx * d, py = y - ny * d;
        quad(props, W(px - ux * 0.2, py - uy * 0.2, yh - 0.02), W(px + ux * 0.2, py + uy * 0.2, yh - 0.02), W(px + ux * 0.2, py + uy * 0.2, yh - ch), W(px - ux * 0.2, py - uy * 0.2, yh - ch), c);
      }
      racks++;
      laundry++;
    }
    // closed blue/grey metal roll doors over shop openings (reads as 鐵門 from the street)
    if (rollDoors < 95 && h.lane.shop.some(Boolean) && hash01(h.id + 'iron') < 0.42) {
      let s = 0;
      for (let k = 0; k < h.lane.units.length; k++) {
        const w = h.lane.units[k];
        if (h.lane.shop[k] && w >= 3.2 && hash01(h.id + 'ir' + k) < 0.5 && rollDoors < 95) {
          const mid = s + w / 2;
          const x = f0[0] + ux * mid - nx * 0.07, y = f0[1] + uy * mid - ny * 0.07;
          const col = hash01(h.id + 'irc' + k) < 0.55 ? 0x3a5a8c : 0x6e7270;
          box(x, y, ux, uy, w - 0.38, 0.24, 2.52, 2.86, 0x55595a);
          box(x, y, ux, uy, w - 0.42, 0.09, 0.04, 2.52, col);
          for (let yy = 0.22; yy < 2.48; yy += 0.17) box(x, y, ux, uy, w - 0.46, 0.1, yy, yy + 0.028, shadeHex(col, 0.86));
          for (const side of [-1, 1]) box(x + ux * side * (w / 2 - 0.24), y + uy * side * (w / 2 - 0.24), ux, uy, 0.09, 0.14, 0.04, 2.52, 0x4a4e4c);
          rollDoors++;
        }
        s += w;
      }
    }
    // projecting vertical lightbox shell beside a shop (竖招牌); atlas lettering lives on house boards
    if (vboards < 80 && h.lane.shop.some(Boolean) && hash01(h.id + 'vboard') < 0.28) {
      let s = 0;
      for (let k = 0; k < h.lane.units.length; k++) {
        const w = h.lane.units[k];
        if (h.lane.shop[k] && hash01(h.id + 'vb' + k) < 0.55 && vboards < 80) {
          const side = hash01(h.id + 'vs' + k) < 0.5 ? s + 0.18 : s + w - 0.18;
          const x = f0[0] + ux * side - nx * 0.55, y = f0[1] + uy * side - ny * 0.55;
          const face = [0xc8261d, 0xf3efe2, 0x1d4f99, 0x1f6b45][Math.floor(hash01(h.id + 'vc' + k) * 4)];
          box(x, y, ux, uy, 0.08, 0.08, 5.05, 5.2, 0x2a2a2a);
          box(x, y, ux, uy, 0.16, 0.68, 3.5, 5.15, 0x222222);
          // lit faces on both long sides
          for (const sgn of [-1, 1]) {
            const ox = x + ux * sgn * 0.09, oy = y + uy * sgn * 0.09;
            quad(props,
              W(ox - nx * 0.05, oy - ny * 0.05, 3.58), W(ox - nx * 0.6, oy - ny * 0.6, 3.58),
              W(ox - nx * 0.6, oy - ny * 0.6, 5.05), W(ox - nx * 0.05, oy - ny * 0.05, 5.05), face);
          }
          // readable horizontal board above the vertical shell
          plate('shop:' + (['烟纸店', '南货店', '理发店', '生煎馒头', '小馄饨', '粮油店', '五金交电', '修车铺'][Math.floor(hash01(h.id + 'hs' + k) * 8)]), x - nx * 0.2, y - ny * 0.2, ux, uy, 5.25, 1.35, 0.38, 0.05);
          if (hash01(h.id + 'vglow' + k) < 0.75) {
            quad(glow, W(x - nx * 0.1, y - ny * 0.1, 3.7), W(x - nx * 0.55, y - ny * 0.55, 3.7), W(x - nx * 0.55, y - ny * 0.55, 4.9), W(x - nx * 0.1, y - ny * 0.1, 4.9), face === 0xf3efe2 ? 0xd9c8a0 : face);
            pool(x - nx * 0.5, y - ny * 0.5, 1.5, 0x3a2416);
          }
          vboards++;
          break;
        }
        s += w;
      }
    }
    // 骑楼: columns + flat ceiling over the pavement on wider street shopfronts
    if (arcades < 72 && h.lane.kind === 'main' && h.lane.shop.some(Boolean) && fl >= 6 && hash01(h.id + 'arc') < 0.38) {
      const depth = 1.65;
      const ySlab = 3.15;
      // ceiling slab
      box(f0[0] + ux * (fl / 2) - nx * (depth / 2), f0[1] + uy * (fl / 2) - ny * (depth / 2), ux, uy, fl - 0.2, depth, ySlab, ySlab + 0.14, 0xb8b2a4);
      // fascia beam
      box(f0[0] + ux * (fl / 2) - nx * depth, f0[1] + uy * (fl / 2) - ny * depth, ux, uy, fl - 0.15, 0.16, ySlab - 0.08, ySlab + 0.18, 0x8a8476);
      const cols = Math.max(2, Math.min(5, Math.floor(fl / 3.2) + 1));
      for (let i = 0; i < cols; i++) {
        const s = 0.35 + ((fl - 0.7) * i) / Math.max(1, cols - 1);
        const x = f0[0] + ux * s - nx * depth, y = f0[1] + uy * s - ny * depth;
        box(x, y, ux, uy, 0.28, 0.28, 0, ySlab, 0xcbc4b4);
        box(x, y, ux, uy, 0.36, 0.36, 0, 0.12, 0x9a9588);
      }
      arcades++;
    }
  }
  // utility poles with transformer cans and a nest of short wire stubs
  for (const r of roads) {
    if (poles >= 48 || r.centerline.length < 2 || r.width_m < 5) continue;
    if (['footway', 'path', 'steps'].includes(r.type)) continue;
    const a = r.centerline[0], b = r.centerline[Math.min(r.centerline.length - 1, Math.floor(r.centerline.length / 2))];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 12) continue;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = -uy, ny = ux;
    for (const t of [8, len * 0.55, len - 10]) {
      if (t < 6 || t > len - 6 || poles >= 48) continue;
      if (hash01(r.id + 'pole' + t) > 0.35) continue;
      if (Math.hypot(a[0] + ux * t - center[0], a[1] + uy * t - center[1]) > radius) continue;
      const side = hash01(r.id + 'ps' + t) < 0.5 ? 1 : -1;
      const x = a[0] + ux * t + nx * side * (r.width_m / 2 + 0.55);
      const y = a[1] + uy * t + ny * side * (r.width_m / 2 + 0.55);
      box(x, y, ux, uy, 0.18, 0.18, 0, 7.2, 0x8a8678);
      // transformer can with cooling fins
      box(x, y, ux, uy, 0.55, 0.4, 5.2, 6.1, 0x6e7270);
      for (const dy of [5.35, 5.55, 5.75, 5.95]) box(x, y, ux, uy, 0.62, 0.08, dy, dy + 0.04, 0x55595a);
      box(x, y, ux, uy, 0.35, 0.28, 6.15, 6.55, 0x3f6b52);
      sag(W(x, y, 6.4), W(x + ux * 4 + nx * side * 2, y + uy * 4 + ny * side * 2, 5.4), 0.45, 4);
      poles++;
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
  return { group, setNight, stats: { wireSegments: wires.length / 6, crossings, laundry, bikes, roadSigns, gates, lanterns, banners, kiosks, eboxes, racks, rollDoors, arcades, poles, vboards, propTriangles: props.p.length / 9 } };
}
