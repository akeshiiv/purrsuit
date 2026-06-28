// Pure leaderboard/season logic, exported for unit testing without a DB. The
// SQL aggregation (territory counts, ranking) lives in the service; this module
// owns the response shaping and the show-once season-end decision.

const DEFAULT_COLOUR = '#3b82f6';

function toInt(value) {
  return Number(value ?? 0);
}

// Map a standings DB row (snake_case, from the territory aggregation query) into
// the contract's camelCase LeaderboardRow.
export function toLeaderboardRow(row) {
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

// Decide what `GET /api/realm/season-status` reports. A rollover ends a season
// and immediately starts a fresh active one, so the realm's *current* season is
// active again by the time a client polls. The show-once victory/defeat screen
// is driven by the most-recently-ended season the member has not yet acked
// (`realm_members.acked_season_id`): while one exists we surface it with
// needsAck=true; otherwise we report the live active season.
export function decideSeasonStatus({ current, ended, ackedSeasonId }) {
  if (ended && toInt(ackedSeasonId) !== toInt(ended.id)) {
    return {
      status: 'ended',
      endsAt: ended.endsAt,
      winnerName: ended.winnerName ?? null,
      needsAck: true,
    };
  }

  return {
    status: current.status,
    endsAt: current.endsAt,
    winnerName: current.winnerName ?? null,
    needsAck: false,
  };
}
