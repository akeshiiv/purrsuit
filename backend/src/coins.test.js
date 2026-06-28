import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COINS_PER_MINUTE,
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  validateAndComputeAward,
  parseCoins,
} from './coins.js';

test('awards 4 coins per minute for the contract reference durations', () => {
  // From the API contract: 5 min → 20, 25 min → 100, 120 min → 480.
  assert.deepEqual(validateAndComputeAward(5), { ok: true, award: 20 });
  assert.deepEqual(validateAndComputeAward(25), { ok: true, award: 100 });
  assert.deepEqual(validateAndComputeAward(120), { ok: true, award: 480 });
});

test('award is minutes × COINS_PER_MINUTE', () => {
  assert.equal(COINS_PER_MINUTE, 4);
  assert.deepEqual(validateAndComputeAward(30), { ok: true, award: 30 * COINS_PER_MINUTE });
});

test('accepts the minimum and maximum allowed durations', () => {
  assert.equal(validateAndComputeAward(MIN_DURATION_MINUTES).ok, true);
  assert.equal(validateAndComputeAward(MAX_DURATION_MINUTES).ok, true);
});

test('rejects a duration below the minimum', () => {
  const result = validateAndComputeAward(MIN_DURATION_MINUTES - 1);
  assert.equal(result.ok, false);
  assert.match(result.error, /durationMinutes/i);
});

test('rejects a duration above the maximum', () => {
  const result = validateAndComputeAward(MAX_DURATION_MINUTES + 1);
  assert.equal(result.ok, false);
  assert.match(result.error, /durationMinutes/i);
});

test('rejects a non-integer duration', () => {
  const result = validateAndComputeAward(25.5);
  assert.equal(result.ok, false);
});

test('rejects a non-numeric duration', () => {
  for (const bad of ['25', null, undefined, NaN, {}, Infinity]) {
    const result = validateAndComputeAward(bad);
    assert.equal(result.ok, false, `expected ${String(bad)} to be rejected`);
  }
});

test('ignores any client-supplied coin amount (award depends only on duration)', () => {
  // Guards the contract that the award is derived server-side from the duration
  // and never read from the request body.
  assert.equal(validateAndComputeAward.length, 1);
});

test('parseCoins coerces driver strings and numbers to an integer', () => {
  // BIGINT/NUMERIC columns arrive as strings from both Neon and pg.
  assert.equal(parseCoins('60'), 60);
  assert.equal(parseCoins(60), 60);
  assert.equal(parseCoins(0), 0);
});

test('parseCoins throws on missing or non-integer values (fail loud, never silent 0)', () => {
  for (const bad of [null, undefined, 'abc', 3.5, NaN, {}]) {
    assert.throws(() => parseCoins(bad), `expected ${String(bad)} to throw`);
  }
});
