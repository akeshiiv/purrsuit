import { Router } from 'express';
import { authenticate } from '../middleware.js';
import { RealmError } from '../realms/service.js';
import { completeStudy, getStudyStats, startStudySession } from '../study/service.js';
import { logTermination } from '../study/terminate.js';

const router = Router();

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.use(authenticate);

// Opening a session is what makes completing one payable: the reward is settled
// against the row this writes, not against anything the client reports later.
router.post('/study/start', asyncHandler(async (req, res) => {
  const payload = await startStudySession(req.user.id, req.body);
  res.json(payload);
}));

router.post('/study/complete', asyncHandler(async (req, res) => {
  const payload = await completeStudy(req.user.id, req.body);
  res.json(payload);
}));

router.get('/study/stats', asyncHandler(async (req, res) => {
  const payload = await getStudyStats(req.user.id, req.query.tz);
  res.json(payload);
}));

router.post('/study/terminate', asyncHandler(async (req, res) => {
  const payload = await logTermination(req.user.id, req.body);
  res.json(payload);
}));

router.use((err, req, res, next) => {
  if (err instanceof RealmError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  return next(err);
});

export default router;
