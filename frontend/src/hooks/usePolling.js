import { useEffect, useRef, useState } from 'react';

export function usePolling(pollFn, intervalMs, options = {}) {
  const { enabled = true, initialVersion = null } = options;
  const pollFnRef = useRef(pollFn);
  const versionRef = useRef(initialVersion);
  const [version, setVersion] = useState(initialVersion);
  const [error, setError] = useState(null);

  useEffect(() => {
    pollFnRef.current = pollFn;
  }, [pollFn]);

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;

    let cancelled = false;
    let timeoutId = null;
    let running = false;

    const schedule = () => {
      if (!cancelled) {
        timeoutId = window.setTimeout(run, intervalMs);
      }
    };

    const run = async () => {
      if (cancelled || running) return;
      if (document.visibilityState === 'hidden') {
        schedule();
        return;
      }

      running = true;
      try {
        const result = await pollFnRef.current(versionRef.current);
        if (!cancelled && result && typeof result.version === 'number') {
          versionRef.current = result.version;
          setVersion(result.version);
        }
        if (!cancelled) setError(null);
      } catch (caught) {
        if (!cancelled) setError(caught);
      } finally {
        running = false;
        schedule();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (timeoutId) window.clearTimeout(timeoutId);
        run();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    run();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, intervalMs]);

  return { version, error };
}
