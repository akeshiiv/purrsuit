import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mockStudy from './study.js';

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
