/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { loginWithGoogle, logout } from '../services/auth-service.js';
import { setUnauthenticatedHandler } from '../services/api.js';
import { profileService } from '../services/index.js';
import { browserTz } from '../utils/time.js';
import SessionUnavailable from './SessionUnavailable.jsx';

const AuthContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL;
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

// The only statuses that are the server's verdict on the cookie. Everything else
// a response can carry — 429 from a rate limiter, 5xx from a backend that is
// still waking up, a request that never completed — leaves the question
// unanswered, and an unanswered question is not a "no".
//
// Collapsing the two is how a signed-in player ends up looking at the sign-in
// screen after a refresh: this check is the sole source of session state and it
// runs on every page load, so one bad response is all it takes. The cookie is
// untouched and still valid; only the app's belief about it is wrong.
const SESSION_VERDICT_STATUSES = new Set([401, 403]);

// A cold serverless backend or a suspended database usually answers on the next
// try a moment later, so an unanswered check is worth repeating a couple of
// times before the app gives up and says so.
const SESSION_CHECK_RETRIES = 2;
const SESSION_RETRY_BASE_MS = 400;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// True/false when the server ruled on the cookie; throws when it did not, which
// is what separates "signed out" from "ask again".
async function readSession() {
  const response = await fetch(`${API_URL}/auth/me`, { credentials: 'include' });
  if (response.ok) return true;
  if (SESSION_VERDICT_STATUSES.has(response.status)) return false;
  throw new Error(`Session check failed with status ${response.status}`);
}

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
  // Four states, not a boolean pair: 'checking' and 'unavailable' are both
  // "not signed in" to a boolean, and only one of them should ever reach the
  // sign-in screen. `loggedIn` stays in the context value, derived, so every
  // consumer keeps reading the one question it actually cares about.
  const [status, setStatus] = useState(USE_MOCK ? 'signed-in' : 'checking');
  const loggedIn = status === 'signed-in';
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

  // The session check runs once, at mount. Without this, a cookie that expires
  // (or is cleared) while the app is open leaves the SPA convinced it is still
  // signed in: every screen just renders its own inline "Sign in to continue"
  // where its data should be, forever, and only a manual reload gets the player
  // back to the sign-in page. The API answers 401 for exactly one reason — the
  // token is missing or invalid — so it is a verdict on the session, and the
  // same verdict this provider was built to act on.
  useEffect(() => {
    if (USE_MOCK) return undefined;

    setUnauthenticatedHandler(() => {
      setProfile(null);
      setStatus((current) => (current === 'signed-in' ? 'signed-out' : current));
    });
    return () => setUnauthenticatedHandler(null);
  }, []);

  useEffect(() => {
    if (USE_MOCK) {
      return undefined;
    }

    let active = true;

    (async () => {
      for (let attempt = 0; attempt <= SESSION_CHECK_RETRIES; attempt += 1) {
        if (attempt > 0) {
          await delay(SESSION_RETRY_BASE_MS * 2 ** (attempt - 1));
          if (!active) return;
        }

        try {
          const signedIn = await readSession();
          if (active) setStatus(signedIn ? 'signed-in' : 'signed-out');
          return;
        } catch {
          // Kept quiet per attempt; the screen below is where this is reported
          // once the retries are spent.
          if (!active) return;
        }
      }

      if (active) setStatus('unavailable');
    })();

    return () => {
      active = false;
    };
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
      setStatus('signed-out');
      return;
    }

    await logout();
    setProfile(null);
    setStatus('signed-out');
  };

  if (status === 'checking') return null; // can be a cute loading page instead
  // Deliberately blocking rather than falling through to the app. Which way the
  // session actually went is unknown here, and both guesses are worse than
  // saying so: "signed out" is the bug this replaces, and "signed in" only moves
  // the failure to whichever screen loads next, where it reads as that screen
  // being broken.
  if (status === 'unavailable') return <SessionUnavailable />;

  return (
    <AuthContext.Provider
      value={{
        loggedIn,
        profile,
        refreshProfile,
        loginWithGoogle: USE_MOCK ? () => setStatus('signed-in') : loginWithGoogle,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
