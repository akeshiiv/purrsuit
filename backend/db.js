import { neon, Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import pg from 'pg';
import ws from 'ws';

// The neon WebSocket Pool needs a WebSocket constructor in Node. Setting this
// unconditionally is harmless for the dev pg.Pool and the prod neon HTTP driver.
neonConfig.webSocketConstructor = ws;

let sql;
// Pool used by withTransaction for interactive transactions. The prod neon()
// HTTP driver below cannot do BEGIN -> read -> branch -> write -> COMMIT, so we
// keep a separate pool that can: pg.Pool in dev, neon WS Pool in prod.
let transactionPool;

// The one tagged-template -> parameterised-query builder, used by both the dev
// `sql` and by every transaction's `tx`. It was written out twice, and both
// copies decided whether to emit a placeholder with `values[i] !== undefined`.
// That conflates two different things: `strings` always has exactly one more
// element than `values`, so the trailing fragment legitimately has no value,
// but so does a caller who passed an absent field. Given
// sql`SELECT ${maybeUndefined}, ${x}` the placeholder was dropped while the
// value was still handed to the driver, producing `SELECT , $2` — a syntax
// error rather than the NULL that production's neon() driver binds for the same
// call. Deciding by POSITION is what the format actually means, and it makes
// the two drivers agree.
function taggedTemplate(run) {
  return (strings, ...values) => {
    const query = strings.reduce(
      (acc, fragment, i) => acc + fragment + (i < values.length ? `$${i + 1}` : ''),
      '',
    );
    return run(query, values);
  };
}

if (process.env.NODE_ENV === 'production') {
  sql = neon(process.env.DATABASE_URL);
  transactionPool = new NeonPool({ connectionString: process.env.DATABASE_URL });
} else {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  transactionPool = pool;
  sql = taggedTemplate((query, values) => pool.query(query, values).then((res) => res.rows));
}

// Test seam: lets unit tests inject a fake pool so withTransaction's control
// flow can be verified without a live database.
export function _setTransactionPool(pool) {
  transactionPool = pool;
}

// Run fn inside a single interactive transaction and return its result. fn
// receives a transaction-bound tagged-template `tx` with the same call
// signature as `sql`, so handlers use it identically. Commits on success,
// rolls back and rethrows on any error, and always releases the client.
export async function withTransaction(fn) {
  const client = await transactionPool.connect();
  try {
    await client.query('BEGIN');
    const tx = taggedTemplate((query, values) => client.query(query, values).then((res) => res.rows));
    tx.query = (text, values = []) => client.query(text, values).then((res) => res.rows);
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { sql };
