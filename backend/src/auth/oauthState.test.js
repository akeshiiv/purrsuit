import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { issueState, verifyState, STATE_TTL_SECONDS } from './oauthState.js';

const SECRET = 'test-jwt-secret';

test('a freshly issued state verifies against its own nonce', () => {
  const { nonce, token } = issueState(SECRET);
  assert.equal(verifyState(token, nonce, SECRET), true);
});

test('the nonce is long, random and unguessable', () => {
  const first = issueState(SECRET).nonce;
  const second = issueState(SECRET).nonce;
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test('a nonce from a different login attempt is rejected', () => {
  const { token } = issueState(SECRET);
  const { nonce: otherNonce } = issueState(SECRET);
  assert.equal(verifyState(token, otherNonce, SECRET), false);
});

test('a nonce of a different length is rejected without throwing', () => {
  const { token } = issueState(SECRET);
  assert.equal(verifyState(token, 'short', SECRET), false);
});

test('an expired state is rejected', () => {
  const { nonce, token } = issueState(SECRET, -1);
  assert.equal(verifyState(token, nonce, SECRET), false);
});

test('a token signed with a different secret is rejected', () => {
  const { nonce, token } = issueState('some-other-secret');
  assert.equal(verifyState(token, nonce, SECRET), false);
});

test('a tampered token is rejected', () => {
  const { nonce, token } = issueState(SECRET);
  const [header, payload, signature] = token.split('.');
  const forged = jwt.sign({ nonce }, 'attacker-secret').split('.')[1];
  assert.equal(verifyState([header, forged, signature].join('.'), nonce, SECRET), false);
});

// Domain separation: the state token is signed with a key derived from
// JWT_SECRET, not JWT_SECRET itself. Without this, a session token and a state
// token would be interchangeable — and `authenticate()` in middleware.js would
// accept a state token dropped into the `token` cookie, yielding a `req.user`
// with no id.
test('a token signed with the raw JWT secret does not pass as state', () => {
  const nonce = 'a'.repeat(64);
  const sessionShaped = jwt.sign({ nonce }, SECRET, { expiresIn: STATE_TTL_SECONDS });
  assert.equal(verifyState(sessionShaped, nonce, SECRET), false);
});

test('a missing cookie is rejected', () => {
  const { nonce } = issueState(SECRET);
  assert.equal(verifyState(undefined, nonce, SECRET), false);
  assert.equal(verifyState('', nonce, SECRET), false);
});

test('a missing state parameter is rejected', () => {
  const { token } = issueState(SECRET);
  assert.equal(verifyState(token, undefined, SECRET), false);
  assert.equal(verifyState(token, '', SECRET), false);
});

// Express turns a repeated `?state=a&state=b` into an array, which would break a
// naive string comparison. It must fail closed instead.
test('a repeated state query parameter is rejected', () => {
  const { nonce, token } = issueState(SECRET);
  assert.equal(verifyState(token, [nonce, nonce], SECRET), false);
});
