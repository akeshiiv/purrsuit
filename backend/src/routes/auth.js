import { Router } from 'express';
import passport from '../passport.js';
import { signToken, verifyToken } from '../middleware.js';
import { config } from '../config/env.js';
import { authCookieOptions, flagCookieOptions, baseCookieOptions } from '../config/cookies.js';

const router = Router();
const REDIRECT_URL = config.FRONTEND_URL; // after successful login, homepage will conditionally render

// redirect user to google
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// google redirects back
router.get('/google/callback',
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
