import type { FactionId } from './factions';

export type EncounterBehaviorInput = {
  faction: FactionId;
  /** Distance to target and to the encounter's original home, in metres. */
  distance: number;
  homeDistance: number;
  visible: boolean;
  /** Consecutive seconds without visible contact within 44 metres. */
  lostSeconds: number;
  carryingStolenItem: boolean;
  dt: number;
};
export type EncounterDecision = {
  action: 'chase' | 'return' | 'retreat';
  lostSeconds: number;
  /** Permission only: caller MUST still check weapon range/cooldown/warning. */
  canAttack: boolean;
};
const knownFaction = (faction: FactionId) => ['infected', 'military', 'police', 'raider'].includes(faction);

/**
 * Policy for an already alerted encounter. No teleporting, movement, inventory
 * changes or acquisition is performed here. During lost contact the caller may
 * pursue the LAST observed/heard position, never the hidden player's live pose.
 * Home is stable across chases; a return/retreat state must be kept by the caller
 * until home is reached, rather than re-running this as a new chase each frame.
 */
export function decideEncounterBehavior(input: EncounterBehaviorInput): EncounterDecision {
  const { faction, distance, homeDistance, visible, carryingStolenItem, dt } = input;
  if (!knownFaction(faction) || ![distance, homeDistance, input.lostSeconds, dt].every(v => Number.isFinite(v) && v >= 0)) {
    return { action: 'return', lostSeconds: 6, canAttack: false };
  }
  const contact = visible && distance <= 44;
  const lostSeconds = contact ? 0 : Math.min(6, input.lostSeconds + dt);
  if (faction === 'raider' && carryingStolenItem) return { action: 'retreat', lostSeconds, canAttack: false };
  // Keep home inside the bounded 40m local navigator's range. Military/police
  // defend a tighter perimeter; others may roam slightly further, never citywide.
  const leash = faction === 'military' || faction === 'police' ? 28 : 32;
  if (homeDistance > leash) return { action: 'return', lostSeconds, canAttack: false };
  if (lostSeconds >= 6) return { action: 'return', lostSeconds, canAttack: false };
  return { action: 'chase', lostSeconds, canAttack: contact };
}

export type EncounterAcquisitionInput = {
  faction: FactionId;
  distance: number;
  visible: boolean;
  /** Caller computes light/night/sneaking modifiers, in metres. */
  sightRange: number;
  /** A fresh sound event already checked against its audible radius. */
  heardNoise: boolean;
};

/** Sound can alert infected through walls; light cannot grant wall vision. */
export function canAcquireTarget(input: EncounterAcquisitionInput): boolean {
  if (!knownFaction(input.faction) || ![input.distance, input.sightRange].every(v => Number.isFinite(v) && v >= 0)) return false;
  return (input.visible && input.distance <= input.sightRange) || (input.faction === 'infected' && input.heardNoise);
}
