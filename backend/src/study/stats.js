// Pure study-stats math — no DB, no Express. Aggregation happens in SQL
// (src/study/service.js); this module derives the response shape and computes
// the streak, so the rules can be unit-tested in isolation (matches coins.js /
// profile.js).

// Return `tz` when it is a valid IANA time zone, otherwise 'UTC'. Guards the
// SQL `AT TIME ZONE` argument and normalises absent/garbage input.
export function normalizeTz(tz) {
  if (typeof tz !== 'string' || tz.length === 0) return 'UTC';
  try {
    // Throws RangeError for an unknown time zone.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

// Assemble a StatBlock from raw SQL aggregates, adding zero-guarded rounded
// averages. `avgSecondsPerActiveDay` is the "average study hours" metric
// (total study time / distinct days studied).
export function buildStatBlock({ totalSeconds = 0, sessionCount = 0, totalCoins = 0, activeDays = 0 } = {}) {
  return {
    totalSeconds,
    sessionCount,
    totalCoins,
    avgSessionSeconds: sessionCount > 0 ? Math.round(totalSeconds / sessionCount) : 0,
    activeDays,
    avgSecondsPerActiveDay: activeDays > 0 ? Math.round(totalSeconds / activeDays) : 0,
  };
}

// Days since the Unix epoch for a 'YYYY-MM-DD' string. Date.UTC makes this
// deterministic and time-zone-safe for differencing calendar dates.
function dayIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

// Study streak from a list of local study days. `current` is the run ending on
// the most recent study day, counted only if that day is `today` or the day
// before (grace through today); otherwise 0. `longest` is the longest run of
// consecutive calendar days ever.
export function computeStreak(days, today) {
  const indices = [...new Set(days)].map(dayIndex).sort((a, b) => a - b);
  if (indices.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < indices.length; i += 1) {
    run = indices[i] === indices[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const todayIndex = dayIndex(today);
  const last = indices[indices.length - 1];
  let current = 0;
  if (last === todayIndex || last === todayIndex - 1) {
    current = 1;
    for (let i = indices.length - 1; i > 0; i -= 1) {
      if (indices[i] === indices[i - 1] + 1) current += 1;
      else break;
    }
  }

  return { current, longest };
}
