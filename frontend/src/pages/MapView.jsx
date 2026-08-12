import { useMemo, useState } from 'react';
import Screen from '../components/layout/Screen.jsx';
import Card from '../components/ui/Card.jsx';
import DeployModal from '../components/map/DeployModal.jsx';
import MapBoard from '../components/map/MapBoard.jsx';
import { useGame } from '../components/GameContext.jsx';
import { useMapPolling } from '../hooks/useMapPolling.js';
import { UNIT_META, UNIT_ORDER, beatsLabel } from '../components/units.js';
import { attackTargets, cellKey, standings } from '../components/map/mapModel.js';

const RESULT_LABEL = {
  claimed: 'Claimed cell',
  captured: 'Captured cell',
  repelled: 'Ineffective attack',
};

function Legend({ members, cells }) {
  const counts = useMemo(() => {
    const table = new Map();
    for (const row of standings(cells, members)) table.set(row.id, row.territories);
    return table;
  }, [cells, members]);

  return (
    <div className="flex gap-4">
      {members.map(member => (
        <span className="flex items-center gap-[7px] text-[12.5px] font-extrabold text-ink-body-soft" key={member.id}>
          <span
            className="block size-[14px] rounded-[5px] border-2 border-black/15"
            style={{ background: member.colour }}
          />
          {member.name} · {counts.get(member.id) ?? 0} cells
        </span>
      ))}
    </div>
  );
}

export default function MapView() {
  const { refresh } = useGame();
  const { map, error, refresh: refreshMap } = useMapPolling(2500);
  const [selected, setSelected] = useState(null); // { cell, mode }
  const [result, setResult] = useState('');
  const [questNotice, setQuestNotice] = useState('');

  const meId = map?.me?.id;
  const targets = useMemo(() => (map ? attackTargets(map.cells, meId) : new Set()), [map, meId]);

  if (!map) {
    return (
      <Screen>
        <Card className="mx-auto max-w-md p-6 text-center font-display text-[19px] font-extrabold text-ink-muted">
          Loading map…
        </Card>
      </Screen>
    );
  }

  function handleCellClick(cell) {
    setResult('');
    setQuestNotice('');
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
    setQuestNotice(deploy?.questCompleted
      ? `Quest complete! +${deploy.questCompleted.reward} coins · ${deploy.questCompleted.title}`
      : '');
    await refreshMap();
    await refresh();
  }

  const defender = selected
    ? map.members.find(member => member.id === selected.cell.ownerMemberId)
    : null;

  return (
    <Screen bodyClassName="flex flex-col" right={<Legend cells={map.cells} members={map.members} />}>
      <div className="mx-auto flex w-full max-w-[1372px] flex-1 items-center justify-center gap-[34px]">
        <div className="flex flex-col items-center">
          <MapBoard
            cellSize={72}
            cells={map.cells}
            highlightKeys={targets}
            interactive
            meId={meId}
            onCellClick={handleCellClick}
            selectedKey={selected ? cellKey(selected.cell) : null}
            size={map.size}
          />
          <div className="mt-[14px] flex h-5 items-center gap-4 text-[12.5px] font-extrabold">
            {result && <span className="text-good-ink">Last action: {RESULT_LABEL[result] ?? result}</span>}
            {questNotice && <span className="text-[#C9862B]">{questNotice}</span>}
            {error && <span className="text-danger-ink" role="alert">Couldn't refresh — retrying...</span>}
          </div>
        </div>

        {selected ? (
          <DeployModal
            cell={selected.cell}
            defenderName={defender?.name ?? ''}
            key={`${selected.mode}-${selected.cell.x}-${selected.cell.y}`}
            me={map.me}
            mode={selected.mode}
            onClose={() => setSelected(null)}
            onDeployed={handleDeployed}
            open
            variant="panel"
          />
        ) : (
          <Card
            className="w-[396px] flex-none border-4 border-edge-strong p-[22px] shadow-[0_10px_0_var(--color-edge)]"
            variant="panel"
          >
            <p className="font-display text-[24px] font-extrabold text-ink">Pick a target</p>
            <p className="mt-1 text-[13px] font-bold text-ink-muted">
              Tap a glowing cell to attack, or one of your own to reinforce it.
            </p>
            <p className="p-label mt-4 mb-2 text-[11px] tracking-[.08em]">How the matchup works</p>
            <div className="flex flex-col gap-2">
              {UNIT_ORDER.map(type => (
                <div
                  className="flex items-center justify-between rounded-[14px] border-2 border-edge-soft bg-sunk px-3 py-[9px]"
                  key={type}
                >
                  <span className="text-[12.5px] font-extrabold text-ink-body-soft">{UNIT_META[type].name}</span>
                  <span className="text-[11.5px] font-extrabold text-ink-muted">beats {beatsLabel(type)}</span>
                </div>
              ))}
            </div>
            <p className="p-info mt-[14px] rounded-[14px] border-2 px-[13px] py-[11px] text-[12.5px] font-extrabold">
              Only cells next to your own are in range. Water and rock are impassable.
            </p>
          </Card>
        )}
      </div>
    </Screen>
  );
}
