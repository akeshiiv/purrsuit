CREATE TABLE realm_members (
  id BIGSERIAL PRIMARY KEY,
  realm_id BIGINT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  coins INT NOT NULL DEFAULT 0 CHECK (coins >= 0),
  units_a SMALLINT NOT NULL DEFAULT 0 CHECK (units_a >= 0),
  units_b SMALLINT NOT NULL DEFAULT 0 CHECK (units_b >= 0),
  units_c SMALLINT NOT NULL DEFAULT 0 CHECK (units_c >= 0),
  seconds_studied INT NOT NULL DEFAULT 0 CHECK (seconds_studied >= 0),
  battles_won INT NOT NULL DEFAULT 0 CHECK (battles_won >= 0),
  home_x SMALLINT NULL CHECK (home_x IS NULL OR home_x >= 0),
  home_y SMALLINT NULL CHECK (home_y IS NULL OR home_y >= 0),
  acked_season_id BIGINT NULL REFERENCES seasons(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (units_a + units_b + units_c <= 6),
  CHECK ((home_x IS NULL AND home_y IS NULL) OR (home_x IS NOT NULL AND home_y IS NOT NULL)),
  UNIQUE (realm_id, user_id),
  UNIQUE (user_id)
);

ALTER TABLE seasons
  ADD CONSTRAINT seasons_winner_member_id_fkey
  FOREIGN KEY (winner_member_id) REFERENCES realm_members(id) ON DELETE SET NULL;
