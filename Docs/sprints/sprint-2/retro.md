# Sprint 2 retrospective

- **Milestone:** [Sprint 2](https://github.com/pem2k/project-2-vtt/milestone/2)
- **Result:** 21 of 24 issues closed. Still open: #14 (delivered in PR #65, issue still to close), #31 (real-database tests for create and join room), and #77 (these sprint documents). See the [planning](planning.md).

## What went well

- The game became playable: tokens with drag and permission checks, character cards, dice with modifiers and notation, room state restored on join and reconnect, map switching, and map pan and zoom.
- Partner review started. In Sprint 1 we basically skipped reviewing each other's pull requests. In Sprint 2 Najib reviewed 8 pull requests and Parker 7 (see the [contribution log](../../contribution-log.md)). Some pull requests still merged without a review from the other partner.
- Security gaps were closed during the sprint, for example the null-password join bypass (PR #52) and the `move_token` and active-map authorization holes (PR #48).
- Large test files were split into focused suites with shared helpers (PR #74).
- We compared the project against the course requirements and closed the gaps: README, API reference, OpenAPI spec, architecture diagrams, setup guide, issue and pull request templates, a staged CI pipeline with dependency audits and CodeQL (PR #82), a health check and preview-friendly CORS (PR #83), and a free hosted demo with pull request previews, real-database integration tests and a two-browser end-to-end test in CI (PR #85).

## What did not go well

- **Duplicated work, twice.** Najib started the settings panel (#55) after Parker had already built it, so PR #64 was closed and PR #65 merged. Later, Najib started end-to-end tests (#84) on the same day Parker merged his in PR #85, so that work was set aside and #84 was closed as covered by #85. Overlapping issues need an answer from the partner before work starts.
- **Late discovery of requirements.** Deployment, deploy previews, security scanning, OpenAPI documentation and end-to-end tests were only identified as gaps in the last days, when we read the rubric and the course checklist side by side.
- **Continuous integration stalled once.** The CI run on PR #74 stayed queued for more than an hour and could not be cancelled, so the tests were run locally before merging.
- **A few issues drifted.** #14 stayed open after its work merged, and #31 is still open.

## What we would change

- Check the course requirements and checklist at sprint planning, not at the end.
- Get an answer from the partner before starting an issue that overlaps their work.
- Deploy and add browser tests in the first days, so they are never the risky last step.
- Close issues when their work merges.
- Give every issue an explicit estimate using the new issue template.

## Partner feedback

Each partner wrote their own retrospective in Slack. They are reproduced as written.

### Najib's retrospective

Sprint 2 - retrospective

What went well: I delivered the character card (#13), dice rolling with the result broadcast to the room (#15), and room state that is restored on join and reconnect (#16), each test first, and I merged the three token socket handlers into one shared helper (#50). In the second half I compared our work against the rubric and wrote the missing pieces: the README, API reference, OpenAPI spec, architecture diagrams, setup guide, issue and PR templates, and sprint docs. I also split CI into stages with a security scan (#80) and added a health check and preview-friendly CORS (#81), which Parker's hosting work then built on. Partner review finally happened this sprint: I reviewed 8 of Parker's pull requests.

What I would change: post in Slack before starting any issue that touches shared work, be more meticulous on reading the rubric at sprint planning instead of at the end, deploy early, and ask for a review on every pull request.

### Parker's retrospective

Sprint 2 went pretty well. We got the main gameplay pieces working: token movement with permissions, character cards, dice broadcasting, map switching, pan and zoom, and restoring room state after reconnecting. We also addressed some of the problems from Sprint 1 by adding real database integration tests and a browser smoke test, splitting CI into stages, and adding security scanning. The README, API reference, OpenAPI spec, architecture diagram, and setup guide got done too. A lot of the extra work ended up being cleanup around those features: DMControls needed splitting up, the token socket handlers repeated the same logic, and the socket connection needed a proper lifecycle so it wouldn't get lost when navigating into a room. That showed us that getting individual features working wasn't always enough to keep the code organized or the full flow reliable. For the next project, we should get browser testing and deployment working earlier, break up large components before adding more responsibilities, and leave more time for integration fixes and documentation instead of pushing them toward the deadline.
