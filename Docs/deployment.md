# Free demo deployment and CI/CD

The deployed demo uses a Render static frontend, one Free Render Node/Socket.IO
service, and a Supabase Free project for PostgreSQL, Auth, and map storage.
No Render database, paid compute, or paid multi-service Preview Environment is needed.
Stay within the providers' included build, storage, bandwidth, and runtime quotas.
The Free API sleeps after idle periods, so the first connection can take longer.

## Services and environments

| Environment         | Frontend                               | Backend/database                                      |
| ------------------- | -------------------------------------- | ----------------------------------------------------- |
| Local development   | Vite on localhost                      | Local Node and Docker Supabase                        |
| CI                  | Playwright starts Vite                 | Disposable local Node/Supabase; no hosted credentials |
| PR preview          | Render static-site PR URL              | Shared demo API and Supabase project                  |
| Hosted demo (`dev`) | https://open-vtt-demo-web.onrender.com | https://open-vtt-demo-api.onrender.com and Supabase   |

The demo currently tracks `dev`, the repository's default integration branch.
It does not automatically promote or merge anything into `main`.
PR previews test the PR's frontend, not an isolated copy of its backend or database.
Use disposable demo accounts/rooms for preview testing; previews share demo data.

## Initial setup

1. Create a Supabase Free project. The provisioned demo project's reference is
   `mfopvoyofiotzmysqqqc`.
2. Preview then apply migrations from the repository root:

   ```sh
   supabase db push --workdir backend --remote=mfopvoyofiotzmysqqqc --skip-vault --dry-run
   supabase db push --workdir backend --remote=mfopvoyofiotzmysqqqc --skip-vault --yes
   ```

   Do not use `db reset`, `--include-seed`, or local seeded test accounts on the hosted database.

3. Review then apply the partial demo Auth configuration:

   ```sh
   supabase config diff --workdir deployment --remote=mfopvoyofiotzmysqqqc
   supabase config push --workdir deployment --remote=mfopvoyofiotzmysqqqc --yes
   ```

   It declares only the site URL, frontend-preview redirects, and email confirmation
   behavior. Confirmation is disabled for this class demo so email/password signup
   does not depend on an external SMTP provider. Existing undeclared settings remain unchanged.

4. Once `render.yaml` is pushed, create a Render Blueprint linked to this repo's
   `dev` branch. If the services already exist, adopt them instead of creating duplicates:

   ```sh
   render ea blueprints create --repo https://github.com/pem2k/project-2-vtt --branch dev --existing-resources adopt --output json
   ```

   Inspect the planned sync: it must contain only the static site and a `free` API.
   Approve the sync in Render or with `render ea blueprints approve <blueprint-id>`.
   This applies the SPA rewrite, CI-gated deployment, and automatic frontend PR previews.

5. Populate the Render environment settings listed below. Never put private keys,
   database passwords, or deploy-hook URLs into the repository or frontend bundle.

| Service  | Setting                  | Value                                                                                |
| -------- | ------------------------ | ------------------------------------------------------------------------------------ |
| API      | `SUPABASE_URL`           | Hosted demo project URL                                                              |
| API      | `SUPABASE_ANON_KEY`      | Demo project's public legacy anon key                                                |
| API      | `CLIENT_ORIGIN`          | `https://open-vtt-demo-web.onrender.com,https://open-vtt-demo-web-pr-*.onrender.com` |
| Frontend | `VITE_SUPABASE_URL`      | Same demo project URL                                                                |
| Frontend | `VITE_SUPABASE_ANON_KEY` | Same public anon key                                                                 |
| Frontend | `VITE_SOCKET_URL`        | `https://open-vtt-demo-api.onrender.com`                                             |

The API verifies user JWTs and uses RLS; it does not require a service-role key.
Frontend variables are public and are embedded at build time: redeploy the frontend
after changing them. Render supplies `PORT` for the API. The backend CORS wildcard
is limited to this frontend's PR hostname prefix, not every `onrender.com` website.

## Pipeline and evidence

Every PR targeting `dev` or `main` runs:

1. Frontend/backend lint and formatting.
2. Frontend unit/component tests and backend socket/unit tests.
3. Database integration tests against real local RLS, plus Chromium E2E testing
   two separate users hosting/joining a room, dice broadcast, and room refresh.
4. Frontend build after the integration stage passes.
5. Dependency audits in parallel; CodeQL runs in its own workflow.
6. The required aggregate `lint-and-test` job fails if any CI stage failed.

Render's `checksPass` deployment mode waits for the connected commit's CI checks.
Frontend PR previews provide a GitHub deployment link and disappear when the PR closes.
Require `lint-and-test` and CodeQL in branch protection before merging reviewed work.
No hosted credentials are needed by PR tests, including fork PRs.
Do not commit secrets to make a preview deployment work.

For grading, retain one real PR with successful CI/security checks and a preview
link; show a successful Render deploy with its commit SHA and the public demo URL.
The configuration alone is not evidence that a workflow or preview actually ran.

## Run browser tests locally

Start Docker and the existing local Supabase stack from `backend/`, then:

```sh
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e:local
```

The runner obtains only local public connection settings from `supabase status`.
Playwright refuses hosted database URLs, starts its own frontend on port 4173 and
backend on 3100, and uses isolated browser contexts. Test users/rooms remain in the
local test database; CI destroys its disposable stack afterward. No hosted reset occurs.
Reports are written to ignored `playwright-report/` and `test-results/` folders.
