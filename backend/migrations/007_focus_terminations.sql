-- backend/migrations/007_focus_terminations.sql
-- Distraction-terminated focus sessions. Kept SEPARATE from `sessions` (which
-- holds only credited sessions and whose stats SUM duration/coins) so a
-- termination never counts toward study time or coins. Nullable season/member
-- FKs (ON DELETE SET NULL) so rows survive season rollover / a member leaving.
CREATE TABLE focus_terminations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id BIGINT NULL REFERENCES seasons(id) ON DELETE SET NULL,
  realm_member_id BIGINT NULL REFERENCES realm_members(id) ON DELETE SET NULL,
  attempted_duration_seconds INTEGER NOT NULL CHECK (attempted_duration_seconds >= 0),
  reason VARCHAR(64) NOT NULL,
  summary TEXT NULL,
  justification TEXT NULL,
  created_at TIMESTAMP DEFAULT now()
);
