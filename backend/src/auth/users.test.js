import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upsertGoogleUser, DEFAULT_COLOUR } from './users.js';
import { COLOUR_PATTERN } from '../profile.js';

const GOOGLE_PROFILE = {
  id: 'google-123',
  emails: [{ value: 'triplet@gmail.com' }],
  displayName: 'Tung Tung',
  photos: [{ value: 'https://lh3.googleusercontent.com/photo.jpg' }],
};

function capturingQuery(rows = [{ id: 1 }]) {
  const calls = [];
  const query = (strings, ...values) => {
    calls.push({ sql: strings.join(' ? ').replace(/\s+/g, ' ').trim(), values });
    return Promise.resolve(rows);
  };
  return { query, calls };
}

test('upsertGoogleUser returns the user row', async () => {
  const { query } = capturingQuery([{ id: 42, name: 'Tung Tung' }]);
  const user = await upsertGoogleUser(GOOGLE_PROFILE, query);
  assert.equal(user.id, 42);
});

// Regression: the callback used to run
//   ON CONFLICT (google_id) DO UPDATE SET name = EXCLUDED.name,
//     avatar_url = EXCLUDED.avatar_url, colour = EXCLUDED.colour
// so every re-login overwrote whatever the player had saved under Account
// settings with Google's values — and since a Google profile has no colour, the
// bound value was always null, wiping the chosen territory colour outright.
test('a repeat login does not overwrite the user-editable profile fields', async () => {
  const { query, calls } = capturingQuery();
  await upsertGoogleUser(GOOGLE_PROFILE, query);

  const statement = calls[0].sql;
  const conflictClause = statement.slice(statement.search(/ON CONFLICT/i));

  assert.match(conflictClause, /DO UPDATE/i, 'must DO UPDATE so RETURNING still yields a row on conflict');
  assert.doesNotMatch(conflictClause, /\bname\s*=/i, 'must not reset the display name on login');
  assert.doesNotMatch(conflictClause, /\bavatar_url\s*=/i, 'must not reset the avatar on login');
  assert.doesNotMatch(conflictClause, /\bcolour\s*=/i, 'must not reset the territory colour on login');
});

test('a brand-new account is seeded with a valid #rrggbb colour, not null', async () => {
  const { query, calls } = capturingQuery();
  await upsertGoogleUser(GOOGLE_PROFILE, query);

  const colour = calls[0].values[4];
  assert.equal(colour, DEFAULT_COLOUR);
  assert.match(colour, COLOUR_PATTERN);
});

test('upsertGoogleUser tolerates a Google profile with no photo', async () => {
  const { query, calls } = capturingQuery();
  await upsertGoogleUser({ ...GOOGLE_PROFILE, photos: [] }, query);
  assert.equal(calls[0].values[3], null);
});
