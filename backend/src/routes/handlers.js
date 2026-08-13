// Shared plumbing for the API routers. Both helpers below were copy-pasted
// verbatim into every router file — asyncHandler into all six, realmErrors into
// five — which is six chances for one of them to quietly stop matching the
// others. They do not vary by router, so they live here once.
import { RealmError } from '../realms/service.js';

// Express 5 forwards a rejected promise from a handler to the error middleware
// on its own, but only for handlers it can see returning one. Wrapping keeps
// that explicit and uniform across routers.
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// Translate the services' RealmError into the contract's error envelope
// ({ error: MACHINE_CODE, message }). Anything else is not ours to interpret and
// is handed on to the generic handler in index.js, which logs it and answers 500
// rather than leaking an internal message to the client.
export function realmErrors(err, req, res, next) {
  if (err instanceof RealmError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  return next(err);
}
