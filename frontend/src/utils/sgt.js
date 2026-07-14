const SGT_OFFSET_MS = 8 * 60 * 60 * 1000; // Singapore is UTC+8, no DST.
const DAY_MS = 24 * 60 * 60 * 1000;

// Milliseconds from `now` until the next 00:00 SGT. When `now` is exactly on an
// SGT midnight, returns a full day (the *next* boundary), never zero.
export function msUntilSgtMidnight(now = new Date()) {
  const sgtMs = now.getTime() + SGT_OFFSET_MS;
  const sinceMidnight = ((sgtMs % DAY_MS) + DAY_MS) % DAY_MS;
  const remaining = DAY_MS - sinceMidnight;
  return remaining === 0 ? DAY_MS : remaining;
}
