import { apiFetch } from './api.js';

const API_URL = import.meta.env.VITE_API_URL;

export const loginWithGoogle = () => {
  window.location.href = `${API_URL}/auth/google`;
};

export const logout = async () => {
  await apiFetch('/auth/logout', { method: 'POST' });
  window.location.href = '/';
};
