import Card from './Card.jsx';

// The player's daily quest. Renders nothing when there is no active quest
// (none assigned yet, or today's already completed — the card removes itself).
export default function DailyQuestCard({ quest, className = '' }) {
  if (!quest) return null;

  const { title, description, reward, progress } = quest;
  const pct = progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;

  return (
    <Card className={`flex-none rounded-[22px] px-4 pt-[14px] pb-4 ${className}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[15px] font-extrabold text-ink">Daily Quest</h2>
        <span className="text-[11px] font-extrabold text-[#C9862B]">+{reward} coins</span>
      </div>
      <p className="mt-[6px] mb-px text-[13px] font-extrabold text-ink-body-soft">{title}</p>
      <p className="text-[11.5px] font-semibold text-ink-muted">{description}</p>
      {progress && (
        <>
          <div className="mt-[10px] h-3 overflow-hidden rounded-full border-2 border-edge-soft bg-[#EEE0C4]">
            <div
              className="h-full bg-linear-to-b from-gold-pale to-gold-deep transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-[5px] text-right text-[10.5px] font-extrabold text-ink-muted-soft">
            {progress.current} / {progress.target}
          </p>
        </>
      )}
    </Card>
  );
}
