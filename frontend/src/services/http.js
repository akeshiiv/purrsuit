import { apiFetch } from './api.js';

export async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await apiFetch(path, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || response.statusText);
    error.status = response.status;
    error.code = data?.error;
    error.payload = data;
    throw error;
  }

  return data;
}

export function withSince(path, since) {
  if (since === null || since === undefined) return path;
  return `${path}?since=${encodeURIComponent(since)}`;
}
