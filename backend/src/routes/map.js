import { Router } from 'express';
import { authenticate } from '../middleware.js';
import { RealmError } from '../realms/service.js';
import { attack, defend, realmMap } from '../map/service.js';

const router = Router();

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

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

router.use((err, req, res, next) => {
  if (err instanceof RealmError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  return next(err);
});

export default router;
