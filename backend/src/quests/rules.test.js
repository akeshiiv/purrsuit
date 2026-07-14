import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sgtParts,
  QUESTS,
  QUEST_BY_KEY,
  QUEST_KEYS,
  progressView,
  chooseQuestKey,
  REWARD_COINS,
} from './rules.js';

test('sgtParts shifts UTC to Singapore (UTC+8) date and hour', () => {
  // 2026-07-14T20:30:00Z is 2026-07-15 04:30 SGT
  const p = sgtParts(new Date('2026-07-14T20:30:00Z'));
  assert.equal(p.date, '2026-07-15');
  assert.equal(p.hour, 4);
  // 2026-07-14T15:00:00Z is 2026-07-14 23:00 SGT (still the 14th)
  const q = sgtParts(new Date('2026-07-14T15:00:00Z'));
  assert.equal(q.date, '2026-07-14');
  assert.equal(q.hour, 23);
});

test('the pool has stable keys and every def is well-formed', () => {
  assert.equal(REWARD_COINS, 100);
  assert.equal(QUEST_KEYS.length, QUESTS.length);
  assert.ok(QUEST_KEYS.includes('study_exact_67'));
  assert.ok(QUEST_KEYS.includes('buy_all_three'));
  for (const def of QUESTS) {
    assert.equal(typeof def.title, 'string');
    assert.equal(typeof def.description, 'string');
    assert.ok(['instant', 'count', 'set'].includes(def.kind));
    assert.ok(Array.isArray(def.events) && def.events.length >= 1);
    assert.equal(typeof def.evaluate, 'function');
    assert.equal(QUEST_BY_KEY[def.key], def);
  }
});

test('study_exact_67 completes only at exactly 67 minutes', () => {
  const def = QUEST_BY_KEY.study_exact_67;
  assert.equal(def.evaluate({ event: 'study.complete', data: { durationMinutes: 67 }, progress: {} }).completed, true);
  assert.equal(def.evaluate({ event: 'study.complete', data: { durationMinutes: 66 }, progress: {} }).completed, false);
});

test('study_morning completes for 7 and 8 SGT, not 6 or 9', () => {
  const def = QUEST_BY_KEY.study_morning;
  const at = (hour) => def.evaluate({ event: 'study.complete', data: { sgtHour: hour }, progress: {} }).completed;
  assert.equal(at(6), false);
  assert.equal(at(7), true);
  assert.equal(at(8), true);
  assert.equal(at(9), false);
});

test('study_60_plus completes at 60 and above', () => {
  const def = QUEST_BY_KEY.study_60_plus;
  assert.equal(def.evaluate({ event: 'study.complete', data: { durationMinutes: 59 }, progress: {} }).completed, false);
  assert.equal(def.evaluate({ event: 'study.complete', data: { durationMinutes: 60 }, progress: {} }).completed, true);
});

test('five_sessions_today reflects the queried count and completes at 5', () => {
  const def = QUEST_BY_KEY.five_sessions_today;
  const r4 = def.evaluate({ event: 'study.complete', data: { sessionsToday: 4 }, progress: {} });
  assert.deepEqual([r4.completed, r4.progress.current], [false, 4]);
  const r5 = def.evaluate({ event: 'study.complete', data: { sessionsToday: 5 }, progress: {} });
  assert.deepEqual([r5.completed, r5.progress.current], [true, 5]);
});

test('strengthen_cell completes on any defend', () => {
  assert.equal(QUEST_BY_KEY.strengthen_cell.evaluate({ event: 'defend', data: {}, progress: {} }).completed, true);
});

test('win_a_battle completes only on a captured attack', () => {
  const def = QUEST_BY_KEY.win_a_battle;
  assert.equal(def.evaluate({ event: 'attack', data: { result: 'captured' }, progress: {} }).completed, true);
  assert.equal(def.evaluate({ event: 'attack', data: { result: 'claimed' }, progress: {} }).completed, false);
  assert.equal(def.evaluate({ event: 'attack', data: { result: 'repelled' }, progress: {} }).completed, false);
});

test('capture_leader_cell completes when the captured cell belonged to the leader', () => {
  const def = QUEST_BY_KEY.capture_leader_cell;
  assert.equal(def.evaluate({ event: 'attack', data: { result: 'captured', priorOwnerMemberId: 5, leaderMemberId: 5 }, progress: {} }).completed, true);
  assert.equal(def.evaluate({ event: 'attack', data: { result: 'captured', priorOwnerMemberId: 5, leaderMemberId: 9 }, progress: {} }).completed, false);
  assert.equal(def.evaluate({ event: 'attack', data: { result: 'claimed', priorOwnerMemberId: null, leaderMemberId: 5 }, progress: {} }).completed, false);
});

test('capture_three_today accumulates claimed/captured to 3', () => {
  const def = QUEST_BY_KEY.capture_three_today;
  let p = {};
  const step = (result) => { const r = def.evaluate({ event: 'attack', data: { result }, progress: p }); p = r.progress; return r.completed; };
  assert.equal(step('claimed'), false);   // 1
  assert.equal(step('repelled'), false);  // still 1 (no increment)
  assert.equal(step('captured'), false);  // 2
  assert.equal(step('claimed'), true);    // 3
  assert.equal(p.current, 3);
});

test('buy_all_three collects the distinct set of unit types', () => {
  const def = QUEST_BY_KEY.buy_all_three;
  let p = {};
  const buy = (t) => { const r = def.evaluate({ event: 'shop.buy', data: { unitType: t }, progress: p }); p = r.progress; return r.completed; };
  assert.equal(buy('A'), false);
  assert.equal(buy('A'), false);   // duplicate does not advance
  assert.equal(buy('B'), false);
  assert.equal(buy('C'), true);
});

test('buy_three_units counts any three purchases', () => {
  const def = QUEST_BY_KEY.buy_three_units;
  let p = {};
  const buy = (t) => { const r = def.evaluate({ event: 'shop.buy', data: { unitType: t }, progress: p }); p = r.progress; return r.completed; };
  assert.equal(buy('A'), false);
  assert.equal(buy('A'), false);
  assert.equal(buy('A'), true);
});

test('progressView returns null for instant and {current,target} for count/set', () => {
  assert.equal(progressView(QUEST_BY_KEY.study_exact_67, {}), null);
  assert.deepEqual(progressView(QUEST_BY_KEY.five_sessions_today, { current: 2 }), { current: 2, target: 5 });
  assert.deepEqual(progressView(QUEST_BY_KEY.buy_all_three, { types: ['A', 'B'] }), { current: 2, target: 3 });
  assert.deepEqual(progressView(QUEST_BY_KEY.capture_three_today, {}), { current: 0, target: 3 });
});

test('chooseQuestKey returns a pool key and uses the injected rng', () => {
  assert.equal(chooseQuestKey(() => 0), QUEST_KEYS[0]);
  assert.equal(chooseQuestKey(() => QUEST_KEYS.length - 1), QUEST_KEYS[QUEST_KEYS.length - 1]);
  assert.ok(QUEST_KEYS.includes(chooseQuestKey()));
});
