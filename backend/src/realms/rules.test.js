import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeActions,
  generateJoinCode,
  releaseTerritoryFromCells,
} from './rules.js';

test('computeActions gates study, buying, must-buy, and deploy at rule boundaries', () => {
  assert.deepEqual(
    computeActions({ coins: 99, unitsA: 0, unitsB: 0, unitsC: 0 }),
    { canStudy: true, canBuy: false, mustBuy: false, canDeploy: false },
  );
  assert.deepEqual(
    computeActions({ coins: 100, unitsA: 0, unitsB: 0, unitsC: 0 }),
    { canStudy: false, canBuy: true, mustBuy: true, canDeploy: false },
  );
  assert.deepEqual(
    computeActions({ coins: 100, unitsA: 2, unitsB: 2, unitsC: 2 }),
    { canStudy: false, canBuy: false, mustBuy: false, canDeploy: true },
  );
  assert.deepEqual(
    computeActions({ coins: 0, unitsA: 1, unitsB: 0, unitsC: 0 }),
    { canStudy: true, canBuy: false, mustBuy: false, canDeploy: true },
  );
});

test('generateJoinCode produces six uppercase alphanumeric characters', () => {
  for (let i = 0; i < 100; i += 1) {
    assert.match(generateJoinCode(), /^[A-Z0-9]{6}$/);
  }
});

test('releaseTerritoryFromCells clears owned cells and turns owned homes into regular cells', () => {
  const cells = [
    { x: 0, y: 0, type: 'home', ownerMemberId: 3, unitType: 'A', troopCount: 2 },
    { x: 1, y: 0, type: 'regular', ownerMemberId: 3, unitType: 'B', troopCount: 4 },
    { x: 2, y: 0, type: 'home', ownerMemberId: 4, unitType: 'C', troopCount: 1 },
    { x: 3, y: 0, type: 'water', ownerMemberId: null, unitType: null, troopCount: 0 },
  ];

  const released = releaseTerritoryFromCells(cells, 3);

  assert.deepEqual(released, [
    { x: 0, y: 0, type: 'regular', ownerMemberId: null, unitType: null, troopCount: 0 },
    { x: 1, y: 0, type: 'regular', ownerMemberId: null, unitType: null, troopCount: 0 },
    { x: 2, y: 0, type: 'home', ownerMemberId: 4, unitType: 'C', troopCount: 1 },
    { x: 3, y: 0, type: 'water', ownerMemberId: null, unitType: null, troopCount: 0 },
  ]);
  assert.notEqual(released[0], cells[0]);
});
