import * as THREE from 'three';

/** Decorative, deterministic interpretations, not surveyed storefronts. */
type Point = [number, number];
type Building = { id: string; footprint: Point[]; holes: Point[][]; height_m: number; door_edge: number };
type Road = { centerline: Point[]; width_m: number };

const detailsMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, side: THREE.DoubleSide });
let signMaterial: THREE.MeshBasicMaterial | undefined;
const names = ['巷口面馆', '里弄杂货', '街坊早点', '便民五金', '鲜果小铺', '家常小炒', '邻里理发', '日用百货'];
const backgrounds = ['#805242', '#5f6f60', '#865f4b', '#4d6061', '#a1774f', '#79564a', '#626b72', '#8d7658'];

function getSignMaterial(): THREE.MeshBasicMaterial {
  if (signMaterial) return signMaterial;
  const canvas = document.createElement('canvas');
  // Each atlas cell has the same roughly 8:1 aspect as the sign in the world;
  // otherwise square Chinese glyphs are compressed into illegible horizontal strips.
  canvas.width = 2048; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable for storefront labels');
  for (let i = 0; i < names.length; i++) {
    const x = (i % 4) * 512, y = Math.floor(i / 4) * 64;
    ctx.fillStyle = backgrounds[i]; ctx.fillRect(x, y, 512, 64);
    ctx.strokeStyle = '#e9dcc2'; ctx.lineWidth = 3; ctx.strokeRect(x + 6, y + 5, 500, 54);
    ctx.fillStyle = '#f4ead5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 42px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.fillText(names[i], x + 256, y + 32, 480);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  signMaterial = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  return signMaterial;
}

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = dx * dx + dy * dy;
  if (!d) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = THREE.MathUtils.clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d, 0, 1);
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function insideRing(p: Point, ring: Point[]): boolean {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
function pointInBuilding(p: Point, b: Building): boolean {
  return insideRing(p, b.footprint) && !b.holes.some(h => insideRing(p, h));
}
function roadGap(p: Point, roads: Road[]): number {
  let best = Infinity;
  for (const road of roads) for (let i = 0; i + 1 < road.centerline.length; i++) {
    best = Math.min(best, distanceToSegment(p, road.centerline[i], road.centerline[i + 1]) - road.width_m / 2);
  }
  return best;
}

type V3 = [number, number, number];
class Batch {
  positions: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  constructor(private textured = false) {}
  quad(a: V3, b: V3, c: V3, d: V3, color: number, tile = 0): void {
    const colorValue = new THREE.Color(color);
    const u0 = (tile % 4) / 4, u1 = u0 + .25;
    const v1 = 1 - Math.floor(tile / 4) / 2, v0 = v1 - .5;
    const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const vertices = [a, b, c, d];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.positions.push(...vertices[i]);
      if (this.textured) this.uvs.push(...uv[i]);
      else this.colors.push(colorValue.r, colorValue.g, colorValue.b);
    }
  }
  mesh(material: THREE.Material): THREE.Mesh | null {
    if (!this.positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    if (this.textured) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    else geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }
}

/** All geometry is world-coordinate, in the same x-east/z-south frame as main.ts.
 * Hide the returned group when the corresponding building is inside/occluding.
 * No decoration is added to collision or presented as an observed real business.
 */
export function createFacadeDetails(building: Building, buildings: Building[], roads: Road[]): THREE.Group {
  const group = new THREE.Group();
  group.name = `facade-${building.id}`;
  const ring = building.footprint;
  if (ring.length < 3) return group;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const handedness = area >= 0 ? 1 : -1;
  const seed = hash(building.id);
  const candidates: { i: number; length: number; gap: number; facing: number }[] = [];
  for (let i = 0; i < ring.length; i++) {
    if (i === building.door_edge) continue;
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 5.5) continue;
    const outward: Point = [handedness * dy / length, -handedness * dx / length];
    const outside: Point = [(a[0] + b[0]) / 2 + outward[0] * 1.2, (a[1] + b[1]) / 2 + outward[1] * 1.2];
    // Check the full proposed shopfront width, not only its centre; the canopy
    // projects 0.8 m and should not be drawn through a neighbouring building.
    const width = Math.min(length - 1.2, 8);
    const clear = [-.5, -.25, 0, .25, .5].every(fraction => {
      const offset = fraction * width;
      const p: Point = [outside[0] + dx / length * offset, outside[1] + dy / length * offset];
      return !buildings.some(other => other.id !== building.id && pointInBuilding(p, other));
    });
    if (!clear) continue;
    const gap = roadGap(outside, roads);
    // The orthographic camera looks from east and south: prefer near-road
    // facades facing it, while still allowing any valid street-facing edge.
    const facing = (outward[0] - outward[1]) / Math.SQRT2;
    if (gap < 15 && gap > -3.5) candidates.push({ i, length, gap, facing });
  }
  if (!candidates.length) return group;
  candidates.sort((a, b) => (a.gap - 4 * a.facing) - (b.gap - 4 * b.facing) || b.length - a.length);
  const chosen = candidates[0];
  const a = ring[chosen.i], b = ring[(chosen.i + 1) % ring.length];
  const dx = (b[0] - a[0]) / chosen.length, dy = (b[1] - a[1]) / chosen.length;
  const nx = handedness * dy, ny = -handedness * dx;
  const center: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const width = Math.min(chosen.length - 1.2, 8);
  // x = facade position, y = elevation, out = distance from building surface.
  const vertex = (x: number, y: number, out: number): V3 => [center[0] + dx * x + nx * out, y, -(center[1] + dy * x + ny * out)];
  const batch = new Batch(), signs = new Batch(true);
  const vertical = (x0: number, x1: number, y0: number, y1: number, out: number, color: number) =>
    batch.quad(vertex(x0, y0, out), vertex(x1, y0, out), vertex(x1, y1, out), vertex(x0, y1, out), color);
  const horizontal = (x0: number, x1: number, out0: number, out1: number, y: number, color: number) =>
    batch.quad(vertex(x0, y, out0), vertex(x1, y, out0), vertex(x1, y, out1), vertex(x0, y, out1), color);

  // At ground level either a shop or a residential entrance. Both are decorative,
  // and avoid the separate play-test door edge completely.
  const shop = seed % 5 !== 0;
  if (shop) {
    const trims = [0x8b5b4b, 0x63786b, 0x7c7160, 0x766454];
    vertical(-width / 2, width / 2, .12, 2.55, .035, 0x394e4d); // glass frontage
    vertical(-width / 2, width / 2, 0, .18, .065, 0xb6afa0);
    vertical(-width / 2, width / 2, 2.35, 2.55, .07, trims[seed % trims.length]);
    const bays = Math.max(2, Math.floor(width / 2));
    for (let i = 0; i <= bays; i++) {
      const x = -width / 2 + width * i / bays;
      vertical(x - .045, x + .045, .12, 2.55, .075, 0xb1ada0);
    }
    // Flat colour stripe and projecting canopy; not a claim about the real facade.
    horizontal(-width / 2, width / 2, .08, .8, 2.72, trims[(seed >>> 3) % trims.length]);
    vertical(-width / 2, width / 2, 2.58, 2.75, .80, trims[(seed >>> 3) % trims.length]);
    const signWidth = Math.min(width - .3, 6.0);
    const tile = (seed >>> 5) % names.length;
    signs.quad(vertex(-signWidth / 2, 2.86, .10), vertex(signWidth / 2, 2.86, .10), vertex(signWidth / 2, 3.62, .10), vertex(-signWidth / 2, 3.62, .10), 0xffffff, tile);
  } else {
    vertical(-1.0, 1.0, .1, 2.55, .045, 0x546056);
    vertical(-1.1, 1.1, 2.55, 2.75, .05, 0x9a7d68);
  }

  // A few shallow balcony bands suggest an older residential street. They are
  // attached to the selected facade only and never alter navigation geometry.
  if ((seed & 3) !== 0 && building.height_m >= 7) {
    const w = Math.min(width * .7, 5.5);
    for (let floorY = 4.3; floorY < Math.min(building.height_m - 1.6, 11); floorY += 3.2) {
      horizontal(-w / 2, w / 2, .06, .70, floorY, 0xb3ac9d);
      vertical(-w / 2, w / 2, floorY + .58, floorY + .67, .68, 0x6f726b);
      for (let j = 0; j <= Math.floor(w / 1.1); j++) {
        const x = -w / 2 + j * w / Math.max(1, Math.floor(w / 1.1));
        vertical(x - .035, x + .035, floorY + .04, floorY + .65, .68, 0x6f726b);
      }
    }
  }
  const geometry = batch.mesh(detailsMaterial), labelGeometry = signs.mesh(getSignMaterial());
  if (geometry) group.add(geometry);
  if (labelGeometry) group.add(labelGeometry);
  group.userData.facadeEdge = chosen.i;
  group.userData.shop = shop;
  return group;
}
