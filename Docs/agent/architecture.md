# oPeN VTT — Architecture Reference

> Reference doc linked from [AGENTS.md](../../AGENTS.md). Read when building or locating a feature, wiring a component, or when you need a dependency version or how the pieces fit together.

oPeN VTT is a shared virtual tabletop for playing D&D online. DMs create password-protected rooms, upload maps, and place tokens. Players join via room code, move assigned tokens, update character HP, and roll dice — all in real time.

## Tech Stack

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

## Architecture

- **Frontend** (`frontend/src/`) — React SPA with three pages: LoginPage, HostJoinPage, GamePage. Konva canvas renders the map, grid, and tokens. Supabase client handles auth and DB queries directly from the browser. Socket.IO handles real-time game events.
- **Backend** (`backend/src/`) — Thin Node.js + Express server. Its only job is running Socket.IO for real-time events (token moves, dice rolls, room join/leave). Validates Supabase JWTs on socket handshake. No REST routes — Supabase handles auth, storage, and CRUD.
- **Database** — Supabase PostgreSQL with Row Level Security (RLS) policies enforcing room membership and ownership. Supabase Auth for user accounts. Supabase Storage for map image uploads.

## Key UI Components

- **Board** (`Board.jsx`) — Konva Stage rendering the uploaded map image with a grid overlay. Contains Token components.
- **Token** (`Token.jsx`) — Draggable colored circle on the grid. Drag is enabled only for the assigned player or the DM. Emits `moveToken` via Socket.IO on drag end.
- **Grid** (`Grid.jsx`) — Square grid overlay drawn on the Konva Layer. Grid size is adjustable (should-have).
- **CharacterCard** (`CharacterCard.jsx`) — Displays name, current/max HP, AC, and notes. Players edit their own HP and notes. DM can edit all fields.
- **DicePanel** (`DicePanel.jsx`) — Buttons for standard D&D dice (d4, d6, d8, d10, d12, d20, d100). Emits `rollDice` via Socket.IO. Displays roll results with player name.
- **DMControls** (`DMControls.jsx`) — DM-only panel for adding/removing/assigning tokens and uploading maps.

## User Flows

1. **Auth** — User signs up or logs in via Supabase Auth → redirected to HostJoinPage.
2. **Create room** — DM enters room name + password → Supabase inserts room row → DM gets room code → redirected to GamePage.
3. **Join room** — Player enters room code + password → Supabase validates → player added to room_members → Socket.IO joins the room channel → redirected to GamePage.
4. **Encounter setup** — DM uploads map image (Supabase Storage) → image renders on Board → DM uses DMControls to add/name/color/assign tokens.
5. **Gameplay** — Players drag assigned tokens (Socket.IO broadcasts `tokenMoved`) → update character HP/notes (Supabase update + Socket.IO broadcast) → roll dice (Socket.IO broadcasts `diceResult` with player name and total).
