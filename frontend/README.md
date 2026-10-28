# oPeN VTT — Frontend

React + Vite SPA. See [AGENTS.md](../AGENTS.md) for architecture and conventions.

## Scripts

| Command                           | Purpose                      |
| --------------------------------- | ---------------------------- |
| `npm run dev`                     | Start the Vite dev server    |
| `npm run build`                   | Production build to `dist/`  |
| `npm run preview`                 | Preview the production build |
| `npm run lint`                    | ESLint                       |
| `npm run format` / `format:check` | Prettier write / check       |
| `npm test`                        | Vitest (no tests yet)        |

## Structure

```
src/
├── pages/        # LoginPage, HostJoinPage, GamePage
├── components/   # CharacterCard, DicePanel, DMControls
│   └── board/    # Board, Grid, Token (Konva)
├── hooks/        # useGameRoom
└── lib/          # supabase, socket clients
```
