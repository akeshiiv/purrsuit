CREATE TABLE realms (
  id BIGSERIAL PRIMARY KEY,
  join_code CHAR(6) UNIQUE NOT NULL CHECK (join_code ~ '^[A-Z0-9]{6}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
  admin_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_preset TEXT NOT NULL CHECK (map_preset IN ('open_plains', 'crossroads', 'archipelago')),
  max_players SMALLINT NOT NULL CHECK (max_players BETWEEN 2 AND 10),
  map_size SMALLINT NOT NULL CHECK (map_size IN (8, 12, 16)),
  season_length_days SMALLINT NOT NULL CHECK (season_length_days BETWEEN 7 AND 366),
  anticheat_enabled BOOLEAN NOT NULL DEFAULT false,
  current_season_id BIGINT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE seasons (
  id BIGSERIAL PRIMARY KEY,
  realm_id BIGINT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
  season_number INT NOT NULL CHECK (season_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('active', 'ended')) DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL,
  winner_member_id BIGINT NULL,
  state_version BIGINT NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  UNIQUE (realm_id, season_number)
);

ALTER TABLE realms
  ADD CONSTRAINT realms_current_season_id_fkey
  FOREIGN KEY (current_season_id) REFERENCES seasons(id) ON DELETE SET NULL;
