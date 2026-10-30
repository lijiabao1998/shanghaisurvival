import { isWeaponId, validArsenal, type Arsenal, type WeaponId } from './arsenal.ts';
import type { Inventory } from './campaign.ts';

/** Original arcade rules, not a medical or real-world weapon model. */
export type HandItem = 'pipe' | WeaponId;
export type BodyCondition = { bleeding: number; pain: number };
export type SurvivorSystems = {
  version: 1;
  hands: { primary: HandItem; secondary: HandItem | null };
  condition: BodyCondition;
};
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const meter = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000;
const rifle = (v: unknown) => v === 'qbz95-1' || v === 'qbz191';
const item = (v: unknown): v is HandItem => v === 'pipe' || isWeaponId(v);
const owned = (v: HandItem, arsenal: Arsenal) => v === 'pipe' || arsenal.owned.includes(v);
export const primaryGun = (state: SurvivorSystems): WeaponId | null => state.hands.primary === 'pipe' ? null : state.hands.primary;

export function validBodyCondition(value: unknown): value is BodyCondition {
  return record(value) && Object.keys(value).length === 2 && meter(value.bleeding) && meter(value.pain);
}
export function validSurvivorSystems(value: unknown, arsenal: Arsenal): value is SurvivorSystems {
  if (!validArsenal(arsenal) || !record(value) || value.version !== 1 || Object.keys(value).length !== 3
    || !record(value.hands) || Object.keys(value.hands).length !== 2 || !validBodyCondition(value.condition)) return false;
  const { primary, secondary } = value.hands;
  return item(primary) && owned(primary, arsenal)
    && (secondary === null || item(secondary) && owned(secondary, arsenal) && secondary !== primary && !rifle(secondary))
    && (!rifle(primary) || secondary === null)
    && arsenal.equipped === (primary === 'pipe' ? null : primary);
}
/** Migration never grants weapons, rounds, health or supplies. */
export function createSurvivorSystems(arsenal: Arsenal): SurvivorSystems | null {
  if (!validArsenal(arsenal)) return null;
  return { version: 1, hands: { primary: arsenal.equipped ?? 'pipe', secondary: null }, condition: { bleeding: 0, pain: 0 } };
}
/** Only an absent extension gets defaults; present corrupt or future data is rejected. */
export function migrateSurvivorSystems(value: unknown, arsenal: Arsenal): SurvivorSystems | null {
  if (value === undefined) return createSurvivorSystems(arsenal);
  return validSurvivorSystems(value, arsenal) ? structuredClone(value) : null;
}
/** Atomic hand assignment. Picking the other hand's item swaps; rifles occupy both hands. */
export function equipHand(state: SurvivorSystems, arsenal: Arsenal, slot: 'primary' | 'secondary', next: HandItem | null): boolean {
  if (!validSurvivorSystems(state, arsenal) || (slot !== 'primary' && slot !== 'secondary')
    || !(next === null || item(next) && owned(next, arsenal)) || (slot === 'primary' && next === null)
    || (slot === 'secondary' && (rifle(next) || next !== null && rifle(state.hands.primary)))) return false;
  const hands = { ...state.hands };
  if (slot === 'primary') {
    if (next === hands.secondary) hands.secondary = hands.primary;
    hands.primary = next as HandItem;
    if (rifle(next)) hands.secondary = null;
  } else {
    if (next === hands.primary) {
      if (hands.secondary === null) return false; // Never invent a replacement primary.
      hands.primary = hands.secondary;
    }
    hands.secondary = next;
  }
  const equipped = hands.primary === 'pipe' ? null : hands.primary;
  if (!validSurvivorSystems({ ...state, hands }, { ...arsenal, equipped })) return false;
  state.hands = hands;
  arsenal.equipped = equipped;
  return true;
}

/** Fictional kg-like balancing weights, not physical specifications. */
export const CARRY_CAPACITY = 12;
const SUPPLY_WEIGHT = { water: .6, food: .45, medkit: .5, battery: .2, ammo: .12, pistol: 0 } as const;
const GUN_WEIGHT: Record<WeaponId, number> = { 'qsz92-9': .8, 'qbz95-1': 3.2, qbz191: 3.4 };
export function carriedWeight(inventory: Inventory, arsenal: Arsenal): number | null {
  if (!record(inventory) || Object.keys(inventory).length !== 6 || !validArsenal(arsenal)
    || !Object.keys(SUPPLY_WEIGHT).every(id => count(inventory[id as keyof Inventory]))) return null;
  // The original iron pipe always remains in the carried kit. Legacy pistol tokens weigh nothing.
  const supplies = Object.entries(SUPPLY_WEIGHT).reduce((sum, [id, weight]) => sum + inventory[id as keyof Inventory] * weight, 1.2);
  return Math.round((supplies + arsenal.owned.reduce((sum, id) => sum + GUN_WEIGHT[id], 0)
    + arsenal.rounds['9mm'] * .012 + arsenal.rounds['5.8-rifle'] * .014) * 1000) / 1000;
}
export function loadEffects(weight: number | null): { capacity: number; overloaded: boolean; speedMultiplier: number; staminaMultiplier: number } {
  // Invalid weight must not bypass the penalty; even extreme legacy loads remain movable.
  const excess = typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 ? Math.max(0, weight / CARRY_CAPACITY - 1) : 4;
  return { capacity: CARRY_CAPACITY, overloaded: excess > 0, speedMultiplier: Math.max(.4, 1 - excess * .15), staminaMultiplier: Math.min(3, 1 + excess * .5) };
}
export function injureBody(condition: BodyCondition, damage: number): boolean {
  if (!validBodyCondition(condition) || !meter(damage) || damage <= 0) return false;
  condition.bleeding = Math.min(100, condition.bleeding + damage * .3);
  condition.pain = Math.min(100, condition.pain + damage * .8);
  return true;
}
/** Caller only advances active play; returns HP loss for this simulation step. */
export function stepBody(condition: BodyCondition, dt: number): number {
  if (!validBodyCondition(condition) || !Number.isFinite(dt) || dt <= 0 || dt > 60) return 0;
  const hpLoss = condition.bleeding * .008 * dt;
  condition.pain = Math.max(0, condition.pain - dt * .15);
  return hpLoss;
}
/** Caller must first establish and consume the medkit / paid shelter rest. */
export function treatBody(condition: BodyCondition, treatment: 'medkit' | 'rest'): boolean {
  if (!validBodyCondition(condition) || (treatment !== 'medkit' && treatment !== 'rest')) return false;
  condition.bleeding = treatment === 'medkit' ? 0 : Math.max(0, condition.bleeding - 20);
  condition.pain = Math.max(0, condition.pain - (treatment === 'medkit' ? 45 : 30));
  return true;
}
