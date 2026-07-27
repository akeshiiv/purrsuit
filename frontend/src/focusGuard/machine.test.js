import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initState, transition, shouldComplete } from './machine.js';
import { emptyVerdict } from './contract.js';

function drive(events, start = initState()) {
  return events.reduce((s, e) => transition(s, e), start);
}
const distracted = { distracted: true, reason: 'social-media', summary: 's', justification: 'j', parsed: true };
const focused = { distracted: false, reason: 'focused', summary: 's', justification: 'j', parsed: true };

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

// Two is not enough: the model spike measured a real arXiv abstract classified as
// chat-nonacademic, and captures are ~5 minutes apart, so a student reading one paper
// can plausibly be caught twice in a row on the same legitimate page.
test('two consecutive distracted frames still do NOT terminate', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' }, { type: 'MODEL_READY' },
    { type: 'FRAME_ANALYZED', verdict: distracted },
    { type: 'FRAME_ANALYZED', verdict: distracted },
  ]);
  assert.equal(s.status, 'monitoring');
  assert.equal(s.consecutiveDistracted, 2);
});

test('three consecutive distracted frames terminate and expose the verdict', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' }, { type: 'MODEL_READY' },
    { type: 'FRAME_ANALYZED', verdict: distracted },
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

// A verdict that failed to parse carries no information about the screen. Counting
// it as a monitored frame would credit a session on a device whose model never
// produces a usable verdict — monitored in name only, and unable to ever detect.
test('unparseable verdicts do not count as monitored frames, so the session is uncredited', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' }, { type: 'MODEL_READY' },
    { type: 'FRAME_ANALYZED', verdict: emptyVerdict() },
    { type: 'FRAME_ANALYZED', verdict: emptyVerdict() },
    { type: 'FRAME_ANALYZED', verdict: emptyVerdict() },
    { type: 'COUNTDOWN_ZERO' },
  ]);
  assert.equal(s.framesAnalyzed, 0);
  assert.equal(s.status, 'uncredited');
  assert.equal(shouldComplete(s), false);
});

test('one parsed frame still earns credit alongside unparseable ones', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' }, { type: 'MODEL_READY' },
    { type: 'FRAME_ANALYZED', verdict: emptyVerdict() },
    { type: 'FRAME_ANALYZED', verdict: focused },
    { type: 'COUNTDOWN_ZERO' },
  ]);
  assert.equal(s.framesAnalyzed, 1);
  assert.equal(shouldComplete(s), true);
});

// A missing sample must not erase corroboration: it neither confirms nor denies the
// earlier distraction, so the counter is left alone rather than reset.
test('an unparseable verdict does not reset the corroboration counter', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' }, { type: 'MODEL_READY' },
    { type: 'FRAME_ANALYZED', verdict: distracted },
    { type: 'FRAME_ANALYZED', verdict: emptyVerdict() },
    { type: 'FRAME_ANALYZED', verdict: distracted },
    { type: 'FRAME_ANALYZED', verdict: distracted },
  ]);
  assert.equal(s.status, 'terminated');
});

test('engine failure after consent leaves warming for uncredited (never stuck)', () => {
  const s = drive([
    { type: 'CONSENT_GRANTED' },   // -> warming
    { type: 'ENGINE_FAILED' },     // engine/model init failed -> running-uncredited
    { type: 'COUNTDOWN_ZERO' },
  ]);
  assert.equal(s.status, 'uncredited');
  assert.equal(shouldComplete(s), false);
});
