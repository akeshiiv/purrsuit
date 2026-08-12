import { Router } from 'express';
import passport from '../passport.js';
import { signToken, verifyToken } from '../middleware.js';
import { config } from '../config/env.js';
import { authCookieOptions, flagCookieOptions, baseCookieOptions } from '../config/cookies.js';
import { issueState, verifyState, STATE_COOKIE, STATE_COOKIE_MAX_AGE } from '../auth/oauthState.js';

const router = Router();
const REDIRECT_URL = config.FRONTEND_URL; // after successful login, homepage will conditionally render

// Where a rejected callback lands: the frontend root, which renders the login
// screen when there is no session. Built through URL so a FRONTEND_URL with or
// without a trailing slash produces the same target.
const STATE_FAILURE_URL = new URL(REDIRECT_URL);
STATE_FAILURE_URL.searchParams.set('error', 'oauth_state');

// The state cookie must survive Google's cross-site top-level redirect back to
// the callback. baseCookieOptions gives SameSite=None; Secure in production and
// SameSite=Lax in development — both are sent on a top-level GET navigation
// (SameSite=Strict would not be). It is HttpOnly because only the server ever
// reads it, and it lives for minutes rather than the auth cookie's days.
const stateCookieOptions = { ...baseCookieOptions, httpOnly: true, maxAge: STATE_COOKIE_MAX_AGE };
const clearStateCookieOptions = { ...baseCookieOptions, httpOnly: true };

// redirect user to google, carrying a one-shot nonce as the OAuth `state`
router.get('/google', (req, res, next) => {
  const { nonce, token } = issueState(config.JWT_SECRET);
  res.cookie(STATE_COOKIE, token, stateCookieOptions);
  // Built per request rather than once at module load because the nonce differs
  // every time; passport-oauth2 forwards a string `state` to Google verbatim.
  passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: nonce })(req, res, next);
});

// Reject a callback that did not originate from a /auth/google we served, before
// passport gets a chance to trade the code with Google. Login CSRF depends on the
// victim's browser completing a callback for an authorization the attacker
// started, and the attacker cannot plant a matching cookie in that browser.
function requireValidState(req, res, next) {
  const ok = verifyState(req.cookies?.[STATE_COOKIE], req.query?.state, config.JWT_SECRET);
  // Cleared here so both outcomes drop it: the nonce is single-use either way.
  // Options must match those used to set it (minus maxAge) or the browser keeps it.
  res.clearCookie(STATE_COOKIE, clearStateCookieOptions);
  if (!ok) return res.redirect(STATE_FAILURE_URL.toString());
  next();
}

// google redirects back
router.get('/google/callback',
  requireValidState,
  passport.authenticate('google', { session: false, failureRedirect: '/' }),
  (req, res) => {
    const token = signToken({ id: req.user.id, email: req.user.email });
    res.cookie('token', token, authCookieOptions);
    res.cookie('logged_in', 'true', flagCookieOptions);
    res.redirect(REDIRECT_URL);
  }
);

// get user info to confirm that user is logged in
router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ loggedIn: false });

  try {
    const decoded = verifyToken(token);
    res.status(200).json({ loggedIn: true, user: decoded });
  } catch {
    res.status(401).json({ loggedIn: false });
  }
});

// upon logout, clear cookies — options must match those used to set them (minus maxAge).
router.post('/logout', (req, res) => {
  res.clearCookie('token', { ...baseCookieOptions, httpOnly: true });
  res.clearCookie('logged_in', { ...baseCookieOptions, httpOnly: false });
  res.json({ success: true });
});

export default router;
