import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import Screen from '../components/layout/Screen.jsx';
import ColourPicker from '../components/settings/ColourPicker.jsx';
import BrainrotDoctorPanel from '../components/settings/BrainrotDoctorPanel.jsx';
import PlayerAvatar from '../components/settings/PlayerAvatar.jsx';
import { profileService, realmService } from '../services/index.js';

const EMPTY_FORM = { name: '', avatarUrl: '', colour: '#3b82f6' };
const LABEL = 'p-label text-[11px] tracking-[.09em]';

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
      message: 'You will forfeit all territories and cats PERMANENTLY. Do you really want to go? :(',
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
      message: 'Immediately crown the winner, and everyone starts over in a new season.',
      confirmLabel: 'End season',
      run: async () => {
        await realmService.endSeason(game.realm.id);
        // Reloading here is what makes SeasonEndGate pop the end screen on this
        // very page, rather than the admin having to navigate somewhere else.
        await loadRealm();
      },
    });
  }

  function askKick(member) {
    setConfirm({
      title: `Kick ${member.name}? This cannot be undone!!!`,
      message: 'Their territory becomes neutral land.',
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
    return (
      <Screen tabs={false}>
        <p className="mt-16 text-center font-display text-[19px] font-extrabold text-ink-muted">
          Loading account…
        </p>
      </Screen>
    );
  }

  const realm = game?.realm ?? null;
  const isAdmin = game?.me?.role === 'admin';
  const members = game?.members ?? [];

  const accountPill = (
    <div className="flex items-center gap-[10px] rounded-full border-3 border-gold-edge bg-gold py-[6px] pr-4 pl-[6px] shadow-[0_3px_0_var(--color-gold-shadow)]">
      <PlayerAvatar
        colour="#C08D45"
        seed={profile?.id}
        size={30}
        src={form.avatarUrl}
        well="#FFF8EA"
      />
      <span className="font-display text-[15px] font-extrabold text-ink-body">Account</span>
    </div>
  );

  return (
    // The tab bar points into /realm/*, so it only makes sense once the player
    // has a realm — this route is reachable without one.
    <Screen right={accountPill} tabs={Boolean(realm)}>
      <div className="mx-auto flex max-w-[1372px] justify-center gap-[26px]">
        <Card
          as="form"
          className="w-[440px] self-start rounded-panel px-7 py-[26px] shadow-[0_10px_0_var(--color-warm-deep)]"
          onSubmit={handleSubmit}
          variant="hero"
        >
          <p className="font-display text-[26px] font-extrabold text-ink">Account</p>
          <p className="mt-1 mb-5 text-[13px] font-bold text-ink-muted">{profile?.email}</p>

          <label className="block" htmlFor="account-name">
            <span className={LABEL}>Name</span>
          </label>
          <input
            className="p-input mt-[6px] font-display text-[17px] font-bold text-ink"
            id="account-name"
            maxLength="32"
            onChange={event => setForm({ ...form, name: event.target.value })}
            value={form.name}
          />

          <label className="mt-4 block" htmlFor="account-avatar">
            <span className={LABEL}>Avatar</span>
          </label>
          <div className="mt-[6px] flex items-center gap-3">
            <PlayerAvatar
              border={3}
              colour={form.colour}
              seed={profile?.id}
              size={56}
              src={form.avatarUrl}
              well="#FFF8EA"
            />
            <input
              className="p-input min-w-0 flex-1 px-[14px] py-3 text-[12.5px] font-bold"
              id="account-avatar"
              onChange={event => setForm({ ...form, avatarUrl: event.target.value })}
              placeholder="Paste an image URL…"
              value={form.avatarUrl}
            />
          </div>

          <p className={`mt-4 mb-[6px] ${LABEL}`}>Territory colour</p>
          <ColourPicker onChange={colour => setForm({ ...form, colour })} value={form.colour} />

          <Button className="mt-[22px]" disabled={saving} full size="lg" type="submit" variant="gold">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </Card>

        {realm ? (
          <div className="flex w-[480px] flex-col gap-[18px]">
            <Card className="rounded-panel border-4 px-[26px] py-6" variant="panel">
              <div className="flex items-baseline justify-between">
                <p className="font-display text-[24px] font-extrabold text-ink">{realm.name}</p>
                <span className="p-chip border-edge-soft bg-[#F1E4CB] px-3 py-[5px] font-display text-[14px] tracking-[.14em] text-[#8A6234]">
                  {realm.joinCode}
                </span>
              </div>
              {/* `seasonNumber` is the realm's own 1-based counter, which is
                  what "season 12" means here; `id` is a global row id that only
                  looked right while a single realm existed, so it stays as the
                  fallback for a backend that predates the field. */}
              <p className="mt-[5px] text-[12.5px] font-bold text-ink-muted">
                {isAdmin ? "You're the admin" : "You're a member"} · {members.length} of{' '}
                {realm.maxPlayers} players
                {game.season ? ` · season ${game.season.seasonNumber ?? game.season.id}` : ''}
              </p>

              <BrainrotDoctorPanel
                canEdit={isAdmin}
                enabled={Boolean(realm.antiCheatEnabled)}
                onToggle={toggleAntiCheat}
              />

              <p className={`mt-[18px] mb-2 ${LABEL}`}>Members</p>
              <ul className="flex flex-col gap-2">
                {members.map(member => (
                  <li
                    className="flex items-center gap-[11px] rounded-2xl border-2 border-edge-soft bg-sunk px-3 py-[9px]"
                    key={member.userId}
                  >
                    <PlayerAvatar colour={member.colour} seed={member.userId} size={34} />
                    <span className="font-display text-[16px] font-extrabold text-ink">{member.name}</span>
                    {member.role === 'admin' && (
                      <span className="rounded-full border-2 border-[#C08D45] bg-gold px-[9px] py-[3px] text-[10px] font-extrabold text-ink-body">
                        admin
                      </span>
                    )}
                    {isAdmin && member.userId !== game.me.userId && (
                      <Button
                        className="ml-auto"
                        onClick={() => askKick(member)}
                        size="sm"
                        style={{
                          padding: '6px 14px',
                          fontSize: 13,
                          borderWidth: 2,
                          background: 'var(--color-surface)',
                          color: '#8A6234',
                          boxShadow: 'none',
                        }}
                        variant="plain"
                      >
                        Kick
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>

            <section className="p-danger rounded-card px-[22px] py-5 shadow-[0_6px_0_#F0D3CB]">
              <p className="font-display text-[18px] font-extrabold text-danger-ink">Careful zone</p>
              <p className="mt-[5px] mb-[14px] text-[12.5px] font-bold text-pretty text-[#B4695A]">
                Ending the season crowns a winner immediately and resets the map. Leaving forfeits every cell
                and cat you hold.
              </p>
              <div className="flex gap-[10px]">
                {isAdmin && (
                  <Button className="flex-1" onClick={askEndSeason} variant="danger">
                    End season
                  </Button>
                )}
                <Button
                  className="flex-1 bg-surface shadow-[0_5px_0_#F0D3CB] active:shadow-[0_2px_0_#F0D3CB]"
                  onClick={askLeave}
                  variant="danger-ghost"
                >
                  Leave realm
                </Button>
              </div>
            </section>
          </div>
        ) : (
          <Card className="w-[480px] self-start rounded-panel border-4 px-[26px] py-6" variant="panel">
            <p className="font-display text-[24px] font-extrabold text-ink">Realm</p>
            <p className="mt-[5px] mb-4 text-[12.5px] font-bold text-ink-muted">
              You're currently not in any realm.
            </p>
            <Button onClick={() => navigate('/realms')} variant="gold">
              Find or create a realm!
            </Button>
          </Card>
        )}
      </div>

      {(message || error) && (
        <div className="mx-auto mt-[18px] w-[946px] max-w-full text-center">
          {message && (
            <p className="p-chip border-good-edge bg-good text-[12.5px] text-good-ink">{message}</p>
          )}
          {error && (
            <p className="text-[13px] font-bold text-danger-ink" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        confirmLabel={confirm?.confirmLabel}
        message={confirm?.message}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        open={Boolean(confirm)}
        title={confirm?.title}
      />
    </Screen>
  );
}
