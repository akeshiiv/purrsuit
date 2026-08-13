import { Router } from 'express';
import { authenticate } from '../middleware.js';
import { asyncHandler, realmErrors } from './handlers.js';
import { buyUnit, getInventory } from '../shop/service.js';

const router = Router();

router.use(authenticate);

router.post('/shop/buy', asyncHandler(async (req, res) => {
  const payload = await buyUnit(req.user.id, req.body);
  res.json(payload);
}));

router.get('/shop/inventory', asyncHandler(async (req, res) => {
  const payload = await getInventory(req.user.id);
  res.json(payload);
}));

router.use(realmErrors);

export default router;
