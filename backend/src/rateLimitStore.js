// A hit-counter store for express-rate-limit backed by the app's Postgres
// database (see migrations/009_rate_limits.sql for why the in-memory default is
// not enough on serverless). Implements the v8 Store interface: init, increment,
// decrement, resetKey.

// Fallback used until express-rate-limit hands us the limiter's real window via
// init(); matches the 15-minute window rateLimit.js configures.
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

export class PostgresRateLimitStore {
  // `scope` partitions the table so each limiter counts independently. `sql` is
  // a test seam — left unset in production, where it is resolved lazily on first
  // use so that merely importing this module never opens a database connection.
  constructor({ scope, sql, logger } = {}) {
    if (typeof scope !== 'string' || scope.length === 0) {
      throw new Error('PostgresRateLimitStore requires a non-empty scope.');
    }
    this.scope = scope;
    this.windowMs = DEFAULT_WINDOW_MS;
    // Tells express-rate-limit the counters are shared across instances rather
    // than living in this process.
    this.localKeys = false;
    // Declarative only — the table is partitioned by the scope column above, and
    // express-rate-limit never prepends this to the key it passes to increment().
    // It exists because /auth traffic passes through the global limiter and then
    // the auth one: with localKeys false, express-rate-limit identifies a store by
    // its class name, so without a distinguishing prefix it would see the same key
    // counted twice on one request and log a double-count error every time.
    this.prefix = `${scope}:`;
    this.injectedSql = sql ?? null;
    this.logger = logger ?? console;
  }

  // Deliberately synchronous. express-rate-limit does not await init, and
  // increment can fire before it returns; assigning here leaves no window in
  // which a request could be counted against the wrong window length.
  init(options) {
    if (typeof options?.windowMs === 'number' && options.windowMs > 0) {
      this.windowMs = options.windowMs;
    }
  }

  async resolveSql() {
    if (!this.injectedSql) {
      const db = await import('../db.js');
      this.injectedSql = db.sql;
    }
    return this.injectedSql;
  }

  // Fail OPEN. A rate limiter is a nice-to-have; the app being reachable is not.
  // If the database is unavailable we log and let the request through rather
  // than locking every user out of Purrsuit over a limiter outage. One hit
  // against a fresh window is reported instead of zero because express-rate-limit
  // validates that totalHits is a positive integer and would otherwise log a
  // second error for every single request.
  failOpen(err, resetTime) {
    this.logger.error(err, `rate limit store unavailable (scope=${this.scope}); allowing request`);
    return { totalHits: 1, resetTime };
  }

  async increment(key) {
    const resetAt = new Date(Date.now() + this.windowMs);
    try {
      const sql = await this.resolveSql();
      // One statement does all of it: claim the row, and on conflict either
      // start a fresh window (the stored one has lapsed) or add to the running
      // one. Splitting this into a read and a write would let two instances
      // interleave and lose counts, which is the whole problem being fixed.
      // The CASEs read rate_limits.* — `excluded.*` is the row we tried to
      // insert, not the counter already stored.
      const rows = await sql`
        INSERT INTO rate_limits (scope, key, hits, reset_at)
        VALUES (${this.scope}, ${String(key)}, 1, ${resetAt})
        ON CONFLICT (scope, key) DO UPDATE
        SET hits = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
            reset_at = CASE WHEN rate_limits.reset_at <= now() THEN ${resetAt} ELSE rate_limits.reset_at END
        RETURNING hits, reset_at
      `;
      const row = rows[0];
      if (!row) return this.failOpen(new Error('rate_limits upsert returned no row'), resetAt);
      return { totalHits: Number(row.hits), resetTime: new Date(row.reset_at) };
    } catch (err) {
      return this.failOpen(err, resetAt);
    }
  }

  // Called when a limiter is configured to refund requests it decided not to
  // count. Clamped at zero, and skipped on a lapsed window so a refund can never
  // resurrect an expired counter.
  async decrement(key) {
    try {
      const sql = await this.resolveSql();
      await sql`
        UPDATE rate_limits
        SET hits = GREATEST(hits - 1, 0)
        WHERE scope = ${this.scope} AND key = ${String(key)} AND reset_at > now()
      `;
    } catch (err) {
      this.logger.error(err, `rate limit decrement failed (scope=${this.scope})`);
    }
  }

  async resetKey(key) {
    try {
      const sql = await this.resolveSql();
      await sql`
        DELETE FROM rate_limits WHERE scope = ${this.scope} AND key = ${String(key)}
      `;
    } catch (err) {
      this.logger.error(err, `rate limit reset failed (scope=${this.scope})`);
    }
  }
}
