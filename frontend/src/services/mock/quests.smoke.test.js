import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as mockRealm from './realm.js';
import * as mockShop from './shop.js';
import { state, resetForRealm } from './state.js';

beforeEach(() => {
  resetForRealm(state.realm, state.me.role);
  state.me.coins = 1000; // enough to buy repeatedly
});

test('getCurrent exposes an active dailyQuest with progress', async () => {
  const payload = await mockRealm.getCurrent();
  assert.equal(payload.dailyQuest.key, 'buy_three_units');
  assert.deepEqual(payload.dailyQuest.progress, { current: 0, target: 3 });
});

test('buying three units completes the quest, awards 100, and removes the card', async () => {
  await mockShop.buy({ unitType: 'A' });
  await mockShop.buy({ unitType: 'B' });
  const before = state.me.coins;
  const third = await mockShop.buy({ unitType: 'C' });
  assert.deepEqual(third.questCompleted, { key: 'buy_three_units', title: 'Restock', reward: 100 });
  assert.equal(third.coins, before - 100 + 100); // debit for the unit, credit for the bonus
  const payload = await mockRealm.getCurrent();
  assert.equal(payload.dailyQuest, null); // completed → card removed
});
