import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COINS_PER_SECOND,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  validateAndComputeAward,
  parseCoins,
} from './coins.js';

test('computes the award from a valid duration, server-side', () => {
  const result = validateAndComputeAward(30);
  assert.deepEqual(result, { ok: true, award: 30 * COINS_PER_SECOND });
});

test('computes the award for the maximum allowed duration', () => {
  const result = validateAndComputeAward(MAX_DURATION_SECONDS);
  assert.deepEqual(result, {
    ok: true,
    award: MAX_DURATION_SECONDS * COINS_PER_SECOND,
  });
});

test('rejects a duration below the minimum', () => {
  const result = validateAndComputeAward(MIN_DURATION_SECONDS - 1);
  assert.equal(result.ok, false);
  assert.match(result.error, /duration/i);
});

test('rejects a duration above the maximum', () => {
  const result = validateAndComputeAward(MAX_DURATION_SECONDS + 1);
  assert.equal(result.ok, false);
  assert.match(result.error, /duration/i);
});

test('rejects a non-integer duration', () => {
  const result = validateAndComputeAward(30.5);
  assert.equal(result.ok, false);
});

test('rejects a non-numeric duration', () => {
  for (const bad of ['30', null, undefined, NaN, {}, Infinity]) {
    const result = validateAndComputeAward(bad);
    assert.equal(result.ok, false, `expected ${String(bad)} to be rejected`);
  }
});

test('ignores any client-supplied coin amount (award depends only on duration)', () => {
  // The endpoint passes only the duration here; this guards the contract that
  // the award is derived server-side and never read from the request body.
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
