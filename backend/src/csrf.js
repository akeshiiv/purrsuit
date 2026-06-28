// CSRF protection via the signed double-submit cookie pattern (csrf-csrf v4).
//
// Why double-submit: auth is a cross-origin cookie, so the SPA cannot read the
// API's cookies in JS. Instead the client fetches a token from GET /api/csrf-token
// (which also sets a signed cookie), then echoes it back in the `x-csrf-token`
// header on mutating requests. The middleware checks the header against the cookie.
//
// GET/HEAD/OPTIONS are ignored by default, so the OAuth GET routes are unaffected.
import { doubleCsrf } from 'csrf-csrf';
import { config } from './config/env.js';
import { baseCookieOptions } from './config/cookies.js';

const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => config.CSRF_SECRET,
  // Bind the token to the user's session (the JWT cookie). The client lazily
  // fetches its CSRF token after login, so the JWT is present at generation time.
  getSessionIdentifier: (req) => req.cookies?.token ?? '',
  // Plain name (not the __Host- default) so it also works in dev where Secure is off.
  cookieName: 'csrf-token',
  cookieOptions: { ...baseCookieOptions, httpOnly: true },
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

export { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError };
