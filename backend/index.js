// Import config first so required env vars are validated before anything else runs
// (and so dotenv is loaded before db.js / passport read their settings).
import { config } from './src/config/env.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { sql } from './db.js';
import { validateAndComputeAward, parseCoins } from './src/coins.js';
import { authenticate } from './src/middleware.js';
import passport from './src/passport.js';
import authRouter from './src/routes/auth.js';
import { doubleCsrfProtection, generateCsrfToken } from './src/csrf.js';
import { globalLimiter, authLimiter } from './src/rateLimit.js';

const app = express()

// Behind Vercel's proxy: trust the first hop so rate limiting sees the real client IP.
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json());
app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(globalLimiter);
// CSRF guards mutating methods; GET/HEAD/OPTIONS (incl. the OAuth flow) pass through.
app.use(doubleCsrfProtection);
app.use(passport.initialize());

// Issue a CSRF token (and set the double-submit cookie). The SPA fetches this and
// echoes the token back in the `x-csrf-token` header on mutating requests.
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});

// ROUTERS
app.use('/auth', authLimiter, authRouter);

// API ROUTES

// home route
app.get('/', (req, res) => {
  res.send('The Purrsuit API is working!!!');
});

// test route
app.get('/api/hello', (req, res) => { 
  res.json({ message: 'Hello from Express!' })
})

// get current user info
app.get('/api/me', authenticate, (req, res) => res.json(req.user));

// retrieve user coins
app.get('/api/coins', authenticate, async (req, res) => {
  try {
    const rows = await sql`SELECT coins::int AS coins FROM users WHERE id = ${req.user.id}`;
    res.json({ coins: parseCoins(rows[0]?.coins) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch coins' });
  }
});

// update coins and log session
app.post('/api/coins', authenticate, async (req, res) => {
  // The award is derived server-side from the validated duration. Any
  // `coinsEarned` sent by the client is ignored so the balance cannot be forged.
  const { duration } = req.body ?? {};
  const result = validateAndComputeAward(duration);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  const { award } = result;
  try {
    const rows = await sql`
      UPDATE users SET coins = coins + ${award} WHERE id = ${req.user.id} RETURNING coins::int AS coins
    `;
    await sql`
      INSERT INTO sessions (user_id, duration, coins_earned)
      VALUES (${req.user.id}, ${duration}, ${award})
    `;
    res.json({ coins: parseCoins(rows[0]?.coins) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update coins' });
  }
});

// retrieve user's name
app.get('/api/name', authenticate, async (req, res) => {
  try {
    const rows = await sql`SELECT name FROM users WHERE id = ${req.user.id}`;
    res.json({ name: rows[0].name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch name' });
  }
});

// Error handler: return a clean 403 for CSRF failures, otherwise a generic 500.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = config.PORT
app.listen(PORT, () => console.log(`Server running on port ${PORT}!`))