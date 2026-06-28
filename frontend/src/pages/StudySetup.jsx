import { useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import CircularSlider from '../components/ui/CircularSlider.jsx';

export default function StudySetup() {
  const navigate = useNavigate();
  const [duration, setDuration] = useState(25);

  return (
    <Card className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Study</h1>
      <CircularSlider
        max={120}
        min={5}
        onChange={setDuration}
        step={5}
        value={duration}
      />
      <p className="text-sm">Coins on completion: {duration * 4}</p>
      <Button onClick={() => navigate('/realm/study/focus', { state: { duration } })}>
        Start focus
      </Button>
    </Card>
  );
}
