import { WEAPON_IDS, grantWeapon, validArsenal, type Arsenal, type WeaponId } from './arsenal.ts';
export type SearchSite = { x: number; z: number; looted: boolean; cacheKind?: string };
/** Stable original array order, including exhausted boxes. No reroll or refill on reload.
 * The first three ordinary sites guarantee the original firearm families; others retain random loot. */
export function weaponAtSite(sites: readonly SearchSite[], site: SearchSite): WeaponId | null {
  if (site.cacheKind) return null;
  const index = sites.filter(s => !s.cacheKind).indexOf(site);
  return index >= 0 && index < 3 ? WEAPON_IDS[index] : null;
}
export function nearestWeaponSite<T extends SearchSite>(sites: readonly T[], x: number, z: number): T | null {
  return sites.filter(s => !s.looted && weaponAtSite(sites,s)).sort((a,b) => Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0] ?? null;
}

/** Recoverable path for already-exhausted legacy worlds. One of each, no duplicate/ammo farm. */
export function exchangeWeapon(arsenal: Arsenal, inventory: {food:number;water:number}, id: WeaponId): boolean {
  if (!validArsenal(arsenal) || !WEAPON_IDS.includes(id) || arsenal.owned.includes(id)
    || !Number.isInteger(inventory.food) || !Number.isInteger(inventory.water)
    || inventory.food<2 || inventory.water<2 || inventory.food>1_000_000 || inventory.water>1_000_000) return false;
  if (!grantWeapon(arsenal,id)) return false;
  inventory.food-=2;inventory.water-=2;
  return true;
}
