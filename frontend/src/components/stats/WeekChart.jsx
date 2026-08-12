// "Last 7 days" — seven bars, oldest on the left, today on the right.
//
// The series is `last7Days` from GET /api/study/stats: seven `{ date, minutes }`
// entries the server already bucketed into the time zone we asked it for. Each
// bar is therefore labelled from the date it describes rather than from an
// offset counted off the browser's clock, which is the only way the labels stay
// honest across a midnight or a zone the server disagrees with.
//
// A deployed backend older than this client omits the field, so the unavailable
// state stays as the fallback rather than becoming a row of silent zeroes.

const WEEK_LENGTH = 7;
const BAR_MAX_PX = 96; // the design's full-height bar
const STUB_PX = 8; // a zero day is a visible stub, never a gap
const REFERENCE_MINUTES = 60; // a 1h day fills the bar; taller days rescale

function weekdayFormat() {
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
  } catch {
    return null;
  }
}

// `new Date('2026-08-12')` is parsed as UTC midnight, which is the *previous*
// day everywhere west of Greenwich — so a local calendar date has to be rebuilt
// from its parts or every label west of London slides back one weekday.
function localDate(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!parts) return null;
  const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function labelFor(date, format) {
  return format ? format.format(date) : String(date.getDate());
}

// Anything short of a full, well-formed week is treated as "not available"
// rather than partially drawn: half a chart reads as real data.
function toBars(last7Days) {
  if (!Array.isArray(last7Days) || last7Days.length !== WEEK_LENGTH) return null;
  const format = weekdayFormat();
  const bars = [];
  for (const entry of last7Days) {
    const date = localDate(entry?.date);
    const minutes = Number(entry?.minutes);
    if (!date || !Number.isFinite(minutes)) return null;
    bars.push({ key: entry.date, label: labelFor(date, format), minutes: Math.max(0, minutes) });
  }
  return bars;
}

// With no series there are no dates to read, so the unavailable state falls back
// to counting the last seven days off today just to label the empty stubs.
function placeholderBars(today = new Date()) {
  const format = weekdayFormat();
  return Array.from({ length: WEEK_LENGTH }, (_, index) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (WEEK_LENGTH - 1 - index));
    return { key: `placeholder-${index}`, label: labelFor(day, format), minutes: 0 };
  });
}

export default function WeekChart({ last7Days = null }) {
  const series = toBars(last7Days);
  const bars = series ?? placeholderBars();
  const peak = Math.max(REFERENCE_MINUTES, ...bars.map(bar => bar.minutes));

  return (
    <div className="flex w-[400px] flex-none flex-col rounded-panel border-4 border-edge bg-surface px-[26px] py-[24px] shadow-[0_10px_0_var(--color-warm)]">
      <p className="p-label">Last 7 days</p>
      <div className="mt-[16px] flex min-h-[120px] flex-1 items-end gap-[12px]">
        {bars.map(bar => {
          const height = bar.minutes > 0
            ? Math.max(STUB_PX, Math.round((bar.minutes / peak) * BAR_MAX_PX))
            : STUB_PX;
          return (
            <div className="flex flex-1 flex-col items-center gap-[6px]" key={bar.key}>
              <div
                className={
                  bar.minutes > 0
                    ? 'w-full rounded-t-[8px] rounded-b-[4px] border-2 border-[#C08D45] bg-linear-to-b from-gold-pale to-gold-deep'
                    : 'w-full rounded-t-[8px] rounded-b-[4px] border-2 border-edge-soft bg-[#F0E4CC]'
                }
                style={{ height }}
              />
              <span className="text-[10px] font-extrabold text-ink-muted-soft">{bar.label}</span>
            </div>
          );
        })}
      </div>
      {!series && (
        <p className="mt-[10px] text-[11.5px] font-bold text-ink-muted">Daily history isn&rsquo;t tracked yet</p>
      )}
    </div>
  );
}
