import { useMemo } from 'react';
import { Link } from 'react-router';
import Card from '../components/ui/Card.jsx';
import MapBoard from '../components/map/MapBoard.jsx';
import { useGame } from '../components/GameContext.jsx';
import { useMapPolling } from '../hooks/useMapPolling.js';
import { UNIT_META, standings } from '../components/map/mapModel.js';

export default function RealmDashboard() {
  const { realm, season } = useGame();
  const { map } = useMapPolling(4000);

  const board = map?.me ? map : null;
  const me = board?.me;
  const rows = useMemo(
    () => (board ? standings(board.cells, board.members).slice(0, 3) : []),
    [board],
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">{realm.name}</h1>
          <span className="text-sm text-slate-500">Season {season.status}</span>
        </div>
        {board ? (
          <Link to="/realm/map" className="block transition hover:opacity-95" aria-label="Open the full map">
            <MapBoard cells={board.cells} size={board.size} meId={me.id} className="max-w-sm" />
            <p className="mt-2 text-center text-sm text-slate-500">Tap to open the full map →</p>
          </Link>
        ) : (
          <p className="text-sm text-slate-500">Loading planet…</p>
        )}
      </Card>

      <div className="space-y-4">
        <Card>
          <h2 className="font-semibold">Me</h2>
          {me ? (
            <>
              <p className="mt-2 text-sm">Coins: {me.coins}</p>
              <p className="text-sm">
                Units: {['A', 'B', 'C'].map(t => `${UNIT_META[t].glyph} ${me.units[UNIT_META[t].key]}`).join('  ')}
              </p>
              <p className="text-sm">Study: {Math.round(me.secondsStudied / 60)} min</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Loading…</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/realm/study" className="rounded border px-3 py-1 text-sm">Study</Link>
            <Link to="/realm/shop" className="rounded border px-3 py-1 text-sm">Shop</Link>
            <Link to="/realm/map" className="rounded border px-3 py-1 text-sm">Map</Link>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Standings</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {rows.length === 0 && <li className="text-slate-500">No territory yet.</li>}
            {rows.map((row, index) => (
              <li key={row.id} className="flex items-center gap-2">
                <span className="w-4 text-slate-400">{index + 1}</span>
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: row.colour }} />
                <span className="flex-1">{row.name}</span>
                <span className="font-semibold">{row.territories}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
