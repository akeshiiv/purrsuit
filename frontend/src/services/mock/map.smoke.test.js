import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mockMap from './map.js';
import { state } from './state.js';
import { attackTargets } from '../../components/map/mapModel.js';

test('getMap returns full payload and short-circuits on a matching version', async () => {
  const full = await mockMap.getMap(null);
  assert.equal(full.changed, true);
  assert.equal(typeof full.size, 'number');
  assert.ok(Array.isArray(full.cells));
  assert.ok(full.me && full.me.actions);
  assert.ok(Array.isArray(full.members));

  const short = await mockMap.getMap(state.season.stateVersion);
  assert.deepEqual(short, { version: state.season.stateVersion, changed: false });
});

test('attackTargets matches the seeded map (neutral neighbour yes, blocked no)', () => {
  const targets = attackTargets(state.cells, state.me.id);
  assert.equal(targets.has('2-0'), true);  // neutral, adjacent to my owned (1,0)
  assert.equal(targets.has('3-3'), false); // obstacle
  assert.equal(targets.has('4-4'), false); // water
});

test('attack → defend → insufficient sequence against the mock', async () => {
  state.me.units = { a: 2, b: 0, c: 0 };

  const claim = await mockMap.attack({ x: 2, y: 0, unitType: 'A', quantity: 1 });
  assert.equal(claim.result, 'claimed');
  assert.equal(claim.cell.ownerMemberId, state.me.id);
  assert.equal(claim.cell.troopCount, 1);
  assert.equal(claim.units.a, 1);

  const reinforce = await mockMap.defend({ x: 0, y: 0, unitType: 'A' });
  assert.equal(reinforce.cell.troopCount, 3); // home seeded at 2, +1
  assert.equal(reinforce.units.a, 0);

  await assert.rejects(
    () => mockMap.attack({ x: 3, y: 0, unitType: 'A', quantity: 1 }),
    err => err.code === 'INSUFFICIENT_UNITS',
  );
});
