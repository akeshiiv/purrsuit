import { useCallback, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from 'react-router';

import { GameProvider } from './components/GameContext.jsx';
import { useAuth } from './components/AuthContext.jsx';
import SeasonEndGate from './components/SeasonEndGate.jsx';
import { profileService, realmService } from './services/index.js';
import AccountSettings from './pages/AccountSettings.jsx';
import FocusSession from './pages/FocusSession.jsx';
import Inventory from './pages/Inventory.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Login from './pages/Login.jsx';
import MapView from './pages/MapView.jsx';
import Onboarding from './pages/Onboarding.jsx';
import RealmCreate from './pages/RealmCreate.jsx';
import RealmDashboard from './pages/RealmDashboard.jsx';
import RealmJoin from './pages/RealmJoin.jsx';
import RealmSelect from './pages/RealmSelect.jsx';
import Shop from './pages/Shop.jsx';
import Stats from './pages/Stats.jsx';
import StudySetup from './pages/StudySetup.jsx';

function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <p className="font-display text-[19px] font-extrabold text-ink-muted">{label}</p>
    </div>
  );
}

function RequireAuth({ children }) {
  const { loggedIn } = useAuth();
  return loggedIn ? children : <Navigate to="/" replace />;
}

/**
 * `skipOnboardingGate` exists for the /onboarding route alone: the tour is
 * rendered by this same gate (it reads the realm out of GameProvider), so
 * without the escape hatch the redirect below would send the tour to itself.
 */
function RequireRealm({ children, skipOnboardingGate = false }) {
  const [game, setGame] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const data = await realmService.getCurrent();
    setGame(data.realm ? data : null);
    return data;
  }, []);

  useEffect(() => {
    let active = true;

    async function loadShell() {
      setLoading(true);
      setError(null);
      try {
        // In parallel, never in sequence: this runs on every mount of the app
        // shell, and awaiting the profile after the realm would put a second
        // round trip's latency in front of every screen in the app.
        //
        // One Promise.all means one error path — a profile read that fails is
        // as fatal as a realm read that fails, which is the point. Treating it
        // as a soft miss would leave `hasOnboarded` unknown, and an unknown
        // flag reads as false below: a player who finished the tour months ago
        // would be dropped back into it every time the profile call flaked.
        const [data, loadedProfile] = await Promise.all([
          realmService.getCurrent(),
          profileService.get(),
        ]);
        if (!active) return;
        setGame(data.realm ? data : null);
        setProfile(loadedProfile);
      } catch (caught) {
        if (active) setError(caught);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadShell();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <Loading label="Loading realm…" />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page p-6">
        <div className="p-card-hero max-w-md p-8 text-center">
          <h1 className="font-display text-[26px] font-extrabold text-ink">Realm unavailable</h1>
          <p className="mt-2 text-[13.5px] text-ink-muted">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!game) {
    return <Navigate to="/realms" replace />;
  }

  // The tour teaches the game with the realm the player just landed in on
  // screen, so it can only run once there is one — which is why the gate lives
  // here, below the no-realm redirect, rather than up at the auth layer.
  //
  // There is deliberately no redirect the other way: an already-onboarded
  // player who opens /onboarding gets to watch it again. The handoff lists "any
  // way to re-open the tour later" as an open question, and a URL that still
  // works is the cheap honest answer until Settings grows a real entry point.
  if (!skipOnboardingGate && !profile?.hasOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <GameProvider
      value={{
        realm: game.realm,
        season: game.season,
        me: game.me,
        // The gate has the profile in hand either way, so handing it down keeps
        // the tour — and anything else that wants an account-level field — from
        // firing a second /api/profile a moment after this one resolved.
        profile,
        dailyQuest: game.dailyQuest ?? null,
        refresh,
      }}
    >
      {children}
    </GameProvider>
  );
}

function LoginGate() {
  const { loggedIn } = useAuth();
  const [destination, setDestination] = useState(null);

  useEffect(() => {
    let active = true;
    if (!loggedIn) {
      return undefined;
    }

    async function findDestination() {
      try {
        // The same pair RequireRealm reads, for the same reason: this hop has to
        // name the player's final screen itself. Sending a returning player who
        // never finished the tour to /realm and letting the gate divert would
        // mount the whole app shell, fetch both of these a second time, and
        // flash Home on the way to /onboarding.
        const [data, profile] = await Promise.all([
          realmService.getCurrent(),
          profileService.get(),
        ]);
        if (!active) return;
        const realmDestination = profile?.hasOnboarded ? '/realm' : '/onboarding';
        setDestination(data.realm ? realmDestination : '/realms');
      } catch {
        // Unchanged on failure: /realms re-reads the realm itself and owns the
        // error copy for it, so a flaky read lands on a screen that can explain
        // itself rather than on a guess about where this player belongs.
        if (active) setDestination('/realms');
      }
    }

    findDestination();
    return () => {
      active = false;
    };
  }, [loggedIn]);

  if (!loggedIn) return <Login />;
  if (!destination) return <Loading />;
  return <Navigate to={destination} replace />;
}

/**
 * Every screen draws its own chrome (each is a full 1440x900 frame in the
 * design), so this layout only carries what must live above all of them.
 */
function AuthLayout() {
  return (
    <div className="min-h-screen bg-page text-ink-body">
      <Outlet />
      {/* App-wide so the season-end screen reaches the player wherever they are —
          notably /account, where the admin ends the season. The focus-session
          route sits outside this layout and stays uninterrupted. */}
      <SeasonEndGate />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginGate />} />
        <Route
          element={(
            <RequireAuth>
              <RequireRealm>
                <Outlet />
              </RequireRealm>
            </RequireAuth>
          )}
        >
          <Route path="/realm/study/focus" element={<FocusSession />} />
        </Route>
        {/* Its own gate instance rather than a slot among the app screens
            below. The tour marks itself onboarded and then navigates into the
            app, and only a gate that mounts fresh re-reads the profile it just
            wrote — sharing an instance would hand that navigation the stale
            `hasOnboarded: false` and bounce the player straight back here.
            Outside AuthLayout for the same reason FocusSession is: a first run
            is no moment for the season-end screen to land on top. */}
        <Route
          element={(
            <RequireAuth>
              <RequireRealm skipOnboardingGate>
                <Outlet />
              </RequireRealm>
            </RequireAuth>
          )}
        >
          <Route path="/onboarding" element={<Onboarding />} />
        </Route>
        <Route
          element={(
            <RequireAuth>
              <AuthLayout />
            </RequireAuth>
          )}
        >
          <Route path="/realms" element={<RealmSelect />} />
          <Route path="/realms/create" element={<RealmCreate />} />
          <Route path="/realms/join" element={<RealmJoin />} />
          <Route path="/account" element={<AccountSettings />} />
          <Route
            element={(
              <RequireRealm>
                <Outlet />
              </RequireRealm>
            )}
          >
            <Route path="/realm" element={<RealmDashboard />} />
            <Route path="/realm/map" element={<MapView />} />
            <Route path="/realm/study" element={<StudySetup />} />
            <Route path="/realm/shop" element={<Shop />} />
            <Route path="/realm/inventory" element={<Inventory />} />
            <Route path="/realm/leaderboard" element={<Leaderboard />} />
            <Route path="/realm/stats" element={<Stats />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
