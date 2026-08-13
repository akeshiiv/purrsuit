import { apiFetch } from './api.js';

const API_URL = import.meta.env.VITE_API_URL;

export const loginWithGoogle = () => {
  window.location.href = `${API_URL}/auth/google`;
};

// Clearing the cookie is the whole job, and only the server can do it, so the
// response has to be checked. apiFetch resolves for any status — it returns the
// Response rather than throwing — so this used to navigate away from a 429 (the
// /auth budget is 50 per IP per 15 min, easy to exhaust behind NAT) or a CSRF
// failure exactly as it did from a success. The `token` cookie survived, and the
// reload landed straight back in the signed-in app with the session intact:
// a logout that reported nothing wrong and did nothing at all.
export const logout = async () => {
  const res = await apiFetch('/auth/logout', { method: 'POST' });
  if (!res.ok) {
    const error = new Error("Couldn't sign you out. Try again in a moment.");
    error.status = res.status;
    throw error;
  }
  window.location.href = '/';
};
