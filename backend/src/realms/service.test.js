import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RealmError, endSeasonNow, joinRealm, updateRealmSettings } from './service.js';
import { _setTransactionPool } from '../../db.js';

// Drive endSeasonNow (and therefore rollCurrentSeason) against a scripted fake
// client so the rollover's SQL can be asserted without a live database. Returns
// every statement issued, in order.
function runRollover({ endedStateVersion, seasonNumber = 4 }) {
  const queries = [];
  const fakeClient = {
    query(text, values) {
      const sql = String(text).replace(/\s+/g, ' ').trim();
      queries.push({ sql, values });

      if (/SELECT rm\.id, rm\.role FROM realm_members/i.test(sql)) {
        return Promise.resolve({ rows: [{ id: 5, role: 'admin' }] });
      }
      if (/FROM realms r JOIN seasons s/i.test(sql) && /FOR UPDATE OF r, s/i.test(sql)) {
        return Promise.resolve({
          rows: [{
            realm_id: 7,
            join_code: 'W7F6G7',
            realm_name: 'Study Squad',
            admin_user_id: 1,
            map_preset: 'open_plains',
            max_players: 4,
            map_size: 8,
            season_length_days: 7,
            anticheat_enabled: false,
            current_season_id: 12,
            season_id: 12,
            season_number: seasonNumber,
            season_status: 'active',
            started_at: new Date('2026-07-01T00:00:00Z'),
            ends_at: new Date('2026-07-08T00:00:00Z'),
            ended_at: null,
            winner_member_id: null,
            state_version: endedStateVersion,
          }],
        });
      }
      if (/COUNT\(c\.id\)::int AS territories/i.test(sql) && /LIMIT 1/i.test(sql)) {
        return Promise.resolve({ rows: [{ member_id: 5, winner_name: 'player1', territories: 12 }] });
      }
      if (/UPDATE seasons SET status = 'ended'/i.test(sql)) {
        // The rollover bumps the ending season's version as it closes it.
        return Promise.resolve({
          rows: [{
            id: 12,
            season_number: seasonNumber,
            status: 'ended',
            started_at: new Date('2026-07-01T00:00:00Z'),
            ends_at: new Date('2026-07-08T00:00:00Z'),
            state_version: endedStateVersion + 1,
          }],
        });
      }
      if (/INSERT INTO seasons/i.test(sql)) {
        return Promise.resolve({
          rows: [{
            id: 13,
            season_number: seasonNumber + 1,
            status: 'active',
            started_at: new Date('2026-07-08T00:00:00Z'),
            ends_at: new Date('2026-07-15T00:00:00Z'),
            state_version: values[4],
          }],
        });
      }
      if (/FROM realm_members rm JOIN users u/i.test(sql) && /rm\.coins::int/i.test(sql)) {
        return Promise.resolve({
          rows: [
            { id: 5, realm_id: 7, user_id: 1, name: 'player1', colour: '#3b82f6', role: 'admin', coins: 120, units_a: 1, units_b: 0, units_c: 0, seconds_studied: 9000, battles_won: 3, home_x: 0, home_y: 0, joined_at: new Date('2026-06-01T00:00:00Z') },
            { id: 6, realm_id: 7, user_id: 2, name: 'player2', colour: '#ef4444', role: 'member', coins: 40, units_a: 0, units_b: 2, units_c: 0, seconds_studied: 3600, battles_won: 1, home_x: 7, home_y: 7, joined_at: new Date('2026-06-02T00:00:00Z') },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    },
    release() {},
  };

  _setTransactionPool({ connect: () => Promise.resolve(fakeClient) });
  return endSeasonNow(1, 7).then((result) => ({ result, queries }));
}

// Resolve the state_version the new season is created with, whether it is written
// as a bound parameter or inlined in the statement.
function startingVersion(insert) {
  const values = insert.sql.match(/VALUES \(([^)]*)\)/i)[1].split(',').map((part) => part.trim());
  const last = values[values.length - 1];
  const placeholder = last.match(/^\$(\d+)$/);
  return Number(placeholder ? insert.values[Number(placeholder[1]) - 1] : last);
}

// Regression: the new season used to be inserted with state_version = 1, which
// restarts the poll counter every rollover. Map/leaderboard pollers short-circuit
// on `since === stateVersion`, so a client holding version 1 (the value it just
// read from the previous rollover) is told "unchanged" and keeps rendering the
// PREVIOUS season's board — ending the season twice in a row froze the UI.
test('rollover continues the realm state_version instead of restarting it', async () => {
  const { queries } = await runRollover({ endedStateVersion: 1 });

  const insert = queries.find((q) => /INSERT INTO seasons/i.test(q.sql));
  assert.ok(insert, 'the rollover inserts the next season');

  const newVersion = startingVersion(insert);
  assert.ok(
    newVersion > 2,
    `new season state_version (${newVersion}) must exceed the ended season's bumped version (2)`,
  );
});

test('rollover keeps the version strictly increasing from a high starting point', async () => {
  const { queries } = await runRollover({ endedStateVersion: 134 });

  const insert = queries.find((q) => /INSERT INTO seasons/i.test(q.sql));
  assert.ok(startingVersion(insert) > 135, 'new season resumes above the ended season');
});

test('rollover snapshots final standings before deleting the ended cells', async () => {
  const { queries } = await runRollover({ endedStateVersion: 10 });

  const snapshotIndex = queries.findIndex((q) => /INSERT INTO season_results/i.test(q.sql));
  const deleteIndex = queries.findIndex((q) => /DELETE FROM cells/i.test(q.sql));
  assert.ok(snapshotIndex >= 0, 'writes a season_results snapshot');
  assert.ok(deleteIndex >= 0, 'clears the ended season cells');
  assert.ok(snapshotIndex < deleteIndex, 'snapshot must be taken before the cells are deleted');
});

test('endSeasonNow reports the ended season and its winner', async () => {
  const { result } = await runRollover({ endedStateVersion: 10 });
  assert.equal(result.season.status, 'ended');
  assert.equal(result.season.winnerName, 'player1');
});

// A Season payload has to carry the realm's own season counter and start time.
// The counter is what "season 5" on screen means; the row id is global and turns
// into a nonsense label the moment a second realm exists.
test('endSeasonNow reports the per-realm season number and start time', async () => {
  const { result } = await runRollover({ endedStateVersion: 10, seasonNumber: 4 });
  assert.equal(result.season.seasonNumber, 4);
  assert.equal(result.season.startedAt, '2026-07-01T00:00:00.000Z');
});

// The likely failure mode for those two fields is a statement that never asks
// for them: seasonPayload then reads undefined and the season silently loses its
// number. Every season row the rollover writes back feeds a payload, so every
// RETURNING has to name both columns.
test('every season row the rollover writes back returns season_number and started_at', async () => {
  const { queries } = await runRollover({ endedStateVersion: 10 });

  const seasonWrites = queries.filter(
    (q) => /(UPDATE seasons|INSERT INTO seasons)/i.test(q.sql) && /RETURNING/i.test(q.sql),
  );
  assert.ok(seasonWrites.length >= 2, 'the rollover both ends a season and starts one');
  for (const write of seasonWrites) {
    const returning = write.sql.match(/RETURNING (.+)$/i)[1];
    assert.match(returning, /\bseason_number\b/, write.sql);
    assert.match(returning, /\bstarted_at\b/, write.sql);
  }
});

const PAST = new Date('2026-07-08T00:00:00Z');
const FUTURE = new Date('2099-01-01T00:00:00Z');
const STARTED = new Date('2026-07-01T00:00:00Z');

const REALM_COLUMNS = {
  join_code: 'W7F6G7',
  admin_user_id: 1,
  map_preset: 'open_plains',
  max_players: 4,
  map_size: 8,
  season_length_days: 7,
  anticheat_enabled: false,
};

// The shape `SELECT r.* ... WHERE r.join_code = $1` returns: the realm's own
// columns, so the realm key is `id`.
function joinCodeRow({ endsAt, seasonStatus }) {
  return {
    ...REALM_COLUMNS,
    id: 7,
    name: 'Study Squad',
    current_season_id: 12,
    season_id: 12,
    season_number: 4,
    season_status: seasonStatus,
    ends_at: endsAt,
    state_version: 10,
  };
}

// The shape currentRealmSeasonRow returns: realm columns are aliased realm_id /
// realm_name, which is exactly the mismatch joinRealm has to bridge after a roll.
function seasonRow({ seasonId, seasonNumber, seasonStatus, endsAt, stateVersion }) {
  return {
    ...REALM_COLUMNS,
    realm_id: 7,
    realm_name: 'Study Squad',
    current_season_id: seasonId,
    season_id: seasonId,
    season_number: seasonNumber,
    season_status: seasonStatus,
    started_at: new Date('2026-07-01T00:00:00Z'),
    ends_at: endsAt,
    ended_at: null,
    winner_member_id: null,
    state_version: stateVersion,
    winner_name: null,
  };
}

// Drive joinRealm against a scripted client. `endsAt`/`seasonStatus` describe the
// season the join code resolves to; `rollTakes: false` simulates another
// transaction having already closed that season, so rollCurrentSeason finds
// nothing to end and the realm is still parked on the expired one afterwards.
function runJoin({ endsAt, seasonStatus = 'active', rollTakes = true }) {
  const queries = [];
  let seasonReads = 0;

  const fakeClient = {
    query(text, values) {
      const sql = String(text).replace(/\s+/g, ' ').trim();
      queries.push({ sql, values });

      if (/SELECT id FROM realm_members WHERE user_id/i.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/WHERE r\.join_code = \$1/i.test(sql)) {
        return Promise.resolve({ rows: [joinCodeRow({ endsAt, seasonStatus })] });
      }
      if (/WHERE r\.id = \$1/i.test(sql) && /FOR UPDATE OF r, s/i.test(sql)) {
        seasonReads += 1;
        // First read is the season the roll is about to close; the second is
        // whatever the realm points at once the roll has (or has not) run.
        const stale = seasonRow({
          seasonId: 12, seasonNumber: 4, seasonStatus: 'active', endsAt, stateVersion: 10,
        });
        if (seasonReads === 1 || !rollTakes) return Promise.resolve({ rows: [stale] });
        return Promise.resolve({
          rows: [seasonRow({
            seasonId: 13, seasonNumber: 5, seasonStatus: 'active', endsAt: FUTURE, stateVersion: 12,
          })],
        });
      }
      if (/COUNT\(c\.id\)::int AS territories/i.test(sql) && /LIMIT 1/i.test(sql)) {
        return Promise.resolve({ rows: [{ member_id: 5, winner_name: 'player1', territories: 12 }] });
      }
      if (/UPDATE seasons SET status = 'ended'/i.test(sql)) {
        if (!rollTakes) return Promise.resolve({ rows: [] });
        return Promise.resolve({
          rows: [{
            id: 12, season_number: 4, status: 'ended', started_at: STARTED, ends_at: endsAt, state_version: 11,
          }],
        });
      }
      if (/INSERT INTO seasons/i.test(sql)) {
        return Promise.resolve({
          rows: [{
            id: 13, season_number: 5, status: 'active', started_at: STARTED, ends_at: FUTURE, state_version: 12,
          }],
        });
      }
      if (/FROM realm_members rm JOIN users u/i.test(sql) && /rm\.coins::int/i.test(sql)) {
        return Promise.resolve({
          rows: [
            { id: 5, realm_id: 7, user_id: 1, name: 'player1', colour: '#3b82f6', role: 'admin', coins: 120, units_a: 1, units_b: 0, units_c: 0, seconds_studied: 9000, battles_won: 3, home_x: 0, home_y: 0, joined_at: new Date('2026-06-01T00:00:00Z') },
            { id: 6, realm_id: 7, user_id: 2, name: 'player2', colour: '#ef4444', role: 'member', coins: 40, units_a: 0, units_b: 2, units_c: 0, seconds_studied: 3600, battles_won: 1, home_x: 7, home_y: 7, joined_at: new Date('2026-06-02T00:00:00Z') },
          ],
        });
      }
      if (/SELECT COUNT\(\*\)::int AS count FROM realm_members/i.test(sql)) {
        return Promise.resolve({ rows: [{ count: 2 }] });
      }
      if (/SELECT home_x, home_y FROM realm_members/i.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/INSERT INTO realm_members/i.test(sql)) {
        return Promise.resolve({ rows: [{ id: 9 }] });
      }
      if (/UPDATE seasons SET state_version = state_version \+ 1/i.test(sql)) {
        return Promise.resolve({
          rows: [{
            id: 13, season_number: 5, status: 'active', started_at: STARTED, ends_at: FUTURE, state_version: 13,
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    },
    release() {},
  };

  _setTransactionPool({ connect: () => Promise.resolve(fakeClient) });
  return joinRealm(3, { joinCode: 'w7f6g7' }).then(
    (result) => ({ result, queries, error: null }),
    (error) => ({ result: null, queries, error }),
  );
}

// Regression: nothing runs on a timer, so a season sits at status='active' well
// past its ends_at until some request rolls it. The join path only ever checked
// the status, so a player could be dropped onto a board that the very next
// dashboard poll would wipe and regenerate.
test('joining a season past its ends_at rolls it over instead of joining the dead one', async () => {
  const { result, queries, error } = await runJoin({ endsAt: PAST });

  assert.equal(error, null);
  assert.ok(
    queries.some((q) => /UPDATE seasons SET status = 'ended'/i.test(q.sql)),
    'the expired season is closed out',
  );
  assert.equal(result.season.id, 13, 'the player joins the season that replaced it');
});

test('the new member is placed on the fresh season, never the expired one', async () => {
  const { queries } = await runJoin({ endsAt: PAST });

  const home = queries.find((q) => /UPDATE cells SET type = 'home'/i.test(q.sql));
  assert.ok(home, 'the joiner is given a home cell');
  // assignHomeCell binds [memberId, seasonId, x, y].
  assert.equal(home.values[1], 13, 'home cell must belong to the new season');
});

// The under-lock check has to be the authority: if the roll declines because
// another transaction got to the season first, the join must not proceed onto it.
test('rejects the join when the expired season could not be rolled', async () => {
  const { queries, error } = await runJoin({ endsAt: PAST, rollTakes: false });

  assert.ok(error instanceof RealmError);
  assert.equal(error.status, 409);
  assert.equal(error.code, 'SEASON_ENDED');
  assert.ok(
    queries.some((q) => /UPDATE seasons SET status = 'ended'/i.test(q.sql)),
    'the roll was attempted, and declined',
  );
  assert.ok(
    !queries.some((q) => /DELETE FROM cells/i.test(q.sql)),
    'a declined roll leaves the board alone',
  );
  assert.ok(
    !queries.some((q) => /INSERT INTO realm_members/i.test(q.sql)),
    'no membership is written onto a season that is over',
  );
});

test('a season still inside its window is joined without any rollover', async () => {
  const { result, queries, error } = await runJoin({ endsAt: FUTURE });

  assert.equal(error, null);
  assert.equal(result.realm.id, 7);
  assert.equal(result.realm.role, 'member');
  assert.ok(
    !queries.some((q) => /UPDATE seasons SET status = 'ended'/i.test(q.sql)),
    'a live season must not be disturbed by a join',
  );
});

test('joining reports the season number and start time, not just the row id', async () => {
  const { result, error } = await runJoin({ endsAt: FUTURE });

  assert.equal(error, null);
  assert.equal(result.season.seasonNumber, 5);
  assert.equal(result.season.startedAt, STARTED.toISOString());
});

// Season.startedAt alone cannot say "day 4 of 7" — the length of the season has
// to come back with the realm.
test('the realm summary carries the season length', async () => {
  const { result } = await runJoin({ endsAt: FUTURE });
  assert.equal(result.realm.seasonLengthDays, 7);
});

test('a realm parked between seasons is still refused', async () => {
  const { error } = await runJoin({ endsAt: FUTURE, seasonStatus: 'ended' });
  assert.equal(error.code, 'SEASON_ENDED');
});

// Drive updateRealmSettings against a scripted client. `role` of null makes the
// caller a non-member so the admin guard fires.
function runSettings(input, { role = 'admin' } = {}) {
  const queries = [];
  const fakeClient = {
    query(text, values) {
      const sql = String(text).replace(/\s+/g, ' ').trim();
      queries.push({ sql, values });

      if (/SELECT rm\.id, rm\.role FROM realm_members/i.test(sql)) {
        return Promise.resolve({ rows: role ? [{ id: 5, role }] : [] });
      }
      if (/UPDATE realms SET anticheat_enabled/i.test(sql)) {
        return Promise.resolve({
          rows: [{ ...REALM_COLUMNS, id: 7, name: 'Study Squad', anticheat_enabled: values[0] }],
        });
      }
      return Promise.resolve({ rows: [] });
    },
    release() {},
  };

  _setTransactionPool({ connect: () => Promise.resolve(fakeClient) });
  return updateRealmSettings(1, 7, input).then(
    (result) => ({ result, queries, error: null }),
    (error) => ({ result: null, queries, error }),
  );
}

// Regression: the flag used to go through Boolean(), so an omitted field read as
// a deliberate "off" and disarmed anti-cheat for the whole realm.
test('a settings PATCH with no antiCheat field cannot silently disable anti-cheat', async () => {
  const { queries, error } = await runSettings({});

  assert.ok(error instanceof RealmError);
  assert.equal(error.status, 400);
  assert.equal(error.code, 'INVALID_REALM_SETTINGS');
  assert.ok(
    !queries.some((q) => /UPDATE realms/i.test(q.sql)),
    'nothing is written when the flag was never stated',
  );
});

// Boolean('false') is true, so the string form used to turn anti-cheat ON.
test('a non-boolean antiCheat is rejected rather than coerced', async () => {
  for (const value of ['false', 'true', 0, 1, null, [], {}]) {
    const { error } = await runSettings({ antiCheat: value });
    assert.equal(error?.code, 'INVALID_REALM_SETTINGS', `should reject ${JSON.stringify(value)}`);
  }
});

test('real booleans are stored as given', async () => {
  for (const value of [true, false]) {
    const { result, queries, error } = await runSettings({ antiCheat: value });
    assert.equal(error, null);
    const update = queries.find((q) => /UPDATE realms SET anticheat_enabled/i.test(q.sql));
    assert.equal(update.values[0], value);
    assert.equal(result.realm.antiCheatEnabled, value);
  }
});

test('a non-admin is still refused before the flag is even inspected', async () => {
  const { error } = await runSettings({ antiCheat: 'nonsense' }, { role: null });
  assert.equal(error.status, 403);
  assert.equal(error.code, 'NOT_ADMIN');
});
