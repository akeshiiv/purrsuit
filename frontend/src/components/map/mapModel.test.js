import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTE,
  beats,
  cellPalette,
  attackTargets,
  standings,
} from './mapModel.js';

test('beats: RPS table A>B>C>A', () => {
  assert.equal(beats('A', 'B'), true);
  assert.equal(beats('B', 'C'), true);
  assert.equal(beats('C', 'A'), true);
  assert.equal(beats('B', 'A'), false);
  assert.equal(beats('A', 'C'), false);
});

test('cellPalette: water/obstacle are blocked with fixed colours', () => {
  assert.deepEqual(cellPalette({ type: 'water' }), { fill: PALETTE.water, blocked: true });
  assert.deepEqual(cellPalette({ type: 'obstacle' }), { fill: PALETTE.obstacle, blocked: true });
});

test('cellPalette: neutral land vs owner colour', () => {
  assert.deepEqual(
    cellPalette({ type: 'regular', ownerMemberId: null, colour: null }),
    { fill: PALETTE.neutralLand, blocked: false },
  );
  assert.deepEqual(
    cellPalette({ type: 'regular', ownerMemberId: 3, colour: '#3b82f6' }),
    { fill: '#3b82f6', blocked: false },
  );
});

test('attackTargets: regular cells adjacent to mine, excluding mine/blocked/non-adjacent', () => {
  const cells = [
    { x: 0, y: 0, type: 'home', ownerMemberId: 1 },
    { x: 1, y: 0, type: 'regular', ownerMemberId: null }, // adjacent neutral → target
    { x: 0, y: 1, type: 'water', ownerMemberId: null },   // adjacent but blocked → no
    { x: 2, y: 0, type: 'regular', ownerMemberId: null },  // not adjacent → no
    { x: 0, y: 0, type: 'home', ownerMemberId: 1 },
  ];
  const targets = attackTargets(cells, 1);
  assert.equal(targets.has('1-0'), true);
  assert.equal(targets.has('0-1'), false);
  assert.equal(targets.has('2-0'), false);
});

test('attackTargets: enemy cell adjacent to mine is a target', () => {
  const cells = [
    { x: 0, y: 0, type: 'regular', ownerMemberId: 1 },
    { x: 1, y: 0, type: 'regular', ownerMemberId: 2 },
  ];
  assert.equal(attackTargets(cells, 1).has('1-0'), true);
});

test('standings: territories per member, sorted desc', () => {
  const cells = [
    { ownerMemberId: 1 }, { ownerMemberId: 1 }, { ownerMemberId: 2 }, { ownerMemberId: null },
  ];
  const members = [
    { id: 1, name: 'Me', colour: '#1' },
    { id: 2, name: 'You', colour: '#2' },
  ];
  assert.deepEqual(standings(cells, members), [
    { id: 1, name: 'Me', colour: '#1', territories: 2 },
    { id: 2, name: 'You', colour: '#2', territories: 1 },
  ]);
});
