// Profile validation and serialization — pure, server-authoritative rules for
// PATCH /api/profile and the shape returned by GET/PATCH /api/profile. Kept free
// of any DB/Express dependency so the rules can be unit-tested in isolation.

export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 32;
export const COLOUR_PATTERN = /^#[0-9a-f]{6}$/i; // #rrggbb, case-insensitive

// A display name is 1–32 characters once surrounding whitespace is trimmed.
export function isValidName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= MIN_NAME_LENGTH && trimmed.length <= MAX_NAME_LENGTH;
}

// A colour is a #rrggbb hex string used to tint the player's owned cells.
export function isValidColour(colour) {
  return typeof colour === 'string' && COLOUR_PATTERN.test(colour);
}

// An avatar URL must be a syntactically valid absolute http(s) URL.
export function isValidAvatarUrl(url) {
  if (typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

// Validate a PATCH /api/profile body. All fields are optional; only the keys
// actually present are validated and returned (so callers update just those
// columns). Returns { ok: true, updates } with normalised values, or
// { ok: false, error, message } using the contract's error codes on the first
// invalid field (checked in the contract's documented order: name, colour, avatar).
export function validateProfilePatch(body) {
  const updates = {};

  if (body.name !== undefined) {
    if (!isValidName(body.name)) {
      return { ok: false, error: 'INVALID_NAME', message: 'name must be 1–32 characters' };
    }
    updates.name = body.name.trim();
  }

  if (body.colour !== undefined) {
    if (!isValidColour(body.colour)) {
      return { ok: false, error: 'INVALID_COLOUR', message: 'colour must be a #rrggbb hex value' };
    }
    updates.colour = body.colour.toLowerCase();
  }

  if (body.avatarUrl !== undefined) {
    if (!isValidAvatarUrl(body.avatarUrl)) {
      return { ok: false, error: 'INVALID_AVATAR', message: 'avatarUrl must be an http(s) URL' };
    }
    updates.avatarUrl = body.avatarUrl;
  }

  return { ok: true, updates };
}

// Map a `users` row (snake_case columns) to the contract's Profile shape.
// `realm` is the player's RealmSummary when known, or null. On the be-profile
// branch the realm tables don't exist yet, so callers pass null; the realm
// summary is populated once the realm feature is integrated.
export function toProfile(row, realm = null) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    colour: row.colour,
    realm,
  };
}
