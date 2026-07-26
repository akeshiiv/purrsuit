# Purrsuit

A study-tracking app where focus sessions earn coins that fund a territory game
between realms. `backend/` is an Express + Postgres API, `frontend/` is a React
+ Vite SPA. Both deploy to Vercel; the production database is Neon.

## Prerequisites

- Node 24+ (CI builds on 24; developed on 26)
- Docker, for the local Postgres container — nothing else needs it

## Frontend only, no backend

The service layer swaps to in-repo mocks when `VITE_USE_MOCK=true`, so the whole
UI runs with no API and no database:

```bash
cd frontend
cp .env.example .env.local   # ships with VITE_USE_MOCK=true
npm install
npm run dev                  # http://localhost:5173
```

Use this for UI work. Everything below is only needed to run the real API.

## Full stack

### 1. Database

There is no local Postgres requirement beyond Docker — `db.js` uses the plain
`pg` driver whenever `NODE_ENV` isn't `production`, so a Neon account is not
needed to develop.

```bash
docker run -d --name purrsuit-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=purrsuit \
  -v purrsuit-db-data:/var/lib/postgresql/data postgres:16
```

The named volume keeps your data across `docker rm`. Later, `docker start
purrsuit-db` brings it back.

### 2. Google OAuth credentials

Login is Google-only and there is no dev bypass, so you need your own OAuth
client before the server will start.

At [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials),
create an **OAuth 2.0 Client ID** of type *Web application* and add
`http://localhost:3000/auth/google/callback` as an authorized redirect URI.

Create it in the same Google Cloud project as the deployed app so it inherits
the configured consent screen and test-user list — but make your **own client**
rather than reusing the deployed app's. The production secret shouldn't live in
plaintext on a laptop, and adding localhost redirects to the shared client
changes config that production depends on. Passport keys users on the Google
`sub`, which is stable across clients, so nothing about your account changes.

### 3. Backend

```bash
cd backend
cp .env.example .env      # then fill in the secrets and Google credentials
npm install
npm run migrate           # applies migrations/*.sql in lexical order, idempotently
npm run dev               # http://localhost:3000
```

Generate the two secrets with `openssl rand -hex 32`. If any required variable
is missing, startup fails immediately with a list of every one that's absent.

Run `npm run migrate` from `backend/` — dotenv resolves `.env` relative to the
working directory.

### 4. Point the frontend at it

```bash
cd frontend
# in .env.local:
VITE_USE_MOCK=false
```

Restart Vite. `FRONTEND_URL` in the backend `.env` must match the Vite origin
exactly or CORS will reject every request.

## Tests

```bash
cd backend && npm test    # node --test, no database required
cd frontend && npm run lint
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs
`vercel deploy --prod`. Work on a branch and merge via pull request.
