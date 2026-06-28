import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useGame } from '../components/GameContext.jsx';
import Button from '../components/ui/Button.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
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
  const { refresh } = useGame();
  const duration = location.state?.duration ?? null;

  const totalSeconds = (duration ?? 25) * 60;
  const endTimeRef = useRef(null);

  const [remaining, setRemaining] = useState(totalSeconds);
  const [phase, setPhase] = useState('running');
  const [reward, setReward] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const finishedRef = useRef(false);

  const finishSession = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('done');
    try {
      const result = await studyService.complete({ durationMinutes: duration });
      await refresh();
      setReward({ coins: result.coins, gained: duration * 4 });
    } catch (caught) {
      setReward({ error: caught.message });
    }
  }, [duration, refresh]);

  useEffect(() => {
    if (phase !== 'running') return undefined;
    if (endTimeRef.current === null) {
      endTimeRef.current = Date.now() + totalSeconds * 1000;
    }

    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setRemaining(secondsLeft);
      if (secondsLeft === 0) finishSession();
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [finishSession, phase, totalSeconds]);

  if (duration == null) {
    return <Navigate replace to="/realm/study" />;
  }

  if (phase === 'done') {
    return (
      <FocusShell>
        {reward?.error ? (
          <>
            <p className="text-xl font-semibold text-red-300">Couldn&rsquo;t record your session</p>
            <p className="text-sm text-slate-300">{reward.error}</p>
          </>
        ) : (
          <>
            <p className="text-2xl font-semibold text-emerald-300">Session complete</p>
            <p className="text-xl">+{reward?.gained} coins</p>
            <p className="text-sm text-slate-300">Balance: {reward?.coins} coins</p>
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
