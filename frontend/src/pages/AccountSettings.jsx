import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { profileService, realmService } from '../services/index.js';

const EMPTY_FORM = { name: '', avatarUrl: '', colour: '#3b82f6' };

export default function AccountSettings() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);

  const loadRealm = useCallback(async () => {
    const data = await realmService.getCurrent();
    setGame(data.realm ? data : null);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [loadedProfile, current] = await Promise.all([
          profileService.get(),
          realmService.getCurrent(),
        ]);
        if (!active) return;
        setProfile(loadedProfile);
        setForm({
          name: loadedProfile.name ?? '',
          avatarUrl: loadedProfile.avatarUrl ?? '',
          colour: loadedProfile.colour ?? '#3b82f6',
        });
        setGame(current.realm ? current : null);
      } catch (caught) {
        if (active) setError(caught.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const updated = await profileService.update(form);
      setProfile(updated);
      setMessage('Saved');
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  async function runConfirm() {
    const action = confirm;
    setConfirm(null);
    setError('');
    setMessage('');
    try {
      await action.run();
    } catch (caught) {
      setError(caught.message);
    }
  }

  function askLeave() {
    setConfirm({
      title: 'Leave realm?',
      message: 'You will forfeit every cell you hold this season. This cannot be undone.',
      confirmLabel: 'Leave realm',
      run: async () => {
        await realmService.leave();
        navigate('/realms');
      },
    });
  }

  function askEndSeason() {
    setConfirm({
      title: 'End the season now?',
      message: 'The current leader is crowned and a fresh season starts for everyone.',
      confirmLabel: 'End season',
      run: async () => {
        await realmService.endSeason(game.realm.id);
        await loadRealm();
      },
    });
  }

  function askKick(member) {
    setConfirm({
      title: `Kick ${member.name}?`,
      message: 'Their territory is released back to neutral.',
      confirmLabel: 'Kick player',
      run: async () => {
        await realmService.kick(game.realm.id, member.userId);
        await loadRealm();
      },
    });
  }

  async function toggleAntiCheat(next) {
    setError('');
    setMessage('');
    try {
      await realmService.updateSettings(game.realm.id, { antiCheat: next });
      await loadRealm();
    } catch (caught) {
      setError(caught.message);
    }
  }

  if (loading) {
    return <div className="p-6">Loading account...</div>;
  }

  const realm = game?.realm ?? null;
  const isAdmin = game?.me?.role === 'admin';

  return (
    <div className="space-y-4">
      <Card className="max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">Account</h1>
        {profile?.email && (
          <p className="text-sm text-slate-600">{profile.email}</p>
        )}
        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm">
            Name
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              maxLength="32"
              onChange={event => setForm({ ...form, name: event.target.value })}
              value={form.name}
            />
          </label>
          <label className="block text-sm">
            Avatar URL
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              onChange={event => setForm({ ...form, avatarUrl: event.target.value })}
              value={form.avatarUrl}
            />
          </label>
          <label className="block text-sm">
            Colour
            <input
              className="mt-1 h-10 w-20 rounded border"
              onChange={event => setForm({ ...form, colour: event.target.value })}
              type="color"
              value={form.colour}
            />
          </label>
          <Button disabled={saving} type="submit">
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </Card>

      {realm ? (
        <Card className="max-w-lg space-y-4">
          <h2 className="text-xl font-semibold">Realm</h2>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-600">Name</dt>
            <dd>{realm.name}</dd>
            <dt className="text-slate-600">Join code</dt>
            <dd className="font-mono">{realm.joinCode}</dd>
            <dt className="text-slate-600">Your role</dt>
            <dd>{game.me.role}</dd>
            <dt className="text-slate-600">Players</dt>
            <dd>{game.members.length} / {realm.maxPlayers}</dd>
          </dl>

          <label className="flex items-center gap-2 text-sm">
            <input
              checked={Boolean(realm.antiCheatEnabled)}
              disabled={!isAdmin}
              onChange={event => toggleAntiCheat(event.target.checked)}
              type="checkbox"
            />
            Anti-cheat {isAdmin ? '' : '(admin only)'}
          </label>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Members</h3>
            <ul className="space-y-1 text-sm">
              {game.members.map(member => (
                <li key={member.userId} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: member.colour }}
                  />
                  <span>{member.name}</span>
                  {member.role === 'admin' && (
                    <span className="text-xs text-slate-500">admin</span>
                  )}
                  {isAdmin && member.userId !== game.me.userId && (
                    <Button
                      className="ml-auto"
                      variant="secondary"
                      onClick={() => askKick(member)}
                    >
                      Kick
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-3">
            {isAdmin && (
              <Button variant="danger" onClick={askEndSeason}>End season</Button>
            )}
            <Button variant="danger" onClick={askLeave}>Leave realm</Button>
          </div>
        </Card>
      ) : (
        <Card className="max-w-lg space-y-2">
          <h2 className="text-xl font-semibold">Realm</h2>
          <p className="text-sm text-slate-600">You are not in a realm.</p>
          <Button onClick={() => navigate('/realms')}>Find a realm</Button>
        </Card>
      )}

      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
    </div>
  );
}
