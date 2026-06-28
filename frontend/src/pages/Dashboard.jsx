import { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext.jsx';
import { apiFetch } from '../services/api.js';
import '../App.css';

const API_URL = import.meta.env.VITE_API_URL;
const TIMER_DURATION = 30; // in seconds

export default function Dashboard() {
  const { logout } = useAuth();
  const [seconds, setSeconds] = useState(TIMER_DURATION);
  const [running, setRunning] = useState(false);
  const [coins, setCoins] = useState(null);
  const [name, setName] = useState(null);
  const [coinError, setCoinError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/coins')
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (typeof data.coins !== 'number') throw new Error('Invalid response');
        setCoins(data.coins);
      })
      .catch(() => setCoinError('Could not load your coins.'));
  }, []);

  useEffect(() => {
  fetch(`${API_URL}/api/name`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      console.log('name response:', data);
      setName(data.name || 'Unknown User'); // TODO: fix lol
    });
}, []);

  // Award is derived and persisted server-side; the UI reflects whatever balance
  // the POST returns, never an optimistic local guess.
  async function awardCoins() {
    setCoinError(null);
    setSaving(true);
    try {
      const res = await apiFetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: TIMER_DURATION }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (typeof data.coins !== 'number') throw new Error('Invalid response');
      setCoins(data.coins); // authoritative balance from the server
    } catch {
      setCoinError('Could not save your coins. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Tick once per second while running. `seconds` is a dependency, so each tick
  // re-subscribes with a fresh value; the state changes happen in the timeout
  // callback (a deferred context), so the award request fires exactly once and
  // never doubles under StrictMode.
  useEffect(() => {
    if (!running) return;
    const timeoutId = setTimeout(() => {
      if (seconds <= 1) {
        setRunning(false);
        setSeconds(TIMER_DURATION);
        awardCoins();
      } else {
        setSeconds(seconds - 1);
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [running, seconds]);

  function handleStartStop() {
    if (!running) {
      setRunning(true);
    } else {
      setSeconds(TIMER_DURATION);
      setRunning(false);
    }
  }

  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  const pad = n => String(n).padStart(2, '0');

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen gap-8">
    {name && (
      <p className="absolute top-4 right-4 text-sm">
        Logged in as {name}
      </p>
    )}
    {
      <div className="flex flex-col items-center justify-center gap-8">
        <h1 className="text-5xl font-bold">Purrsuit</h1>
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm uppercase tracking-widest">
            {running ? 'Studying in progress' : 'Ready to study?'}
          </p>
          <p className="text-6xl font-mono">{pad(minutes)}:{pad(remSeconds)}</p>
          <p className="text-sm">
            Coins: {coins !== null ? coins : '...'}
          </p>
          {saving && <p className="text-xs text-gray-500">Saving…</p>}
          {coinError && <p className="text-xs text-red-500">{coinError}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={handleStartStop} className="px-6 py-2 border rounded hover:bg-gray-100">
            {running ? 'Stop' : 'Start'}
          </button>
          <button onClick={logout} className="px-6 py-2 border rounded hover:bg-gray-100">
            Logout
          </button>
        </div>
      </div>
    }</div>
  );
}