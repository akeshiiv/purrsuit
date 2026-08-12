import { request } from './http.js';

export function get() {
  return request('/api/profile');
}

// Accepts `{ name?, avatarUrl?, colour?, timeZone? }` — every field independent
// and optional, so a caller that only knows one of them (the start-up time-zone
// sync in AuthContext sends `timeZone` alone) cannot clobber the rest.
export function update(profile) {
  return request('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(profile),
  });
}
