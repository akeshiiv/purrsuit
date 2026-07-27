import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockDetector } from './mock.js';
import { DISTRACTION_REASONS } from '../contract.js';

test('mock detector defaults to a focused (not distracted) verdict', async () => {
  const detector = createMockDetector();
  const v = await detector.analyzeFrame({});
  assert.equal(v.distracted, false);
  assert.equal(v.reason, 'focused');
  assert.equal(typeof v.summary, 'string');
  assert.equal(typeof v.justification, 'string');
});

// The default verdict must be an OBSERVATION of studying, not an unreadable one:
// mock mode has to reach a credited session, or the whole dev/demo flow silently
// ends every focus session uncredited.
test('mock detector default verdict is credit-worthy (parsed)', async () => {
  const v = await createMockDetector().analyzeFrame({});
  assert.equal(v.parsed, true);
});

test('mock detector scripted verdicts are credit-worthy too', async () => {
  const detector = createMockDetector({ verdicts: [{ distracted: false }] });
  const v = await detector.analyzeFrame({});
  assert.equal(v.parsed, true);
});

test('mock detector replays a scripted queue then repeats the last', async () => {
  const detector = createMockDetector({
    verdicts: [
      { distracted: true, reason: 'social-media', summary: 'IG feed', justification: 'scrolling reels' },
    ],
  });
  const first = await detector.analyzeFrame({});
  assert.equal(first.distracted, true);
  assert.equal(first.reason, 'social-media');
  assert.ok(DISTRACTION_REASONS.includes(first.reason));
  const second = await detector.analyzeFrame({});
  assert.equal(second.distracted, true); // repeats last when queue drained
});
