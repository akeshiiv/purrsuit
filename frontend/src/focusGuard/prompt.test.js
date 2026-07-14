import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict, SYSTEM_PROMPT } from './prompt.js';

test('SYSTEM_PROMPT names every allowed category', () => {
  for (const c of ['social-media', 'entertainment', 'chat-nonacademic', 'gaming', 'shopping', 'other', 'focused']) {
    assert.ok(SYSTEM_PROMPT.includes(c), `prompt should mention ${c}`);
  }
});

test('parseVerdict reads clean JSON and maps a distraction category', () => {
  const v = parseVerdict('{"category":"social-media","summary":"Instagram feed","justification":"scrolling reels, not academic"}');
  assert.equal(v.distracted, true);
  assert.equal(v.reason, 'social-media');
  assert.equal(v.summary, 'Instagram feed');
  assert.match(v.justification, /reels/);
});

test('parseVerdict reads fenced JSON and maps focused to not-distracted', () => {
  const v = parseVerdict('```json\n{"category":"focused","summary":"VS Code with Python","justification":"editing code"}\n```');
  assert.equal(v.distracted, false);
  assert.equal(v.reason, 'focused');
});

test('parseVerdict falls back to a safe focused verdict on garbage', () => {
  const v = parseVerdict('I think the user is probably fine?');
  assert.equal(v.distracted, false);
  assert.equal(v.reason, 'focused');
});

test('parseVerdict falls back to a safe focused verdict for an unlisted category', () => {
  const v = parseVerdict('{"category":"tiktok","summary":"short videos","justification":"entertainment app"}');
  // unknown category is not in the allow-list -> safe focused fallback, never a fabricated distraction
  assert.equal(v.distracted, false);
});
