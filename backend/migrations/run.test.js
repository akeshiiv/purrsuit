import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingMigrations } from './run.js';

test('returns lexically sorted pending files', () => {
  const result = pendingMigrations(
    ['002_b.sql', '001_a.sql', '003_c.sql'],
    new Set(),
  );
  assert.deepEqual(result, ['001_a.sql', '002_b.sql', '003_c.sql']);
});

test('excludes already-applied files', () => {
  const result = pendingMigrations(
    ['001_a.sql', '002_b.sql', '003_c.sql'],
    new Set(['001_a.sql', '003_c.sql']),
  );
  assert.deepEqual(result, ['002_b.sql']);
});

test('returns empty when all files are already applied', () => {
  const result = pendingMigrations(
    ['001_a.sql', '002_b.sql'],
    new Set(['001_a.sql', '002_b.sql']),
  );
  assert.deepEqual(result, []);
});

test('handles empty inputs', () => {
  assert.deepEqual(pendingMigrations([], new Set()), []);
  assert.deepEqual(pendingMigrations([], new Set(['001_a.sql'])), []);
});
