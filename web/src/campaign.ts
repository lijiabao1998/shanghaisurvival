/** Versioned, browser-independent campaign rules. No renderer or DOM dependencies. */
export const ITEM_IDS = ['water', 'food', 'medkit', 'battery', 'ammo', 'pistol'] as const;
export type ItemId = typeof ITEM_IDS[number];
export type Inventory = Record<ItemId, number>;
export type Outbreak = { hydration: number; satiety: number; exposure: number };
export type Snapshot = {
  version: 1; mapId: string; characterId: string; elapsed: number;
  hp: number; stamina: number; battery: number; outbreak: Outbreak;
  inventory: Inventory; stash: Inventory; ammo: number;
  hasPistol: boolean; pistolEquipped: boolean; position: [number, number];
  shelterId: string; inShelter: boolean; looted: number; kills: number;
  containers: { x: number; z: number; looted: boolean }[];
  enemies: { x: number; z: number; hp: number; state: 'sleep' | 'wander' | 'chase' | 'dead'; faction: string }[];
  status: 'alive' | 'dead'; restCount: number;
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
    if (!s.containers.every(c => isRecord(c) && coordinate(c.x) && coordinate(c.z) && typeof c.looted === 'boolean')) return null;
    if (!s.enemies.every(e => isRecord(e) && coordinate(e.x) && coordinate(e.z) && meter(e.hp)
      && typeof e.state === 'string' && ['sleep', 'wander', 'chase', 'dead'].includes(e.state) && text(e.faction)
      && (e.state === 'dead' ? e.hp === 0 : e.hp > 0))) return null;
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
