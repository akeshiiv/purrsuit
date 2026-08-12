import { useState } from 'react';
import { useNavigate } from 'react-router';
import EntryScreen from '../components/layout/EntryScreen.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { realmService } from '../services/index.js';

const DECOR = [
  { id: 'gold', style: { left: -60, bottom: -40, width: 260, height: 260, background: 'rgba(242, 206, 126, 0.22)' } },
  { id: 'blue', style: { right: -50, top: -50, width: 240, height: 240, background: 'rgba(140, 199, 228, 0.2)' } },
];

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
      // Into the app, not straight to /onboarding: RequireRealm diverts a player
      // who has not seen the tour, so routing there from here as well would put
      // the decision in two places. A player who onboarded in an earlier realm
      // then correctly lands on Home rather than sitting through it again.
      navigate('/realm');
    } catch (caught) {
      setError(caught.message);
      setSubmitting(false);
    }
  }

  return (
    <EntryScreen className="flex-col" decor={DECOR}>
      <header className="flex items-center px-10 pt-[22px]">
        <h1 className="font-display text-[28px] font-extrabold text-ink">Purrsuit</h1>
        <button
          className="ml-auto cursor-pointer text-[12.5px] font-extrabold text-ink-muted-soft hover:text-[#8a5a22]"
          onClick={() => navigate('/realms')}
          type="button"
        >
          Back to realms
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center px-10 py-10">
        <Card className="w-[460px] max-w-full px-[30px] pt-[30px] pb-8" variant="hero">
          <p className="p-label">Join with a code</p>
          <h2 className="mt-2 font-display text-[34px] leading-[1.05] font-extrabold text-ink">Join a realm</h2>
          <p className="mt-2 text-[13.5px] font-bold text-ink-muted [text-wrap:pretty]">
            Ask your realm admin for the six-character code.
          </p>

          <form className="mt-6 flex flex-col gap-[11px]" onSubmit={handleSubmit}>
            <label className="block">
              <span className="p-label">Join code</span>
              <input
                autoFocus
                autoComplete="off"
                className="p-input mt-2 bg-sunk text-center font-display text-[26px] tracking-[0.22em] uppercase"
                maxLength="6"
                onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="ABC123"
                value={joinCode}
              />
            </label>
            <Button disabled={submitting || joinCode.length !== 6} full size="lg" type="submit" variant="blue">
              {submitting ? 'Joining...' : 'Join'}
            </Button>
            {joinCode.length > 0 && joinCode.length < 6 && (
              <p className="text-[11.5px] font-bold text-ink-muted-soft">Join codes are 6 characters.</p>
            )}
          </form>

          {error && (
            <p className="p-danger mt-4 px-4 py-3 text-[12.5px] font-bold" role="alert">{error}</p>
          )}
        </Card>
      </div>
    </EntryScreen>
  );
}
