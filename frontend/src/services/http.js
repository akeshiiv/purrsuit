import { apiFetch } from './api.js';

/**
 * A request that never completed — offline, DNS, TLS, a dropped connection.
 * `fetch` rejects with the browser's own wording ("Failed to fetch" on Chrome,
 * "Load failed" on Safari), which reads as a crash rather than a condition the
 * user can act on. Every page surfaces `error.message` directly, so the
 * replacement belongs here rather than at ~20 call sites.
 */
function networkError() {
  const error = new Error("Can't reach Purrsuit — check your connection and try again.");
  error.code = 'NETWORK_UNREACHABLE';
  return error;
}

/**
 * A completed response whose body isn't JSON — typically a proxy or gateway
 * error page arriving as HTML. `JSON.parse` throws a SyntaxError whose message
 * ("Unexpected token '<'…") would otherwise reach the user verbatim.
 */
function badResponseError(status) {
  const error = new Error('Purrsuit sent back something unreadable. Try again in a moment.');
  error.code = 'BAD_RESPONSE';
  error.status = status;
  return error;
}

export async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  let text;
  try {
    response = await apiFetch(path, { ...options, headers });
    text = await response.text();
  } catch {
    throw networkError();
  }

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw badResponseError(response.status);
    }
  }

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
