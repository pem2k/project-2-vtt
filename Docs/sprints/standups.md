# Standups

We posted standups asynchronously in our shared Slack channel. The messages below are copied as written. Slack showed the time of each message but not the date, so each day's date comes from the commits and pull requests the messages mention. Slack's "(edited)" markers and attached screenshots are left out.

Both partners' retrospectives from the same channel are in the [Sprint 1 retrospective](sprint-1/retro.md) and the [Sprint 2 retrospective](sprint-2/retro.md).

## Sprint 1

### Monday, Nov 2

**Parker** (time cut off in the copy)

> Sprint 1/hw3 task: set up Supabase project and db schema, adding rooms, room_members, tokens, characters, RLS policies for room controls, and seed.sql script setup. This is the Supabase/db backend, so its seperate from the sockets backend you have assigned. No blockers :slightly_smiling_face:

**Parker**, 12:35 PM

> Also, going to push a change to agents md, I think the decisions.log file should be split between your agents' decisions and my agents' otherwise I think its gonna cause some merge conflict funkiness, and we'll waste a lot of tokens double auditing the same decisions log.
>
> can probs split based on git identity thats available locally? Will play with it a bit

**Najib**, 2:30 PM

> Daily Standup - as Sprint 1 starting - Im going to be looking at the tickets and analyzing which tickets out of the ones we already have it under to-do. which ones should go first.

**Parker**, 4:21 PM

> Ended up running into a blocker re: vitest, genned the package.json and have initial integration tests built for supabase backend, tables are defined and integration tests are passing.
>
> Tl;dr issue #3 is resolved, looking to issue four setting up general auth

**Parker**, 4:53 PM

> Also cant believe I forgot when setting up, but adding react router as a dependency for front end routing

**Najib**, 6:11 PM

> Starting #2 (backend scaffold: Express + Socket.lO ) on chore/2-scaffold-backend. Test-first, PR into dev when done. No blockers.

**Najib**, 6:31 PM

> Done: #2 Scaffold backend with Express + Socket.lO
> Merged into dev via PR #25. Express server with Socket.lO attached, connect/disconnect logging, and the sockets/ and utils/ folders. Built test-first: the failing test was committed first (RED), then the code (GREEN), and both tests pass.
> Next:#5 issue.

**Parker**, 6:33 PM

> Closed #4 - signup, login, logout, etc with supabase auth, alongside frontend ui for registration/sign in are complete

**Najib**, 6:35 PM

> Starting #5 (create password-protected rooms) on feature/5-create-rooms. Thanks for #4, it's merged. Test-first, PR into dev when done. No blockers.

**Parker**, 6:46 PM

> Sounds good thank you, will keep an eye out, once rooms exist I can move into building out the room features

**Najib**, 6:58 PM

> Daily Standup - Done: #5 Create password-protected rooms
> Merged into dev via PR #27. The DM can create a room from HostJoinPage (name + password). It calls the create_room RPC, shows the room code, and redirects to /game/:roomId. Built test-first (RED, mock fix, GREEN) and tests and lint pass.
> Heads-up: the game route is now /game/:roomId, so GamePage knows which room it's in.
> Next: #6 (join a room with code and password)

**Najib**, 7:14 PM

> Starting #6 (join a room with code + password) on feature/6-join-room. Builds on my #5 and your #4. Test-first, PR into dev when done. No blockers.

**Najib**, 8:30 PM

> Done: #6 Join a room with code and password
> Merged into dev via PR #28. A player can join a room from HostJoinPage with the room code and password. It calls the join_room RPC and then joins the room's Socket.lO channel. The server checks the Supabase token and room membership, so non-members are refused. Built test-first, and all tests pass.
> Heads-up: the backend now needs SUPABASE_URL and SUPABASE_ANON_KEY in its environment (see backend/.env.example). For a manual run, use node --env-file=.env src/server.js.
> Sprint 1 status: #1 to #6 are done. Next for me: #12 (Vitest + CI)

**Najib**, 8:35 PM

> Starting #12 (Vitest + CI lint and unit test pipeline) on chore/12-vitest-ci. Test-first where it makes sense, PR into dev when done. No blockers.

**Najib**, 8:48 PM

> Done: #12 Vitest + CI pipeline. Merged. CI now runs on every push and PR to dev: lint, Prettier check and unit tests for frontend and backend. The Supabase database tests aren't in CI (they need a local stack); run them locally with npm test in backend/. After pulling, run npm install once at the repo root to enable the Husky pre-commit hook.
> Sprint 1 status: #1 to #6 and #12 done.

### Tuesday, Nov 3

**Parker**, 12:28 PM

> Morning standup: There are some issues with the test structure, cors, and other socket logic recorded in issue 30, 31, and 32. Tackling those to remove blockers before moving to the next implementation steps

**Najib**, 3:02 PM

> Roadblock: Reviewing feedback on my #5/#6/#2 work. Mocked DB tests, room join needs to become name + password, and some scaffold cleanup. Pausing #13 to fix those via #33 (expanded) and a cleanup issue, then #31.

**Najib**, 6:19 PM

> Starting #33 (room name + password join, mockup screens) on feature/33-room-name-join. Includes a new migration for unique room names; will ping Parker to review that part. Local Supabase set up and backend tests green

**Parker**, 6:37 PM

> forgot to mention additional standup tasks for today after class. Currently working on map upload feature, and dm controls modal under issue #7

**Parker**, 7:15 PM

> One other thing, adding some things to the backlog we can ignore. Planning to continue working after we've turned in the project. No need to stress things that are tagged Post class project development :slightly_smiling_face:

### Wednesday, Nov 4

**Najib**, 10:15 AM

> Daily stand up : Merged #33 (room name + password, new migration). If anything looks off, especially the migration, feel free to fix it or tell me. Heads up: the unique room-name rule won't apply if a shared Supabase already has duplicate room names. Also, characters.test.js only passes once per fresh DB, so we should cover that in #31.

**Parker**, 11:13 AM

> Do we need unique name rule for the room? They each have their own uid so we can manage by that and not the room name, and room name is display only. Will take a look at characters.test, attacking issues #8-11, they're seperate issues but they're all essentially controls within the room

**Parker**, 1:01 PM

> It's a little off schedule and was planned for the later sprint, but when building out the map feature I also built out switching maps within the room, so issue #19 is clear. Additionally, I built out issue #8 - the grid overlay on the map is implemented alongside a slider in the dm controls that adjusts the size of the squares in the grid, this will let dms decide how to scale player movement on the map image they provide. Also, I added in a toggle in the dm controls for the grid, as a lot of official maps already come with the grid built in to them, so this will support both types of map images, gridded/non gridded
>
> Moving into issue #9 - dm adding, naming, and assigning, and coloring tokens.

**Parker**, 4:47 PM

> Completed issue #9 - colored/named tokens can be added to the map, closed in pr#43. Moving into token assignment, issue #10. Game ui starting to come together :slightly_smiling_face:.
>
> sneak peak of dm map controls too: _(screenshot)_

**Parker**, 5:56 PM

> Heads up - will add something for this in agents.md, but I figured out what was causing the invalid token room join failure, it was a stupid thing. I was having an agent execute the startup scripts and it caused them to run in the agents sandbox which was blocking traffic between the two instances, wasn't actually a jwt thing. Shouldn't be something we have to worry about on deployment

**Najib**, 11:33 PM

> PR is up for the logout button (#46): it's now centered below the Host/Join card, same button styling at ~3/4 width, with Signed in as \<email\> under it. Selection screen only, host/join screens untouched. Tests/lint/format pass. Merging once CI is green.
> I'm done with my Sprint 1 tickets. Retro will be tomorrow.

## Sprint 2

### Sunday, Nov 8

**Parker**, 12:20 PM

> Starting issue 11, token movement and permissions, no blockers, will ping you once its ready for review!

**Parker**, 12:29 PM

> Actually, before starting issue 11 I'm doing a bit of organization/deslop, there are a few points where we attacked different files at similar times, that had dependencies that didnt exist yet, so they exist bar for bar in their own files, going to extract the getsupabaseconfig function, and make a few other changes
>
> another point for team review process here haha

**Parker**, 1:26 PM

> The fixes worktree was getting large and I found a couple security loopholes, just pushed a pr for those fixes your way, starting a second fixes branch to keep things manageable.

### Monday, Nov 9

**Parker**, 3:27 PM

> Forgot to add this before I started working this morning, but I put a couple of fixes in for socket reconnection, test deduplication, and fixed a room join security bug where null passwords let you into the rooms
>
> I also refactored dmcontrols, splitting it into tab based components, that should keep the size of the dmcontrols file down.

**Najib**, 4:27 PM

> Sprint 2 Daily standup - PR up for #13 (character card): left sidebar, shows name/HP/AC/notes, create form if you have no character, DM can switch between cards. Display only, so #14 can build on CharacterCard.jsx. No migrations or RLS changes. @Parker McKillop Can you review when you get a chance? I reviewed #48 and approved it.

**Najib**, 4:36 PM

> Review your issue #51, eviewed, made some comments, and approved it.
> Now working on issue 52

**Najib**, 4:49 PM

> Reviewed and approved #52. Heads-up - my #13 PR (character card) also touches GamePage.jsx, so I'll merge dev into my branch after your stack lands and sort out the conflict.

**Parker**, 5:47 PM

> Reviewed and merged! I also added pulled dev and merged it in locally, and updated the zooming/panning PR so no more conflicts :slightly_smiling_face:

**Najib**, 5:49 PM

> Hey, PR #56 is up for review. It's for issue #15 (dice rolling): the server rolls and broadcasts diceResult to the room, with a DicePanel under the board. I merged dev into my branch first, so GamePage.jsx (character card + dice) is already resolved. Can you review when you get a chance?
> Also, #52 was merged into the chore/49 branch after #51 had already gone into dev, so I don't think its changes (null-password fix, socket reconnection) made it to dev. Worth a look.

**Parker**, 5:58 PM

> Thanks for letting me know! I branched off 49 for the subsequent prs, #54 should reinclude anything that didn't make it in. Once that's reviewed and merged I can review/merge your pr and it should solve the conflicts issue :slightly_smiling_face:
>
> actually thinking it through
>
> we merge 54 in
>
> then I think we have you pull dev and merge it into the dice branch
>
> then push and it should update the pr at that point

**Najib**, 7:02 PM

> Pushed the changes for #56: rolls now show up in the chat window with the roller's name, and the dice are a round grid at the bottom of the right column, as in the mockup. Can you take another look when you get a chance?

**Najib**, 7:23 PM

> Starting #16 now, small scope: reload the character data (player's own card / DM's list) whenever the room is rejoined after a reconnect, in the same reload as tokens and the map. Shout if that collides with what you're doing for #14.

**Najib**, 8:44 PM

> PR is up for #16: small change, character data now reloads on every rejoin (same guards as the token/map snapshot). Tested against the real backend with a restart. Can you review when you get a chance?

**Najib**, 9:46 PM

> I'm taking #50 (token handler dedupe) since it's unassigned. Does #11 touch tokenSocket.js? If so I'll hold off, otherwise I'll keep it to a pure refactor with the existing tests unchanged.

### Tuesday, Nov 10

**Najib**, 1:30 PM

> Sprint 2 - Daily standup - PR for #50 is up (token handler dedupe). Small pure refactor, tests unchanged. Please review when you get a chance, and also #57 for #16.

**Najib**, 3:44 PM

> Move tokens with drag and permission enforcement (#11)- #60
> #60, has been reviewed, commented and accepted.

**Najib**, 4:14 PM

> Taking #55 now (settings panel with a Character tab, reusing the DM shell like you said). Is #59 required for the grade or nice-to-have? I'd do it after #55, one extraction at a time, since both touch the character code in GamePage. Also, does your #14 touch CharacterCard? I want to avoid stepping on it.

**Najib**, 7:25 PM

> PR for #55 is up (Settings panel with a Character tab, reusing the DM shell like you said). Please review when you can.

### Wednesday, Nov 11

**Najib**, 10:41 PM

> Sprint 2 - Daily standup - worked on the README, local set up and deploy guide, document Socket. IO events and Supabase RPCs, add architecture diagram of frontend, backend and Supabase. For the CI/CD part, working on Tests in CI, Multi-stage pipeline, and Security scan (npm audit and CodeQL).

**Parker**, 10:55 PM

> Forgot to make a post this morning but quick standup! Completed test refactoring, broke up our monoliths. Ran into no blockers today, will most likely finish last feature: hp/ac editing for players tomorrow morning :slightly_smiling_face:
