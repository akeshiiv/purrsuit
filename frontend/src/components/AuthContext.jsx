/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useState, useEffect } from 'react';
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
// the first is still in flight is a no-op rather than a duplicate PATCH. The
// profile read that feeds this now lives in `refreshProfile`, outside the guard:
// a repeated GET is idempotent, and it is the write that must happen once.
//
// Returns the updated profile when it wrote one, so the caller can hold the copy
// the server now has rather than the pre-PATCH one it passed in; null otherwise.
let timeZoneSyncStarted = false;

async function syncStoredTimeZone(profile) {
  if (timeZoneSyncStarted) return null;
  timeZoneSyncStarted = true;

  try {
    const tz = browserTz();
    // Only when they differ: the common case is a returning player who has not
    // moved, and that should cost nothing beyond the profile read.
    if (profile?.timeZone === tz) return null;
    return await profileService.update({ timeZone: tz });
  } catch {
    // Deliberately silent and non-blocking. Nothing on screen depends on this
    // having happened, and the worst case is a streak that is a day off for
    // other viewers until the next login.
    return null;
  }
}

export function AuthProvider({ children }) {
  const [loggedIn, setLoggedIn] = useState(USE_MOCK);
  const [loading, setLoading] = useState(!USE_MOCK);
  // The signed-in player's own profile, held here because it is chrome-level
  // data: the header's account button rides above every screen and needs the
  // avatar, colour and id. Screens that edit the profile call `refreshProfile`
  // so the button reflects the save without a reload.
  const [profile, setProfile] = useState(null);

  const refreshProfile = useCallback(async () => {
    try {
      const loaded = await profileService.get();
      setProfile(loaded);
      return loaded;
    } catch {
      // Same reasoning as the time-zone sync: the button falls back to the
      // seeded cat art, and no screen's own data depends on this read.
      return null;
    }
  }, []);

  useEffect(() => {
    if (USE_MOCK) {
      return undefined;
    }

    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(r => setLoggedIn(r.ok))
      .catch(() => setLoggedIn(false))
      .finally(() => setLoading(false));
  }, []);

  // One profile read per sign-in, feeding both the header button and the
  // time-zone sync. The sync stays fire-and-forget — nothing on screen waits on
  // it — but its result is kept when it wrote, so state matches the server.
  useEffect(() => {
    if (!loggedIn) {
      timeZoneSyncStarted = false;
      return undefined;
    }

    let active = true;
    (async () => {
      const loaded = await refreshProfile();
      if (!active || !loaded) return;
      const synced = await syncStoredTimeZone(loaded);
      if (active && synced) setProfile(synced);
    })();

    return () => {
      active = false;
    };
  }, [loggedIn, refreshProfile]);

  // Dropping the profile is part of signing out, not something to derive from
  // `loggedIn` in an effect: the next player to sign in on this browser must not
  // see the previous one's avatar in the header while their own profile loads.
  const handleLogout = async () => {
    if (USE_MOCK) {
      setProfile(null);
      setLoggedIn(false);
      return;
    }

    await logout();
    setProfile(null);
    setLoggedIn(false);
  };

  if (loading) return null; // can be a cute loading page instead

  return (
    <AuthContext.Provider
      value={{
        loggedIn,
        profile,
        refreshProfile,
        loginWithGoogle: USE_MOCK ? () => setLoggedIn(true) : loginWithGoogle,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
