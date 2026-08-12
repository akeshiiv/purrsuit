import { clone, leaderboardRows, mockError, rolloverSeason, state } from './state.js';

export async function get(since) {
  if (Number(since) === state.season.stateVersion) {
    return { version: state.season.stateVersion, changed: false };
  }

  return clone({
    version: state.season.stateVersion,
    changed: true,
    rows: leaderboardRows(),
    season: state.season,
  });
}

// Mirrors the backend's decideSeasonStatus: a rollover restarts play immediately,
// so the realm's current season is active again by the time anyone polls. The
// show-once end screen is driven by the most recently ended season until it is
// acked — and its standings come from the rollover snapshot, because the live
// leaderboard already describes the new (reset) season.
export async function seasonStatus() {
  if (!state.realm) {
    throw mockError('NOT_IN_ACTIVE_SEASON', 'You are not in a realm with an active season.', 409);
  }

  const ended = state.endedSeason;
  if (ended && !state.seasonAcked) {
    return clone({
      status: 'ended',
      endsAt: ended.endsAt,
      winnerName: ended.winnerName,
      needsAck: true,
      rows: ended.rows,
    });
  }

  return clone({
    status: state.season.status,
    endsAt: state.season.endsAt,
    winnerName: state.season.winnerName,
    needsAck: false,
    rows: [],
  });
}

export async function seasonAck() {
  state.seasonAcked = true;
  return { ok: true };
}

// Mock-only dev affordance: force the season to end with a chosen champion so the
// victory/defeat screen can be previewed from the Leaderboard page. Rolls over
// exactly like endSeason, so previewing never leaves the mock stuck between
// seasons.
export async function simulateSeasonEnd({ winnerName } = {}) {
  const standings = leaderboardRows();
  const targetName = winnerName ?? standings[0]?.name ?? null;
  const winner = [state.me, ...state.members].find(member => member.name === targetName);

  // Give the declared champion a genuine territory lead so the standings and the
  // end-of-season screen stay coherent (the real backend's winner always leads).
  if (winner) {
    const topTerritories = standings[0]?.territories ?? 0;
    let owned = state.cells.filter(cell => cell.ownerMemberId === winner.id).length;
    for (const cell of state.cells) {
      if (owned > topTerritories) break;
      if (cell.type === 'regular' && cell.ownerMemberId === null) {
        Object.assign(cell, {
          ownerMemberId: winner.id,
          colour: winner.colour,
          unitType: 'A',
          troopCount: 1,
        });
        owned += 1;
      }
    }
  }

  const ended = rolloverSeason({ winnerName: targetName });

  return clone({
    season: {
      id: ended.id,
      seasonNumber: ended.seasonNumber,
      status: 'ended',
      startedAt: ended.startedAt,
      endsAt: ended.endsAt,
      stateVersion: state.season.stateVersion,
      winnerName: ended.winnerName,
    },
  });
}
