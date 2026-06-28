import { Router } from 'express';
import { sql } from '../../db.js';
import { validateProfilePatch, toProfile } from '../profile.js';

const router = Router();

// GET /api/profile — the current user's profile. `realm` is null until the
// realm feature is integrated (the realm tables don't exist on this branch).
router.get('/', async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, name, email, avatar_url, colour FROM users WHERE id = ${req.user.id}
    `;
    if (!rows[0]) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'No such user' });
    }
    res.json(toProfile(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to load profile' });
  }
});

// PATCH /api/profile — edit name, avatar, and/or colour. All fields optional;
// only provided fields change. COALESCE keeps each unspecified column as-is.
router.patch('/', async (req, res) => {
  const result = validateProfilePatch(req.body ?? {});
  if (!result.ok) {
    return res.status(400).json({ error: result.error, message: result.message });
  }
  const { name = null, avatarUrl = null, colour = null } = result.updates;
  try {
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
    res.json(toProfile(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update profile' });
  }
});

export default router;
