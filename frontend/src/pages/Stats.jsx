import { useEffect, useMemo, useState } from 'react';
import Screen from '../components/layout/Screen.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import WeekChart from '../components/stats/WeekChart.jsx';
import { studyService } from '../services/index.js';
import { browserTz, formatStudy } from '../utils/time.js';

function StatTile({ label, value }) {
  return (
    <div className="rounded-card border-3 border-edge bg-surface px-[26px] pt-[26px] pb-[28px] shadow-[0_7px_0_var(--color-warm)]">
      <p className="p-label">{label}</p>
      <p className="mt-[8px] font-display text-[38px] leading-none font-extrabold text-ink">{value}</p>
    </div>
  );
}

function ScopeOption({ active, disabled = false, label, onSelect }) {
  return (
    <button
      aria-pressed={active}
      className={[
        'rounded-full border-2 px-[18px] py-[7px] font-display text-[14px] font-extrabold',
        active ? 'border-gold-edge bg-gold text-ink-body' : 'border-transparent text-ink-muted',
        disabled ? 'cursor-not-allowed opacity-45' : '',
      ].join(' ')}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      {label}
    </button>
  );
}

// The header's context cluster on this screen: an All-time / Season segmented
// control on the same `#F5E7CC` track as the tab bar. Season stays disabled
// until there is a season to scope to, with the reason stated inline.
function ScopeToggle({ scope, onScope, hasSeason }) {
  return (
    <div className="flex flex-col items-end gap-[4px]">
      <div className="flex gap-[4px] rounded-full border-3 border-edge-soft bg-track p-[5px]">
        <ScopeOption active={scope === 'allTime'} label="All-time" onSelect={() => onScope('allTime')} />
        <ScopeOption
          active={scope === 'season' && hasSeason}
          disabled={!hasSeason}
          label="Season"
          onSelect={() => onScope('season')}
        />
      </div>
      {!hasSeason && (
        <span className="text-[10.5px] font-extrabold text-ink-muted">No active season to scope to</span>
      )}
    </div>
  );
}

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState('allTime');

  // `attempt` is what makes the error state recoverable: without it the effect
  // never re-runs, so a single flaky read left this screen permanently stuck on
  // "Stats unavailable" with nothing to press — the same dead end RequireRealm
  // used to have, and for the same reason.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await studyService.getStats(browserTz());
        if (active) setStats(data);
      } catch (caught) {
        if (active) setError(caught);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [attempt]);

  const hasSeason = Boolean(stats?.season);
  const block = useMemo(() => {
    if (!stats) return null;
    return scope === 'season' && stats.season ? stats.season : stats.allTime;
  }, [stats, scope]);

  const toggle = <ScopeToggle hasSeason={hasSeason} onScope={setScope} scope={scope} />;

  if (loading) {
    return (
      <Screen bodyClassName="flex flex-col items-center justify-center" right={toggle}>
        <Card className="px-6 py-5 text-[15px] text-ink-muted">Loading stats...</Card>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen bodyClassName="flex flex-col items-center justify-center" right={toggle}>
        <Card className="max-w-[520px] px-7 py-6">
          <h1 className="font-display text-[26px] font-extrabold text-ink">Stats unavailable</h1>
          <p className="mt-[8px] text-[14px] font-bold text-danger-ink" role="alert">{error.message}</p>
          <Button
            className="mt-[18px]"
            onClick={() => setAttempt(n => n + 1)}
            variant="blue"
          >
            Try again
          </Button>
        </Card>
      </Screen>
    );
  }

  const streakDays = stats.streak.current;
  const longestDays = stats.streak.longest;

  return (
    <Screen bodyClassName="flex flex-col items-center justify-center gap-[22px]" right={toggle}>
      <div className="flex w-full max-w-[1180px] gap-[22px]">
        <div className="flex flex-1 items-center gap-[28px] rounded-panel border-4 border-edge-strong bg-linear-to-b from-surface to-[#F5E3C4] px-[34px] py-[30px] shadow-[0_10px_0_var(--color-warm-deep)]">
          <div className="flex size-[132px] flex-none items-center justify-center rounded-full border-4 border-[#C08D45] bg-gold">
            <span className="p-nums text-[58px] text-ink-body">{streakDays}</span>
          </div>
          <div>
            <p className="p-label">Study streak</p>
            <p className="mt-[3px] font-display text-[32px] leading-[1.1] font-extrabold text-ink">
              {streakDays} {streakDays === 1 ? 'day' : 'days'} in a row!
            </p>
            <p className="mt-[5px] text-[13px] font-bold text-ink-muted">
              Longest: {longestDays} {longestDays === 1 ? 'day' : 'days'} · miss a day and it resets
            </p>
          </div>
        </div>

        {/* All-time on both toggle positions: the card is "Last 7 days", not
            "last 7 days of the season". */}
        <WeekChart last7Days={stats.last7Days} />
      </div>

      <div className="grid w-full max-w-[1180px] grid-cols-3 gap-[22px]">
        <StatTile label="Total study time" value={formatStudy(block.totalSeconds)} />
        <StatTile label="Average per day" value={formatStudy(block.avgSecondsPerActiveDay)} />
        <StatTile label="Total sessions" value={block.sessionCount} />
        <StatTile label="Average session" value={formatStudy(block.avgSessionSeconds)} />
        <StatTile label="Coins earned" value={(block.totalCoins ?? 0).toLocaleString()} />
        <StatTile label="Days studied" value={block.activeDays} />
      </div>

      {block.sessionCount === 0 && (
        <p className="w-full max-w-[1180px] text-[13px] font-bold text-ink-muted">
          Complete a study session to build your STREAK!
        </p>
      )}
    </Screen>
  );
}
