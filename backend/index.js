import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { sql } from './db.js';
import { authenticate } from './src/middleware.js';
import passport from './src/passport.js';
import authRouter from './src/routes/auth.js';

const app = express()

app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(passport.initialize());

// ROUTERS
app.use('/auth', authRouter);

// API ROUTES

// test route
app.get('/api/hello', (req, res) => { 
  res.json({ message: 'Hello from Express!' })
})

// get current user info
app.get('/api/me', authenticate, (req, res) => res.json(req.user));

// retrieve user coins
app.get('/api/coins', authenticate, async (req, res) => {
  try {
    const rows = await sql`SELECT coins FROM users WHERE id = ${req.user.id}`;
    res.json({ coins: rows[0].coins });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch coins' });
  }
});

// update coins and log session
app.post('/api/coins', authenticate, async (req, res) => {
  try {
    const { coinsEarned, duration } = req.body;
    const rows = await sql`
      UPDATE users SET coins = coins + ${coinsEarned} WHERE id = ${req.user.id} RETURNING coins
    `;
    await sql`
      INSERT INTO sessions (user_id, duration, coins_earned)
      VALUES (${req.user.id}, ${duration}, ${coinsEarned})
    `;
    res.json({ coins: rows[0].coins });
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

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server running on port ${PORT}!`))