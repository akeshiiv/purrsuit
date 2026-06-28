import { sql, withTransaction } from '../../db.js';
import { computeActions } from '../realms/rules.js';
import { RealmError, ensureSeasonFresh } from '../realms/service.js';
import { validateAndComputeAward } from '../coins.js';

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

    return {
      coins: member.coins,
      secondsStudied: member.seconds_studied,
      actions: computeActions(member),
    };
  });
}
