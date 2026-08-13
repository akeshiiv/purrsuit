import { sql } from '../../db.js';
import { RealmError, ensureSeasonFresh } from '../realms/service.js';
import { decideSeasonStatus, streaksByUser, toLeaderboardRow } from './rules.js';

function toInt(value) {
  return Number(value);
}

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// Project a season row into the contract Season shape. Duplicated in
// ../realms/service.js; the two must stay in step.
function seasonPayload(row) {
  return {
    id: toInt(row.season_id ?? row.id),
    status: row.season_status ?? row.status,
    endsAt: iso(row.ends_at ?? row.endsAt),
    stateVersion: toInt(row.state_version ?? row.stateVersion),
    winnerName: row.winner_name ?? row.winnerName ?? null,
    // `season_number` is the per-realm counter the UI means by "season 12";
    // `id` is a global row id and is not it once a second realm exists.
    seasonNumber: toInt(row.season_number ?? row.seasonNumber),
    startedAt: iso(row.started_at ?? row.startedAt),
  };
}

// Resolve the caller's realm (one realm per user) and roll an expired season
// over first, so standings and season status always reflect the live season.
async function resolveLiveRealm(userId) {
  const membership = await sql`
    SELECT realm_id, acked_season_id
    FROM realm_members
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  if (membership.length === 0) {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
  }
  const member = membership[0];
  await ensureSeasonFresh(member.realm_id);
  return { realmId: member.realm_id, ackedSeasonId: member.acked_season_id };
}

// Load the realm's current (post-rollover, active) season.
async function currentSeasonRow(realmId) {
  const rows = await sql`
    SELECT s.id AS season_id,
           s.season_number,
           s.status AS season_status,
           s.started_at,
           s.ends_at,
           s.state_version,
           winner_user.name AS winner_name
    FROM realms r
    JOIN seasons s ON s.id = r.current_season_id
    LEFT JOIN season_results winner_result
           ON winner_result.season_id = s.id AND winner_result.rank = 1
    LEFT JOIN users winner_user ON winner_user.id = winner_result.user_id
    WHERE r.id = ${realmId}
  `;
  return rows[0] ?? null;
}

// GET /api/realm/leaderboard — full standings for the current season, sorted by
// territory held (descending) with the same tiebreakers as the dashboard's
// mini-leaderboard. Short-circuits when the caller's `since` already matches the
// live state version.
export async function leaderboard(userId, { since } = {}) {
  const { realmId } = await resolveLiveRealm(userId);
  const season = await currentSeasonRow(realmId);
  if (!season) {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
  }

  const version = toInt(season.state_version);
  const sinceVersion = Number(since);
  if (Number.isFinite(sinceVersion) && sinceVersion === version) {
    return { version, changed: false };
  }

  const standings = sql`
    SELECT rm.user_id,
           u.name,
           u.colour,
           COUNT(c.id)::int AS territories,
           rm.battles_won::int AS battles_won,
           rm.seconds_studied::int AS seconds_studied,
           (COUNT(c.id) FILTER (WHERE c.unit_type = 'A'))::int AS cells_a,
           (COUNT(c.id) FILTER (WHERE c.unit_type = 'B'))::int AS cells_b,
           (COUNT(c.id) FILTER (WHERE c.unit_type = 'C'))::int AS cells_c
    FROM realm_members rm
    JOIN users u ON u.id = rm.user_id
    LEFT JOIN cells c ON c.owner_member_id = rm.id AND c.season_id = ${season.season_id}
    WHERE rm.realm_id = ${realmId}
    GROUP BY rm.id, rm.user_id, u.name, u.colour, rm.battles_won, rm.seconds_studied, rm.joined_at
    ORDER BY territories DESC, rm.battles_won DESC, rm.seconds_studied DESC, rm.joined_at ASC, rm.id ASC
  `;

  // Every member's distinct study days in ONE grouped pass, not a query per row:
  // this runs on every leaderboard poll, for every member of the realm.
  //
  // Days are bucketed in each member's OWN zone, not the viewer's and not UTC. A
  // streak is a run of that player's calendar days, so it is their midnight that
  // ends a day — which is also what makes the row agree with the streak the same
  // player is shown on their Stats page. `users.time_zone` stays NULL until a
  // client has synced one, and every read site coalesces that to 'UTC'.
  //
  // Each member's local "today" is selected alongside their days, because
  // computeStreak still counts a run that ended yesterday and yesterday in Tokyo
  // is not the same span of hours as yesterday in Chicago. One shared date would
  // quietly hand or withhold a day from everyone in the wrong half of the world.
  //
  // `sessions.created_at` is a bare TIMESTAMP holding UTC wall time, so it has to
  // be labelled UTC before it can be converted — the same
  // `AT TIME ZONE 'UTC' AT TIME ZONE <zone>` pattern getStudyStats uses.
  //
  // Scope is all-time, matching the streak a player sees on their own stats: a
  // streak is a study habit, not a season score, and zeroing everyone's at each
  // rollover would take it away from exactly the players who kept showing up.
  const studyDays = sql`
    SELECT rm.user_id,
           to_char(
             (s.created_at AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(u.time_zone, 'UTC'))::date,
             'YYYY-MM-DD'
           ) AS day,
           to_char(
             (now() AT TIME ZONE COALESCE(u.time_zone, 'UTC'))::date,
             'YYYY-MM-DD'
           ) AS today
    FROM realm_members rm
    JOIN users u ON u.id = rm.user_id
    JOIN sessions s ON s.user_id = rm.user_id
    WHERE rm.realm_id = ${realmId}
    GROUP BY rm.user_id, day, today
  `;

  const [rows, dayRows] = await Promise.all([standings, studyDays]);
  const streaks = streaksByUser(dayRows);

  return {
    version,
    changed: true,
    rows: rows.map((row) => toLeaderboardRow(row, streaks.get(toInt(row.user_id)))),
    season: seasonPayload(season),
  };
}

// The realm's most-recently-ended season (or null). Drives the show-once screen.
async function latestEndedSeasonRow(realmId) {
  const rows = await sql`
    SELECT s.id,
           s.ends_at,
           winner_user.name AS winner_name
    FROM seasons s
    LEFT JOIN season_results winner_result
           ON winner_result.season_id = s.id AND winner_result.rank = 1
    LEFT JOIN users winner_user ON winner_user.id = winner_result.user_id
    WHERE s.realm_id = ${realmId} AND s.status = 'ended'
    ORDER BY s.season_number DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// The final standings snapshotted for a season when it rolled over, in rank
// order. Read from `season_results` rather than recomputed, because the rollover
// deletes that season's cells and resets the member economy in the same
// transaction — there is nothing left to aggregate afterwards.
async function finalStandings(seasonId) {
  const rows = await sql`
    SELECT sr.user_id,
           u.name,
           u.colour,
           sr.territories,
           sr.battles_won,
           sr.seconds_studied,
           sr.cells_a,
           sr.cells_b,
           sr.cells_c
    FROM season_results sr
    JOIN users u ON u.id = sr.user_id
    WHERE sr.season_id = ${seasonId}
    ORDER BY sr.rank ASC
  `;
  // No streak argument: `season_results` snapshots standings, not study days, so
  // there is nothing here to recount a run of calendar days from — and a streak
  // measured against *today* would keep drifting under a table that is supposed
  // to be frozen at season end. Rows still carry the keys, at 0.
  return rows.map((row) => toLeaderboardRow(row));
}

// GET /api/realm/season-status — whether the season has ended and whether this
// player still needs to see the victory/defeat screen (and, when they do, the
// ended season's final standings to show on it).
export async function seasonStatus(userId) {
  const { realmId, ackedSeasonId } = await resolveLiveRealm(userId);
  const current = await currentSeasonRow(realmId);
  if (!current) {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
  }
  const ended = await latestEndedSeasonRow(realmId);
  // Only fetch the snapshot when it can actually be shown.
  const needsAck = Boolean(ended) && toInt(ackedSeasonId) !== toInt(ended.id);

  return decideSeasonStatus({
    current: {
      id: toInt(current.season_id),
      status: current.season_status,
      endsAt: iso(current.ends_at),
      winnerName: current.winner_name ?? null,
    },
    ended: ended
      ? {
        id: toInt(ended.id),
        endsAt: iso(ended.ends_at),
        winnerName: ended.winner_name ?? null,
        rows: needsAck ? await finalStandings(ended.id) : [],
      }
      : null,
    ackedSeasonId,
  });
}

// POST /api/realm/season-ack — mark the most-recently-ended season's end screen
// as seen. Idempotent: re-acking writes the same id (or NULL if none ended yet).
export async function seasonAck(userId) {
  const { realmId } = await resolveLiveRealm(userId);

  await sql`
    UPDATE realm_members
    SET acked_season_id = (
      SELECT s.id
      FROM seasons s
      WHERE s.realm_id = ${realmId} AND s.status = 'ended'
      ORDER BY s.season_number DESC
      LIMIT 1
    )
    WHERE realm_id = ${realmId} AND user_id = ${userId}
  `;

  return { ok: true };
}
