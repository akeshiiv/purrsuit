import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initState, transition, shouldComplete } from '../brainrotDoctor/machine.js';
import { createScheduler } from '../brainrotDoctor/scheduler.js';
import { createCaptureController } from '../brainrotDoctor/capture.js';
import { selectEngine } from '../brainrotDoctor/selectEngine.js';
import { createDetector } from '../brainrotDoctor/createDetector.js';
import { studyService } from '../services/index.js';

// Ceiling on how long the credit decision waits for a capture that is still
// being analysed when the countdown hits zero. The scheduler's tail reserve is
// what normally gets the last verdict home in time; this only covers a device
// slower than the reserve assumes, and it is bounded so the reward screen can
// never hang on a model that has wedged.
const FINAL_ANALYSIS_GRACE_MS = 15_000;

const noSessionKey = () => null;
const noRemaining = () => null;

// Orchestrates consent -> warmup -> scheduled capture -> verdict over the pure
// machine. Everything here is side effects; the decision logic is in machine.js.
export function useBrainrotDoctor({
  enabled,
  durationMinutes,
  getSessionKey = noSessionKey,
  getRemainingMs = noRemaining,
}) {
  const [state, setState] = useState(initState);
  const refs = useRef({ capture: null, detector: null, scheduler: null, inFlight: null, disposed: false });
  // stateRef holds the authoritative latest state for imperative reads: dispatch
  // derives the next state from it and returns it synchronously, so callers (the
  // credit decision, the terminate side-effect) never observe a stale React
  // snapshot. setState only drives the re-render.
  const stateRef = useRef(state);

  const dispatch = useCallback((event) => {
    const next = transition(stateRef.current, event);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const cleanup = useCallback(() => {
    // `disposed` is this hook's abort signal, and every await below re-checks it.
    // Without it a continuation that was already in flight when the user left
    // would happily wire a fresh screen-share and model worker into a component
    // that is gone, and nothing would ever stop them again.
    refs.current.disposed = true;
    refs.current.scheduler?.stop();
    refs.current.capture?.stop();
    refs.current.detector?.dispose();
    refs.current.scheduler = null;
    refs.current.capture = null;
    refs.current.detector = null;
  }, []);

  // Tear down the stream, worker, and scheduler on unmount — cancel, back
  // navigation, or leaving the page any other way than countdown/terminate —
  // so the screen-share never keeps capturing after the user has left.
  useEffect(() => {
    // Re-arm on every mount: StrictMode's development double-invoke mounts,
    // unmounts, and mounts again, and a disposed flag left set from that first
    // teardown would silently refuse to ever start monitoring.
    refs.current.disposed = false;
    return cleanup;
  }, [cleanup]);

  const runCapture = useCallback(async () => {
    const { capture, detector } = refs.current;
    if (!capture || !detector || refs.current.disposed) return;
    let bitmap = null;
    try {
      bitmap = await capture.grabFrame();
      if (refs.current.disposed) return;
      const verdict = await detector.analyzeFrame(bitmap);
      if (refs.current.disposed || !verdict) return;
      const next = dispatch({ type: 'FRAME_ANALYZED', verdict });
      if (next.status === 'terminated') {
        cleanup();
        studyServiceTerminate(durationMinutes, getSessionKey(), next.verdict);
      }
    } catch (caught) {
      // A frame that fails to grab or analyse is a missing sample and nothing
      // more. Swallowing it keeps one hiccup from ending monitoring for the rest
      // of the session, and keeps it from escaping the scheduler unhandled.
      console.warn('[brainrot-doctor] capture failed:', caught?.message ?? caught);
    } finally {
      bitmap?.close?.();
    }
  }, [dispatch, cleanup, durationMinutes, getSessionKey]);

  // Keeps the capture currently in flight reachable, so the countdown can wait
  // for a verdict that is nearly home instead of judging credit without it.
  const trackCapture = useCallback(() => {
    const running = runCapture();
    refs.current.inFlight = running;
    return running;
  }, [runCapture]);

  const consent = useCallback(async () => {
    try {
      const capture = createCaptureController();
      capture.onEnded(() => { dispatch({ type: 'STREAM_ENDED' }); cleanup(); });
      await capture.start();
      // Each await here can resolve long after the user has navigated away — the
      // share prompt and the model download are both open-ended. Publishing to
      // refs first and then re-checking the abort flag lets the one cleanup path
      // own the teardown, however far the setup happened to get.
      refs.current.capture = capture;
      if (refs.current.disposed) { cleanup(); return; }
      dispatch({ type: 'CONSENT_GRANTED' });

      const resolved = await selectEngine();
      if (refs.current.disposed) { cleanup(); return; }
      if (resolved.engine === 'none') { dispatch({ type: 'ENGINE_NONE' }); return; }

      const detector = createDetector(resolved);
      refs.current.detector = detector;
      await detector.ready;
      if (refs.current.disposed) { cleanup(); return; }
      dispatch({ type: 'MODEL_READY' });

      // Schedule over the time the countdown has LEFT, not the session's full
      // length. The countdown anchors the moment consent resolves, but this line
      // is only reached after the model has loaded — tens of seconds on a cold
      // cache, given the size of the runtime being fetched. Planning over the
      // full duration from this later anchor overhangs the countdown by exactly
      // that gap, and on a 5-minute session, which gets a single window, it can
      // push the only capture past zero: no frames analysed, no credit, for a
      // user who did nothing wrong.
      const remainingMs = getRemainingMs() ?? durationMinutes * 60_000;
      const scheduler = createScheduler({
        durationMs: remainingMs,
        onCapture: trackCapture,
      });
      refs.current.scheduler = scheduler;
      if (refs.current.disposed) { cleanup(); return; }
      scheduler.start();
    } catch {
      // Aborting mid-warmup rejects `ready` on purpose; that is a teardown, not
      // a failure to report to a machine nobody is rendering any more.
      if (refs.current.disposed) { cleanup(); return; }
      // Failure before consent (share denied) leaves status at awaiting-consent;
      // failure after (engine/model init threw or the worker rejected `ready`)
      // leaves it at warming, where only ENGINE_FAILED can move the machine.
      // Both run the session uncredited; cleanup stops any live share/worker.
      dispatch(stateRef.current.status === 'warming'
        ? { type: 'ENGINE_FAILED' }
        : { type: 'CONSENT_DENIED' });
      cleanup();
    }
  }, [dispatch, cleanup, durationMinutes, trackCapture, getRemainingMs]);

  const onCountdownZero = useCallback(async () => {
    // Order is load-bearing. A capture fired near the end of the session may
    // still be running, and on a short session it is the only evidence there is;
    // deciding credit without it fails an honest user. It has to be awaited
    // before cleanup, which terminates the very worker that owes us the verdict,
    // and before the transition, which is what reads framesAnalyzed.
    await awaitFinalAnalysis(refs.current.inFlight);
    const next = dispatch({ type: 'COUNTDOWN_ZERO' });
    cleanup();
    return shouldComplete(next);
  }, [dispatch, cleanup]);

  return useMemo(() => ({
    status: state.status,
    guardState: state,
    verdict: state.verdict,
    enabled,
    consent,
    onCountdownZero,
    abort: cleanup,
  }), [state, enabled, consent, onCountdownZero, cleanup]);
}

function awaitFinalAnalysis(inFlight) {
  if (!inFlight) return Promise.resolve();
  return new Promise((resolve) => {
    const settle = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(resolve, FINAL_ANALYSIS_GRACE_MS);
    inFlight.then(settle, settle);
  });
}

// Fire-and-forget termination log (never blocks UX; failure is non-fatal). The
// session key goes along so the server can burn the row in the same breath — a
// session BrainrotDoctor killed must never be completable afterwards.
function studyServiceTerminate(durationMinutes, sessionKey, verdict) {
  studyService.terminate({
    durationMinutes,
    ...(sessionKey ? { sessionKey } : {}),
    reason: verdict.reason,
    summary: verdict.summary,
    justification: verdict.justification,
  }).catch(() => {});
}
