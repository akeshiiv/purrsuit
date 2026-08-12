// The player's live IANA zone, e.g. "Asia/Singapore". Every study day — the
// streak, the 7-day series — is a *local* calendar day, so this is what the
// stats request buckets by and what the stored profile zone is synced from.
// `resolvedOptions()` is available everywhere we run, but the fallback keeps a
// locked-down or exotic runtime from taking the whole screen down with it.
export function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatStudy(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatCountdown(endsAt) {
  const end = endsAt ? new Date(endsAt).getTime() : NaN;
  if (Number.isNaN(end)) return 'Season ended';
  const ms = end - Date.now();
  if (ms <= 0) return 'Season ended';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = value => String(value).padStart(2, '0');

  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${minutes}m ${pad(seconds)}s`;
}
