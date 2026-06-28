import { clone, leaderboardRows, state } from './state.js';

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
