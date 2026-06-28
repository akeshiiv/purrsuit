import { Router } from 'express';
import { authenticate } from '../middleware.js';
import { RealmError } from '../realms/service.js';
import { leaderboard, seasonAck, seasonStatus } from '../season/service.js';

const router = Router();

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(authenticate);

router.get('/realm/leaderboard', asyncHandler(async (req, res) => {
  const payload = await leaderboard(req.user.id, { since: req.query.since });
  res.json(payload);
}));

router.get('/realm/season-status', asyncHandler(async (req, res) => {
  const payload = await seasonStatus(req.user.id);
  res.json(payload);
}));

router.post('/realm/season-ack', asyncHandler(async (req, res) => {
  const payload = await seasonAck(req.user.id);
  res.json(payload);
}));

router.use((err, req, res, next) => {
  if (err instanceof RealmError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  return next(err);
});

export default router;
