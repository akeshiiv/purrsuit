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
    // HTTP/2 (e.g. Vercel) leaves statusText empty, and some backend errors carry
    // only `error` and no `message`, so fall back through both before the status
    // code to avoid surfacing a blank error to the user.
    const message = data?.message
      || data?.error
      || response.statusText
      || `Request failed with status ${response.status}`;
    const error = new Error(message);
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
