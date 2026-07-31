import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSeasonStatus, toLeaderboardRow } from './rules.js';

test('toLeaderboardRow projects a DB row into the contract LeaderboardRow shape', () => {
  assert.deepEqual(
    toLeaderboardRow({
      user_id: 1,
      name: 'player1',
      colour: '#3b82f6',
      territories: 67,
      battles_won: 12,
      seconds_studied: 126000,
      cells_a: 30,
      cells_b: 20,
      cells_c: 17,
    }),
    {
      userId: 1,
      name: 'player1',
      colour: '#3b82f6',
      territories: 67,
      battlesWon: 12,
      secondsStudied: 126000,
      cellsA: 30,
      cellsB: 20,
      cellsC: 17,
    },
  );
});

test('toLeaderboardRow falls back to the default colour and zero counts', () => {
  assert.deepEqual(
    toLeaderboardRow({ user_id: 2, name: 'player2', colour: null }),
    {
      userId: 2,
      name: 'player2',
      colour: '#3b82f6',
      territories: 0,
      battlesWon: 0,
      secondsStudied: 0,
      cellsA: 0,
      cellsB: 0,
      cellsC: 0,
    },
  );
});

test('decideSeasonStatus reports the active season when there is no ended season', () => {
  assert.deepEqual(
    decideSeasonStatus({
      current: { id: 12, status: 'active', endsAt: '2026-07-05T00:00:00Z', winnerName: null },
      ended: null,
      ackedSeasonId: null,
    }),
    { status: 'active', endsAt: '2026-07-05T00:00:00Z', winnerName: null, needsAck: false, rows: [] },
  );
});

test('decideSeasonStatus surfaces an unacked ended season with needsAck=true', () => {
  assert.deepEqual(
    decideSeasonStatus({
      current: { id: 13, status: 'active', endsAt: '2026-07-12T00:00:00Z', winnerName: null },
      ended: { id: 12, endsAt: '2026-07-05T00:00:00Z', winnerName: 'player1' },
      ackedSeasonId: null,
    }),
    { status: 'ended', endsAt: '2026-07-05T00:00:00Z', winnerName: 'player1', needsAck: true, rows: [] },
  );
});

test('decideSeasonStatus stops surfacing the ended season once it has been acked', () => {
  assert.deepEqual(
    decideSeasonStatus({
      current: { id: 13, status: 'active', endsAt: '2026-07-12T00:00:00Z', winnerName: null },
      ended: { id: 12, endsAt: '2026-07-05T00:00:00Z', winnerName: 'player1' },
      ackedSeasonId: 12,
    }),
    { status: 'active', endsAt: '2026-07-12T00:00:00Z', winnerName: null, needsAck: false, rows: [] },
  );
});

test('decideSeasonStatus needsAck stays true when an older season was acked but a newer one ended', () => {
  assert.deepEqual(
    decideSeasonStatus({
      current: { id: 14, status: 'active', endsAt: '2026-07-19T00:00:00Z', winnerName: null },
      ended: { id: 13, endsAt: '2026-07-12T00:00:00Z', winnerName: 'player2' },
      ackedSeasonId: 12,
    }),
    { status: 'ended', endsAt: '2026-07-12T00:00:00Z', winnerName: 'player2', needsAck: true, rows: [] },
  );
});

// Regression: a rollover wipes territory and resets the member economy before
// any client can poll, so the live leaderboard already describes the NEW season.
// The end screen's standings must come from the ended season's snapshot instead.
test('decideSeasonStatus returns the ended season final standings while needsAck', () => {
  const finalRows = [
    { userId: 1, name: 'player1', colour: '#3b82f6', territories: 40, battlesWon: 12, secondsStudied: 126000, cellsA: 30, cellsB: 10, cellsC: 0 },
    { userId: 2, name: 'player2', colour: '#ef4444', territories: 21, battlesWon: 4, secondsStudied: 60000, cellsA: 0, cellsB: 21, cellsC: 0 },
  ];
  assert.deepEqual(
    decideSeasonStatus({
      current: { id: 13, status: 'active', endsAt: '2026-07-12T00:00:00Z', winnerName: null },
      ended: { id: 12, endsAt: '2026-07-05T00:00:00Z', winnerName: 'player1', rows: finalRows },
      ackedSeasonId: null,
    }),
    { status: 'ended', endsAt: '2026-07-05T00:00:00Z', winnerName: 'player1', needsAck: true, rows: finalRows },
  );
});

test('decideSeasonStatus drops the ended standings once the screen has been acked', () => {
  const result = decideSeasonStatus({
    current: { id: 13, status: 'active', endsAt: '2026-07-12T00:00:00Z', winnerName: null },
    ended: {
      id: 12,
      endsAt: '2026-07-05T00:00:00Z',
      winnerName: 'player1',
      rows: [{ userId: 1, name: 'player1', colour: '#3b82f6', territories: 40, battlesWon: 12, secondsStudied: 126000, cellsA: 30, cellsB: 10, cellsC: 0 }],
    },
    ackedSeasonId: 12,
  });
  assert.equal(result.needsAck, false);
  assert.deepEqual(result.rows, []);
});

test('decideSeasonStatus compares ids numerically (acked id may arrive as a string)', () => {
  const result = decideSeasonStatus({
    current: { id: 13, status: 'active', endsAt: '2026-07-12T00:00:00Z', winnerName: null },
    ended: { id: 12, endsAt: '2026-07-05T00:00:00Z', winnerName: 'player1' },
    ackedSeasonId: '12',
  });
  assert.equal(result.needsAck, false);
  assert.equal(result.status, 'active');
});
