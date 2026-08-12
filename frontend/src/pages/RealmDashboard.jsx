import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import Screen from '../components/layout/Screen.jsx';
import Button from '../components/ui/Button.jsx';
import CatCircle from '../components/ui/CatCircle.jsx';
import CoinPill from '../components/ui/CoinPill.jsx';
import DailyQuestCard from '../components/ui/DailyQuestCard.jsx';
import DeployModal from '../components/map/DeployModal.jsx';
import MapBoard from '../components/map/MapBoard.jsx';
import PlayerAvatar from '../components/map/PlayerAvatar.jsx';
import StatsSummary from '../components/StatsSummary.jsx';
import { useGame } from '../components/GameContext.jsx';
import { useMapPolling } from '../hooks/useMapPolling.js';
import { useMidnightRefresh } from '../hooks/useMidnightRefresh.js';
import { UNIT_META, UNIT_ORDER, beatsLabel } from '../components/units.js';
import { attackTargets, cellKey, dominantUnit, standings } from '../components/map/mapModel.js';
import { formatCountdown } from '../utils/time.js';

const IN_RANGE_HINT = 'Glowing tiles are in range — tap one to attack.';
const NO_RANGE_HINT = 'Nothing in range — cats only reach cells next to your own.';

function heldOf(units, type) {
  return units?.[UNIT_META[type].key] ?? 0;
}

// The cat on the poster: whichever type you hold most of, A when the barracks
// are empty.
function featuredUnit(units) {
  return UNIT_ORDER.reduce((best, type) => (heldOf(units, type) > heldOf(units, best) ? type : best), 'A');
}

function RosterRow({ type, count }) {
  const has = count > 0;
  return (
    <div
      className={`flex items-center gap-[10px] rounded-[14px] border-2 px-3 py-[7px] ${
        has ? 'border-edge-soft bg-sunk' : 'border-[#EADCC0] bg-[#F3EADA]'
      }`}
    >
      <CatCircle alt="" border={0} padding={2} size={30} unitType={type} />
      <span className="flex-1 text-[12px] font-extrabold text-ink-body-soft">{UNIT_META[type].name}</span>
      <span className={`p-nums text-[16px] ${has ? 'text-ink' : 'text-[#C6AC80]'}`}>{count}</span>
    </div>
  );
}

export default function RealmDashboard() {
  const { realm, season, me: gameMe, dailyQuest, refresh } = useGame();
  useMidnightRefresh(refresh);
  const { map, error, refresh: refreshMap } = useMapPolling(4000);
  const navigate = useNavigate();

  const [selected, setSelected] = useState(null); // { cell, mode }
  const [hint, setHint] = useState('');
  const [questNotice, setQuestNotice] = useState('');

  const board = map?.me ? map : null;
  const me = board?.me ?? gameMe;
  const members = board?.members ?? [];
  const rows = useMemo(
    () => (board ? standings(board.cells, board.members) : []),
    [board],
  );
  const targets = useMemo(
    () => (board ? attackTargets(board.cells, me.id) : new Set()),
    [board, me.id],
  );

  const featured = featuredUnit(me?.units);
  const countdown = formatCountdown(season?.endsAt);
  const seasonChip = season?.status === 'ended' || countdown === 'Season ended'
    ? `Season ${season?.id} · ended`
    : `Season ${season?.id} · ends in ${countdown}`;
  // The status line, rewritten after every resolution and otherwise describing
  // what the board is offering right now.
  const hintLine = hint || (!board ? '' : targets.size > 0 ? IN_RANGE_HINT : NO_RANGE_HINT);

  function handleCellClick(cell) {
    setQuestNotice('');
    const mine = cell.ownerMemberId === me.id;
    if (mine && cell.unitType) {
      setSelected({ cell, mode: 'defend' });
    } else if (targets.has(cellKey(cell))) {
      setSelected({ cell, mode: 'attack' });
    }
  }

  async function handleDeployed(deploy, intent) {
    setSelected(null);
    setHint(describe(deploy, intent));
    setQuestNotice(deploy?.questCompleted
      ? `Quest complete! +${deploy.questCompleted.reward} coins · ${deploy.questCompleted.title}`
      : '');
    await refreshMap();
    await refresh();
  }

  return (
    <Screen
      right={(
        <>
          <CoinPill coins={me?.coins} />
          {members.map(member => (
            <PlayerAvatar
              colour={member.colour}
              key={member.id}
              ring={3}
              size={38}
              title={member.name}
              unitType={board ? dominantUnit(board.cells, member.id) : 'A'}
            />
          ))}
        </>
      )}
      bodyClassName="flex flex-col"
    >
      <div className="mx-auto flex w-full max-w-[1372px] flex-1 flex-col">
        <div className="flex items-center gap-3">
          <span className="p-chip border-edge-soft bg-[#F1E4CB] text-[12px] text-[#8A6234]">
            {realm.name} · {realm.joinCode}
          </span>
          <span className="p-chip border-info-edge bg-info text-[12px] text-info-ink">{seasonChip}</span>
        </div>

        <div className="mt-[14px] grid flex-1 grid-cols-[264px_1fr_320px] gap-[26px]">
          {/* Left — your squad and today's quest */}
          <div className="flex flex-col gap-4">
            <section className="relative flex flex-1 flex-col items-center overflow-hidden rounded-[26px] border-3 border-edge bg-linear-to-b from-surface to-[#F4E4C8] px-4 pt-[18px] pb-5 shadow-[0_6px_0_var(--color-warm)]">
              <span className="p-label absolute top-[14px] left-4 text-[10px] tracking-[.1em]">Your squad</span>
              <CatCircle bob className="mt-6" padding={10} size={158} tone="dashed" unitType={featured} />
              <p className="mt-3 mb-px font-display text-[20px] font-extrabold text-ink">{UNIT_META[featured].name}</p>
              <p className="text-[11.5px] font-bold text-ink-muted">beats {beatsLabel(featured)}</p>
              <div className="mt-[14px] flex w-full flex-col gap-2">
                {UNIT_ORDER.map(type => (
                  <RosterRow count={heldOf(me?.units, type)} key={type} type={type} />
                ))}
              </div>
            </section>

            <DailyQuestCard quest={dailyQuest} />
          </div>

          {/* Centre — the board and its status line */}
          <div className="flex min-w-0 flex-col items-center">
            {board ? (
              <MapBoard
                cellSize={60}
                cells={board.cells}
                highlightKeys={targets}
                interactive
                meId={me.id}
                onCellClick={handleCellClick}
                selectedKey={selected ? cellKey(selected.cell) : null}
                size={board.size}
              />
            ) : (
              <div className="flex size-[552px] items-center justify-center rounded-[34px] bg-[image:var(--water-tray)]">
                <p className="font-display text-[19px] font-extrabold text-ink-muted">Loading realm…</p>
              </div>
            )}
            <p className="mt-[14px] text-[12.5px] font-extrabold text-ink-muted">{hintLine}</p>
            {questNotice && (
              <p className="mt-1 text-[12.5px] font-extrabold text-[#C9862B]">{questNotice}</p>
            )}
            {error && (
              <p className="mt-1 text-[12.5px] font-extrabold text-danger-ink" role="alert">
                Couldn't refresh — retrying...
              </p>
            )}
          </div>

          {/* Right — standings, the two calls to action, and today's numbers */}
          <div className="flex flex-col gap-[18px]">
            <div className="relative pt-4">
              <section className="overflow-hidden rounded-[24px] border-3 border-edge-strong bg-surface shadow-[0_7px_0_var(--color-warm-deep)]">
                <div className="h-[46px] bg-track" />
                <div className="flex flex-col gap-2 p-[10px]">
                  {rows.length === 0 && (
                    <p className="px-3 py-2 text-[12.5px] font-bold text-ink-muted">No territory yet.</p>
                  )}
                  {rows.map((row, index) => (
                    <div
                      className={`flex items-center gap-[11px] rounded-[14px] border-2 px-3 py-[9px] ${
                        index === 0 ? 'border-[#DDB264] bg-gold' : 'border-[#EFE3CD] bg-muted'
                      }`}
                      key={row.id}
                    >
                      <span className="p-nums w-[14px] text-[16px] text-ink-body-soft">{index + 1}</span>
                      <PlayerAvatar
                        colour={row.colour}
                        unitType={dominantUnit(board.cells, row.id)}
                      />
                      <span className="flex-1 font-display text-[15px] font-bold text-ink">{row.name}</span>
                      <span className="p-nums text-[15px] text-[#8A6234]">{row.territories}</span>
                    </div>
                  ))}
                </div>
              </section>
              <span className="p-title-pill top-0 left-1/2 -translate-x-1/2">Leaderboard</span>
            </div>

            <Button full onClick={() => navigate('/realm/map')} size="xl" variant="gold">Attack</Button>
            <Button full onClick={() => navigate('/realm/study')} size="xl" variant="blue">Study</Button>

            <StatsSummary
              battlesWon={me?.battlesWon ?? 0}
              className="mt-auto"
              secondsStudied={me?.secondsStudied ?? 0}
            />
          </div>
        </div>
      </div>

      <DeployModal
        cell={selected?.cell}
        key={selected ? `${selected.mode}-${selected.cell.x}-${selected.cell.y}` : 'none'}
        me={board?.me}
        mode={selected?.mode}
        onClose={() => setSelected(null)}
        onDeployed={handleDeployed}
        open={Boolean(selected)}
      />
    </Screen>
  );
}

// The board's status line, rewritten after every resolution.
function describe(deploy, intent) {
  const cell = deploy?.cell;
  if (!cell || !intent) return '';
  const at = `${cell.x}, ${cell.y}`;
  const sent = UNIT_META[intent.unitType]?.name ?? 'Your cat';

  if (intent.mode === 'defend') {
    return `Reinforced ${at} — ${sent} ×${cell.troopCount} now.`;
  }
  if (deploy.result === 'claimed') return `Claimed ${at} — ${sent} holds it now.`;
  if (deploy.result === 'captured') return `Captured ${at} — ${sent} holds it now.`;

  const defender = UNIT_META[intent.target?.unitType]?.name;
  return defender
    ? `Repelled at ${at} — ${sent} doesn't beat ${defender}.`
    : `Repelled at ${at} — ${sent} couldn't take it.`;
}
