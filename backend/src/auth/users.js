// User row upsert for the Google OAuth callback. Kept out of passport.js (which
// eagerly reads config at import time) so the login-time write can be unit-tested
// with an injected query function.
import { sql } from '../../db.js';

// Colour a brand-new account starts with. The `users.colour` column is nullable,
// and every display path falls back to this same value, so seeding it explicitly
// keeps the stored profile and the rendered profile in agreement from day one.
export const DEFAULT_COLOUR = '#3b82f6';

// Find-or-create the user behind a Google profile.
//
// The ON CONFLICT branch deliberately refreshes ONLY `email` — the one field
// Google owns and that can legitimately change upstream. `name`, `avatar_url` and
// `colour` are user-editable via PATCH /api/profile, so re-applying Google's
// values on every login would silently discard whatever the player had set (and
// `colour` in particular has no Google equivalent at all, so it would be nulled
// out each time). `DO UPDATE` rather than `DO NOTHING` because the latter returns
// zero rows on conflict, which would break login for every returning user.
export async function upsertGoogleUser(profile, query = sql) {
  const email = profile.emails?.[0]?.value ?? null;
  const avatarUrl = profile.photos?.[0]?.value ?? null;

  const rows = await query`
    INSERT INTO users (google_id, email, name, avatar_url, colour)
    VALUES (${profile.id}, ${email}, ${profile.displayName}, ${avatarUrl}, ${DEFAULT_COLOUR})
    ON CONFLICT (google_id) DO UPDATE SET email = EXCLUDED.email
    RETURNING *
  `;
  return rows[0];
}
