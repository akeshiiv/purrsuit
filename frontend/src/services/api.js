// thin fetch wrapper that handles credentialed requests and CSRF
const API_URL = import.meta.env.VITE_API_URL;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken = null;

async function fetchCsrfToken() {
  const res = await fetch(`${API_URL}/api/csrf-token`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch CSRF token');
  csrfToken = (await res.json()).csrfToken;
  return csrfToken;
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
  if (res.status === 403 && MUTATING.has(method)) {
    csrfToken = null; // token likely stale — refresh and retry once
    res = await send();
  }
  return res;
}
