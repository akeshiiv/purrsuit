import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSessionKey,
  startStudySession,
  completeStudy,
  openStudySession,
  issueStudySession,
  claimStudySession,
  START_GRACE_SECONDS,
  CLAIM_WINDOW_MINUTES,
} from './service.js';
import { _setTransactionPool } from '../../db.js';

const KEY = '3f1c9d2e-4b7a-4c11-9d38-6a2e5c7b8091';
const USER = 1;
const REALM = 5;
const SEASON = 3;

// Drives withTransaction against a scripted database, the way
// terminate.test.js fakes a pool and quests/service.test.js scripts statements:
// `handlers` is an ordered list of { match, rows }, and the first whose pattern
// appears in the statement answers it. A `rows` that throws asserts a statement
// must never run.
function useFakeDb(handlers) {
  const queries = [];
  const client = {
    query(text, values = []) {
      const sqlText = String(text).trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sqlText)) return Promise.resolve({ rows: [] });
      queries.push({ text: sqlText, values });
      const handler = handlers.find((h) => h.match.test(sqlText));
      return Promise.resolve({ rows: handler ? (handler.rows(values) ?? []) : [] });
    },
    release() {},
  };
  _setTransactionPool({ connect: () => Promise.resolve(client) });
  return queries;
}

function find(queries, pattern) {
  return queries.find((q) => pattern.test(q.text));
}

function indexOf(queries, pattern) {
  return queries.findIndex((q) => pattern.test(q.text));
}

function pgError(code, constraint) {
  const err = new Error(`duplicate key value violates unique constraint "${constraint}"`);
  err.code = code;
  err.constraint = constraint;
  return err;
}

// Row the locking SELECT in claimStudySession hands back. Eligibility is
// expressed the way the database reports it, since the real query asks Postgres
// to compare its own clock rather than trusting anything sent by the client.
function sessionRow(overrides = {}) {
  return {
    id: 42,
    user_id: USER,
    status: 'pending',
    duration_minutes: 25,
    is_eligible: true,
    is_expired: false,
    ...overrides,
  };
}

function memberRow(overrides = {}) {
  return {
    id: 9,
    coins: 100,
    units_a: 0,
    units_b: 0,
    units_c: 0,
    seconds_studied: 1500,
    ...overrides,
  };
}

test('exposes the grace and claim-window constants the contract fixes', () => {
  assert.equal(START_GRACE_SECONDS, 15);
  assert.equal(CLAIM_WINDOW_MINUTES, 15);
});

// The grace is a fixed discount on a reward that scales with duration, so it is
// worth the most on the shortest session the economy allows. At 60s it made the
// 5-minute minimum pay 5 coins/minute against the intended 4 — start, sleep 240s,
// claim, repeat beat honest study by 25% for as long as you cared to run it.
test('the grace cannot inflate the shortest session past a few percent', () => {
  const MIN_MINUTES = 5;
  const COINS_PER_MINUTE = 4;
  const eligibleSeconds = MIN_MINUTES * 60 - START_GRACE_SECONDS;
  const effectiveRate = (MIN_MINUTES * COINS_PER_MINUTE) / (eligibleSeconds / 60);

  assert.ok(
    effectiveRate <= COINS_PER_MINUTE * 1.1,
    `a ${MIN_MINUTES}-minute session earns ${effectiveRate.toFixed(2)} coins/min against an intended ${COINS_PER_MINUTE}`,
  );
});

test('normalizeSessionKey accepts a uuid and rejects anything else', () => {
  assert.equal(normalizeSessionKey(KEY), KEY);
  assert.equal(normalizeSessionKey(` ${KEY.toUpperCase()} `), KEY);
  assert.equal(normalizeSessionKey('not-a-uuid'), null);
  assert.equal(normalizeSessionKey("'; DROP TABLE study_sessions; --"), null);
  assert.equal(normalizeSessionKey(undefined), null);
  assert.equal(normalizeSessionKey(42), null);
});

// The two guards below must reject before any database access. The transaction
// pool is rigged to throw if either one gets that far; note that the membership
// lookup they precede runs on the module-level `sql`, which has no test seam, so
// reordering these checks would hang the run rather than fail it.
test('startStudySession rejects a bad duration before touching the database', async () => {
  _setTransactionPool({ connect: () => { throw new Error('must not open a transaction'); } });
  await assert.rejects(startStudySession(USER, { durationMinutes: 3 }), (err) => {
    assert.equal(err.code, 'INVALID_DURATION');
    assert.equal(err.status, 400);
    return true;
  });
});

test('completeStudy rejects a missing or malformed sessionKey before touching the database', async () => {
  _setTransactionPool({ connect: () => { throw new Error('must not open a transaction'); } });
  for (const input of [{}, { sessionKey: 'nope' }]) {
    await assert.rejects(completeStudy(USER, input), (err) => {
      assert.equal(err.code, 'INVALID_SESSION');
      assert.equal(err.status, 400);
      return true;
    });
  }
});

// A tab loaded before this deploy still posts the duration-only body. It must be
// told to refresh rather than handed a generic validation error — and it must
// still earn nothing, since that duration is precisely what is no longer trusted.
test('completeStudy tells a pre-deploy client to refresh instead of crediting it', async () => {
  _setTransactionPool({ connect: () => { throw new Error('must not open a transaction'); } });
  await assert.rejects(completeStudy(USER, { durationMinutes: 25 }), (err) => {
    assert.equal(err.code, 'STALE_CLIENT');
    assert.equal(err.status, 409);
    return true;
  });
});

test('openStudySession retires a prior pending session and issues a key', async () => {
  const queries = useFakeDb([
    { match: /FROM realms/, rows: () => [{ id: SEASON, status: 'active' }] },
    { match: /UPDATE study_sessions/, rows: () => [] },
    {
      match: /INSERT INTO study_sessions/,
      rows: (v) => [{
        session_key: v[0],
        duration_minutes: 25,
        started_at: new Date('2026-07-31T10:00:00Z'),
        eligible_at: new Date('2026-07-31T10:24:00Z'),
        expires_at: new Date('2026-07-31T10:39:00Z'),
      }],
    },
  ]);

  const out = await openStudySession(USER, REALM, 25);

  const abandon = find(queries, /UPDATE study_sessions/);
  assert.ok(/status = 'abandoned'/.test(abandon.text), 'retires the previous pending row');
  assert.ok(/status = 'pending'/.test(abandon.text), 'only touches rows that are still live');
  assert.ok(
    indexOf(queries, /UPDATE study_sessions/) < indexOf(queries, /INSERT INTO study_sessions/),
    'retires the old session before inserting the new one',
  );

  const insert = find(queries, /INSERT INTO study_sessions/);
  assert.equal(out.sessionKey, insert.values[0], 'returns the key it stored');
  assert.equal(normalizeSessionKey(out.sessionKey), out.sessionKey, 'the key is a uuid');
  assert.equal(out.durationMinutes, 25);
  assert.equal(out.startedAt, '2026-07-31T10:00:00.000Z');
  assert.equal(out.eligibleAt, '2026-07-31T10:24:00.000Z');
  assert.equal(out.expiresAt, '2026-07-31T10:39:00.000Z');
  // 25 minutes less the 15s grace, and the claim window on top of that.
  assert.ok(insert.values.includes(1485), 'eligibility is the duration minus the grace');
  assert.ok(insert.values.includes(2385), 'expiry is eligibility plus the claim window');
  assert.ok(insert.values.includes(SEASON), 'stamps the season it was started in');
  assert.ok(/now\(\)/.test(insert.text), 'takes every timestamp from the server clock');
});

test('openStudySession refuses to start once the realm season has ended', async () => {
  const queries = useFakeDb([
    { match: /FROM realms/, rows: () => [{ id: SEASON, status: 'ended' }] },
    { match: /INSERT INTO study_sessions/, rows: () => { throw new Error('must not insert'); } },
  ]);

  await assert.rejects(openStudySession(USER, REALM, 25), (err) => {
    assert.equal(err.code, 'NOT_IN_ACTIVE_SEASON');
    assert.equal(err.status, 409);
    return true;
  });
  assert.equal(find(queries, /INSERT INTO study_sessions/), undefined);
});

test('issueStudySession retries when a concurrent start wins the single pending slot', async () => {
  let attempts = 0;
  useFakeDb([
    { match: /FROM realms/, rows: () => [{ id: SEASON, status: 'active' }] },
    {
      match: /INSERT INTO study_sessions/,
      rows: (v) => {
        attempts += 1;
        // The first attempt loses the race to the partial unique index; the
        // retry re-runs the retire-then-insert and lands the newer session.
        if (attempts === 1) throw pgError('23505', 'idx_study_sessions_one_pending');
        return [{
          session_key: v[0],
          duration_minutes: 50,
          started_at: new Date('2026-07-31T10:00:00Z'),
          eligible_at: new Date('2026-07-31T10:49:00Z'),
          expires_at: new Date('2026-07-31T11:04:00Z'),
        }];
      },
    },
  ]);

  const out = await issueStudySession(USER, REALM, 50);
  assert.equal(attempts, 2, 'retries exactly once after the collision');
  assert.equal(out.durationMinutes, 50);
  assert.equal(normalizeSessionKey(out.sessionKey), out.sessionKey);
});

test('issueStudySession does not retry or swallow an unrelated database error', async () => {
  let attempts = 0;
  useFakeDb([
    { match: /FROM realms/, rows: () => [{ id: SEASON, status: 'active' }] },
    {
      match: /INSERT INTO study_sessions/,
      rows: () => {
        attempts += 1;
        throw pgError('23503', 'study_sessions_user_id_fkey');
      },
    },
  ]);

  await assert.rejects(issueStudySession(USER, REALM, 25), /violates/);
  assert.equal(attempts, 1);
});

test('claimStudySession credits the award derived from the stored session', async () => {
  const queries = useFakeDb([
    { match: /FROM study_sessions/, rows: () => [sessionRow()] },
    { match: /FROM realms/, rows: () => [{ id: SEASON, status: 'active' }] },
    { match: /UPDATE realm_members/, rows: () => [memberRow({ coins: 220, seconds_studied: 3000 })] },
    { match: /INSERT INTO sessions/, rows: () => [{ id: 77 }] },
    { match: /UPDATE study_sessions/, rows: () => [] },
  ]);

  const out = await claimStudySession(USER, REALM, KEY);

  const lock = find(queries, /FROM study_sessions/);
  assert.ok(/FOR UPDATE/.test(lock.text), 'locks the session row for the whole claim');
  assert.ok(/now\(\) >= eligible_at/.test(lock.text), 'eligibility is decided by the server clock');
  assert.ok(/now\(\) > expires_at/.test(lock.text), 'expiry is decided by the server clock');

  const credit = find(queries, /UPDATE realm_members/);
  assert.ok(credit.values.includes(100), 'awards 25 minutes x 4 coins, taken from the row');
  assert.ok(credit.values.includes(1500), 'adds the row duration in seconds');

  const logged = find(queries, /INSERT INTO sessions/);
  assert.deepEqual(logged.values, [USER, 1500, 100, SEASON, 9]);

  const close = find(queries, /UPDATE study_sessions/);
  assert.ok(/status = 'completed'/.test(close.text), 'closes the session it just paid');
  assert.deepEqual(close.values, [100, 77, 42], 'records the award and the logged session id');

  assert.equal(out.coins, 220);
  assert.equal(out.secondsStudied, 3000);
  assert.ok(out.actions, 'reports the recomputed actions');
  assert.ok(!('alreadyCredited' in out), 'a first claim is not flagged as a replay');
});

test('claimStudySession rejects a claim made before the session can have finished', async () => {
  const queries = useFakeDb([
    { match: /FROM study_sessions/, rows: () => [sessionRow({ is_eligible: false })] },
    { match: /UPDATE realm_members/, rows: () => { throw new Error('must not credit'); } },
  ]);

  await assert.rejects(claimStudySession(USER, REALM, KEY), (err) => {
    assert.equal(err.code, 'SESSION_TOO_EARLY');
    assert.equal(err.status, 409);
    return true;
  });
  assert.equal(find(queries, /UPDATE realm_members/), undefined);
  assert.equal(find(queries, /INSERT INTO sessions/), undefined);
});

test('claimStudySession rejects a claim made after the window closed', async () => {
  useFakeDb([
    { match: /FROM study_sessions/, rows: () => [sessionRow({ is_expired: true })] },
    { match: /UPDATE realm_members/, rows: () => { throw new Error('must not credit'); } },
  ]);

  await assert.rejects(claimStudySession(USER, REALM, KEY), (err) => {
    assert.equal(err.code, 'SESSION_EXPIRED');
    return true;
  });
});

test('claimStudySession refuses a session that was terminated for distraction', async () => {
  useFakeDb([
    { match: /FROM study_sessions/, rows: () => [sessionRow({ status: 'terminated' })] },
    { match: /UPDATE realm_members/, rows: () => { throw new Error('must not credit'); } },
  ]);

  await assert.rejects(claimStudySession(USER, REALM, KEY), (err) => {
    assert.equal(err.code, 'SESSION_NOT_CLAIMABLE');
    assert.equal(err.status, 409);
    return true;
  });
});

test('claimStudySession refuses a session that was abandoned by a later start', async () => {
  useFakeDb([
    { match: /FROM study_sessions/, rows: () => [sessionRow({ status: 'abandoned' })] },
    { match: /UPDATE realm_members/, rows: () => { throw new Error('must not credit'); } },
  ]);

  await assert.rejects(claimStudySession(USER, REALM, KEY), (err) => {
    assert.equal(err.code, 'SESSION_NOT_CLAIMABLE');
    return true;
  });
});

test('claimStudySession reports another user\'s key exactly like an unknown one', async () => {
  useFakeDb([
    { match: /FROM study_sessions/, rows: () => [sessionRow({ user_id: 999 })] },
    { match: /UPDATE realm_members/, rows: () => { throw new Error('must not credit'); } },
  ]);
  await assert.rejects(claimStudySession(USER, REALM, KEY), (err) => {
    assert.equal(err.code, 'SESSION_NOT_FOUND');
    assert.equal(err.status, 404);
    return true;
  });

  useFakeDb([{ match: /FROM study_sessions/, rows: () => [] }]);
  await assert.rejects(claimStudySession(USER, REALM, KEY), (err) => {
    assert.equal(err.code, 'SESSION_NOT_FOUND');
    return true;
  });
});

test('claiming the same session twice credits once and replays the banked balance', async () => {
  // Stateful: the completion UPDATE flips the stored row exactly as Postgres
  // would, so the second call sees what a real retry would see.
  const stored = sessionRow();
  let credits = 0;
  useFakeDb([
    { match: /FROM study_sessions/, rows: () => [{ ...stored }] },
    { match: /FROM realms/, rows: () => [{ id: SEASON, status: 'active' }] },
    {
      match: /UPDATE realm_members/,
      rows: () => {
        credits += 1;
        return [memberRow({ coins: 220, seconds_studied: 3000 })];
      },
    },
    { match: /INSERT INTO sessions/, rows: () => [{ id: 77 }] },
    {
      match: /UPDATE study_sessions/,
      rows: () => {
        stored.status = 'completed';
        return [];
      },
    },
    { match: /FROM realm_members/, rows: () => [memberRow({ coins: 220, seconds_studied: 3000 })] },
  ]);

  const first = await claimStudySession(USER, REALM, KEY);
  const second = await claimStudySession(USER, REALM, KEY);

  assert.equal(credits, 1, 'the replay must not credit a second time');
  assert.equal(first.coins, 220);
  assert.ok(!('alreadyCredited' in first));
  assert.equal(second.alreadyCredited, true);
  assert.equal(second.coins, 220, 'the replay reports the balance the first claim banked');
  assert.equal(second.secondsStudied, 3000);
  assert.ok(second.actions, 'the replay returns the same payload shape');
});
