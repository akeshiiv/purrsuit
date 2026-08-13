import test from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction, _setTransactionPool } from './db.js';

// A fake client that records the SQL commands it receives and whether it was
// released, so withTransaction's control flow can be verified without a DB.
function makeFakeClient() {
  const queries = [];
  let released = false;
  return {
    queries,
    get released() {
      return released;
    },
    query(text, values) {
      queries.push(values === undefined ? text : { text, values });
      return Promise.resolve({ rows: [] });
    },
    release() {
      released = true;
    },
  };
}

function fakePoolReturning(client) {
  return { connect: () => Promise.resolve(client) };
}

test('issues BEGIN then COMMIT on success and returns fn value', async () => {
  const client = makeFakeClient();
  _setTransactionPool(fakePoolReturning(client));

  const result = await withTransaction(async (tx) => {
    await tx`SELECT * FROM realms WHERE id = ${42}`;
    return 'done';
  });

  assert.equal(result, 'done');
  assert.equal(client.queries[0], 'BEGIN');
  assert.equal(client.queries.at(-1), 'COMMIT');
  assert.ok(!client.queries.includes('ROLLBACK'));
});

test('issues BEGIN then ROLLBACK and rethrows when fn throws', async () => {
  const client = makeFakeClient();
  _setTransactionPool(fakePoolReturning(client));

  await assert.rejects(
    () => withTransaction(async () => {
      throw new Error('boom');
    }),
    /boom/,
  );

  assert.equal(client.queries[0], 'BEGIN');
  assert.ok(client.queries.includes('ROLLBACK'));
  assert.ok(!client.queries.includes('COMMIT'));
});

test('releases the client on success', async () => {
  const client = makeFakeClient();
  _setTransactionPool(fakePoolReturning(client));

  await withTransaction(async () => 'ok');

  assert.ok(client.released);
});

test('releases the client when fn throws', async () => {
  const client = makeFakeClient();
  _setTransactionPool(fakePoolReturning(client));

  await assert.rejects(
    () => withTransaction(async () => {
      throw new Error('nope');
    }),
  );

  assert.ok(client.released);
});

test('exposes a parameterized query helper for dynamic bulk SQL inside transactions', async () => {
  const client = makeFakeClient();
  _setTransactionPool(fakePoolReturning(client));

  await withTransaction(async (tx) => {
    await tx.query('INSERT INTO cells(x, y) VALUES ($1, $2)', [1, 2]);
  });

  assert.deepEqual(client.queries[1], {
    text: 'INSERT INTO cells(x, y) VALUES ($1, $2)',
    values: [1, 2],
  });
});

// Regression: the placeholder used to be emitted only when `values[i] !== undefined`,
// which conflated the trailing template fragment (genuinely has no value) with a
// caller passing an absent field. The value was still sent to the driver, so the
// statement came out with a hole in it — `SELECT , $2` — and failed as a syntax
// error, where production's neon() driver binds NULL for the same call.
test('an undefined interpolation still gets a placeholder rather than a hole', async () => {
  const seen = [];
  _setTransactionPool({
    connect: () => Promise.resolve({
      query(text, values) {
        seen.push({ text: String(text), values });
        return Promise.resolve({ rows: [] });
      },
      release() {},
    }),
  });

  const missing = undefined;
  await withTransaction(async (tx) => {
    await tx`SELECT ${missing}, ${7} FROM t WHERE k = ${'x'}`;
  });

  const statement = seen.find((q) => /SELECT/.test(q.text));
  assert.equal(
    statement.text,
    'SELECT $1, $2 FROM t WHERE k = $3',
    'every interpolation gets its own placeholder, by position',
  );
  assert.deepEqual(statement.values, [undefined, 7, 'x']);
});

test('the trailing template fragment does not get a placeholder of its own', async () => {
  const seen = [];
  _setTransactionPool({
    connect: () => Promise.resolve({
      query(text, values) {
        seen.push({ text: String(text), values });
        return Promise.resolve({ rows: [] });
      },
      release() {},
    }),
  });

  await withTransaction(async (tx) => {
    await tx`UPDATE t SET a = ${1} WHERE id = ${2}`;
  });

  const statement = seen.find((q) => /UPDATE/.test(q.text));
  assert.equal(statement.text, 'UPDATE t SET a = $1 WHERE id = $2');
  assert.deepEqual(statement.values, [1, 2]);
});
