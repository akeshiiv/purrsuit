const DEFAULT_JOIN_CODE = 'W7F6G7';
const UNIT_KEYS = { A: 'a', B: 'b', C: 'c' };
const BEATS = { A: 'B', B: 'C', C: 'A' };

const MOCK_QUESTS = {
  buy_three_units: { title: 'Restock', description: 'Buy any 3 cat units today', kind: 'count', target: 3, event: 'shop.buy' },
  five_sessions_today: { title: 'Grind Set', description: 'Log 5 study sessions today', kind: 'count', target: 5, event: 'study.complete' },
};
const DEFAULT_MOCK_QUEST = 'buy_three_units';

function makeQuest(key = DEFAULT_MOCK_QUEST) {
  return { key, current: 0, completed: false };
}

const SEASON_LENGTH_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// The seeded season is deliberately mid-flight, so the realm list has something
// to render "day 4 of 7" from instead of a season that always began this second.
const SEED_DAYS_ELAPSED = 3;

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
    seasonLengthDays: SEASON_LENGTH_DAYS,
    ...overrides,
  };
}

// `id` is the global row id and `seasonNumber` the per-realm 1-based counter —
// the seed keeps them apart on purpose, because a UI that prints the id passes
// only while a single realm exists. `elapsedDays` backdates `startedAt` for a
// season already under way, and `lengthDays` is the realm's own season length,
// so `endsAt` and the realm list's "day N of M" always describe the same season.
function makeSeason({ elapsedDays = 0, lengthDays = SEASON_LENGTH_DAYS, ...overrides } = {}) {
  const startedAt = Date.now() - elapsedDays * DAY_MS;
  return {
    id: 42,
    seasonNumber: 12,
    status: 'active',
    startedAt: new Date(startedAt).toISOString(),
    endsAt: new Date(startedAt + lengthDays * DAY_MS).toISOString(),
    stateVersion: 1,
    winnerName: null,
    ...overrides,
  };
}

// Streaks are lifetime, not per-season, so they are seeded once and survive
// every rollover — the same reason the real streak outlives a season reset.
// Jun holds the longest one while leading on nothing else, so the Ranks award
// card has to read the streak column rather than fall out of the ordering.
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
    streakCurrent: 4,
    streakLongest: 9,
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
      streakCurrent: 2,
      streakLongest: 6,
    },
    {
      id: 5,
      userId: 3,
      name: 'Jun',
      colour: '#22c55e',
      role: 'member',
      secondsStudied: 1800,
      battlesWon: 0,
      streakCurrent: 5,
      streakLongest: 11,
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
    // Seeded to a zone that is neither UTC nor any plausible dev machine, so the
    // client's start-up time-zone sync actually has a difference to find and
    // PATCH in mock mode. A real profile is null here until that first sync.
    timeZone: 'America/Los_Angeles',
  },
  realm: makeRealm(),
  season: makeSeason({ elapsedDays: SEED_DAYS_ELAPSED }),
  me: makeMe(),
  members: makeOtherMembers(),
  // The most recently ended season, with the standings snapshotted at rollover.
  // Drives the show-once end screen; null until a season has ended.
  endedSeason: null,
  seasonAcked: false,
  dailyQuest: makeQuest(),
  // Server-issued study sessions, mirroring the `study_sessions` table: the
  // client can only claim coins for a key that was handed out by `start`.
  studySessions: [],
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
      // Per-row streaks, so an award can be reduced out of the standings
      // without a second request. The real endpoint counts each row in that
      // member's own stored zone, not the viewer's — a row means the same
      // thing to everyone reading it, and agrees with what that member sees
      // on their own Stats page.
      streakCurrent: member.streakCurrent,
      streakLongest: member.streakLongest,
    };
  });

  return clone(rows.sort((a, b) => b.territories - a.territories));
}

// The dashboard's mini-leaderboard is a narrower projection than the standings
// endpoint: the real `miniLeaderboardRows` query skips the per-member streak
// aggregation, because Home polls this payload every 4s. Mirror the omission
// here — mock and real returning the same shape is what the service layer rests
// on, and only /api/season/leaderboard carries streaks.
const MINI_LEADERBOARD_FIELDS = [
  'userId', 'name', 'colour', 'territories', 'battlesWon', 'secondsStudied',
  'cellsA', 'cellsB', 'cellsC',
];

function miniLeaderboardRows() {
  return leaderboardRows()
    .slice(0, 3)
    .map(row => Object.fromEntries(MINI_LEADERBOARD_FIELDS.map(field => [field, row[field]])));
}

export function currentRealmPayload() {
  if (!state.realm) return { realm: null };

  return clone({
    realm: realmSummary(),
    season: state.season,
    me: { ...state.me, actions: actionsFor() },
    members: [state.me, ...state.members].map(publicMember),
    miniLeaderboard: miniLeaderboardRows(),
    dailyQuest: dailyQuestPayload(),
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
  state.season = makeSeason({
    id: state.season.id + 1,
    // A realm's own counter starts at 1 however high the global id has climbed.
    seasonNumber: 1,
    lengthDays: realm.seasonLengthDays,
    stateVersion: state.season.stateVersion + 1,
  });
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
  state.endedSeason = null;
  state.seasonAcked = false;
  state.dailyQuest = makeQuest();
  state.studySessions = [];
}

// Mirror the backend's season rollover (realms/service.js rollCurrentSeason):
// crown whoever leads on territory, snapshot the final standings, then start a
// fresh ACTIVE season with territory, inventory and season stats reset. Anything
// the backend stores on `users` rather than `realm_members` — the saved display
// name and territory colour — is deliberately carried across; only per-season
// state is cleared.
export function rolloverSeason({ winnerName: declaredName } = {}) {
  const standings = leaderboardRows();
  const winner = (declaredName && standings.find(row => row.name === declaredName)) || standings[0] || null;

  state.endedSeason = {
    id: state.season.id,
    seasonNumber: state.season.seasonNumber,
    startedAt: state.season.startedAt,
    endsAt: state.season.endsAt,
    winnerName: winner?.name ?? declaredName ?? null,
    rows: standings,
  };

  state.season = makeSeason({
    id: state.season.id + 1,
    seasonNumber: state.season.seasonNumber + 1,
    lengthDays: state.realm.seasonLengthDays,
    // Keep the poll counter climbing across the boundary. Clients cache the last
    // version they saw and the poll endpoints short-circuit on an exact match, so
    // a counter that restarts can hand a stale client its own number back and
    // freeze it on the season that just ended.
    stateVersion: state.season.stateVersion + 1,
  });
  state.me = makeMe({
    role: state.me.role,
    coins: 0,
    units: { a: 0, b: 0, c: 0 },
    colour: state.profile.colour,
    name: state.profile.name,
    secondsStudied: 0,
    battlesWon: 0,
  });
  state.members = makeOtherMembers().map(member => ({
    ...member,
    secondsStudied: 0,
    battlesWon: 0,
  }));
  state.cells = makeCells(state.realm.mapSize, state.me, state.members);
  state.seasonAcked = false;
  state.dailyQuest = makeQuest();

  return clone(state.endedSeason);
}

export function createRealm(settings) {
  resetForRealm(makeRealm({
    name: settings.name,
    mapPreset: settings.mapPreset,
    maxPlayers: settings.maxPlayers,
    // The create form already asks for a season length (7–366); honouring it
    // here is what lets the realm list say "day 1 of 30" for a realm that
    // really is running a 30-day season.
    seasonLengthDays: Number(settings.seasonLengthDays) || SEASON_LENGTH_DAYS,
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

// Serialise the mock's daily quest to the DailyQuest payload, or null when done.
export function dailyQuestPayload() {
  const quest = state.dailyQuest;
  if (!quest || quest.completed) return null;
  const def = MOCK_QUESTS[quest.key];
  return {
    key: quest.key,
    title: def.title,
    description: def.description,
    reward: 100,
    progress: { current: quest.current, target: def.target },
    questDate: '2026-07-14',
  };
}

// Advance the mock quest for an event; returns questCompleted + coinsAwarded,
// mirroring the backend contract. Only the current quest's event advances it.
export function advanceMockQuest(event) {
  const quest = state.dailyQuest;
  if (!quest || quest.completed) return { questCompleted: null, coinsAwarded: 0 };
  const def = MOCK_QUESTS[quest.key];
  if (def.event !== event) return { questCompleted: null, coinsAwarded: 0 };
  quest.current += 1;
  if (quest.current < def.target) return { questCompleted: null, coinsAwarded: 0 };
  quest.completed = true;
  state.me.coins += 100;
  bumpVersion();
  return { questCompleted: { key: quest.key, title: def.title, reward: 100 }, coinsAwarded: 100 };
}
