import { request } from './http.js';

export function buy(unitType) {
  const payload = typeof unitType === 'object' ? unitType : { unitType };
  return request('/api/shop/buy', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getInventory() {
  return request('/api/shop/inventory');
}
