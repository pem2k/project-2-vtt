# oPeN VTT — Agent Instructions

## Project Context

oPeN VTT is a shared virtual tabletop for playing D&D online. DMs create password-protected rooms, upload maps, and place tokens. Players join via room code, move assigned tokens, update character HP, and roll dice — all in real time.

- **PRD**: [Docs/prd.md](Docs/prd.md)
- **Mockups**: TODO — add link to Figma or artifact screenshots

### Tech Stack

| Part | Choice | Version |
|---|---|---|
| Runtime | Node.js (LTS) | 24.22.1 |
| Frontend | React + Vite | React 19.3.1, Vite 8.3.5 |
| Map and tokens | Konva + React Konva | react-konva 19.3.2 |
| Auth | Supabase Auth | — |
| Database | Supabase (PostgreSQL) | — |
| File storage | Supabase Storage | — |
| Realtime game events | Socket.IO | 4.8.4 |
| Backend | Express (thin — just Socket.IO) | 5.3.0 |
| Unit/Integration tests | Vitest | — |
| E2E tests | Playwright | — |
| Pre-commit hooks | Husky + lint-staged | — |

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
