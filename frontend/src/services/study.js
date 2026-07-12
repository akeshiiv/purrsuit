import { request } from './http.js';

export function complete(durationMinutes) {
  const payload = typeof durationMinutes === 'object'
    ? durationMinutes
    : { durationMinutes };

  return request('/api/study/complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getStats(tz) {
  const query = tz ? `?tz=${encodeURIComponent(tz)}` : '';
  return request(`/api/study/stats${query}`);
}
