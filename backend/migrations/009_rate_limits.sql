-- backend/migrations/009_rate_limits.sql
-- Shared rate-limit counters. express-rate-limit's default MemoryStore keeps its
-- tallies inside one process, so on Vercel every serverless instance enforces a
-- private budget and a cold start wipes it — the published limits mean whatever
-- a single lucky instance happened to observe. Parking the counters in Postgres,
-- the one piece of state every instance already shares, makes a limit mean the
-- same thing regardless of which instance answers. `scope` separates each
-- limiter so the global and auth budgets never draw one another down, and
-- reset_at carries the window so a lapsed window is detected by the same
-- statement that increments (no separate expiry pass, no lost counts).
CREATE TABLE rate_limits (
  scope VARCHAR(64) NOT NULL,
  key TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  reset_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, key)
);

-- Rows are only rewritten when the same client comes back, so one-off visitors
-- leave their row behind forever. This index makes a periodic
-- `DELETE FROM rate_limits WHERE reset_at < now()` sweep cheap.
CREATE INDEX idx_rate_limits_reset_at ON rate_limits(reset_at);
