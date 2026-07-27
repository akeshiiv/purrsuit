import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initState, transition, shouldComplete } from '../focusGuard/machine.js';
import { createScheduler } from '../focusGuard/scheduler.js';
import { createCaptureController } from '../focusGuard/capture.js';
import { selectEngine } from '../focusGuard/selectEngine.js';
import { createDetector } from '../focusGuard/createDetector.js';
import { studyService } from '../services/index.js';

// Orchestrates consent -> warmup -> scheduled capture -> verdict over the pure
// machine. Everything here is side effects; the decision logic is in machine.js.
export function useFocusGuard({ enabled, durationMinutes }) {
  const [state, setState] = useState(initState);
  const refs = useRef({ capture: null, detector: null, scheduler: null });
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
    refs.current.scheduler?.stop();
    refs.current.capture?.stop();
    refs.current.detector?.dispose();
  }, []);

  // Tear down the stream, worker, and scheduler on unmount — cancel, back
  // navigation, or leaving the page any other way than countdown/terminate —
  // so the screen-share never keeps capturing after the user has left.
  useEffect(() => cleanup, [cleanup]);

  const runCapture = useCallback(async () => {
    const { capture, detector } = refs.current;
    if (!capture || !detector) return;
    let bitmap = null;
    try {
      bitmap = await capture.grabFrame();
      const verdict = await detector.analyzeFrame(bitmap);
      if (!verdict) return;
      const next = dispatch({ type: 'FRAME_ANALYZED', verdict });
      if (next.status === 'terminated') {
        cleanup();
        studyServiceTerminate(durationMinutes, next.verdict);
      }
    } finally {
      bitmap?.close?.();
    }
  }, [dispatch, cleanup, durationMinutes]);

  const consent = useCallback(async () => {
    try {
      const capture = createCaptureController();
      capture.onEnded(() => { dispatch({ type: 'STREAM_ENDED' }); cleanup(); });
      await capture.start();
      refs.current.capture = capture;
      dispatch({ type: 'CONSENT_GRANTED' });

      const resolved = await selectEngine();
      if (resolved.engine === 'none') { dispatch({ type: 'ENGINE_NONE' }); return; }
      const detector = createDetector(resolved);
      refs.current.detector = detector;
      await detector.ready;
      dispatch({ type: 'MODEL_READY' });

      const scheduler = createScheduler({
        durationMs: durationMinutes * 60_000,
        onCapture: runCapture,
      });
      refs.current.scheduler = scheduler;
      scheduler.start();
    } catch {
      // Failure before consent (share denied) leaves status at awaiting-consent;
      // failure after (engine/model init threw or the worker rejected `ready`)
      // leaves it at warming, where only ENGINE_FAILED can move the machine.
      // Both run the session uncredited; cleanup stops any live share/worker.
      dispatch(stateRef.current.status === 'warming'
        ? { type: 'ENGINE_FAILED' }
        : { type: 'CONSENT_DENIED' });
      cleanup();
    }
  }, [dispatch, cleanup, durationMinutes, runCapture]);

  const onCountdownZero = useCallback(() => {
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
  }), [state, enabled, consent, onCountdownZero]);
}

// Fire-and-forget termination log (never blocks UX; failure is non-fatal).
function studyServiceTerminate(durationMinutes, verdict) {
  studyService.terminate({
    durationMinutes,
    reason: verdict.reason,
    summary: verdict.summary,
    justification: verdict.justification,
  }).catch(() => {});
}
