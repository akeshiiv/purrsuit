import { totalUnits } from '../realms/rules.js';

// Each Cat Unit costs 100 coins; a member may hold at most 6 units total.
// These mirror the realm_members CHECK constraints (coins >= 0, units <= 6),
// which remain the last line of defence behind the atomic buy.
export const UNIT_COST = 100;
export const MAX_UNITS = 6;

const UNIT_COLUMNS = { A: 'units_a', B: 'units_b', C: 'units_c' };

// Validate a client-supplied unit type, returning the canonical 'A' | 'B' | 'C'
// or null. Tolerant of case/whitespace; rejects anything else.
export function normalizeUnitType(value) {
  if (typeof value !== 'string') return null;
  const type = value.trim().toUpperCase();
  return UNIT_COLUMNS[type] ? type : null;
}

// Map a canonical unit type to its realm_members count column. The result comes
// from a fixed whitelist, so it is safe to interpolate into SQL.
export function unitColumn(unitType) {
  return UNIT_COLUMNS[unitType] ?? null;
}

// Project the count columns into the contract's { a, b, c } inventory shape.
export function unitsPayload(member) {
  return {
    a: Number(member.units_a ?? 0),
    b: Number(member.units_b ?? 0),
    c: Number(member.units_c ?? 0),
  };
}

// Decide whether a buy is allowed, mirroring the atomic SQL guard
// (coins >= cost AND total < cap). A full inventory is reported before a low
// balance: it is the binding constraint and points the player at deploying
// (not studying) for actionable UI guidance.
export function classifyBuy(member) {
  if (totalUnits(member) >= MAX_UNITS) {
    return { ok: false, status: 409, code: 'INVENTORY_FULL' };
  }
  if (Number(member.coins ?? 0) < UNIT_COST) {
    return { ok: false, status: 409, code: 'INSUFFICIENT_FUNDS' };
  }
  return { ok: true };
}
