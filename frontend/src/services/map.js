import { request, withSince } from './http.js';

export function getMap(since) {
  return request(withSince('/api/realm/map', since));
}

export function attack(intent) {
  return request('/api/realm/attack', {
    method: 'POST',
    body: JSON.stringify(intent),
  });
}

export function defend(intent) {
  return request('/api/realm/defend', {
    method: 'POST',
    body: JSON.stringify(intent),
  });
}
