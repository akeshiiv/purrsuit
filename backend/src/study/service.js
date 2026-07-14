import { sql, withTransaction } from '../../db.js';
import { computeActions } from '../realms/rules.js';
import { RealmError, ensureSeasonFresh } from '../realms/service.js';
import { validateAndComputeAward } from '../coins.js';
import { evaluateQuest } from '../quests/service.js';
import { normalizeTz, buildStatBlock, computeStreak } from './stats.js';

const SECONDS_PER_MINUTE = 60;

// Credit coins + study time for a fully completed study session. The client
// sends intent only (the duration); the award is derived server-side and
// applied atomically to the member's current-season balance and stats. The
// caller must only invoke this when the focus countdown reaches zero —
// cancelling forfeits the reward and never reaches here.
export async function completeStudy(userId, input = {}) {
  const result = validateAndComputeAward(input?.durationMinutes);
  if (!result.ok) {
    throw new RealmError(400, 'INVALID_DURATION', result.error);
  }
  const { award } = result;
  const secondsStudied = input.durationMinutes * SECONDS_PER_MINUTE;

  // One realm per user (UNIQUE(user_id) on realm_members).
  const membership = await sql`
    SELECT realm_id FROM realm_members WHERE user_id = ${userId} LIMIT 1
  `;
  if (membership.length === 0) {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
  }
  const realmId = membership[0].realm_id;

  // Roll an expired season over first so coins always land on the realm's live
  // season (a just-finished study then credits the freshly started one).
  await ensureSeasonFresh(realmId);

  return withTransaction(async (tx) => {
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
      SET coins = coins + ${award},
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
    await tx`
      INSERT INTO sessions (user_id, duration, coins_earned, season_id, realm_member_id)
      VALUES (${userId}, ${secondsStudied}, ${award}, ${season.id}, ${member.id})
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
      data: { durationMinutes: input.durationMinutes },
      now: new Date(),
    });

    const coins = member.coins + quest.coinsAwarded;
    return {
      coins,
      secondsStudied: member.seconds_studied,
      actions: computeActions({ ...member, coins }),
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
        COUNT(DISTINCT (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date)::int AS active_days
      FROM sessions
      WHERE user_id = ${userId}
    `,
    sql`
      SELECT to_char((created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day
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
          COUNT(DISTINCT (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date)::int AS active_days
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
  };
}
