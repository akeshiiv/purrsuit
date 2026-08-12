import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as mockRealm from './realm.js';
import * as mockLeaderboard from './leaderboard.js';
import * as mockMap from './map.js';
import * as mockProfile from './profile.js';
import * as mockStudy from './study.js';
import { state, resetForRealm, getCell } from './state.js';

// Snapshot the seed realm before any test mutates it — `leave()` nulls
// state.realm, and every test must start back inside a realm as admin.
const SEED_REALM = { ...state.realm };

beforeEach(() => {
  resetForRealm({ ...SEED_REALM }, 'admin');
});

test('ending the season rolls over into a fresh active one', async () => {
  const previousSeasonId = state.season.id;

  const payload = await mockRealm.endSeason();
  assert.equal(payload.season.status, 'ended');
  assert.equal(payload.season.id, previousSeasonId);

  // The realm is immediately playing a NEW, active season — the contract says
  // end-season performs a rollover, not just a status flip.
  const current = await mockRealm.getCurrent();
  assert.equal(current.season.status, 'active');
  assert.notEqual(current.season.id, previousSeasonId);
  assert.ok(new Date(current.season.endsAt) > new Date(), 'the new season ends in the future');
});

test('the rollover resets territory, economy and season stats', async () => {
  state.me.units = { a: 2, b: 0, c: 0 };
  await mockMap.attack({ x: 2, y: 0, unitType: 'A', quantity: 1 });
  assert.equal(getCell(2, 0).ownerMemberId, state.me.id, 'held the cell during the season');
  state.me.coins = 500;
  state.me.secondsStudied = 9000;
  state.me.battlesWon = 7;

  await mockRealm.endSeason();

  assert.equal(getCell(2, 0).ownerMemberId, null, 'territory taken last season is released');
  const inventory = await mockRealm.getCurrent();
  assert.equal(inventory.me.coins, 0);
  assert.deepEqual(inventory.me.units, { a: 0, b: 0, c: 0 });
  assert.equal(inventory.me.secondsStudied, 0);
  assert.equal(inventory.me.battlesWon, 0);
});

test('studying is possible again after the season ends', async () => {
  await mockRealm.endSeason();
  // The old mock left status permanently 'ended', which locked the player out of
  // /study/complete forever with NOT_IN_ACTIVE_SEASON.
  const started = await mockStudy.start({ durationMinutes: 25 });
  // Backdate the row rather than sitting through the countdown; eligibility is
  // the server's anti-replay check, not what this test is about.
  state.studySessions.find(s => s.sessionKey === started.sessionKey).eligibleAt = Date.now() - 1000;
  const result = await mockStudy.complete({ sessionKey: started.sessionKey });
  assert.equal(result.coins, 100);
});

test('season-status shows the ended season final standings, then the new season', async () => {
  state.me.secondsStudied = 12345;
  const finalRows = (await mockLeaderboard.get()).rows;

  await mockRealm.endSeason();

  const ended = await mockLeaderboard.seasonStatus();
  assert.equal(ended.status, 'ended');
  assert.equal(ended.needsAck, true);
  assert.ok(ended.winnerName, 'a winner is crowned');
  // Standings must describe the season that ENDED, not the freshly reset board.
  assert.deepEqual(ended.rows, finalRows);

  await mockLeaderboard.seasonAck();
  const after = await mockLeaderboard.seasonStatus();
  assert.equal(after.status, 'active');
  assert.equal(after.needsAck, false);
  assert.deepEqual(after.rows, []);
});

test('the poll version keeps increasing across a rollover', async () => {
  const sinceBefore = state.season.stateVersion;

  await mockRealm.endSeason();

  assert.ok(
    state.season.stateVersion > sinceBefore,
    'a restarted counter can hand a stale client its own cached version back',
  );
  // A client still holding the pre-rollover version must be told the board changed.
  assert.equal((await mockMap.getMap(sinceBefore)).changed, true);
  assert.equal((await mockLeaderboard.get(sinceBefore)).changed, true);
});

test('two rollovers in a row never repeat a poll version', async () => {
  await mockRealm.endSeason();
  const afterFirst = state.season.stateVersion;
  await mockRealm.endSeason();

  assert.ok(state.season.stateVersion > afterFirst);
  assert.equal((await mockMap.getMap(afterFirst)).changed, true);
});

test('profile name and colour survive a season rollover', async () => {
  await mockProfile.update({ name: 'Asher', avatarUrl: 'https://example.com/a.jpg', colour: '#a855f7' });

  await mockRealm.endSeason();

  const profile = await mockProfile.get();
  assert.equal(profile.name, 'Asher');
  assert.equal(profile.colour, '#a855f7');
  assert.equal(profile.avatarUrl, 'https://example.com/a.jpg');

  // …and the new season's board is drawn in the saved colour, not the default.
  const current = await mockRealm.getCurrent();
  assert.equal(current.me.name, 'Asher');
  assert.equal(current.me.colour, '#a855f7');
  const map = await mockMap.getMap(null);
  const myCells = map.cells.filter(cell => cell.ownerMemberId === current.me.id);
  assert.ok(myCells.length > 0, 'the player starts the new season with a home');
  for (const cell of myCells) assert.equal(cell.colour, '#a855f7');
});

// SeasonEndGate renders outside the realm routes now, so it identifies the
// player from GET /api/profile instead of GameContext. That only works if the
// profile's `id` is the same identifier the standings use as `userId`, and its
// `name` is what the winner is reported under.
test('the profile identifies the player within the end-screen standings', async () => {
  await mockProfile.update({ name: 'Asher', colour: '#a855f7' });
  await mockRealm.endSeason();

  const profile = await mockProfile.get();
  const status = await mockLeaderboard.seasonStatus();

  const myRow = status.rows.find(row => row.userId === profile.id);
  assert.ok(myRow, 'the player must be findable in the standings by profile id');
  assert.equal(myRow.name, profile.name);
  // Drives the victory-vs-defeat branch in SeasonEndOverlay.
  assert.equal(status.winnerName, profile.name);
});

// The end-screen gate is mounted app-wide, so it polls season-status from pages
// a realm-less player can reach. The mock must 409 there like the real endpoint,
// or a player who left their realm keeps being shown its end screen.
test('season-status reports NOT_IN_ACTIVE_SEASON when the player is in no realm', async () => {
  await mockRealm.endSeason();
  await mockRealm.leave();

  await assert.rejects(
    () => mockLeaderboard.seasonStatus(),
    err => err.code === 'NOT_IN_ACTIVE_SEASON' && err.status === 409,
  );
});

// Settings prints the realm's own season counter, and the realm list derives
// "day N of M" from the start plus the length — so all three fields have to be
// on the payloads the mock hands those screens.
test('the current payload carries seasonNumber, startedAt and seasonLengthDays', async () => {
  const current = await mockRealm.getCurrent();

  assert.equal(typeof current.season.seasonNumber, 'number');
  assert.ok(current.season.seasonNumber >= 1, 'the per-realm counter is 1-based');
  assert.ok(!Number.isNaN(Date.parse(current.season.startedAt)), 'startedAt is an ISO timestamp');
  assert.ok(new Date(current.season.startedAt) <= new Date(), 'the current season has begun');
  assert.equal(typeof current.realm.seasonLengthDays, 'number');
  assert.ok(current.realm.seasonLengthDays >= 1);
});

// The create form offers 7–366 season days. A mock that ignored the answer
// would make "day N of M" a constant instead of the realm's own length.
test('a created realm runs the season length it was created with', async () => {
  await mockRealm.leave();
  await mockRealm.create({
    name: 'Night Owls', mapPreset: 'crossroads', maxPlayers: 3, seasonLengthDays: 30,
  });

  const current = await mockRealm.getCurrent();
  assert.equal(current.realm.seasonLengthDays, 30);
  assert.equal(current.season.seasonNumber, 1, "a new realm's first season is its season 1");
  const span = Date.parse(current.season.endsAt) - Date.parse(current.season.startedAt);
  assert.equal(Math.round(span / 86_400_000), 30, 'endsAt follows the same length');
});

// The id is a global row id and the number is per-realm: a UI that prints the
// id is only right by accident, so the mock must not let them coincide.
test('a rollover advances both the season id and the realm season number', async () => {
  const before = await mockRealm.getCurrent();
  await mockRealm.endSeason();
  const after = await mockRealm.getCurrent();

  assert.equal(after.season.id, before.season.id + 1);
  assert.equal(after.season.seasonNumber, before.season.seasonNumber + 1);
  // The fresh season starts now, so "day 1 of N" is what the realm list shows.
  assert.ok(Date.now() - Date.parse(after.season.startedAt) < 60_000);
});

test('every leaderboard row carries both streaks, snapshots included', async () => {
  const { rows } = await mockLeaderboard.get();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(typeof row.streakCurrent, 'number');
    assert.equal(typeof row.streakLongest, 'number');
    assert.ok(row.streakLongest >= row.streakCurrent, 'the longest streak cannot be the shorter one');
  }

  // The Ranks award is reduced out of these rows, so the leader on streaks must
  // be able to differ from the leader on territory — otherwise the award card
  // proves nothing about which column it read.
  const topStreak = rows.reduce((best, row) => (row.streakLongest > best.streakLongest ? row : best));
  assert.notEqual(topStreak.userId, rows[0].userId, 'the streak leader is not just the top of the table');

  await mockRealm.endSeason();
  const ended = await mockLeaderboard.seasonStatus();
  for (const row of ended.rows) {
    assert.equal(typeof row.streakLongest, 'number');
  }
});

// Streaks are lifetime, so a season reset that wipes coins and territory must
// leave them standing.
test('streaks survive a season rollover', async () => {
  const before = (await mockLeaderboard.get()).rows;
  await mockRealm.endSeason();
  const after = (await mockLeaderboard.get()).rows;

  for (const row of before) {
    const same = after.find(candidate => candidate.userId === row.userId);
    assert.equal(same.streakLongest, row.streakLongest);
    assert.equal(same.streakCurrent, row.streakCurrent);
  }
});

test('only the admin can end the season', async () => {
  state.me.role = 'member';
  await assert.rejects(() => mockRealm.endSeason(), err => err.code === 'NOT_ADMIN');
});

test('simulateSeasonEnd also rolls the season over', async () => {
  const previousSeasonId = state.season.id;
  await mockLeaderboard.simulateSeasonEnd({ winnerName: 'Mina' });

  const status = await mockLeaderboard.seasonStatus();
  assert.equal(status.status, 'ended');
  assert.equal(status.winnerName, 'Mina');
  assert.ok(status.rows.length > 0);
  assert.notEqual(state.season.id, previousSeasonId);
  assert.equal(state.season.status, 'active');
});
