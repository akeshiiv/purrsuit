import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { sql } from '../db.js';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const rows = await sql`
          INSERT INTO users (google_id, email, name, avatar_url, colour)
          VALUES (${profile.id}, ${profile.emails[0].value}, ${profile.displayName}, ${profile.photos[0].value || null}, ${profile.colour || null})
          ON CONFLICT (google_id) DO UPDATE SET name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url, colour = EXCLUDED.colour
          RETURNING *
        `;
        done(null, rows[0]);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

export default passport;