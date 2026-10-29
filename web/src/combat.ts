/** Swept 2D movement used by combat. The collider owns city geometry. */
export type Collider = (x: number, z: number, radius: number) => boolean;
export function sweepMove(x: number, z: number, dx: number, dz: number, radius: number, collides: Collider) {
  if (![x, z, dx, dz, radius].every(Number.isFinite) || radius <= 0) return { x, z, blocked: true };
  if (collides(x, z, radius)) return { x, z, blocked: true };
  // Steps shorter than a body's radius prevent tunnelling through thin walls.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / Math.min(radius, 0.1)));
  if (steps > 10000) return { x, z, blocked: true };
  for (let i = 1; i <= steps; i++) {
    const nx = x + dx * i / steps, nz = z + dz * i / steps;
    if (collides(nx, nz, radius)) return { x: x + dx * (i - 1) / steps, z: z + dz * (i - 1) / steps, blocked: true };
  }
  return { x: x + dx, z: z + dz, blocked: false };
}
export function segmentClear(ax: number, az: number, bx: number, bz: number, collides: Collider): boolean {
  return !sweepMove(ax, az, bx - ax, bz - az, 0.12, collides).blocked;
}
