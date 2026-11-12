# Partner contribution log

Who did what on oPeN VTT. Counts are from GitHub and the git history on `dev` as of Nov 12, 2026, and are updated before the final submission.

## Summary

|                                            | Najib | Parker |
| ------------------------------------------ | ----- | ------ |
| Commits on `dev` (excluding merge commits) | 38    | 32     |
| Pull requests opened                       | 20    | 20     |
| Pull requests reviewed (on GitHub)         | 8     | 7      |
| Issues owned in the two sprints            | 21    | 16     |

Both partners commit under more than one git identity, so the commit counts add up the identities each person used. Najib: `Najib Hazel Mosquera` (30) and `Najib` (8). Parker: `pem2k` (14), `Parker McKillop` (14) and `pem` (4).

## Najib

**Sprint 1**

- #2 Scaffold the backend with Express and Socket.IO
- #5 Create password-protected rooms
- #6 Join a room with a name and password
- #12 Set up Vitest and the CI lint and unit test pipeline
- #33 Match the Join a Game and room screens to the mockup
- #35 Clean up scaffold code from #2 and #12
- #46 Fix the logout button placement on the Host/Join page

**Sprint 2**

- #13 Character card with name, HP, AC and notes
- #15 Roll dice and broadcast results to the room
- #16 Persist and restore room state on join and reconnect
- #50 Deduplicate the token handler into one shared helper
- Documentation: #66 README, #67 API reference, #68 architecture diagrams, #69 setup guide, #75 OpenAPI spec, #77 sprint planning, retrospectives, standups and this log
- #76 Issue and pull request templates
- #80 Split CI into lint, test and build stages with `npm audit` and CodeQL security scanning (PR #82)
- #81 Backend health check and wildcard CORS origins for preview deploys (PR #83)
- #84 End-to-end tests: closed as covered by Parker's PR #85

**Reviews:** pull requests #48, #51, #52, #54, #60, #62, #63 and #74.

## Parker

**Sprint 1**

- #1 Scaffold the frontend with React and Vite
- #3 Supabase project, database tables, row-level security and RPCs
- #4 Sign up, login and logout with Supabase Auth
- #7 Upload maps through DM Controls
- #8 Square grid overlay on the map
- #30 Socket.IO CORS configuration

**Sprint 2**

- #9 DM adds, names, colors and removes tokens
- #10 DM assigns tokens to players
- #11 Move tokens with drag and permission enforcement
- #14 Players edit their own HP and notes, DM edits all fields
- #17 Map panning and zooming
- #18 Dice modifiers and roll notation
- #19 DM switches between uploaded maps
- #31 Real-database tests for create and join room (open)
- #32 Socket connection leak on navigation to the game page
- #49 Split DM Controls into subcomponents
- #55 Move the character card and creation into the settings panel (PR #65)
- #61 Split the stylesheet by component and page
- Test refactor: split the large test files into focused suites (PR #74)
- Free hosted demo on Render and Supabase with pull request previews, deployment docs, real-database integration tests and a two-browser end-to-end test in CI (PR #85)

**Also:** agent hooks and modular agent docs (PR #22), the decisions log split by git identity (PR #23), and the authorization and null-password fixes in PRs #48 and #52.

**Reviews:** pull requests #53, #56, #57, #58, #70, #71 and #72.

## Working together

- Both partners had push access, worked on separate branches per issue, and opened pull requests into `dev`.
- Najib's pull request #64 for #55 was closed because Parker had already implemented it in #65, and Najib's end-to-end work for #84 was set aside because Parker's #85 already covered it.
- The decision logs in `decisions/` record agent decisions for each partner separately.
- Standups were posted in the shared Slack channel. See the [standups](sprints/standups.md).
