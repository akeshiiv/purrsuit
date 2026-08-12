-- backend/migrations/008_study_sessions.sql
-- Server-owned focus sessions. Until now the reward for studying was derived
-- from a duration the client posted at completion time, so any authenticated
-- user could replay POST /api/study/complete for unlimited coins. A row here is
-- written when the countdown starts and holds the only facts a later claim may
-- be paid from: the duration committed to up front, and the server's own clock
-- readings. `eligible_at` is what makes the reward non-farmable — a claim has to
-- wait out real wall-clock time on the server — and `expires_at` stops a stale
-- row from being banked long afterwards, against a season it no longer belongs
-- to. Nullable realm/season/session FKs (ON DELETE SET NULL) so a row survives a
-- season rollover or the member leaving mid-session.
CREATE TABLE study_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_key UUID NOT NULL UNIQUE,           -- server-issued handle; the client's only reference
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  realm_id BIGINT NULL REFERENCES realms(id) ON DELETE SET NULL,
  season_id BIGINT NULL REFERENCES seasons(id) ON DELETE SET NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes BETWEEN 5 AND 120),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'terminated', 'abandoned')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  eligible_at TIMESTAMPTZ NOT NULL,           -- started_at + duration - grace
  expires_at TIMESTAMPTZ NOT NULL,            -- eligible_at + claim window
  completed_at TIMESTAMPTZ NULL,
  coins_awarded INT NULL,
  session_id BIGINT NULL REFERENCES sessions(id) ON DELETE SET NULL
);

-- At most ONE pending session per user. Starting a session already retires the
-- previous one, so this index is the backstop for two starts racing: it turns a
-- second claimable row into a unique violation the service retries, rather than
-- letting a user bank two countdowns from one stretch of time.
CREATE UNIQUE INDEX idx_study_sessions_one_pending
  ON study_sessions(user_id) WHERE status = 'pending';
