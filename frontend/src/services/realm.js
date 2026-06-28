import { request } from './http.js';

export function getCurrent() {
  return request('/api/realms/current');
}

export function create(settings) {
  return request('/api/realms', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

export function join(joinCode) {
  const payload = typeof joinCode === 'string' ? { joinCode } : joinCode;
  return request('/api/realms/join', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function leave() {
  return request('/api/realms/leave', { method: 'POST' });
}

export function kick(id, userId) {
  return request(`/api/realms/${id}/kick`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function endSeason(id) {
  return request(`/api/realms/${id}/end-season`, { method: 'POST' });
}

export function updateSettings(id, settings) {
  return request(`/api/realms/${id}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}
