import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSeasonStatus, streaksByUser, toLeaderboardRow } from './rules.js';

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
    }, { current: 4, longest: 11 }),
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
      streakCurrent: 4,
      streakLongest: 11,
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
      streakCurrent: 0,
      streakLongest: 0,
    },
  );
});

// The season_results snapshot path has no study days to count, and a client
// should not have to ask which path a row came from — the keys are always there.
test('toLeaderboardRow emits zero streaks rather than omitting the keys', () => {
  const row = toLeaderboardRow({ user_id: 3, name: 'player3' });
  assert.equal(row.streakCurrent, 0);
  assert.equal(row.streakLongest, 0);
});

test('streaksByUser derives one streak per member from the flat day rows', () => {
  const streaks = streaksByUser([
    { user_id: 1, day: '2026-08-10', today: '2026-08-12' },
    { user_id: 1, day: '2026-08-11', today: '2026-08-12' },
    { user_id: 1, day: '2026-08-12', today: '2026-08-12' },
    { user_id: 2, day: '2026-08-01', today: '2026-08-12' },
    { user_id: 2, day: '2026-08-02', today: '2026-08-12' },
    { user_id: 2, day: '2026-08-03', today: '2026-08-12' },
    { user_id: 2, day: '2026-08-04', today: '2026-08-12' },
  ]);

  assert.deepEqual(streaks.get(1), { current: 3, longest: 3 });
  // player2 stopped studying a week ago: the run still counts as their longest,
  // but it is no longer current.
  assert.deepEqual(streaks.get(2), { current: 0, longest: 4 });
});

// The whole point of resolving days per member: the SQL hands back both halves
// already converted, so two players who studied at the very same instants — but
// live under different midnights — can honestly hold different streaks.
//
// Both studied at 13:00 UTC on Aug 8, 9 and 10, and it is 02:00 UTC on Aug 12.
// The local dates of those three sessions happen to agree, so the ONLY thing
// separating these two members is whose "today" it is: Tokyo has already reached
// the 12th, putting the run two days back and out of grace, while Chicago is
// still on the 11th, so the same run ended yesterday and still counts.
test('streaksByUser counts each member against their own today', () => {
  const streaks = streaksByUser([
    // user 1: Asia/Tokyo (UTC+9) — local today is 2026-08-12.
    { user_id: 1, day: '2026-08-08', today: '2026-08-12' },
    { user_id: 1, day: '2026-08-09', today: '2026-08-12' },
    { user_id: 1, day: '2026-08-10', today: '2026-08-12' },
    // user 2: America/Chicago (UTC-5) — same instants, local today is still the 11th.
    { user_id: 2, day: '2026-08-08', today: '2026-08-11' },
    { user_id: 2, day: '2026-08-09', today: '2026-08-11' },
    { user_id: 2, day: '2026-08-10', today: '2026-08-11' },
  ]);

  assert.deepEqual(streaks.get(1), { current: 0, longest: 3 });
  assert.deepEqual(streaks.get(2), { current: 3, longest: 3 });
  // Under the old single-`today` fold both members were judged against the UTC
  // date (the 12th) and both read 0 — the Chicago player was silently robbed of
  // a live streak they can see on their own Stats page.
  assert.notDeepEqual(streaks.get(1), streaks.get(2));
});

// The other half: identical instants can land on different *days*, because a
// session at 16:00 UTC on the 9th is still the 9th in Chicago but already the
// 10th in Tokyo. Here both members share a today (2026-08-10) and differ only in
// how their sessions bucket — Tokyo gets three consecutive days, Chicago's last
// two collapse into one and leave a two-day run.
test("streaksByUser reflects the day boundaries of each member's own zone", () => {
  const streaks = streaksByUser([
    // Sessions at 14:00 Aug 8, 14:00 Aug 9 and 16:00 Aug 9, all UTC.
    // user 1: Asia/Tokyo — 2026-08-08, 2026-08-09, 2026-08-10.
    { user_id: 1, day: '2026-08-08', today: '2026-08-10' },
    { user_id: 1, day: '2026-08-09', today: '2026-08-10' },
    { user_id: 1, day: '2026-08-10', today: '2026-08-10' },
    // user 2: America/Chicago — 2026-08-08, 2026-08-09, 2026-08-09.
    { user_id: 2, day: '2026-08-08', today: '2026-08-10' },
    { user_id: 2, day: '2026-08-09', today: '2026-08-10' },
    { user_id: 2, day: '2026-08-09', today: '2026-08-10' },
  ]);

  assert.deepEqual(streaks.get(1), { current: 3, longest: 3 });
  assert.deepEqual(streaks.get(2), { current: 2, longest: 2 });
  // Bucketed in UTC both members would have read 2/2, because the 16:00 session
  // never crosses into the 10th without the +09:00 offset.
  assert.notDeepEqual(streaks.get(1), streaks.get(2));
});

test('streaksByUser leaves a member who has never studied out, so their row reads 0/0', () => {
  const streaks = streaksByUser([{ user_id: 1, day: '2026-08-12', today: '2026-08-12' }]);

  assert.equal(streaks.get(2), undefined);
  const row = toLeaderboardRow({ user_id: 2, name: 'player2' }, streaks.get(2));
  assert.equal(row.streakCurrent, 0);
  assert.equal(row.streakLongest, 0);
});

// The driver can hand back a bigint id as a string; the rows are keyed by the
// same toInt() the row projection uses, so a lookup must not miss because of it.
test('streaksByUser keys members numerically whatever the driver returns', () => {
  const streaks = streaksByUser([{ user_id: '7', day: '2026-08-12', today: '2026-08-12' }]);
  assert.deepEqual(streaks.get(7), { current: 1, longest: 1 });
});

test('streaksByUser tolerates a member studying twice on the same day', () => {
  const streaks = streaksByUser([
    { user_id: 1, day: '2026-08-11', today: '2026-08-12' },
    { user_id: 1, day: '2026-08-11', today: '2026-08-12' },
    { user_id: 1, day: '2026-08-12', today: '2026-08-12' },
  ]);
  assert.deepEqual(streaks.get(1), { current: 2, longest: 2 });
});

test('streaksByUser returns an empty map when nobody in the realm has studied', () => {
  assert.equal(streaksByUser([]).size, 0);
});

// A poll that runs every few seconds should degrade to 0/0 rather than throw if
// the shape ever arrives incomplete.
test('streaksByUser skips a row with no day or no today', () => {
  const streaks = streaksByUser([
    { user_id: 1, day: '2026-08-12' },
    { user_id: 2, today: '2026-08-12' },
    { user_id: 3, day: '2026-08-12', today: '2026-08-12' },
  ]);
  assert.equal(streaks.get(1), undefined);
  assert.equal(streaks.get(2), undefined);
  assert.deepEqual(streaks.get(3), { current: 1, longest: 1 });
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
