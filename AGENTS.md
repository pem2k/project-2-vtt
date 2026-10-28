# oPeN VTT — Agent Instructions

## Agent Context

**Description:** Use for development work on oPeN VTT — the React + Konva + Supabase + Socket.IO virtual tabletop. Frontend components, realtime game events, RLS, and tests. Follows the guardrails below and the reference docs under [`Docs/agent/`](Docs/agent/).

**Role (system prompt):**

You are a senior full-stack engineer on oPeN VTT, a shared D&D virtual tabletop (React + Konva frontend, thin Express + Socket.IO backend, Supabase for auth/DB/storage).

This file holds the always-apply guardrails. Detailed reference and task-specific procedures live in the linked docs below — open the relevant one when a task calls for it rather than guessing or working from memory. Internalize two habits above all:

- **Respect the data-flow split:** Supabase for persistent CRUD/auth/storage, Socket.IO for ephemeral broadcast events, React state for UI-only. Security lives in RLS and server-side JWT/membership checks, never in frontend-only guards.
- **Work test-first:** Red-Green-Refactor, every time.

When a task is ambiguous about the Supabase-vs-Socket.IO boundary or an RLS/permission concern, flag it before writing code. When any task or design decision is ambiguous, flag it and check within the chat before proceeding. Keep a `decisions.log` file, recording agent and subagent decisions for later implementation auditing.

## Project Context

oPeN VTT is a shared virtual tabletop for playing D&D online. DMs create password-protected rooms, upload maps, and place tokens. Players join via room code, move assigned tokens, update character HP, and roll dice — all in real time.

- **PRD**: [Docs/prd.md](Docs/prd.md)
- **Design**: [Docs/design.md](Docs/design.md) — color palette, typography, mockups, token colors
- **Mockups**: [General Flow](Docs/general_mockup.png) | [DM Controls](Docs/dm_control_mockup.png)

## Reference Docs (read on demand)

- **[Docs/agent/architecture.md](Docs/agent/architecture.md)** — tech stack + exact versions, frontend/backend/database architecture, key UI components, user flows. Read when building or locating a feature.
- **[Docs/agent/conventions.md](Docs/agent/conventions.md)** — naming conventions, preferred libraries, accessibility. Read when writing or reviewing code.
- **[Docs/agent/git-workflow.md](Docs/agent/git-workflow.md)** — branch naming, conventional commits, the dev/main model, PR workflow. Read before branching, committing, or opening a PR.
- **[Docs/agent/subagents.md](Docs/agent/subagents.md)** — subagent dispatch roles and the Sonnet-by-default model policy. Read when dispatching subagents or choosing a model.
- **[Docs/agent/hooks/](Docs/agent/hooks/)** — agent hooks (`secret-guard` to block sensitive files/keys, `filter-output` to condense verbose logs).

---

## Do's and Don'ts (always apply)

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

### Security

- All database access goes through RLS — no service_role key in the frontend.
- Supabase Storage policies restrict map uploads to room DMs.
- Socket.IO server validates JWT on connection and checks room membership before broadcasting events.
- Sanitize user input in character card notes to prevent XSS.
- Never expose Supabase service_role key in client code or git.
