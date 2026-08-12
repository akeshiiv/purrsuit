import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_NAME_LENGTH,
  MAX_NAME_LENGTH,
  isValidName,
  isValidColour,
  isValidAvatarUrl,
  isValidTimeZone,
  validateProfilePatch,
  toProfile,
} from './profile.js';

// --- isValidName -----------------------------------------------------------

test('isValidName accepts a 1–32 character string', () => {
  assert.equal(isValidName('a'), true);
  assert.equal(isValidName('Tung Tung Sahur'), true);
  assert.equal(isValidName('x'.repeat(MAX_NAME_LENGTH)), true);
});

test('isValidName rejects empty, whitespace-only, and over-length names', () => {
  assert.equal(isValidName(''), false);
  assert.equal(isValidName('   '), false);
  assert.equal(isValidName('x'.repeat(MAX_NAME_LENGTH + 1)), false);
});

test('isValidName rejects non-strings', () => {
  for (const bad of [null, undefined, 42, {}, ['a']]) {
    assert.equal(isValidName(bad), false, `expected ${String(bad)} to be rejected`);
  }
});

// --- isValidColour ---------------------------------------------------------

test('isValidColour accepts #rrggbb hex (either case)', () => {
  assert.equal(isValidColour('#3b82f6'), true);
  assert.equal(isValidColour('#A855F7'), true);
});

test('isValidColour rejects malformed colours', () => {
  for (const bad of ['3b82f6', '#fff', '#3b82f6 ', '#zzzzzz', '#3b82f60', '', null, 42]) {
    assert.equal(isValidColour(bad), false, `expected ${String(bad)} to be rejected`);
  }
});

// --- isValidAvatarUrl ------------------------------------------------------

test('isValidAvatarUrl accepts http(s) URLs', () => {
  assert.equal(isValidAvatarUrl('https://example.com/photo.jpg'), true);
  assert.equal(isValidAvatarUrl('http://localhost:3000/a.png'), true);
});

test('isValidAvatarUrl rejects non-http(s) and malformed URLs', () => {
  for (const bad of ['ftp://example.com/a.jpg', 'javascript:alert(1)', 'not a url', '/relative/path', '', null, 42]) {
    assert.equal(isValidAvatarUrl(bad), false, `expected ${String(bad)} to be rejected`);
  }
});

// --- isValidTimeZone -------------------------------------------------------

test('isValidTimeZone accepts IANA zone names', () => {
  for (const tz of ['UTC', 'Asia/Singapore', 'America/Chicago', 'Europe/London', 'Australia/Sydney']) {
    assert.equal(isValidTimeZone(tz), true, `expected ${tz} to be accepted`);
  }
});

test('isValidTimeZone rejects typos and non-zones', () => {
  for (const bad of ['Asia/Singapor', 'Not/AZone', 'Local', 'Pacific Time', ' UTC ', '', null, undefined, 42, {}]) {
    assert.equal(isValidTimeZone(bad), false, `expected ${String(bad)} to be rejected`);
  }
});

// Legacy aliases ('PST', 'US/Pacific') are genuine entries in the IANA database
// and in Postgres's copy of it, so they pass — the check is "does the zone
// database know this name", not "is it the modern spelling".
test('isValidTimeZone accepts legacy IANA aliases', () => {
  for (const tz of ['PST', 'US/Pacific', 'GMT', 'Asia/Calcutta']) {
    assert.equal(isValidTimeZone(tz), true, `expected ${tz} to be accepted`);
  }
});

// A bare offset formats fine but is not a zone: it has no DST rule, and Postgres
// reads a signed offset by its own convention, so storing one would corrupt the
// AT TIME ZONE conversion this column exists to feed.
test('isValidTimeZone rejects bare UTC offsets even though Intl accepts them', () => {
  for (const bad of ['+05:30', '-08:00', '+0530', '-0800']) {
    assert.equal(isValidTimeZone(bad), false, `expected ${bad} to be rejected`);
  }
});

// --- validateProfilePatch --------------------------------------------------

test('validateProfilePatch accepts a full valid patch and trims/normalises', () => {
  const result = validateProfilePatch({
    name: '  Tung Tung Sahur  ',
    avatarUrl: 'https://example.com/new.jpg',
    colour: '#A855F7',
  });
  assert.deepEqual(result, {
    ok: true,
    updates: {
      name: 'Tung Tung Sahur',
      avatarUrl: 'https://example.com/new.jpg',
      colour: '#a855f7',
    },
  });
});

test('validateProfilePatch accepts a partial patch (only provided fields)', () => {
  const result = validateProfilePatch({ colour: '#3b82f6' });
  assert.deepEqual(result, { ok: true, updates: { colour: '#3b82f6' } });
});

test('validateProfilePatch accepts an empty patch as a no-op', () => {
  const result = validateProfilePatch({});
  assert.deepEqual(result, { ok: true, updates: {} });
});

test('validateProfilePatch rejects an invalid name with INVALID_NAME', () => {
  const result = validateProfilePatch({ name: '' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'INVALID_NAME');
});

test('validateProfilePatch rejects an invalid colour with INVALID_COLOUR', () => {
  const result = validateProfilePatch({ colour: 'blue' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'INVALID_COLOUR');
});

test('validateProfilePatch rejects an invalid avatarUrl with INVALID_AVATAR', () => {
  const result = validateProfilePatch({ avatarUrl: 'not-a-url' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'INVALID_AVATAR');
});

test('validateProfilePatch rejects an invalid timeZone with INVALID_TIMEZONE', () => {
  const result = validateProfilePatch({ timeZone: 'Asia/Singapor' });
  assert.deepEqual(result, {
    ok: false,
    error: 'INVALID_TIMEZONE',
    message: 'timeZone must be an IANA time zone name',
  });
});

test('validateProfilePatch accepts a timeZone verbatim, on its own', () => {
  const result = validateProfilePatch({ timeZone: 'Asia/Singapore' });
  assert.deepEqual(result, { ok: true, updates: { timeZone: 'Asia/Singapore' } });
});

// The client syncs the zone by itself after login; that patch must not disturb
// the name/colour/avatar the player has set.
test('validateProfilePatch leaves other fields alone when only timeZone is sent', () => {
  const result = validateProfilePatch({ timeZone: 'America/Chicago' });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.updates), ['timeZone']);
});

test('validateProfilePatch accepts timeZone alongside the existing fields', () => {
  const result = validateProfilePatch({
    name: 'Tung Tung Sahur',
    colour: '#A855F7',
    avatarUrl: 'https://example.com/new.jpg',
    timeZone: 'Europe/London',
  });
  assert.deepEqual(result, {
    ok: true,
    updates: {
      name: 'Tung Tung Sahur',
      colour: '#a855f7',
      avatarUrl: 'https://example.com/new.jpg',
      timeZone: 'Europe/London',
    },
  });
});

// A typo'd zone must fail loudly rather than fall back to UTC the way the
// tolerant read path (study/stats.js normalizeTz) does — a silent fallback would
// move the player's streak by hours without telling anyone.
test('validateProfilePatch does not silently fall back to UTC on a bad zone', () => {
  const result = validateProfilePatch({ timeZone: 'Mars/Olympus_Mons' });
  assert.equal(result.ok, false);
  assert.equal(result.updates, undefined);
});

test('validateProfilePatch reports name before colour before avatar before timeZone', () => {
  const result = validateProfilePatch({ name: '', colour: 'blue', avatarUrl: 'nope', timeZone: 'nope' });
  assert.equal(result.error, 'INVALID_NAME');
  assert.equal(
    validateProfilePatch({ avatarUrl: 'nope', timeZone: 'nope' }).error,
    'INVALID_AVATAR',
  );
});

test('validateProfilePatch treats an explicit null field as present and invalid', () => {
  assert.equal(validateProfilePatch({ name: null }).error, 'INVALID_NAME');
  assert.equal(validateProfilePatch({ timeZone: null }).error, 'INVALID_TIMEZONE');
});

// --- toProfile -------------------------------------------------------------

test('toProfile maps a db row (snake_case) to the contract shape with realm null', () => {
  const row = {
    id: 1,
    name: 'Tung Tung',
    email: 'triplet@gmail.com',
    avatar_url: 'https://example.com/photo.jpg',
    colour: '#3b82f6',
    time_zone: 'Asia/Singapore',
  };
  assert.deepEqual(toProfile(row), {
    id: 1,
    name: 'Tung Tung',
    email: 'triplet@gmail.com',
    avatarUrl: 'https://example.com/photo.jpg',
    colour: '#3b82f6',
    timeZone: 'Asia/Singapore',
    realm: null,
  });
});

// Rows predating the column (and rows whose owner has never synced) carry no
// zone. The key is still present and explicitly null — "not yet known" is a
// state the client checks for, not a missing field.
test('toProfile reports timeZone as null when the column is unset', () => {
  const row = {
    id: 2,
    name: 'Tralalero',
    email: 'shark@gmail.com',
    avatar_url: 'https://example.com/shark.jpg',
    colour: '#a855f7',
    time_zone: null,
  };
  assert.equal(toProfile(row).timeZone, null);
  assert.equal('timeZone' in toProfile({ ...row, time_zone: undefined }), true);
  assert.equal(toProfile({ ...row, time_zone: undefined }).timeZone, null);
});
