import { Router } from 'express';
import { authenticate } from '../middleware.js';
import { RealmError } from '../realms/service.js';
import { buyUnit, getInventory } from '../shop/service.js';

const router = Router();

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(authenticate);

router.post('/shop/buy', asyncHandler(async (req, res) => {
  const payload = await buyUnit(req.user.id, req.body);
  res.json(payload);
}));

router.get('/shop/inventory', asyncHandler(async (req, res) => {
  const payload = await getInventory(req.user.id);
  res.json(payload);
}));

router.use((err, req, res, next) => {
  if (err instanceof RealmError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  return next(err);
});

export default router;
