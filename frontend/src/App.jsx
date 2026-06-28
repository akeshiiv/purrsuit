import { useCallback, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
} from 'react-router';

import { GameProvider, useGame } from './components/GameContext.jsx';
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
import StudySetup from './pages/StudySetup.jsx';

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
    return <div className="p-6">Loading realm...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Realm unavailable</h1>
        <p className="mt-2 text-sm text-red-700">{error.message}</p>
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
  if (!destination) return <div className="p-6">Loading...</div>;
  return <Navigate to={destination} replace />;
}

function AuthLayout() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 p-3 text-sm">
          <Link className="font-semibold" to="/realm">Purrsuit</Link>
          <Link to="/realms">Realms</Link>
          <Link to="/account">Account</Link>
          <button className="ml-auto rounded border px-3 py-1" type="button" onClick={logout}>
            Logout
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  );
}

function RealmLayout() {
  const { realm, me } = useGame();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded border bg-white p-3 text-sm">
        <span className="font-medium">{realm.name}</span>
        <span>Coins: {me.coins}</span>
        <Link to="/realm">Dashboard</Link>
        <Link to="/realm/map">Map</Link>
        <Link to="/realm/study">Study</Link>
        <Link to="/realm/shop">Shop</Link>
        <Link to="/realm/inventory">Inventory</Link>
        <Link to="/realm/leaderboard">Leaderboard</Link>
      </div>
      <SeasonEndGate />
      <Outlet />
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
                <RealmLayout />
              </RequireRealm>
            )}
          >
            <Route path="/realm" element={<RealmDashboard />} />
            <Route path="/realm/map" element={<MapView />} />
            <Route path="/realm/study" element={<StudySetup />} />
            <Route path="/realm/shop" element={<Shop />} />
            <Route path="/realm/inventory" element={<Inventory />} />
            <Route path="/realm/leaderboard" element={<Leaderboard />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
