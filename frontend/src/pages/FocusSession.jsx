import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useGame } from '../components/GameContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { studyService } from '../services/index.js';

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function FocusSession() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useGame();
  const duration = location.state?.duration ?? 25;
  const [remaining, setRemaining] = useState(duration * 60);
  const [running, setRunning] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState('');
  const completedRef = useRef(false);

  const finishSession = useCallback(async () => {
    if (completedRef.current) return;

    completedRef.current = true;
    setCompleted(true);
    setRunning(false);
    try {
      const result = await studyService.complete({ durationMinutes: duration });
      await refresh();
      setMessage(`Coins: ${result.coins}`);
    } catch (caught) {
      setMessage(caught.message);
    }
  }, [duration, refresh]);

  useEffect(() => {
    if (!running) return undefined;
    const intervalId = window.setInterval(() => {
      setRemaining(value => {
        const next = Math.max(0, value - 1);
        if (next === 0) window.setTimeout(finishSession, 0);
        return next;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [finishSession, running]);

  return (
    <Card className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Focus</h1>
      <p className="font-mono text-5xl">{formatTime(remaining)}</p>
      {message && <p className="text-sm">{message}</p>}
      <div className="flex gap-2">
        <Button onClick={() => setRemaining(0)}>Finish</Button>
        <Button
          disabled={completed}
          onClick={() => setDialogOpen(true)}
          variant="secondary"
        >
          Cancel
        </Button>
      </div>
      <ConfirmDialog
        confirmLabel="Cancel focus"
        message="Cancel this focus session?"
        onClose={() => setDialogOpen(false)}
        onConfirm={() => navigate('/realm/study')}
        open={dialogOpen}
        secondConfirmLabel="Forfeit coins"
        secondMessage="You will not earn any coins."
        secondTitle="Forfeit reward"
        title="Cancel focus"
      />
    </Card>
  );
}
