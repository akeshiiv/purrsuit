import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../components/AuthContext.jsx';
import EntryScreen from '../components/layout/EntryScreen.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import CatCircle from '../components/ui/CatCircle.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { profileService, realmService } from '../services/index.js';
import { formatCountdown } from '../utils/time.js';

const DECOR = [
  { id: 'gold', style: { left: -60, bottom: -40, width: 260, height: 260, background: 'rgba(242, 206, 126, 0.22)' } },
  { id: 'blue', style: { right: -50, top: -50, width: 240, height: 240, background: 'rgba(140, 199, 228, 0.2)' } },
];

const JOIN_CODE_LENGTH = 6;

/**
 * The server's join failures are accurate but terse, and none of them say what
 * to do next. Join codes are generated once at realm creation and never rotate
 * (there is no regenerate endpoint), so a code that doesn't resolve was mistyped
 * or belongs to a realm that is gone — it did not "expire". The copy says that
 * rather than implying a code the user could refresh.
 */
const JOIN_ERRORS = {
  REALM_NOT_FOUND:
    'No realm uses that code. Codes are 6 characters and never change, so check it with whoever invited you.',
  SEASON_ENDED:
    'That realm is between seasons right now. Ask the admin to start the next one, then try the code again.',
  REALM_FULL: 'That realm is full. Ask the admin to make room, or start your own realm instead.',
  ALREADY_IN_REALM: 'You are already in a realm. Leave it first to join another.',
};

function joinErrorMessage(caught) {
  return JOIN_ERRORS[caught?.code] ?? caught?.message ?? 'Could not join that realm.';
}

function monogram(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `day N of M` from `season.startedAt` and `realm.seasonLengthDays`.
 *
 * Convention: **the first day of a season is day 1, not day 0** — a season that
 * started an hour ago is on day 1 and ticks over to day 2 once a full 24h have
 * elapsed, so N = floor(elapsed / 24h) + 1. N is clamped into 1…M: a few
 * seconds of clock skew must not print "day 0", and a season already past its
 * length (it ends on a rollover, not on the stroke of `endsAt`) must not print
 * "day 9 of 7".
 *
 * Returns null when either field is missing, so the caller can drop the clause
 * instead of printing a number it cannot stand behind.
 */
function dayOfSeason(startedAt, seasonLengthDays) {
  const started = startedAt ? new Date(startedAt).getTime() : NaN;
  const length = Number(seasonLengthDays);
  if (Number.isNaN(started) || !Number.isFinite(length) || length < 1) return null;

  const day = Math.floor((Date.now() - started) / DAY_MS) + 1;
  return `day ${Math.min(Math.max(day, 1), Math.floor(length))} of ${Math.floor(length)}`;
}

/**
 * The design's meta line reads `3 players · day 4 of 7 · you hold 5 cells`. The
 * middle clause needs both a season start and a season length; without either
 * (an older backend) it degrades to the countdown this line has always shown
 * rather than to a guessed day number. Cell counts only exist for the top three
 * of `miniLeaderboard` — outside it that clause is dropped rather than guessed.
 */
function realmMeta(current) {
  const parts = [];

  const memberCount = current?.members?.length;
  if (memberCount) parts.push(plural(memberCount, 'player'));

  const endsAt = current?.season?.endsAt;
  const countdown = endsAt ? formatCountdown(endsAt) : null;
  const ended = countdown === 'Season ended';
  // An ended season has no meaningful day-of, so it keeps saying so.
  const day = ended ? null : dayOfSeason(current?.season?.startedAt, current?.realm?.seasonLengthDays);
  if (day) parts.push(day);
  else if (countdown) parts.push(ended ? 'season ended' : `ends in ${countdown}`);

  const myRow = current?.miniLeaderboard?.find(row => row.userId === current?.me?.userId);
  if (myRow) parts.push(`you hold ${plural(myRow.territories, 'cell')}`);

  return parts.join(' · ');
}

export default function RealmSelect() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [current, setCurrent] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let active = true;
    realmService.getCurrent()
      .then(data => { if (active) setCurrent(data); })
      .catch(caught => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // The header pill needs a name and avatar even for a user in no realm, where
  // `getCurrent()` returns `{ realm: null }` and there is no `me`. A failure
  // here costs only the greeting, so it must not block or blank the page.
  useEffect(() => {
    let active = true;
    profileService.get()
      .then(data => { if (active) setProfile(data); })
      .catch(() => {});
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

  async function handleJoin(event) {
    event.preventDefault();
    if (current?.realm || joining || joinCode.length !== JOIN_CODE_LENGTH) return;
    setError('');
    setJoining(true);

    try {
      await realmService.join({ joinCode });
      navigate('/realm');
    } catch (caught) {
      // The code stays in the field: every one of these is recoverable by
      // retrying or retyping, and clearing it would hide the typo.
      setError(joinErrorMessage(caught));
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <EntryScreen className="items-center justify-center" decor={DECOR}>
        <p className="font-display text-[19px] font-extrabold text-ink-muted">Loading realms...</p>
      </EntryScreen>
    );
  }

  const realm = current?.realm ?? null;
  // One realm at a time is a server rule (ALREADY_IN_REALM, 409). Create and join
  // stay on screen so the card still reads as the design draws it, but they go
  // inert with the reason stated inline — the same disabled-with-reason pattern
  // the shop uses at the 6-cat cap, rather than letting a user fill out the
  // create form and only learn the rule from a 409 on submit.
  const inRealm = Boolean(realm);
  const displayName = profile?.name ?? current?.me?.name ?? '';
  const codeTooShort = joinCode.length > 0 && joinCode.length < JOIN_CODE_LENGTH;

  return (
    <EntryScreen className="flex-col" decor={DECOR}>
      <header className="flex items-center px-10 pt-[22px]">
        <h1 className="font-display text-[28px] font-extrabold text-ink">Purrsuit</h1>
        <div className="p-pill ml-auto gap-[10px] py-[6px] pr-4 pl-[6px]">
          {profile?.avatarUrl ? (
            <img
              alt=""
              className="h-[34px] w-[34px] rounded-full border-2 border-[#C08D45] object-cover"
              src={profile.avatarUrl}
            />
          ) : (
            <CatCircle border={2} padding={2} size={34} tone="gold" unitType="A" />
          )}
          {displayName && (
            <span className="font-display text-[16px] font-extrabold text-gold-ink">{displayName}</span>
          )}
          <span aria-hidden="true" className="block h-[18px] w-[2px] bg-warm" />
          <button
            className="cursor-pointer text-[12.5px] font-extrabold text-ink-muted-soft hover:text-[#8a5a22]"
            onClick={logout}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-wrap items-center justify-center gap-[34px] px-10 py-10">
        <div className="w-[520px] max-w-full">
          <p className="text-[12px] font-extrabold tracking-[0.14em] text-ink-muted-soft uppercase">Step 2 of 2</p>
          <h2 className="mt-2 font-display text-[46px] leading-[1.05] font-extrabold text-ink">
            Which realm are you studying in?
          </h2>
          <p className="mt-3 text-[15.5px] font-bold text-ink-muted [text-wrap:pretty]">
            A realm is one board, one season, one group of friends. Your cats and coins are kept per realm.
          </p>
          <div className="mt-[34px] flex items-end gap-[6px]">
            <CatCircle border={3} padding={8} size={118} tone="default" unitType="C" />
            <CatCircle bob border={4} padding={10} size={146} tone="gold" unitType="A" />
            <CatCircle border={3} padding={8} size={118} tone="blue" unitType="B" />
          </div>
        </div>

        <Card className="w-[460px] max-w-full px-[30px] pt-[30px] pb-8" variant="hero">
          <p className="p-label">Your realm</p>

          {realm ? (
            <div className="mt-[14px] flex flex-col gap-[10px]">
              <button
                className="p-tile p-row-lift flex w-full items-center gap-[14px] px-[18px] py-[15px] text-left"
                onClick={() => navigate('/realm')}
                type="button"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border-2 border-[#C08D45] bg-gold font-display text-[19px] font-extrabold text-ink-body">
                  {monogram(realm.name)}
                </span>
                <span className="flex-1">
                  <span className="block font-display text-[19px] font-extrabold text-ink">{realm.name}</span>
                  <span className="mt-[2px] block text-[12.5px] font-bold text-ink-muted">
                    {realmMeta(current) || realm.joinCode}
                  </span>
                </span>
                <span className="font-display text-[15px] font-extrabold text-ink-link">Enter</span>
              </button>
              <button
                className="cursor-pointer self-end text-[11.5px] font-extrabold text-ink-muted-soft underline-offset-2 hover:text-danger-ink hover:underline"
                onClick={() => setConfirmLeave(true)}
                type="button"
              >
                Leave {realm.name}
              </button>
            </div>
          ) : (
            <p className="mt-[14px] text-[13.5px] font-bold text-ink-muted">
              Create your own realm, or join one with a code from your realm admin.
            </p>
          )}

          <div className="mt-6 mb-[18px] flex items-center gap-3">
            <span aria-hidden="true" className="block h-[2px] flex-1 bg-[#EADCC0]" />
            <span className="text-[11px] font-extrabold tracking-[0.1em] text-ink-muted-soft uppercase">
              or start somewhere new
            </span>
            <span aria-hidden="true" className="block h-[2px] flex-1 bg-[#EADCC0]" />
          </div>

          <div className="flex flex-col gap-[11px]">
            <Button
              disabled={inRealm}
              full
              onClick={() => navigate('/realms/create')}
              style={{ padding: '14px' }}
              variant="gold"
            >
              Create a realm
            </Button>
            <form className="flex gap-[9px]" onSubmit={handleJoin}>
              <input
                aria-label="Realm join code"
                autoComplete="off"
                className="p-input flex-1 bg-sunk font-display text-[18px] tracking-[0.22em] uppercase disabled:cursor-not-allowed disabled:opacity-[.45]"
                disabled={inRealm}
                maxLength="6"
                onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="CODE"
                value={joinCode}
              />
              <Button
                disabled={inRealm || joining || joinCode.length !== JOIN_CODE_LENGTH}
                style={{ padding: '0 22px', fontSize: '18px', borderRadius: '18px' }}
                type="submit"
                variant="blue"
              >
                {joining ? 'Joining...' : 'Join'}
              </Button>
            </form>
            {inRealm ? (
              <p className="text-[11.5px] font-bold text-ink-muted-soft [text-wrap:pretty]">
                You can only be in one realm at a time. Leave {realm.name} first to create or join another.
              </p>
            ) : codeTooShort && (
              <p className="text-[11.5px] font-bold text-ink-muted-soft">Join codes are 6 characters.</p>
            )}
          </div>

          {error && (
            <p className="p-danger mt-[14px] px-4 py-3 text-[12.5px] font-bold" role="alert">{error}</p>
          )}

          <p className="mt-[18px] text-[11.5px] font-bold text-ink-muted-soft [text-wrap:pretty]">
            Realms run one season at a time. Leaving forfeits every cell you hold.
          </p>
        </Card>
      </div>

      <ConfirmDialog
        confirmLabel="Leave realm"
        message="You will forfeit every cell you hold this season. This cannot be undone."
        onClose={() => setConfirmLeave(false)}
        onConfirm={handleLeave}
        open={confirmLeave}
        title="Leave realm?"
      />
    </EntryScreen>
  );
}
