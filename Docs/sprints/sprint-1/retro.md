# Sprint 1 retrospective

- **Milestone:** [Sprint 1](https://github.com/pem2k/project-2-vtt/milestone/1), due Nov 5, 2026
- **Result:** 13 of 13 issues closed, nothing carried over. See the [planning](planning.md).

Each partner wrote their own retrospective. They are reproduced as written.

## Najib's retrospective

Sprint 1 - retrospective

I finished my Sprint 1 issues: name based rooms (#33), the socket join fix (#35), and the logout button placement (#46). I built each one test first. A failing test commit came first, then the implementation, then lint, format and the full test suite before every PR. That caught real problems, such as Parker's maps test breaking when create_room changed, and it kept the PRs small enough to review.

What went wrong: I merged #33 before the Host/Join page matched the mockups. Parker flagged that it looked unfinished and unstyled, and #46 came out of that. Copilot's automatic merge conflict resolution also overwrote my GamePage changes in #41. I had to repair that by hand. The switch from Copilot to Antigravity, with a stronger model, has gone more smoothly so far.

What I'd change for Sprint 2: compare the page against the mockup before merging, not only the tests. Turn off bot conflict resolution. Agree with Parker early on who owns shared files such as GamePage. Update the docs (AGENTS.md, design, PRD) that still say room code.

## Parker's retrospective

Sprint 1 went pretty well. We closed all 13 issues by the due date and didn't carry anything over, and we even got map upload and the grid overlay done early. We stuck to writing tests before code for the most part, and the repo has good coverage. The security setup (RLS, hashed passwords, guarded RPCs) was done right from the start too. Most of our problems showed up when pieces came together: a CORS bug broke the join flow in the browser even though the unit tests passed, CI kept needing env fixes to stay green, we had to make a few extra tickets for UI polish because the original issues didn't cover design, and one auto-merge quietly dropped the right code so someone had to catch it by hand. We also basically skipped reviewing each other's PRs this sprint, which is probably how some of that slipped through. For Sprint 2 we should set up a real partner review process so every PR gets a second set of eyes, fix the test env setup once so CI stops breaking, add a browser smoke test to catch wiring bugs like the CORS one, and keep a close watch on merges since the token work all touches the same files.

## Actions agreed for Sprint 2

| Action                                                                     | Raised by | Status at the end of Sprint 2                                                                                                                                                  |
| -------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Set up a real partner review process so every PR gets a second set of eyes | Parker    | Done. Reviews started in Sprint 2: Najib reviewed 8 pull requests and Parker 7. See the [contribution log](../../contribution-log.md).                                         |
| Fix the test environment setup so CI stops breaking                        | Parker    | Done. CI has passed on the pull requests since, the backend unit tests no longer need a database, and CI now starts its own local database for the integration tests (PR #85). |
| Add a browser smoke test to catch wiring bugs like the CORS one            | Parker    | Done. PR #85 added a two-browser end-to-end test that runs in CI.                                                                                                              |
| Keep a close watch on merges, since token work touches the same files      | Parker    | Ongoing.                                                                                                                                                                       |
| Compare each page against the mockup before merging                        | Najib     | Ongoing.                                                                                                                                                                       |
| Turn off bot conflict resolution                                           | Najib     | Done by Najib. Conflicts are resolved by hand.                                                                                                                                 |
| Agree early on who owns shared files such as GamePage                      | Najib     | Partly done. Refactoring GamePage (#59) was held until Parker's #65 merged. The overlaps on #55 and #84 in Sprint 2 show this still needs care.                                |
| Update the docs that still say room code (AGENTS.md, design, PRD)          | Najib     | Done in #87.                                                                                                                                                                   |
