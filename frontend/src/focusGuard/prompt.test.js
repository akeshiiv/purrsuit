import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict, SYSTEM_PROMPT, CATEGORY_PROMPT, parseCategory } from './prompt.js';

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

// --- tier-2 one-word category flow (the spike showed small VLMs cannot emit JSON) ---

test('CATEGORY_PROMPT names every allowed category and asks for a single word', () => {
  for (const c of ['social-media', 'entertainment', 'chat-nonacademic', 'gaming', 'shopping', 'other', 'focused']) {
    assert.ok(CATEGORY_PROMPT.includes(c), `prompt should mention ${c}`);
  }
  assert.match(CATEGORY_PROMPT, /one word/i);
});

test('parseCategory reads a bare category, ignoring whitespace and punctuation', () => {
  assert.equal(parseCategory(' gaming'), 'gaming');
  assert.equal(parseCategory('focused.'), 'focused');
  assert.equal(parseCategory('chat-nonacademic\n'), 'chat-nonacademic');
});

test('parseCategory reads a category embedded in a short sentence', () => {
  assert.equal(parseCategory('The category is shopping'), 'shopping');
});

// Measured against real FastVLM output: it invents words like "code", "tech" and
// "photonsynthesis". Those must fail safe rather than being coerced to a distraction.
test('parseCategory returns null for a word outside the allowed set', () => {
  assert.equal(parseCategory('code'), null);
  assert.equal(parseCategory('tech'), null);
  assert.equal(parseCategory('photonsynthesis'), null);
});

test('parseCategory returns null when the answer names two different categories', () => {
  // Ambiguous output is no observation at all — never guess which one was meant.
  assert.equal(parseCategory('not focused, this is gaming'), null);
});

test('parseCategory does not match a category hidden inside a longer word', () => {
  assert.equal(parseCategory('mother'), null);
});

test('parseCategory returns null for empty or non-string input', () => {
  assert.equal(parseCategory(''), null);
  assert.equal(parseCategory(undefined), null);
});
