import { validSurvivorSystems, type SurvivorSystems } from './survivor-systems.ts';
import { createLegacyArsenal, validArsenal, type Arsenal } from './arsenal.ts';
import type { HelperState } from './helper';
/** Versioned, browser-independent campaign rules. No renderer or DOM dependencies. */
export const ITEM_IDS = ['water', 'food', 'medkit', 'battery', 'ammo', 'pistol'] as const;
export type ItemId = typeof ITEM_IDS[number];
export type Inventory = Record<ItemId, number>;
export type CacheKind = 'water' | 'food' | 'ammo';
export type SavedContainer = { x: number; z: number; looted: boolean; cacheKind?: CacheKind; cacheDay?: number };
export type SavedEnemy = { x: number; z: number; hp: number; state: 'sleep' | 'wander' | 'chase' | 'dead'; faction: string; home?: [number, number]; patrol?: [number, number]; lastKnown?: [number, number]; returning?: boolean; retreat?: number };
export type Outbreak = { hydration: number; satiety: number; exposure: number };
export type Snapshot = {
  version: 1; mapId: string; characterId: string; elapsed: number;
  hp: number; stamina: number; battery: number; outbreak: Outbreak;
  inventory: Inventory; stash: Inventory; ammo: number;
  hasPistol: boolean; pistolEquipped: boolean; position: [number, number];
  shelterId: string; inShelter: boolean; looted: number; kills: number;
  containers: SavedContainer[];
  /** Independent stable IDs preserve the original ordinary-container save indices. */
  interiorLoot?: Record<string, boolean>;
  enemies: SavedEnemy[]; encounterVersion?: 1;
  status: 'alive' | 'dead'; restCount: number; helper?: HelperState; arsenal?: Arsenal; survivorSystems?: SurvivorSystems;
};
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export type RestState = Pick<Snapshot, 'hp' | 'stamina' | 'outbreak' | 'inventory' | 'stash' | 'elapsed' | 'restCount'>;
const MAX_COUNT = 1_000_000;
const MAX_SECONDS = 1_000_000_000;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numberIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const count = (v: unknown): v is number => numberIn(v, 0, MAX_COUNT) && Number.isInteger(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 512;
const meter = (v: unknown): v is number => numberIn(v, 0, 100);
const coordinate = (v: unknown): v is number => numberIn(v, -10_000_000, 10_000_000);
const inventoryValid = (v: unknown): v is Inventory => isRecord(v) && Object.keys(v).length === ITEM_IDS.length && ITEM_IDS.every(id => count(v[id]));
const cacheKindValid = (v: unknown): v is CacheKind => v === 'water' || v === 'food' || v === 'ammo';
const cacheDayValid = (v: unknown): v is number => count(v) && v >= 1;
const outbreakValid = (v: unknown): v is Outbreak => isRecord(v) && meter(v.hydration) && meter(v.satiety) && meter(v.exposure);

export function emptyInventory(): Inventory {
  return { water: 0, food: 0, medkit: 0, battery: 0, ammo: 0, pistol: 0 };
}

/** Reject old/unknown formats, corrupt numbers and foreign maps; never partially load. */
export function parseSnapshot(raw: string, mapId: string): Snapshot | null {
  if (typeof raw !== 'string' || raw.length > 2_000_000) return null;
  try {
    const s: unknown = JSON.parse(raw);
    if (!isRecord(s) || s.version !== 1 || !text(s.mapId) || s.mapId !== mapId || !text(s.characterId)
      || !numberIn(s.elapsed, 0, MAX_SECONDS) || !meter(s.hp) || !meter(s.stamina) || !meter(s.battery)
      || !outbreakValid(s.outbreak) || !inventoryValid(s.inventory) || !inventoryValid(s.stash)
      || !count(s.ammo) || typeof s.hasPistol !== 'boolean' || typeof s.pistolEquipped !== 'boolean'
      || (s.pistolEquipped && !s.hasPistol) || !Array.isArray(s.position) || s.position.length !== 2
      || !s.position.every(coordinate) || !text(s.shelterId) || typeof s.inShelter !== 'boolean'
      || !count(s.looted) || !count(s.kills) || !count(s.restCount)
      || typeof s.status !== 'string' || !['alive', 'dead'].includes(s.status) || (s.status === 'alive' && s.hp <= 0)
      || (s.status === 'dead' && s.hp !== 0)
      || !Array.isArray(s.containers) || s.containers.length > 1000
      || !Array.isArray(s.enemies) || s.enemies.length > 1000) return null;
    if ('interiorLoot' in s && (!isRecord(s.interiorLoot)
      || Object.keys(s.interiorLoot).length > 64
      || !Object.entries(s.interiorLoot).every(([id, looted]) =>
        /^room-v1:[A-Za-z0-9_-]{1,128}:supply$/.test(id) && typeof looted === 'boolean'))) return null;
    if ('arsenal' in s && !validArsenal(s.arsenal)) return null;
    if ('survivorSystems' in s) {
      const equipment = s.arsenal as Arsenal | undefined ?? createLegacyArsenal(s.hasPistol as boolean, s.ammo as number);
      if (equipment && !s.arsenal && s.pistolEquipped) equipment.equipped='qsz92-9';
      if (!equipment || !validSurvivorSystems(s.survivorSystems, equipment)) return null;
    }
    if ('encounterVersion' in s && s.encounterVersion !== 1) return null;
    if ('helper' in s) {
      const h = s.helper;
      const day = dayPhase(s.elapsed).day;
      if (!isRecord(h) || typeof h.helped !== 'boolean' || !numberIn(h.exchanges, 0, 2) || !Number.isInteger(h.exchanges)
        || !count(h.exchangeDay) || h.exchangeDay > day || !count(h.healDay) || h.healDay > day
        || (h.exchangeDay === 0 && h.exchanges !== 0) || (h.healDay !== 0 && !h.helped)) return null;
    }
    if (!s.containers.every(c => isRecord(c) && coordinate(c.x) && coordinate(c.z) && typeof c.looted === 'boolean'
      && (!('cacheKind' in c) && !('cacheDay' in c)
        || cacheKindValid(c.cacheKind) && cacheDayValid(c.cacheDay) && c.cacheDay <= dayPhase(s.elapsed as number).day))) return null;
    if (!s.enemies.every(e => isRecord(e) && coordinate(e.x) && coordinate(e.z) && meter(e.hp)
      && typeof e.state === 'string' && ['sleep', 'wander', 'chase', 'dead'].includes(e.state) && text(e.faction)
      && (e.state === 'dead' ? e.hp === 0 : e.hp > 0)
      && (!('home' in e) || Array.isArray(e.home) && e.home.length === 2 && e.home.every(coordinate))
      && (!('patrol' in e) || Array.isArray(e.patrol) && e.patrol.length === 2 && e.patrol.every(coordinate))
      && (!('lastKnown' in e) || Array.isArray(e.lastKnown) && e.lastKnown.length === 2 && e.lastKnown.every(coordinate))
      && (!('returning' in e) || typeof e.returning === 'boolean')
      && (!('retreat' in e) || numberIn(e.retreat, 0, 60)))) return null;
    return s as Snapshot;
  } catch { return null; }
}

/** One atomic localStorage replacement: a failed write leaves the previous save intact. */
export function saveSnapshot(storage: StorageLike, key: string, snapshot: Snapshot): boolean {
  try {
    const raw = JSON.stringify(snapshot);
    if (!parseSnapshot(raw, snapshot.mapId)) return false;
    storage.setItem(key, raw);
    return true;
  } catch { return false; }
}
export function loadSnapshot(storage: StorageLike, key: string, mapId: string): Snapshot | null {
  try { const raw = storage.getItem(key); return raw === null ? null : parseSnapshot(raw, mapId); }
  catch { return null; }
}

/** Move exactly one item, conserving totals. No aliasing, fractions or overdrafts. */
export function transferItem(from: Inventory, to: Inventory, id: ItemId): boolean {
  if (from === to || !ITEM_IDS.includes(id) || !count(from[id]) || !count(to[id]) || from[id] < 1 || to[id] >= MAX_COUNT) return false;
  from[id]--; to[id]++;
  return true;
}

/** A deliberate resource trade, not free healing; caller must establish shelter access. */
export function restAtShelter(state: RestState): boolean {
  if (!meter(state.hp) || state.hp <= 0 || !meter(state.stamina) || !outbreakValid(state.outbreak)
    || !inventoryValid(state.stash) || state.stash.water < 1 || state.stash.food < 1
    || !numberIn(state.elapsed, 0, MAX_SECONDS - 120) || !count(state.restCount) || state.restCount >= MAX_COUNT) return false;
  state.stash.water--; state.stash.food--;
  state.elapsed += 120; state.restCount++;
  state.hp = Math.min(100, state.hp + 25); state.stamina = 100;
  state.outbreak.hydration = Math.min(100, state.outbreak.hydration + 25);
  state.outbreak.satiety = Math.min(100, state.outbreak.satiety + 20);
  state.outbreak.exposure = Math.max(0, state.outbreak.exposure - 20);
  return true;
}

/** Twelve real minutes per game day; start at 08:00, sunrise 06:00 / sunset 18:00. */
export function dayPhase(elapsed: number): { day: number; hour: number; daylight: number } {
  const seconds = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const hours = 8 + seconds / 30;
  const hour = hours % 24;
  return { day: Math.floor(hours / 24) + 1, hour, daylight: hour <= 6 || hour >= 18 ? 0 : Math.sin((hour - 6) / 12 * Math.PI) };
}

/** Refresh each marked supply cache at most once per calendar day. Never stockpile missed days. */
export function replenishCaches(containers: SavedContainer[], elapsed: number): number {
  if (!numberIn(elapsed, 0, MAX_SECONDS)) return 0;
  const day = dayPhase(elapsed).day;
  if (day > MAX_COUNT) return 0;
  let replenished = 0;
  for (const c of containers) {
    if (!cacheKindValid(c.cacheKind) || !cacheDayValid(c.cacheDay) || typeof c.looted !== 'boolean' || day <= c.cacheDay) continue;
    c.looted = false;
    c.cacheDay = day;
    replenished++;
  }
  return replenished;
}

/** Claim a cache once, atomically; a full/corrupt bag must not consume its supply. */
export function applyCacheLoot(inventory: Inventory, container: SavedContainer): boolean {
  if (!cacheKindValid(container.cacheKind) || !cacheDayValid(container.cacheDay)
    || container.looted !== false || !inventoryValid(inventory)) return false;
  const id = container.cacheKind;
  const amount = id === 'ammo' ? 1 : 2;
  if (inventory[id] > MAX_COUNT - amount) return false;
  inventory[id] += amount;
  container.looted = true;
  return true;
}
