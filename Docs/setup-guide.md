# Setup and deployment guide

This guide takes you from a fresh clone to a running local copy of oPeN VTT, and lists what a hosted deployment needs. Every command and name below comes from the repo's `package.json` files, `.github/workflows/ci.yml`, `backend/supabase/config.toml`, and the code that reads the environment.

## What runs where

| Piece                           | Default address          | Started by                       |
| ------------------------------- | ------------------------ | -------------------------------- |
| Frontend (Vite)                 | `http://localhost:5173`  | `npm run dev` in `frontend/`     |
| Backend (Express and Socket.IO) | `http://localhost:3000`  | `npm start` in `backend/`        |
| Supabase API                    | `http://127.0.0.1:54321` | `npm run db:start` in `backend/` |
| Supabase Postgres               | port `54322`             | `npm run db:start`               |
| Supabase Studio (web UI)        | `http://127.0.0.1:54323` | `npm run db:start`               |
| Supabase test inbox             | port `54324`             | `npm run db:start`               |

The backend port comes from `PORT` and defaults to 3000. The frontend port is the Vite default.

## Prerequisites

- **Node.js 24.22.1.** This is the version CI uses and the one in `frontend/.nvmrc`. If you use nvm, run `nvm use` in `frontend/`.
- **npm**, which comes with Node.
- **Docker Desktop**, running. The local Supabase stack runs in Docker containers.
- **The Supabase CLI**, available on your `PATH` as `supabase`. Install it from the [Supabase CLI docs](https://supabase.com/docs/guides/local-development/cli/getting-started). `npm run db:start` runs `supabase start` and fails if the CLI is missing.
- **Git.**

## 1. Clone and install

```bash
git clone https://github.com/pem2k/project-2-vtt.git
cd project-2-vtt
```

The repo has three `package.json` files. Install each one:

```bash
npm install
```

That root install only sets up the Git pre-commit hook (Husky). The hook runs ESLint and Prettier on the files you commit.

```bash
cd frontend
npm ci
```

```bash
cd ../backend
npm ci
```

## 2. Start Supabase

From `backend/`, with Docker running:

```bash
npm run db:start
```

The first start downloads the Supabase images, so it can take a few minutes. It also applies every migration in `backend/supabase/migrations` and then runs `backend/supabase/seed.sql`.

To see the local URL and keys, still in `backend/`:

```bash
supabase status -o env
```

You need two values from this output: `API_URL` and `ANON_KEY`.

Other commands, all from `backend/`:

| Command            | What it does                                                    |
| ------------------ | --------------------------------------------------------------- |
| `npm run db:stop`  | Stops the local Supabase containers                             |
| `npm run db:reset` | Rebuilds the database from the migrations, then reruns the seed |

## 3. Create the environment files

Copy the two example files. Do not commit the copies.

| Copy this               | To                    |
| ----------------------- | --------------------- |
| `frontend/.env.example` | `frontend/.env.local` |
| `backend/.env.example`  | `backend/.env`        |

Fill them in using `API_URL` and `ANON_KEY` from step 2:

| File                  | Variable                 | Value                                                                                    |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `frontend/.env.local` | `VITE_SUPABASE_URL`      | `API_URL`                                                                                |
| `frontend/.env.local` | `VITE_SUPABASE_ANON_KEY` | `ANON_KEY`                                                                               |
| `frontend/.env.local` | `VITE_SOCKET_URL`        | Optional. The backend address. Defaults to `http://localhost:3000`.                      |
| `backend/.env`        | `SUPABASE_URL`           | `API_URL`                                                                                |
| `backend/.env`        | `SUPABASE_ANON_KEY`      | `ANON_KEY`                                                                               |
| `backend/.env`        | `CLIENT_ORIGIN`          | The browser origin allowed to connect to Socket.IO. Defaults to `http://localhost:5173`. |

The anon key is a public key that is safe to use in the browser. It is still best not to commit your env files. Never put a service-role key in either file.

`VITE_SOCKET_URL` is read by the frontend code but is not listed in `frontend/.env.example`. You only need it if the backend is not on `http://localhost:3000`.

## 4. Run the app

Use two terminals.

Backend, from `backend/`:

```bash
npm start
```

It prints `HTTP server listening on port 3000`. The script loads `backend/.env` for you.

Frontend, from `frontend/`:

```bash
npm run dev
```

Open the address Vite prints, normally `http://localhost:5173`.

## 5. Sign in with the seed data

`backend/supabase/seed.sql` creates test accounts and a room. They exist for local development only.

| Account            | Role in the test room | Password      |
| ------------------ | --------------------- | ------------- |
| `dm@test.dev`      | DM                    | `password123` |
| `player1@test.dev` | Player                | `password123` |
| `player2@test.dev` | Not a member          | `password123` |

The test room is named `The Sunless Citadel` and its password is `roompass`. It comes with two tokens and two character cards.

You can also sign up with a new account. Local Supabase has email confirmation turned off, so a new account works immediately.

To try two roles at once, sign in as the DM in one browser window and as `player1@test.dev` in a private window.

## 6. Tests, lint, and formatting

CI runs these on every pull request and every push to `dev` and `main`.

From `frontend/`:

```bash
npm run lint
npm run format:check
npm test
```

From `backend/`:

```bash
npm run lint
npm run format:check
npm run test:unit
```

`npm run test:unit` uses mocks and needs neither Docker nor Supabase. It is what CI runs.

`npm test` in `backend/` runs the full suite, including the database tests in `backend/tests`. These talk to the real local Supabase stack and its row-level security, with no mocks. Start the stack with `npm run db:start` first. The tests read the URL and keys from `supabase status -o env` on their own, unless `SUPABASE_URL` and `SUPABASE_ANON_KEY` are already set.

To fix formatting, run `npm run format` in `frontend/`. The backend has no `format` script, so use `npx prettier --write .` there.

## Troubleshooting

| Symptom                                                                                         | Likely cause and fix                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:start` fails                                                                        | Docker Desktop is not running, or the `supabase` CLI is not on your `PATH`.                                                                                                |
| `Missing Supabase env vars` in the browser                                                      | `frontend/.env.local` is missing or the variable names are wrong. Restart `npm run dev` after editing it.                                                                  |
| `Missing SUPABASE_URL or SUPABASE_ANON_KEY` from the backend                                    | `backend/.env` is missing or incomplete.                                                                                                                                   |
| Socket connection blocked by CORS                                                               | Set `CLIENT_ORIGIN` in `backend/.env` to the exact origin of the frontend, then restart the backend.                                                                       |
| `Could not read local Supabase status` when running `npm test`                                  | The Supabase stack is not running. Run `npm run db:start`.                                                                                                                 |
| Data looks wrong or a migration changed                                                         | Run `npm run db:reset` in `backend/`. It wipes local data and rebuilds it from the migrations and the seed.                                                                |
| `roomSocket.test.js` fails on "rejects missing Supabase configuration" with `npm run test:unit` | The backend code loads `backend/.env` when the URL is not already set. If this one test fails only on your machine, check whether `backend/.env` exists. CI has no `.env`. |

## Hosted deployment

The free Render/Supabase setup is defined in `render.yaml`; see [Free demo deployment and CI/CD](deployment.md) for provisioning, PR previews, environment variables, and the unit/integration/E2E pipeline. The provider settings below explain what the app needs from a host.

**Supabase project**

1. Create a hosted Supabase project and link it from `backend/` with `supabase link`.
2. Apply the migrations with `supabase db push`. They create the tables, row-level security policies, RPC functions, and the `maps` storage bucket.
3. Do not run `seed.sql` against a hosted project. It creates accounts with a known password, and its own header says it is for development only.
4. In the Supabase dashboard, set the auth site URL and redirect URLs to the deployed frontend. The values in `config.toml` point at local addresses. Decide whether to require email confirmation, since the local setting turns it off.

**Backend**

1. Host it anywhere that runs Node.js 24 and supports WebSockets.
2. Install with `npm ci` and start with `npm start`.
3. Set these environment variables on the host: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (from the hosted project), `CLIENT_ORIGIN` (the deployed frontend origin, comma-separated if there are several), and `PORT` if the host assigns one.

**Frontend**

1. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SOCKET_URL` (the deployed backend address) when you build. Vite writes these into the bundle at build time.
2. Run `npm run build` in `frontend/`. The result is in `frontend/dist/`.
3. Serve `dist/` as static files. The app uses client-side routing, so the host must send unknown paths back to `index.html`.

## More documentation

- [Architecture](agent/architecture.md)
- [Git workflow](agent/git-workflow.md)
- [Product requirements](prd.md)
