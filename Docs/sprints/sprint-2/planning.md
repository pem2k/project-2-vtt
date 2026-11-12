# Sprint 2 planning

- **Milestone:** [Sprint 2](https://github.com/pem2k/project-2-vtt/milestone/2)
- **Planned together by:** Najib and Parker, asynchronously over Slack and in GitHub issues
- **Roles:** Najib and Parker shared the Product Owner and Scrum Master roles

## Sprint goal

Turn the foundations into a playable game: DM tokens and assignment, token movement with permission checks, character cards, dice rolling with modifiers, saved room state that survives reconnects, and map panning and zooming. In the second half of the sprint we added the course documentation, issue and pull request templates, a staged CI pipeline with security scanning, hosting, and refactors that keep the code easy to change.

## Issues

24 issues. Documentation, template and CI issues were added late in the sprint, once we compared the work against the course requirements.

| Issue | Title                                                                                | Type          | Priority | Owner  | Status |
| ----- | ------------------------------------------------------------------------------------ | ------------- | -------- | ------ | ------ |
| #9    | DM adds, names, colors, and removes tokens                                           | feature       | high     | Parker | Done   |
| #10   | DM assigns tokens to players                                                         | feature       | high     | Parker | Done   |
| #11   | Move tokens with drag and permission enforcement                                     | feature       | high     | Parker | Done   |
| #13   | Display character card with name, HP, AC, and notes                                  | feature       | high     | Najib  | Done   |
| #14   | Players edit own HP and notes, DM edits all fields                                   | feature       | high     | Parker | Open   |
| #15   | Roll dice and broadcast results to the room                                          | feature       | high     | Najib  | Done   |
| #16   | Persist and restore room state on join and reconnect                                 | feature       | high     | Najib  | Done   |
| #17   | Add map panning and zooming                                                          | feature       | medium   | Parker | Done   |
| #18   | Add dice modifiers and roll notation                                                 | feature       | medium   | Parker | Done   |
| #19   | DM switches between uploaded maps                                                    | feature       | medium   | Parker | Done   |
| #31   | Add real-DB integration coverage for create/join room (#5/#6 mock the database)      | chore         | high     | Parker | Open   |
| #32   | Socket connection orphaned/leaked on navigation to GamePage                          | bug           | medium   | Parker | Done   |
| #49   | chore: split up DMControls into subcomponents                                        | chore         | medium   | Parker | Done   |
| #50   | chore: deduplicate token handler, refactor into single handler for add/remove/update | chore         | medium   | Najib  | Done   |
| #66   | docs: add project README with overview, features and quick start                     | documentation | none     | Najib  | Done   |
| #67   | docs: document Socket.IO events and Supabase RPCs (API reference)                    | documentation | none     | Najib  | Done   |
| #68   | docs: add architecture diagram of frontend, backend and Supabase                     | documentation | none     | Najib  | Done   |
| #69   | docs: add local setup and deployment guide                                           | documentation | none     | Najib  | Done   |
| #75   | docs: add OpenAPI spec for the Supabase RPC API                                      | documentation | none     | Najib  | Done   |
| #76   | chore: add GitHub issue and pull request templates                                   | chore         | none     | Najib  | Done   |
| #77   | docs: add sprint planning, retrospectives and contribution log                       | documentation | none     | Najib  | Open   |
| #80   | chore: split CI into stages and add a security scan                                  | chore         | none     | Najib  | Done   |
| #81   | chore: add backend health check and wildcard CORS for preview deploys                | chore         | none     | Najib  | Done   |
| #84   | test: add Playwright end-to-end smoke tests and a CI job                             | chore         | none     | Najib  | Closed |

## Notes on the table

- #9, #10 and #19 were finished early, while Sprint 1 was still running.
- #14 (players edit their own HP and notes, DM edits all fields) was delivered in PR #65 together with the settings panel (#55), and the issue still needs to be closed.
- #31 (real-database tests for create and join room) is still open.
- #55 was done by Parker in PR #65. Najib started the same work in PR #64 before checking, and closed it once the overlap was clear.
- #84 was closed as covered by Parker's PR #85, which added hosting, pull request previews, real-database integration tests and a two-browser end-to-end test to CI. Najib's local attempt was set aside. The lessons from both overlaps are in the [Sprint 2 retrospective](retro.md).

## Estimates

Sized with the `priority` label. From #76 onward, issue templates ask for story points (1, 2, 3, 5 or 8) and acceptance criteria.

## Workflow

The same workflow as Sprint 1, plus partner reviews on GitHub (see the [contribution log](../../contribution-log.md) for the review counts).
