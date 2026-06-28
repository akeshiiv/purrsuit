// Rate limiting. Uses the default in-memory store. NOTE: on Vercel serverless each
// function instance keeps its own counters and they reset on cold start, so limits
// are per-instance and approximate. The `store` slot below is the single place to
// drop in a shared store (e.g. rate-limit-redis backed by Upstash) for accurate
// global limits without touching any route code.
import { rateLimit } from 'express-rate-limit';

const store = undefined; // default MemoryStore; swap for a shared store here.

const baseOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store,
};

// Looser baseline applied to every request.
export const globalLimiter = rateLimit({
  ...baseOptions,
  limit: 300,
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limiter for the auth routes (OAuth start/callback, /me, logout) to blunt
// abuse. Kept generous enough not to trip the /auth/me check that the SPA runs on
// every page load — auth is Google OAuth, so there's no password to brute-force.
export const authLimiter = rateLimit({
  ...baseOptions,
  limit: 50,
  message: { error: 'Too many authentication attempts, please try again later.' },
});
