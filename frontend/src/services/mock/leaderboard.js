import { bumpVersion, clone, leaderboardRows, state } from './state.js';

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

export async function seasonStatus() {
  return clone({
    status: state.season.status,
    endsAt: state.season.endsAt,
    winnerName: state.season.winnerName,
    needsAck: state.season.status === 'ended' && !state.seasonAcked,
  });
}

export async function seasonAck() {
  state.seasonAcked = true;
  return { ok: true };
}

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

  state.season.status = 'ended';
  state.season.winnerName = winner?.name ?? targetName;
  state.seasonAcked = false;
  bumpVersion();
  return clone({ season: state.season });
}
