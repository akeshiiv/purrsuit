// Pure, database-free combat rules for the territory map. Kept separate from
// the service so attack resolution can be unit-tested without a live database.

// Rock-paper-scissors cycle: A beats B, B beats C, C beats A.
const BEATS = { A: 'B', B: 'C', C: 'A' };

const UNIT_TYPES = new Set(['A', 'B', 'C']);

export function isUnitType(value) {
  return UNIT_TYPES.has(value);
}

// True when `attacker`'s unit type defeats `defender`'s. A matching type is a
// tie (false) — it neither beats nor loses.
export function beats(attacker, defender) {
  return BEATS[attacker] === defender;
}

// The four 4-neighbour coordinates of (x, y). Off-board coordinates are not
// filtered here — callers that need bounds checking do it against real cells.
export function neighbourCoords(x, y) {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
}

// Resolve a deploy against a target cell's current garrison. Pure: returns the
// cell's resulting owner/garrison plus a result label and whether the attacker
// won a battle. Inventory consumption and persistence are the caller's job.
//
//   target: { ownerMemberId, unitType, troopCount }
//
// - Neutral (no owner) → claimed at the committed quantity.
// - Enemy → captured iff quantity >= garrison AND the unit type beats it; the
//   surviving garrison is floored at 1. Otherwise repelled and the defender's
//   garrison is reduced by the quantity, also floored at 1.
export function resolveAttack({ attackerMemberId, attackerUnitType, quantity, target }) {
  if (target.ownerMemberId == null) {
    return {
      result: 'claimed',
      ownerMemberId: attackerMemberId,
      unitType: attackerUnitType,
      troopCount: quantity,
      battleWon: false,
    };
  }

  const captured = quantity >= target.troopCount && beats(attackerUnitType, target.unitType);
  if (captured) {
    return {
      result: 'captured',
      ownerMemberId: attackerMemberId,
      unitType: attackerUnitType,
      troopCount: Math.max(1, quantity - target.troopCount),
      battleWon: true,
    };
  }

  return {
    result: 'repelled',
    ownerMemberId: target.ownerMemberId,
    unitType: target.unitType,
    troopCount: Math.max(1, target.troopCount - quantity),
    battleWon: false,
  };
}
