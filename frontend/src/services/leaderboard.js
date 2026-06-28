import { request, withSince } from './http.js';

export function get(since) {
  return request(withSince('/api/realm/leaderboard', since));
}

export function seasonStatus() {
  return request('/api/realm/season-status');
}

export function seasonAck() {
  return request('/api/realm/season-ack', { method: 'POST' });
}
