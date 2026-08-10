import { withTransaction } from '../../db.js';
import { RealmError } from '../realms/service.js';
import { normalizeSessionKey } from './service.js';

const DISTRACTION_REASONS = new Set([
  'social-media', 'entertainment', 'chat-nonacademic', 'gaming', 'shopping', 'other',
]);
const SECONDS_PER_MINUTE = 60;
const TEXT_CAP = 2000;

function capText(value) {
  return typeof value === 'string' ? value.slice(0, TEXT_CAP) : null;
}

export function validateTerminationInput(input = {}) {
  const sessionKey = normalizeSessionKey(input?.sessionKey);
  const claimsDuration = input?.durationMinutes !== undefined && input?.durationMinutes !== null;

  // With a session key the authoritative duration is on the server row, so the
  // field becomes optional. Without one it is all we have, and the old callers
  // that still send it get the same validation they always did.
  let durationSeconds = null;
  if (claimsDuration || !sessionKey) {
    const minutes = Number(input.durationMinutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) {
      throw new RealmError(400, 'INVALID_DURATION', 'Study duration must be 5 to 120 minutes.');
    }
    durationSeconds = minutes * SECONDS_PER_MINUTE;
  }

  if (!DISTRACTION_REASONS.has(input.reason)) {
    throw new RealmError(400, 'INVALID_REASON', 'Unknown distraction reason.');
  }
  return {
    sessionKey,
    durationSeconds,
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
    // Close the server-owned session in the same transaction as the log. A
    // session the user walked away from must stop being claimable at the moment
    // it is reported, or the reward survives the distraction that ended it. The
    // status guard makes this lose gracefully to a completion that got there
    // first, and an unknown or already-closed key simply logs, since the client
    // fires this off without waiting for an answer.
    let durationSeconds = v.durationSeconds;
    if (v.sessionKey) {
      const closed = await tx`
        UPDATE study_sessions
        SET status = 'terminated'
        WHERE session_key = ${v.sessionKey} AND user_id = ${userId} AND status = 'pending'
        RETURNING duration_minutes::int AS duration_minutes
      `;
      if (closed[0]) {
        durationSeconds = Number(closed[0].duration_minutes) * SECONDS_PER_MINUTE;
      }
    }

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
        (${userId}, ${seasonId}, ${memberId}, ${durationSeconds ?? 0}, ${v.reason}, ${v.summary}, ${v.justification})
    `;
    return { logged: true };
  });
}
