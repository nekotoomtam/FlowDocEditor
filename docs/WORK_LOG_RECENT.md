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

Tasks for Editor Operation Architecture Phase 1 to 3A have been completed:
- Phase 1: Established `OperationEnvelope`, `Adapter`, and `Dispatcher` for lossless operation wrapping.
- Phase 2: Extracted `createParagraphSplitOperationPlan` and `createParagraphMergeOperationPlan` from the controller into pure `editorStructuralOperationPlans.ts` without behavior changes.
- Phase 3A: Defined `StructuralExecutionContext` and extracted `executeParagraphSplitOperationPlan` as a side-effect handler into `editorStructuralHandlers.ts`, delegating from the controller with identical `flushSync` timing.

The accepted constraint is zero behavior change during this refactoring phase:
- No changes to `flushSync` boundaries.
- No changes to dispatch order/timing or telemetry.
- Operation Plans must remain synchronous and side-effect free.
- Structural Handlers use explicit dependency injection via `StructuralExecutionContext`.

Primary architecture references:
- `docs/EDITOR_OPERATION_ARCHITECTURE.md`
- `docs/FRONTEND_RUNTIME_ARCHITECTURE.md`

## WYSIWYG Performance Refactor Polish

- Completed Stages A-E of the WYSIWYG data-flow refactor to decouple the typing path from the global React tree.
- Added `useDeferredValue` in `FlowdocDraftEditorIslandRoot` for heavy visual layout/fragment splitting to keep typing latency <16ms.
- Refactored `onRichTextShortcut` to apply formatting commands locally without forcing global re-renders.
- Implemented `flushAllWysiwygDrafts` on global boundaries (save, export, undo, split/merge).
- Added `nodeTextVersion` to `PageFragment` and implemented strict `arePageFragmentsStructurallyEqual` comparison in `EditorCanvas.tsx` to eliminate the 700-slot re-render pattern during active typing.
- Regression tests added to verify identical page slot fragments do not trigger React re-renders.

## Next Useful Work

1. Phase 3B: Extract `executeParagraphMergeOperationPlan` handler preserving rollback/focus protections.
2. Phase 3C: Slim down `useEditorOptimisticStructuralRefocusController.ts` by fully delegating side effects to handlers.
3. Validate telemetry and rendering boundaries to ensure structural flush optimizations remain intact.

## Handoff Rules

- Put durable milestone summaries in `docs/WORK_LOG.md`.
- Put behavior contracts in the active spec/contract that owns them.
- Put task-local evidence in the final response or focused reports.
- Use git history for older detailed work-log entries.
