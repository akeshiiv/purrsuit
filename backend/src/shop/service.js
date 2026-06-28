import { sql, withTransaction } from '../../db.js';
import { computeActions } from '../realms/rules.js';
import { RealmError, ensureSeasonFresh } from '../realms/service.js';
import {
  UNIT_COST,
  classifyBuy,
  normalizeUnitType,
  unitColumn,
  unitsPayload,
} from './rules.js';

// Resolve the caller's realm membership (one realm per user) and roll an expired
// season over first, so coins/units always reflect the realm's live season (a
// just-rolled season has reset the economy to zero). Returns the realm id.
async function resolveLiveRealm(userId) {
  const membership = await sql`
    SELECT realm_id FROM realm_members WHERE user_id = ${userId} LIMIT 1
  `;
  if (membership.length === 0) {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
  }
  const realmId = membership[0].realm_id;
  await ensureSeasonFresh(realmId);
  return realmId;
}

function inventoryShape(member) {
  const units = unitsPayload(member);
  return {
    coins: member.coins,
    units,
    total: units.a + units.b + units.c,
    actions: computeActions(member),
  };
}

// Buy one Cat Unit for 100 coins. Server-authoritative and atomic: the member
// row is locked FOR UPDATE so the read-classify-write below cannot race a
// concurrent buy, and the realm_members CHECK constraints (coins >= 0,
// units <= 6) remain the final backstop.
export async function buyUnit(userId, input = {}) {
  const unitType = normalizeUnitType(input?.unitType);
  if (!unitType) {
    throw new RealmError(400, 'INVALID_UNIT_TYPE', 'unitType must be one of A, B, or C.');
  }

  const realmId = await resolveLiveRealm(userId);

  return withTransaction(async (tx) => {
    // Lock the current season so a concurrent rollover can't reset the economy
    // between the active-season check and the debit below.
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

    // Lock my member row, then decide against that exact locked snapshot.
    const lockedRows = await tx`
      SELECT coins::int AS coins,
             units_a::int AS units_a,
             units_b::int AS units_b,
             units_c::int AS units_c
      FROM realm_members
      WHERE realm_id = ${realmId} AND user_id = ${userId}
      FOR UPDATE
    `;
    const locked = lockedRows[0];
    if (!locked) {
      throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
    }

    const decision = classifyBuy(locked);
    if (!decision.ok) {
      throw new RealmError(decision.status, decision.code, decision.code === 'INVENTORY_FULL'
        ? 'Your inventory is full (6 units).'
        : 'You do not have enough coins.');
    }

    // The column name comes from a fixed whitelist (unitColumn), so inlining it
    // is injection-safe. Holding the row lock guarantees this updates one row.
    const column = unitColumn(unitType);
    const updatedRows = await tx.query(
      `UPDATE realm_members
          SET coins = coins - $1,
              ${column} = ${column} + 1
        WHERE realm_id = $2 AND user_id = $3
        RETURNING coins::int AS coins,
                  units_a::int AS units_a,
                  units_b::int AS units_b,
                  units_c::int AS units_c`,
      [UNIT_COST, realmId, userId],
    );
    const member = updatedRows[0];

    // Buying mutates season-scoped economy state → bump the poll version so open
    // dashboards/pollers pick the change up, consistent with study completion.
    await tx`
      UPDATE seasons SET state_version = state_version + 1 WHERE id = ${season.id}
    `;

    const units = unitsPayload(member);
    return {
      coins: member.coins,
      units,
      actions: computeActions(member),
    };
  });
}

// Read-only: current balance, held units, total, and the action gates.
export async function getInventory(userId) {
  const realmId = await resolveLiveRealm(userId);

  const rows = await sql`
    SELECT coins::int AS coins,
           units_a::int AS units_a,
           units_b::int AS units_b,
           units_c::int AS units_c
    FROM realm_members
    WHERE realm_id = ${realmId} AND user_id = ${userId}
  `;
  const member = rows[0];
  if (!member) {
    throw new RealmError(409, 'NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.');
  }

  return inventoryShape(member);
}
