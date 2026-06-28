import { Router } from 'express';
import { authenticate } from '../middleware.js';
import {
  RealmError,
  createRealm,
  currentRealm,
  endSeasonNow,
  joinRealm,
  kickMember,
  leaveRealm,
  updateRealmSettings,
} from '../realms/service.js';

const router = Router();

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function parseRealmId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requireRealmId(req) {
  const id = parseRealmId(req.params.id);
  if (!id) {
    throw new RealmError(403, 'NOT_ADMIN', 'Only the realm admin can do that.');
  }
  return id;
}

router.use(authenticate);

router.post('/realms', asyncHandler(async (req, res) => {
  const payload = await createRealm(req.user.id, req.body);
  res.status(201).json(payload);
}));

router.post('/realms/join', asyncHandler(async (req, res) => {
  const payload = await joinRealm(req.user.id, req.body);
  res.json(payload);
}));

router.get('/realms/current', asyncHandler(async (req, res) => {
  const payload = await currentRealm(req.user.id);
  res.json(payload);
}));

router.post('/realms/leave', asyncHandler(async (req, res) => {
  const payload = await leaveRealm(req.user.id);
  res.json(payload);
}));

router.post('/realms/:id/kick', asyncHandler(async (req, res) => {
  const payload = await kickMember(req.user.id, requireRealmId(req), req.body);
  res.json(payload);
}));

router.post('/realms/:id/end-season', asyncHandler(async (req, res) => {
  const payload = await endSeasonNow(req.user.id, requireRealmId(req));
  res.json(payload);
}));

router.patch('/realms/:id/settings', asyncHandler(async (req, res) => {
  const payload = await updateRealmSettings(req.user.id, requireRealmId(req), req.body);
  res.json(payload);
}));

router.use((err, req, res, next) => {
  if (err instanceof RealmError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  return next(err);
});

export default router;
