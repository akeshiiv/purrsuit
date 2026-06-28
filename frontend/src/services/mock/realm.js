import {
  bumpVersion,
  clone,
  createRealm,
  currentRealmPayload,
  joinRealm,
  leaderboardRows,
  mockError,
  resetCell,
  state,
} from './state.js';

export async function getCurrent() {
  return currentRealmPayload();
}

export async function create(settings) {
  if (state.realm) {
    throw mockError('ALREADY_IN_REALM', 'Leave the current realm before creating another.', 409);
  }

  createRealm(settings);
  return clone({
    realm: state.realm,
    joinCode: state.realm.joinCode,
    season: state.season,
  });
}

export async function join(payload) {
  if (state.realm) {
    throw mockError('ALREADY_IN_REALM', 'Leave the current realm before joining another.', 409);
  }

  const joinCode = typeof payload === 'string' ? payload : payload.joinCode;
  joinRealm(joinCode);
  return clone({ realm: state.realm, season: state.season });
}

export async function leave() {
  state.cells
    .filter(cell => cell.ownerMemberId === state.me.id)
    .forEach(resetCell);
  bumpVersion();
  state.realm = null;
  return { ok: true };
}

export async function kick(id, userId) {
  if (state.me.role !== 'admin') {
    throw mockError('NOT_ADMIN', 'Only admins can kick members.', 403);
  }
  if (userId === state.me.userId) {
    throw mockError('CANNOT_KICK_SELF', 'Admins cannot kick themselves.');
  }

  const member = state.members.find(item => item.userId === userId);
  if (!member) {
    throw mockError('MEMBER_NOT_FOUND', 'That user is not in this realm.', 404);
  }

  state.members = state.members.filter(item => item.userId !== userId);
  state.cells
    .filter(cell => cell.ownerMemberId === member.id)
    .forEach(resetCell);
  bumpVersion();

  return { ok: true };
}

export async function endSeason() {
  if (state.me.role !== 'admin') {
    throw mockError('NOT_ADMIN', 'Only admins can end the season.', 403);
  }

  const [winner] = leaderboardRows();
  state.season.status = 'ended';
  state.season.winnerName = winner?.name ?? null;
  state.seasonAcked = false;
  bumpVersion();

  return clone({ season: state.season });
}

export async function updateSettings(id, settings) {
  if (state.me.role !== 'admin') {
    throw mockError('NOT_ADMIN', 'Only admins can change realm settings.', 403);
  }

  state.realm.antiCheatEnabled = Boolean(settings.antiCheat);
  return clone({ realm: state.realm });
}
