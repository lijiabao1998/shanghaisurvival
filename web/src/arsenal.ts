/** Named weapons with fictional arcade balance values, not real operating specifications. */
export const WEAPON_IDS = ['qsz92-9', 'qbz95-1', 'qbz191', 'compact9', 'service9', 'heavy9', 'carbine58', 'marksman58', 'support58'] as const;
export type WeaponId = typeof WEAPON_IDS[number];
export const CALIBRES = ['9mm', '5.8-rifle'] as const;
export type Calibre = typeof CALIBRES[number];
export type Arsenal = { version: 1; owned: WeaponId[]; equipped: WeaponId | null; rounds: Record<Calibre, number> };
export type WeaponSpec = Readonly<{ id: WeaponId; name: string; calibre: Calibre; category: 'pistol' | 'rifle'; cooldown: number; damage: number; range: number }>;
export const WEAPONS: Readonly<Record<WeaponId, WeaponSpec>> = Object.freeze({
  'qsz92-9': Object.freeze({ id: 'qsz92-9', name: 'QSZ-92-9', calibre: '9mm', category: 'pistol', cooldown: .28, damage: 90, range: 28 }),
  'qbz95-1': Object.freeze({ id: 'qbz95-1', name: 'QBZ-95-1', calibre: '5.8-rifle', category: 'rifle', cooldown: .18, damage: 65, range: 36 }),
  'qbz191': Object.freeze({ id: 'qbz191', name: 'QBZ-191', calibre: '5.8-rifle', category: 'rifle', cooldown: .22, damage: 75, range: 40 }),
  // Original generic game variants; these names/values do not specify real firearms.
  compact9: Object.freeze({ id: 'compact9', name: '袖珍手槍', calibre: '9mm', category: 'pistol', cooldown: .22, damage: 58, range: 20 }),
  service9: Object.freeze({ id: 'service9', name: '勤務手槍', calibre: '9mm', category: 'pistol', cooldown: .3, damage: 82, range: 30 }),
  heavy9: Object.freeze({ id: 'heavy9', name: '重型手槍', calibre: '9mm', category: 'pistol', cooldown: .48, damage: 112, range: 32 }),
  carbine58: Object.freeze({ id: 'carbine58', name: '短卡賓', calibre: '5.8-rifle', category: 'rifle', cooldown: .16, damage: 54, range: 30 }),
  marksman58: Object.freeze({ id: 'marksman58', name: '精準步槍', calibre: '5.8-rifle', category: 'rifle', cooldown: .65, damage: 125, range: 55 }),
  support58: Object.freeze({ id: 'support58', name: '支援步槍', calibre: '5.8-rifle', category: 'rifle', cooldown: .13, damage: 46, range: 34 }),
});
const MAX = 1_000_000;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX;
export const isWeaponId = (v: unknown): v is WeaponId => typeof v === 'string' && (WEAPON_IDS as readonly string[]).includes(v);
export const isCalibre = (v: unknown): v is Calibre => typeof v === 'string' && (CALIBRES as readonly string[]).includes(v);
export function validArsenal(value: unknown): value is Arsenal {
  if (!record(value) || value.version !== 1 || Object.keys(value).length !== 4 || !Array.isArray(value.owned)
    || value.owned.length > WEAPON_IDS.length || !value.owned.every(isWeaponId) || new Set(value.owned).size !== value.owned.length
    || !(value.equipped === null || isWeaponId(value.equipped) && value.owned.includes(value.equipped))
    || !record(value.rounds) || Object.keys(value.rounds).length !== CALIBRES.length) return false;
  return CALIBRES.every(c => count((value.rounds as Record<string, unknown>)[c]));
}

/** No bonus rounds during migration. Runtime may restore the old equipped choice afterwards. */
export function createLegacyArsenal(hasPistol: boolean, ammo: number): Arsenal | null {
  if (typeof hasPistol !== 'boolean' || !count(ammo)) return null;
  return { version: 1, owned: hasPistol ? ['qsz92-9'] : [], equipped: null, rounds: { '9mm': ammo, '5.8-rifle': 0 } };
}

/** A weapon cache yields six matching rounds, even when its weapon was already owned. */
export function grantWeapon(arsenal: Arsenal, id: WeaponId): boolean {
  if (!validArsenal(arsenal) || !isWeaponId(id)) return false;
  const calibre = WEAPONS[id].calibre;
  if (arsenal.rounds[calibre] > MAX - 6) return false;
  if (!arsenal.owned.includes(id)) arsenal.owned.push(id);
  arsenal.rounds[calibre] += 6;
  return true;
}
export function grantAmmo(arsenal: Arsenal, calibre: Calibre, amount = 6): boolean {
  if (!validArsenal(arsenal) || !isCalibre(calibre) || !count(amount) || amount <= 0 || arsenal.rounds[calibre] > MAX - amount) return false;
  arsenal.rounds[calibre] += amount;
  return true;
}
/** null switches back to melee; owning a gun does not implicitly equip it. */
export function equipWeapon(arsenal: Arsenal, id: WeaponId | null): boolean {
  if (!validArsenal(arsenal) || !(id === null || isWeaponId(id) && arsenal.owned.includes(id))) return false;
  arsenal.equipped = id;
  return true;
}
export function consumeRound(arsenal: Arsenal): boolean {
  if (!validArsenal(arsenal) || arsenal.equipped === null) return false;
  const calibre = WEAPONS[arsenal.equipped].calibre;
  if (arsenal.rounds[calibre] <= 0) return false;
  arsenal.rounds[calibre]--;
  return true;
}
