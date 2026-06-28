import { useCallback, useEffect, useState } from 'react';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { useGame } from '../components/GameContext.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { leaderboardService } from '../services/index.js';
import { formatCountdown, formatStudy } from '../utils/time.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function useSecondTicker() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick(value => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
}

export default function Leaderboard() {
  const { me } = useGame();
  const [leaderboard, setLeaderboard] = useState(null);

  const loadLeaderboard = useCallback(async since => {
    const next = await leaderboardService.get(since);
    if (next.changed !== false) setLeaderboard(next);
    return next;
  }, []);

  const { error } = usePolling(loadLeaderboard, 4000);
  useSecondTicker();

  if (!leaderboard) return <Card>Loading leaderboard…</Card>;

  const { rows, season } = leaderboard;
  const ended = season?.status !== 'active';
  const isMock = import.meta.env.VITE_USE_MOCK === 'true';
  const otherChampion = rows.find(row => row.userId !== me.userId)?.name;

  async function simulateEnd(winnerName) {
    await leaderboardService.simulateSeasonEnd({ winnerName });
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
        <span className={ended ? 'text-sm text-slate-500' : 'text-sm text-slate-700'}>
          {ended ? 'Season ended' : `Season ends in ${formatCountdown(season.endsAt)}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No standings yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="w-10 py-1">#</th>
              <th className="py-1">Player</th>
              <th className="py-1 text-right">Territories</th>
              <th className="py-1 text-right">Battles</th>
              <th className="py-1 text-right">Study</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isMe = row.userId === me.userId;
              return (
                <tr key={row.userId} className={isMe ? 'border-t bg-blue-50 font-medium' : 'border-t'}>
                  <td className="py-2">{MEDALS[index] ?? index + 1}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: row.colour }}
                      />
                      <span>{row.name}</span>
                      {isMe && (
                        <span className="rounded bg-blue-600 px-1.5 py-0.5 text-xs text-white">you</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right align-top">
                    <div>{row.territories}</div>
                    <div className="text-xs text-slate-400">
                      A {row.cellsA} · B {row.cellsB} · C {row.cellsC}
                    </div>
                  </td>
                  <td className="py-2 text-right align-top">{row.battlesWon}</td>
                  <td className="py-2 text-right align-top">{formatStudy(row.secondsStudied)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {error && <p className="text-sm text-red-700">{error.message}</p>}

      {isMock && !ended && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-slate-500">
          <span>Dev:</span>
          <Button variant="secondary" onClick={() => simulateEnd(me.name)}>
            End season — I win
          </Button>
          {otherChampion && (
            <Button variant="secondary" onClick={() => simulateEnd(otherChampion)}>
              End season — I lose
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
