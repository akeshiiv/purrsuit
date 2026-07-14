-- One randomly-assigned daily quest per player per SGT day. quest_date is the
-- Singapore calendar date; assignment is lazy (INSERT ... ON CONFLICT DO NOTHING
-- on first read of a new day). progress holds cumulative state (counts, buy-set)
-- for count/set quests; completed_at is the award-once guard (set when the 100
-- coin bonus is credited to realm_members.coins).
CREATE TABLE daily_quests (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_date   DATE   NOT NULL,
  quest_key    TEXT   NOT NULL,
  progress     JSONB  NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ NULL,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_date)
);

CREATE INDEX daily_quests_user_date_idx ON daily_quests (user_id, quest_date);
