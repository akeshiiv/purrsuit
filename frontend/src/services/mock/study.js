import { actionsFor, advanceMockQuest, bumpVersion, clone, mockError, state } from './state.js';
import { DISTRACTION_REASONS } from '../../brainrotDoctor/contract.js';
import { COINS_PER_MINUTE } from '../../components/units.js';

// Mirrors the server constants: the grace absorbs clock skew and countdown
// rounding, the claim window bounds how long a finished session stays cashable.
const START_GRACE_MS = 60_000;
const CLAIM_WINDOW_MS = 15 * 60_000;

function validDuration(minutes) {
  return Number.isInteger(minutes) && minutes >= 5 && minutes <= 120;
}

function requireActiveSeason() {
  if (!state.realm || state.season.status !== 'active') {
    throw mockError('NOT_IN_ACTIVE_SEASON', 'Join an active season before studying.', 409);
  }
}

// The real column is a `uuid`, so a malformed key is a bad request rather than a
// lookup that happens to miss — same distinction the server draws.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeSessionKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function findSession(sessionKey) {
  if (!sessionKey) return undefined;
  return state.studySessions.find(session => session.sessionKey === sessionKey);
}

export async function start(input = {}) {
  const minutes = Number(input.durationMinutes);
  if (!validDuration(minutes)) {
    throw mockError('INVALID_DURATION', 'Study duration must be 5 to 120 minutes.', 400);
  }
  requireActiveSeason();

  // At most one live session per player is what makes the reward non-farmable:
  // opening a new one abandons whatever was still pending.
  for (const session of state.studySessions) {
    if (session.status === 'pending') session.status = 'abandoned';
  }

  const startedAt = Date.now();
  const eligibleAt = startedAt + minutes * 60_000 - START_GRACE_MS;
  const session = {
    sessionKey: crypto.randomUUID(),
    durationMinutes: minutes,
    status: 'pending',
    startedAt,
    eligibleAt,
    expiresAt: eligibleAt + CLAIM_WINDOW_MS,
    completedAt: null,
    coinsAwarded: null,
  };
  state.studySessions.push(session);

  return clone({
    sessionKey: session.sessionKey,
    durationMinutes: minutes,
    startedAt: new Date(startedAt).toISOString(),
    eligibleAt: new Date(eligibleAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
}

export async function complete(input = {}) {
  const sessionKey = normalizeSessionKey(input?.sessionKey);
  if (!sessionKey) {
    throw mockError('INVALID_SESSION', 'A sessionKey from POST /api/study/start is required.', 400);
  }
  requireActiveSeason();

  const session = findSession(sessionKey);
  if (!session) {
    throw mockError('SESSION_NOT_FOUND', 'That study session does not exist.', 404);
  }
  if (session.status === 'completed') {
    // A retried request must never pay twice, and must never cost an honest user
    // the coins they already earned — replay the payload instead of crediting.
    return clone({
      coins: state.me.coins,
      secondsStudied: state.me.secondsStudied,
      actions: actionsFor(),
      alreadyCredited: true,
    });
  }
  if (session.status !== 'pending') {
    throw mockError('SESSION_NOT_CLAIMABLE', 'That study session can no longer be claimed.', 409);
  }

  const now = Date.now();
  if (now < session.eligibleAt) {
    throw mockError('SESSION_TOO_EARLY', 'That study session is not finished yet.', 409);
  }
  if (now > session.expiresAt) {
    throw mockError('SESSION_EXPIRED', 'That study session expired before it was claimed.', 409);
  }

  const minutes = session.durationMinutes;
  state.me.coins += minutes * COINS_PER_MINUTE;
  state.me.secondsStudied += minutes * 60;
  bumpVersion();

  session.status = 'completed';
  session.completedAt = now;
  session.coinsAwarded = minutes * COINS_PER_MINUTE;

  const quest = advanceMockQuest('study.complete');
  return clone({
    coins: state.me.coins,
    secondsStudied: state.me.secondsStudied,
    actions: actionsFor(),
    ...(quest.questCompleted ? { questCompleted: quest.questCompleted } : {}),
  });
}

export async function terminate(input = {}) {
  const sessionKey = normalizeSessionKey(input?.sessionKey);
  const claimsDuration = input?.durationMinutes !== undefined && input?.durationMinutes !== null;
  // With a key the attempted duration is on the row, so the field is optional —
  // but a caller that still sends one gets it validated exactly as before.
  if ((claimsDuration || !sessionKey) && !validDuration(Number(input?.durationMinutes))) {
    throw mockError('INVALID_DURATION', 'Study duration must be 5 to 120 minutes.', 400);
  }
  if (!DISTRACTION_REASONS.includes(input.reason)) {
    throw mockError('INVALID_REASON', 'Unknown distraction reason.', 400);
  }
  // Burn the row so a session BrainrotDoctor killed can never be completed later.
  const session = findSession(sessionKey);
  if (session && session.status === 'pending') session.status = 'terminated';
  return clone({ logged: true });
}

// A plausible, deterministic StudyStats derived from mock state. The mock has
// no real session log, so all-time is a fixed baseline plus the current
// season's studied time, and the streak and the seven-day series are seeded
// samples that agree with each other rather than aggregates of anything.
function statBlock(totalSeconds, sessionCount, totalCoins, activeDays) {
  return {
    totalSeconds,
    sessionCount,
    totalCoins,
    avgSessionSeconds: sessionCount > 0 ? Math.round(totalSeconds / sessionCount) : 0,
    activeDays,
    avgSecondsPerActiveDay: activeDays > 0 ? Math.round(totalSeconds / activeDays) : 0,
  };
}

// Minutes for the seven days the chart shows, oldest first — index 6 is today.
// The zero day is there so the design's flat `#F0E4CC` stub is always on
// screen, and the 90 outruns the chart's 1h reference bar so the rescaling is
// exercised too. The four days ending today are what `streak.current` counts.
const WEEK_MINUTES = [45, 30, 0, 90, 25, 50, 65];

function localIsoDate(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The real endpoint buckets these days in the `tz` it was handed; the mock has
// no session log to bucket, so it labels the sample with the browser's own
// local days — the same days the client would have asked for.
function lastSevenDays() {
  const today = new Date();
  return WEEK_MINUTES.map((minutes, index) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (6 - index));
    return { date: localIsoDate(day), minutes };
  });
}

export async function getStats() {
  const seasonSeconds = state.me?.secondsStudied ?? 0;
  const seasonSessions = seasonSeconds > 0 ? Math.max(1, Math.round(seasonSeconds / 1500)) : 0;
  const seasonCoins = seasonSessions * 100;
  const inActiveSeason = Boolean(state.realm) && state.season?.status === 'active';

  const season = inActiveSeason
    ? statBlock(seasonSeconds, seasonSessions, seasonCoins, Math.min(seasonSessions, 5))
    : null;

  const BASELINE_SECONDS = 180000; // ~50h of prior history
  const allTime = statBlock(
    BASELINE_SECONDS + seasonSeconds,
    30 + seasonSessions,
    12000 + seasonCoins,
    22 + (season ? season.activeDays : 0),
  );

  return clone({
    // The streak lives on the member row, so the Stats card and the Ranks
    // award card cannot drift apart in the mock the way they could if each
    // screen invented its own number.
    streak: { current: state.me?.streakCurrent ?? 0, longest: state.me?.streakLongest ?? 0 },
    allTime,
    season,
    last7Days: lastSevenDays(),
  });
}
