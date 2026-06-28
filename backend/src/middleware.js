import jwt from 'jsonwebtoken';
import { config } from './config/env.js';

const SECRET = config.JWT_SECRET;
const TOKEN_EXPIRY = '7d'; // tokens expire in 7 days

export const signToken = (payload) =>
  jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRY });

export const verifyToken = (token) =>
  jwt.verify(token, SECRET);

export function authenticate(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}