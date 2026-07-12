import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Card from './ui/Card.jsx';
import { studyService } from '../services/index.js';
import { formatStudy } from '../utils/time.js';

function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export default function StatsSummary() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let active = true;
    studyService.getStats(browserTz())
      .then((data) => { if (active) setStats(data); })
      .catch(() => { if (active) setStats(null); });
    return () => { active = false; };
  }, []);

  const block = stats?.season ?? stats?.allTime ?? null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Study stats</h2>
        <Link to="/realm/stats" className="text-sm text-slate-500 hover:underline">
          View all →
        </Link>
      </div>
      {stats ? (
        <div className="mt-2 space-y-1 text-sm">
          <p>🔥 {stats.streak.current}-day streak <span className="text-slate-400">(best {stats.streak.longest})</span></p>
          <p>Studied: {formatStudy(block.totalSeconds)}</p>
          <p>Sessions: {block.sessionCount}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Loading...</p>
      )}
    </Card>
  );
}
