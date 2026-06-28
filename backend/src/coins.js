// Authoritative coin-award rules. These constants live on the server so the
// award can never be dictated by the client — the POST /api/coins handler
// derives the award from the (validated) session duration alone and ignores
// any `coinsEarned` sent in the request body.

export const COINS_PER_SECOND = 2;
export const MIN_DURATION_SECONDS = 30; // shortest session that can earn coins
export const MAX_DURATION_SECONDS = 2 * 60 * 60; // 2h guard against absurd claims

// Validate a client-supplied session duration and compute the coin award.
// Returns { ok: true, award } on success or { ok: false, error } otherwise.
export function validateAndComputeAward(duration) {
  if (!Number.isInteger(duration)) {
    return { ok: false, error: 'duration must be an integer number of seconds' };
  }
  if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    return {
      ok: false,
      error: `duration must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds`,
    };
  }
  return { ok: true, award: duration * COINS_PER_SECOND };
}

// Coerce a coins value read from the DB into a safe integer. The `coins::int`
// SQL cast should already return a number; this is the fail-loud guard so a
// missing row, NULL column, or driver string never silently ships to the client.
export function parseCoins(value) {
  if (value === null || value === undefined) {
    throw new Error('coins value is missing');
  }
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new Error(`invalid coins value from database: ${String(value)}`);
  }
  return n;
}
