import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTerminationInput, logTermination } from './terminate.js';
import { _setTransactionPool } from '../../db.js';

test('validateTerminationInput accepts a valid distraction', () => {
  const out = validateTerminationInput({ durationMinutes: 25, reason: 'social-media', summary: 'IG', justification: 'reels' });
  assert.equal(out.durationSeconds, 1500);
  assert.equal(out.reason, 'social-media');
});

test('validateTerminationInput rejects a bad duration', () => {
  assert.throws(() => validateTerminationInput({ durationMinutes: 3, reason: 'social-media' }), /duration/i);
});

test('validateTerminationInput rejects an unknown reason', () => {
  assert.throws(() => validateTerminationInput({ durationMinutes: 25, reason: 'nope' }), /reason/i);
});

test('validateTerminationInput caps oversized summary/justification', () => {
  const out = validateTerminationInput({
    durationMinutes: 25, reason: 'other', summary: 'x'.repeat(5000), justification: 'y'.repeat(5000),
  });
  assert.ok(out.summary.length <= 2000);
  assert.ok(out.justification.length <= 2000);
});

const KEY = '3f1c9d2e-4b7a-4c11-9d38-6a2e5c7b8091';

// Same pool fake as the other study tests: records every statement and answers
// the membership lookup, plus whatever the individual test scripts.
function useFakeDb(closedRows) {
  const queries = [];
  const fakeClient = {
    query(text, values) {
      queries.push({ text: String(text).trim(), values });
      if (/UPDATE study_sessions/i.test(text)) {
        return Promise.resolve({ rows: closedRows ?? [] });
      }
      if (/FROM realm_members/i.test(text) && /current_season_id|seasons/i.test(text)) {
        return Promise.resolve({ rows: [{ realm_member_id: 7, season_id: 42 }] });
      }
      return Promise.resolve({ rows: [] });
    },
    release() {},
  };
  _setTransactionPool({ connect: () => Promise.resolve(fakeClient) });
  return queries;
}

test('validateTerminationInput accepts a sessionKey with no duration', () => {
  const out = validateTerminationInput({ sessionKey: KEY, reason: 'gaming' });
  assert.equal(out.sessionKey, KEY);
  assert.equal(out.durationSeconds, null);
});

test('logTermination inserts a row with resolved membership + season', async () => {
  const queries = useFakeDb();

  const r = await logTermination(1, { durationMinutes: 25, reason: 'gaming', summary: 's', justification: 'j' });
  assert.deepEqual(r, { logged: true });
  const insert = queries.find((q) => /INSERT INTO focus_terminations/i.test(q.text));
  assert.ok(insert, 'issues an INSERT into focus_terminations');
  assert.ok(insert.values.includes(7) && insert.values.includes(42), 'uses resolved member + season');
  assert.ok(insert.values.includes(1500), 'stores attempted duration in seconds');
});

test('logTermination closes the server-owned session so it can never be claimed', async () => {
  const queries = useFakeDb([{ duration_minutes: 50 }]);

  await logTermination(1, { sessionKey: KEY, durationMinutes: 25, reason: 'gaming' });

  const close = queries.find((q) => /UPDATE study_sessions/i.test(q.text));
  assert.ok(close, 'flips the session row');
  assert.ok(/status = 'terminated'/.test(close.text));
  assert.ok(/status = 'pending'/.test(close.text), 'only a live session can be terminated');
  assert.ok(close.values.includes(KEY) && close.values.includes(1), 'scoped to the caller\'s own session');

  const insert = queries.find((q) => /INSERT INTO focus_terminations/i.test(q.text));
  assert.ok(insert.values.includes(3000), 'logs the duration from the row, not the one the client sent');
  assert.ok(!insert.values.includes(1500), 'the client-sent duration is ignored when a row exists');
});

test('logTermination still logs when the sessionKey matches nothing', async () => {
  const queries = useFakeDb([]);

  const r = await logTermination(1, { sessionKey: KEY, durationMinutes: 25, reason: 'other' });
  assert.deepEqual(r, { logged: true });
  const insert = queries.find((q) => /INSERT INTO focus_terminations/i.test(q.text));
  assert.ok(insert.values.includes(1500), 'falls back to the duration the client reported');
});
