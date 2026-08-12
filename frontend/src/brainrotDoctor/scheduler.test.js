import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCaptureTimes, createScheduler, FIVE_MIN_MS, TAIL_RESERVE_MS } from './scheduler.js';

test('produces exactly one capture per full 5-min window', () => {
  const times = computeCaptureTimes(25 * 60_000, () => 0.5);
  assert.equal(times.length, 5);
});

test('each capture falls strictly inside its own window', () => {
  const times = computeCaptureTimes(25 * 60_000, () => 0.5);
  times.forEach((t, k) => {
    assert.ok(t >= k * FIVE_MIN_MS && t < (k + 1) * FIVE_MIN_MS, `capture ${k} in window`);
  });
});

test('returns times sorted ascending', () => {
  const times = computeCaptureTimes(60 * 60_000, Math.random);
  const sorted = [...times].sort((a, b) => a - b);
  assert.deepEqual(times, sorted);
});

test('a partial final window still gets one in-bounds capture', () => {
  const times = computeCaptureTimes(7 * 60_000, () => 0.99); // 5min + 2min window
  assert.equal(times.length, 2);
  assert.ok(times[1] >= FIVE_MIN_MS && times[1] < 7 * 60_000);
});

// The last capture has to leave room for its own inference, or the only verdict
// of a session can land after the countdown has already decided on credit.
test('no capture lands inside the tail reserve', () => {
  const durationMs = 25 * 60_000;
  const times = computeCaptureTimes(durationMs, () => 0.999);
  assert.ok(times.at(-1) <= durationMs - TAIL_RESERVE_MS, 'last capture clears the reserve');
});

// The 5-minute session is the shortest allowed and has exactly ONE window, so a
// reserve that could drop it would leave every short monitored session
// uncredited — worse than the race it is meant to fix.
test('the shortest allowed session still gets its one capture, clear of the tail', () => {
  const durationMs = 5 * 60_000;
  for (const roll of [0, 0.5, 0.999999]) {
    const times = computeCaptureTimes(durationMs, () => roll);
    assert.equal(times.length, 1, `one capture at roll ${roll}`);
    assert.ok(times[0] >= 0 && times[0] <= durationMs - TAIL_RESERVE_MS, `in bounds at roll ${roll}`);
  }
});

// Defence in depth for the same invariant: even a reserve wider than the final
// window may not delete that window's capture, only pull it earlier.
test('a reserve wider than the final window still leaves a capture in it', () => {
  const durationMs = 5 * 60_000 + 10_000;  // a 10s tail window
  const times = computeCaptureTimes(durationMs, () => 0.999, 60_000);
  assert.equal(times.length, 2);
  assert.ok(times[1] >= 5 * 60_000 && times[1] < durationMs);
});

test('createScheduler recomputes each delay from the wall-clock anchor (survives a throttled tick)', async () => {
  const durationMs = 2 * FIVE_MIN_MS;   // two windows -> two captures
  const random = () => 0.5;             // midpoint of each usable window
  const [firstOffset, secondOffset] = computeCaptureTimes(durationMs, random);
  const delays = [];
  const timers = [];
  let fakeNow = 1000;

  const scheduler = createScheduler({
    durationMs,
    onCapture: () => {},
    now: () => fakeNow,
    random,
    setTimer: (fn, ms) => { delays.push(ms); timers.push(fn); return timers.length; },
    clearTimer: () => {},
  });

  scheduler.start();
  assert.equal(delays[0], firstOffset); // first delay = offset0 - 0 elapsed

  // The first timer fires late (the tab was throttled while backgrounded).
  fakeNow = 1000 + 200_000;
  timers[0]();
  await new Promise((resolve) => setTimeout(resolve, 0)); // let the scheduleNext microtask run

  // The next delay is re-derived from elapsed (200000), NOT a fixed inter-offset gap,
  // so the cadence catches up instead of drifting.
  assert.equal(delays[1], secondOffset - 200_000);
});

// A grabFrame/analyzeFrame rejection used to escape through the scheduler as an
// unhandled rejection and silently end monitoring for the rest of the session.
test('a rejecting capture neither escapes nor stops the cadence', async () => {
  const timers = [];
  let attempts = 0;

  const scheduler = createScheduler({
    durationMs: 2 * FIVE_MIN_MS,
    onCapture: () => { attempts += 1; return Promise.reject(new Error('frame grab failed')); },
    now: () => 0,
    random: () => 0.5,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
  });

  scheduler.start();
  timers[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 1);
  assert.equal(timers.length, 2, 'the next window was still scheduled');

  timers[1]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 2);
});

test('a capture that throws synchronously is contained the same way', async () => {
  const timers = [];
  const scheduler = createScheduler({
    durationMs: 2 * FIVE_MIN_MS,
    onCapture: () => { throw new Error('detector gone'); },
    now: () => 0,
    random: () => 0.5,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
  });

  scheduler.start();
  assert.doesNotThrow(() => timers[0]());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(timers.length, 2);
});

// Monitoring only begins once the model is loaded, but the countdown anchored
// back when consent resolved. Scheduling over the session's FULL length from
// that later anchor overhangs the countdown by the whole load time — and on a
// 5-minute session, which gets exactly one window, that can push the only
// capture past zero and leave an honest user uncredited. The guard therefore
// schedules over the countdown's REMAINING time, which is what this pins.
test('a scheduler that starts late still fires every capture before the countdown ends', () => {
  const totalMs = 5 * 60_000;
  const modelLoadMs = 45_000;
  const remainingMs = totalMs - modelLoadMs;

  for (const roll of [0, 0.5, 0.999999]) {
    const times = computeCaptureTimes(remainingMs, () => roll);
    assert.equal(times.length, 1, `still exactly one capture at roll ${roll}`);
    // Offsets are relative to the scheduler's own anchor, so convert to
    // countdown time before judging whether the verdict can get home in time.
    const firesAt = modelLoadMs + times[0];
    assert.ok(
      firesAt <= totalMs - TAIL_RESERVE_MS,
      `fires at ${firesAt}ms, must clear the reserve before ${totalMs}ms (roll ${roll})`,
    );
  }

  // The regression this guards against: planning over the full duration puts the
  // late end of the draw beyond the countdown entirely.
  const naive = computeCaptureTimes(totalMs, () => 0.999999);
  assert.ok(
    modelLoadMs + naive[0] > totalMs,
    'scheduling over the full duration would overshoot — the test must be able to fail',
  );
});
