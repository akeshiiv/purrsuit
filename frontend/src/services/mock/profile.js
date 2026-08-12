import { bumpVersion, mockError, profilePayload, state } from './state.js';

// Mirrors the real endpoint's check: a zone the platform does not know is a
// rejection, not a silent fallback to UTC. The read path elsewhere is tolerant
// (an unknown stored zone reads as UTC), but an explicit write must not accept
// a typo — it would silently re-count the player's streak in the wrong calendar.
//
// Bare UTC offsets ('+05:30') satisfy the Intl probe but are rejected here for
// the same reason the real validator rejects them: they carry no DST rule, and
// Postgres reads a signed offset by its own convention. Kept in step so a value
// the mock accepts can never be one the deployed API refuses.
function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  if (tz.startsWith('+') || tz.startsWith('-')) return false;
  try {
    // Throws RangeError for an unknown time zone.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function get() {
  return profilePayload();
}

export async function update(profile) {
  // Fields are independent and optional, so only a key that is actually present
  // is validated — omitting `timeZone` must never clear the stored one.
  if (profile.timeZone !== undefined && !isValidTimeZone(profile.timeZone)) {
    throw mockError('INVALID_TIMEZONE', 'timeZone must be a valid IANA time zone.');
  }

  state.profile = { ...state.profile, ...profile };
  state.me.name = state.profile.name;
  state.me.colour = state.profile.colour;
  state.cells
    .filter(cell => cell.ownerMemberId === state.me.id)
    .forEach(cell => {
      cell.colour = state.profile.colour;
    });
  bumpVersion();

  return profilePayload();
}
