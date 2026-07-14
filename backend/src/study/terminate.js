import { withTransaction } from '../../db.js';
import { RealmError } from '../realms/service.js';

const DISTRACTION_REASONS = new Set([
  'social-media', 'entertainment', 'chat-nonacademic', 'gaming', 'shopping', 'other',
]);
const SECONDS_PER_MINUTE = 60;
const TEXT_CAP = 2000;

function capText(value) {
  return typeof value === 'string' ? value.slice(0, TEXT_CAP) : null;
}

export function validateTerminationInput(input = {}) {
  const minutes = Number(input.durationMinutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) {
    throw new RealmError(400, 'INVALID_DURATION', 'Study duration must be 5 to 120 minutes.');
  }
  if (!DISTRACTION_REASONS.has(input.reason)) {
    throw new RealmError(400, 'INVALID_REASON', 'Unknown distraction reason.');
  }
  return {
    durationSeconds: minutes * SECONDS_PER_MINUTE,
    reason: input.reason,
    summary: capText(input.summary),
    justification: capText(input.justification),
  };
}

// Best-effort log of a distraction-terminated session. Resolves the user's
// current membership + active season (nullable) and inserts one row. Never
// mutates coins/stats. The whole path runs in one transaction so it is unit
// testable via the db.js _setTransactionPool seam.
export async function logTermination(userId, input) {
  const v = validateTerminationInput(input);
  return withTransaction(async (tx) => {
    const rows = await tx`
      SELECT rm.id AS realm_member_id, r.current_season_id AS season_id
      FROM realm_members rm
      JOIN realms r ON r.id = rm.realm_id
      WHERE rm.user_id = ${userId}
      LIMIT 1
    `;
    const memberId = rows[0]?.realm_member_id ?? null;
    const seasonId = rows[0]?.season_id ?? null;
    await tx`
      INSERT INTO focus_terminations
        (user_id, season_id, realm_member_id, attempted_duration_seconds, reason, summary, justification)
      VALUES
        (${userId}, ${seasonId}, ${memberId}, ${v.durationSeconds}, ${v.reason}, ${v.summary}, ${v.justification})
    `;
    return { logged: true };
  });
}
