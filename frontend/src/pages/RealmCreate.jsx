import { useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { realmService } from '../services/index.js';

export default function RealmCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: 'Study Squad',
    mapPreset: 'open_plains',
    maxPlayers: 4,
    seasonLengthDays: 7,
    antiCheat: false,
  });
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await realmService.create({
        ...form,
        maxPlayers: Number(form.maxPlayers),
        seasonLengthDays: Number(form.seasonLengthDays),
      });
      navigate('/realm');
    } catch (caught) {
      setError(caught.message);
    }
  }

  return (
    <Card className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Create realm</h1>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm">
          Name
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            onChange={event => setForm({ ...form, name: event.target.value })}
            value={form.name}
          />
        </label>
        <label className="block text-sm">
          Map
          <select
            className="mt-1 w-full rounded border px-3 py-2"
            onChange={event => setForm({ ...form, mapPreset: event.target.value })}
            value={form.mapPreset}
          >
            <option value="open_plains">open_plains</option>
            <option value="crossroads">crossroads</option>
            <option value="archipelago">archipelago</option>
          </select>
        </label>
        <label className="block text-sm">
          Max players
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            max="10"
            min="2"
            onChange={event => setForm({ ...form, maxPlayers: event.target.value })}
            type="number"
            value={form.maxPlayers}
          />
        </label>
        <label className="block text-sm">
          Season days
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            max="366"
            min="7"
            onChange={event => setForm({ ...form, seasonLengthDays: event.target.value })}
            type="number"
            value={form.seasonLengthDays}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={form.antiCheat}
            onChange={event => setForm({ ...form, antiCheat: event.target.checked })}
            type="checkbox"
          />
          Anti-cheat
        </label>
        <Button type="submit">Create</Button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </Card>
  );
}
