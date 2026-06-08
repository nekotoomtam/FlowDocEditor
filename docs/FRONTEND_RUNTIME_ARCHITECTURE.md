# Frontend Runtime Architecture

Date: 2026-06-04
Status: Current runtime boundary reference after Tasks 15-42

This document defines the frontend runtime boundary for reducing
`EditorShell` responsibility without changing document semantics, pagination,
undo/redo, export behavior, persistence, FlowTable behavior, typing, or
IME/composition behavior.

It is not a task log. Use git history for the removed task-by-task RFC detail.

## Scope

The runtime work may move decision metadata, guard checks, scheduling state,
diagnostic attribution, and callback execution boundaries out of the shell.

The runtime work must not:

- change `DocumentNode` or persisted package schema
- move core pagination ownership into the editor
- make browser preview authoritative for export
- move renderer/export/persistence behavior into frontend runtimes
- weaken validation
- remove `flushSync` without an accepted atomicity design
- store editor runtime state in the authored document

## Current Model

`EditorShell` and its shell controller hooks still own the React state and side
effects that mutate the editor surface. Runtime modules provide narrower state
machines, guard decisions, and mutation plans.

Primary evidence to inspect before changing this area:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/shell/useEditorRuntimeControllers.ts`
- `src/app/editor/_components/shell/useEditorPaginationLifecycleController.ts`
- `src/app/editor/_components/shell/useWysiwygDraftPaginationController.ts`
- `src/app/editor/_components/shell/useEditorOptimisticStructuralRefocusController.ts`
- `src/app/editor/_components/shell/useStructuralPanelReleaseController.ts`
- `src/app/editor/_components/structuralEdit/previewSettleBridge.ts`
- `src/app/editor/_components/structuralEdit/previewSettleShellAdapter.ts`
- `src/app/editor/_components/wysiwygDraftRuntimeBridge.ts`

## Runtime Boundaries

| Runtime or bridge | Owns | Must not own | Evidence |
|---|---|---|---|
| Structural edit runtime | structural transaction identity, phase, generation, guard metadata, abort/paint lifecycle | document operations, reducer dispatch, pagination, export, persistence | `runtime/structuralEditRuntime.ts`, `structuralEdit/*Bridge*.ts`, `runtime/__tests__/structuralEditRuntime.test.ts` |
| Panel deferral runtime | panel snapshot/release lifecycle, stale generation checks, input quiet decisions | React rendering, rail content derivation, document mutation | `runtime/panelDeferralRuntime.ts`, `structuralEdit/panelDeferralBridge.ts`, `runtime/__tests__/panelDeferralRuntime.test.ts` |
| Preview settle runtime | request identity, generation, stale/cancel/supersede decisions, active inline checks, draft freshness decisions | preview document construction, pagination output production, reducer dispatch, final output commits | `runtime/previewSettleRuntime.ts`, `structuralEdit/previewSettleBridge.ts`, `runtime/__tests__/previewSettleRuntime.test.ts` |
| Preview settle Shell adapter | callback-only execution of already-created preview/draft mutation plans | guard decisions, validation, pagination, React ownership, renderer/export behavior | `structuralEdit/previewSettleShellAdapter.ts`, `structuralEdit/__tests__/previewSettleShellAdapter.test.ts` |
| WYSIWYG draft runtime | draft session identity, metadata, composition state, commit/abort markers | text measurement, authored document mutation, reducer history, pagination | `runtime/wysiwygDraftRuntime.ts`, `wysiwygDraftRuntimeBridge.ts`, `runtime/__tests__/wysiwygDraftRuntime.test.ts` |
| Canvas viewport runtime | page visibility/window decisions and viewport-scoped render metadata | document layout, pagination semantics, page-break policy | `runtime/canvasViewportRuntime.ts`, `canvasViewportBridge.ts`, `runtime/__tests__/canvasViewportRuntime.test.ts` |
| Editor performance runtime | trace-gated metric aggregation and diagnostic counters | production behavior decisions, document state, export/layout semantics | `runtime/editorPerformanceRuntime.ts`, `runtime/__tests__/editorPerformanceRuntime.test.ts` |

## Preview Settle Output Lanes

Tasks 38-42 moved the active preview-settle output lanes behind callback-only
Shell executors:

- precomputed browser preview:
  `applyPrecomputedBrowserPreviewShellMutation`
- partial worker browser preview:
  `applyPartialWorkerBrowserPreviewShellMutation`
- visual-only browser preview:
  `applyVisualOnlyBrowserPreviewShellMutation`
- final paginated browser output:
  `applyPaginatedOutputBrowserPreviewShellMutation`
- draft pagination output:
  `applyDraftPreviewShellMutation`

These executors consume plans that already exist. They may call Shell-provided
callbacks, but they must not decide freshness, build preview documents, run
pagination, validate output, dispatch reducer actions on their own, or change
renderer/export/persistence ownership.

## Invariants

- Runtime code may coordinate editor behavior; it must not become a second
  document model.
- `DocumentNode` remains authored data only.
- `PaginatedDocument` remains the renderer-facing layout output.
- Browser preview remains editor-only and optimistic until server/API
  pagination confirms final layout.
- Reducer/history semantics stay in the editor shell/controller layer unless a
  separate accepted design moves them.
- Validation must happen before output is treated as fresh.
- Generation, active-inline-node, and draft-version guards must remain visible
  and testable when output lanes move.
- Callback executors must preserve the previous mutation order for their lane.
- Diagnostics may observe behavior; they must not decide behavior.

## Current Open Boundary

The output lanes are safer than before because each lane has an executor and
focused tests, but output commits are still Shell-owned. The next larger move
needs a design gate before any runtime or coordinator owns paginated/draft
output commits.

The next design should answer:

1. Which state can move without changing reducer/history semantics?
2. Which callbacks can become runtime/coordinator-owned without hiding guard
   decisions?
3. How will stale generation, active inline node, draft version, and validation
   checks remain auditable?
4. Which focused tests prove the mutation order and no-op/ignore paths?
5. Which browser smoke proves typing, IME, structural Enter/Backspace, and page
   relocation still behave the same?

## Minimal Patch Rule

Before moving more runtime ownership:

- inspect the files in `Current Model`
- identify the exact lane being moved
- keep all non-lane behavior out of scope
- add or update focused tests for the moved boundary
- run `npm.cmd run type-check`
- run the relevant runtime/adapter tests
- run WYSIWYG/editor smoke when structural editing, typing, or page relocation
  can be affected

## What Not To Do

- No big rewrite of `EditorShell`.
- No moving core pagination into frontend runtime modules.
- No changing export, persistence, package, or FlowTable behavior from runtime
  cleanup.
- No treating browser partial preview as export-ready or history-ready state.
- No converting diagnostic trace fields into behavior rules.
- No broad prop-drilling cleanup unless it is required by a narrow runtime
  boundary move.

## Verification Matrix

Use focused checks based on the touched lane:

- `src/app/editor/_components/runtime/__tests__/structuralEditRuntime.test.ts`
- `src/app/editor/_components/runtime/__tests__/panelDeferralRuntime.test.ts`
- `src/app/editor/_components/runtime/__tests__/previewSettleRuntime.test.ts`
- `src/app/editor/_components/runtime/__tests__/wysiwygDraftRuntime.test.ts`
- `src/app/editor/_components/runtime/__tests__/canvasViewportRuntime.test.ts`
- `src/app/editor/_components/runtime/__tests__/editorPerformanceRuntime.test.ts`
- `src/app/editor/_components/structuralEdit/__tests__/previewSettleBridge.test.ts`
- `src/app/editor/_components/structuralEdit/__tests__/previewSettleShellAdapter.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`

For risky structural or WYSIWYG movement, also use the smoothness/browser smoke
paths documented in `docs/BROWSER_SMOKE_CHECKLIST.md` and
`docs/WYSIWYG_SMOOTHNESS_PROBE.md`.
