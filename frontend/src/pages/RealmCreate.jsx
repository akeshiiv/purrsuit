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

export default function RealmCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: 'Study Squad',
    mapPreset: 'open_plains',
    maxPlayers: 4,
    seasonLengthDays: 7,
    antiCheat: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await realmService.create({
        ...form,
        maxPlayers: Number(form.maxPlayers),
        seasonLengthDays: Number(form.seasonLengthDays),
      });
      // Into the app, not straight to /onboarding: RequireRealm already diverts
      // a player who has not seen the tour, and two places deciding the same
      // thing is how they drift apart. It also keeps the second realm right —
      // someone who onboarded seasons ago lands on Home, not back in the tour.
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
        <Card className="w-[520px] max-w-full px-[34px] pt-[32px] pb-[34px]" variant="hero">
          <p className="p-label">New realm</p>
          <h2 className="mt-2 font-display text-[34px] leading-[1.05] font-extrabold text-ink">Create a realm</h2>
          <p className="mt-2 text-[13.5px] font-bold text-ink-muted [text-wrap:pretty]">
            You are the admin. Everyone else joins with the realm&rsquo;s code.
          </p>

          <form className="mt-6 flex flex-col gap-[18px]" onSubmit={handleSubmit}>
            <label className="block">
              <span className="p-label">Realm name</span>
              <input
                className="p-input mt-2"
                onChange={event => setForm({ ...form, name: event.target.value })}
                value={form.name}
              />
            </label>

            <label className="block">
              <span className="p-label">Map</span>
              <select
                className="p-input mt-2 cursor-pointer"
                onChange={event => setForm({ ...form, mapPreset: event.target.value })}
                value={form.mapPreset}
              >
                <option value="open_plains">Open Plains</option>
                <option value="crossroads">Crossroads</option>
                <option value="archipelago">Archipelago</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="p-label">Max players</span>
                <input
                  className="p-input mt-2 font-display"
                  max="10"
                  min="2"
                  onChange={event => setForm({ ...form, maxPlayers: event.target.value })}
                  type="number"
                  value={form.maxPlayers}
                />
                <span className="mt-[6px] block text-[11.5px] font-bold text-ink-muted-soft">2 to 10</span>
              </label>
              <label className="block">
                <span className="p-label">Season days</span>
                <input
                  className="p-input mt-2 font-display"
                  max="366"
                  min="7"
                  onChange={event => setForm({ ...form, seasonLengthDays: event.target.value })}
                  type="number"
                  value={form.seasonLengthDays}
                />
                <span className="mt-[6px] block text-[11.5px] font-bold text-ink-muted-soft">7 to 366</span>
              </label>
            </div>

            <label className="p-tile-sunk flex cursor-pointer items-start gap-3 px-4 py-[14px]">
              <input
                checked={form.antiCheat}
                className="mt-[2px] h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#B98C4A]"
                onChange={event => setForm({ ...form, antiCheat: event.target.checked })}
                type="checkbox"
              />
              <span>
                <span className="block font-display text-[17px] font-extrabold text-ink">Anti-cheat</span>
                <span className="mt-[2px] block text-[12.5px] font-bold text-ink-muted [text-wrap:pretty]">
                  Focus sessions are monitored, and a distracted session ends without coins.
                </span>
              </span>
            </label>

            <Button disabled={submitting} full size="lg" type="submit" variant="gold">
              {submitting ? 'Creating...' : 'Create realm'}
            </Button>
          </form>

          {error && (
            <p className="p-danger mt-4 px-4 py-3 text-[12.5px] font-bold" role="alert">{error}</p>
          )}
        </Card>
      </div>
    </EntryScreen>
  );
}
