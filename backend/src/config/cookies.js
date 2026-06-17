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

// Client-visible "logged in" flag: readable by JS.
export const flagCookieOptions = {
  ...baseCookieOptions,
  httpOnly: false,
  maxAge: COOKIE_MAX_AGE,
};
