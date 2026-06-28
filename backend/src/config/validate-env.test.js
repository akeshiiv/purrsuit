import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, REQUIRED_VARS } from './validate-env.js';

const FULL_ENV = {
  JWT_SECRET: 'jwt',
  CSRF_SECRET: 'csrf',
  GOOGLE_CLIENT_ID: 'gid',
  GOOGLE_CLIENT_SECRET: 'gsecret',
  GOOGLE_CALLBACK_URL: 'https://api.example.com/auth/google/callback',
  DATABASE_URL: 'postgres://localhost/db',
  FRONTEND_URL: 'https://app.example.com',
};

test('throws when all required vars are missing, listing every one', () => {
  assert.throws(
    () => loadConfig({}),
    (err) => {
      for (const name of REQUIRED_VARS) {
        assert.match(err.message, new RegExp(name), `error should mention ${name}`);
      }
      return true;
    }
  );
});

test('throws when a single required var is missing', () => {
  const { JWT_SECRET, ...partial } = FULL_ENV;
  assert.throws(() => loadConfig(partial), /JWT_SECRET/);
});

test('treats an empty-string var as missing (e.g. unset JWT_SECRET)', () => {
  assert.throws(() => loadConfig({ ...FULL_ENV, JWT_SECRET: '' }), /JWT_SECRET/);
});

test('returns a frozen config with all values when env is complete', () => {
  const config = loadConfig(FULL_ENV);
  for (const name of REQUIRED_VARS) {
    assert.equal(config[name], FULL_ENV[name]);
  }
  assert.ok(Object.isFrozen(config));
});

test('defaults NODE_ENV and PORT when not provided', () => {
  const config = loadConfig(FULL_ENV);
  assert.equal(config.NODE_ENV, 'development');
  assert.equal(config.PORT, 5000);
});
