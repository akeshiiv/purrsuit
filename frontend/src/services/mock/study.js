import { actionsFor, bumpVersion, clone, mockError, state } from './state.js';

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

  return clone({
    coins: state.me.coins,
    secondsStudied: state.me.secondsStudied,
    actions: actionsFor(),
  });
}
