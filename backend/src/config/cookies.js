// Environment-specific cookie options. In production the SPA and API live on
// different origins, so cookies must be cross-site capable (SameSite=None; Secure).
// In local development over http that combination is rejected by browsers, so we
// fall back to SameSite=Lax without Secure.
//
// `baseCookieOptions` (no maxAge) is what must be passed to res.clearCookie so the
// clear matches the cookie that was set — otherwise the browser won't remove it.
const isProd = process.env.NODE_ENV === 'production';

export const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export const baseCookieOptions = {
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
};

// Auth token: not readable by JS.
export const authCookieOptions = {
  ...baseCookieOptions,
  httpOnly: true,
  maxAge: COOKIE_MAX_AGE,
};

// A `logged_in` flag cookie used to be set here alongside the token, deliberately
// JS-readable so the SPA could see it. Nothing ever read it: the client asks
// GET /auth/me instead, which is the only answer that can be trusted anyway —
// a cookie the page can read is also a cookie the page can be wrong about, and
// it went on claiming a session for its full 7 days after the token behind it
// had expired. Removed rather than kept in step, so there is one cookie that
// means "signed in" and the server is the only thing that can set it.
