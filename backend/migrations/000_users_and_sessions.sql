-- Baseline tables that predate the migration system (originally created by hand
-- at auth setup, alongside Google OAuth). Declared IF NOT EXISTS so this is a
-- no-op where they already exist (existing dev and prod databases) and creates
-- them on a fresh database, making the full schema reproducible from migrations.
--
-- The realm migrations (001+) reference users(id); the study flow inserts into
-- sessions; migration 004 then adds the season/member columns to sessions.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  avatar_url TEXT DEFAULT 'https://example.com',
  colour CHAR(7) DEFAULT '#000000',
  coins INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration INTEGER NOT NULL CHECK (duration >= 0),
  coins_earned INTEGER NOT NULL DEFAULT 0 CHECK (coins_earned >= 0),
  created_at TIMESTAMP DEFAULT now()
);
