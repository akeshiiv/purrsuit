const DEFAULT_JOIN_CODE = 'W7F6G7';
const UNIT_KEYS = { A: 'a', B: 'b', C: 'c' };
const BEATS = { A: 'B', B: 'C', C: 'A' };

function makeRealm(overrides = {}) {
  return {
    id: 7,
    name: 'Study Squad',
    joinCode: DEFAULT_JOIN_CODE,
    role: overrides.role ?? 'admin',
    mapPreset: overrides.mapPreset ?? 'open_plains',
    maxPlayers: overrides.maxPlayers ?? 4,
    mapSize: 8,
    antiCheatEnabled: overrides.antiCheatEnabled ?? Boolean(overrides.antiCheat),
    ...overrides,
  };
}

function makeSeason(overrides = {}) {
  return {
    id: overrides.id ?? 12,
    status: 'active',
    endsAt: '2026-07-05T00:00:00Z',
    stateVersion: 1,
    winnerName: null,
    ...overrides,
  };
}

function makeMe(overrides = {}) {
  return {
    id: 3,
    userId: 1,
    name: 'Tung Tung',
    colour: '#3b82f6',
    role: overrides.role ?? 'admin',
    coins: 80,
    units: { a: 1, b: 0, c: 0 },
    secondsStudied: 2100,
    battlesWon: 2,
    ...overrides,
  };
}

function makeOtherMembers() {
  return [
    {
      id: 4,
      userId: 2,
      name: 'Mina',
      colour: '#ef4444',
      role: 'member',
      secondsStudied: 3600,
      battlesWon: 1,
    },
    {
      id: 5,
      userId: 3,
      name: 'Jun',
      colour: '#22c55e',
      role: 'member',
      secondsStudied: 1800,
      battlesWon: 0,
    },
  ];
}

function emptyCell(x, y) {
  return {
    x,
    y,
    type: 'regular',
    ownerMemberId: null,
    colour: null,
    unitType: null,
    troopCount: 0,
  };
}

function makeCells(size, me, members) {
  const cells = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      cells.push(emptyCell(x, y));
    }
  }

  const byCoord = (x, y) => cells.find(cell => cell.x === x && cell.y === y);
  Object.assign(byCoord(0, 0), {
    type: 'home',
    ownerMemberId: me.id,
    colour: me.colour,
    unitType: 'A',
    troopCount: 2,
  });
  Object.assign(byCoord(1, 0), {
    ownerMemberId: me.id,
    colour: me.colour,
    unitType: 'A',
    troopCount: 1,
  });
  Object.assign(byCoord(7, 7), {
    type: 'home',
    ownerMemberId: members[0].id,
    colour: members[0].colour,
    unitType: 'C',
    troopCount: 2,
  });
  Object.assign(byCoord(6, 7), {
    ownerMemberId: members[0].id,
    colour: members[0].colour,
    unitType: 'C',
    troopCount: 2,
  });
  Object.assign(byCoord(7, 0), {
    type: 'home',
    ownerMemberId: members[1].id,
    colour: members[1].colour,
    unitType: 'B',
    troopCount: 2,
  });
  Object.assign(byCoord(3, 3), { type: 'obstacle' });
  Object.assign(byCoord(4, 4), { type: 'water' });

  return cells;
}

export const state = {
  profile: {
    id: 1,
    name: 'Tung Tung',
    email: 'triplet@gmail.com',
    avatarUrl: 'https://example.com/photo.jpg',
    colour: '#3b82f6',
  },
  realm: makeRealm(),
  season: makeSeason(),
  me: makeMe(),
  members: makeOtherMembers(),
  seasonAcked: false,
};

state.cells = makeCells(state.realm.mapSize, state.me, state.members);

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function unitKey(unitType) {
  return UNIT_KEYS[unitType];
}

export function totalUnits(units = state.me.units) {
  return Object.values(units).reduce((sum, count) => sum + count, 0);
}

export function actionsFor(member = state.me) {
  const total = totalUnits(member.units);
  const canBuy = member.coins >= 100 && total < 6;
  return {
    canStudy: member.coins < 100,
    canBuy,
    mustBuy: canBuy,
    canDeploy: total >= 1,
  };
}

export function mockError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.payload = { error: code, message };
  return error;
}

export function bumpVersion() {
  state.season.stateVersion += 1;
}

export function realmSummary() {
  if (!state.realm) return null;
  return { ...state.realm, role: state.me.role };
}

export function profilePayload() {
  return clone({ ...state.profile, realm: realmSummary() });
}

export function publicMember(member) {
  return {
    id: member.id,
    userId: member.userId,
    name: member.name,
    colour: member.colour,
    role: member.role,
    secondsStudied: member.secondsStudied,
    battlesWon: member.battlesWon,
  };
}

export function mePayload() {
  return clone({ ...state.me, actions: actionsFor() });
}

export function membersPayload() {
  return clone([state.me, ...state.members].map(publicMember));
}

export function mapMembersPayload() {
  return clone([state.me, ...state.members].map(member => ({
    id: member.id,
    name: member.name,
    colour: member.colour,
  })));
}

export function leaderboardRows() {
  const members = [state.me, ...state.members];
  const rows = members.map(member => {
    const owned = state.cells.filter(cell => cell.ownerMemberId === member.id);
    return {
      userId: member.userId,
      name: member.name,
      colour: member.colour,
      territories: owned.length,
      battlesWon: member.battlesWon,
      secondsStudied: member.secondsStudied,
      cellsA: owned.filter(cell => cell.unitType === 'A').length,
      cellsB: owned.filter(cell => cell.unitType === 'B').length,
      cellsC: owned.filter(cell => cell.unitType === 'C').length,
    };
  });

  return clone(rows.sort((a, b) => b.territories - a.territories));
}

export function currentRealmPayload() {
  if (!state.realm) return { realm: null };

  return clone({
    realm: realmSummary(),
    season: state.season,
    me: { ...state.me, actions: actionsFor() },
    members: [state.me, ...state.members].map(publicMember),
    miniLeaderboard: leaderboardRows().slice(0, 3),
  });
}

export function getCell(x, y) {
  return state.cells.find(cell => cell.x === x && cell.y === y);
}

export function isAdjacentToOwnedCell(target) {
  return state.cells.some(cell => (
    cell.ownerMemberId === state.me.id
    && Math.abs(cell.x - target.x) + Math.abs(cell.y - target.y) === 1
  ));
}

export function resetCell(cell) {
  Object.assign(cell, {
    ownerMemberId: null,
    colour: null,
    unitType: null,
    troopCount: 0,
  });
}

export function resetForRealm(realm, role = 'admin') {
  state.realm = realm;
  state.season = makeSeason({ id: state.season.id + 1 });
  state.me = makeMe({
    role,
    coins: 0,
    units: { a: 0, b: 0, c: 0 },
    colour: state.profile.colour,
    name: state.profile.name,
    secondsStudied: 0,
    battlesWon: 0,
  });
  state.members = makeOtherMembers();
  state.cells = makeCells(state.realm.mapSize, state.me, state.members);
  state.seasonAcked = false;
}

export function createRealm(settings) {
  resetForRealm(makeRealm({
    name: settings.name,
    mapPreset: settings.mapPreset,
    maxPlayers: settings.maxPlayers,
    antiCheatEnabled: Boolean(settings.antiCheat),
  }));
}

export function joinRealm(joinCode) {
  if (joinCode !== DEFAULT_JOIN_CODE) {
    throw mockError('REALM_NOT_FOUND', 'No realm exists for that join code.', 404);
  }

  resetForRealm(makeRealm({ role: 'member' }), 'member');
}

export function unitBeats(attacker, defender) {
  return BEATS[attacker] === defender;
}
