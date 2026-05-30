import { createContext, useContext, useState, useEffect } from 'react';
import { loginWithGoogle, logout } from '../services/auth-service.js';

const AuthContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL;

export function AuthProvider({ children }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(r => setLoggedIn(r.ok))
      .catch(() => setLoggedIn(false))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    setLoggedIn(false);
  };

  if (loading) return null; // can be a cute loading page instead

  return (
    <AuthContext.Provider value={{ loggedIn, loginWithGoogle, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);