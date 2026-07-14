import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTodayQuest, getTodayQuest, evaluateQuest } from './service.js';

// A fake tagged-template `query`. `handlers` is an ordered list of
// { match, rows } — the first whose `match` substring appears in the assembled
// SQL supplies the rows and records the interpolated values.
function makeQuery(handlers) {
  const calls = [];
  const query = (strings, ...values) => {
    const sqlText = strings.join('?');
    calls.push({ sqlText, values });
    const handler = handlers.find((h) => sqlText.includes(h.match));
    return Promise.resolve(handler ? handler.rows(values) : []);
  };
  query.calls = calls;
  return query;
}

test('ensureTodayQuest inserts-on-conflict then selects the row', async () => {
  const row = { id: 10, quest_key: 'strengthen_cell', progress: {}, completed_at: null };
  const query = makeQuery([
    { match: 'INSERT INTO daily_quests', rows: () => [] },
    { match: 'SELECT id, quest_key', rows: () => [row] },
  ]);
  const got = await ensureTodayQuest(query, 1, '2026-07-14');
  assert.deepEqual(got, row);
  assert.ok(query.calls.some((c) => c.sqlText.includes('ON CONFLICT')));
});

test('getTodayQuest serialises an active quest with progress', async () => {
  const query = makeQuery([
    { match: 'INSERT INTO daily_quests', rows: () => [] },
    { match: 'SELECT id, quest_key', rows: () => [{ id: 10, quest_key: 'buy_all_three', progress: { types: ['A'] }, completed_at: null }] },
  ]);
  const dq = await getTodayQuest(query, 1, new Date('2026-07-14T04:00:00Z'));
  assert.equal(dq.key, 'buy_all_three');
  assert.equal(dq.reward, 100);
  assert.deepEqual(dq.progress, { current: 1, target: 3 });
  assert.equal(dq.questDate, '2026-07-14');
});

test('getTodayQuest returns null once completed', async () => {
  const query = makeQuery([
    { match: 'INSERT INTO daily_quests', rows: () => [] },
    { match: 'SELECT id, quest_key', rows: () => [{ id: 10, quest_key: 'strengthen_cell', progress: {}, completed_at: '2026-07-14T01:00:00Z' }] },
  ]);
  assert.equal(await getTodayQuest(query, 1, new Date('2026-07-14T04:00:00Z')), null);
});

test('evaluateQuest awards 100 once when an instant quest completes', async () => {
  const updates = [];
  const query = makeQuery([
    { match: 'INSERT INTO daily_quests', rows: () => [] },
    { match: 'SELECT id, quest_key', rows: () => [{ id: 10, quest_key: 'strengthen_cell', progress: {}, completed_at: null }] },
    { match: 'UPDATE daily_quests SET progress', rows: (v) => { updates.push(['progress', v]); return []; } },
    { match: 'UPDATE daily_quests SET completed_at', rows: (v) => { updates.push(['complete', v]); return [{ id: 10 }]; } },
    { match: 'UPDATE realm_members SET coins', rows: (v) => { updates.push(['coins', v]); return []; } },
    { match: 'UPDATE seasons SET state_version', rows: () => [] },
  ]);
  const out = await evaluateQuest(query, {
    userId: 1, realmId: 2, seasonId: 3, memberId: 4,
    event: 'defend', data: {}, now: new Date('2026-07-14T04:00:00Z'),
  });
  assert.deepEqual(out.questCompleted, { key: 'strengthen_cell', title: 'Dig In', reward: 100 });
  assert.equal(out.coinsAwarded, 100);
  assert.ok(updates.some((u) => u[0] === 'coins'));
});

test('evaluateQuest does not award when the completed_at guard loses the race', async () => {
  const query = makeQuery([
    { match: 'INSERT INTO daily_quests', rows: () => [] },
    { match: 'SELECT id, quest_key', rows: () => [{ id: 10, quest_key: 'strengthen_cell', progress: {}, completed_at: null }] },
    { match: 'UPDATE daily_quests SET progress', rows: () => [] },
    { match: 'UPDATE daily_quests SET completed_at', rows: () => [] }, // no row → already completed elsewhere
    { match: 'UPDATE realm_members SET coins', rows: () => { throw new Error('must not award'); } },
  ]);
  const out = await evaluateQuest(query, {
    userId: 1, realmId: 2, seasonId: 3, memberId: 4,
    event: 'defend', data: {}, now: new Date('2026-07-14T04:00:00Z'),
  });
  assert.equal(out.coinsAwarded, 0);
  assert.equal(out.questCompleted, null);
});

test('evaluateQuest ignores events the assigned quest does not subscribe to', async () => {
  const query = makeQuery([
    { match: 'INSERT INTO daily_quests', rows: () => [] },
    { match: 'SELECT id, quest_key', rows: () => [{ id: 10, quest_key: 'study_exact_67', progress: {}, completed_at: null }] },
    { match: 'UPDATE', rows: () => { throw new Error('must not mutate'); } },
  ]);
  const out = await evaluateQuest(query, {
    userId: 1, realmId: 2, seasonId: 3, memberId: 4,
    event: 'defend', data: {}, now: new Date('2026-07-14T04:00:00Z'),
  });
  assert.equal(out.coinsAwarded, 0);
});

test('evaluateQuest counts sessions for five_sessions_today', async () => {
  let progressWritten = null;
  const query = makeQuery([
    { match: 'INSERT INTO daily_quests', rows: () => [] },
    { match: 'SELECT id, quest_key', rows: () => [{ id: 10, quest_key: 'five_sessions_today', progress: {}, completed_at: null }] },
    { match: 'COUNT(*)', rows: () => [{ c: 5 }] },
    { match: 'UPDATE daily_quests SET progress', rows: (v) => { progressWritten = v[0]; return []; } },
    { match: 'UPDATE daily_quests SET completed_at', rows: () => [{ id: 10 }] },
    { match: 'UPDATE realm_members SET coins', rows: () => [] },
    { match: 'UPDATE seasons SET state_version', rows: () => [] },
  ]);
  const out = await evaluateQuest(query, {
    userId: 1, realmId: 2, seasonId: 3, memberId: 4,
    event: 'study.complete', data: { durationMinutes: 25 }, now: new Date('2026-07-14T04:00:00Z'),
  });
  assert.equal(out.coinsAwarded, 100);
  assert.match(progressWritten, /"current":5/);
});
