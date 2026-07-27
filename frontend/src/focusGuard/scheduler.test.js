import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCaptureTimes, createScheduler, FIVE_MIN_MS } from './scheduler.js';

test('produces exactly one capture per full 5-min window', () => {
  const times = computeCaptureTimes(25 * 60_000, () => 0.5);
  assert.equal(times.length, 5);
});

test('each capture falls strictly inside its own window', () => {
  const times = computeCaptureTimes(25 * 60_000, () => 0.5);
  times.forEach((t, k) => {
    assert.ok(t >= k * FIVE_MIN_MS && t < (k + 1) * FIVE_MIN_MS, `capture ${k} in window`);
  });
});

test('returns times sorted ascending', () => {
  const times = computeCaptureTimes(60 * 60_000, Math.random);
  const sorted = [...times].sort((a, b) => a - b);
  assert.deepEqual(times, sorted);
});

test('a partial final window still gets one in-bounds capture', () => {
  const times = computeCaptureTimes(7 * 60_000, () => 0.99); // 5min + 2min window
  assert.equal(times.length, 2);
  assert.ok(times[1] >= FIVE_MIN_MS && times[1] < 7 * 60_000);
});

test('createScheduler recomputes each delay from the wall-clock anchor (survives a throttled tick)', async () => {
  const durationMs = 2 * FIVE_MIN_MS;   // two windows -> two captures
  const random = () => 0.5;             // offsets [150000, 450000]
  const delays = [];
  const timers = [];
  let fakeNow = 1000;

  const scheduler = createScheduler({
    durationMs,
    onCapture: () => {},
    now: () => fakeNow,
    random,
    setTimer: (fn, ms) => { delays.push(ms); timers.push(fn); return timers.length; },
    clearTimer: () => {},
  });

  scheduler.start();
  assert.equal(delays[0], 150_000); // first delay = offset0 - 0 elapsed

  // The first timer fires 50s LATE (the tab was throttled while backgrounded).
  fakeNow = 1000 + 200_000;
  timers[0]();
  await new Promise((resolve) => setTimeout(resolve, 0)); // let the .finally(scheduleNext) microtask run

  // The next delay is re-derived from elapsed (200000), NOT a fixed inter-offset gap,
  // so the cadence catches up instead of drifting.
  assert.equal(delays[1], 450_000 - 200_000);
});
