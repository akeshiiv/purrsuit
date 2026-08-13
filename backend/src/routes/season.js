import { Router } from 'express';
import { authenticate } from '../middleware.js';
import { asyncHandler, realmErrors } from './handlers.js';
import { leaderboard, seasonAck, seasonStatus } from '../season/service.js';

const router = Router();

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

router.use(realmErrors);

export default router;
