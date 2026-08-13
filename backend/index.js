// Import config first so required env vars are validated before anything else runs
// (and so dotenv is loaded before db.js / passport read their settings).
import { config } from './src/config/env.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import passport from './src/passport.js';
import authRouter from './src/routes/auth.js';
import realmsRouter from './src/routes/realms.js';
import shopRouter from './src/routes/shop.js';
import studyRouter from './src/routes/study.js';
import mapRouter from './src/routes/map.js';
import seasonRouter from './src/routes/season.js';
import profileRouter from './src/routes/profile.js';
import { doubleCsrfProtection, generateCsrfToken } from './src/csrf.js';
import { globalLimiter, authLimiter, sessionCheckLimiter } from './src/rateLimit.js';

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

// The session check gets its own budget; the OAuth routes keep the strict one.
// `req.path` is the remainder after the '/auth' mount point, so it is '/me' for
// the route being singled out. Dispatching here rather than applying a limiter
// inside authRouter keeps every request on exactly one of the two — handing the
// same request to both would double-count it and trip whichever is tighter.
function limitAuthRoute(req, res, next) {
  const limiter = req.path === '/me' ? sessionCheckLimiter : authLimiter;
  return limiter(req, res, next);
}

app.use('/auth', limitAuthRoute, authRouter);

// API ROUTES

// Health check. Asserted by both deploy jobs in .github/workflows/deploy.yml
// against the production alias, so this has to keep answering 200 on GET /.
app.get('/', (req, res) => {
  res.send('The Purrsuit API is working!!!');
});

// `/api/hello` (a scaffold test route), `/api/me` and `/api/name` used to live
// here. All three were removed: nothing in the SPA, the mock layer or the API
// contract ever called them, and the latter two were second, thinner copies of
// endpoints that are actually used — /auth/me already answers "who am I", and
// GET /api/profile returns the name along with the rest of the profile. Two of
// them were authenticated, so they were live surface that had to be kept correct
// and secure for no caller. /api/name also read `rows[0].name` unguarded, which
// turned a deleted user into a 500 reported as "Failed to fetch name".
app.use('/api', realmsRouter);
app.use('/api', shopRouter);
app.use('/api', studyRouter);
app.use('/api', mapRouter);
app.use('/api', seasonRouter);
app.use('/api', profileRouter);

// Error handler: return a clean 403 for CSRF failures, otherwise a generic 500.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'CSRF_INVALID', message: 'Invalid CSRF token' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = config.PORT
app.listen(PORT, () => console.log(`Server running on port ${PORT}!`))
