import { Router } from 'express';
import { sql } from '../../db.js';
import { authenticate } from '../middleware.js';
import { validateProfilePatch, toProfile } from '../profile.js';
import { memberRealmSummary } from '../realms/service.js';

const router = Router();

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(authenticate);

// GET /api/profile — the current user's profile, with their RealmSummary (or
// null when they are in no realm).
router.get('/profile', asyncHandler(async (req, res) => {
  const rows = await sql`
    SELECT id, name, email, avatar_url, colour FROM users WHERE id = ${req.user.id}
  `;
  if (!rows[0]) {
    return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'No such user' });
  }
  res.json(toProfile(rows[0], await memberRealmSummary(req.user.id)));
}));

// PATCH /api/profile — edit name, avatar, and/or colour. All fields optional;
// only provided fields change. COALESCE keeps each unspecified column as-is.
router.patch('/profile', asyncHandler(async (req, res) => {
  const result = validateProfilePatch(req.body ?? {});
  if (!result.ok) {
    return res.status(400).json({ error: result.error, message: result.message });
  }
  const { name = null, avatarUrl = null, colour = null } = result.updates;
  const rows = await sql`
    UPDATE users
    SET name = COALESCE(${name}, name),
        avatar_url = COALESCE(${avatarUrl}, avatar_url),
        colour = COALESCE(${colour}, colour)
    WHERE id = ${req.user.id}
    RETURNING id, name, email, avatar_url, colour
  `;
  if (!rows[0]) {
    return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'No such user' });
  }
  res.json(toProfile(rows[0], await memberRealmSummary(req.user.id)));
}));

export default router;
