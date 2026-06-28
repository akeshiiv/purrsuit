import { request } from './http.js';

export function get() {
  return request('/api/profile');
}

export function update(profile) {
  return request('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(profile),
  });
}
