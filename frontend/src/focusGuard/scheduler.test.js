import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCaptureTimes, FIVE_MIN_MS } from './scheduler.js';

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
