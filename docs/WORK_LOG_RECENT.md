# Work Log Recent

This file is the current handoff context. Keep it short enough to read before a
new session starts. Do not paste full task transcripts here.

## Latest Accepted Baseline

Release/readiness marker `0.6.31` was accepted on 2026-06-08.

Accepted facts:

- Active work logs are compact milestone/handoff summaries instead of long
  transcripts.
- Agent docs now use `AGENTS.md` and `docs/agent/*` as the active source set.
- `docs/DOCS_INDEX.md` is a shorter route map for task-specific reading.
- `docs/FRONTEND_RUNTIME_ARCHITECTURE.md` is a concise runtime boundary
  reference instead of a task-by-task RFC log.
- No persisted document schema, FlowDoc package/storage version, pagination
  semantics, undo/redo behavior, export contract, renderer ownership, or
  editor runtime behavior changed.

Verification anchor:

- stale-reference scan across docs/source
- `git diff --check -- docs AGENTS.md`
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`

## Current Runtime Context

Tasks 38-42 completed the PreviewSettle output-lane executor slice:

- precomputed browser preview Shell executor
- partial worker preview Shell executor
- visual-only browser preview Shell executor
- final paginated-output Shell executor
- draft-pagination Shell executor

The accepted constraint is narrow: these lanes still execute Shell-owned
mutations through callbacks. Runtime guard decisions, preview document
construction, pagination output production, validation, reducer semantics,
renderer/export behavior, persistence, FlowTable behavior, typing, and
IME/composition behavior were not intentionally moved.

Primary architecture reference:

- `docs/FRONTEND_RUNTIME_ARCHITECTURE.md`

## Next Useful Work

1. Add a PreviewSettle ownership/design closure gate before larger runtime
   movement.
2. Define the smallest runtime-owned state that can move without changing
   document model, pagination semantics, reducer behavior, renderers/export,
   persistence, FlowTable, validation, `flushSync`, typing, or
   IME/composition behavior.
3. Split remaining performance work by lane: startup/import, layout engine,
   canvas interaction, typing lane, and panel/selection side effects.

## Handoff Rules

- Put durable milestone summaries in `docs/WORK_LOG.md`.
- Put behavior contracts in the active spec/contract that owns them.
- Put task-local evidence in the final response or focused reports.
- Use git history for older detailed work-log entries.
