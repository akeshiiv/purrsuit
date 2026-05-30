import { neon } from '@neondatabase/serverless'
import pg from 'pg';

let sql;

if (process.env.NODE_ENV === 'production') {
  sql = neon(process.env.DATABASE_URL);
} else {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  sql = (strings, ...values) => {
    const query = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? `$${i + 1}` : ''), '');
    return pool.query(query, values).then((res) => res.rows);
  };
}

export { sql };