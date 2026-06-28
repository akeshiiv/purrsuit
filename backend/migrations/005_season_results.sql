-- Final-standings snapshot, written by the season rollover (ensureSeasonFresh /
-- admin end-season) just before the ending season's cells are deleted and the
-- member economy is reset. Preserves each player's standing so the show-once
-- victory/defeat screen can survive the churn. One row per (season, user); rank
-- is 1-based by territory held (richer tiebreakers match the live leaderboard).
CREATE TABLE season_results (
  id BIGSERIAL PRIMARY KEY,
  season_id BIGINT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INT NOT NULL CHECK (rank >= 1),
  territories INT NOT NULL DEFAULT 0 CHECK (territories >= 0),
  battles_won INT NOT NULL DEFAULT 0 CHECK (battles_won >= 0),
  seconds_studied INT NOT NULL DEFAULT 0 CHECK (seconds_studied >= 0),
  cells_a INT NOT NULL DEFAULT 0 CHECK (cells_a >= 0),
  cells_b INT NOT NULL DEFAULT 0 CHECK (cells_b >= 0),
  cells_c INT NOT NULL DEFAULT 0 CHECK (cells_c >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id)
);

CREATE INDEX idx_season_results_season ON season_results(season_id);
