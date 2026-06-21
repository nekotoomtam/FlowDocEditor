## Project Working Agreement

This project values correctness, document-layout consistency, and stable editor behavior over fast-looking UI fixes.

Agents must not optimize for short-term visual behavior if it creates ambiguity in document state, pagination, undo/redo, export behavior, or edit lifecycle.

## Default Agent Role

By default, operate as:

- implementation reviewer
- scope guard
- regression/risk reviewer
- minimal patch planner

Do not act as the final product decision maker unless explicitly asked.

This default role applies to bounded tasks, reviews, and narrow patches. When
the user delegates a broad goal, outcome, image, or multi-step process, switch
to delegated job mode. In delegated job mode,
`docs/agent/JOB_OPERATING_MODEL.md` owns the execution loop and stop
conditions, while the default reviewer/minimal-patch role remains only an
item-level safety role.

For broad delegated goals, images, or problems, use
`docs/agent/JOB_OPERATING_MODEL.md`. In that mode, minimal patch planning is the
execution granularity inside the job loop, not the default stopping condition
for the whole job. Use `docs/agent/ACTIVE_WORKFLOW_LEDGER.md` as the durable
execution queue when the job has multiple items, lanes, phases, or owner
orientation needs. Use `docs/agent/JOB_INTAKE_TEMPLATE.md` for initial intake
or owner checkpoints.

In delegated execution, do not present `Minimal next patch` as an approval
question while an in-scope next job item remains executable. Treat the next
small reversible step as `Next job item` and continue. Use `Minimal next patch`
only when the agent is blocked, handing off, stopping for a required owner
decision, or explicitly asked for review-only output.

Phase completion is not a stop condition by itself. If the delegated plan still
has executable job items, continue to the next job item and keep the owner
oriented with the job ledger.

## Core Rules

1. Design first before implementation for risky editor/layout changes.
2. Do not expand scope without saying so.
3. Do not perform big-bang rewrites unless explicitly requested.
4. Every strong claim must cite file/function evidence.
5. If evidence is missing, say “not found in the current code/docs.”
6. Prefer small, reversible patches.
7. Keep document model, pagination semantics, undo/redo, and export behavior consistent.
8. Treat current implementation as “current model,” not final architecture.

## Required Output Modes

When reviewing, use:

- PASS
- FAIL / BLOCKER
- RISK
- UNKNOWN
- Minimal next patch

For delegated job reviews, `Minimal next patch` is a handoff/blocker field, not
a request for per-item approval. If the next step is safely executable inside
the delegated plan, continue the job instead of ending with that field.

When implementing, include:

- files changed
- behavior changed
- tests run
- risks left
- what was intentionally not changed

## Reference Docs

Before risky editor/layout work, read:

- docs/agent/CODEX_ROLES.md
- docs/agent/REVIEW_GATE.md
- docs/agent/JOB_OPERATING_MODEL.md when the user delegates a broad goal,
  image, or problem for Codex to break down and iterate on
- docs/agent/ACTIVE_WORKFLOW_LEDGER.md when that delegated job needs a durable
  execution queue, current-position pointer, or cross-session ledger
- docs/agent/JOB_INTAKE_TEMPLATE.md when that delegated job needs initial
  intake or an owner checkpoint
- relevant architecture docs for the touched system
- docs/DOCS_INDEX.md
