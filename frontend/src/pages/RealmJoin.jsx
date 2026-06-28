import { useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { realmService } from '../services/index.js';

export default function RealmJoin() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await realmService.join({ joinCode });
      navigate('/realm');
    } catch (caught) {
      setError(caught.message);
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Join realm</h1>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm">
          Join code
          <input
            autoFocus
            className="mt-1 w-full rounded border px-3 py-2 font-mono uppercase tracking-widest"
            maxLength="6"
            onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ABC123"
            value={joinCode}
          />
        </label>
        <Button disabled={submitting || joinCode.length !== 6} type="submit">
          {submitting ? 'Joining...' : 'Join'}
        </Button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </Card>
  );
}
