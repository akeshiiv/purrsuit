// Rate limiting. Counters live in Postgres rather than in express-rate-limit's
// default MemoryStore: on Vercel every serverless instance runs its own copy of
// this module, so an in-memory tally is per-instance and is wiped by each cold
// start — the numbers below would then cap nothing in particular. The database
// is the only state all instances already share, so it is where the counters go.
// Set RATE_LIMIT_STORE=memory to fall back to the in-process store (handy for a
// single-process local run, and an escape hatch if the table ever misbehaves);
// anything else, including leaving it unset, uses the shared store.
import { rateLimit } from 'express-rate-limit';
import { PostgresRateLimitStore } from './rateLimitStore.js';

// Read from process.env rather than src/config/env.js on purpose: this module is
// only ever imported from index.js, which loads that config (and therefore
// dotenv) first, so the value is identical — and staying off the config edge
// keeps the limiters importable in isolation. A typo in the variable is caught at
// startup by validate-env.js, which rejects anything outside postgres | memory.
const useSharedStore = (process.env.RATE_LIMIT_STORE ?? 'postgres') !== 'memory';

// Every limiter gets its own store instance under its own scope. Sharing one
// would let ordinary browsing burn down the auth budget, and express-rate-limit
// rejects a store handed to two limiters outright. Returning undefined leaves
// express-rate-limit to construct its own MemoryStore, as before.
function storeFor(scope) {
  return useSharedStore ? new PostgresRateLimitStore({ scope }) : undefined;
}

const baseOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
};

// Looser baseline applied to every request.
export const globalLimiter = rateLimit({
  ...baseOptions,
  limit: 300,
  store: storeFor('global'),
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limiter for the auth routes (OAuth start/callback, /me, logout) to blunt
// abuse. Kept generous enough not to trip the /auth/me check that the SPA runs on
// every page load — auth is Google OAuth, so there's no password to brute-force.
export const authLimiter = rateLimit({
  ...baseOptions,
  limit: 50,
  store: storeFor('auth'),
  message: { error: 'Too many authentication attempts, please try again later.' },
});
