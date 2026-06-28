import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useGame } from '../components/GameContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import CircularSlider from '../components/ui/CircularSlider.jsx';

const PRESETS = [25, 50, 60];

export default function StudySetup() {
  const navigate = useNavigate();
  const { me } = useGame();
  const [duration, setDuration] = useState(25);

  const canStudy = me.actions?.canStudy ?? true;
  const reward = duration * 4;

  return (
    <Card className="mx-auto max-w-lg space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Study</h1>
        <p className="text-sm text-slate-600">
          Pick a focus length. You earn 4 coins per minute studied.
        </p>
      </header>

      <div className="flex flex-col items-center gap-4">
        <CircularSlider max={120} min={5} onChange={setDuration} step={5} value={duration} />

        <div className="flex gap-2">
          {PRESETS.map(preset => (
            <Button
              key={preset}
              onClick={() => setDuration(preset)}
              variant={duration === preset ? 'primary' : 'secondary'}
            >
              {preset} min
            </Button>
          ))}
        </div>

        <p className="text-sm text-slate-700">
          Coins on completion: <span className="font-semibold">{reward}</span>
        </p>
      </div>

      {canStudy ? (
        <Button
          className="w-full"
          onClick={() => navigate('/realm/study/focus', { state: { duration } })}
        >
          Start focus
        </Button>
      ) : (
        <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>You have enough coins to shop. Buy units before studying again.</p>
          <Link className="inline-block font-medium underline" to="/realm/shop">
            Go to shop
          </Link>
        </div>
      )}
    </Card>
  );
}
