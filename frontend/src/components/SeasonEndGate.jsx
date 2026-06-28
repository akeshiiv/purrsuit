import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useGame } from './GameContext.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { leaderboardService } from '../services/index.js';
import SeasonEndOverlay from './SeasonEndOverlay.jsx';

export default function SeasonEndGate() {
  const { me } = useGame();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [rows, setRows] = useState([]);
  const [acking, setAcking] = useState(false);
  const [ackError, setAckError] = useState('');

  const checkStatus = useCallback(async () => {
    const next = await leaderboardService.seasonStatus();
    setStatus(next);
    return next;
  }, []);

  usePolling(checkStatus, 5000);

  const needsAck = Boolean(status?.needsAck);

  useEffect(() => {
    if (!needsAck) return undefined;
    let active = true;
    leaderboardService
      .get()
      .then(data => {
        if (active && Array.isArray(data?.rows)) setRows(data.rows);
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
