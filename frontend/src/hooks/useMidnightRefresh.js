import { useEffect } from 'react';
import { msUntilSgtMidnight } from '../utils/sgt.js';

// Fire `onMidnight` once at the next 00:00 SGT, then re-arm for the following
// day. Used to roll the daily quest over for a player idling on the dashboard.
export function useMidnightRefresh(onMidnight) {
  useEffect(() => {
    let timerId;
    const schedule = () => {
      timerId = window.setTimeout(() => {
        onMidnight();
        schedule();
      }, msUntilSgtMidnight());
    };
    schedule();
    return () => window.clearTimeout(timerId);
  }, [onMidnight]);
}
