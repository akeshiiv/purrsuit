-- The sessions table predates the migration system (created alongside users at
-- auth setup), so this migration ALTERs it rather than creating it. Tie each
-- logged study session to the season and member it counted toward. Both columns
-- are nullable and ON DELETE SET NULL so historical session rows survive a
-- season rollover (cells/seasons churn) or a member leaving the realm.
ALTER TABLE sessions
  ADD COLUMN season_id BIGINT NULL REFERENCES seasons(id) ON DELETE SET NULL,
  ADD COLUMN realm_member_id BIGINT NULL REFERENCES realm_members(id) ON DELETE SET NULL;
