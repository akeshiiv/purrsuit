import { Router } from 'express';
import { authenticate } from '../middleware.js';
import { asyncHandler, realmErrors } from './handlers.js';
import { attack, defend, realmMap } from '../map/service.js';

const router = Router();

router.use(authenticate);

router.get('/realm/map', asyncHandler(async (req, res) => {
  const payload = await realmMap(req.user.id, { since: req.query.since });
  res.json(payload);
}));

router.post('/realm/attack', asyncHandler(async (req, res) => {
  const payload = await attack(req.user.id, req.body);
  res.json(payload);
}));

router.post('/realm/defend', asyncHandler(async (req, res) => {
  const payload = await defend(req.user.id, req.body);
  res.json(payload);
}));

router.use(realmErrors);

export default router;
