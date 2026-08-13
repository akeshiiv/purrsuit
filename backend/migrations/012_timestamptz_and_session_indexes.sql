-- backend/migrations/012_timestamptz_and_session_indexes.sql
--
-- PART 1 — created_at becomes TIMESTAMPTZ on the three tables that predate the
-- migration system.
--
-- `users`, `sessions` and `focus_terminations` declare `created_at TIMESTAMP`
-- (without time zone) while every table added since uses TIMESTAMPTZ. `now()`
-- returns a timestamptz, so storing it in a bare TIMESTAMP silently casts it
-- through whatever the *database session's* TimeZone happens to be, and the
-- value that lands is an instant only if that setting is UTC. It is UTC on Neon
-- and in the postgres:16 container the README prescribes, and that is the only
-- reason the readers are correct today: every one of them compensates with
-- `created_at AT TIME ZONE 'UTC'` to re-label the naive value before converting
-- it into a player's zone. Point the app at a database whose TimeZone is
-- anything else — a laptop in SGT, a managed instance set to a local zone — and
-- every study day, streak and daily-quest bucket shifts by that offset with
-- nothing on screen to indicate it.
--
-- Converting the columns removes the assumption rather than documenting it. The
-- USING clause below states it exactly once, at the point where it is still true
-- of the stored rows. The four reader sites drop their `AT TIME ZONE 'UTC'` step
-- in the same commit (study/service.js, season/service.js, quests/service.js) —
-- against a timestamptz that step would convert in the wrong direction.
--
-- Guarded on the current column type rather than run bare. The runner records
-- applied files in `_migrations` so this executes once, but a re-run against an
-- already-converted column would apply the UTC re-labelling a second time and
-- shift real rows, which is not the kind of mistake that announces itself.

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'users' AND column_name = 'created_at')
     = 'timestamp without time zone'
  THEN
    ALTER TABLE users
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
      ALTER COLUMN created_at SET DEFAULT now();
  END IF;

  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'sessions' AND column_name = 'created_at')
     = 'timestamp without time zone'
  THEN
    ALTER TABLE sessions
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
      ALTER COLUMN created_at SET DEFAULT now();
  END IF;

  IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'focus_terminations' AND column_name = 'created_at')
     = 'timestamp without time zone'
  THEN
    ALTER TABLE focus_terminations
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
      ALTER COLUMN created_at SET DEFAULT now();
  END IF;
END $$;

-- PART 2 — the indexes `sessions` never got.
--
-- `sessions` is the busiest read table in the app and had no index but its
-- primary key, so every one of these was a sequential scan over every session
-- ever logged by every player:
--   * GET /api/study/stats runs four aggregates filtered on user_id;
--   * the leaderboard poll (every 3-5s, per member) joins the whole table on
--     user_id to bucket each member's study days;
--   * the daily-quest hook counts today's sessions by realm_member_id on every
--     study completion.
-- Both columns are already declared as foreign keys, which in Postgres does not
-- create an index on the referencing side.
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_realm_member_id
  ON sessions(realm_member_id) WHERE realm_member_id IS NOT NULL;
