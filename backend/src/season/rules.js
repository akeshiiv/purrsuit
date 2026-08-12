// Pure leaderboard/season logic, exported for unit testing without a DB. The
// SQL aggregation (territory counts, ranking) lives in the service; this module
// owns the response shaping and the show-once season-end decision.

import { computeStreak } from '../study/stats.js';

const DEFAULT_COLOUR = '#3b82f6';

function toInt(value) {
  return Number(value ?? 0);
}

// Map a standings DB row (snake_case, from the territory aggregation query) into
// the contract's camelCase LeaderboardRow.
//
// `streak` is the member's { current, longest } from computeStreak, and is
// absent on paths that cannot derive one — the `season_results` snapshot stores
// standings, not study days, so a season's final table has nothing to count. The
// keys are still emitted (at 0) so a client never has to branch on which path a
// row came from.
export function toLeaderboardRow(row, streak) {
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
    streakCurrent: toInt(streak?.current),
    streakLongest: toInt(streak?.longest),
  };
}

// Fold the flat (user_id, day, today) rows of the leaderboard's study-day query
// into one streak per member, keyed by numeric user id.
//
// Every row carries its own `today` rather than the whole table sharing one,
// because both halves are resolved in that member's stored time zone: a player's
// streak is a run of *their* calendar days, so it is their midnight that ends a
// day, and the same value is what their own Stats page shows them. `today` rides
// along per row for the same reason — computeStreak counts a run that ended
// "yesterday", and yesterday in Tokyo is a different span of hours from
// yesterday in Chicago, so one shared date would misjudge everyone but the
// players who happen to share it.
//
// A member who has never studied contributes no rows at all, so they are simply
// absent from the result; toLeaderboardRow renders that as 0/0. A row missing
// either date is skipped for the same reason: there is no calendar to count it
// against, and 0/0 beats throwing on a poll that runs every few seconds.
export function streaksByUser(dayRows) {
  const byUser = new Map();
  for (const row of dayRows ?? []) {
    if (typeof row?.day !== 'string' || typeof row?.today !== 'string') continue;
    const userId = toInt(row.user_id);
    const entry = byUser.get(userId);
    // `today` is the same for every row of a member (one zone, one query), so
    // the first one seen stands for all of them.
    if (entry) entry.days.push(row.day);
    else byUser.set(userId, { days: [row.day], today: row.today });
  }

  const streaks = new Map();
  for (const [userId, { days, today }] of byUser) {
    streaks.set(userId, computeStreak(days, today));
  }
  return streaks;
}

// Decide what `GET /api/realm/season-status` reports. A rollover ends a season
// and immediately starts a fresh active one, so the realm's *current* season is
// active again by the time a client polls. The show-once victory/defeat screen
// is driven by the most-recently-ended season the member has not yet acked
// (`realm_members.acked_season_id`): while one exists we surface it with
// needsAck=true; otherwise we report the live active season.
//
// `rows` carries the ended season's FINAL standings (from the `season_results`
// snapshot taken during rollover). The live leaderboard cannot supply them: the
// same rollover wipes territory and zeroes the member economy, so by the time a
// client sees needsAck the standings query already describes the new season.
// Empty whenever there is nothing to acknowledge.
export function decideSeasonStatus({ current, ended, ackedSeasonId }) {
  if (ended && toInt(ackedSeasonId) !== toInt(ended.id)) {
    return {
      status: 'ended',
      endsAt: ended.endsAt,
      winnerName: ended.winnerName ?? null,
      needsAck: true,
      rows: ended.rows ?? [],
    };
  }

  return {
    status: current.status,
    endsAt: current.endsAt,
    winnerName: current.winnerName ?? null,
    needsAck: false,
    rows: [],
  };
}
