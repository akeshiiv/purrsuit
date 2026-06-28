import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_NAME_LENGTH,
  MAX_NAME_LENGTH,
  isValidName,
  isValidColour,
  isValidAvatarUrl,
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

test('validateProfilePatch reports name before colour before avatar', () => {
  const result = validateProfilePatch({ name: '', colour: 'blue', avatarUrl: 'nope' });
  assert.equal(result.error, 'INVALID_NAME');
});

test('validateProfilePatch treats an explicit null field as present and invalid', () => {
  assert.equal(validateProfilePatch({ name: null }).error, 'INVALID_NAME');
});

// --- toProfile -------------------------------------------------------------

test('toProfile maps a db row (snake_case) to the contract shape with realm null', () => {
  const row = {
    id: 1,
    name: 'Tung Tung',
    email: 'triplet@gmail.com',
    avatar_url: 'https://example.com/photo.jpg',
    colour: '#3b82f6',
  };
  assert.deepEqual(toProfile(row), {
    id: 1,
    name: 'Tung Tung',
    email: 'triplet@gmail.com',
    avatarUrl: 'https://example.com/photo.jpg',
    colour: '#3b82f6',
    realm: null,
  });
});
