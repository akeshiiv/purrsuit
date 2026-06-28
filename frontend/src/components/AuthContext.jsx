/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { loginWithGoogle, logout } from '../services/auth-service.js';

const AuthContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL;
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export function AuthProvider({ children }) {
  const [loggedIn, setLoggedIn] = useState(USE_MOCK);
  const [loading, setLoading] = useState(!USE_MOCK);

  useEffect(() => {
    if (USE_MOCK) {
      return undefined;
    }

    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(r => setLoggedIn(r.ok))
      .catch(() => setLoggedIn(false))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    if (USE_MOCK) {
      setLoggedIn(false);
      return;
    }

    await logout();
    setLoggedIn(false);
  };

  if (loading) return null; // can be a cute loading page instead

  return (
    <AuthContext.Provider
      value={{
        loggedIn,
        loginWithGoogle: USE_MOCK ? () => setLoggedIn(true) : loginWithGoogle,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
