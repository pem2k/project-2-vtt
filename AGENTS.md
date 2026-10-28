# oPeN VTT — Agent Instructions

## Agent Context

**Description:** Use for development work on oPeN VTT — the React + Konva + Supabase + Socket.IO virtual tabletop. Frontend components, realtime game events, RLS, and tests. Follows the conventions and architecture in AGENTS.md.

**Role (system prompt):**

You are a senior full-stack engineer on oPeN VTT, a shared D&D virtual tabletop (React + Konva frontend, thin Express + Socket.IO backend, Supabase for auth/DB/storage).

AGENTS.md is your source of truth for stack, conventions, architecture, and the do's/don'ts — follow it rather than restating it. Internalize two habits above all:

- **Respect the data-flow split:** Supabase for persistent CRUD/auth/storage, Socket.IO for ephemeral broadcast events, React state for UI-only. Security lives in RLS and server-side JWT/membership checks, never in frontend-only guards.
- **Work test-first:** Red-Green-Refactor, every time.

When a task is ambiguous about the Supabase-vs-Socket.IO boundary or an RLS/permission concern, flag it before writing code.
When a task or design decision is ambiguous, flag it and check within the chat before proceeding.
Keep a decisions.log file, recording agent and subagent decisions. This will later be used for implementation auditing.

### Subagent Dispatch Strategy

**Roles (harness-agnostic):**

- **Orchestrator (parent agent)** — owns judgment and anything hard to reverse: code review, test *design*, test adequacy and failure analysis, decision-making and decision auditing, and all git *writes* (commit, branch, merge, push, PR). Uses a **capable thinking (reasoning) model — Opus 5.5 by default**. Do **not** escalate to the top-end frontier models (e.g. Fable, Astra); a strong reasoning model is the target, not the most powerful model available.
- **Workers (subagents)** — mechanical implementation against a clear spec: writing code and authoring the tests the orchestrator's test design calls for. Use the **cheapest capable model available**.

**Applies only where the harness supports subagents and per-dispatch model selection.** Otherwise the parent does everything inline — don't dispatch. Also skip dispatch for trivial edits, where the overhead isn't worth it. Workers may *read* git state; only the orchestrator performs git *writes*.

**Model mapping by environment (examples — adapt to what's installed):**

***Note for grader review - Agent can ignore this line, claude access via api byok, copilot as harness (Parker's setup). copilot harness is too heavy for local model output speed and available context window, project three I can use local if alternative minimalist tui harnesses like pi are allowed. That being said copilot is possible to use with local models on my setup if using exo for inference to split context across cluster with 4070s, but this results in single digit tok/s**

| Available models | Workers (implementation / test authoring) | Orchestrator (review / test design / decisions / git) |
| --- | --- | --- |
| Claude, full tier (this repo's default) | Sonnet or Haiku | Opus 5.5 (not Fable / Astra) |
| Claude, parent has a cheaper tier | cheaper tier | capable reasoning tier (e.g. Opus) |
| Gemini only (e.g. Antigravity) | Flash / Flash-Lite | a Gemini reasoning model (e.g. Pro) |
| Single model only | — (no dispatch) | that model does all of it |

## Project Context

oPeN VTT is a shared virtual tabletop for playing D&D online. DMs create password-protected rooms, upload maps, and place tokens. Players join via room code, move assigned tokens, update character HP, and roll dice — all in real time.

- **PRD**: [Docs/prd.md](Docs/prd.md)
- **Design**: [Docs/design.md](Docs/design.md) — color palette, typography, mockups, token colors
- **Mockups**: [General Flow](Docs/general_mockup.png) | [DM Controls](Docs/dm_control_mockup.png)

### Tech Stack

| Part | Choice | Version | Docs |
| --- | --- | --- | --- |
| Runtime | Node.js (LTS) | 24.22.1 | [Node v24 API](https://nodejs.org/docs/latest-v24.x/api/) |
| Frontend | React + Vite | React 19.3.1, Vite 8.3.5 | [React](https://react.dev/) · [Vite](https://vite.dev/) |
| Map and tokens | Konva + React Konva | react-konva 19.3.2 | [Konva](https://konvajs.org/docs/) · [React Konva](https://konvajs.org/docs/react/) |
| Auth | Supabase Auth | — | [Supabase Auth](https://supabase.com/docs/guides/auth) |
| Database | Supabase (PostgreSQL) | — | [Supabase Database](https://supabase.com/docs/guides/database/overview) |
| File storage | Supabase Storage | — | [Supabase Storage](https://supabase.com/docs/guides/storage) |
| Realtime game events | Socket.IO | 4.8.4 | [Socket.IO v4](https://socket.io/docs/v4/) |
| Backend | Express (thin — just Socket.IO) | 5.3.0 | [Express 5.x API](https://expressjs.com/en/5x/api.html) |
| Unit/Integration tests | Vitest | — | [Vitest](https://vitest.dev/) |
| E2E tests | Playwright | — | [Playwright](https://playwright.dev/docs/intro) |
| Pre-commit hooks | Husky + lint-staged | — | [Husky](https://typicode.github.io/husky/) · [lint-staged](https://github.com/lint-staged/lint-staged) |

### Architecture

- **Frontend** (`frontend/src/`) — React SPA with three pages: LoginPage, HostJoinPage, GamePage. Konva canvas renders the map, grid, and tokens. Supabase client handles auth and DB queries directly from the browser. Socket.IO handles real-time game events.
- **Backend** (`backend/src/`) — Thin Node.js + Express server. Its only job is running Socket.IO for real-time events (token moves, dice rolls, room join/leave). Validates Supabase JWTs on socket handshake. No REST routes — Supabase handles auth, storage, and CRUD.
- **Database** — Supabase PostgreSQL with Row Level Security (RLS) policies enforcing room membership and ownership. Supabase Auth for user accounts. Supabase Storage for map image uploads.

### Key UI Components

- **Board** (`Board.jsx`) — Konva Stage rendering the uploaded map image with a grid overlay. Contains Token components.
- **Token** (`Token.jsx`) — Draggable colored circle on the grid. Drag is enabled only for the assigned player or the DM. Emits `moveToken` via Socket.IO on drag end.
- **Grid** (`Grid.jsx`) — Square grid overlay drawn on the Konva Layer. Grid size is adjustable (should-have).
- **CharacterCard** (`CharacterCard.jsx`) — Displays name, current/max HP, AC, and notes. Players edit their own HP and notes. DM can edit all fields.
- **DicePanel** (`DicePanel.jsx`) — Buttons for standard D&D dice (d4, d6, d8, d10, d12, d20, d100). Emits `rollDice` via Socket.IO. Displays roll results with player name.
- **DMControls** (`DMControls.jsx`) — DM-only panel for adding/removing/assigning tokens and uploading maps.

### User Flows

1. **Auth** — User signs up or logs in via Supabase Auth → redirected to HostJoinPage.
2. **Create room** — DM enters room name + password → Supabase inserts room row → DM gets room code → redirected to GamePage.
3. **Join room** — Player enters room code + password → Supabase validates → player added to room_members → Socket.IO joins the room channel → redirected to GamePage.
4. **Encounter setup** — DM uploads map image (Supabase Storage) → image renders on Board → DM uses DMControls to add/name/color/assign tokens.
5. **Gameplay** — Players drag assigned tokens (Socket.IO broadcasts `tokenMoved`) → update character HP/notes (Supabase update + Socket.IO broadcast) → roll dice (Socket.IO broadcasts `diceResult` with player name and total).

---

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Variables | camelCase | `userName`, `isActive` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `API_URL` |
| Functions | camelCase | `getUserName()`, `calculateTotal()` |
| Classes | PascalCase | `UserAccount`, `HttpClient` |
| Private fields | `#` prefix | `#password`, `#validate()` |
| Booleans | `is`/`has`/`can` prefix | `isVisible`, `hasAccess` |
| Event handlers | `handle`/`on` prefix | `handleClick`, `onSubmit` |
| Files (modules) | camelCase | `userService.js` |
| React components | PascalCase | `UserProfile.jsx` |

---

## Scrum & Workflow

### Branch Naming

```
feature/<issue-number>-<short-description>
bugfix/<issue-number>-<short-description>
chore/<issue-number>-<short-description>
```

Examples: `feature/12-dice-rolling`, `bugfix/27-token-snap-offset`

### Commit Messages

Use conventional commits:

```
<type>(<scope>): <description>

Types: feat, fix, test, refactor, chore, docs
Scopes: auth, room, board, token, dice, character, ci
```

Examples:
- `feat(dice): implement rollDice with modifier support`
- `test(token): add failing test for unassigned player drag`
- `fix(room): validate password before joining`

Reference issues with `#<number>`: `feat(auth): add signup form (#5)`

### PR Workflow

- One PR per issue. Title matches the issue title.
- PR description links the issue: `Closes #12`
- Branch must be up to date with `main` before merge.
- CI must be green before merge (branch protection).
- Squash merge to keep history clean.

---

## Do's and Don'ts

### Do

- Use Supabase client directly from the frontend for auth, CRUD, and storage — no REST proxy needed.
- Use Socket.IO only for ephemeral real-time events (token moves, dice rolls, player join/leave).
- Write RLS policies for every table — never rely on frontend-only permission checks.
- Validate Supabase JWT on Socket.IO handshake to authenticate socket connections.
- Use `supabase db reset` to test against a clean local database.
- Follow Red-Green-Refactor: commit failing test first, then passing code, then cleanup.
- Use React state for UI-only state. Use Supabase for persistent state. Use Socket.IO for broadcast state.

### Don't

- Don't build REST API routes for CRUD — Supabase PostgREST handles this.
- Don't store session tokens manually — Supabase Auth manages sessions.
- Don't mock the database in integration tests — use the local Supabase instance with real RLS.
- Don't use MongoDB, Mongoose, or Cloudinary — these have been replaced by Supabase.
- Don't put game logic in the frontend that should be server-validated (token ownership, room membership).
- Don't install utility libraries (lodash, underscore) — use native JS methods.
- Don't add features from the "Won't Have" list.

### Preferred Libraries

| Purpose | Use | Don't use |
|---|---|---|
| Auth | Supabase Auth | Passport, JWT manually |
| Database | Supabase JS client | Mongoose, Prisma, raw pg |
| File upload | Supabase Storage | Cloudinary, Multer to disk |
| Canvas | Konva + react-konva | Fabric.js, raw Canvas API |
| Realtime | Socket.IO | Supabase Realtime (for game events) |
| Testing | Vitest + Playwright | Jest, Cypress, Mocha |
| Linting | ESLint + Prettier | StandardJS |

### Security

- All database access goes through RLS — no service_role key in the frontend.
- Supabase Storage policies restrict map uploads to room DMs.
- Socket.IO server validates JWT on connection and checks room membership before broadcasting events.
- Sanitize user input in character card notes to prevent XSS.
- Never expose Supabase service_role key in client code or git.

### Accessibility

- All interactive elements must be keyboard navigable.
- Dice buttons and form inputs need visible focus indicators.
- Use semantic HTML for panels and forms (the Konva canvas is inherently visual and exempt).
- Color tokens should be distinguishable — use both color and a text label.
