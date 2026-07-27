import { actionsFor, advanceMockQuest, bumpVersion, clone, mockError, state } from './state.js';
import { DISTRACTION_REASONS } from '../../focusGuard/contract.js';

export async function terminate(input = {}) {
  const minutes = Number(input.durationMinutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) {
    throw mockError('INVALID_DURATION', 'Study duration must be 5 to 120 minutes.', 400);
  }
  if (!DISTRACTION_REASONS.includes(input.reason)) {
    throw mockError('INVALID_REASON', 'Unknown distraction reason.', 400);
  }
  return clone({ logged: true });
}

export async function complete(durationMinutes) {
  const payload = typeof durationMinutes === 'object'
    ? durationMinutes
    : { durationMinutes };
  const minutes = Number(payload.durationMinutes);

  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) {
    throw mockError('INVALID_DURATION', 'Study duration must be 5 to 120 minutes.');
  }
  if (!state.realm || state.season.status !== 'active') {
    throw mockError('NOT_IN_ACTIVE_SEASON', 'Join an active season before studying.', 409);
  }

  state.me.coins += minutes * 4;
  state.me.secondsStudied += minutes * 60;
  bumpVersion();

  const quest = advanceMockQuest('study.complete');
  return clone({
    coins: state.me.coins,
    secondsStudied: state.me.secondsStudied,
    actions: actionsFor(),
    ...(quest.questCompleted ? { questCompleted: quest.questCompleted } : {}),
  });
}

// A plausible, deterministic StudyStats derived from mock state. The mock has
// no real session log, so all-time is a fixed baseline plus the current
// season's studied time; the streak is a fixed sample.
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
    streak: { current: 4, longest: 9 },
    allTime,
    season,
  });
}
