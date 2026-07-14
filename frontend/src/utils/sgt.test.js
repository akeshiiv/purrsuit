import test from 'node:test';
import assert from 'node:assert/strict';
import { msUntilSgtMidnight } from './sgt.js';

test('msUntilSgtMidnight counts down to the next SGT midnight', () => {
  // 2026-07-14T15:00:00Z == 2026-07-14 23:00 SGT → 1 hour to SGT midnight.
  assert.equal(msUntilSgtMidnight(new Date('2026-07-14T15:00:00Z')), 60 * 60 * 1000);
  // 2026-07-14T16:00:00Z == 2026-07-15 00:00 SGT exactly → a full day to the next.
  assert.equal(msUntilSgtMidnight(new Date('2026-07-14T16:00:00Z')), 24 * 60 * 60 * 1000);
});

test('msUntilSgtMidnight is always positive', () => {
  assert.ok(msUntilSgtMidnight(new Date('2026-07-14T16:00:01Z')) > 0);
});
