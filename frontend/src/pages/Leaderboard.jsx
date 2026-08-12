import { useCallback, useEffect, useState } from 'react';
import Screen from '../components/layout/Screen.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import CatCircle from '../components/ui/CatCircle.jsx';
import { useGame } from '../components/GameContext.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { leaderboardService } from '../services/index.js';
import { formatCountdown, formatStudy } from '../utils/time.js';

// The one grid template shared by the header row and every standings row.
const COLUMNS = 'grid grid-cols-[56px_1fr_130px_110px_130px]';

function useSecondTicker() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick(value => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
}

// A player's portrait is the cat type they hold the most cells with, so the
// avatars stay derived from the live board rather than assigned by hand.
function dominantUnit(row) {
  const counts = [['A', row.cellsA], ['B', row.cellsB], ['C', row.cellsC]];
  return counts.reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

function PlayerAvatar({ row, size }) {
  return (
    <span
      className="flex-none rounded-full p-[3px]"
      style={{ background: row?.colour ?? 'var(--color-edge-soft)' }}
    >
      <CatCircle border={0} padding={size >= 50 ? 3 : 2} size={size} unitType={row ? dominantUnit(row) : 'A'} />
    </span>
  );
}

// Every award below is reduced out of the live rows — first row wins a tie,
// and the rows arrive already sorted by territory.
function leaderBy(rows, pick) {
  return rows.reduce((best, row) => (pick(row) > pick(best) ? row : best));
}

function AwardCard({ label, row, value, highlight = false }) {
  return (
    <div
      className={[
        'flex flex-1 items-center gap-[14px] rounded-[24px] border-3 px-[18px] py-[16px]',
        highlight
          ? 'border-[#DDB264] bg-[#F7DFA8] shadow-[0_6px_0_#E5C489]'
          : 'border-edge bg-surface shadow-[0_6px_0_var(--color-warm)]',
      ].join(' ')}
    >
      <PlayerAvatar row={row} size={50} />
      <div>
        <p className="p-label">{label}</p>
        <p className="mt-[2px] font-display text-[20px] font-extrabold text-ink">{value}</p>
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const { me, realm, season: gameSeason } = useGame();
  const [leaderboard, setLeaderboard] = useState(null);

  const loadLeaderboard = useCallback(async since => {
    const next = await leaderboardService.get(since);
    if (next.changed !== false) setLeaderboard(next);
    return next;
  }, []);

  const { error } = usePolling(loadLeaderboard, 4000);
  useSecondTicker();

  // The countdown is the header's context cluster on this screen, so it has to
  // render before the first poll lands too.
  const headerSeason = leaderboard?.season ?? gameSeason;
  const headerEnded = headerSeason?.status !== 'active';
  const countdown = (
    <span className="rounded-full border-2 border-info-edge bg-info px-[14px] py-[6px] text-[12.5px] font-extrabold text-info-ink">
      {headerEnded ? 'Season ended' : `Season ends in ${formatCountdown(headerSeason.endsAt)}`}
    </span>
  );

  if (!leaderboard) {
    return (
      <Screen bodyClassName="flex flex-col items-center justify-center" right={countdown}>
        <Card className="px-6 py-5 text-[15px] text-ink-muted">Loading leaderboard...</Card>
      </Screen>
    );
  }

  const { rows, season } = leaderboard;
  const ended = season?.status !== 'active';
  const isMock = import.meta.env.VITE_USE_MOCK === 'true';
  const otherChampion = rows.find(row => row.userId !== me.userId)?.name;

  const topTerritory = rows.length > 0 ? leaderBy(rows, row => row.territories) : null;
  const topStudy = rows.length > 0 ? leaderBy(rows, row => row.secondsStudied) : null;
  // Every row carries its own longest streak, so the middle award is the
  // design's again. A backend too old to send the field leaves every row at 0,
  // which lands on the same "No one yet" line as a season nobody has run yet.
  const topStreak = rows.length > 0 ? leaderBy(rows, row => row.streakLongest ?? 0) : null;
  const topStreakDays = topStreak?.streakLongest ?? 0;

  async function simulateEnd(winnerName) {
    await leaderboardService.simulateSeasonEnd({ winnerName });
  }

  return (
    <Screen bodyClassName="flex flex-col items-center justify-center" right={countdown}>
      <div className="relative w-full max-w-[1180px] pt-[20px]">
        <div className="overflow-hidden rounded-panel border-4 border-edge-strong bg-surface shadow-[0_10px_0_var(--color-warm-deep)]">
          <div className="h-[54px] bg-track" />

          {rows.length === 0 ? (
            <p className="px-[26px] pt-[6px] pb-[24px] text-[14px] font-bold text-ink-muted">No standings yet.</p>
          ) : (
            <div role="table">
              <div
                className={`${COLUMNS} px-[16px] pt-[6px] pb-[2px] text-[10.5px] font-extrabold tracking-[.08em] text-ink-muted-soft uppercase`}
                role="row"
              >
                <span role="columnheader">#</span>
                <span role="columnheader">Player</span>
                <span className="text-right" role="columnheader">Territories</span>
                <span className="text-right" role="columnheader">Battles</span>
                <span className="text-right" role="columnheader">Study time</span>
              </div>

              <div className="flex flex-col gap-[9px] px-[12px] pt-[6px] pb-[16px]" role="rowgroup">
                {rows.map((row, index) => {
                  const isMe = row.userId === me.userId;
                  const isLeader = index === 0;
                  // When a row is both, the blue "you" tint wins the fill and
                  // border (identity beats placement) while rank 1 keeps its
                  // hard shadow and gold numeral, so the row still reads as
                  // the leader.
                  const tint = isMe
                    ? 'bg-[#E4F1F9] border-[#B6D8EC]'
                    : isLeader
                      ? 'bg-[#F7DFA8] border-[#DDB264]'
                      : 'bg-muted border-[#EFE3CD]';
                  return (
                    <div
                      className={`${COLUMNS} p-row-lift items-center rounded-tile border-2 px-[14px] py-[12px] ${tint}`}
                      key={row.userId}
                      role="row"
                      style={isLeader ? { boxShadow: '0 4px 0 #E5C489' } : undefined}
                    >
                      <span
                        className={`font-display text-[22px] font-extrabold ${isLeader ? 'text-[#B4771A]' : 'text-[#8A6234]'}`}
                        role="cell"
                      >
                        {index + 1}
                      </span>
                      <span className="flex items-center gap-[12px]" role="cell">
                        <PlayerAvatar row={row} size={38} />
                        <span className="font-display text-[19px] font-extrabold text-ink">{row.name}</span>
                        {isMe && (
                          <span className="rounded-full border-2 border-blue-edge bg-blue px-[9px] py-[3px] text-[10px] font-extrabold text-[#12314F]">
                            you
                          </span>
                        )}
                      </span>
                      <span className="text-right" role="cell">
                        <span className="block font-display text-[20px] font-extrabold text-ink">{row.territories}</span>
                        <span className="block text-[10.5px] font-bold text-ink-muted-soft">
                          {row.cellsA} A + {row.cellsB} B + {row.cellsC} C
                        </span>
                      </span>
                      <span className="text-right font-display text-[18px] font-extrabold text-ink-body-soft" role="cell">
                        {row.battlesWon}
                      </span>
                      <span className="text-right font-display text-[18px] font-extrabold text-ink-body-soft" role="cell">
                        {formatStudy(row.secondsStudied)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-title-pill top-0 left-1/2 -translate-x-1/2 px-[34px] py-[9px] text-[20px]">
          {realm?.name ?? 'Standings'}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-[26px] flex w-full max-w-[1180px] gap-[16px]">
          <AwardCard
            highlight
            label="Most territory"
            row={topTerritory}
            value={
              topTerritory.territories > 0
                ? `${topTerritory.name} · ${topTerritory.territories} ${topTerritory.territories === 1 ? 'cell' : 'cells'}`
                : 'No one yet'
            }
          />
          <AwardCard
            label="Longest streak"
            row={topStreak}
            value={
              topStreakDays > 0
                ? `${topStreak.name} · ${topStreakDays} ${topStreakDays === 1 ? 'day' : 'days'}`
                : 'No one yet'
            }
          />
          <AwardCard
            label="Most study time"
            row={topStudy}
            value={topStudy.secondsStudied > 0 ? `${topStudy.name} · ${formatStudy(topStudy.secondsStudied)}` : 'No one yet'}
          />
        </div>
      )}

      {error && (
        <p className="mt-[16px] w-full max-w-[1180px] text-[13px] font-bold text-danger-ink" role="alert">
          {error.message}
        </p>
      )}

      {isMock && !ended && rows.length > 0 && (
        <div className="mt-[18px] flex w-full max-w-[1180px] items-center gap-[10px] border-t-2 border-edge-soft pt-[14px]">
          <span className="p-label">Dev only</span>
          <Button onClick={() => simulateEnd(me.name)} size="sm" variant="plain">
            End season — I win
          </Button>
          {otherChampion && (
            <Button onClick={() => simulateEnd(otherChampion)} size="sm" variant="plain">
              End season — I lose
            </Button>
          )}
        </div>
      )}
    </Screen>
  );
}
