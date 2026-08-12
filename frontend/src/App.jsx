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
import { realmService } from './services/index.js';
import AccountSettings from './pages/AccountSettings.jsx';
import FocusSession from './pages/FocusSession.jsx';
import Inventory from './pages/Inventory.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Login from './pages/Login.jsx';
import MapView from './pages/MapView.jsx';
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

function RequireRealm({ children }) {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const data = await realmService.getCurrent();
    setGame(data.realm ? data : null);
    return data;
  }, []);

  useEffect(() => {
    let active = true;

    async function loadRealm() {
      setLoading(true);
      setError(null);
      try {
        const data = await realmService.getCurrent();
        if (active) setGame(data.realm ? data : null);
      } catch (caught) {
        if (active) setError(caught);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRealm();
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

  return (
    <GameProvider
      value={{
        realm: game.realm,
        season: game.season,
        me: game.me,
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
        const data = await realmService.getCurrent();
        if (active) setDestination(data.realm ? '/realm' : '/realms');
      } catch {
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
