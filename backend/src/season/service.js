import { sql } from '../../db.js';
import { RealmError, ensureSeasonFresh } from '../realms/service.js';
import { decideSeasonStatus, toLeaderboardRow } from './rules.js';

function toInt(value) {
  return Number(value);
}

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// Project a season row into the contract Season shape.
function seasonPayload(row) {
  return {
    id: toInt(row.season_id ?? row.id),
    status: row.season_status ?? row.status,
    endsAt: iso(row.ends_at ?? row.endsAt),
    stateVersion: toInt(row.state_version ?? row.stateVersion),
    winnerName: row.winner_name ?? row.winnerName ?? null,
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
           s.status AS season_status,
           s.ends_at,
           s.state_version,
           winner_user.name AS winner_name
    FROM realms r
    JOIN seasons s ON s.id = r.current_season_id
    LEFT JOIN realm_members winner_member ON winner_member.id = s.winner_member_id
    LEFT JOIN users winner_user ON winner_user.id = winner_member.user_id
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

  const rows = await sql`
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

  return {
    version,
    changed: true,
    rows: rows.map(toLeaderboardRow),
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
    LEFT JOIN realm_members winner_member ON winner_member.id = s.winner_member_id
    LEFT JOIN users winner_user ON winner_user.id = winner_member.user_id
    WHERE s.realm_id = ${realmId} AND s.status = 'ended'
    ORDER BY s.season_number DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// GET /api/realm/season-status — whether the season has ended and whether this
// player still needs to see the victory/defeat screen.
export async function seasonStatus(userId) {
  const { realmId, ackedSeasonId } = await resolveLiveRealm(userId);
  const current = await currentSeasonRow(realmId);
  if (!current) {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
  }
  const ended = await latestEndedSeasonRow(realmId);

  return decideSeasonStatus({
    current: {
      id: toInt(current.season_id),
      status: current.season_status,
      endsAt: iso(current.ends_at),
      winnerName: current.winner_name ?? null,
    },
    ended: ended
      ? { id: toInt(ended.id), endsAt: iso(ended.ends_at), winnerName: ended.winner_name ?? null }
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
