import {
  bumpVersion,
  clone,
  createRealm,
  currentRealmPayload,
  joinRealm,
  mockError,
  resetCell,
  rolloverSeason,
  state,
} from './state.js';

// Restates normalizeRealmSettings from backend/src/realms/rules.js, which is the
// source of truth — backend and frontend are separate packages deployed as
// separate Vercel projects, so the real validator cannot be imported here and
// this has to be kept in step by hand. Without it the mock accepted settings the
// deployed API rejects with 400 INVALID_REALM_SETTINGS, and RealmCreate.jsx is
// exactly the screen you would build against the mock.
const MAP_PRESETS = new Set(['open_plains', 'crossroads', 'archipelago']);

function invalidRealmSettings(input = {}) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const maxPlayers = Number(input.maxPlayers);
  const seasonLengthDays = Number(input.seasonLengthDays);
  const antiCheat = input.antiCheat ?? false;

  return (
    name.length < 1
    || name.length > 64
    || !MAP_PRESETS.has(input.mapPreset)
    || !Number.isInteger(maxPlayers)
    || maxPlayers < 2
    || maxPlayers > 10
    || !Number.isInteger(seasonLengthDays)
    || seasonLengthDays < 7
    || seasonLengthDays > 366
    || typeof antiCheat !== 'boolean'
  );
}

export async function getCurrent() {
  return currentRealmPayload();
}

export async function create(settings) {
  if (state.realm) {
    throw mockError('ALREADY_IN_REALM', 'Leave the current realm before creating another.', 409);
  }
  if (invalidRealmSettings(settings)) {
    throw mockError('INVALID_REALM_SETTINGS', 'One or more realm settings are invalid.', 400);
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

// Crown the leader and roll straight into a fresh season, as the contract
// specifies. The response describes the season that just ENDED; the realm is
// already playing the new one by the time this returns.
export async function endSeason() {
  if (state.me.role !== 'admin') {
    throw mockError('NOT_ADMIN', 'Only admins can end the season.', 403);
  }

  const ended = rolloverSeason();

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

export async function updateSettings(id, settings) {
  if (state.me.role !== 'admin') {
    throw mockError('NOT_ADMIN', 'Only admins can change realm settings.', 403);
  }
  // Strict, exactly as the real endpoint is: anti-cheat is a security control, so
  // Boolean() coercion read the string 'false' as ON and — worse — read a request
  // that simply omitted the field as a deliberate OFF.
  if (typeof settings?.antiCheat !== 'boolean') {
    throw mockError('INVALID_REALM_SETTINGS', 'antiCheat must be true or false.', 400);
  }

  state.realm.antiCheatEnabled = settings.antiCheat;
  return clone({ realm: state.realm });
}
