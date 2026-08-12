// OAuth `state` nonce: issue and verification, kept pure (no express, no config
// import) so it can be unit-tested without env vars or a request object. The
// cookie writing and the redirects live in routes/auth.js.
//
// Why this exists: the Google strategy runs with `session: false`, so passport's
// built-in `state: true` store — which parks the nonce in an express session —
// is unavailable. Instead the nonce travels to Google as the `state` query
// parameter and travels back through the user's own browser in a short-lived,
// signed, HttpOnly cookie. An attacker who completes their own Google
// authorization and then lures a victim onto the callback URL cannot produce a
// cookie in the victim's browser that matches the `state` in the attacker's
// authorization code, so the victim is never silently logged into the
// attacker's account.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export const STATE_COOKIE = 'oauth_state';

// Ten minutes is long enough for a real person to work through Google's consent
// screen (including picking an account or typing a 2FA code) and short enough
// that a leaked nonce is worthless soon after.
export const STATE_TTL_SECONDS = 10 * 60;
export const STATE_COOKIE_MAX_AGE = STATE_TTL_SECONDS * 1000;

// Domain separation. The state token is signed with a key derived from
// JWT_SECRET rather than JWT_SECRET itself, so the two token families cannot be
// swapped: a state token pasted into the `token` cookie will not verify as a
// session, and a stolen session token cannot stand in for a state nonce. The
// alternative — a distinct claim checked at verification time — would need
// changes in middleware.js, and a second secret would mean a new env var for
// every deployer.
const STATE_KEY_LABEL = 'purrsuit:oauth-state';

function stateSecretFrom(jwtSecret) {
  return crypto.createHmac('sha256', jwtSecret).update(STATE_KEY_LABEL).digest('hex');
}

// Mint a nonce plus the signed token that proves we issued it. The nonce goes to
// Google as `state`; the token goes to the browser as a cookie.
export function issueState(jwtSecret, ttlSeconds = STATE_TTL_SECONDS) {
  const nonce = crypto.randomBytes(32).toString('hex');
  const token = jwt.sign({ nonce }, stateSecretFrom(jwtSecret), { expiresIn: ttlSeconds });
  return { nonce, token };
}

// True only when the cookie is one we signed, is still within its expiry, and
// carries exactly the nonce Google echoed back. Anything else — no cookie, a
// tampered or expired token, a repeated `?state=` (which express surfaces as an
// array), a mismatch — is false, and the caller must fail closed.
export function verifyState(cookieToken, returnedState, jwtSecret) {
  if (typeof cookieToken !== 'string' || typeof returnedState !== 'string') return false;

  let payload;
  try {
    payload = jwt.verify(cookieToken, stateSecretFrom(jwtSecret));
  } catch {
    return false;
  }

  return timingSafeEquals(payload?.nonce, returnedState);
}

// timingSafeEqual throws on differing lengths, so the length check has to come
// first. Leaking only the length of a random nonce is harmless; leaking how many
// leading characters matched would not be.
function timingSafeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
