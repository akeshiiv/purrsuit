export const FIVE_MIN_MS = 300_000;

// How much of the session tail is kept clear of captures. A verdict that only
// lands after the countdown has already hit zero is no evidence at all, so the
// last capture has to be fired early enough for its inference to come back —
// on-device VLM inference was measured in single-digit seconds.
export const TAIL_RESERVE_MS = 20_000;

// One capture per rolling 5-min window, at a uniform-random offset inside each
// window. The final window may be shorter than 5 min; it still gets one capture.
export function computeCaptureTimes(durationMs, random = Math.random, reserveMs = TAIL_RESERVE_MS) {
  const times = [];
  for (let start = 0; start < durationMs; start += FIVE_MIN_MS) {
    const windowEnd = Math.min(start + FIVE_MIN_MS, durationMs);
    const span = windowEnd - start;
    if (span <= 0) break;
    // The reserve may never eat more than half of a window. A 5-minute session
    // has exactly one window, and dropping (or crushing) its only capture would
    // leave every short monitored session uncredited — the honest-user failure
    // the reserve exists to prevent in the first place.
    const cap = Math.max(durationMs - reserveMs, start + span / 2);
    const end = Math.min(windowEnd, cap);
    times.push(start + random() * (end - start));
  }
  return times;
}

// Fires onCapture at each computed offset, measuring elapsed time against a
// wall-clock anchor so background-tab timer throttling can't drift the cadence:
// each tick re-derives the delay from (targetOffset - elapsedSoFar).
export function createScheduler({
  durationMs,
  onCapture,
  now = () => Date.now(),
  random = Math.random,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
}) {
  const offsets = computeCaptureTimes(durationMs, random);
  let idx = 0;
  let anchor = 0;
  let handle = null;
  let stopped = false;

  function scheduleNext() {
    if (stopped || idx >= offsets.length) return;
    const elapsed = now() - anchor;
    const delay = Math.max(0, offsets[idx] - elapsed);
    handle = setTimer(() => {
      if (stopped) return;
      idx += 1;
      // One bad frame must never kill the cadence, and must never escape as an
      // unhandled rejection: swallow whatever onCapture throws (sync or async)
      // and move on to the next window.
      Promise.resolve().then(onCapture).catch(() => {}).then(scheduleNext);
    }, delay);
  }

  return {
    start() {
      anchor = now();
      scheduleNext();
    },
    stop() {
      stopped = true;
      if (handle != null) clearTimer(handle);
    },
  };
}
