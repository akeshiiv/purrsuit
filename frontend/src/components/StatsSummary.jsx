import { useEffect, useState } from 'react';
import { studyService } from '../services/index.js';
import { browserTz, formatStudy } from '../utils/time.js';

function Tile({ label, value }) {
  return (
    <div className="flex-1 rounded-[18px] border-2 border-edge-soft bg-[#F7EBD6] px-3 py-[10px]">
      <p className="text-[10px] font-extrabold tracking-[.08em] text-ink-muted-soft uppercase">{label}</p>
      <p className="p-nums mt-[2px] text-[19px] text-ink">{value}</p>
    </div>
  );
}

/**
 * The three mini-stat tiles at the foot of Home. Study time and battles come
 * from the live member payload; the streak is the one figure only the stats
 * endpoint knows, so this fetches it itself.
 */
export default function StatsSummary({ secondsStudied = 0, battlesWon = 0, className = '' }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let active = true;
    studyService.getStats(browserTz())
      .then((data) => { if (active) setStats(data); })
      .catch(() => { if (active) setStats(null); });
    return () => { active = false; };
  }, []);

  const streak = stats?.streak?.current ?? null;

  return (
    <div className={`flex gap-[10px] ${className}`}>
      <Tile label="Studied" value={formatStudy(secondsStudied)} />
      <Tile label="Streak" value={streak === null ? '—' : `${streak} ${streak === 1 ? 'day' : 'days'}`} />
      <Tile label="Battles" value={`${battlesWon} won`} />
    </div>
  );
}
