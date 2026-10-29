/** Fictional outbreak pressure: an arcade risk meter, not a medical model. */
export type OutbreakState = {
  hydration: number;
  satiety: number;
  exposure: number;
};
export type OutbreakConditions = { running: boolean; nearbyThreat: boolean };
export type Supply = 'water' | 'food' | 'medkit';

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function createOutbreak(): OutbreakState {
  return { hydration: 100, satiety: 100, exposure: 0 };
}

/** Mutates state. dt is simulation seconds; invalid/nonpositive steps are ignored. */
export function stepOutbreak(
  state: OutbreakState,
  dt: number,
  conditions: OutbreakConditions,
): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  // A quiet eight-minute night costs 72 water / 48 food; running costs more.
  state.hydration = clamp(state.hydration - dt * (conditions.running ? 0.23 : 0.15));
  state.satiety = clamp(state.satiety - dt * (conditions.running ? 0.14 : 0.10));
  state.exposure = clamp(state.exposure + dt * (conditions.nearbyThreat ? 1.2 : -0.12));
}

/** Supplies affect game meters only; a medical kit does not cure a real virus. */
export function applySupply(state: OutbreakState, supply: Supply): void {
  if (supply === 'water') state.hydration = clamp(state.hydration + 40);
  if (supply === 'food') state.satiety = clamp(state.satiety + 35);
  if (supply === 'medkit') state.exposure = clamp(state.exposure - 30);
}

/** The final-minute rendezvous needs supplies, proximity and manageable risk. */
export function canEvacuate(
  state: OutbreakState,
  elapsed: number,
  looted: number,
  distance: number,
): boolean {
  return [elapsed, looted, distance, state.exposure].every(Number.isFinite)
    && elapsed >= 420 && elapsed < 480 && looted >= 3 && distance >= 0 && distance <= 5
    && state.exposure >= 0 && state.exposure < 85;
}
