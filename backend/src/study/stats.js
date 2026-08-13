// Pure study-stats math — no DB, no Express. Aggregation happens in SQL
// (src/study/service.js); this module derives the response shape and computes
// the streak, so the rules can be unit-tested in isolation (matches coins.js /
// profile.js).
import { isValidTimeZone } from '../profile.js';

// Return `tz` when it is a valid IANA time zone, otherwise 'UTC'. Guards the
// SQL `AT TIME ZONE` argument and normalises absent/garbage input.
//
// Shares one predicate with the PATCH /api/profile validator rather than
// probing ICU again here. The two had drifted: this copy accepted a bare UTC
// offset ('+05:30') because ICU formats one happily, while isValidTimeZone
// rejects it on purpose — Postgres reads a signed offset by the POSIX
// convention, so `AT TIME ZONE '+05:30'` shifts the opposite way from what the
// caller means and silently moves every day boundary. The `?tz=` query
// parameter on GET /api/study/stats reaches this directly from the client.
//
// What still differs is the response to a bad value, which is the point of the
// two names: a tolerant read falls back to UTC (a junk `?tz=` must not 500 the
// stats page), while an explicit write refuses.
export function normalizeTz(tz) {
  return isValidTimeZone(tz) ? tz : 'UTC';
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

// Inverse of dayIndex. Walking the window by epoch-day index rather than by
// Date arithmetic is what keeps month ends and DST out of it: these are
// calendar labels the database already resolved in the user's zone, not
// instants.
function dayString(index) {
  return new Date(index * 86400000).toISOString().slice(0, 10);
}

const SERIES_DAYS = 7;

// The per-day study series behind the "Last 7 days" chart. `rows` are the
// grouped local days from SQL ({ day, seconds }); `today` is that same local
// calendar day. SQL only returns days the user actually studied, so the zero
// fill has to happen here — the chart needs a bar for every day, including the
// empty ones, or it silently redraws a week as five days.
//
// Always exactly SERIES_DAYS entries, oldest first, so the last element is
// today and the client can index the window without recomputing dates.
export function buildLast7Days(rows, today) {
  const secondsByDay = new Map();
  for (const row of rows ?? []) {
    if (typeof row?.day !== 'string') continue;
    // Added rather than assigned: the query groups by day, but summing means an
    // ungrouped row-per-session input would still produce the right total.
    secondsByDay.set(row.day, (secondsByDay.get(row.day) ?? 0) + (Number(row.seconds) || 0));
  }

  const todayIndex = dayIndex(today);
  const series = [];
  for (let offset = SERIES_DAYS - 1; offset >= 0; offset -= 1) {
    const date = dayString(todayIndex - offset);
    // Rounded after summing, so a day of short sessions is not rounded away one
    // session at a time.
    series.push({ date, minutes: Math.round((secondsByDay.get(date) ?? 0) / 60) });
  }
  return series;
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
