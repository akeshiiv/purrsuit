import Card from './Card.jsx';

// The player's daily quest. Renders nothing when there is no active quest
// (none assigned yet, or today's already completed — the card removes itself).
export default function DailyQuestCard({ quest }) {
  if (!quest) return null;

  const { title, description, reward, progress } = quest;
  const pct = progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Daily Quest</h2>
        <span className="text-xs font-semibold text-amber-600">+{reward} coins</span>
      </div>
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="text-sm text-slate-500">{description}</p>
      {progress && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
            <div className="h-full rounded bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-right text-xs text-slate-500">{progress.current}/{progress.target}</p>
        </div>
      )}
    </Card>
  );
}
