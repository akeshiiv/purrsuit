import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beats,
  isUnitType,
  neighbourCoords,
  resolveAttack,
} from './rules.js';

test('beats follows the rock-paper-scissors cycle A>B>C>A', () => {
  assert.equal(beats('A', 'B'), true);
  assert.equal(beats('B', 'C'), true);
  assert.equal(beats('C', 'A'), true);

  assert.equal(beats('B', 'A'), false);
  assert.equal(beats('C', 'B'), false);
  assert.equal(beats('A', 'C'), false);
});

test('beats treats a matching unit type as a tie (no winner)', () => {
  assert.equal(beats('A', 'A'), false);
  assert.equal(beats('B', 'B'), false);
  assert.equal(beats('C', 'C'), false);
});

test('isUnitType accepts only the three uppercase unit codes', () => {
  for (const t of ['A', 'B', 'C']) assert.equal(isUnitType(t), true);
  for (const t of ['a', 'D', '', ' ', null, undefined, 1]) assert.equal(isUnitType(t), false);
});

test('neighbourCoords returns the four 4-neighbours of a cell', () => {
  assert.deepEqual(neighbourCoords(4, 2), [
    { x: 5, y: 2 },
    { x: 3, y: 2 },
    { x: 4, y: 3 },
    { x: 4, y: 1 },
  ]);
});

test('resolveAttack claims a neutral cell with the committed quantity', () => {
  const outcome = resolveAttack({
    attackerMemberId: 7,
    attackerUnitType: 'A',
    quantity: 3,
    target: { ownerMemberId: null, unitType: null, troopCount: 0 },
  });
  assert.deepEqual(outcome, {
    result: 'claimed',
    ownerMemberId: 7,
    unitType: 'A',
    troopCount: 3,
    battleWon: false,
  });
});

test('resolveAttack captures an enemy cell when quantity wins and the unit type beats it', () => {
  const outcome = resolveAttack({
    attackerMemberId: 7,
    attackerUnitType: 'A',
    quantity: 5,
    target: { ownerMemberId: 9, unitType: 'B', troopCount: 2 },
  });
  assert.deepEqual(outcome, {
    result: 'captured',
    ownerMemberId: 7,
    unitType: 'A',
    troopCount: 3,
    battleWon: true,
  });
});

test('resolveAttack captures on an exact-quantity tie and floors the surviving troop at 1', () => {
  const outcome = resolveAttack({
    attackerMemberId: 7,
    attackerUnitType: 'C',
    quantity: 5,
    target: { ownerMemberId: 9, unitType: 'A', troopCount: 5 },
  });
  assert.deepEqual(outcome, {
    result: 'captured',
    ownerMemberId: 7,
    unitType: 'C',
    troopCount: 1,
    battleWon: true,
  });
});

test('resolveAttack is repelled when the unit type loses the RPS matchup', () => {
  const outcome = resolveAttack({
    attackerMemberId: 7,
    attackerUnitType: 'B',
    quantity: 10,
    target: { ownerMemberId: 9, unitType: 'A', troopCount: 2 },
  });
  assert.deepEqual(outcome, {
    result: 'repelled',
    ownerMemberId: 9,
    unitType: 'A',
    troopCount: 1,
    battleWon: false,
  });
});

test('resolveAttack is repelled when quantity is below the garrison even if the matchup wins', () => {
  const outcome = resolveAttack({
    attackerMemberId: 7,
    attackerUnitType: 'A',
    quantity: 3,
    target: { ownerMemberId: 9, unitType: 'B', troopCount: 5 },
  });
  assert.deepEqual(outcome, {
    result: 'repelled',
    ownerMemberId: 9,
    unitType: 'B',
    troopCount: 2,
    battleWon: false,
  });
});
