import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePolling } from '../hooks/usePolling.js';
import { leaderboardService, profileService } from '../services/index.js';
import SeasonEndOverlay from './SeasonEndOverlay.jsx';

// Mounted app-wide (AuthLayout) rather than under the realm layout: a season can
// end while the player is on any page — including /account, which is where the
// admin ends it from, and where the end screen used to never appear. It is
// deliberately NOT mounted around the focus session, so an expiring season can
// never interrupt a running countdown (cancelling forfeits the reward).
//
// Because it renders outside the realm routes there is no GameContext to read
// from, so it resolves both the standings and the player's own identity itself.
export default function SeasonEndGate() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [me, setMe] = useState(null);
  const [acking, setAcking] = useState(false);
  const [ackError, setAckError] = useState('');

  const checkStatus = useCallback(async () => {
    try {
      const next = await leaderboardService.seasonStatus();
      setStatus(next);
      return next;
    } catch (caught) {
      // The player is in no realm (e.g. sitting on /realms after leaving one).
      // There is nothing to acknowledge — keep polling in case they join one.
      if (caught.code === 'NOT_IN_ACTIVE_SEASON') {
        setStatus(null);
        return null;
      }
      throw caught;
    }
  }, []);

  usePolling(checkStatus, 5000);

  const needsAck = Boolean(status?.needsAck);
  // Final standings come with the status. Ending a season immediately resets
  // territory and the member economy, so the live leaderboard already describes
  // the NEW season and would render this screen as a table of zeroes.
  const rows = needsAck && Array.isArray(status.rows) ? status.rows : [];

  // The overlay marks the player's own row and decides victory vs defeat. Load
  // that identity lazily, only once a screen actually needs showing, and refresh
  // it each time a season ends so a renamed player is still matched.
  useEffect(() => {
    if (!needsAck) return undefined;
    let active = true;
    profileService
      .get()
      .then(profile => {
        if (active && profile) setMe({ userId: profile.id, name: profile.name });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [needsAck]);

  if (!needsAck) return null;

  async function acknowledge() {
    setAcking(true);
    setAckError('');
    try {
      await leaderboardService.seasonAck();
      // The gate outlives the navigation now, so clear the acked status here
      // instead of relying on unmount — otherwise the overlay would linger until
      // the next poll.
      setStatus(null);
      setAcking(false);
      navigate('/realms');
    } catch (caught) {
      setAckError(caught.message);
      setAcking(false);
    }
  }

  return (
    <SeasonEndOverlay
      winnerName={status.winnerName}
      rows={rows}
      me={me}
      onAck={acknowledge}
      acking={acking}
      ackError={ackError}
    />
  );
}
