// Pure environment-variable validation. Kept side-effect free (no dotenv import,
// no reading of process.env at module load) so it can be unit-tested directly.
// The eager, app-facing entrypoint is ./env.js, which calls loadConfig(process.env).

// Variables the server cannot run correctly without. Missing any of these is a
// configuration error we want to surface at startup rather than at request time
// (e.g. signing JWTs with an `undefined` secret).
export const REQUIRED_VARS = [
  'JWT_SECRET',
  'CSRF_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'DATABASE_URL',
  'FRONTEND_URL',
];

// Where rate-limit counters are kept. `postgres` is the default because the
// in-process store is per-instance on serverless and therefore enforces nothing;
// `memory` is the documented escape hatch. Optional, so it stays out of
// REQUIRED_VARS — but a typo is caught here at startup rather than silently
// falling back to a setting the operator did not ask for.
export const RATE_LIMIT_STORES = ['postgres', 'memory'];

// Validate `env` and return a frozen config object. Throws a single error listing
// ALL missing variables (not just the first) so a misconfiguration can be fixed in
// one pass.
export function loadConfig(env = process.env) {
  const missing = REQUIRED_VARS.filter((name) => {
    const value = env[name];
    return value === undefined || value === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them (e.g. in your .env file or hosting provider) before starting the server.'
    );
  }

  const rateLimitStore = env.RATE_LIMIT_STORE ?? 'postgres';
  if (!RATE_LIMIT_STORES.includes(rateLimitStore)) {
    throw new Error(
      `Invalid RATE_LIMIT_STORE: "${rateLimitStore}". Expected one of: ${RATE_LIMIT_STORES.join(', ')}.`
    );
  }

  const config = {};
  for (const name of REQUIRED_VARS) config[name] = env[name];
  config.NODE_ENV = env.NODE_ENV ?? 'development';
  config.PORT = env.PORT ?? 5000;
  config.RATE_LIMIT_STORE = rateLimitStore;

  return Object.freeze(config);
}
