import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNIT_COST,
  MAX_UNITS,
  normalizeUnitType,
  unitColumn,
  unitsPayload,
  classifyBuy,
} from './rules.js';

test('normalizeUnitType accepts A/B/C case-insensitively and trims whitespace', () => {
  assert.equal(normalizeUnitType('A'), 'A');
  assert.equal(normalizeUnitType('b'), 'B');
  assert.equal(normalizeUnitType(' c '), 'C');
});

test('normalizeUnitType rejects anything that is not a single A/B/C', () => {
  for (const bad of ['D', '', 'AB', 'a b', '1', 1, null, undefined, {}, ['A']]) {
    assert.equal(normalizeUnitType(bad), null);
  }
});

test('unitColumn maps unit types to their realm_members column', () => {
  assert.equal(unitColumn('A'), 'units_a');
  assert.equal(unitColumn('B'), 'units_b');
  assert.equal(unitColumn('C'), 'units_c');
  assert.equal(unitColumn('D'), null);
});

test('unitsPayload projects the count columns into the contract {a,b,c} shape', () => {
  assert.deepEqual(
    unitsPayload({ units_a: 2, units_b: 0, units_c: 1 }),
    { a: 2, b: 0, c: 1 },
  );
  // Missing columns default to zero.
  assert.deepEqual(unitsPayload({}), { a: 0, b: 0, c: 0 });
});

test('classifyBuy allows a buy with enough coins and room in inventory', () => {
  assert.deepEqual(
    classifyBuy({ coins: UNIT_COST, units_a: 0, units_b: 0, units_c: 0 }),
    { ok: true },
  );
  assert.deepEqual(
    classifyBuy({ coins: 250, units_a: 2, units_b: 2, units_c: 1 }),
    { ok: true },
  );
});

test('classifyBuy rejects with INSUFFICIENT_FUNDS below the unit cost', () => {
  assert.deepEqual(
    classifyBuy({ coins: UNIT_COST - 1, units_a: 0, units_b: 0, units_c: 0 }),
    { ok: false, status: 409, code: 'INSUFFICIENT_FUNDS' },
  );
});

test('classifyBuy rejects with INVENTORY_FULL at the 6-unit cap', () => {
  assert.deepEqual(
    classifyBuy({ coins: 500, units_a: 2, units_b: 2, units_c: 2 }),
    { ok: false, status: 409, code: 'INVENTORY_FULL' },
  );
});

test('classifyBuy reports INVENTORY_FULL before INSUFFICIENT_FUNDS when both fail', () => {
  // A full inventory is the binding, actionable block (deploy, not study), so it
  // takes precedence over a low balance.
  assert.deepEqual(
    classifyBuy({ coins: 0, units_a: 2, units_b: 2, units_c: 2 }),
    { ok: false, status: 409, code: 'INVENTORY_FULL' },
  );
});

test('exposes the contract economy constants', () => {
  assert.equal(UNIT_COST, 100);
  assert.equal(MAX_UNITS, 6);
});
