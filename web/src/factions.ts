/** Fictional hostile encounters; these do not represent every member of a group. */
export type FactionId = 'infected' | 'military' | 'police' | 'raider';
export type FactionProfile = Readonly<{
  id: FactionId;
  label: string;
  color: number;
  speed: number;
  range: number;
  damage: number;
  cooldown: number;
  warningSeconds: number;
}>;

export const FACTIONS: Readonly<Record<FactionId, FactionProfile>> = Object.freeze({
  infected: Object.freeze({ id: 'infected', label: '感染者', color: 0x646b56,
    speed: 1.6, range: 1.3, damage: 30, cooldown: 1.7, warningSeconds: 0 }),
  military: Object.freeze({ id: 'military', label: '失控軍事巡邏', color: 0x586747,
    speed: 1.4, range: 12, damage: 18, cooldown: 3, warningSeconds: 1.5 }),
  police: Object.freeze({ id: 'police', label: '敵對封鎖警員', color: 0x375d89,
    speed: 1.2, range: 2, damage: 12, cooldown: 2.2, warningSeconds: 0.8 }),
  raider: Object.freeze({ id: 'raider', label: '掠奪者', color: 0x96603d,
    speed: 2.3, range: 1.5, damage: 16, cooldown: 1.8, warningSeconds: 0.6 }),
});

const MIX: readonly FactionId[] = Object.freeze([
  'infected', 'military', 'infected', 'police', 'infected', 'raider',
]);

/** A stable six-encounter cycle: 50% infected, the remainder evenly mixed. */
export function profileFor(index: number): FactionProfile {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError('Encounter index must be a nonnegative safe integer');
  }
  return FACTIONS[MIX[index % MIX.length]];
}
