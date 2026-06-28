import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { leaderboardService } from '../services/index.js';

export default function Leaderboard() {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState(null);
  const [seasonStatus, setSeasonStatus] = useState(null);
  const [message, setMessage] = useState('');

  const loadLeaderboard = useCallback(async since => {
    const next = await leaderboardService.get(since);
    if (next.changed !== false) setLeaderboard(next);
    return next;
  }, []);

  const { error } = usePolling(loadLeaderboard, 4000);

  useEffect(() => {
    leaderboardService.seasonStatus()
      .then(setSeasonStatus)
      .catch(caught => setMessage(caught.message));
  }, []);

  async function acknowledgeSeason() {
    await leaderboardService.seasonAck();
    navigate('/realms');
  }

  if (!leaderboard) return <div>Loading leaderboard...</div>;

  return (
    <Card className="space-y-4">
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="py-1">Player</th>
            <th className="py-1">Territories</th>
            <th className="py-1">Battles</th>
            <th className="py-1">Study</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.rows.map(row => (
            <tr key={row.userId}>
              <td className="py-1">{row.name}</td>
              <td className="py-1">{row.territories}</td>
              <td className="py-1">{row.battlesWon}</td>
              <td className="py-1">{Math.round(row.secondsStudied / 60)} min</td>
            </tr>
          ))}
        </tbody>
      </table>
      {seasonStatus?.needsAck && (
        <Button onClick={acknowledgeSeason}>Acknowledge season</Button>
      )}
      {message && <p className="text-sm text-red-700">{message}</p>}
      {error && <p className="text-sm text-red-700">{error.message}</p>}
    </Card>
  );
}
