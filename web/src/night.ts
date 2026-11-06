import { dayPhase, MAX_SECONDS, REAL_SECONDS_PER_GAME_HOUR, SUNRISE_HOUR, SUNSET_HOUR } from './campaign.ts';

/** Warn during the hour before sunset, while the street is still dusk. */
export const DUSK_WARNING_HOUR = 17;
/** Infected notice farther once daylight drops under this. Matches the previous 35% boost. */
export const DARK_DAYLIGHT = 0.25;
export const NIGHT_SENSE_MULTIPLIER = 1.35;
/** Full night only: sleeping infected near the player get up and walk a short beat. */
export const NIGHT_WANDER_MULTIPLIER = 1.8;
export const NIGHT_PATROL_RADIUS = 42;
export const NIGHT_PATROL_LIMIT = 6;
/** Used when a sleeper was placed without a separate patrol point. */
export const NIGHT_PATROL_OFFSET = 6;
/** Living enemies this close to the shelter door block skipping to dawn. */
export const SHELTER_THREAT_RADIUS = 14;
/** 06:01, the first minute after the saved sunrise boundary. Hour 6 itself is still dark. */
export const DAWN_HOUR = SUNRISE_HOUR + 1 / 60;

export const DUSK_WARNING_TEXT = [
  '黃昏了。天黑後附近的感染者會出來巡邏，察覺也更遠。要過夜就回安全屋。',
  '黄昏了。天黑后附近的感染者会出来巡逻，察觉也更远。要过夜就回安全屋。',
  'Dusk. Nearby infected will patrol after dark and notice you from farther away. Head for the shelter if you need to wait out the night.',
] as const;

export const SKIP_TO_DAWN_TEXT = {
  chased: ['外面還有人在追，不能快轉到天亮。', '外面还有人在追，不能快转到天亮。', 'Someone is still chasing you, so you cannot skip to dawn.'],
  'enemies-near': ['安全屋附近還有敵人，不能快轉到天亮。', '安全屋附近还有敌人，不能快转到天亮。', 'Enemies are still near the shelter, so you cannot skip to dawn.'],
  'still-day': ['天還沒黑，先在外面活動。', '天还没黑，先在外面活动。', 'It is still daylight.'],
  'not-shelter': ['只有在安全屋裡才能快轉到天亮。', '只有在安全屋里才能快转到天亮。', 'You can only skip to dawn inside the shelter.'],
  'time-limit': ['這份時間已經到盡頭，不能再快轉。', '这份时间已经到尽头，不能再快转。', 'There is no further time to skip.'],
} as const;

export type SkipRefusal = keyof typeof SKIP_TO_DAWN_TEXT;
export function skipToDawnText(reason: SkipRefusal): [string, string, string] {
  const text = SKIP_TO_DAWN_TEXT[reason];
  return [text[0], text[1], text[2]];
}
export type SkipToDawn =
  | { ok: true; elapsed: number }
  | { ok: false; reason: SkipRefusal };
export type NightThreat = { x: number; z: number; state: string };
export type NightBody = {
  x: number; z: number; hx: number; hz: number; patrolX: number; patrolZ: number;
  state: 'sleep' | 'wander' | 'chase' | 'dead'; faction: string; returning: boolean;
};

/** Dark hours only, using the campaign sunset and sunrise. Dusk remains a warning, not a skip. */
export function nightCanBeSkipped(hour: number): boolean {
  if (!Number.isFinite(hour)) return false;
  const wrapped = ((hour % 24) + 24) % 24;
  return wrapped <= SUNRISE_HOUR || wrapped >= SUNSET_HOUR;
}

export function duskWarning(hour: number): typeof DUSK_WARNING_TEXT | null {
  if (!Number.isFinite(hour)) return null;
  const wrapped = ((hour % 24) + 24) % 24;
  return wrapped >= DUSK_WARNING_HOUR && wrapped < SUNSET_HOUR ? DUSK_WARNING_TEXT : null;
}

export function nightSenseMultiplier(daylight: number, faction: string): number {
  return faction === 'infected' && Number.isFinite(daylight) && daylight < DARK_DAYLIGHT ? NIGHT_SENSE_MULTIPLIER : 1;
}

export function nightWanderMultiplier(daylight: number, faction: string): number {
  return faction === 'infected' && daylight === 0 ? NIGHT_WANDER_MULTIPLIER : 1;
}

export function nightPatrolPoint(home: { x: number; z: number }, patrol: { x: number; z: number }): { x: number; z: number } {
  if ([home.x, home.z, patrol.x, patrol.z].every(Number.isFinite) && Math.hypot(patrol.x - home.x, patrol.z - home.z) >= 1) {
    return { x: patrol.x, z: patrol.z };
  }
  return { x: home.x + NIGHT_PATROL_OFFSET, z: home.z };
}

export type NightRouse = { index: number; x: number; z: number };

/** Pick sleeping infected close to the player. Already patrolling ones count toward the cap. */
export function nightRouses(bodies: readonly NightBody[], player: { x: number; z: number }, daylight: number, blocked: (x: number, z: number) => boolean): NightRouse[] {
  if (daylight !== 0 || ![player.x, player.z].every(Number.isFinite)) return [];
  const active = bodies.filter(body => body.faction === 'infected' && body.state === 'wander' && !body.returning).length;
  let room = NIGHT_PATROL_LIMIT - active;
  if (room <= 0) return [];
  const ranked = bodies.map((body, index) => ({ body, index, distance: Math.hypot(body.x - player.x, body.z - player.z) }))
    .filter(item => item.body.faction === 'infected' && item.body.state === 'sleep' && Number.isFinite(item.distance) && item.distance <= NIGHT_PATROL_RADIUS)
    .sort((a, b) => a.distance - b.distance || a.index - b.index);
  const orders: NightRouse[] = [];
  for (const item of ranked) {
    if (room <= 0) break;
    const point = nightPatrolPoint({ x: item.body.hx, z: item.body.hz }, { x: item.body.patrolX, z: item.body.patrolZ });
    if (blocked(point.x, point.z)) continue;
    orders.push({ index: item.index, x: point.x, z: point.z });
    room -= 1;
  }
  return orders;
}

function elapsedAtDawn(elapsed: number): number | null {
  const seconds = Math.max(0, elapsed);
  const hour = dayPhase(seconds).hour;
  let delta = DAWN_HOUR - hour;
  if (delta <= 0) delta += 24;
  const next = seconds + delta * REAL_SECONDS_PER_GAME_HOUR;
  return Number.isFinite(next) && next <= MAX_SECONDS ? next : null;
}

/**
 * Jump the existing elapsed field to the next dawn. Supplies, positions and the
 * save schema stay with the caller; this only accepts or refuses the clock change.
 */
export function skipToDawn(input: { elapsed: number; inShelter: boolean; shelter: { x: number; z: number } | null; threats: readonly NightThreat[] }): SkipToDawn {
  if (!input.inShelter || !input.shelter || ![input.shelter.x, input.shelter.z].every(Number.isFinite)) return { ok: false, reason: 'not-shelter' };
  if (!Number.isFinite(input.elapsed) || !nightCanBeSkipped(dayPhase(input.elapsed).hour)) return { ok: false, reason: 'still-day' };
  const living = input.threats.filter(threat => threat.state !== 'dead');
  if (living.some(threat => threat.state === 'chase')) return { ok: false, reason: 'chased' };
  if (living.some(threat => {
    const distance = Math.hypot(threat.x - input.shelter!.x, threat.z - input.shelter!.z);
    return !Number.isFinite(distance) || distance <= SHELTER_THREAT_RADIUS;
  })) return { ok: false, reason: 'enemies-near' };
  const elapsed = elapsedAtDawn(input.elapsed);
  return elapsed === null ? { ok: false, reason: 'time-limit' } : { ok: true, elapsed };
}
