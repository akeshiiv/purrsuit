import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as mockStudy from './study.js';
import { state, resetForRealm } from './state.js';

const SEED_REALM = { ...state.realm };

beforeEach(() => {
  resetForRealm({ ...SEED_REALM }, 'admin');
});

// Backdate a pending session so the wall-clock eligibility check passes without
// the test actually sitting through the countdown.
function makeClaimable(sessionKey) {
  const session = state.studySessions.find(s => s.sessionKey === sessionKey);
  session.eligibleAt = Date.now() - 1000;
  return session;
}

function assertBlock(block) {
  for (const key of [
    'totalSeconds', 'sessionCount', 'totalCoins',
    'avgSessionSeconds', 'activeDays', 'avgSecondsPerActiveDay',
  ]) {
    assert.equal(typeof block[key], 'number', `block.${key} should be a number`);
  }
}

test('mock getStats returns a StudyStats-shaped payload', async () => {
  const stats = await mockStudy.getStats('UTC');
  assert.equal(typeof stats.streak.current, 'number');
  assert.equal(typeof stats.streak.longest, 'number');
  assertBlock(stats.allTime);
  assert.ok(stats.season === null || typeof stats.season === 'object');
  if (stats.season) assertBlock(stats.season);
});

// The chart labels its bars from these dates, so the series has to be a full,
// dense week in order — never sparse, never short, never newest-first.
test('mock getStats returns seven dated days, oldest first, ending today', async () => {
  const { last7Days } = await mockStudy.getStats('UTC');
  assert.equal(last7Days.length, 7);

  const pad = value => String(value).padStart(2, '0');
  const localDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const today = new Date();

  last7Days.forEach((entry, index) => {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - (6 - index));
    assert.equal(entry.date, localDay(expected), `entry ${index} is the right calendar day`);
    assert.equal(typeof entry.minutes, 'number');
    assert.ok(entry.minutes >= 0);
  });
});

// The design's zero day is a flat stub rather than a missing bar, so the mock
// has to contain one for that treatment to ever be seen.
test('the mock week contains a zero day and a day past the chart reference', async () => {
  const { last7Days } = await mockStudy.getStats('UTC');
  assert.ok(last7Days.some(entry => entry.minutes === 0), 'a zero day keeps the gap visible');
  assert.ok(last7Days.some(entry => entry.minutes > 60), 'a tall day exercises the rescaling');
});

// Two screens read the streak — the Stats card from here, the Ranks award from
// the leaderboard row — so the mock must not hand them different numbers.
test('the reported streak is the one on the member row', async () => {
  const stats = await mockStudy.getStats('UTC');
  assert.equal(stats.streak.current, state.me.streakCurrent);
  assert.equal(stats.streak.longest, state.me.streakLongest);
});

// `streak.current` counts back from today, so the sample week has to agree with
// it or the Stats screen contradicts itself in one glance.
test('the mock week agrees with the reported current streak', async () => {
  const { last7Days, streak } = await mockStudy.getStats('UTC');
  let run = 0;
  for (let index = last7Days.length - 1; index >= 0; index -= 1) {
    if (last7Days[index].minutes === 0) break;
    run += 1;
  }
  assert.equal(run, streak.current);
});

test('mock terminate returns { logged: true } for a valid distraction', async () => {
  const r = await mockStudy.terminate({
    durationMinutes: 25, reason: 'social-media', summary: 'IG', justification: 'reels',
  });
  assert.equal(r.logged, true);
});

test('mock terminate rejects an unknown reason', async () => {
  await assert.rejects(
    () => mockStudy.terminate({ durationMinutes: 25, reason: 'nope', summary: '', justification: '' }),
    /reason/i,
  );
});

test('mock terminate rejects a bad duration (parity with the real endpoint)', async () => {
  await assert.rejects(
    () => mockStudy.terminate({ durationMinutes: 3, reason: 'social-media', summary: '', justification: '' }),
    /duration/i,
  );
});

test('mock start issues a key with the contract timestamps', async () => {
  const started = await mockStudy.start({ durationMinutes: 25 });
  assert.equal(typeof started.sessionKey, 'string');
  assert.equal(started.durationMinutes, 25);
  const startedAt = Date.parse(started.startedAt);
  const eligibleAt = Date.parse(started.eligibleAt);
  const expiresAt = Date.parse(started.expiresAt);
  // eligible one grace minute before the countdown would end, claimable for 15 more.
  assert.equal(eligibleAt - startedAt, 25 * 60_000 - 60_000);
  assert.equal(expiresAt - eligibleAt, 15 * 60_000);
});

test('mock start rejects a bad duration', async () => {
  await assert.rejects(() => mockStudy.start({ durationMinutes: 3 }), /duration/i);
});

test('a full session start -> complete credits the duration stored on the row', async () => {
  const before = state.me.coins;
  const started = await mockStudy.start({ durationMinutes: 25 });
  makeClaimable(started.sessionKey);
  const result = await mockStudy.complete({ sessionKey: started.sessionKey });
  assert.equal(result.coins, before + 100);
});

// The whole point of the server-owned session: elapsed wall-clock time on the
// server, not a duration the client asserts, is what unlocks the coins.
test('completing before the countdown could have finished is rejected', async () => {
  const started = await mockStudy.start({ durationMinutes: 25 });
  await assert.rejects(
    () => mockStudy.complete({ sessionKey: started.sessionKey }),
    (error) => error.code === 'SESSION_TOO_EARLY' && error.status === 409,
  );
});

test('completing after the claim window closed is rejected', async () => {
  const started = await mockStudy.start({ durationMinutes: 25 });
  const session = makeClaimable(started.sessionKey);
  session.expiresAt = Date.now() - 1;
  await assert.rejects(
    () => mockStudy.complete({ sessionKey: started.sessionKey }),
    (error) => error.code === 'SESSION_EXPIRED',
  );
});

test('completing without a key, or with an unknown one, is rejected', async () => {
  await assert.rejects(
    () => mockStudy.complete({}),
    (error) => error.code === 'INVALID_SESSION' && error.status === 400,
  );
  await assert.rejects(
    () => mockStudy.complete({ sessionKey: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }),
    (error) => error.code === 'SESSION_NOT_FOUND' && error.status === 404,
  );
  // A key the uuid column could never hold is a bad request, not a miss.
  await assert.rejects(
    () => mockStudy.complete({ sessionKey: 'not-a-uuid' }),
    (error) => error.code === 'INVALID_SESSION' && error.status === 400,
  );
});

// A retry after a dropped response must not pay twice — and must not punish the
// user for the network by refusing the coins they already earned.
test('completing the same key twice replays the payload without crediting again', async () => {
  const started = await mockStudy.start({ durationMinutes: 25 });
  makeClaimable(started.sessionKey);
  const first = await mockStudy.complete({ sessionKey: started.sessionKey });
  const second = await mockStudy.complete({ sessionKey: started.sessionKey });
  assert.equal(second.alreadyCredited, true);
  assert.equal(second.coins, first.coins);
});

test('starting a second session abandons the first, which can never be claimed', async () => {
  const first = await mockStudy.start({ durationMinutes: 25 });
  await mockStudy.start({ durationMinutes: 25 });
  makeClaimable(first.sessionKey);
  await assert.rejects(
    () => mockStudy.complete({ sessionKey: first.sessionKey }),
    (error) => error.code === 'SESSION_NOT_CLAIMABLE' && error.status === 409,
  );
});

test('a terminated session can never be completed afterwards', async () => {
  const started = await mockStudy.start({ durationMinutes: 25 });
  await mockStudy.terminate({
    sessionKey: started.sessionKey, reason: 'gaming', summary: 'g', justification: 'j',
  });
  makeClaimable(started.sessionKey);
  await assert.rejects(
    () => mockStudy.complete({ sessionKey: started.sessionKey }),
    (error) => error.code === 'SESSION_NOT_CLAIMABLE',
  );
});

test('terminate takes the duration from the row when a key is given', async () => {
  const started = await mockStudy.start({ durationMinutes: 25 });
  const result = await mockStudy.terminate({
    sessionKey: started.sessionKey, reason: 'gaming', summary: 'g', justification: 'j',
  });
  assert.equal(result.logged, true);
});
