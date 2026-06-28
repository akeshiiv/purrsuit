import { useEffect, useState } from 'react';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { profileService } from '../services/index.js';

export default function AccountSettings() {
  const [form, setForm] = useState({ name: '', avatarUrl: '', colour: '#3b82f6' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    profileService.get()
      .then(profile => setForm({
        name: profile.name ?? '',
        avatarUrl: profile.avatarUrl ?? '',
        colour: profile.colour ?? '#3b82f6',
      }))
      .catch(caught => setError(caught.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      await profileService.update(form);
      setMessage('Saved');
    } catch (caught) {
      setError(caught.message);
    }
  }

  return (
    <Card className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Account</h1>
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
        <Button type="submit">Save changes</Button>
      </form>
      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </Card>
  );
}
