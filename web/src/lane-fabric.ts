/** Lane fabric: the old-town row houses that the 2020 CMAB rooftops no longer show, rebuilt along the
 * real OSM lane network around Menghua Street. The streets are real; each house is a fictional,
 * deterministic reconstruction of the typical fabric (narrow 2–3 storey frontages, back-to-back rows,
 * small passages), never a claim that a specific house stood at that spot.
 * Pure planning: no THREE, no DOM. Callers opt new games into LANE_LAYOUT_VERSION only. */
import type { Building, Point } from './world.ts';

type Box = { minX: number; maxX: number; minY: number; maxY: number };
/** Small uniform grid (spatial.ts uses a parameter property that Node's type stripping rejects). */
class Grid<T> {
  cells = new Map<string, T[]>();
  size: number;
  constructor(size: number) {
    this.size = size;
  }
  insert(b: Box, item: T) {
    for (let x = Math.floor(b.minX / this.size); x <= Math.floor(b.maxX / this.size); x++)
      for (let y = Math.floor(b.minY / this.size); y <= Math.floor(b.maxY / this.size); y++) {
        const k = x + ':' + y, c = this.cells.get(k);
        if (c) c.push(item);
        else this.cells.set(k, [item]);
      }
  }
  query(b: Box) {
    const out = new Set<T>();
    for (let x = Math.floor(b.minX / this.size); x <= Math.floor(b.maxX / this.size); x++)
      for (let y = Math.floor(b.minY / this.size); y <= Math.floor(b.maxY / this.size); y++)
        for (const item of this.cells.get(x + ':' + y) ?? []) out.add(item);
    return out;
  }
}

export const LANE_LAYOUT_VERSION = 'laoximen-lanes-v1' as const;
export type LaneRoad = { id: string; centerline: Point[]; width_m: number; type: string; name?: string };
export type FrontKind = 'main' | 'street' | 'lane';
/** One row of attached houses. footprint[0]→footprint[1] is the street frontage. */
export type LaneHouse = Building & {
  door_edge: number;
  lane: {
    road: string;
    name?: string;
    kind: FrontKind;
    depth: number;
    /** frontage width of each house along the row, in order from footprint[0] */
    units: number[];
    floors: number[];
    shop: boolean[];
    /** the road segment this row fronts, which side of it, and the front line's offset from the centreline */
    seg: [Point, Point];
    side: 1 | -1;
    front: number;
  };
};
export type LaneOptions = {
  center: Point;
  radius: number;
  /** points that must stay open: [x, y, clearance radius] */
  keepOpen?: Array<[number, number, number]>;
};

const MAIN = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'primary_link', 'secondary_link', 'tertiary_link']);
const NO_HOUSES = new Set(['footway', 'path', 'steps', 'cycleway', 'pedestrian', 'track', 'corridor']);
/** Clear strip kept between a road edge and a house front (matches the kerb/footpath strip in street-details). */
export function frontMargin(road: Pick<LaneRoad, 'type' | 'width_m'>): number {
  if (MAIN.has(road.type)) return 1.6;
  if (NO_HOUSES.has(road.type)) return 0.6;
  if (road.width_m / 2 >= 3 && !['service', 'living_street'].includes(road.type)) return 1.5;
  return 0.45;
}
export function frontKind(road: Pick<LaneRoad, 'type' | 'width_m'>): FrontKind {
  return MAIN.has(road.type) ? 'main' : frontMargin(road) >= 1.5 ? 'street' : 'lane';
}

/** Deterministic FNV-1a hash → [0, 1). */
export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

type Seg = { a: Point; b: Point; half: number; margin: number; road: number };
type Quad = [Point, Point, Point, Point];
const boxOf = (pts: readonly Point[], pad = 0): Box => ({
  minX: Math.min(...pts.map(p => p[0])) - pad,
  maxX: Math.max(...pts.map(p => p[0])) + pad,
  minY: Math.min(...pts.map(p => p[1])) - pad,
  maxY: Math.max(...pts.map(p => p[1])) + pad,
});
const pointSeg = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = dx * dx + dy * dy;
  const t = d ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const cross = (a: Point, b: Point, p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function segSeg(a: Point, b: Point, c: Point, d: Point) {
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
  if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return 0;
  return Math.min(pointSeg(c, a, b), pointSeg(d, a, b), pointSeg(a, c, d), pointSeg(b, c, d));
}
function inRing(x: number, y: number, ring: readonly Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const quadEdges = (q: Quad) => q.map((p, i) => [p, q[(i + 1) % 4]] as [Point, Point]);
/** Minimum distance between two convex quads (0 when they overlap). */
function quadDistance(p: Quad, q: Quad) {
  if (p.some(v => inRing(v[0], v[1], q)) || q.some(v => inRing(v[0], v[1], p))) return 0;
  let best = Infinity;
  for (const [a, b] of quadEdges(p)) for (const [c, d] of quadEdges(q)) best = Math.min(best, segSeg(a, b, c, d));
  return best;
}

/** Plan rows of attached old-town houses on the free land along every lane within `radius` of `center`. */
export function planLaneFabric(
  source: { buildings: Building[]; roads: LaneRoad[] },
  options: LaneOptions,
): { layoutVersion: typeof LANE_LAYOUT_VERSION; houses: LaneHouse[]; units: number; provenance: string } {
  const all = source.buildings.flatMap(b => b.footprint);
  const bounds = boxOf(all, -2);
  const segs: Seg[] = [];
  const segGrid = new Grid<Seg>(16);
  source.roads.forEach((r, road) => {
    if (!Number.isFinite(r.width_m) || r.width_m <= 0 || r.width_m > 60) return;
    for (let i = 1; i < r.centerline.length; i++) {
      const s: Seg = { a: r.centerline[i - 1], b: r.centerline[i], half: r.width_m / 2, margin: frontMargin(r), road };
      segs.push(s);
      segGrid.insert(boxOf([s.a, s.b], s.half + s.margin + 1), s);
    }
  });
  const wallGrid = new Grid<[Point, Point]>(16);
  const cmabGrid = new Grid<Building>(32);
  for (const b of source.buildings) {
    cmabGrid.insert(boxOf(b.footprint), b);
    for (const ring of [b.footprint, ...b.holes])
      ring.forEach((p, i) => wallGrid.insert(boxOf([p, ring[(i + 1) % ring.length]], 1.5), [p, ring[(i + 1) % ring.length]]));
  }
  const placed = new Grid<Quad>(16);
  const keep = options.keepOpen ?? [];

  const valid = (q: Quad, own: Seg, sameRow: Set<Quad>) => {
    const box = boxOf(q);
    if (box.minX < bounds.minX || box.maxX > bounds.maxX || box.minY < bounds.minY || box.maxY > bounds.maxY) return false;
    const c: Point = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
    if (Math.hypot(c[0] - options.center[0], c[1] - options.center[1]) > options.radius) return false;
    for (const s of segGrid.query(boxOf(q, 8))) {
      const need = s.half + s.margin - (s === own ? 0.02 : 0.1);
      for (const [a, b] of quadEdges(q)) if (segSeg(a, b, s.a, s.b) < need) return false;
      if (inRing(s.a[0], s.a[1], q) || inRing(s.b[0], s.b[1], q)) return false;
    }
    for (const b of cmabGrid.query(box)) if (q.some(v => inRing(v[0], v[1], b.footprint)) || b.footprint.some(v => inRing(v[0], v[1], q))) return false;
    for (const [a, b] of wallGrid.query(boxOf(q, 1.2))) for (const [c2, d] of quadEdges(q)) if (segSeg(a, b, c2, d) < 1.1) return false;
    // attached houses of the same row share a party wall; anything else keeps a 1.2 m back passage
    for (const other of placed.query(boxOf(q, 1.5))) if (!sameRow.has(other) && quadDistance(q, other) < 1.2) return false;
    for (const [x, y, r] of keep) {
      if (inRing(x, y, q)) return false;
      for (const [a, b] of quadEdges(q)) if (pointSeg([x, y], a, b) < r) return false;
    }
    return true;
  };

  const houses: LaneHouse[] = [];
  let unitCount = 0;
  segs.forEach((s, si) => {
    const road = source.roads[s.road];
    if (NO_HOUSES.has(road.type)) return;
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], len = Math.hypot(dx, dy);
    if (len < 4) return;
    const ux = dx / len, uy = dy / len;
    const kind = frontKind(road);
    for (const side of [1, -1]) {
      const nx = -uy * side, ny = ux * side;
      const front = s.half + s.margin;
      const at = (t: number, n: number): Point => [s.a[0] + ux * t + nx * n, s.a[1] + uy * t + ny * n];
      // A row: consecutive houses with one depth; a narrow passage separates rows.
      let row: { start: number; widths: number[]; depth: number; quads: Set<Quad> } | null = null;
      const flush = () => {
        if (!row || !row.widths.length) { row = null; return; }
        const end = row.start + row.widths.reduce((a, b) => a + b, 0);
        // Counter-clockwise ring with the frontage first: front-left, front-right, back-right, back-left.
        const ring: Point[] = side > 0
          ? [at(end, front), at(row.start, front), at(row.start, front + row.depth), at(end, front + row.depth)]
          : [at(row.start, front), at(end, front), at(end, front + row.depth), at(row.start, front + row.depth)];
        const widths = side > 0 ? [...row.widths].reverse() : row.widths;
        const id = `lane:${road.id}:${si}:${side > 0 ? 'L' : 'R'}:${Math.round(row.start * 10)}`;
        const floors = widths.map((_, k) => {
          const h = hash01(`${id}:f${k}`);
          return kind === 'main' ? (h < 0.7 ? 3 : 2) : kind === 'street' ? (h < 0.35 ? 3 : 2) : h < 0.12 ? 3 : 2;
        });
        const shop = widths.map((_, k) => hash01(`${id}:s${k}`) < (kind === 'main' ? 0.75 : kind === 'street' ? 0.5 : 0.08));
        const eave = Math.max(...floors) * 2.95 + 0.35;
        houses.push({
          id, footprint: ring, holes: [], door_edge: 0,
          // occlusion and fading use the ridge height of the pitched roof
          height_m: eave + Math.tan((26 * Math.PI) / 180) * (row.depth / 2) + 0.2,
          lane: { road: road.id, name: road.name, kind, depth: row.depth, units: widths, floors, shop, seg: [s.a, s.b], side: side > 0 ? 1 : -1, front },
        });
        unitCount += widths.length;
        row = null;
      };
      let t = 0.6, k = 0;
      while (t < len - 2.4) {
        const preferred = [3.6, 3.9, 4.2, 4.5][Math.floor(hash01(`${road.id}:${si}:${side}:${k}`) * 4)];
        k++;
        let accepted = false;
        // Keep the street wall continuous: try the row's depth first, then start a new row with
        // any depth, and a narrower house, before giving up on this spot.
        attempt: for (const fresh of row ? [false, true] : [true]) {
          if (fresh) flush();
          for (const w of [preferred, 3.0]) {
            if (t + w > len - 0.4) continue;
            for (const depth of row ? [row.depth] : [9.5, 8, 6.5, 5]) {
              const q: Quad = [at(t, front), at(t + w, front), at(t + w, front + depth), at(t, front + depth)];
              if (!valid(q, s, row?.quads ?? new Set())) continue;
              placed.insert(boxOf(q), q);
              if (!row) row = { start: t, widths: [], depth, quads: new Set() };
              row.widths.push(w);
              row.quads.add(q);
              t += w;
              accepted = true;
              break attempt;
            }
          }
        }
        if (!accepted) {
          flush();
          t += 0.5;
          continue;
        }
        // 3–8 houses per row, then a 1.4 m passage into the block.
        if (row && row.widths.length >= 3 + Math.floor(hash01(`${road.id}:${si}:${side}:row${k}`) * 6)) {
          flush();
          t += 1.4;
        }
      }
      flush();
    }
  });
  return {
    layoutVersion: LANE_LAYOUT_VERSION,
    houses,
    units: unitCount,
    provenance: 'fictional old-town row houses on the real OSM lane network; not surveyed buildings',
  };
}

/** Fast point-in-house test (a grid over the rows); the CMAB test scans every building. */
export function makeLaneInsideTest(houses: Building[]) {
  const grid = new Grid<Building>(16);
  for (const h of houses) grid.insert(boxOf(h.footprint), h);
  return (x: number, y: number) => {
    for (const h of grid.query({ minX: x, maxX: x, minY: y, maxY: y })) if (inRing(x, y, h.footprint)) return true;
    return false;
  };
}
