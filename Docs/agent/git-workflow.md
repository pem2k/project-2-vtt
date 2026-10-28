# oPeN VTT — Git & Scrum Workflow

> Reference doc linked from [AGENTS.md](../../AGENTS.md). Read before branching, committing, or opening a PR.

## Branch Naming

```
feature/<issue-number>-<short-description>
bugfix/<issue-number>-<short-description>
chore/<issue-number>-<short-description>
```

Examples: `feature/12-dice-rolling`, `bugfix/27-token-snap-offset`

## Commit Messages

Use conventional commits:

```
<type>(<scope>): <description>

Types: feat, fix, test, refactor, chore, docs
Scopes: auth, room, board, token, dice, character, ci
```

Examples:
- `feat(dice): implement rollDice with modifier support`
- `test(token): add failing test for unassigned player drag`
- `fix(room): validate password before joining`

Reference issues with `#<number>`: `feat(auth): add signup form (#5)`

## Branches

- `dev` — default working branch. Feature/bugfix/chore branches are cut from `dev` and PR'd back into `dev`. Protected: PR required (no approvals), no force-push or deletion.
- `main` — release branch. Protected: PR required with 1 approval, resolved threads, no force-push or deletion. Repo admin can bypass. `dev` → `main` merges are done manually by the repo owner — agents never open PRs into or push to `main`.

## PR Workflow

- One PR per issue, targeting `dev`. Title matches the issue title.
- PR description links the issue: `Closes #12` (the issue auto-closes when the change reaches the default branch, `dev`).
- Branch must be up to date with `dev` before merge.
- CI must be green before merge (branch protection).
- Squash merge to keep history clean.
