// thin fetch wrapper that handles credentialed requests and CSRF
const API_URL = import.meta.env.VITE_API_URL;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken = null;
// The in-flight token fetch, so concurrent mutations share one. Each call to
// GET /api/csrf-token issues a NEW signed cookie, so two requests racing here
// both fetched, the second cookie overwrote the first, and the first request
// then sent a token its cookie no longer matched — a guaranteed 403 that burned
// the single retry below on a request that had done nothing wrong.
let csrfPending = null;

function fetchCsrfToken() {
  if (!csrfPending) {
    csrfPending = fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          // Tagged so services/http.js does not fold it into the generic
          // "Can't reach Purrsuit. Check your connection." — the request here
          // completed, it was refused, and telling the user to check their
          // connection sends them after the wrong problem.
          const error = new Error("Purrsuit couldn't start a secure session. Refresh and try again.");
          error.code = 'CSRF_UNAVAILABLE';
          error.status = res.status;
          throw error;
        }
        csrfToken = (await res.json()).csrfToken;
        return csrfToken;
      })
      .finally(() => { csrfPending = null; });
  }
  return csrfPending;
}

// Called when the server rules that the session cookie is gone or invalid, so
// the app can return to the sign-in screen instead of showing an auth error on
// whatever page happens to be open. AuthContext registers the handler; kept as a
// module-level hook because this layer sits underneath React.
let onUnauthenticated = null;
export function setUnauthenticatedHandler(handler) {
  onUnauthenticated = handler;
}

export async function apiFetch(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase();
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;

  const send = async () => {
    const headers = { ...(options.headers ?? {}) };
    if (MUTATING.has(method)) {
      if (!csrfToken) await fetchCsrfToken();
      headers['x-csrf-token'] = csrfToken;
    }
    return fetch(url, { ...options, method, headers, credentials: 'include' });
  };

  let res = await send();

  // Retry only an actual CSRF rejection. 403 is also how the API says NOT_ADMIN,
  // so retrying every 403 replayed non-idempotent POSTs — a kick or an
  // end-season the caller was never allowed to make was sent twice — and threw
  // away a valid token each time. The backend tags the CSRF case as
  // CSRF_INVALID (index.js), which is what distinguishes the two.
  if (res.status === 403 && MUTATING.has(method) && await isCsrfRejection(res)) {
    csrfToken = null;
    res = await send();
  }

  if (res.status === 401) onUnauthenticated?.();
  return res;
}

// Reads the body to tell a stale CSRF token from a genuine authorization
// refusal. The response is cloned so the caller still gets an unread body.
async function isCsrfRejection(res) {
  try {
    const data = await res.clone().json();
    return data?.error === 'CSRF_INVALID';
  } catch {
    // A 403 with no readable JSON body is not the API's CSRF envelope — most
    // likely an edge/proxy refusal. Retrying it would not help.
    return false;
  }
}
