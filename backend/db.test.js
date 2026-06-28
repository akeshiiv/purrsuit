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
