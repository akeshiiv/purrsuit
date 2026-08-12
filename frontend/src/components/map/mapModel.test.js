import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNED_TINT,
  PALETTE,
  attackTargets,
  beats,
  cellPalette,
  dominantUnit,
  standings,
  tint,
} from './mapModel.js';

test('beats: RPS table A>B>C>A', () => {
  assert.equal(beats('A', 'B'), true);
  assert.equal(beats('B', 'C'), true);
  assert.equal(beats('C', 'A'), true);
  assert.equal(beats('B', 'A'), false);
  assert.equal(beats('A', 'C'), false);
});

test('tint: mixes toward #EBEBEB by the given amount', () => {
  assert.equal(tint('#3b82f6', OWNED_TINT), 'rgb(151, 185, 240)');
  assert.equal(tint('#000000', 0), 'rgb(0, 0, 0)');
  assert.equal(tint('#000000', 1), 'rgb(235, 235, 235)');
  // shorthand hex and an explicit target both work
  assert.equal(tint('#fff', 0.5, '#000000'), 'rgb(128, 128, 128)');
  // unparseable input is passed through rather than blanking the cell
  assert.equal(tint(null, 0.5), null);
  assert.equal(tint('not-a-colour', 0.5), 'not-a-colour');
});

test('cellPalette: water/obstacle are blocked with fixed colours', () => {
  assert.deepEqual(cellPalette({ type: 'water' }), { fill: PALETTE.water, blocked: true, ring: null });
  assert.deepEqual(cellPalette({ type: 'obstacle' }), { fill: PALETTE.obstacle, blocked: true, ring: null });
});

test('cellPalette: neutral land vs a tinted owner colour ringed in the raw colour', () => {
  assert.deepEqual(
    cellPalette({ type: 'regular', ownerMemberId: null, colour: null }),
    { fill: PALETTE.neutralLand, blocked: false, ring: null },
  );
  assert.deepEqual(
    cellPalette({ type: 'regular', ownerMemberId: 3, colour: '#3b82f6' }),
    { fill: tint('#3b82f6', OWNED_TINT), blocked: false, ring: '#3b82f6' },
  );
  // owned but colourless still falls back to land
  assert.deepEqual(
    cellPalette({ type: 'regular', ownerMemberId: 3, colour: null }),
    { fill: PALETTE.neutralLand, blocked: false, ring: null },
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

test('dominantUnit: the type holding most of a member\'s cells, A when they hold none', () => {
  const cells = [
    { ownerMemberId: 1, unitType: 'C' },
    { ownerMemberId: 1, unitType: 'C' },
    { ownerMemberId: 1, unitType: 'B' },
    { ownerMemberId: 2, unitType: 'B' },
  ];
  assert.equal(dominantUnit(cells, 1), 'C');
  assert.equal(dominantUnit(cells, 2), 'B');
  assert.equal(dominantUnit(cells, 3), 'A');
});
