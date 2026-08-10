import { request } from './http.js';

// The server owns the session clock now. `start` issues the key the countdown
// runs against, and `complete` names that key instead of claiming a duration —
// the award is derived from the row, so a finished countdown is the only thing
// that can be cashed in.
export function start({ durationMinutes }) {
  return request('/api/study/start', {
    method: 'POST',
    body: JSON.stringify({ durationMinutes }),
  });
}

export function complete({ sessionKey }) {
  return request('/api/study/complete', {
    method: 'POST',
    body: JSON.stringify({ sessionKey }),
  });
}

export function getStats(tz) {
  const query = tz ? `?tz=${encodeURIComponent(tz)}` : '';
  return request(`/api/study/stats${query}`);
}

export function terminate(input) {
  return request('/api/study/terminate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
