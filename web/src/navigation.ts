/** Bounded local steering, not a full-city navmesh. All distances are metres. */
export type LocalWaypoint = { x: number; z: number };
type Node = { ix: number; iz: number; g: number; f: number; parent?: Node; order: number };
const RADIUS = 0.34;
const RANGE = 40;
const STEP = 0.25;
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]] as const;

/**
 * Returns waypoints excluding the start and including the exact target, or [] on
 * failure. Valid budgets are positive integers, capped at 500 expanded nodes.
 * Both endpoints must be clear. A clear direct route requires no grid search.
 * The caller must re-check movement against collision as the world may change.
 */
export function findLocalPath(
  sx: number, sz: number, tx: number, tz: number,
  blocked: (x: number, z: number, r?: number) => boolean,
  budget = 500,
): LocalWaypoint[] {
  if (![sx, sz, tx, tz, budget].every(Number.isFinite) || !Number.isInteger(budget) || budget < 1) return [];
  if (Math.hypot(tx - sx, tz - sz) > RANGE) return [];
  if (blocked(sx, sz, RADIUS) || blocked(tx, tz, RADIUS)) return [];
  const clear = (ax: number, az: number, bx: number, bz: number): boolean => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (blocked(ax + (bx - ax) * t, az + (bz - az) * t, RADIUS)) return false;
    }
    return true;
  };
  if (clear(sx, sz, tx, tz)) return [{ x: tx, z: tz }];
  const key = (x: number, z: number) => `${x},${z}`;
  let order = 0;
  const start: Node = { ix: 0, iz: 0, g: 0, f: Math.hypot(tx - sx, tz - sz), order: order++ };
  const open = [start];
  const best = new Map<string, number>([[key(0, 0), 0]]);
  const closed = new Set<string>();
  let expanded = 0;
  while (open.length && expanded < Math.min(budget, 500)) {
    // At most eight candidates per expansion: a linear queue is deliberately
    // simple, deterministic and bounded; no dependency or mutable global state.
    let at = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[at].f || (open[i].f === open[at].f && open[i].order < open[at].order)) at = i;
    }
    const node = open.splice(at, 1)[0];
    const nodeKey = key(node.ix, node.iz);
    if (closed.has(nodeKey) || node.g !== best.get(nodeKey)) continue;
    closed.add(nodeKey);
    expanded++;
    const x = sx + node.ix, z = sz + node.iz;
    if (Math.hypot(tx - x, tz - z) <= 1 && clear(x, z, tx, tz)) {
      const path: LocalWaypoint[] = [];
      let current: Node | undefined = node;
      while (current?.parent) {
        path.push({ x: sx + current.ix, z: sz + current.iz });
        current = current.parent;
      }
      path.reverse();
      if (!path.length || path[path.length - 1].x !== tx || path[path.length - 1].z !== tz) path.push({ x: tx, z: tz });
      return path;
    }
    for (const [dx, dz] of DIRECTIONS) {
      const ix = node.ix + dx, iz = node.iz + dz;
      if (Math.hypot(ix, iz) > RANGE) continue;
      const nextKey = key(ix, iz);
      const g = node.g + Math.hypot(dx, dz);
      if (closed.has(nextKey) || g >= (best.get(nextKey) ?? Infinity)) continue;
      const nx = sx + ix, nz = sz + iz;
      // Check both orthogonal legs before a diagonal, even if the diagonal
      // itself clears. This prevents squeezing across blocked grid corners.
      if (dx && dz && (!clear(x, z, x + dx, z) || !clear(x, z, x, z + dz))) continue;
      if (!clear(x, z, nx, nz)) continue;
      best.set(nextKey, g);
      open.push({ ix, iz, g, f: g + Math.hypot(tx - nx, tz - nz), parent: node, order: order++ });
    }
  }
  return [];
}
