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

// A time zone is an IANA zone name (`Asia/Singapore`, `UTC`), probed the same
// way study/stats.js normalizeTz probes it — ICU is the only complete list of
// zone names, and asking it to format is the cheapest way to ask "do you know
// this one?". Unlike normalizeTz this answers rather than falling back: that
// fallback is right for a tolerant read (a junk `?tz=` shouldn't 500 a stats
// page) and wrong for an explicit write, where silently storing 'UTC' for a
// typo'd zone would quietly move the user's streak by hours.
//
// Bare UTC offsets ('+05:30') satisfy the probe but are rejected anyway: they
// are not zone names, they cannot follow a DST rule, and Postgres reads a signed
// offset by its own convention — so the one thing the column exists for, feeding
// `AT TIME ZONE`, is exactly where they would go wrong. No IANA name begins with
// a sign, so the leading-character test costs nothing real. Browsers never
// produce this form from resolvedOptions().timeZone either.
export function isValidTimeZone(tz) {
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
// invalid field (checked in the contract's documented order: name, colour,
// avatar, timeZone, hasOnboarded).
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

  if (body.timeZone !== undefined) {
    if (!isValidTimeZone(body.timeZone)) {
      return { ok: false, error: 'INVALID_TIMEZONE', message: 'timeZone must be an IANA time zone name' };
    }
    // Stored verbatim, not canonicalised to ICU's preferred spelling. The client
    // is both the only writer and the only reader that compares — it re-syncs
    // when the stored zone differs from the browser's — so rewriting 'US/Pacific'
    // to 'America/Los_Angeles' would leave it re-PATCHing the same zone on every
    // login. Postgres resolves zone names case-insensitively, so a spelling that
    // ICU accepted is a spelling `AT TIME ZONE` accepts.
    updates.timeZone = body.timeZone;
  }

  // Checked last so the precedence the contract already documents (name →
  // colour → avatar → timeZone) keeps meaning what it says: a client that
  // finishes the tour and saves a bad name in the same request still hears
  // about the name.
  if (body.hasOnboarded !== undefined) {
    if (typeof body.hasOnboarded !== 'boolean') {
      return { ok: false, error: 'INVALID_ONBOARDED', message: 'hasOnboarded must be a boolean' };
    }
    // Taken strictly rather than for its truthiness. 'yes' and 1 are a client
    // bug, and reading them as `true` would spend the tour's single showing on
    // a request that never claimed the player had seen it — there is no second
    // chance to get this one right, because the flag is what stops the tour.
    updates.hasOnboarded = body.hasOnboarded;
  }

  return { ok: true, updates };
}

// Map a `users` row (snake_case columns) to the contract's Profile shape.
// `realm` is the player's RealmSummary, or null when they are in no realm
// (routes/profile.js resolves it via realms/service.js memberRealmSummary).
export function toProfile(row, realm = null) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    colour: row.colour,
    // null until the client first syncs the browser's zone. Read sites coalesce
    // it to 'UTC'; it stays null here so "never told us" is still legible as
    // itself rather than as a player who genuinely lives in UTC.
    timeZone: row.time_zone ?? null,
    // Coerced rather than passed through, because the honest answer for a row
    // that predates the column — or a future read path that forgets to select
    // it — is "has not been onboarded", and `undefined` cannot say that:
    // JSON.stringify drops the key entirely, so the client would receive a
    // Profile with no flag on it and replay the tour on every single login.
    // The opposite of timeZone's treatment, and for the opposite reason: there
    // the unset state is worth preserving, here it is worth collapsing.
    hasOnboarded: Boolean(row.has_onboarded),
    realm,
  };
}
