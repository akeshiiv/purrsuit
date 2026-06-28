import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { realmService } from '../services/index.js';

export default function RealmSelect() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    let active = true;
    realmService.getCurrent()
      .then(data => { if (active) setCurrent(data); })
      .catch(caught => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function handleLeave() {
    setConfirmLeave(false);
    setError('');
    try {
      await realmService.leave();
      setCurrent({ realm: null });
    } catch (caught) {
      setError(caught.message);
    }
  }

  if (loading) {
    return <div className="p-6">Loading realms...</div>;
  }

  return (
    <Card className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Realms</h1>
      {current?.realm ? (
        <div className="space-y-3">
          <p>
            You are in <span className="font-medium">{current.realm.name}</span>
            {' '}({current.realm.joinCode}).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/realm')}>Enter realm</Button>
            <Button variant="secondary" onClick={() => setConfirmLeave(true)}>Leave realm</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Create your own realm or join one with a code.</p>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded border border-blue-700 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700" to="/realms/create">
              Create realm
            </Link>
            <Link className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100" to="/realms/join">
              Join realm
            </Link>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave realm?"
        message="You will forfeit every cell you hold this season. This cannot be undone."
        confirmLabel="Leave realm"
        onClose={() => setConfirmLeave(false)}
        onConfirm={handleLeave}
      />
    </Card>
  );
}
