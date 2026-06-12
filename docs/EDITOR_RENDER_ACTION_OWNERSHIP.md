# Editor Render Action Ownership

Status: Current contract for the render/action separation milestone.

This document is the ownership map and render invalidation contract for editor
actions. It does not move runtime behavior by itself. Its job is to make every
important action answer two questions before future patches change execution:

1. Which layer owns this work?
2. How wide is the render/layout invalidation?

## Ownership Map

| Area | Owns | Must not own | Current evidence |
|---|---|---|---|
| Core operation | Pure authored document mutations and validity-preserving node/tree operations. | React state, focus, history UI, preview scheduling, or export readiness. | `packages/core/src/document/operations.ts`; `docs/ENGINEERING_PRINCIPLES.md` sections 1 and 5 |
| Editor operation | Runtime orchestration around user intent: action kind, scope, urgency, optimistic permission, invalidation lane, and handoff to existing reducer/runtime lanes. | A second document model, persisted operation state, or independent layout truth. | `src/app/editor/_components/operations/editorOperationTypes.ts`; `src/app/editor/_components/operations/editorRenderInvalidation.ts`; `docs/EDITOR_OPERATION_ARCHITECTURE.md` |
| Pagination | Authoritative layout output in `PaginatedDocument`, including page fragments, geometry, continuations, and warnings. | Editor interaction state, history, persistence, PDF/DOCX rendering decisions, or React render ownership. | `packages/core/src/pagination/types.ts`; `docs/ENGINEERING_PRINCIPLES.md` section 8 |
| Render | Displaying `PaginatedDocument` plus editor-only interaction overlays and draft surfaces. | Recomputing document layout rules or treating browser preview as export truth. | `src/app/editor/_components/EditorCanvas.tsx`; `docs/ENGINEERING_PRINCIPLES.md` section 9 |
| History | User-visible undo/redo entries for authored document edits and intentional edit sessions. | Preview-only state, fill preview state, or stale browser pagination output. | `src/app/editor/_components/editorReducer.ts`; `docs/agent/REVIEW_GATE.md` Undo/Redo Failure |
| Preview settle | Request identity, generation, stale/cancel/supersede decisions, and optimistic browser preview reconciliation. | Authoritative export layout, reducer ownership, or direct document mutation. | `src/app/editor/_components/runtime/previewSettleRuntime.ts`; `docs/FRONTEND_RUNTIME_ARCHITECTURE.md` |

## Invalidation Lanes

| Lane | Meaning | Pagination invalidated? | Render scope |
|---|---|---:|---|
| `no-render` | Action does not change authored document layout or visible editor selection. | No | None |
| `selection-only` | Selection or interaction state only. | No | Interaction overlay/chrome only |
| `visual-only` | Authored visual paint change that does not alter layout geometry. | No, but may reconcile in background | Affected node fragments |
| `node-layout` | Text, props, or style can change a single node's measured layout. | Yes | Affected node pages until pagination settles |
| `block-layout` | Block box metrics such as padding/border can change surrounding flow. | Yes | Affected block pages until pagination settles |
| `table-layout` | Table structure or grid geometry can change table layout. | Yes | Affected table pages until pagination settles |
| `from-index-structure` | Body order, insertion, split, merge, list structural changes, or deletion can affect downstream flow. | Yes | From the first affected page forward |
| `document-layout` | Document-wide settings, load, undo, redo, margins, or reserved zones can affect the whole layout. | Yes | Whole document |

## Current Low-Risk Lane Hook

The `visual-only` browser preview fast lane now accepts
`EditorRenderInvalidationPlan` as a guard before patching current fragments. The
guard is intentionally redundant with the existing action classification so that
the first runtime hook remains behavior-preserving:

- classification must still be `uiImpact: "visual"` and `layoutScope: "none"`;
- the invalidation plan must allow `mayUseVisualFastLane`;
- the invalidation plan must not invalidate pagination;
- shell mutation order remains owned by the preview settle Shell adapter.

Current evidence:

- `src/app/editor/_components/editorVisualOnlyPagination.ts`
- `src/app/editor/_components/shell/useEditorPaginationLifecycleController.ts`
- `src/app/editor/_components/__tests__/editorVisualOnlyPagination.test.ts`
- `src/app/editor/_components/operations/__tests__/editorRenderInvalidation.test.ts`

## Page Render Churn Boundary

Page memoization keeps structural equality and paint equality separate:

- structural equality ignores paint-only metadata so layout churn remains
  suppressed for unchanged geometry;
- paint equality checks renderer-facing fragment paint data so visual-only
  changes repaint the affected page;
- the visual-only fast lane clones only pages that contain affected paragraph
  fragments, leaving unrelated page objects stable.
- when preview/paginated output is applied with an affected-page invalidation
  plan, the Shell exposes that plan to `EditorCanvas` for one render so page
  memoization can skip paint comparison on pages outside the action scope.
  The plan remains editor-runtime metadata and is cleared after the render.
- autosave persistence remains owned by the Shell hook, but the Saving/Saved
  status chrome is exposed through a bottom-bar subscription store so status
  flips do not require `EditorShell` to hold save-status React state.
- canvas-owned WYSIWYG draft visual preview uses the same draft paragraph
  layout cache contract as the draft island/surface paths, so repeated
  same-input preview renders can reuse measurement while still emitting
  `PaginatedDocument`-derived editor visuals.
- draft island measurement trace events include `draftLayoutCacheHit`, allowing
  performance probes to distinguish true measurement misses from cached
  repeated renders before any further cadence changes.

Current evidence:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/FlowdocDraftEditorIslandRoot.tsx`
- `src/app/editor/_components/shell/editorAutosaveStatusStore.ts`
- `src/app/editor/_components/shell/useEditorPaginationLifecycleController.ts`
- `src/app/editor/_components/shell/useEditorAutosave.ts`
- `src/app/editor/_components/wysiwygDraftParagraphLayout.ts`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `src/app/editor/_components/__tests__/EditorCanvasPageSlot.test.ts`
- `src/app/editor/_components/__tests__/useEditorAutosave.test.ts`
- `src/app/editor/_components/__tests__/editorVisualOnlyPagination.test.ts`

## Contract Rules

- Render invalidation is editor-runtime metadata only. It must not be persisted
  into `DocumentNode` or a FlowDoc package.
- The render layer consumes `PaginatedDocument`; it must not create an
  independent layout truth for export or history.
- `visual-only` may patch currently rendered fragments, but it must keep
  fragment geometry stable and allow authoritative pagination reconciliation.
- `selection-only` must not request pagination or preview settle.
- `from-index-structure` must be conservative when the first affected page is
  unknown.
- `document-layout` invalidates all known pages and must never be narrowed by a
  node id guess.
- AI work, when added later, must submit proposals that compile into the same
  operation and invalidation contract instead of mutating documents directly.

## Acceptance Checks

Before moving runtime behavior to a new render/action lane, the patch must show:

- the action classification and operation scope for the changed action;
- the invalidation lane and affected page rule;
- the owner for document mutation, render output, history, and preview settle;
- focused tests proving the lane mapping;
- a statement that export and persisted document schema ownership did not move.
