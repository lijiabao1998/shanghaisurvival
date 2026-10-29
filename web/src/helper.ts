/** Fictional community aid and remembered exchanges; exposure is a game meter, not medical advice. */
import type { Inventory } from './campaign';
export type HelperState = { helped: boolean; exchanges: number; exchangeDay: number; healDay: number };
const MAX = 1_000_000;
const count = (v: unknown, maximum = MAX): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= maximum;
const validDay = (v: unknown): v is number => count(v) && v >= 1;
const meter = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const validInventory = (v: Inventory) => ['water','food','medkit','battery','ammo','pistol'].every(k => count(v[k as keyof Inventory]));
export function validHelperState(s: unknown): s is HelperState {
  if (typeof s !== 'object' || s === null || Array.isArray(s)) return false;
  const h = s as Record<string, unknown>;
  return typeof h.helped === 'boolean' && count(h.exchanges, 2) && count(h.exchangeDay) && count(h.healDay)
    && (h.exchangeDay !== 0 || h.exchanges === 0) && (h.healDay === 0 || h.helped);
}
export function createHelperState(): HelperState {
  return { helped: false, exchanges: 0, exchangeDay: 0, healDay: 0 };
}
/** Two exchanges per simulation day; reopening a conversation never changes the allowance. */
export function exchangeWithHelper(state: HelperState, inventory: Inventory, day: number): boolean {
  if (!validHelperState(state) || !validInventory(inventory) || !validDay(day)
    || day < Math.max(state.exchangeDay, state.healDay) || inventory.food < 1 || inventory.water >= MAX) return false;
  const used = day > state.exchangeDay ? 0 : state.exchanges;
  if (used >= 2) return false;
  inventory.food--; inventory.water++;
  state.exchangeDay = day; state.exchanges = used + 1;
  return true;
}
/** One-time aid, with a one-time thank-you supply. Failure never spends the kit. */
export function aidHelper(state: HelperState, inventory: Inventory): boolean {
  if (!validHelperState(state) || !validInventory(inventory) || state.helped || inventory.medkit < 1 || inventory.water > MAX - 2) return false;
  inventory.medkit--; inventory.water += 2; state.helped = true;
  return true;
}
/** Remembered goodwill grants one fictional recovery per day, never reviving a dead player. */
export function receiveHelperCare(state: HelperState, player: { hp: number; exposure: number }, day: number): boolean {
  if (!validHelperState(state) || !state.helped || !validDay(day) || day <= state.healDay || day < state.exchangeDay
    || !meter(player.hp) || player.hp <= 0 || player.hp >= 100 || !meter(player.exposure)) return false;
  player.hp = Math.min(100, player.hp + 15);
  player.exposure = Math.max(0, player.exposure - 5);
  state.healDay = day;
  return true;
}
