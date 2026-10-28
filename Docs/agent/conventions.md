# oPeN VTT — Coding Conventions

> Reference doc linked from [AGENTS.md](../../AGENTS.md). Read when writing or reviewing code, naming a file/variable/component, or choosing a library.

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

## Preferred Libraries

| Purpose | Use | Don't use |
|---|---|---|
| Auth | Supabase Auth | Passport, JWT manually |
| Database | Supabase JS client | Mongoose, Prisma, raw pg |
| File upload | Supabase Storage | Cloudinary, Multer to disk |
| Canvas | Konva + react-konva | Fabric.js, raw Canvas API |
| Realtime | Socket.IO | Supabase Realtime (for game events) |
| Testing | Vitest + Playwright | Jest, Cypress, Mocha |
| Linting | ESLint + Prettier | StandardJS |

Don't install utility libraries (lodash, underscore) — use native JS methods.

## Accessibility

- All interactive elements must be keyboard navigable.
- Dice buttons and form inputs need visible focus indicators.
- Use semantic HTML for panels and forms (the Konva canvas is inherently visual and exempt).
- Color tokens should be distinguishable — use both color and a text label.
