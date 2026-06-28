import { sql, withTransaction } from '../../db.js';
import { generateSeasonCells, homeSlotsForSeason, mapSizeForPlayerCount } from '../map/generate.js';
import {
  computeActions,
  generateJoinCode,
  normalizeRealmSettings,
} from './rules.js';

const DEFAULT_COLOUR = '#3b82f6';
const JOIN_CODE_RETRIES = 8;

export class RealmError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function realmError(status, code, message) {
  return new RealmError(status, code, message);
}

function toInt(value) {
  return Number(value);
}

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isJoinCodeCollision(err) {
  return err?.code === '23505' && err?.constraint === 'realms_join_code_key';
}

function isUserRealmCollision(err) {
  return err?.code === '23505' && err?.constraint === 'realm_members_user_id_key';
}

function realmSummary(row, role) {
  return {
    id: toInt(row.realm_id ?? row.id),
    name: row.realm_name ?? row.name,
    joinCode: String(row.join_code ?? row.joinCode).trim(),
    role,
    mapPreset: row.map_preset ?? row.mapPreset,
    maxPlayers: toInt(row.max_players ?? row.maxPlayers),
    mapSize: toInt(row.map_size ?? row.mapSize),
    antiCheatEnabled: Boolean(row.anticheat_enabled ?? row.antiCheatEnabled),
  };
}

function seasonPayload(row) {
  return {
    id: toInt(row.season_id ?? row.id),
    status: row.season_status ?? row.status,
    endsAt: iso(row.ends_at ?? row.endsAt),
    stateVersion: toInt(row.state_version ?? row.stateVersion),
    winnerName: row.winner_name ?? row.winnerName ?? null,
  };
}

function memberPayload(row, { includePrivate = false } = {}) {
  const payload = {
    id: toInt(row.id),
    userId: toInt(row.user_id),
    name: row.name,
    colour: row.colour ?? DEFAULT_COLOUR,
    role: row.role,
    secondsStudied: toInt(row.seconds_studied),
    battlesWon: toInt(row.battles_won),
  };

  if (includePrivate) {
    payload.coins = toInt(row.coins);
    payload.units = {
      a: toInt(row.units_a),
      b: toInt(row.units_b),
      c: toInt(row.units_c),
    };
  }

  return payload;
}

function leaderboardPayload(row) {
  return {
    userId: toInt(row.user_id),
    name: row.name,
    colour: row.colour ?? DEFAULT_COLOUR,
    territories: toInt(row.territories),
    battlesWon: toInt(row.battles_won),
    secondsStudied: toInt(row.seconds_studied),
    cellsA: toInt(row.cells_a),
    cellsB: toInt(row.cells_b),
    cellsC: toInt(row.cells_c),
  };
}

async function insertCells(tx, { seasonId, realmId, cells }) {
  const columnsPerRow = 8;
  const values = [];
  const placeholders = cells.map((cell, index) => {
    const base = index * columnsPerRow;
    values.push(
      seasonId,
      realmId,
      cell.x,
      cell.y,
      cell.type,
      cell.ownerMemberId,
      cell.unitType,
      cell.troopCount,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
  });

  await tx.query(
    `INSERT INTO cells (
      season_id, realm_id, x, y, type, owner_member_id, unit_type, troop_count
    ) VALUES ${placeholders.join(', ')}`,
    values,
  );
}

function assignMembersToGeneratedHomes({ realmId, seasonNumber, maxPlayers, mapPreset, members }) {
  const cells = generateSeasonCells({ realmId, seasonNumber, maxPlayers, mapPreset });
  const slots = homeSlotsForSeason({ realmId, seasonNumber, maxPlayers });
  const cellsByCoord = new Map(cells.map((cell) => [`${cell.x},${cell.y}`, cell]));
  const assignments = [];

  members.forEach((member, index) => {
    const slot = slots[index];
    if (!slot) return;
    const cell = cellsByCoord.get(`${slot.x},${slot.y}`);
    cell.type = 'home';
    cell.ownerMemberId = toInt(member.id);
    cell.unitType = null;
    cell.troopCount = 0;
    assignments.push({ memberId: toInt(member.id), x: slot.x, y: slot.y });
  });

  return { cells, assignments };
}

async function assignHomeCell(tx, { seasonId, memberId, x, y }) {
  await tx`
    UPDATE cells
    SET type = 'home',
        owner_member_id = ${memberId},
        unit_type = NULL,
        troop_count = 0,
        version = version + 1,
        updated_at = now()
    WHERE season_id = ${seasonId} AND x = ${x} AND y = ${y}
  `;
}

async function bumpSeasonVersion(tx, seasonId) {
  const rows = await tx`
    UPDATE seasons
    SET state_version = state_version + 1
    WHERE id = ${seasonId}
    RETURNING id, status, ends_at, state_version
  `;
  return rows[0];
}

async function findNextHomeSlot(tx, realm, seasonNumber) {
  const slots = homeSlotsForSeason({
    realmId: toInt(realm.id),
    seasonNumber: toInt(seasonNumber),
    maxPlayers: toInt(realm.max_players),
  });
  const occupiedRows = await tx`
    SELECT home_x, home_y
    FROM realm_members
    WHERE realm_id = ${realm.id} AND home_x IS NOT NULL AND home_y IS NOT NULL
  `;
  const occupied = new Set(occupiedRows.map((row) => `${row.home_x},${row.home_y}`));
  return slots.find((slot) => !occupied.has(`${slot.x},${slot.y}`)) ?? null;
}

async function memberRowsForRealm(query, realmId) {
  return query`
    SELECT rm.id,
           rm.realm_id,
           rm.user_id,
           u.name,
           u.colour,
           rm.role,
           rm.coins::int AS coins,
           rm.units_a::int AS units_a,
           rm.units_b::int AS units_b,
           rm.units_c::int AS units_c,
           rm.seconds_studied::int AS seconds_studied,
           rm.battles_won::int AS battles_won,
           rm.home_x,
           rm.home_y,
           rm.joined_at
    FROM realm_members rm
    JOIN users u ON u.id = rm.user_id
    WHERE rm.realm_id = ${realmId}
    ORDER BY rm.joined_at ASC, rm.id ASC
  `;
}

async function miniLeaderboardRows(query, realmId, seasonId) {
  const rows = await query`
    SELECT rm.user_id,
           u.name,
           u.colour,
           rm.battles_won::int AS battles_won,
           rm.seconds_studied::int AS seconds_studied,
           COUNT(c.id)::int AS territories,
           (COUNT(c.id) FILTER (WHERE c.unit_type = 'A'))::int AS cells_a,
           (COUNT(c.id) FILTER (WHERE c.unit_type = 'B'))::int AS cells_b,
           (COUNT(c.id) FILTER (WHERE c.unit_type = 'C'))::int AS cells_c
    FROM realm_members rm
    JOIN users u ON u.id = rm.user_id
    LEFT JOIN cells c ON c.owner_member_id = rm.id AND c.season_id = ${seasonId}
    WHERE rm.realm_id = ${realmId}
    GROUP BY rm.id, rm.user_id, u.name, u.colour, rm.battles_won, rm.seconds_studied, rm.joined_at
    ORDER BY territories DESC, rm.battles_won DESC, rm.seconds_studied DESC, rm.joined_at ASC, rm.id ASC
    LIMIT 3
  `;
  return rows.map(leaderboardPayload);
}

async function currentRealmSeasonRow(query, realmId, { lock = false } = {}) {
  const lockSql = lock ? ' FOR UPDATE OF r, s' : '';
  const rows = await query.query(
    `SELECT r.id AS realm_id,
            r.join_code,
            r.name AS realm_name,
            r.admin_user_id,
            r.map_preset,
            r.max_players::int AS max_players,
            r.map_size::int AS map_size,
            r.season_length_days::int AS season_length_days,
            r.anticheat_enabled,
            r.current_season_id,
            s.id AS season_id,
            s.season_number,
            s.status AS season_status,
            s.started_at,
            s.ends_at,
            s.ended_at,
            s.winner_member_id,
            s.state_version,
            winner_user.name AS winner_name
     FROM realms r
     JOIN seasons s ON s.id = r.current_season_id
     LEFT JOIN realm_members winner_member ON winner_member.id = s.winner_member_id
     LEFT JOIN users winner_user ON winner_user.id = winner_member.user_id
     WHERE r.id = $1${lockSql}`,
    [realmId],
  );
  return rows[0] ?? null;
}

async function dashboardPayload(userId, realmId) {
  const rows = await sql`
    SELECT r.id AS realm_id,
           r.join_code,
           r.name AS realm_name,
           r.map_preset,
           r.max_players::int AS max_players,
           r.map_size::int AS map_size,
           r.anticheat_enabled,
           s.id AS season_id,
           s.status AS season_status,
           s.ends_at,
           s.state_version,
           winner_user.name AS winner_name,
           me.role AS my_role
    FROM realms r
    JOIN seasons s ON s.id = r.current_season_id
    JOIN realm_members me ON me.realm_id = r.id AND me.user_id = ${userId}
    LEFT JOIN realm_members winner_member ON winner_member.id = s.winner_member_id
    LEFT JOIN users winner_user ON winner_user.id = winner_member.user_id
    WHERE r.id = ${realmId}
  `;
  const row = rows[0];
  if (!row) return { realm: null };

  const members = await memberRowsForRealm(sql, realmId);
  const meRow = members.find((member) => toInt(member.user_id) === toInt(userId));
  const me = memberPayload(meRow, { includePrivate: true });
  me.actions = computeActions(meRow);

  return {
    realm: realmSummary(row, row.my_role),
    season: seasonPayload(row),
    me,
    members: members.map((member) => memberPayload(member)),
    miniLeaderboard: await miniLeaderboardRows(sql, realmId, row.season_id),
  };
}

async function territoryLeader(tx, realmId, seasonId) {
  const rows = await tx`
    SELECT rm.id AS member_id,
           u.name AS winner_name,
           COUNT(c.id)::int AS territories
    FROM realm_members rm
    JOIN users u ON u.id = rm.user_id
    LEFT JOIN cells c ON c.owner_member_id = rm.id AND c.season_id = ${seasonId}
    WHERE rm.realm_id = ${realmId}
    GROUP BY rm.id, u.name, rm.joined_at
    ORDER BY territories DESC, rm.joined_at ASC, rm.id ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function rollCurrentSeason(tx, current, now) {
  const winner = await territoryLeader(tx, current.realm_id, current.season_id);
  const winnerMemberId = winner?.member_id ?? null;
  const winnerName = winner?.winner_name ?? null;
  const endedRows = await tx`
    UPDATE seasons
    SET status = 'ended',
        ended_at = ${now},
        winner_member_id = ${winnerMemberId},
        state_version = state_version + 1
    WHERE id = ${current.season_id} AND status = 'active'
    RETURNING id, status, ends_at, state_version
  `;

  if (endedRows.length === 0) {
    return { endedSeason: seasonPayload(current), newSeason: seasonPayload(current) };
  }

  const nextSeasonNumber = toInt(current.season_number) + 1;
  const nextEndsAt = addDays(now, toInt(current.season_length_days));
  const newSeasonRows = await tx`
    INSERT INTO seasons (realm_id, season_number, started_at, ends_at, state_version)
    VALUES (${current.realm_id}, ${nextSeasonNumber}, ${now}, ${nextEndsAt}, 1)
    RETURNING id, status, ends_at, state_version
  `;
  const newSeason = newSeasonRows[0];
  const members = await memberRowsForRealm(tx, current.realm_id);

  // TODO(be-leaderboard-season): snapshot season_results before old cells are deleted and member economy is reset.
  await tx`DELETE FROM cells WHERE season_id = ${current.season_id}`;

  const { cells, assignments } = assignMembersToGeneratedHomes({
    realmId: toInt(current.realm_id),
    seasonNumber: nextSeasonNumber,
    maxPlayers: toInt(current.max_players),
    mapPreset: current.map_preset,
    members,
  });
  await insertCells(tx, { seasonId: newSeason.id, realmId: current.realm_id, cells });

  for (const assignment of assignments) {
    await tx`
      UPDATE realm_members
      SET coins = 0,
          units_a = 0,
          units_b = 0,
          units_c = 0,
          seconds_studied = 0,
          battles_won = 0,
          home_x = ${assignment.x},
          home_y = ${assignment.y}
      WHERE id = ${assignment.memberId}
    `;
  }

  await tx`
    UPDATE realms
    SET current_season_id = ${newSeason.id}
    WHERE id = ${current.realm_id}
  `;

  return {
    endedSeason: seasonPayload({ ...endedRows[0], winner_name: winnerName }),
    newSeason: seasonPayload(newSeason),
  };
}

export async function releaseTerritory(tx, memberId) {
  await tx`
    UPDATE cells
    SET type = CASE WHEN type = 'home' THEN 'regular' ELSE type END,
        owner_member_id = NULL,
        unit_type = NULL,
        troop_count = 0,
        version = version + 1,
        updated_at = now()
    WHERE owner_member_id = ${memberId}
  `;
}

export async function ensureSeasonFresh(realmId) {
  return withTransaction(async (tx) => {
    const current = await currentRealmSeasonRow(tx, realmId, { lock: true });
    if (!current) return null;
    const now = new Date();
    if (current.season_status !== 'active' || now < new Date(current.ends_at)) {
      return seasonPayload(current);
    }
    const { newSeason } = await rollCurrentSeason(tx, current, now);
    return newSeason;
  });
}

export async function createRealm(userId, input) {
  const normalized = normalizeRealmSettings(input);
  if (!normalized.ok) {
    throw realmError(400, 'INVALID_REALM_SETTINGS', 'One or more realm settings are invalid.');
  }

  for (let attempt = 0; attempt < JOIN_CODE_RETRIES; attempt += 1) {
    const joinCode = generateJoinCode();
    try {
      return await withTransaction(async (tx) => {
        const existing = await tx`
          SELECT id FROM realm_members WHERE user_id = ${userId} LIMIT 1
        `;
        if (existing.length > 0) {
          throw realmError(409, 'ALREADY_IN_REALM', 'You are already a member of a realm.');
        }

        const { settings } = normalized;
        const mapSize = mapSizeForPlayerCount(settings.maxPlayers);
        const now = new Date();
        const endsAt = addDays(now, settings.seasonLengthDays);
        const realmRows = await tx`
          INSERT INTO realms (
            join_code, name, admin_user_id, map_preset, max_players, map_size,
            season_length_days, anticheat_enabled
          )
          VALUES (
            ${joinCode}, ${settings.name}, ${userId}, ${settings.mapPreset},
            ${settings.maxPlayers}, ${mapSize}, ${settings.seasonLengthDays},
            ${settings.antiCheat}
          )
          RETURNING *
        `;
        const realm = realmRows[0];
        const seasonRows = await tx`
          INSERT INTO seasons (realm_id, season_number, started_at, ends_at, state_version)
          VALUES (${realm.id}, 1, ${now}, ${endsAt}, 1)
          RETURNING id, status, ends_at, state_version
        `;
        const season = seasonRows[0];
        const cells = generateSeasonCells({
          realmId: toInt(realm.id),
          seasonNumber: 1,
          maxPlayers: settings.maxPlayers,
          mapPreset: settings.mapPreset,
        });
        await insertCells(tx, { seasonId: season.id, realmId: realm.id, cells });

        const [home] = homeSlotsForSeason({
          realmId: toInt(realm.id),
          seasonNumber: 1,
          maxPlayers: settings.maxPlayers,
        });
        const memberRows = await tx`
          INSERT INTO realm_members (realm_id, user_id, role, home_x, home_y)
          VALUES (${realm.id}, ${userId}, 'admin', ${home.x}, ${home.y})
          RETURNING id
        `;
        await assignHomeCell(tx, {
          seasonId: season.id,
          memberId: memberRows[0].id,
          x: home.x,
          y: home.y,
        });
        await tx`
          UPDATE realms
          SET current_season_id = ${season.id}
          WHERE id = ${realm.id}
        `;

        return {
          realm: realmSummary(realm, 'admin'),
          joinCode,
          season: seasonPayload(season),
        };
      });
    } catch (err) {
      if (isJoinCodeCollision(err)) continue;
      if (isUserRealmCollision(err)) {
        throw realmError(409, 'ALREADY_IN_REALM', 'You are already a member of a realm.');
      }
      throw err;
    }
  }

  throw realmError(500, 'JOIN_CODE_EXHAUSTED', 'Unable to allocate a join code.');
}

export async function joinRealm(userId, input = {}) {
  const joinCode = typeof input.joinCode === 'string' ? input.joinCode.trim().toUpperCase() : '';

  return withTransaction(async (tx) => {
    const existing = await tx`
      SELECT id FROM realm_members WHERE user_id = ${userId} LIMIT 1
    `;
    if (existing.length > 0) {
      throw realmError(409, 'ALREADY_IN_REALM', 'You are already a member of a realm.');
    }

    const rows = await tx`
      SELECT r.*,
             s.id AS season_id,
             s.season_number,
             s.status AS season_status,
             s.ends_at,
             s.state_version
      FROM realms r
      JOIN seasons s ON s.id = r.current_season_id
      WHERE r.join_code = ${joinCode}
      FOR UPDATE OF r, s
    `;
    const row = rows[0];
    if (!row) {
      throw realmError(404, 'REALM_NOT_FOUND', 'No realm exists for that join code.');
    }
    if (row.season_status !== 'active') {
      throw realmError(409, 'SEASON_ENDED', 'This realm is between active seasons.');
    }

    const countRows = await tx`
      SELECT COUNT(*)::int AS count FROM realm_members WHERE realm_id = ${row.id}
    `;
    if (countRows[0].count >= row.max_players) {
      throw realmError(409, 'REALM_FULL', 'This realm is full.');
    }

    const home = await findNextHomeSlot(tx, row, row.season_number);
    if (!home) {
      throw realmError(409, 'REALM_FULL', 'This realm is full.');
    }

    const memberRows = await tx`
      INSERT INTO realm_members (realm_id, user_id, role, home_x, home_y)
      VALUES (${row.id}, ${userId}, 'member', ${home.x}, ${home.y})
      RETURNING id
    `;
    await assignHomeCell(tx, {
      seasonId: row.season_id,
      memberId: memberRows[0].id,
      x: home.x,
      y: home.y,
    });
    const season = await bumpSeasonVersion(tx, row.season_id);

    return {
      realm: realmSummary(row, 'member'),
      season: seasonPayload(season),
    };
  }).catch((err) => {
    if (isUserRealmCollision(err)) {
      throw realmError(409, 'ALREADY_IN_REALM', 'You are already a member of a realm.');
    }
    throw err;
  });
}

export async function currentRealm(userId) {
  const membership = await sql`
    SELECT realm_id FROM realm_members WHERE user_id = ${userId} LIMIT 1
  `;
  if (membership.length === 0) {
    return { realm: null };
  }

  const realmId = membership[0].realm_id;
  await ensureSeasonFresh(realmId);
  return dashboardPayload(userId, realmId);
}

export async function leaveRealm(userId) {
  return withTransaction(async (tx) => {
    const rows = await tx`
      SELECT rm.id,
             rm.realm_id,
             rm.role,
             r.current_season_id
      FROM realm_members rm
      JOIN realms r ON r.id = rm.realm_id
      WHERE rm.user_id = ${userId}
      FOR UPDATE OF rm, r
    `;
    const member = rows[0];
    if (!member) return { ok: true };

    const remaining = await tx`
      SELECT id, user_id
      FROM realm_members
      WHERE realm_id = ${member.realm_id} AND user_id <> ${userId}
      ORDER BY joined_at ASC, id ASC
    `;

    await releaseTerritory(tx, member.id);

    if (remaining.length === 0) {
      await tx`DELETE FROM realms WHERE id = ${member.realm_id}`;
      return { ok: true };
    }

    await tx`DELETE FROM realm_members WHERE id = ${member.id}`;

    if (member.role === 'admin') {
      const promoted = remaining[0];
      await tx`UPDATE realm_members SET role = 'admin' WHERE id = ${promoted.id}`;
      await tx`
        UPDATE realms
        SET admin_user_id = ${promoted.user_id}
        WHERE id = ${member.realm_id}
      `;
    }

    await bumpSeasonVersion(tx, member.current_season_id);
    return { ok: true };
  });
}

async function adminMember(tx, realmId, userId) {
  const rows = await tx`
    SELECT rm.id, rm.role
    FROM realm_members rm
    WHERE rm.realm_id = ${realmId} AND rm.user_id = ${userId}
    LIMIT 1
  `;
  const member = rows[0];
  return member?.role === 'admin' ? member : null;
}

export async function kickMember(userId, realmId, input = {}) {
  const targetUserId = Number(input.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw realmError(404, 'MEMBER_NOT_FOUND', 'That user is not a member of this realm.');
  }
  if (targetUserId === Number(userId)) {
    throw realmError(400, 'CANNOT_KICK_SELF', 'Admins cannot kick themselves.');
  }

  return withTransaction(async (tx) => {
    const admin = await adminMember(tx, realmId, userId);
    if (!admin) {
      throw realmError(403, 'NOT_ADMIN', 'Only the realm admin can do that.');
    }

    const targetRows = await tx`
      SELECT rm.id, r.current_season_id
      FROM realm_members rm
      JOIN realms r ON r.id = rm.realm_id
      WHERE rm.realm_id = ${realmId} AND rm.user_id = ${targetUserId}
      LIMIT 1
    `;
    const target = targetRows[0];
    if (!target) {
      throw realmError(404, 'MEMBER_NOT_FOUND', 'That user is not a member of this realm.');
    }

    await releaseTerritory(tx, target.id);
    await tx`DELETE FROM realm_members WHERE id = ${target.id}`;
    await bumpSeasonVersion(tx, target.current_season_id);
    return { ok: true };
  });
}

export async function endSeasonNow(userId, realmId) {
  return withTransaction(async (tx) => {
    const admin = await adminMember(tx, realmId, userId);
    if (!admin) {
      throw realmError(403, 'NOT_ADMIN', 'Only the realm admin can do that.');
    }
    const current = await currentRealmSeasonRow(tx, realmId, { lock: true });
    if (!current) {
      throw realmError(403, 'NOT_ADMIN', 'Only the realm admin can do that.');
    }
    const { endedSeason } = await rollCurrentSeason(tx, current, new Date());
    return { season: endedSeason };
  });
}

export async function updateRealmSettings(userId, realmId, input = {}) {
  return withTransaction(async (tx) => {
    const admin = await adminMember(tx, realmId, userId);
    if (!admin) {
      throw realmError(403, 'NOT_ADMIN', 'Only the realm admin can do that.');
    }

    const rows = await tx`
      UPDATE realms
      SET anticheat_enabled = ${Boolean(input.antiCheat)}
      WHERE id = ${realmId}
      RETURNING *
    `;

    return { realm: realmSummary(rows[0], 'admin') };
  });
}
