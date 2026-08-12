/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { loginWithGoogle, logout } from '../services/auth-service.js';
import { profileService } from '../services/index.js';
import { browserTz } from '../utils/time.js';

const AuthContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL;
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

// The browser is the only thing that knows the player's zone, and it moves when
// they travel — the server can only ever hold the copy the client last told it.
// Other people's leaderboard streaks are counted in *this* player's stored zone,
// so a stale copy quietly mis-counts a row that this player never looks at.
//
// The guard is a module-level flag rather than state or a ref on purpose: it has
// to outlive StrictMode's dev double-mount *and* every remount of the provider,
// and this runs once per loaded page — the one place in the app that is above
// every screen. Set before the first await, so a second call that arrives while
// the first is still in flight is a no-op rather than a duplicate PATCH.
let timeZoneSyncStarted = false;

async function syncStoredTimeZone() {
  if (timeZoneSyncStarted) return;
  timeZoneSyncStarted = true;

  try {
    const profile = await profileService.get();
    const tz = browserTz();
    // Only when they differ: the common case is a returning player who has not
    // moved, and that should cost nothing beyond the profile read.
    if (profile?.timeZone !== tz) {
      await profileService.update({ timeZone: tz });
    }
  } catch {
    // Deliberately silent and non-blocking. Nothing on screen depends on this
    // having happened, and the worst case is a streak that is a day off for
    // other viewers until the next login.
  }
}

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

  // Fire-and-forget: no await, no state, nothing rendered from the result.
  useEffect(() => {
    if (loggedIn) syncStoredTimeZone();
  }, [loggedIn]);

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
