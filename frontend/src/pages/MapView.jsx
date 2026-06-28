import { useMemo, useState } from 'react';
import { useGame } from '../components/GameContext.jsx';
import MapBoard from '../components/map/MapBoard.jsx';
import DeployModal from '../components/map/DeployModal.jsx';
import Card from '../components/ui/Card.jsx';
import { useMapPolling } from '../hooks/useMapPolling.js';
import { UNIT_META, attackTargets, cellKey } from '../components/map/mapModel.js';

const RESULT_LABEL = {
  claimed: 'Claimed the cell',
  captured: 'Captured the cell',
  repelled: 'Attack repelled',
};

export default function MapView() {
  const { refresh } = useGame();
  const { map, error, refresh: refreshMap } = useMapPolling(2500);
  const [selected, setSelected] = useState(null); // { cell, mode }
  const [result, setResult] = useState('');

  const meId = map?.me?.id;
  const targets = useMemo(() => (map ? attackTargets(map.cells, meId) : new Set()), [map, meId]);

  if (!map) return <Card>Loading map…</Card>;

  function handleCellClick(cell) {
    setResult('');
    const mine = cell.ownerMemberId === meId;
    if (mine && cell.unitType) {
      setSelected({ cell, mode: 'defend' });
    } else if (targets.has(cellKey(cell))) {
      setSelected({ cell, mode: 'attack' });
    }
  }

  async function handleDeployed(deploy) {
    setSelected(null);
    if (deploy?.result) setResult(deploy.result);
    await refreshMap();
    await refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Map</h1>
        <span className="text-sm text-slate-600">Tap a glowing cell to attack, or your own cell to reinforce.</span>
        {result && <span className="text-sm font-medium text-emerald-700">Last action: {RESULT_LABEL[result] ?? result}</span>}
        {error && <span className="text-sm text-red-700">Couldn’t refresh — retrying…</span>}
      </Card>

      <MapBoard
        cells={map.cells}
        size={map.size}
        meId={meId}
        interactive
        onCellClick={handleCellClick}
        highlightKeys={targets}
        selectedKey={selected ? cellKey(selected.cell) : null}
      />

      <Card className="flex flex-wrap items-center gap-4 text-sm">
        {map.members.map(member => (
          <span key={member.id} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: member.colour }} />
            {member.name}
          </span>
        ))}
        <span className="ml-auto flex gap-3 text-slate-600">
          {['A', 'B', 'C'].map(t => (
            <span key={t}>{UNIT_META[t].glyph} {UNIT_META[t].label}</span>
          ))}
        </span>
      </Card>

      <DeployModal
        key={selected ? `${selected.mode}-${selected.cell.x}-${selected.cell.y}` : 'none'}
        open={Boolean(selected)}
        mode={selected?.mode}
        cell={selected?.cell}
        me={map.me}
        onClose={() => setSelected(null)}
        onDeployed={handleDeployed}
      />
    </div>
  );
}
