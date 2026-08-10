import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useGame } from '../components/GameContext.jsx';
import Button from '../components/ui/Button.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { useFocusGuard } from '../hooks/useFocusGuard.js';
import { studyService } from '../services/index.js';

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function FocusShell({ children }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-slate-950 px-4 text-center text-white">
      {children}
    </div>
  );
}

export default function FocusSession() {
  const location = useLocation();
  const navigate = useNavigate();
  const { realm, refresh } = useGame();
  const duration = location.state?.duration ?? null;
  const monitored = Boolean(realm?.antiCheatEnabled);

  // The server issues the session key when the countdown starts. The guard reads
  // it later — to burn the row when it kills a session — and nothing renders it,
  // so it lives in a ref rather than state.
  const sessionKeyRef = useRef(null);
  const getSessionKey = useCallback(() => sessionKeyRef.current, []);

  const totalSeconds = (duration ?? 25) * 60;
  const endTimeRef = useRef(null);

  // The countdown starts as soon as consent resolves, while the guard is still
  // loading its model. The guard schedules captures against whatever is left of
  // the countdown at that point, so it has to read this clock rather than assume
  // it owns a full session's worth of time. Null until the countdown anchors.
  const getRemainingMs = useCallback(
    () => (endTimeRef.current === null ? null : endTimeRef.current - Date.now()),
    [],
  );

  const guard = useFocusGuard({
    enabled: monitored,
    durationMinutes: duration,
    getSessionKey,
    getRemainingMs,
  });
  const startPromiseRef = useRef(null);

  const [remaining, setRemaining] = useState(totalSeconds);
  const [phase, setPhase] = useState('running');
  const [reward, setReward] = useState(null);
  const [startError, setStartError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const finishedRef = useRef(false);
  const guardAbort = guard.abort;
  const onCountdownZero = guard.onCountdownZero;

  // Open the session server-side at the exact moment the countdown begins and no
  // earlier: on a monitored realm that is only once consent is granted, and a
  // clock started while the user still sits on the share prompt would hand out
  // elapsed time nobody studied for.
  const beginServerSession = useCallback(() => {
    if (startPromiseRef.current) return startPromiseRef.current;
    startPromiseRef.current = studyService.start({ durationMinutes: duration })
      .then((started) => { sessionKeyRef.current = started.sessionKey; })
      .catch((caught) => {
        // Without a key there are no coins at the end. Say so now instead of
        // letting someone sit through a countdown that could never pay out.
        setStartError(caught.message);
        guardAbort();
      });
    return startPromiseRef.current;
  }, [duration, guardAbort]);

  const finishSession = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('done');
    // Stop the share and settle the credit decision first — it waits on any
    // verdict still in flight, and holding the capture open past that is exactly
    // what the user asked to end.
    const mayCredit = monitored ? await onCountdownZero() : true;
    // The key can still be in flight: the dev skip button, and a slow enough
    // network on a short session, both get here before /start has answered.
    await startPromiseRef.current;
    if (!mayCredit) { setReward({ uncredited: true }); return; }
    if (!sessionKeyRef.current) {
      setReward({ error: 'This session was never registered, so it can’t be credited.' });
      return;
    }
    try {
      const result = await studyService.complete({ sessionKey: sessionKeyRef.current });
      await refresh();
      setReward({ coins: result.coins, gained: duration * 4, questCompleted: result.questCompleted ?? null });
    } catch (caught) {
      setReward({ error: caught.message });
    }
  }, [duration, refresh, monitored, onCountdownZero]);

  useEffect(() => {
    // `duration` is null when this page is opened directly rather than from the
    // study picker; the render below redirects, but effects still run for that
    // commit and there is no session to open for a duration nobody chose.
    const countdownActive = duration != null && phase === 'running' && startError === null
      && (!monitored || (guard.status !== 'awaiting-consent' && guard.status !== 'terminated'));
    if (!countdownActive) return undefined;
    if (endTimeRef.current === null) {
      endTimeRef.current = Date.now() + totalSeconds * 1000;
      beginServerSession();
    }

    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setRemaining(secondsLeft);
      if (secondsLeft === 0) finishSession();
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [beginServerSession, finishSession, duration, phase, totalSeconds, monitored, guard.status, startError]);

  if (duration == null) {
    return <Navigate replace to="/realm/study" />;
  }

  if (startError !== null) {
    return (
      <FocusShell>
        <p className="text-xl font-semibold text-red-300">Couldn&rsquo;t start your session</p>
        <p className="text-sm text-slate-300">{startError}</p>
        <p className="text-xs text-slate-400">
          Nothing was recorded, so nothing was lost. Start the session again.
        </p>
        <Button onClick={() => navigate('/realm/study')}>Back to study</Button>
      </FocusShell>
    );
  }

  if (guard.status === 'terminated') {
    return (
      <FocusShell>
        <p className="text-2xl font-semibold text-red-300">Session ended — distraction detected</p>
        <p className="text-sm text-slate-300">{guard.verdict?.summary}</p>
        <p className="text-sm text-amber-200">{guard.verdict?.justification}</p>
        <p className="text-xs text-slate-400">No coins or study time were earned.</p>
        <Button onClick={() => navigate('/realm')}>Back to dashboard</Button>
      </FocusShell>
    );
  }

  if (monitored && guard.status === 'awaiting-consent') {
    return (
      <FocusShell>
        <p className="text-2xl font-semibold">Focus Guard is on — share your screen to earn</p>
        <p className="max-w-md text-sm text-slate-300">
          This realm checks your screen on-device for distractions. Share your screen to
          start your session; nothing leaves your device, and it&rsquo;s required to earn coins.
        </p>
        <Button onClick={guard.consent}>Share screen &amp; start</Button>
        <Button onClick={() => navigate('/realm')} variant="secondary">
          Cancel
        </Button>
      </FocusShell>
    );
  }

  if (phase === 'done') {
    return (
      <FocusShell>
        {reward === null ? (
          // Both the last verdict and the /complete round trip land here, so this
          // is a real wait, not a flash — never show a reward that isn't settled.
          <p className="text-2xl font-semibold">Wrapping up your session&hellip;</p>
        ) : reward.error ? (
          <>
            <p className="text-xl font-semibold text-red-300">Couldn&rsquo;t record your session</p>
            <p className="text-sm text-slate-300">{reward.error}</p>
          </>
        ) : reward.uncredited ? (
          <>
            <p className="text-2xl font-semibold text-amber-300">Session complete</p>
            <p className="text-sm text-slate-300">
              No coins were earned — Focus Guard couldn&rsquo;t verify this session.
            </p>
          </>
        ) : (
          <>
            <p className="text-2xl font-semibold text-emerald-300">Session complete!</p>
            <p className="text-xl">+{reward?.gained} coins</p>
            <p className="text-sm text-slate-300">Balance: {reward?.coins} coins</p>
            {reward?.questCompleted && (
              <p className="text-lg font-semibold text-amber-300">
                Quest complete! +{reward.questCompleted.reward} coins · {reward.questCompleted.title}
              </p>
            )}
          </>
        )}
        <Button onClick={() => navigate('/realm')}>Back to dashboard</Button>
      </FocusShell>
    );
  }

  return (
    <FocusShell>
      <p className="font-mono text-7xl tabular-nums">{formatTime(remaining)}</p>
      <p className="text-sm text-slate-300">until you earn {duration * 4} coins</p>
      <Button onClick={() => setDialogOpen(true)} variant="secondary">
        Cancel
      </Button>
      {import.meta.env.DEV && (
        <button
          className="text-xs text-slate-500 underline"
          onClick={finishSession}
          type="button"
        >
          dev: skip to end
        </button>
      )}
      <ConfirmDialog
        confirmLabel="Cancel focus"
        message="Cancel this focus session?"
        onClose={() => setDialogOpen(false)}
        onConfirm={() => navigate('/realm')}
        open={dialogOpen}
        secondConfirmLabel="Forfeit coins"
        secondMessage="You will not earn any coins for this session."
        secondTitle="Forfeit reward"
        title="Cancel focus"
      />
    </FocusShell>
  );
}
