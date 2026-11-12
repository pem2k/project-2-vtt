# Sprint 1 planning

- **Milestone:** [Sprint 1](https://github.com/pem2k/project-2-vtt/milestone/1), due Nov 5, 2026
- **Planned together by:** Najib and Parker, asynchronously over Slack and in GitHub issues
- **Roles:** Najib and Parker shared the Product Owner and Scrum Master roles

## Sprint goal

Lay the foundations of oPeN VTT: a working frontend and backend scaffold, the database with security rules, sign-up and login, password-protected rooms that players can join, map upload with a grid overlay, and a CI pipeline that runs lint and tests on every pull request.

## Issues

13 issues, split between the two of us.

| Issue | Title                                                                                        | Type        | Priority | Owner  | Status |
| ----- | -------------------------------------------------------------------------------------------- | ----------- | -------- | ------ | ------ |
| #1    | Scaffold frontend with React + Vite                                                          | chore       | high     | Parker | Done   |
| #2    | Scaffold backend with Express + Socket.IO                                                    | chore       | high     | Najib  | Done   |
| #3    | Set up Supabase project and database tables                                                  | chore       | high     | Parker | Done   |
| #4    | Implement signup, login, and logout with Supabase Auth                                       | feature     | high     | Parker | Done   |
| #5    | Create password-protected rooms                                                              | feature     | high     | Najib  | Done   |
| #6    | Join a room with code and password                                                           | feature     | high     | Najib  | Done   |
| #7    | Upload maps to a room via DM Controls                                                        | feature     | high     | Parker | Done   |
| #8    | Render square grid overlay on map                                                            | feature     | high     | Parker | Done   |
| #12   | Set up Vitest and CI lint + unit test pipeline                                               | chore       | medium   | Najib  | Done   |
| #30   | Socket.IO server missing CORS config — join flow fails in browser                            | bug         | high     | Parker | Done   |
| #33   | Make the Join a Game / room screens match the mockup                                         | enhancement | medium   | Najib  | Done   |
| #35   | Clean up scaffold code from #2/#12 (logger wrapper, duplicate dice, test-shaped server code) | unlabelled  | none     | Najib  | Done   |
| #46   | Fix logout button placement on the Host/Join page                                            | unlabelled  | none     | Najib  | Done   |

## Estimates

Issues in this sprint were sized with the `priority` label (high, medium, low) as a relative guide. Issue templates with story points were added in Sprint 2 (#76), so later issues can carry an explicit estimate.

## Workflow agreed for the sprint

- One branch per issue, cut from `dev` (`feature/`, `bugfix/` or `chore/` plus the issue number).
- Test first: a failing test is committed before the code that makes it pass.
- Conventional commits that reference the issue number.
- Pull requests target `dev` and close their issue.
- The rules are written in `AGENTS.md` and `Docs/agent/git-workflow.md`.

## Outcome

All 13 issues were closed by the due date and nothing was carried over. See the [Sprint 1 retrospective](retro.md).
