import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresRateLimitStore } from './rateLimitStore.js';

// Stand-in for db.js's tagged-template `sql`, recording each statement with its
// bound values and rendering placeholders the same way db.js does so assertions
// read like the real query. `handler` scripts the rows that come back.
function fakeSql(handler) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings
      .reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''), '')
      .replace(/\s+/g, ' ')
      .trim();
    calls.push({ text, values });
    return Promise.resolve(handler ? handler({ text, values }) : []);
  };
  sql.calls = calls;
  return sql;
}

function storeWith(handler, options = {}) {
  const sql = fakeSql(handler);
  const errors = [];
  const store = new PostgresRateLimitStore({
    scope: 'global',
    sql,
    logger: { error: (...args) => errors.push(args) },
    ...options,
  });
  return { store, sql, errors };
}

test('reports the hit count and window the database returned', async () => {
  const resetAt = new Date('2026-08-01T12:15:00Z');
  const { store } = storeWith(() => [{ hits: 7, reset_at: resetAt }]);

  const result = await store.increment('1.2.3.4');
  assert.equal(result.totalHits, 7);
  assert.equal(result.resetTime.getTime(), resetAt.getTime());
});

// The whole point of moving off MemoryStore: two instances incrementing at once
// must not lose counts. A read-then-write pair can interleave; a single upsert
// cannot, so assert increment stays one statement.
test('increments with a single atomic upsert', async () => {
  const { store, sql } = storeWith(() => [{ hits: 1, reset_at: new Date() }]);
  await store.increment('1.2.3.4');

  assert.equal(sql.calls.length, 1, 'increment must issue exactly one statement');
  const { text } = sql.calls[0];
  assert.match(text, /INSERT INTO rate_limits/i);
  assert.match(text, /ON CONFLICT \(scope, key\) DO UPDATE/i);
  assert.match(text, /RETURNING hits, reset_at/i);
});

// A lapsed window has to restart at 1 inside the same statement. Reading the
// stored counter requires rate_limits.*; `excluded.*` is the row we tried to
// insert and would make every request look like a first one.
test('the upsert restarts a lapsed window and otherwise adds to the running one', async () => {
  const { store, sql } = storeWith(() => [{ hits: 2, reset_at: new Date() }]);
  await store.increment('1.2.3.4');

  const { text } = sql.calls[0];
  assert.match(text, /hits = CASE WHEN rate_limits\.reset_at <= now\(\) THEN 1 ELSE rate_limits\.hits \+ 1 END/i);
  assert.match(text, /reset_at = CASE WHEN rate_limits\.reset_at <= now\(\) THEN \$\d+ ELSE rate_limits\.reset_at END/i);
  assert.ok(!/excluded\./i.test(text), 'must read the stored counter, not the rejected insert');
});

test('binds its own scope so limiters never share a counter', async () => {
  const global = storeWith(() => [{ hits: 1, reset_at: new Date() }]);
  const auth = storeWith(() => [{ hits: 1, reset_at: new Date() }], { scope: 'auth' });

  await global.store.increment('1.2.3.4');
  await auth.store.increment('1.2.3.4');

  assert.equal(global.sql.calls[0].values[0], 'global');
  assert.equal(auth.sql.calls[0].values[0], 'auth');
});

test('rejects construction without a scope, which would merge every limiter', () => {
  assert.throws(() => new PostgresRateLimitStore({}), /scope/);
});

// db.js's dev tagged template builds `$n` from the values that are defined, so a
// single undefined argument silently renumbers every placeholder after it.
test('never binds an undefined value', async () => {
  const { store, sql } = storeWith(() => [{ hits: 1, reset_at: new Date() }]);
  store.init({ windowMs: 1000 });
  await store.increment('1.2.3.4');
  await store.decrement('1.2.3.4');
  await store.resetKey('1.2.3.4');

  for (const call of sql.calls) {
    for (const value of call.values) {
      assert.notEqual(value, undefined, `undefined bound in: ${call.text}`);
    }
  }
});

test('init takes the limiter window and applies it to the stored reset time', async () => {
  const { store, sql } = storeWith(() => [{ hits: 1, reset_at: new Date() }]);
  store.init({ windowMs: 60_000 });

  const before = Date.now();
  await store.increment('1.2.3.4');
  const resetAt = sql.calls[0].values[3];

  assert.ok(resetAt instanceof Date);
  assert.ok(resetAt.getTime() >= before + 60_000, 'reset_at should be one window out');
  assert.ok(resetAt.getTime() <= Date.now() + 60_000);
});

test('init ignores a missing or nonsensical window instead of poisoning reset_at', () => {
  const { store } = storeWith();
  const original = store.windowMs;
  store.init(undefined);
  store.init({ windowMs: 0 });
  store.init({ windowMs: 'soon' });
  assert.equal(store.windowMs, original);
});

// Availability beats limiting: a database outage must not lock every user out of
// the app. express-rate-limit also validates that totalHits is a positive
// integer, so the fail-open answer has to be 1, not 0.
test('fails OPEN when the database errors', async () => {
  const { store, errors } = storeWith(() => {
    throw new Error('connection refused');
  });
  store.init({ windowMs: 60_000 });

  const result = await store.increment('1.2.3.4');
  assert.equal(result.totalHits, 1);
  assert.ok(result.resetTime instanceof Date);
  assert.ok(result.resetTime.getTime() > Date.now());
  assert.equal(errors.length, 1, 'the outage is logged rather than swallowed');
});

test('fails OPEN when the upsert somehow returns no row', async () => {
  const { store, errors } = storeWith(() => []);
  const result = await store.increment('1.2.3.4');
  assert.equal(result.totalHits, 1);
  assert.equal(errors.length, 1);
});

test('decrement clamps at zero and leaves a lapsed window alone', async () => {
  const { store, sql } = storeWith();
  await store.decrement('1.2.3.4');

  const { text, values } = sql.calls[0];
  assert.match(text, /SET hits = GREATEST\(hits - 1, 0\)/i);
  assert.match(text, /reset_at > now\(\)/i);
  assert.deepEqual(values, ['global', '1.2.3.4']);
});

test('resetKey clears only this scope', async () => {
  const { store, sql } = storeWith();
  await store.resetKey('1.2.3.4');

  assert.match(sql.calls[0].text, /DELETE FROM rate_limits WHERE scope = \$1 AND key = \$2/i);
  assert.deepEqual(sql.calls[0].values, ['global', '1.2.3.4']);
});

test('decrement and resetKey swallow database errors so a request still succeeds', async () => {
  const { store, errors } = storeWith(() => {
    throw new Error('connection refused');
  });
  await store.decrement('1.2.3.4');
  await store.resetKey('1.2.3.4');
  assert.equal(errors.length, 2);
});

// express-rate-limit uses localKeys to tell shared stores from per-process ones.
test('declares its keys as shared, not process-local', () => {
  const { store } = storeWith();
  assert.equal(store.localKeys, false);
});

// With localKeys false, express-rate-limit identifies a store by class name, so
// the global and auth limiters look like one store. /auth requests pass through
// both, and without distinct prefixes each one would trip the double-count
// validation and log an error per request.
test('carries a scope-derived prefix so two limiters are told apart', () => {
  const global = new PostgresRateLimitStore({ scope: 'global' });
  const auth = new PostgresRateLimitStore({ scope: 'auth' });
  assert.ok(global.prefix);
  assert.notEqual(global.prefix, auth.prefix);
});

// The limiters are constructed at module import, which on Vercel happens on
// every cold start. Resolving the driver lazily keeps that free, and keeps the
// tests that import this module's neighbours off the network.
test('constructing the store touches no database', () => {
  const store = new PostgresRateLimitStore({ scope: 'global' });
  assert.equal(store.injectedSql, null);
});
