/** Read-only camera visibility in the existing metre-based city coordinate frame. */
type Point = readonly [number, number];
export type OcclusionBuilding = { footprint: readonly Point[]; holes: readonly (readonly Point[])[]; height_m: number };
const EPS = 1e-9;
const RX = 40, RZ = -40; // Camera offset (40, 56, 40) maps world Z to negative data Y.
const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;
function inRing(x: number, z: number, ring: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Hide/fade when the segment from player's eye to camera crosses the building volume.
 * Courtyard holes are empty space, not interiors. A ray leaving a courtyard can still
 * cross its surrounding building, so each polygon interval is checked independently.
 * Doors/collisions and source geometry are deliberately untouched.
 */
export function buildingOccludesPlayer(b: OcclusionBuilding, px: number, pz: number): boolean {
  const rings = [b.footprint, ...b.holes];
  if (![px, pz].every(Number.isFinite) || b.footprint.length < 3
    || !rings.every(r => r.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])))) return false;
  const contains = (x: number, z: number) => inRing(x, z, b.footprint) && !b.holes.some(h => inRing(x, z, h));
  if (contains(px, pz)) return true;
  const h = Number.isFinite(b.height_m) && b.height_m > 2 && b.height_m < 250 ? b.height_m : 12;
  const cuts = [0, 1];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const sx = c[0] - a[0], sz = c[1] - a[1];
      if (Math.hypot(sx, sz) < EPS) continue;
      const ax = a[0] - px, az = a[1] - pz;
      const den = cross(RX, RZ, sx, sz);
      if (Math.abs(den) < EPS) {
        // Include endpoints of a collinear wall without division by zero.
        if (Math.abs(cross(ax, az, RX, RZ)) < EPS) {
          for (const p of [a, c]) {
            const t = ((p[0] - px) * RX + (p[1] - pz) * RZ) / (RX * RX + RZ * RZ);
            if (t >= 0 && t <= 1) cuts.push(t);
          }
        }
        continue;
      }
      const t = cross(ax, az, sx, sz) / den;
      const u = cross(ax, az, RX, RZ) / den;
      if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) cuts.push(Math.max(0, Math.min(1, t)));
    }
  }
  cuts.sort((a, c) => a - c);
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1], end = cuts[i];
    if (end - start < EPS || 1 + 56 * start > h + EPS) continue;
    const mid = (start + end) / 2;
    if (contains(px + RX * mid, pz + RZ * mid)) return true;
  }
  return false;
}
