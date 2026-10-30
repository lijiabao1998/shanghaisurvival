/** Deterministic, normalized melee motion. Angles are radians relative to the
 * survivor's forward direction (right is positive); a swing is committed for
 * its whole duration. Left-hand motion mirrors the right-hand trajectory. */
export type MeleeKind = 'blade' | 'blunt' | 'unarmed';
export type MeleeHand = 'right' | 'left';
export type MeleePhase = 'windup' | 'active' | 'recovery';
export type MeleeProfile = {
  duration: number;
  stamina: number;
  activeStart: number;
  activeEnd: number;
  startAngle: number;
  endAngle: number;
};

export const MELEE_PROFILES: Record<MeleeKind, MeleeProfile> = {
  // A diagonal cut, a wider weighted horizontal swing, and a short punch.
  blade: { duration: 0.55, stamina: 6, activeStart: 0.27, activeEnd: 0.56, startAngle: 0.9, endAngle: -0.75 },
  blunt: { duration: 0.68, stamina: 6, activeStart: 0.32, activeEnd: 0.62, startAngle: 1.05, endAngle: -0.9 },
  unarmed: { duration: 0.43, stamina: 6, activeStart: 0.24, activeEnd: 0.51, startAngle: 0.24, endAngle: -0.12 },
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

/** Pose is continuous at both phase boundaries. Rotations are offsets in radians. */
export function meleePose(kind: MeleeKind, progress: number, hand: MeleeHand = 'right', stroke = 0) {
  const side = (hand === 'left' ? -1 : 1) * (stroke % 2 === 1 ? -1 : 1);
  const p = MELEE_PROFILES[kind], t = clamp01(Number.isFinite(progress) ? progress : 0);
  const phase: MeleePhase = t < p.activeStart ? 'windup' : t < p.activeEnd ? 'active' : 'recovery';
  const wind = ease(t / p.activeStart);
  const cut = ease((t - p.activeStart) / (p.activeEnd - p.activeStart));
  const recover = ease((t - p.activeEnd) / (1 - p.activeEnd));
  const weight = t < p.activeStart ? wind : t < p.activeEnd ? 1 : 1 - recover;
  const sweepAngle = mix(p.startAngle, p.endAngle, cut) * side;
  const torsoYaw = mix(-0.35, 0.34, cut) * weight * side;
  const isBlade = kind === 'blade', isFist = kind === 'unarmed';
  // The arm comes up during the load, crosses the body in the active window,
  // then settles back; a blade descends more steeply than a horizontal pipe.
  const loadedX = isBlade ? -2.35 : isFist ? -1.05 : -1.65;
  const followX = isBlade ? -0.75 : isFist ? -1.45 : -1.28;
  return {
    phase, sweepAngle, torsoYaw, weight,
    lean: (isFist ? 0.12 : 0.2) * weight + 0.08 * Math.sin(cut * Math.PI) * weight,
    armX: mix(loadedX, followX, cut) * weight - 0.12 * (1 - weight),
    armY: sweepAngle * weight,
    armZ: ((isBlade ? mix(0.65, -0.3, cut) : isFist ? 0.15 : mix(0.8, -0.45, cut)) * weight + 0.05 * (1 - weight)) * side,
    offArmX: mix(-0.55, -0.9, cut) * weight - 0.12 * (1 - weight),
    kneeBend: (isFist ? 0.16 : 0.25) * weight,
  };
}

/** Returns only the portion of this time step that intersects the active arc.
 * Sampling the full interval makes a low frame rate unable to skip a strike. */
export function sweptMeleeAngle(kind: MeleeKind, previousProgress: number, progress: number, hand: MeleeHand = 'right', stroke = 0): { from: number; to: number } | null {
  if (!Number.isFinite(previousProgress) || !Number.isFinite(progress) || progress <= previousProgress) return null;
  const p = MELEE_PROFILES[kind];
  const start = Math.max(previousProgress, p.activeStart), end = Math.min(progress, p.activeEnd);
  if (end <= start) return null;
  const side = (hand === 'left' ? -1 : 1) * (stroke % 2 === 1 ? -1 : 1);
  const angleAt = (t: number) => side * mix(p.startAngle, p.endAngle, ease((t - p.activeStart) / (p.activeEnd - p.activeStart)));
  return { from: angleAt(start), to: angleAt(end) };
}

/** Tests a target bearing against the directed arc, including angular body
 * tolerance. Bearings may wrap at ±π. Arcs are always shorter than a full turn. */
export function angleInSweep(angle: number, from: number, to: number, tolerance = 0): boolean {
  if (![angle, from, to, tolerance].every(Number.isFinite) || tolerance < 0) return false;
  const delta = wrap(to - from);
  const midpoint = from + delta / 2;
  return Math.abs(wrap(angle - midpoint)) <= Math.abs(delta) / 2 + tolerance + 1e-9;
}
