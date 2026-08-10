/* global process */
//
// Vercel Edge Middleware for the Purrsuit SPA.
//
// WHY THIS FILE EXISTS
// `vercel.json` cannot interpolate environment variables, and Vercel reads it
// when a deployment is created — before any build command runs. The `/auth` and
// `/api` rewrites in `frontend/vercel.json` are therefore frozen to the
// production backend for *every* deployment, previews included, so a preview
// deployment authenticates against and mutates production data.
//
// Those rewrites cannot simply be dropped: they exist so the backend's session
// cookies are first-party to the SPA's origin. A preview must still reach the
// backend through a same-origin rewrite, not a cross-origin fetch, or preview
// login breaks entirely.
//
// Edge Middleware is the one layer that can read `process.env` at request time,
// and it runs *before* `vercel.json` rewrites are applied — so a rewrite issued
// here wins, and returning nothing lets the request fall through to those
// rewrites completely unchanged.
//
// SCOPE
// Previews only. On production (and on any other non-preview deployment) this
// middleware returns immediately and behaves as if it were not installed.
//
// REQUIRED VERCEL ENVIRONMENT VARIABLES (frontend project)
//
//   VERCEL_ENV
//     Provided automatically by Vercel — "production", "preview" or
//     "development". Nothing to configure.
//
//   PREVIEW_BACKEND_ORIGIN
//     Set on the **Preview** environment ONLY. Leave it unset on Production and
//     Development. Full origin of an isolated preview backend deployment, with
//     scheme and no trailing path, e.g.
//       https://purrsuit-backend-preview.vercel.app
//     While it is unset, previews may still *read* production data
//     (GET/HEAD/OPTIONS fall through to the `vercel.json` rewrite) but every
//     mutating request is refused, so a preview can never write to production.
//
//     The backend it points at MUST have its own DATABASE_URL — a separate Neon
//     branch or database. Pointing this at a backend that is still wired to the
//     production database re-creates the exact bug this file exists to fix,
//     while making it look fixed. That backend's FRONTEND_URL (used by cors()
//     and the OAuth callback redirect) also has to name the preview frontend,
//     and preview URLs are per-deployment.
//
//   VITE_API_URL
//     Must be empty — or otherwise relative — on the **Preview** environment.
//     `src/services/api.js` prefixes every request path with it, so an absolute
//     backend origin there makes the browser call that origin directly, bypass
//     the SPA's own origin, and never trigger this middleware at all. Setting
//     PREVIEW_BACKEND_ORIGIN has no effect unless preview requests are
//     same-origin.
//

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Inlines what `@vercel/edge`'s `rewrite()` and `next()` helpers do. That
// package is not a dependency of this project; the underlying mechanism is just
// a response header in each case. Swap these for the helpers if `@vercel/edge`
// is ever added.
function rewrite(destination) {
  return new Response(null, {
    headers: { 'x-middleware-rewrite': String(destination) },
  });
}

// "Continue to the origin" — i.e. let `vercel.json`'s rewrites handle the
// request. Returned EXPLICITLY rather than falling off the end of the function:
// bare `undefined` is Next.js middleware's continue signal, but this is
// framework-agnostic Edge Middleware, where the contract is this header. Since
// the matcher covers every `/auth/*` and `/api/*` request, and production takes
// this path on all of them, guessing wrong here would break the entire API
// rather than just the preview isolation this file is for.
function next() {
  return new Response(null, {
    headers: { 'x-middleware-next': '1' },
  });
}

export default function middleware(request) {
  // Pass-through no-op everywhere except previews, so production keeps resolving
  // `/auth/*` and `/api/*` through `vercel.json` exactly as before.
  if (process.env.VERCEL_ENV !== 'preview') return next();

  const url = new URL(request.url);

  // A misconfigured value (missing scheme, say) is treated as "not configured"
  // rather than throwing a 500 — the deny branch below is the safe outcome.
  let target = null;
  const previewBackendOrigin = process.env.PREVIEW_BACKEND_ORIGIN?.trim();
  if (previewBackendOrigin) {
    try {
      target = new URL(url.pathname + url.search, previewBackendOrigin);
    } catch {
      target = null;
    }
  }

  // An isolated preview backend is configured: send `/auth/*` and `/api/*`
  // there, still same-origin from the browser's point of view so cookies stay
  // first-party.
  if (target) return rewrite(target);

  // No isolated preview backend. `vercel.json` would route this to production.
  // Reads are tolerable; writes are not.
  if (SAFE_METHODS.has(request.method)) return next();

  return new Response(
    JSON.stringify({
      error: 'preview_backend_not_configured',
      message:
        'Preview deployments are not allowed to write to the production backend. Set PREVIEW_BACKEND_ORIGIN on the Preview environment to point this deployment at an isolated backend.',
    }),
    {
      // 503: the dependency this request needs (an isolated preview backend)
      // is not available for this deployment. Not the client's fault, and it
      // becomes available once the variable is set.
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  );
}

export const config = {
  matcher: ['/auth/:path*', '/api/:path*'],
};
