import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTz, buildStatBlock, computeStreak } from './stats.js';

// --- normalizeTz -----------------------------------------------------------

test('normalizeTz passes through a valid IANA zone', () => {
  assert.equal(normalizeTz('America/Los_Angeles'), 'America/Los_Angeles');
  assert.equal(normalizeTz('UTC'), 'UTC');
});

test('normalizeTz falls back to UTC for missing/invalid/non-string input', () => {
  for (const bad of ['', 'Not/AZone', 'garbage', null, undefined, 42, {}]) {
    assert.equal(normalizeTz(bad), 'UTC', `expected ${String(bad)} -> UTC`);
  }
});

// --- buildStatBlock --------------------------------------------------------

test('buildStatBlock computes rounded averages', () => {
  assert.deepEqual(
    buildStatBlock({ totalSeconds: 126000, sessionCount: 42, totalCoins: 8400, activeDays: 18 }),
    {
      totalSeconds: 126000,
      sessionCount: 42,
      totalCoins: 8400,
      avgSessionSeconds: 3000,
      activeDays: 18,
      avgSecondsPerActiveDay: 7000,
    },
  );
});

test('buildStatBlock guards divide-by-zero for an empty history', () => {
  assert.deepEqual(
    buildStatBlock({ totalSeconds: 0, sessionCount: 0, totalCoins: 0, activeDays: 0 }),
    {
      totalSeconds: 0,
      sessionCount: 0,
      totalCoins: 0,
      avgSessionSeconds: 0,
      activeDays: 0,
      avgSecondsPerActiveDay: 0,
    },
  );
});

// --- computeStreak ---------------------------------------------------------

test('computeStreak returns zeros for no study days', () => {
  assert.deepEqual(computeStreak([], '2026-07-11'), { current: 0, longest: 0 });
});

test('computeStreak counts a run ending today', () => {
  const days = ['2026-07-09', '2026-07-10', '2026-07-11'];
  assert.deepEqual(computeStreak(days, '2026-07-11'), { current: 3, longest: 3 });
});

test('computeStreak keeps the current run alive when the last day is yesterday (grace)', () => {
  const days = ['2026-07-09', '2026-07-10'];
  assert.deepEqual(computeStreak(days, '2026-07-11'), { current: 2, longest: 2 });
});

test('computeStreak drops current to 0 once a full day is missed', () => {
  const days = ['2026-07-01', '2026-07-02', '2026-07-03'];
  assert.deepEqual(computeStreak(days, '2026-07-11'), { current: 0, longest: 3 });
});

test('computeStreak reports longest independent of current, ignoring order and dups', () => {
  const days = ['2026-06-05', '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-05', '2026-07-11'];
  // longest run is Jun 1-3 (3); current is just today (1)
  assert.deepEqual(computeStreak(days, '2026-07-11'), { current: 1, longest: 3 });
});

test('computeStreak handles month boundaries via real calendar dates', () => {
  const days = ['2026-06-30', '2026-07-01', '2026-07-02'];
  assert.deepEqual(computeStreak(days, '2026-07-02'), { current: 3, longest: 3 });
});
