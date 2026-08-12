import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTz, buildStatBlock, computeStreak, buildLast7Days } from './stats.js';

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

// --- buildLast7Days --------------------------------------------------------

const MIN = 60;

test('buildLast7Days returns 7 days of zeros for a user who has never studied', () => {
  assert.deepEqual(buildLast7Days([], '2026-07-11'), [
    { date: '2026-07-05', minutes: 0 },
    { date: '2026-07-06', minutes: 0 },
    { date: '2026-07-07', minutes: 0 },
    { date: '2026-07-08', minutes: 0 },
    { date: '2026-07-09', minutes: 0 },
    { date: '2026-07-10', minutes: 0 },
    { date: '2026-07-11', minutes: 0 },
  ]);
});

test('buildLast7Days zero-fills the gaps and ends on today', () => {
  const rows = [
    { day: '2026-07-06', seconds: 25 * MIN },
    { day: '2026-07-09', seconds: 50 * MIN },
    { day: '2026-07-11', seconds: 10 * MIN },
  ];
  const series = buildLast7Days(rows, '2026-07-11');

  assert.equal(series.length, 7);
  assert.deepEqual(series.at(-1), { date: '2026-07-11', minutes: 10 }, 'index 6 is today');
  assert.deepEqual(series.map((d) => d.minutes), [0, 25, 0, 0, 50, 0, 10]);
});

test('buildLast7Days orders oldest to newest across a month boundary', () => {
  const series = buildLast7Days([{ day: '2026-06-30', seconds: 30 * MIN }], '2026-07-02');
  assert.deepEqual(series.map((d) => d.date), [
    '2026-06-26', '2026-06-27', '2026-06-28', '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02',
  ]);
  assert.deepEqual(series.map((d) => d.minutes), [0, 0, 0, 0, 30, 0, 0]);
});

test('buildLast7Days sums several sessions logged on the same local day', () => {
  const rows = [
    { day: '2026-07-10', seconds: 25 * MIN },
    { day: '2026-07-10', seconds: 50 * MIN },
    { day: '2026-07-10', seconds: 15 * MIN },
  ];
  const series = buildLast7Days(rows, '2026-07-11');
  assert.equal(series[5].minutes, 90, 'the day carries the total, not the last row');
  assert.equal(series[6].minutes, 0);
});

// The window is inclusive of today, so the seventh day back is exactly the
// oldest one that still counts — one day further out drops off entirely.
test('buildLast7Days keeps a day exactly 6 back and drops the day before it', () => {
  const rows = [
    { day: '2026-07-04', seconds: 40 * MIN },
    { day: '2026-07-05', seconds: 20 * MIN },
  ];
  const series = buildLast7Days(rows, '2026-07-11');
  assert.deepEqual(series[0], { date: '2026-07-05', minutes: 20 }, 'six days back is in');
  assert.ok(!series.some((d) => d.date === '2026-07-04'), 'seven days back is out');
});

test('buildLast7Days ignores days after today', () => {
  const rows = [
    { day: '2026-07-11', seconds: 30 * MIN },
    { day: '2026-07-12', seconds: 99 * MIN },
  ];
  const series = buildLast7Days(rows, '2026-07-11');
  assert.deepEqual(series.at(-1), { date: '2026-07-11', minutes: 30 });
  assert.ok(!series.some((d) => d.date === '2026-07-12'));
});

test('buildLast7Days rounds the summed seconds to whole minutes', () => {
  const rows = [
    { day: '2026-07-09', seconds: 89 },   // 1.48 -> 1
    { day: '2026-07-10', seconds: 90 },   // 1.5  -> 2
    { day: '2026-07-11', seconds: 29 },   // 0.48 -> 0, a day that reads as empty
  ];
  const series = buildLast7Days(rows, '2026-07-11');
  assert.deepEqual(series.slice(4).map((d) => d.minutes), [1, 2, 0]);
});

test('buildLast7Days rounds the day total, not each session', () => {
  // Three 40s sessions round to 0 apiece but to 2 minutes together.
  const rows = [
    { day: '2026-07-11', seconds: 40 },
    { day: '2026-07-11', seconds: 40 },
    { day: '2026-07-11', seconds: 40 },
  ];
  assert.equal(buildLast7Days(rows, '2026-07-11').at(-1).minutes, 2);
});
