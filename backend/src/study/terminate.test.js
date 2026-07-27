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

test('logTermination inserts a row with resolved membership + season', async () => {
  const queries = [];
  const fakeClient = {
    query(text, values) {
      queries.push({ text: String(text).trim(), values });
      if (/FROM realm_members/i.test(text) && /current_season_id|seasons/i.test(text)) {
        return Promise.resolve({ rows: [{ realm_member_id: 7, season_id: 42 }] });
      }
      return Promise.resolve({ rows: [] });
    },
    release() {},
  };
  _setTransactionPool({ connect: () => Promise.resolve(fakeClient) });

  const r = await logTermination(1, { durationMinutes: 25, reason: 'gaming', summary: 's', justification: 'j' });
  assert.deepEqual(r, { logged: true });
  const insert = queries.find((q) => /INSERT INTO focus_terminations/i.test(q.text));
  assert.ok(insert, 'issues an INSERT into focus_terminations');
  assert.ok(insert.values.includes(7) && insert.values.includes(42), 'uses resolved member + season');
  assert.ok(insert.values.includes(1500), 'stores attempted duration in seconds');
});
