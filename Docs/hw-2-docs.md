### PRD - oPeN VTT

## Problem Description

Playing tabletop role playing games online requires players to share a map, track character information, move tokens, and roll dice together. When these activities are spread across separate tools, players may need to switch between windows or ask for updates about positions, health, and dice results. Dungeon Masters also need a way to prepare encounters and control which tokens each player can move. Most solutions involve self-hosting and paid software.

oPeN VTT addresses this problem by bringing these activities into one shared virtual tabletop. Dungeon Masters can create password-protected rooms, upload a map, and place named, colored tokens on a grid. Players can join using a room code, move their assigned tokens, update their character's health, and roll dice publicly. The initial prototype will focus on a shared encounter board, basic character cards, and real-time updates.

## Must Have

- Create an account, log in, and log out.
- DM creates a password-protected room; players join using a room code and password.
- Upload and display one map per room with a square grid.
- DM adds, names, assigns, moves, and removes colored tokens.
- Players move only assigned tokens; the DM controls all tokens.
- Name, current/max HP, armor class, and notes. Players edit their own HP and notes.
- Select a die type; everyone sees the player's name and result.
- Share token positions, character changes, and dice results.
- Save room and board data; load the latest state when joining or reconnecting.
- Check room membership and editing permissions on the backend.

## Should Have

- Independent map panning and zooming.
- Adjustable grid and token snapping to that grid
- Dice modifiers - e.g. manual rolls 2d+6, should also come from char sheet.
- Scrollable roll history for the current session

## Could Have

- Uploaded token images.
- Hidden enemy tokens that the DM can reveal.
- Manual death markers.
- Private DM rolls.
- A simple manually ordered initiative list.

## Won't Have This Release

- Browsable game listings and "My Games."
- Reusable enemy template libraries.
- Full character sheets, custom items, and automated game rules.
- Distance measurement and area-of-effect drawing tools.
- Dynamic lighting and fog of war.
- Multiple maps per room. 
- D&D Beyond importing, might require creation of a browser extensions

---

## User Stories

1. As a player, I want to create an account and log in so that my identity persists across sessions.
2. As a DM, I want to create a password-protected room and share the code so that only invited players can join my game.
3. As a DM, I want to upload a map and place named, colored tokens on a grid so that I can set up an encounter for my players.
4. As a player, I want to move my assigned token and see everyone else's moves in real time so that combat feels live and collaborative.
5. As a player, I want to view my character card, update my HP, and roll dice with results visible to everyone so that I can play my turn without leaving the table.

### Agents.md

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
| Files (modules) | camelCase| `userService.js` |
| React components | PascalCase | `UserProfile.jsx` |

## Folder Structure
open-vtt/
├── README.md
├── .gitignore
│
├── frontend/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js
│   │
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── styles.css
│       │
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── HostJoinPage.jsx
│       │   └── GamePage.jsx
│       │
│       ├── components/
│       │   ├── board/
│       │   │   ├── Board.jsx
│       │   │   ├── Grid.jsx
│       │   │   └── Token.jsx
│       │   │
│       │   ├── CharacterCard.jsx
│       │   ├── DicePanel.jsx
│       │   └── DMControls.jsx
│       │
│       ├── hooks/
│       │   └── useGameRoom.js
│       │
│       └── lib/
│           ├── supabase.js
│           └── socket.js
│
└── backend/
    ├── package.json
    │
    └── src/
        ├── server.js
        │
        ├── sockets/
        │   ├── index.js
        │   ├── roomEvents.js
        │   ├── tokenEvents.js
        │   └── diceEvents.js
        │
        └── utils/
            └── rollDice.js

## Tech Stack:
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

## Testing Strategy

### Frameworks & Tools

| Tool | Purpose |
|---|---|
| Vitest | Unit + integration tests (shared Vite config, native ESM) |
| Playwright | E2E browser tests (two contexts for multiplayer) |
| Husky + lint-staged | Pre-commit hooks (ESLint + Prettier on staged files) |
| Supabase CLI | Local test database (real Postgres + RLS, not mocks) |

### Unit Tests (Vitest)

- **Backend** — `rollDice` utility: valid rolls, modifiers, reject non-D&D dice (d7, d3), empty/invalid input
- **Frontend** — component rendering and RBAC behavior:
    - CharacterCard: field editability by role (player edits own HP/notes, DM edits all, AC read-only for players)
    - DicePanel: die type buttons, modifier input validation
    - Token: draggable only for assigned player or DM
    - Board: grid overlay and token rendering
- Mock Supabase client and Socket.IO at this tier

### Integration Tests (Vitest)

- **Socket.IO events** — real server on ephemeral port + `socket.io-client`:
    - Room join/leave with credential validation
    - Token move permission checks (DM vs assigned vs unassigned player)
    - Dice roll broadcast to all room members
- **Supabase RLS policies** — test against local Supabase instance as different authenticated users:
    - Players can't access other rooms' data
    - Players can't edit other players' character cards
    - DM has full control within their room
- **Supabase Auth** — signup, login, logout, duplicate email, wrong password

### E2E Tests (Playwright)

Scripted browser automation — deterministic test files with explicit steps and assertions, not AI-agent-driven. Two browser contexts simulate DM and Player in the same room.

One suite per user story:
1. **Auth flow** — signup, login, logout, error cases (empty fields, wrong password)
2. **Room creation + joining** — valid/invalid room codes and passwords
3. **DM encounter setup** — map upload, token add/name/assign/move/remove
4. **Multiplayer token movement** — 2 browser contexts, RBAC enforcement, real-time sync, persistence on reconnect
5. **Character cards + dice** — edit HP/notes, roll visibility across clients, modifiers

Error paths tested at every level: empty input, bad input, unauthorized access.

### Test Data

- `supabase/seed.sql` with fixed-UUID test users (DM, Player1, Player2), a pre-built room, tokens, and character cards
- `supabase db reset` re-applies migrations + seed for a clean state each run
- Small test map PNG in `e2e/fixtures/` for upload tests

### CI/CD Pipeline — Phased Rollout

Target pipeline in `.github/workflows/ci.yml`:

**Lint → Unit/Integration Tests → Build → E2E → Security Scan**

Rolled out incrementally:
- **Sprint 1**: Lint + unit tests only (fast feedback, easy to set up)
- **Sprint 2**: Add integration tests (once Supabase migrations + RLS policies exist)
- **Sprint 2+**: Add E2E stage (once features are stable enough to script against)

PRs merge only when CI is green (branch protection on `main`).

### TDD Workflow

Red-Green-Refactor for core features:
1. **Red** — commit a failing test (`test(dice): add failing test for d20 roll range`)
2. **Green** — commit minimum code to pass (`feat(dice): implement rollDice`)
3. **Refactor** — clean up without changing behavior (`refactor(dice): extract parseDiceNotation`)

Enforced for: dice rolling, character card validation, token permissions.
