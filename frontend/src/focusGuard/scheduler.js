export const FIVE_MIN_MS = 300_000;

// One capture per rolling 5-min window, at a uniform-random offset inside each
// window. The final window may be shorter than 5 min; it still gets one capture.
export function computeCaptureTimes(durationMs, random = Math.random) {
  const times = [];
  for (let start = 0; start < durationMs; start += FIVE_MIN_MS) {
    const end = Math.min(start + FIVE_MIN_MS, durationMs);
    const span = end - start;
    if (span <= 0) break;
    times.push(start + random() * span);
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
      Promise.resolve(onCapture()).finally(scheduleNext);
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
