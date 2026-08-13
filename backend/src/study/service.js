import { randomUUID } from 'node:crypto';
import { sql, withTransaction } from '../../db.js';
import { computeActions } from '../realms/rules.js';
import { RealmError, ensureSeasonFresh } from '../realms/service.js';
import { validateAndComputeAward } from '../coins.js';
import { evaluateQuest } from '../quests/service.js';
import { normalizeTz, buildStatBlock, computeStreak, buildLast7Days } from './stats.js';

const SECONDS_PER_MINUTE = 60;

// A countdown that ran on the client can hit zero a moment before the server
// agrees: clocks drift and the final tick rounds. This is how much of that slack
// a claim is allowed, and the only slack it gets.
export const START_GRACE_SECONDS = 60;

// How long a finished session stays claimable. Long enough to survive a dropped
// response, a backgrounded tab or a walk to the kettle; short enough that a row
// cannot be hoarded and banked against some later season.
export const CLAIM_WINDOW_MINUTES = 15;

// How many times a start will re-run after losing the one-pending-row race.
// Each retry re-reads and retires whatever landed first, so the newest request
// wins; three is far past what a double-submitting client can produce.
const START_ATTEMPTS = 3;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Session keys reach the database as a `uuid` column, so anything else has to be
// rejected here — handing the driver a malformed string raises a type error the
// caller would see as a 500 instead of the 400 it is.
export function normalizeSessionKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeStudySession(row) {
  return {
    sessionKey: row.session_key,
    durationMinutes: Number(row.duration_minutes),
    startedAt: iso(row.started_at),
    eligibleAt: iso(row.eligible_at),
    expiresAt: iso(row.expires_at),
  };
}

// One realm per user (UNIQUE(user_id) on realm_members).
async function requireRealmId(userId) {
  const membership = await sql`
    SELECT realm_id FROM realm_members WHERE user_id = ${userId} LIMIT 1
  `;
  if (membership.length === 0) {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
  }
  return membership[0].realm_id;
}

function isPendingSessionCollision(err) {
  return err?.code === '23505'
    && String(err?.constraint ?? err?.message ?? '').includes('idx_study_sessions_one_pending');
}

function studyPayload(member, coins) {
  return {
    coins,
    secondsStudied: member.seconds_studied,
    actions: computeActions({ ...member, coins }),
  };
}

// Open a server-owned session: the client states how long it intends to study
// and gets back an opaque key. Nothing about the reward is settled here — this
// only starts the clock that /complete will later measure the claim against.
export async function startStudySession(userId, input = {}) {
  const durationMinutes = input?.durationMinutes;
  const result = validateAndComputeAward(durationMinutes);
  if (!result.ok) {
    throw new RealmError(400, 'INVALID_DURATION', result.error);
  }

  const realmId = await requireRealmId(userId);
  // Roll an expired season over first, so a session that starts in the dying
  // minutes of one season is anchored to the one that will still be live when
  // its countdown ends.
  await ensureSeasonFresh(realmId);
  return issueStudySession(userId, realmId, durationMinutes);
}

// Write the pending row, retrying if a concurrent start beat us to the single
// pending slot. The retry is the resolution: it re-runs the retire-then-insert
// against the row that just landed, so the newest start wins exactly as it would
// have without the race.
export async function issueStudySession(userId, realmId, durationMinutes) {
  let collision = null;
  for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
    try {
      return await openStudySession(userId, realmId, durationMinutes);
    } catch (err) {
      if (!isPendingSessionCollision(err)) throw err;
      collision = err;
    }
  }

  // Starts are arriving faster than they can supersede one another. The user
  // still has exactly one live session, so hand that one back rather than fail a
  // request that did nothing wrong.
  const live = await sql`
    SELECT session_key, duration_minutes::int AS duration_minutes, started_at, eligible_at, expires_at
    FROM study_sessions
    WHERE user_id = ${userId} AND status = 'pending'
    LIMIT 1
  `;
  if (live.length > 0) return serializeStudySession(live[0]);
  throw collision;
}

// One attempt at opening a session, in a single transaction.
export async function openStudySession(userId, realmId, durationMinutes) {
  const eligibleSeconds = durationMinutes * SECONDS_PER_MINUTE - START_GRACE_SECONDS;
  const expiresSeconds = eligibleSeconds + CLAIM_WINDOW_MINUTES * SECONDS_PER_MINUTE;

  return withTransaction(async (tx) => {
    // Deliberately an unlocked read: starting a session credits nothing, so
    // there is no invariant a concurrent rollover could break here — completion
    // re-checks and locks the season before it pays. Taking the season lock
    // first would also invert the lock order completion uses (study_sessions,
    // then seasons) and let a start and a complete for the same user deadlock.
    const seasonRows = await tx`
      SELECT s.id, s.status
      FROM realms r
      JOIN seasons s ON s.id = r.current_season_id
      WHERE r.id = ${realmId}
    `;
    const season = seasonRows[0];
    if (!season || season.status !== 'active') {
      throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'Your realm does not have an active season.');
    }

    // Retire whatever the user left running. This is what caps a stretch of
    // wall-clock time at one reward: you cannot stack five overlapping sessions
    // and claim them all when the last one ripens.
    await tx`
      UPDATE study_sessions
      SET status = 'abandoned'
      WHERE user_id = ${userId} AND status = 'pending'
    `;

    // All three timestamps come off the server clock in one statement, so they
    // stay consistent with each other no matter what the client believes.
    const rows = await tx`
      INSERT INTO study_sessions
        (session_key, user_id, realm_id, season_id, duration_minutes, started_at, eligible_at, expires_at)
      VALUES
        (${randomUUID()}, ${userId}, ${realmId}, ${season.id}, ${durationMinutes},
         now(),
         now() + (${eligibleSeconds}::int * interval '1 second'),
         now() + (${expiresSeconds}::int * interval '1 second'))
      RETURNING session_key, duration_minutes::int AS duration_minutes, started_at, eligible_at, expires_at
    `;
    return serializeStudySession(rows[0]);
  });
}

// Credit coins + study time for a session the server itself started. The client
// supplies only the key it was issued; the duration, and therefore the award,
// come from the row. Claiming early or twice is rejected below rather than
// trusted to the client having behaved.
export async function completeStudy(userId, input = {}) {
  const sessionKey = normalizeSessionKey(input?.sessionKey);
  if (!sessionKey) {
    // A body carrying the old duration-only shape is a tab that was loaded
    // before this deploy, not a malformed request: the SPA is cached, so an
    // open tab keeps posting the previous contract until it is reloaded. Say so,
    // because "a sessionKey is required" is unactionable to someone who has no
    // idea their page is stale. It still credits nothing — the duration in that
    // body is exactly what stopped being trusted.
    if (input?.durationMinutes !== undefined) {
      throw new RealmError(409, 'STALE_CLIENT', 'This page is out of date. Refresh and start a new session.');
    }
    throw new RealmError(400, 'INVALID_SESSION', 'A sessionKey from POST /api/study/start is required.');
  }

  const realmId = await requireRealmId(userId);
  // Roll an expired season over first so coins always land on the realm's live
  // season (a just-finished study then credits the freshly started one). The
  // season resolved here — not the one stamped on the row at start — is the one
  // that gets paid, which is what makes a session that spans a rollover behave.
  await ensureSeasonFresh(realmId);
  return claimStudySession(userId, realmId, sessionKey);
}

// The transactional half of completion. Everything from the eligibility check to
// the credit runs under one lock on the session row, so two requests racing on
// the same key cannot both pay out.
export async function claimStudySession(userId, realmId, sessionKey) {
  return withTransaction(async (tx) => {
    // FOR UPDATE serialises concurrent claims: the loser blocks here and wakes
    // to find the row already completed. Both `now()` comparisons are evaluated
    // by the database, against the same clock that stamped the row at start —
    // the client has no say in whether its time is up.
    const sessionRows = await tx`
      SELECT id,
             user_id,
             status,
             duration_minutes::int AS duration_minutes,
             now() >= eligible_at AS is_eligible,
             now() > expires_at AS is_expired
      FROM study_sessions
      WHERE session_key = ${sessionKey}
      FOR UPDATE
    `;
    const studySession = sessionRows[0];
    if (!studySession || Number(studySession.user_id) !== Number(userId)) {
      // Someone else's key is reported exactly like a key that never existed, so
      // completion cannot be used to probe for live sessions.
      throw new RealmError(404, 'SESSION_NOT_FOUND', 'That study session does not exist.');
    }

    if (studySession.status === 'completed') {
      // A retried request — dropped response, refreshed tab — must neither cost
      // an honest user their coins nor pay twice. Report the balance the first
      // call banked and say plainly that this one changed nothing.
      const memberRows = await tx`
        SELECT id,
               coins::int AS coins,
               units_a::int AS units_a,
               units_b::int AS units_b,
               units_c::int AS units_c,
               seconds_studied::int AS seconds_studied
        FROM realm_members
        WHERE realm_id = ${realmId} AND user_id = ${userId}
      `;
      const member = memberRows[0];
      if (!member) {
        throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
      }
      return { ...studyPayload(member, member.coins), alreadyCredited: true };
    }

    if (studySession.status !== 'pending') {
      throw new RealmError(409, 'SESSION_NOT_CLAIMABLE', 'That study session is no longer claimable.');
    }
    if (!studySession.is_eligible) {
      // The one check the whole table exists for: less wall-clock time has passed
      // on the server than the session claims to have taken.
      throw new RealmError(409, 'SESSION_TOO_EARLY', 'That study session has not finished yet.');
    }
    if (studySession.is_expired) {
      throw new RealmError(409, 'SESSION_EXPIRED', 'That study session expired before it was claimed.');
    }

    // The award follows from the row, never from the request. The bounds check
    // is a fail-loud on a row the CHECK constraint should already have refused.
    const award = validateAndComputeAward(studySession.duration_minutes);
    if (!award.ok) {
      throw new RealmError(400, 'INVALID_DURATION', award.error);
    }
    const durationMinutes = studySession.duration_minutes;
    const secondsStudied = durationMinutes * SECONDS_PER_MINUTE;

    // Lock the current season so a concurrent rollover can't end it between the
    // active-season check and the credit below.
    const seasonRows = await tx`
      SELECT s.id, s.status
      FROM realms r
      JOIN seasons s ON s.id = r.current_season_id
      WHERE r.id = ${realmId}
      FOR UPDATE OF s
    `;
    const season = seasonRows[0];
    if (!season || season.status !== 'active') {
      throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'Your realm does not have an active season.');
    }

    // Atomic credit; read back the authoritative balance + stats for the response.
    const memberRows = await tx`
      UPDATE realm_members
      SET coins = coins + ${award.award},
          seconds_studied = seconds_studied + ${secondsStudied}
      WHERE realm_id = ${realmId} AND user_id = ${userId}
      RETURNING id,
                coins::int AS coins,
                units_a::int AS units_a,
                units_b::int AS units_b,
                units_c::int AS units_c,
                seconds_studied::int AS seconds_studied
    `;
    const member = memberRows[0];
    if (!member) {
      // The membership vanished between the lookup and this transaction (e.g.
      // the user left the realm); nothing to credit.
      throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
    }

    // Log the completed session against the member + season it counted toward.
    // `duration` stays in seconds, matching how sessions were logged before.
    const loggedRows = await tx`
      INSERT INTO sessions (user_id, duration, coins_earned, season_id, realm_member_id)
      VALUES (${userId}, ${secondsStudied}, ${award.award}, ${season.id}, ${member.id})
      RETURNING id
    `;

    // Close the session in the same transaction as the credit, so a row can only
    // ever be paid once and carries the receipt of what it paid.
    await tx`
      UPDATE study_sessions
      SET status = 'completed',
          completed_at = now(),
          coins_awarded = ${award.award},
          session_id = ${loggedRows[0]?.id ?? null}
      WHERE id = ${studySession.id}
    `;

    // Earning coins mutates economy state → bump the season's poll version so
    // dashboard/leaderboard pollers pick the change up.
    await tx`
      UPDATE seasons SET state_version = state_version + 1 WHERE id = ${season.id}
    `;

    const quest = await evaluateQuest(tx, {
      userId,
      realmId,
      seasonId: season.id,
      memberId: member.id,
      event: 'study.complete',
      data: { durationMinutes },
      now: new Date(),
    });

    const coins = member.coins + quest.coinsAwarded;
    return {
      ...studyPayload(member, coins),
      ...(quest.questCompleted ? { questCompleted: quest.questCompleted } : {}),
    };
  });
}

// Aggregate the user's logged sessions into lifetime + current-season stats and
// a global study streak. Read-only: intentionally does NOT call
// ensureSeasonFresh, so a GET never mutates season state. `tzInput` buckets
// sessions into local calendar days for the streak/per-day metrics.
export async function getStudyStats(userId, tzInput) {
  const tz = normalizeTz(tzInput);

  // The user's current active season, if any (season block scopes to it).
  const seasonRows = await sql`
    SELECT s.id AS season_id
    FROM realm_members rm
    JOIN realms r ON r.id = rm.realm_id
    JOIN seasons s ON s.id = r.current_season_id
    WHERE rm.user_id = ${userId} AND s.status = 'active'
    LIMIT 1
  `;
  const seasonId = seasonRows[0]?.season_id ?? null;

  const [allTimeRows, dayRows, todayRows, seasonRows2] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(duration), 0)::int AS total_seconds,
        COUNT(*)::int AS session_count,
        COALESCE(SUM(coins_earned), 0)::int AS total_coins,
        COUNT(DISTINCT (created_at AT TIME ZONE ${tz})::date)::int AS active_days
      FROM sessions
      WHERE user_id = ${userId}
    `,
    // Local study days, and what was studied on each. The streak reads only the
    // days and the chart reads only the last seven, but they share one query on
    // purpose: it is the same GROUP BY over the same rows, so the extra column
    // costs no scan and no round trip, and the two cannot disagree about a
    // session that lands mid-request the way two separate reads could.
    sql`
      SELECT to_char((created_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(duration), 0)::int AS seconds
      FROM sessions
      WHERE user_id = ${userId}
      GROUP BY day
      ORDER BY day
    `,
    sql`SELECT to_char((now() AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS today`,
    seasonId == null
      ? Promise.resolve([])
      : sql`
        SELECT
          COALESCE(SUM(duration), 0)::int AS total_seconds,
          COUNT(*)::int AS session_count,
          COALESCE(SUM(coins_earned), 0)::int AS total_coins,
          COUNT(DISTINCT (created_at AT TIME ZONE ${tz})::date)::int AS active_days
        FROM sessions
        WHERE user_id = ${userId} AND season_id = ${seasonId}
      `,
  ]);

  const allTime = allTimeRows[0];
  const days = dayRows.map((r) => r.day);
  const today = todayRows[0].today;

  return {
    streak: computeStreak(days, today),
    allTime: buildStatBlock({
      totalSeconds: allTime.total_seconds,
      sessionCount: allTime.session_count,
      totalCoins: allTime.total_coins,
      activeDays: allTime.active_days,
    }),
    season: seasonId == null ? null : buildStatBlock({
      totalSeconds: seasonRows2[0].total_seconds,
      sessionCount: seasonRows2[0].session_count,
      totalCoins: seasonRows2[0].total_coins,
      activeDays: seasonRows2[0].active_days,
    }),
    // All-time, not season-scoped: the card reads "Last 7 days" on both toggle
    // positions, and a week that straddles a rollover is still the user's week.
    last7Days: buildLast7Days(dayRows, today),
  };
}
