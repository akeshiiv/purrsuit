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

// The remaining three rules the real validator applies (backend/src/profile.js,
// contract docs/api-contract.md). They were missing here, so the mock accepted
// values the deployed API rejects: an emptied Name field saved fine in mock mode
// and rendered a blank player everywhere, then returned 400 INVALID_NAME in
// production. AccountSettings sends all three on every save from free-text
// inputs with no client-side validation, so this mock is the only thing standing
// in for the server's rules while VITE_USE_MOCK=true — the mode the README
// recommends for all UI work.
const COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;

function isValidName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 32;
}

function isValidAvatarUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function get() {
  return profilePayload();
}

export async function update(profile) {
  // Fields are independent and optional, so only a key that is actually present
  // is validated — omitting `timeZone` must never clear the stored one. Checked
  // in the contract's documented order: name -> colour -> avatar -> timeZone ->
  // hasOnboarded, so the mock reports the same field the real API would.
  if (profile.name !== undefined && !isValidName(profile.name)) {
    throw mockError('INVALID_NAME', 'name must be 1–32 characters');
  }

  if (profile.colour !== undefined && !COLOUR_PATTERN.test(String(profile.colour))) {
    throw mockError('INVALID_COLOUR', 'colour must be a #rrggbb hex value');
  }

  if (profile.avatarUrl !== undefined && !isValidAvatarUrl(profile.avatarUrl)) {
    throw mockError('INVALID_AVATAR', 'avatarUrl must be an http(s) URL');
  }

  if (profile.timeZone !== undefined && !isValidTimeZone(profile.timeZone)) {
    throw mockError('INVALID_TIMEZONE', 'timeZone must be a valid IANA time zone.');
  }

  // Strict about the type for the same reason the real endpoint is: the tour
  // gets one showing, and a truthy 'yes' or 1 slipping through here would let a
  // client bug pass in mock and fail against the deployed API.
  if (profile.hasOnboarded !== undefined && typeof profile.hasOnboarded !== 'boolean') {
    throw mockError('INVALID_ONBOARDED', 'hasOnboarded must be a boolean.');
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
