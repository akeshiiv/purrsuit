-- feat/be-map-territory adds /attack and /defend on top of this table.
-- Do not recreate cells in that branch.
CREATE TABLE cells (
  id BIGSERIAL PRIMARY KEY,
  season_id BIGINT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  realm_id BIGINT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
  x SMALLINT NOT NULL CHECK (x >= 0),
  y SMALLINT NOT NULL CHECK (y >= 0),
  type TEXT NOT NULL CHECK (type IN ('regular', 'obstacle', 'water', 'home')) DEFAULT 'regular',
  owner_member_id BIGINT NULL REFERENCES realm_members(id) ON DELETE SET NULL,
  unit_type CHAR(1) NULL CHECK (unit_type IS NULL OR unit_type IN ('A', 'B', 'C')),
  troop_count SMALLINT NOT NULL DEFAULT 0 CHECK (troop_count >= 0),
  version INT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, x, y)
);

CREATE INDEX idx_cells_season ON cells(season_id);
CREATE INDEX idx_cells_owner ON cells(season_id, owner_member_id) WHERE owner_member_id IS NOT NULL;
