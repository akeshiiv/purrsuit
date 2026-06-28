import { useCallback, useState } from 'react';
import { usePolling } from './usePolling.js';
import { mapService } from '../services/index.js';

export function useMapPolling(intervalMs = 2500) {
  const [map, setMap] = useState(null);

  const load = useCallback(async since => {
    const next = await mapService.getMap(since);
    if (next.changed !== false) setMap(next);
    return next;
  }, []);

  const { error } = usePolling(load, intervalMs);

  const refresh = useCallback(async () => {
    const next = await mapService.getMap(null);
    if (next.changed !== false) setMap(next);
    return next;
  }, []);

  return { map, error, refresh };
}
