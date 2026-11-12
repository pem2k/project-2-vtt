# oPeN VTT

oPeN VTT is a shared virtual tabletop for playing D&D online. It is for a dungeon master, who prepares the session, and for the players who join it. The dungeon master creates a password-protected room, uploads maps, and places named, colored tokens on a grid. Players join with the room name and password, move the tokens assigned to them, update character HP, and roll dice. Moves, character updates, and dice results are shared live, and room data is stored so it is still there when someone reconnects.

## Features

- Sign up, log in, and log out with Supabase Auth.
- Create a password-protected room, or join one, with a room name and password.
- Upload PNG, JPEG, or WebP maps, list them, and choose the active map.
- Show that map on a Konva board with a square grid. The dungeon master can show or hide the grid and change its cell size.
- Pan and zoom the board locally. The camera is not saved or broadcast.
- Add, name, color, assign, and remove tokens. The dungeon master can move any token. A player can move only an assigned token.
- Character cards show name, current HP, max HP, armor class, and notes. A player can create one and update its current HP. The dungeon master can create more than one and switch among them. HP changes are checked, saved, and broadcast.
- Roll d4, d6, d8, d10, d12, d20, and d100, or a notation such as `2d6+6` (`/roll` or `/r` in the chat box). The server broadcasts the player name and total.
- The chat panel keeps the latest 20 public rolls from the current visit.
- Socket.IO checks the Supabase JWT on connect, and room membership before join, token, dice, and character events.
- Rooms, maps, tokens, and characters are stored in Supabase and loaded again on join.

### Planned

- Snapping a dropped token to a grid cell. Positions are continuous coordinates.
- Editing notes in the card. Notes are stored and shown. The card edits current HP only.
- Dice modifiers taken from the character sheet. Typed notation with a modifier does work.
- Could-have items: token images, hidden tokens, death markers, private dungeon-master rolls, and an initiative list.

The Users tab is a placeholder. Token assignment is on the Tokens tab. Chat text stays on the local page and is not broadcast.

## Tech stack

Ranges are from `frontend/package.json`, `backend/package.json`, and the root `package.json` (`prepare` runs Husky). Node.js is the version in `.github/workflows/ci.yml`.

| Layer                | Technology                  | Version                  |
| -------------------- | --------------------------- | ------------------------ |
| Runtime              | Node.js                     | 24.22.1                  |
| UI                   | React, Vite, React Router   | ^19.3.1, ^8.3.5, ^7.18.5 |
| Board                | Konva, react-konva          | ^10.9.1, ^19.3.2         |
| Frontend data client | @supabase/supabase-js       | ^2.118.0                 |
| Backend data client  | @supabase/supabase-js       | ^2.58.0                  |
| Realtime             | socket.io, socket.io-client | ^4.8.4                   |
| HTTP server          | express                     | ^5.3.0                   |
| Tests                | vitest (frontend / backend) | ^5.0.5 / ^5.1.0          |
| Lint                 | eslint (frontend / backend) | ^10.13.0 / ^10.14.0      |
| Format               | prettier                    | ^3.9.10                  |
| Git hooks            | husky, lint-staged          | ^9.1.7, ^16.4.0          |

## Project structure

```text
frontend/    React + Vite app: login, host/join, game board, Supabase and Socket.IO clients
backend/     Express + Socket.IO server, Supabase migrations, and local seed data
Docs/        Product requirements, design, and agent reference docs
decisions/   Decision logs, one file per git user name
.github/     GitHub Actions workflow for lint, format, and tests
```

## Quick start

### Prerequisites

- Node.js 24.22.1 (the version CI installs) and npm.
- Docker Desktop. Local Supabase needs Docker running.
- The Supabase CLI on your PATH. `npm run db:start` runs `supabase start`.

### Install

CI installs each app with `npm ci`. Run it from `frontend/` and from `backend/`:

```bash
npm ci
```

### Environment

Copy `frontend/.env.example` to `frontend/.env.local`. Copy `backend/.env.example` to `backend/.env` (the backend start script reads `.env`).

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Backend: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CLIENT_ORIGIN`

The frontend example says to fill the anon key from the local Supabase status output, run in `backend/`, after the stack is up. Do not commit either env file.

### Start Supabase

From `backend/`:

```bash
npm run db:start
```

`npm run db:stop` stops it. `npm run db:reset` reloads migrations and seed data.

### Run the backend

From `backend/` (`PORT` defaults to 3000 and is not in `.env.example`):

```bash
npm start
```

### Run the frontend

From `frontend/`:

```bash
npm run dev
```

## Running tests, lint, and format checks

CI, on pull requests and pushes to `dev` and `main`, runs these commands.

From `frontend/`:

```bash
npm run lint
npm run format:check
npm test
```

`npm run format` in `frontend/` writes Prettier fixes. The backend has no `format` script.

From `backend/`:

```bash
npm run lint
npm run format:check
npm run test:unit
```

CI runs `npm run test:unit`, which does not need the database. `npm test` runs the full Vitest suite, including database tests, and needs `npm run db:start`. `npm run test:watch` starts watch mode.

## Documentation

- [Architecture](Docs/agent/architecture.md)
- [Product requirements](Docs/prd.md)
- [Design](Docs/design.md)

The API reference, architecture diagram, and setup guide are coming in separate docs.

## Contributing

Branch from `dev` and open the pull request back into `dev`. These rules are from [Docs/agent/git-workflow.md](Docs/agent/git-workflow.md):

- `feature/<issue-number>-<short-description>`
- `bugfix/<issue-number>-<short-description>`
- `chore/<issue-number>-<short-description>`

Use a conventional commit with the issue number: `<type>(<scope>): <description> (#N)`. Types are `feat`, `fix`, `test`, `refactor`, `chore`, and `docs`. Scopes are `auth`, `room`, `board`, `token`, `dice`, `character`, and `ci`.

One pull request per issue. The title equals the issue title. The first line of the description is `Closes #N`. The branch must be up to date with `dev`, CI must pass, and the merge is a squash merge. Pull requests target `dev`. Merges from `dev` to `main` are done by the repo owner.

## Hosting and CI/CD

See [Free demo deployment and CI/CD](Docs/deployment.md) for the Render/Supabase setup, PR previews, environment settings, and real browser tests.
