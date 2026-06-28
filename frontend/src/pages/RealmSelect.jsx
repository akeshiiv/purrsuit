import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { realmService } from '../services/index.js';

export default function RealmSelect() {
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    realmService.getCurrent()
      .then(setCurrent)
      .catch(caught => setError(caught.message));
  }, []);

  async function handleLeave() {
    setError('');
    try {
      await realmService.leave();
      setCurrent({ realm: null });
    } catch (caught) {
      setError(caught.message);
    }
  }

  return (
    <Card className="space-y-4">
      <h1 className="text-2xl font-semibold">Realms</h1>
      {current?.realm ? (
        <div className="space-y-2">
          <p>{current.realm.name} ({current.realm.joinCode})</p>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded border px-3 py-2 text-sm" to="/realm">Enter realm</Link>
            <Button variant="secondary" onClick={handleLeave}>Leave realm</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link className="rounded border px-3 py-2 text-sm" to="/realms/create">Create realm</Link>
          <Link className="rounded border px-3 py-2 text-sm" to="/realms/join">Join realm</Link>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </Card>
  );
}
