import jwt from 'jsonwebtoken';
import { config } from './config/env.js';

const SECRET = config.JWT_SECRET;
const TOKEN_EXPIRY = '7d'; // tokens expire in 7 days

export const signToken = (payload) =>
  jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRY });

export const verifyToken = (token) =>
  jwt.verify(token, SECRET);

// The `error` field is the contract's machine code, not prose: every other
// endpoint answers `{ error: MACHINE_CODE, message }` and the SPA reads
// `error.code` off it to decide what to do. This returned a human sentence in
// that slot ('Not authenticated'), so the one condition the client most needs to
// recognise — an expired session — was the one it could not match on, and the
// sentence was rendered to the user as if it were an explanation.
export function authenticate(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Your session has expired. Sign in again.',
    });
  }
}