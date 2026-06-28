// Authoritative coin-award rules. These constants live on the server so the
// award can never be dictated by the client — the POST /api/study/complete
// handler derives the award from the (validated) session length alone and
// ignores anything the client claims to have earned.
//
// Economy (per the API contract + PDF): coins earned = studied minutes × 4
// (5 min → 20, 25 min → 100, 120 min → 480).

export const COINS_PER_MINUTE = 4;
export const MIN_DURATION_MINUTES = 5; // shortest session that can earn coins
export const MAX_DURATION_MINUTES = 120; // longest a single session may claim

// Validate a client-supplied study duration (whole minutes) and compute the
// coin award. Returns { ok: true, award } on success or { ok: false, error }.
export function validateAndComputeAward(durationMinutes) {
  if (!Number.isInteger(durationMinutes)) {
    return { ok: false, error: 'durationMinutes must be an integer number of minutes' };
  }
  if (durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES) {
    return {
      ok: false,
      error: `durationMinutes must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES}`,
    };
  }
  return { ok: true, award: durationMinutes * COINS_PER_MINUTE };
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
