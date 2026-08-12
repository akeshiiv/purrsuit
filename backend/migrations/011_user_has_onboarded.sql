-- backend/migrations/011_user_has_onboarded.sql
-- Whether this account has already been through the first-run tour, so the tour
-- runs once and then stops. Nothing else on the account records "has this person
-- seen the game explained to them" — without it the client can only guess from
-- proxies like "owns no units", which is also true of a veteran who just spent
-- their coins, and the tour would ambush them mid-season.
--
-- The flag lives on `users` rather than on `realm_members` on purpose: it is a
-- fact about the person, not about their current realm. Parked on the membership
-- row it would die with the membership, and leaving a realm to join a friend's
-- would replay a tour the player has already sat through.
--
-- NOT NULL DEFAULT FALSE, unlike the deliberately-nullable time_zone next door:
-- here there is no third state worth telling apart. "We have never asked" and
-- "asked and not finished" both mean the same thing to the client — show the
-- tour — so a nullable column would only buy an ambiguity every read site had to
-- coalesce away. Existing rows ARE backfilled, again unlike time_zone: a column
-- default alone would mark every current player as brand new and greet them with
-- an explanation of a game they are already several seasons into. Realm
-- membership is the proxy for "already playing" — realm_members is UNIQUE on
-- user_id, so one row per established player — while an account that signed up
-- and never joined anything has genuinely seen nothing and is correctly left
-- FALSE. That is also why the tour is keyed to fire after the first realm is
-- created or joined and not at sign-up: its steps describe a board, a colour and
-- units that do not exist until then.
--
-- IF NOT EXISTS so re-running against a database that already has the column is
-- a no-op rather than an error, and the backfill only ever moves rows from FALSE
-- to TRUE, so a second pass finds nothing left to change.
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_onboarded BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET has_onboarded = TRUE
WHERE has_onboarded = FALSE
  AND id IN (SELECT user_id FROM realm_members);
