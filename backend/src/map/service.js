import { sql, withTransaction } from '../../db.js';
import { RealmError, ensureSeasonFresh } from '../realms/service.js';
import { computeActions } from '../realms/rules.js';
import { isUnitType, neighbourCoords, resolveAttack } from './rules.js';

const DEFAULT_COLOUR = '#3b82f6';

// Whitelisted mapping from a unit code to its inventory column. Used to build
// dynamic UPDATEs safely — values come only from this table, never user input.
const UNIT_COLUMN = { A: 'units_a', B: 'units_b', C: 'units_c' };

function toInt(value) {
  return Number(value);
}

function parseCoord(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// Serialise a cell row (joined to its owner's colour) to the API Cell shape.
// Neutral cells carry null owner/colour/unitType and a zero troop count.
function cellPayload(row) {
  const owned = row.owner_member_id != null;
  return {
    x: toInt(row.x),
    y: toInt(row.y),
    type: row.type,
    ownerMemberId: owned ? toInt(row.owner_member_id) : null,
    colour: owned ? (row.colour ?? DEFAULT_COLOUR) : null,
    unitType: row.unit_type ?? null,
    troopCount: toInt(row.troop_count),
  };
}

function mePayload(row) {
  const me = {
    id: toInt(row.id),
    userId: toInt(row.user_id),
    name: row.name,
    colour: row.colour ?? DEFAULT_COLOUR,
    role: row.role,
    coins: toInt(row.coins),
    units: { a: toInt(row.units_a), b: toInt(row.units_b), c: toInt(row.units_c) },
    secondsStudied: toInt(row.seconds_studied),
    battlesWon: toInt(row.battles_won),
  };
  me.actions = computeActions(row);
  return me;
}

function unitsPayload(row) {
  return { a: toInt(row.units_a), b: toInt(row.units_b), c: toInt(row.units_c) };
}

async function memberRealmId(userId) {
  const rows = await sql`
    SELECT realm_id FROM realm_members WHERE user_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
  }
  return rows[0].realm_id;
}

// Lock the realm's current season and confirm it is active, so a concurrent
// rollover can't end it mid-transaction. Returns the season id.
async function lockActiveSeason(tx, realmId) {
  const rows = await tx`
    SELECT s.id, s.status
    FROM realms r
    JOIN seasons s ON s.id = r.current_season_id
    WHERE r.id = ${realmId}
    FOR UPDATE OF s
  `;
  const season = rows[0];
  if (!season || season.status !== 'active') {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'Your realm does not have an active season.');
  }
  return season.id;
}

async function bumpSeasonVersion(tx, seasonId) {
  await tx`UPDATE seasons SET state_version = state_version + 1 WHERE id = ${seasonId}`;
}

async function selectCellPayload(tx, cellId) {
  const rows = await tx`
    SELECT c.x, c.y, c.type, c.owner_member_id, c.unit_type,
           c.troop_count::int AS troop_count, u.colour
    FROM cells c
    LEFT JOIN realm_members rm ON rm.id = c.owner_member_id
    LEFT JOIN users u ON u.id = rm.user_id
    WHERE c.id = ${cellId}
  `;
  return cellPayload(rows[0]);
}

// GET /api/realm/map — the current season's grid. Rolls an expired season over
// first so the map always reflects the live season, then short-circuits when
// the caller's `since` already matches the current state version.
export async function realmMap(userId, { since } = {}) {
  const realmId = await memberRealmId(userId);
  await ensureSeasonFresh(realmId);

  const contextRows = await sql`
    SELECT r.map_size::int AS map_size,
           s.id AS season_id,
           s.state_version::int AS state_version
    FROM realms r
    JOIN seasons s ON s.id = r.current_season_id
    WHERE r.id = ${realmId}
  `;
  const context = contextRows[0];
  if (!context) {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
  }

  const sinceVersion = Number(since);
  if (Number.isFinite(sinceVersion) && sinceVersion === context.state_version) {
    return { version: context.state_version, changed: false };
  }

  const cellRows = await sql`
    SELECT c.x, c.y, c.type, c.owner_member_id, c.unit_type,
           c.troop_count::int AS troop_count, u.colour
    FROM cells c
    LEFT JOIN realm_members rm ON rm.id = c.owner_member_id
    LEFT JOIN users u ON u.id = rm.user_id
    WHERE c.season_id = ${context.season_id}
    ORDER BY c.y ASC, c.x ASC
  `;
  const memberRows = await sql`
    SELECT rm.id, u.name, u.colour
    FROM realm_members rm
    JOIN users u ON u.id = rm.user_id
    WHERE rm.realm_id = ${realmId}
    ORDER BY rm.joined_at ASC, rm.id ASC
  `;
  const meRows = await sql`
    SELECT rm.id, rm.user_id, u.name, u.colour, rm.role,
           rm.coins::int AS coins,
           rm.units_a::int AS units_a, rm.units_b::int AS units_b, rm.units_c::int AS units_c,
           rm.seconds_studied::int AS seconds_studied,
           rm.battles_won::int AS battles_won
    FROM realm_members rm
    JOIN users u ON u.id = rm.user_id
    WHERE rm.user_id = ${userId}
  `;

  return {
    version: context.state_version,
    changed: true,
    size: context.map_size,
    cells: cellRows.map(cellPayload),
    members: memberRows.map((row) => ({
      id: toInt(row.id),
      name: row.name,
      colour: row.colour ?? DEFAULT_COLOUR,
    })),
    me: mePayload(meRows[0]),
  };
}

// POST /api/realm/attack — deploy `quantity` of `unitType` from inventory onto a
// neutral or enemy regular cell adjacent to one the caller owns. Resolved under
// a row lock on the target cell so concurrent hits serialise.
export async function attack(userId, input = {}) {
  const x = parseCoord(input.x);
  const y = parseCoord(input.y);
  const unitType = input.unitType;
  const quantity = Number(input.quantity);

  if (x === null || y === null) {
    throw new RealmError(400, 'INVALID_TARGET', 'Target coordinates are invalid.');
  }
  if (!isUnitType(unitType)) {
    throw new RealmError(400, 'INVALID_REQUEST', 'Unknown unit type.');
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RealmError(409, 'INSUFFICIENT_UNITS', 'You must commit at least one unit.');
  }

  const realmId = await memberRealmId(userId);
  await ensureSeasonFresh(realmId);

  return withTransaction(async (tx) => {
    const seasonId = await lockActiveSeason(tx, realmId);

    const cellRows = await tx`
      SELECT id, type, owner_member_id, unit_type, troop_count::int AS troop_count
      FROM cells
      WHERE season_id = ${seasonId} AND x = ${x} AND y = ${y}
      FOR UPDATE
    `;
    const cell = cellRows[0];
    if (!cell) {
      throw new RealmError(400, 'INVALID_TARGET', 'There is no such cell on the map.');
    }
    if (cell.type !== 'regular') {
      throw new RealmError(400, 'INVALID_TARGET', 'You can only attack regular cells.');
    }

    const memberRows = await tx`
      SELECT id, units_a::int AS units_a, units_b::int AS units_b, units_c::int AS units_c
      FROM realm_members
      WHERE realm_id = ${realmId} AND user_id = ${userId}
      FOR UPDATE
    `;
    const member = memberRows[0];
    if (!member) {
      throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
    }
    const memberId = toInt(member.id);

    if (cell.owner_member_id != null && toInt(cell.owner_member_id) === memberId) {
      throw new RealmError(400, 'INVALID_TARGET', 'You already hold this cell.');
    }

    const neighbours = neighbourCoords(x, y);
    const adjacencyClause = neighbours
      .map((_, i) => `(x = $${i * 2 + 3} AND y = $${i * 2 + 4})`)
      .join(' OR ');
    const adjacentRows = await tx.query(
      `SELECT 1 FROM cells
       WHERE season_id = $1 AND owner_member_id = $2 AND (${adjacencyClause})
       LIMIT 1`,
      [seasonId, memberId, ...neighbours.flatMap((n) => [n.x, n.y])],
    );
    if (adjacentRows.length === 0) {
      throw new RealmError(400, 'NOT_ADJACENT', 'You have no cell adjacent to that target.');
    }

    const unitColumn = UNIT_COLUMN[unitType];
    if (member[unitColumn] < quantity) {
      throw new RealmError(409, 'INSUFFICIENT_UNITS', `You do not have ${quantity} of unit ${unitType}.`);
    }

    const outcome = resolveAttack({
      attackerMemberId: memberId,
      attackerUnitType: unitType,
      quantity,
      target: {
        ownerMemberId: cell.owner_member_id != null ? toInt(cell.owner_member_id) : null,
        unitType: cell.unit_type,
        troopCount: cell.troop_count,
      },
    });

    await tx`
      UPDATE cells
      SET owner_member_id = ${outcome.ownerMemberId},
          unit_type = ${outcome.unitType},
          troop_count = ${outcome.troopCount},
          version = version + 1,
          updated_at = now()
      WHERE id = ${cell.id}
    `;

    const updatedRows = await tx.query(
      `UPDATE realm_members
       SET ${unitColumn} = ${unitColumn} - $1,
           battles_won = battles_won + $2
       WHERE id = $3
       RETURNING units_a::int AS units_a, units_b::int AS units_b, units_c::int AS units_c`,
      [quantity, outcome.battleWon ? 1 : 0, memberId],
    );

    await bumpSeasonVersion(tx, seasonId);

    return {
      ok: true,
      result: outcome.result,
      cell: await selectCellPayload(tx, cell.id),
      units: unitsPayload(updatedRows[0]),
    };
  });
}

// POST /api/realm/defend — reinforce a cell the caller owns by one troop,
// consuming one matching unit. Locks the target cell + member for the update.
export async function defend(userId, input = {}) {
  const x = parseCoord(input.x);
  const y = parseCoord(input.y);
  const unitType = input.unitType;

  if (x === null || y === null) {
    throw new RealmError(403, 'NOT_OWNER', 'The cell is not owned by you.');
  }
  if (!isUnitType(unitType)) {
    throw new RealmError(400, 'INVALID_REQUEST', 'Unknown unit type.');
  }

  const realmId = await memberRealmId(userId);
  await ensureSeasonFresh(realmId);

  return withTransaction(async (tx) => {
    const seasonId = await lockActiveSeason(tx, realmId);

    const cellRows = await tx`
      SELECT id, owner_member_id, unit_type
      FROM cells
      WHERE season_id = ${seasonId} AND x = ${x} AND y = ${y}
      FOR UPDATE
    `;
    const cell = cellRows[0];

    const memberRows = await tx`
      SELECT id, units_a::int AS units_a, units_b::int AS units_b, units_c::int AS units_c
      FROM realm_members
      WHERE realm_id = ${realmId} AND user_id = ${userId}
      FOR UPDATE
    `;
    const member = memberRows[0];
    if (!member) {
      throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
    }
    const memberId = toInt(member.id);

    if (!cell || cell.owner_member_id == null || toInt(cell.owner_member_id) !== memberId) {
      throw new RealmError(403, 'NOT_OWNER', 'The cell is not owned by you.');
    }
    if (cell.unit_type !== unitType) {
      throw new RealmError(400, 'UNIT_TYPE_MISMATCH', "That unit type does not match the cell's garrison.");
    }

    const unitColumn = UNIT_COLUMN[unitType];
    if (member[unitColumn] < 1) {
      throw new RealmError(409, 'INSUFFICIENT_UNITS', `You have no unit ${unitType} to deploy.`);
    }

    await tx`
      UPDATE cells
      SET troop_count = troop_count + 1,
          version = version + 1,
          updated_at = now()
      WHERE id = ${cell.id}
    `;

    const updatedRows = await tx.query(
      `UPDATE realm_members
       SET ${unitColumn} = ${unitColumn} - 1
       WHERE id = $1
       RETURNING units_a::int AS units_a, units_b::int AS units_b, units_c::int AS units_c`,
      [memberId],
    );

    await bumpSeasonVersion(tx, seasonId);

    return {
      ok: true,
      cell: await selectCellPayload(tx, cell.id),
      units: unitsPayload(updatedRows[0]),
    };
  });
}
