import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endSeasonNow } from './service.js';
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
            status: 'ended',
            ends_at: new Date('2026-07-08T00:00:00Z'),
            state_version: endedStateVersion + 1,
          }],
        });
      }
      if (/INSERT INTO seasons/i.test(sql)) {
        return Promise.resolve({
          rows: [{ id: 13, status: 'active', ends_at: new Date('2026-07-15T00:00:00Z'), state_version: values[4] }],
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
