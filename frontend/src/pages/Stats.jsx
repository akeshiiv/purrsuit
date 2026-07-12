import { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { studyService } from '../services/index.js';
import { formatStudy } from '../utils/time.js';

function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function Stat({ label, value }) {
  return (
    <div className="rounded border bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState('allTime');

  useEffect(() => {
    let active = true;
    studyService.getStats(browserTz())
      .then((data) => { if (active) setStats(data); })
      .catch((caught) => { if (active) setError(caught); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const hasSeason = Boolean(stats?.season);
  const block = useMemo(() => {
    if (!stats) return null;
    return scope === 'season' && stats.season ? stats.season : stats.allTime;
  }, [stats, scope]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading stats...</div>;
  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Stats unavailable</h1>
        <p className="mt-2 text-sm text-red-700">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Study stats</h1>
        <div className="ml-auto flex overflow-hidden rounded border text-sm">
          <button
            type="button"
            onClick={() => setScope('allTime')}
            className={scope === 'allTime' ? 'bg-slate-900 px-3 py-1 text-white' : 'px-3 py-1'}
          >
            All-time
          </button>
          <button
            type="button"
            onClick={() => setScope('season')}
            disabled={!hasSeason}
            className={
              scope === 'season' && hasSeason
                ? 'bg-slate-900 px-3 py-1 text-white'
                : 'px-3 py-1 disabled:text-slate-300'
            }
          >
            Season
          </button>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-4">
          <span className="text-3xl">🔥</span>
          <div>
            <p className="text-sm text-slate-500">Study streak</p>
            <p className="text-2xl font-semibold">
              {stats.streak.current} {stats.streak.current === 1 ? 'day' : 'days'} in a row
            </p>
            <p className="text-xs text-slate-500">Longest: {stats.streak.longest} days</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Total study time" value={formatStudy(block.totalSeconds)} />
        <Stat label="Avg per active day" value={formatStudy(block.avgSecondsPerActiveDay)} />
        <Stat label="Total sessions" value={block.sessionCount} />
        <Stat label="Avg session" value={formatStudy(block.avgSessionSeconds)} />
        <Stat label="Coins earned" value={block.totalCoins} />
        <Stat label="Days studied" value={block.activeDays} />
      </div>

      {block.sessionCount === 0 && (
        <p className="text-sm text-slate-500">
          No sessions yet — finish a focus session to start building your streak.
        </p>
      )}
    </div>
  );
}
