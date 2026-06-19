# Editor Operation Architecture

Status: Design contract for the operation-first editor migration.

Use this document before changing editor mutation, render invalidation,
preview-settle behavior, history, or long-document interaction performance.
The target is not a new editor rewrite. The target is to move editor changes
from reducer-first dispatch toward an operation-first pipeline that can keep
typing, node add/remove, table edits, undo/redo, and preview reconciliation
stable on large documents.

## Problem Statement

FlowDocEditor already has strong runtime pieces: `DocumentNode` remains the
authored model, `PaginatedDocument` remains layout truth, preview settle has
generation/stale-result guards, and render invalidation has action lanes.
However, the main mutation path is still uneven.

Current evidence:

- `src/app/editor/_components/operations/editorOperationTypes.ts` defines
  `EditorOperationEnvelope`, but its Phase 1 guarantee is lossless wrapping of
  the existing `EditorAction`.
- `src/app/editor/_components/operations/editorOperationFromAction.ts` says the
  mapper bridges the legacy reducer architecture to the new operation
  architecture.
- `src/app/editor/_components/operations/editorRenderInvalidation.ts` already
  resolves operation scope into render invalidation lanes and page scopes.
- `src/app/editor/_components/editorReducer.ts` still owns most document
  mutation commits, history pushes, full normalize/assert, selection side
  effects, and some paginated snapshot adoption.
- `src/app/editor/_components/runtime/previewSettleRuntime.ts` owns stale,
  cancel, and supersede decisions for optimistic preview reconciliation.

The architectural risk is that operations are currently metadata around a
legacy dispatch, not the primary unit of mutation, validation, history,
render scope, and diagnostics. That makes long-document stability depend on
per-action special cases.

## Current Model

The common runtime path is:

```text
UI event
  -> EditorAction
  -> reducer
  -> core operation / direct document helper
  -> pushDoc or pushPrevalidatedDoc
  -> history/paginated/selection side effects
  -> Shell effects schedule preview settle and pagination
  -> render invalidation metadata may guide Canvas for one render
```

This model is valid as the current implementation, but it should not be treated
as the final architecture.

Observed strengths:

- Core document operations remain pure and validity-preserving.
- Preview settle can ignore stale results when document version, structural
  generation, active inline node, or draft version no longer matches.
- Render invalidation can distinguish `visual-only`, `node-layout`,
  `table-layout`, `from-index-structure`, and `document-layout` lanes.
- Split/merge already have an optimistic structural path that can use
  prevalidated documents in narrow cases.

Observed weaknesses:

- The reducer is a mutation router, validation runner, history writer, and
  state side-effect owner at the same time.
- Validation policy is implicit. Most paths run full `normalizeDocument` and
  `assertDocument`; only selected structural paths can skip full validation
  after shell prevalidation.
- Mutation paths are not symmetric. Split/merge have a stronger operation
  preparation path than delete, duplicate, reorder, and table add/remove.
- Operation metadata is derived after the user action already exists, so the
  system cannot yet reject, defer, prevalidate, or budget the operation before
  reducer commit.
- Performance gates are not tied to operation kind. A pass/fail result can say
  a smoke passed, but not which operation budget was exceeded.

## Target Pipeline

Every meaningful editor mutation should converge on this pipeline:

```text
User intent
  -> Operation envelope
  -> Operation plan
  -> Core mutation
  -> Validation policy
  -> History policy
  -> Render invalidation plan
  -> Preview settle plan
  -> Commit adapter
  -> Full reconciliation
  -> Diagnostics and stability gates
```

The reducer should become a commit adapter for already-planned operations, not
the place where each action invents its own mutation, validation, history, and
preview behavior.

## Operation Contract

An operation must answer these questions before document state changes:

| Field | Purpose |
|---|---|
| `kind` | Semantic operation such as `text.draft`, `text.commit`, `node.props.patch`, `field.patch`, `node.delete`, `node.duplicate`, `node.reorder`, `drag.placement`, `flow-row.structure.patch`, `flow-row.layout.patch`, `paragraph.split`, `style.patch`, `document.settings.patch`, or `table.structure.patch`. |
| `source` | UI or automation source that produced the intent. |
| `targetNodeIds` | Authored nodes directly affected by the intent. |
| `layoutScope` | None, node, block, table, from-index, or document. |
| `urgency` | Sync interaction, urgent structural edit, deferred preview, or background reconciliation. |
| `coreMutation` | Pure document operation to run, or explicit no-op reason. |
| `validationPolicy` | Full, prevalidated, scoped, or read-only validation. |
| `historyPolicy` | Session undo/redo snapshot policy: none, single intentional entry, merge with active session, or replace matching pending entry. Durable operation history is a separate future layer that must be fed by the same operation intent. |
| `renderInvalidation` | Lane, affected pages, and fallback when pages are unknown. |
| `previewSettle` | Whether to schedule, supersede, ignore, or wait for preview reconciliation. |
| `focusPolicy` | Whether selection/caret/refocus should move, remain, or wait for settle. |
| `failurePolicy` | Rollback behavior, user-facing error, and diagnostic event. |
| `diagnostics` | Performance labels and gate fields to compare across stress runs. |

The operation contract is editor-runtime metadata. It must not be persisted
into `DocumentNode`, a FlowDoc package, PDF, or DOCX output.

## Ownership Rules

| Layer | Owns | Must not own |
|---|---|---|
| Core operation | Pure authored document mutation and local validity-preserving helpers. | React state, history UI, focus, preview settle, or export readiness. |
| Editor operation | User intent, scope, validation policy, history policy, urgency, render invalidation, preview-settle routing, diagnostics. | A second document model or independent layout truth. |
| Reducer commit adapter | Applying an accepted operation result into editor state. | Deciding semantic validity or hidden operation-specific behavior. |
| Pagination | Producing authoritative `PaginatedDocument` geometry and split metadata. | Editor interaction state or operation history. |
| Preview settle | Request identity, generation checks, stale/cancel/supersede decisions. | Document mutation or export truth. |
| Render | Displaying `PaginatedDocument` and editor-only overlays. | Recomputing layout rules or committing document changes. |
| Session history | User-visible undo/redo entries for intentional authored edits. | Preview-only, stale, partial layout state, or durable audit semantics. |
| Durable operation history | Future operation timeline, audit/replay metadata, intent lineage, and migration/debug evidence. | Browser preview truth, export output, or `DocumentGraphIndex` persistence. |

## Validation Policy

Validation should become explicit per operation:

- `full`: run `normalizeDocument` and `assertDocument`. Use for imports,
  document-wide changes, unknown scopes, and fallback paths.
- `prevalidated`: accept a document only when a prior operation plan proves the
  required invariants and carries enough evidence for the reducer commit.
- `scoped`: planned target state for operations with known parent/child/table
  boundaries. This must still preserve the same invariants as `assertDocument`
  for the touched subtree and its ancestors.
  Current implementation status: scoped validation is an explicit operation
  contract with a full-document validation fallback. It does not yet replace
  `assertDocument` with a subtree-only assertion.
- `read-only`: selection, hover, preview-only, and diagnostics must not mutate
  authored document data or history.

No operation may bypass authoritative validation at API/export boundaries.
Server pagination and export still call core assertions.

Scoped validation deferral, recorded 2026-06-19:

- `commitEditorOperationResult(...)` treats only `validationPolicy:
  "prevalidated"` as a non-`pushDoc(...)` document commit. Successful document
  commits with `validationPolicy: "scoped"` still route through `pushDoc(...)`,
  which runs full normalize/assert validation.
- This is intentionally deferred rather than counted as an implemented scoped
  validator. The scoped policy is currently diagnostic and planning metadata;
  the safety behavior remains full-document validation.
- Real subtree/table scoped validation should be implemented in a separate lane
  only after the v2 graph runtime, fixture breadth, and authoring-path
  retirement gates are stable.

## History And Timeline Policy

History must be owned by operation semantics, not by whichever reducer branch
was reached.

This project uses two history layers:

- Session history: the current in-memory `past` / `future` snapshot behavior for
  undo and redo.
- Durable operation history: the future operation timeline for audit, replay,
  debugging, migration, collaboration, and version review.

The current `historyPolicy` implementation controls session history only. It is
not the durable operation history itself. Operation envelopes and operation
results must still preserve enough semantic evidence for that future durable
history layer: operation kind, source, target ids, graph source/context,
graph decision outcome, validation outcome, history policy outcome, and
failure/no-op reason.

Rules:

- One intentional inline edit session creates at most one history entry.
- Draft typing must not flood history.
- Structural operations such as delete, duplicate, reorder, split, merge, and
  table structure edits must either create one history entry or declare a
  no-history reason.
- Undo/redo must restore document data and the matching paginated snapshot.
- Stale preview results and partial preview layouts must never enter history.
- Durable operation history must record semantic intent/result, not transient
  browser preview geometry or a persisted `DocumentGraphIndex`.
- Graph-backed planning decisions such as allow, deny, or unresolved graph must
  be diagnostics on the operation result so a future durable history layer can
  explain why an operation committed, no-oped, or failed.
- Shared graph-backed planning utilities should be reused across operation
  groups so durable history sees the same decision vocabulary instead of
  node-family-specific diagnostics.

## Stability Budget

Every operation that can run on a long document must declare how it expects to
stay responsive:

- Immediate typing lanes must not trigger full browser preview pagination.
- Structural operations must report reducer, validation, preview settle, and
  render commit timings by operation kind.
- `from-index-structure` operations may conservatively invalidate from the
  first affected page forward, but they must still avoid unrelated panel,
  outline, and full-canvas churn where possible.
- Table operations must identify the table root and descendants as the minimum
  affected scope, with fallback to broader scope when geometry is unknown.
- Unknown page scope is acceptable for safety, but it is not a performance
  success. It must be logged as an operation follow-up.

Concrete thresholds live in `docs/EDITOR_STABILITY_GATES.md`.

## Migration Plan

### Phase 0: Baseline and Gates

- Keep existing behavior.
- Add or update stress gates before moving a mutation path.
- Ensure each changed operation has a fixture-driven browser smoke or probe.

### Phase 1: Operation Plan Coverage

- Expand `EditorOperationKind` so `node.duplicate`, `node.reorder`,
  `flow-row.structure.patch`, table row/column add/remove, drag placement, and
  document-wide settings are not hidden behind broad buckets.
- Add operation diagnostics for reducer path, validation policy, history policy,
  and render invalidation.
- Keep reducer behavior identical while collecting evidence.

Current implementation status:

- Operation kind coverage now includes `document.settings.patch`,
  `drag.placement`, `field.patch`, `flow-row.layout.patch`,
  `node.props.patch`, `text.draft`, `text.commit`, `node.delete`,
  `node.duplicate`, `node.reorder`, `flow-row.structure.patch`,
  `list.structure.patch`, `style.patch`, and `table.structure.patch`.
- Remaining direct reducer document mutations no longer call `pushDoc(...)`
  directly from `editorReducer.ts`; they commit through
  `commitEditorOperationResult(...)`.
- Runtime dispatch has started moving to operation-first. `EditorShell.tsx`
  now creates an `EditorOperationEnvelope` before reducer dispatch,
  `editorReducer.ts` exposes `reduceEditorOperation(...)`, and render
  invalidation reuses the pending operation envelope instead of rebuilding one
  from the action.
- Prepared split/merge structural plans now dispatch their operation envelopes
  directly for the structural mutation step. Legacy `SET_PAGINATED` adoption is
  still explicit until pagination adoption has its own operation contract.
- `node.delete`, `node.duplicate`, and `node.reorder` now have node operation
  result helpers. Runtime `reduceEditorOperation(...)` routes these operation
  kinds before falling back to legacy action reduction, while legacy reducer
  branches call the same helpers as commit adapters.
- This does not yet complete source-of-truth migration. The reducer switch still
  delegates through the preserved legacy action for remaining operation groups,
  and operation plans do not yet own semantic validation/history/failure policy
  for each mutation group.
- The active phase ledger for this lane lives in
  `docs/EDITOR_OPERATION_SOURCE_OF_TRUTH_PLAN.md`.

### Phase 2: Pilot a Non-Typing Mutation

Recommended pilot: `node.delete` or `node.duplicate`.

Reason:

- The UI surface is narrow.
- The current reducer path is easy to compare against.
- The operation affects document structure, history, preview settle, selection,
  and render invalidation without requiring a WYSIWYG typing rewrite.

Acceptance:

- Existing unit tests remain green.
- New stress mutation smoke covers the operation on
  `public/mock/flowdoc-stress-mock.flowdoc.json`.
- The operation declares validation, history, render invalidation, preview
  settle, and focus policies before reducer commit.

### Phase 3: Table Structure Mutations

- Move table row/column add/remove and fit-to-width behind explicit operation
  plans.
- Preserve current core table operation invariants and table pagination
  contracts.
- Add stress coverage for table mutation on a long document fixture.

### Phase 4: Reorder and Drag Placement

- Move outline reorder and canvas drag placement into operation plans.
- Preserve list hierarchy guards, active draft finalization, and undo/redo
  semantics.
- Keep outline virtualization as an editor-render concern, not document data.

### Phase 5: Reducer as Commit Adapter

- Reducer branches should accept operation results and apply state changes.
- Operation plans should own semantic branching, validation policy, history
  policy, and failure policy.
- Direct UI-to-reducer mutation should become a legacy path only.

## Non-Goals

- Do not replace `DocumentNode`.
- Do not persist operations in FlowDoc packages.
- Do not move export truth into the browser preview.
- Do not rewrite pagination, renderers, WYSIWYG, and reducer in one change.
- Do not wrap every keypress in a heavy operation. Active typing keeps its
  specialized draft/input lane; operations own commit and structural keys.

## Review Checklist

Before accepting an operation migration patch, verify:

- PASS: operation kind and target scope are explicit.
- PASS: validation policy is declared and tested.
- PASS: history policy is declared and tested.
- PASS: render invalidation lane and affected-page rule are declared.
- PASS: preview settle ownership is declared.
- PASS: export and persisted document schema ownership did not move.
- RISK: any unknown page scope, full-document fallback, or full validation on a
  long-document immediate lane is documented.
- UNKNOWN: any mutation path without stress fixture evidence is marked as not
  covered.

## Related Docs

- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/EDITOR_REDUCER_RESPONSIBILITY_AUDIT.md`
- `docs/EDITOR_RENDER_ACTION_OWNERSHIP.md`
- `docs/EDITOR_STABILITY_GATES.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md`
- `docs/TEST_STRATEGY.md`
