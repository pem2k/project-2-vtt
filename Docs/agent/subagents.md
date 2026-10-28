# oPeN VTT — Subagent Dispatch Strategy

> Reference doc linked from [AGENTS.md](../../AGENTS.md). Read when deciding whether to dispatch a subagent or which model to use.

**Default to Sonnet.** Sonnet handles most coding tasks on this repo well and costs far less than Opus. Reserve Opus for genuinely complex architectural decisions or multi-step reasoning, then drop back to Sonnet. Do **not** use the top-end frontier models (e.g. Fable, Astra); a strong reasoning model is the ceiling, not the most powerful model available. Switch models mid-session with `/model`, or set a default in `/config`. For simple tasks, also lower `/effort` — thinking tokens bill as output tokens.

## Roles (harness-agnostic)

- **Orchestrator (parent agent)** — owns judgment and anything hard to reverse: code review, test *design*, test adequacy and failure analysis, decision-making and decision auditing, and all git *writes* (commit, branch, merge, push, PR). Runs on **Sonnet by default**; escalate to **Opus only for complex architectural decisions or multi-step reasoning**, then return to Sonnet. Most sessions on this repo (scaffolding, repo/CI config, component and CRUD/RLS boilerplate, routine review) are mechanical and should stay on Sonnet.
- **Workers (subagents)** — mechanical implementation against a clear spec: writing code and authoring the tests the orchestrator's test design calls for. Use the **cheapest capable model available** (Sonnet or Haiku).

**Applies only where the harness supports subagents and per-dispatch model selection.** Otherwise the parent does everything inline — don't dispatch. Also skip dispatch for trivial edits, where the overhead isn't worth it. Workers may *read* git state; only the orchestrator performs git *writes*.

## Model mapping by environment (examples — adapt to what's installed)

> **Note for grader review** — Agent can ignore this line. Claude access via API BYOK, Copilot as harness (Parker's setup). The Copilot harness is too heavy for local-model output speed and available context window; for project three I can use local if alternative minimalist TUI harnesses like pi are allowed. That said, Copilot is possible to use with local models on my setup if using exo for inference to split context across the cluster with 4070s, but this results in single-digit tok/s.

| Available models | Workers (implementation / test authoring) | Orchestrator (review / test design / decisions / git) |
| --- | --- | --- |
| Claude, full tier (this repo's default) | Sonnet or Haiku | Sonnet by default; Opus only for complex architecture / multi-step reasoning (never Fable / Astra) |
| Claude, parent has a cheaper tier | cheaper tier | mid tier by default; capable reasoning tier (e.g. Opus) only when the task demands it |
| Gemini only (e.g. Antigravity) | Flash / Flash-Lite | Flash by default; a Gemini reasoning model (e.g. Pro) only when the task demands it |
| Single model only | — (no dispatch) | that model does all of it |
