// Load .env so `npm run migrate` picks up DATABASE_URL the same way the server
// does (index.js gets it via src/config/env.js). Without this, run() connects
// with no connection string and fails on auth rather than on a missing variable.
import 'dotenv/config';
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Pure decision logic, exported for unit testing without a DB: given every
// *.sql filename in the migrations dir and the set already recorded in
// _migrations, return the not-yet-applied ones in lexical order (so 001_ < 002_).
export function pendingMigrations(allSqlFilenames, appliedFilenameSet) {
  return [...allSqlFilenames]
    .sort()
    .filter((filename) => !appliedFilenameSet.has(filename));
}

// Apply all pending migrations. Connects with pg directly (NOT the neon HTTP
// driver) so multi-statement files and BEGIN/COMMIT work uniformly in local/CI.
async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM _migrations');
    const appliedSet = new Set(rows.map((row) => row.filename));

    const allFiles = await readdir(__dirname);
    const sqlFiles = allFiles.filter((filename) => filename.endsWith('.sql'));
    const pending = pendingMigrations(sqlFiles, appliedSet);
    const pendingSet = new Set(pending);

    for (const filename of [...sqlFiles].sort()) {
      if (!pendingSet.has(filename)) {
        console.log(`skipped (already applied): ${filename}`);
      }
    }

    for (const filename of pending) {
      const content = await readFile(join(__dirname, filename), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(content);
        await client.query('INSERT INTO _migrations(filename) VALUES($1)', [filename]);
        await client.query('COMMIT');
        console.log(`applied: ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        // Rethrow rather than process.exit(1) here. exit() is immediate: it
        // skips the `finally` below that closes the client, and because stdout
        // and stderr are asynchronous when they are pipes — which is what CI
        // hands us — it can truncate the very line explaining what failed,
        // leaving a red job with no reason on it. Unwinding normally lets the
        // client close, lets Node drain both streams, and still exits non-zero
        // via the handler at the bottom of this file.
        throw new Error(`FAILED: ${filename} — ${err.message}`, { cause: err });
      }
    }

    const alreadyPresent = sqlFiles.length - pending.length;
    console.log(`\n${pending.length} applied, ${alreadyPresent} already present`);
  } finally {
    await client.end();
  }
}

// Only touch the DB when invoked directly (node migrations/run.js); importing
// this file in tests must never open a connection.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    // exitCode rather than exit(): Node exits once the event loop drains, so
    // the message above is flushed even when stderr is a pipe.
    process.exitCode = 1;
  });
}
