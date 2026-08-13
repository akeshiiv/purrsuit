import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeActions,
  generateJoinCode,
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

