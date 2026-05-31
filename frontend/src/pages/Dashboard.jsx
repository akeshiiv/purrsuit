import { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext.jsx';
import '../App.css';

const API_URL = import.meta.env.VITE_API_URL;
const TIMER_DURATION = 3600; // in seconds
const COINS_PER_SECOND = 2;

export default function Dashboard() {
  const { logout } = useAuth();
  const [seconds, setSeconds] = useState(TIMER_DURATION);
  const [running, setRunning] = useState(false);
  const [coins, setCoins] = useState(null);
  const [name, setName] = useState(null);
  const coinsEarned = TIMER_DURATION * COINS_PER_SECOND;

  useEffect(() => {
    fetch(`${API_URL}/api/coins`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const parsed = Number(data.coins);
        setCoins(isNaN(parsed) ? 0 : parsed); // TODO: figure out why backend returns NaN
      });
  }, []);

  useEffect(() => {
  fetch(`${API_URL}/api/name`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      console.log('name response:', data);
      setName(data.name || 'Unknown User'); // TODO: fix lol
    });
}, []);

  useEffect(() => {
    if (!running) return;
    const intervalId = setInterval(() => {
      setSeconds(sec => {
        if (sec <= 1) {
          clearInterval(intervalId);
          setRunning(false);
          setCoins(prev => Number(prev) + coinsEarned);
          fetch(`${API_URL}/api/coins`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coinsEarned, duration: TIMER_DURATION }),
          });
          return TIMER_DURATION;
        }
        return sec - 1;
      });
    }, 1000);
    return () => clearInterval(intervalId);
  }, [running]);

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
        </div>
        <div className="flex gap-3">
          <button onClick={handleStartStop} className="px-6 py-2 border rounded hover:bg-gray-200">
            {running ? 'Stop' : 'Start'}
          </button>
          <button onClick={logout} className="px-6 py-2 border rounded hover:bg-gray-200">
            Logout
          </button>
        </div>
      </div>
    }</div>
  );
}