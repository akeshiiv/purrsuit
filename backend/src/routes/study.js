import { Router } from 'express';
import { authenticate } from '../middleware.js';
import { RealmError } from '../realms/service.js';
import { completeStudy } from '../study/service.js';

const router = Router();

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(authenticate);

router.post('/study/complete', asyncHandler(async (req, res) => {
  const payload = await completeStudy(req.user.id, req.body);
  res.json(payload);
}));

router.use((err, req, res, next) => {
  if (err instanceof RealmError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  return next(err);
});

export default router;
