import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initState, transition, shouldComplete } from './machine.js';

function drive(events, start = initState()) {
  return events.reduce((s, e) => transition(s, e), start);
}
const distracted = { distracted: true, reason: 'social-media', summary: 's', justification: 'j' };
const focused = { distracted: false, reason: 'focused', summary: 's', justification: 'j' };

test('happy path: consent, ready, one focused frame, countdown -> credited done', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' },
    { type: 'MODEL_READY' },
    { type: 'FRAME_ANALYZED', verdict: focused },
    { type: 'COUNTDOWN_ZERO' },
  ]);
  assert.equal(s.status, 'done');
  assert.equal(shouldComplete(s), true);
});

test('declined share -> uncredited, never completes', () => {
  const s = drive([{ type: 'CONSENT_DENIED' }, { type: 'COUNTDOWN_ZERO' }]);
  assert.equal(s.status, 'uncredited');
  assert.equal(shouldComplete(s), false);
});

test('countdown while still warming with zero frames -> uncredited', () => {
  const s = drive([{ type: 'CONSENT_GRANTED' }, { type: 'COUNTDOWN_ZERO' }]);
  assert.equal(s.status, 'uncredited');
  assert.equal(shouldComplete(s), false);
});

test('a single distracted frame does NOT terminate', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' }, { type: 'MODEL_READY' },
    { type: 'FRAME_ANALYZED', verdict: distracted },
  ]);
  assert.equal(s.status, 'monitoring');
  assert.equal(s.consecutiveDistracted, 1);
});

test('two consecutive distracted frames terminate and expose the verdict', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' }, { type: 'MODEL_READY' },
    { type: 'FRAME_ANALYZED', verdict: distracted },
    { type: 'FRAME_ANALYZED', verdict: distracted },
  ]);
  assert.equal(s.status, 'terminated');
  assert.equal(s.verdict.reason, 'social-media');
  assert.equal(shouldComplete(s), false);
});

test('a focused frame between distractions resets the corroboration counter', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' }, { type: 'MODEL_READY' },
    { type: 'FRAME_ANALYZED', verdict: distracted },
    { type: 'FRAME_ANALYZED', verdict: focused },
    { type: 'FRAME_ANALYZED', verdict: distracted },
  ]);
  assert.equal(s.status, 'monitoring');
  assert.equal(s.consecutiveDistracted, 1);
});

test('stopping the share mid-session blocks credit', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' }, { type: 'MODEL_READY' },
    { type: 'FRAME_ANALYZED', verdict: focused },
    { type: 'STREAM_ENDED' }, { type: 'COUNTDOWN_ZERO' },
  ]);
  assert.equal(shouldComplete(s), false);
});
