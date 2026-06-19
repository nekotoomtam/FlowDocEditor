# Editor Reducer Responsibility Audit

Status: Current audit with Phase 1 through Phase 5 checkpoints for reducing
reducer ownership.

Use this document before moving editor mutations into the operation-first
architecture. It records what `editorReducer.ts` owns today, why that makes
long-document stability harder, and which responsibilities should be extracted
first.

## Verdict

`editorReducer.ts` is currently more than a commit adapter. It is a mixed
mutation router, validation runner, history writer, selection/refocus side
effect owner, pagination snapshot owner, and performance attribution point.

This is workable as the current implementation, but it should not be the final
architecture for long-document editor stability.

## Evidence

Current evidence:

- `src/app/editor/_components/editorReducer.ts` imports core document mutation
  helpers such as `deleteNode`, `duplicateNode`, `reorderBodyChild`, table
  row/column operations, paragraph/list operations, and style operations.
- `src/app/editor/_components/editorReducerCommit.ts` now owns extracted
  document commit helpers.
- `src/app/editor/_components/operations/editorOperationCommit.ts` now defines
  the operation commit result scaffold for validation, history, selection,
  paginated, diagnostics, no-op, state-patch, history-only, scoped validation
  fallback, and failure policies.
- `src/app/editor/_components/operations/editorOperationFromAction.ts` now maps
  `DUPLICATE_NODE`, `REORDER_BODY_CHILD`, `FLOW_ROW_ADD_COL`, and
  `UPDATE_INLINE_TEXT_DRAFT` to explicit operation metadata.
- `DELETE_NODE` and `DUPLICATE_NODE` now build operation commit results before
  final state commit.
- `pushDoc(...)` still runs `normalizeDocument`, `assertDocument`, history
  push, doc replacement, future clearing, and structural attribution.
- `pushPrevalidatedDoc(...)` still writes history and doc state without full
  validation, but only selected structural paths can reach it.
- `setDocWithoutHistory(...)` still normalizes/asserts while intentionally
  skipping history.
- Table row/column add/remove and fit-to-width now build operation commit
  results through `commitTableStructureOperation(...)`.
- `RESIZE_TABLE_COLUMN_PAIR` now builds an operation commit result while
  preserving its optional paginated snapshot adoption.
- Table structure and flow-row add-column commits now declare scoped validation
  intent with a full-document validation fallback.
- `SPLIT_PARAGRAPH` now delegates reducer planning to
  `src/app/editor/_components/operations/editorReducerSplitPlan.ts` while its
  final document commit still uses an operation commit result.
- `MERGE_PARAGRAPH` now delegates reducer planning to
  `src/app/editor/_components/operations/editorReducerMergePlan.ts` while its
  final document commit still uses an operation commit result.
- List structural actions now delegate reducer planning to
  `src/app/editor/_components/operations/editorReducerListPlan.ts`.
- Empty table-cell paragraph deletion now delegates reducer planning to
  `src/app/editor/_components/operations/editorReducerTableCellParagraphPlan.ts`.
- `REORDER_BODY_CHILD` and flow-row add-column now build operation commit
  results.
- `UPDATE_INLINE_TEXT_DRAFT`, `COMMIT_INLINE_TEXT_EDIT`,
  `COMMIT_WYSIWYG_TEXT_EDIT`, and `COMMIT_WYSIWYG_RICH_TEXT_EDIT` now use
  operation commit results or reducer-facing operation commit plans.
- `UNDO`, `REDO`, `LOAD_DOCUMENT`, resize, split, merge, and WYSIWYG commit
  actions can update or adopt `paginated` snapshots.
- `src/app/editor/_components/editorActionClassifier.ts` already classifies
  actions by impact and layout scope, but the reducer does not consume this
  classification as its commit contract.

## Responsibility Map

| Responsibility | Current owner in reducer | Why it is risky |
|---|---|---|
| Core mutation routing | Reducer branches directly call core document operations. | Each branch can invent its own no-op, fallback, and side-effect policy. |
| Validation policy | Commit helper `pushDoc` always does full normalize/assert; `pushPrevalidatedDoc` is a special path. | Validation cost and safety policy are implicit instead of operation-owned. |
| History policy | Commit helpers, commit actions, and undo/redo branches manage history directly. | One-action/one-history assumptions can drift across mutation types. |
| Selection/refocus policy | Many reducer branches set `selectedNodeId`, `selectionAnchorNodeId`, `mergeResult`, `lastSplitNodeId`, or list refocus state. | Focus behavior is mixed with document mutation and hard to compare across operations. |
| Pagination snapshot adoption | Reducer branches accept `afterPaginated`, optional `paginated`, or current snapshots. | Partial, optimistic, or stale layout ownership is harder to reason about. |
| Runtime attribution | Reducer emits WYSIWYG/structural timing attribution for selected paths. | Diagnostics are not uniformly tied to operation kind. |
| Load/init normalization | Initial state and `LOAD_DOCUMENT` normalize reserved zones/base styles and create placeholder pagination. | Import/load lifecycle differs from normal mutation but lives beside it. |

## Action Group Audit

### Interaction-Only State

Examples:

- `DRAG_START`
- `DRAG_MOVE`
- `DRAG_CANCEL`
- `SELECT_NODE`
- `CLEAR_SPLIT_NODE_ID`
- `CLEAR_MERGE_RESULT`
- `CLEAR_LIST_EXIT_NODE_ID`
- `CLEAR_LIST_LEVEL_CHANGE_RESULT`
- `SET_PAGINATED`
- `SET_INLINE_EDIT_HEIGHT`

Current behavior:

- Updates editor-only state, selection, drag preview, result markers, or current
  paginated preview.
- Does not mutate authored document data directly.

Recommended ownership:

- Keep as reducer/editor-state actions for now.
- Long-term, selection and drag state may remain reducer-owned because they are
  not authored document operations.
- `SET_PAGINATED` and `SET_INLINE_EDIT_HEIGHT` should stay clearly marked as
  editor-preview state, not document history.

### Simple Document Mutations Through `pushDoc`

Examples:

- `UPDATE_PROPS`
- `UPDATE_TEXT`
- `UPDATE_PARAGRAPH_TEXT_STYLE`
- `APPLY_PARAGRAPH_STYLE_PRESET`
- `CLEAR_PARAGRAPH_STYLE`
- `DETACH_PARAGRAPH_STYLE`
- `PATCH_PARAGRAPH_STYLE_OVERRIDES`
- `PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX`
- `PATCH_PARAGRAPH_STYLE_DEFINITION`
- `RENAME_PARAGRAPH_STYLE_DEFINITION`
- `RESET_PARAGRAPH_STYLE_OVERRIDES`
- `UPDATE_TEXT_RUN_STYLE_RANGE`
- `UPDATE_FIELD_REF`
- `UPDATE_PARAGRAPH_BOX_STYLE`
- `UPDATE_FLOW_STACK_BOX_STYLE`
- `UPDATE_FLOW_TABLE_CELL_SPAN`

Current behavior:

- Reducer chooses the core operation/helper.
- Some branches also adjust selection.
- Most successful mutations go through `pushDoc(...)`.

Recommended ownership:

- Move operation kind, validation policy, history policy, and render lane into
  operation plans.
- Keep reducer commit small: apply accepted doc, history entry, selection patch,
  and paginated patch.
- Visual-only changes should continue to use render invalidation/preview fast
  lanes where safe.

### No-History Draft Mutation

Example:

- `UPDATE_INLINE_TEXT_DRAFT`

Current behavior:

- Replaces paragraph text through an operation commit result with
  `text.draft` metadata and `historyPolicy: none`.
- The commit adapter still reaches `setDocWithoutHistory(...)`, so it
  normalizes/asserts but does not push history.

Risk:

- This is intentionally outside ordinary history, but still does full document
  validation work. If used in an immediate input path on long documents, it can
  become a responsiveness risk.

Recommended ownership:

- Make draft mutation policy explicit: read-only preview, draft session state,
  commit-only authored mutation, or validated no-history mutation.
- Avoid full-document validation in immediate typing lanes unless a gate proves
  it is safe.

### Inline/WYSIWYG Commit Mutations

Examples:

- `COMMIT_INLINE_TEXT_EDIT`
- `COMMIT_WYSIWYG_TEXT_EDIT`
- `COMMIT_WYSIWYG_RICH_TEXT_EDIT`

Current behavior:

- `COMMIT_INLINE_TEXT_EDIT` delegates no-change detection, history-only commit,
  future clearing, and `afterPaginated` adoption to `editorTextCommitPlans.ts`
  and the operation commit adapter.
- WYSIWYG text/rich commits delegate document preparation and validation to
  `editorTextCommitPlans.ts`, then commit through operation commit results.

Recommended ownership:

- Treat edit commit as a semantic operation: one edit session, one history
  policy, explicit paginated snapshot policy.
- Keep draft typing out of document history.
- Ensure stale preview/paginated outputs cannot become history snapshots.

### Node And Body Structure Mutations

Examples:

- `DRAG_COMMIT`
- `DELETE_NODE`
- `DUPLICATE_NODE`
- `REORDER_BODY_CHILD`
- `FLOW_ROW_ADD_COL`

Current behavior:

- Delete, duplicate, reorder, and flow-row add-column now build operation
  commit results before final state commit.
- Selection/refocus is branch-specific.
- These actions classify as `from-index` structural invalidations, but reducer
  commit now receives explicit operation metadata for the migrated branches.

Risk:

- These operations can affect downstream page flow on long documents.
- Drag placement still has not been migrated to the operation commit path.

Recommended ownership:

- Use these as the first non-typing operation migration candidates.
- Start with `node.delete` or `node.duplicate` because each has a narrow UI
  surface and clear before/after comparison.
- Add stress mutation smoke coverage before claiming PASS.

### Table Structure Mutations

Examples:

- `TABLE_ADD_ROW`
- `TABLE_REMOVE_ROW`
- `TABLE_ADD_COL`
- `TABLE_REMOVE_COL`
- `TABLE_FIT_TO_WIDTH`
- `RESIZE_TABLE_COLUMN_PAIR`

Current behavior:

- Table row/column add/remove and fit-to-width build operation commit results
  before final state commit.
- `RESIZE_TABLE_COLUMN_PAIR` builds an operation commit result and can still
  adopt an optional paginated snapshot.

Risk:

- Table mutations need table-root and descendant scope, not generic full-doc
  behavior.
- Current stress gate has no direct table add/remove smoke on
  `flowdoc-stress-mock.flowdoc.json`.

Recommended ownership:

- Do not start here unless table stability is the target.
- After node mutation pilot, move table operations behind table-specific
  operation plans and table stress coverage.

### Document-Wide Mutations

Examples:

- `UPDATE_MARGIN`
- `UPDATE_RESERVED_ZONES`
- `ENSURE_HEADER_FOOTER_ZONE_VISIBLE`
- `DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY`
- `UPDATE_HEADER_FOOTER_HORIZONTAL_MODE`
- `LOAD_DOCUMENT`

Current behavior:

- Reducer directly updates document-wide settings or load state.
- `LOAD_DOCUMENT` clears history/future/selection/drag and creates or adopts
  pagination.

Recommended ownership:

- Keep document-wide invalidations conservative.
- Do not narrow `document-layout` operations without explicit proof.
- Separate load/import lifecycle from ordinary user mutations in future phases.

### Structural Edit Special Path

Examples:

- `SPLIT_PARAGRAPH`
- `MERGE_PARAGRAPH`
- `DELETE_EMPTY_TABLE_CELL_PARAGRAPH`
- `EXIT_LIST_ITEM`
- `CHANGE_LIST_ITEM_LEVEL`
- `BACKSPACE_LIST_ITEM_AT_START`
- `TOGGLE_LIST_PRESET`

Current behavior:

- Split planning now lives in `editorReducerSplitPlan.ts`: source text
  replacement, list fallback, paragraph fallback, precomputed validation, and
  attribution path selection are outside the reducer branch.
- Merge planning now lives in `editorReducerMergePlan.ts`: source text
  replacement, delete-empty fallback, list fallback, paragraph fallback,
  precomputed validation, refocus marker planning, and attribution path
  selection are outside the reducer branch.
- List structural planning now lives in `editorReducerListPlan.ts`, including
  draft text replacement, operation choice, no-op baseline, and refocus patch
  planning.
- Empty table-cell paragraph delete planning now lives in
  `editorReducerTableCellParagraphPlan.ts`.
- Structural actions now use operation commit results for final document
  commit, history, selection/refocus patch, paginated patch, and diagnostics.

Strength:

- Split/merge already prove that a prevalidated fast path is feasible.

Risk:

- These helpers are reducer-facing operation plans, not yet the final
  operation architecture source of truth.

Recommended ownership:

- Keep the operation commit result path.
- Use the split/merge/list/table-cell helper shape as the reference for future
  operation handlers.
- Do not collapse these helper boundaries back into reducer branches.

## Extraction Direction

The goal is to turn reducer branches from semantic decision makers into commit
adapters.

Target shape:

```text
OperationPlan
  -> coreMutationResult
  -> validationResult
  -> historyPatch
  -> selectionPatch
  -> paginatedPatch
  -> reducerCommit(state, patches)
```

The reducer may still apply state patches, but it should not decide operation
semantics for each action.

## Job Goal And Phase Map

Request to plan trace:

```text
User request: reduce editor reducer responsibility first
  -> Plan: reducer responsibility extraction and operation commit migration
    -> Phase 1: commit helper extraction
    -> Phase 2: operation commit result scaffold
    -> Phase 3: node mutation pilot
    -> Phase 4: table operation plans
    -> Phase 5: structural edit extraction
```

Current position:

- Request: address "Reducer does too many responsibilities" before the other
  editor stability architecture items.
- Plan: reducer responsibility extraction and operation commit migration.
- Phase: reducer responsibility extraction lane is complete for the current
  plan.
- Job item: all listed lane items are complete: structural planning, reorder
  and flow-row migration, stress fixture reducer smoke, draft/no-history
  policy, text commit policy, and scoped validation contract scaffold.
- Status: done for the current plan.
- Why this item is current: the lane now has commit/result coverage for the
  reducer branches identified in this audit.
- Next transition: the mutation-path-equality lane has migrated the remaining
  direct reducer `pushDoc(...)` branches. Choose operation source-of-truth
  migration or real scoped assertion work as a separate next lane.

Parent goal:

- Make editor document mutations stable enough for long documents by reducing
  hidden reducer ownership.
- Move mutation work toward an operation-first pipeline without changing
  document schema, pagination truth, undo/redo semantics, export ownership, or
  active typing behavior.

Current job lane:

- Reducer responsibility extraction and operation commit migration.
- This lane is not the whole operation architecture migration. It is the first
  lane that makes later mutation groups easier to move safely.

Phase map:

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Move commit policy out of the reducer file. | `pushDoc`, `pushPrevalidatedDoc`, `setDocWithoutHistory`, structural attribution, `MAX_HISTORY`. | Helper extraction is behavior-preserving and reducer tests still pass. | Done | `src/app/editor/_components/editorReducerCommit.ts`; focused reducer/operation tests passed. |
| 2 | Define the operation commit result contract. | Validation, history, selection, paginated, diagnostics, no-op, and failure fields. | Contract is typed and tested without migrating broad reducer branches. | Done | `src/app/editor/_components/operations/editorOperationCommit.ts`; operation commit tests passed. |
| 3 | Prove the commit contract on narrow node mutations. | `DELETE_NODE`, `DUPLICATE_NODE`, and duplicate operation metadata. | Each branch preserves no-op/success behavior, history, and selection semantics. | Done | `editorReducer.ts`; `editorReducerNodeMutation.test.ts`; stress lifecycle passed for delete/undo. |
| 4 | Move table mutations behind table operation plans. | Row/column add/remove, fit-to-width, and column-pair resize. | Existing table behavior is preserved while table validation/history/render scope is explicit. | Done | Table actions moved to operation commit results; `editorReducerTableMutation.test.ts`; focused app tests and core operations test passed. |
| 5 | Extract structural paragraph/list planning. | Split, merge, list exit/level/backspace, empty table-cell paragraph delete, and related refocus paths. | Reducer no longer owns structural planning details for this group; prevalidated path remains safe. | Done | Split, merge, list, and empty table-cell paragraph delete planning now live in reducer-facing operation plan helpers; focused app tests, app gate, and core operations tests passed. |

Status terms:

- `Done`: implemented and locally verified for this lane.
- `In progress`: at least one job item in this phase is implemented, but the
  phase still has required open branches.
- `Next`: first not-yet-done phase that should be attempted when this lane
  continues.
- `Pending`: intentionally deferred until earlier phases prove the contract.

## Why Phase 5 Was Current

Phase 5 became current because:

- Phase 1 extracted commit helpers without changing reducer behavior.
- Phase 2 added an operation commit result scaffold and tests.
- Phase 3 moved the first symmetric node mutation pair,
  `DELETE_NODE` and `DUPLICATE_NODE`, to that commit result path.
- Phase 4 moved table structure actions onto operation commit results while
  preserving table reducer behavior and the column-resize paginated patch.
- The next large reducer-owned semantic group is structural paragraph/list
  editing: split, merge, list exit, list level change, backspace-at-start, and
  empty table-cell paragraph deletion.

Phase 5 is complete for this reducer responsibility lane. Structural commit
migration is done, and split, merge, list, and empty table-cell paragraph delete
planning have moved out of the reducer.

## What Is Done Versus Still Open

Done in this lane:

- Commit helper extraction.
- Operation commit result scaffold.
- Explicit `node.duplicate` operation metadata.
- `DELETE_NODE` operation commit pilot.
- `DUPLICATE_NODE` operation commit pilot.
- Table operation commit migration for row/column add/remove, fit-to-width, and
  column-pair resize.
- Structural operation commit migration for split, merge, empty table-cell
  paragraph delete, list exit, list level change, backspace-at-start, and list
  preset toggle.
- `SPLIT_PARAGRAPH` reducer planning extraction into
  `editorReducerSplitPlan.ts`.
- `MERGE_PARAGRAPH` reducer planning extraction into
  `editorReducerMergePlan.ts`.
- List structural reducer planning extraction into `editorReducerListPlan.ts`.
- Empty table-cell paragraph delete reducer planning extraction into
  `editorReducerTableCellParagraphPlan.ts`.
- `REORDER_BODY_CHILD` and `FLOW_ROW_ADD_COL` operation commit migration.
- Direct stress fixture reducer smoke for duplicate and flow-row add-column
  with undo restore on `public/mock/flowdoc-stress-mock.flowdoc.json`.
- Draft/no-history policy extraction through `text.draft` operation metadata.
- Inline and WYSIWYG text commit policy extraction through reducer-facing text
  commit plans and operation commit state-patch/history-only results.
- Scoped validation contract scaffold for table and flow-row operations, with
  full-document validation fallback.
- Explicit `list.structure.patch` operation metadata.
- Focused type-check, app tests, and core operations test for the changed
  paths.
- Stress lifecycle smoke covering the existing delete/undo stress path.

Still open in this lane:

- No required item remains open in the reducer responsibility extraction lane.
- True subtree/table scoped assertion is not implemented; the current scoped
  validation contract intentionally falls back to full-document validation.
- The follow-up mutation-path-equality lane removed direct `pushDoc(...)`
  branches from `editorReducer.ts`; `pushDoc(...)` remains in the commit helper
  and is reached through operation commit results.
- Operation source-of-truth migration is still open; the reducer still switches
  on `EditorAction` and applies operation commit results branch by branch.

## Recommended Phases

### Phase 1: Commit Helper Extraction

Implemented as a behavior-preserving extraction.

`src/app/editor/_components/editorReducerCommit.ts` now contains:

- `MAX_HISTORY`
- `StructuralReducerAttribution`
- `finishStructuralReducerAttribution(...)`
- `pushDoc(...)`
- `pushPrevalidatedDoc(...)`
- `setDocWithoutHistory(...)`

`src/app/editor/_components/editorReducer.ts` now imports those helpers and
still exposes the reducer and state contracts used by existing tests.

Acceptance:

- PASS: `editorReducer.ts` still exposes the same reducer behavior.
- PASS: Existing focused reducer/operation tests pass.
- PASS: No operation semantics changed.

Reason:

- This reduces reducer surface area while preserving the current model.
- It creates a stable seam for operation plans to target later.

### Phase 2: Operation Result Type

Implemented as a behavior-preserving scaffold.

`src/app/editor/_components/operations/editorOperationCommit.ts` introduces an
operation result/commit patch contract for document mutations:

- `nextDoc`
- `validationPolicy`
- `historyPolicy`
- `selectionPatch`
- `paginatedPatch`
- `diagnostics`
- `noopReason`
- `failure`

Acceptance:

- PASS: No reducer branch is migrated yet.
- PASS: The type is backed by tests around commit behavior.
- PASS: No-history document commits remain full-validation only because the
  current commit helper does not support prevalidated no-history commits.

### Phase 3: Pilot `node.delete` Or `node.duplicate`

First pilot implemented: `node.delete`.

Current `DELETE_NODE` branch behavior:

- no-op delete returns the original state through a no-op commit result;
- successful delete uses full validation;
- successful delete creates one history entry;
- successful delete clears `selectedNodeId` and `selectionAnchorNodeId`;
- reducer tests cover no-op and successful commit behavior.

Why:

- Current behavior is small and easy to compare.
- It exercises mutation, validation, history, selection clearing, render
  invalidation, preview settle, undo, and redo.
- Stress lifecycle already covers delete/undo on the stress fixture.

Second pilot implemented: `node.duplicate`.

Current `DUPLICATE_NODE` branch behavior:

- no-op duplicate returns the original state through a no-op commit result;
- successful duplicate uses full validation;
- successful duplicate creates one history entry;
- successful duplicate selects the duplicated node;
- reducer tests cover no-op and successful commit behavior.

Why:

- It exercises mutation, validation, history, selection to new node, and
  unknown stress coverage.
- It should force the missing add/duplicate stress smoke to be written.

### Phase 4: Table Operation Plans

Move row/column add/remove and fit-to-width into table-specific operation
plans after node mutation proves the commit contract.

### Phase 5: Structural Edit Extraction

Move split/merge/list structural planning out of reducer branches once the
operation result and commit adapter are proven.

## Non-Goals

- Do not remove the reducer in one pass.
- Do not rewrite WYSIWYG active typing as operation-per-key.
- Do not weaken `assertDocument` or server/export validation.
- Do not narrow document-layout invalidation without evidence.
- Do not change persisted FlowDoc package or document schema for this work.

## Current PASS / RISK / UNKNOWN

PASS:

- Current reducer has centralized full validation through `pushDoc(...)`.
- Phase 1 extracted commit helpers into `editorReducerCommit.ts` without
  changing reducer action branches.
- Phase 2 added `EditorOperationCommitResult` and
  `commitEditorOperationResult(...)` without moving reducer action branches.
- `DUPLICATE_NODE` now has explicit `node.duplicate` operation metadata.
- Phase 3 moved `DELETE_NODE` onto `commitEditorOperationResult(...)` with
  reducer tests for no-op and success behavior.
- Phase 3 also moved `DUPLICATE_NODE` onto
  `commitEditorOperationResult(...)` with reducer tests for no-op and success
  behavior.
- Phase 4 moved table row/column add/remove and fit-to-width onto
  `commitTableStructureOperation(...)` with reducer tests for no-op and success
  behavior.
- Phase 4 moved `RESIZE_TABLE_COLUMN_PAIR` onto
  `commitEditorOperationResult(...)` while preserving optional paginated
  snapshot adoption.
- Phase 5 moved structural actions onto operation commit results while
  preserving split/merge prevalidated attribution tests.
- Phase 5 extracted `SPLIT_PARAGRAPH` reducer planning into
  `editorReducerSplitPlan.ts` while keeping history, paginated patch,
  `lastSplitNodeId`, and prevalidated attribution behavior covered by tests.
- Phase 5 extracted `MERGE_PARAGRAPH` reducer planning into
  `editorReducerMergePlan.ts` while keeping delete-empty fallback, list merge
  fallback, paragraph merge fallback, `mergeResult`, and prevalidated
  attribution behavior covered by tests.
- Phase 5 extracted list structural reducer planning into
  `editorReducerListPlan.ts`.
- Phase 5 extracted empty table-cell paragraph delete reducer planning into
  `editorReducerTableCellParagraphPlan.ts`.
- `EXIT_LIST_ITEM`, `CHANGE_LIST_ITEM_LEVEL`,
  `BACKSPACE_LIST_ITEM_AT_START`, and `TOGGLE_LIST_PRESET` now have explicit
  `list.structure.patch` operation metadata.
- Core document operations tests still pass after the structural reducer
  planning extraction.
- Stress lifecycle passed on `public/mock/flowdoc-stress-mock.flowdoc.json`
  after the node mutation pilot, including delete/undo return to full layout.
- Split/merge have a working prevalidated fast-path pattern.
- Action classification and render invalidation already exist outside the
  reducer.
- The mutation-path-equality follow-up lane moved remaining style, text, field,
  drag, resize, table-cell-span, and document settings branches to
  `commitEditorOperationResult(...)`.
- `editorReducer.ts` no longer has direct `pushDoc(...)` branches after that
  lane's Phase 5 inventory.
- The lane added operation metadata for `document.settings.patch`,
  `drag.placement`, `field.patch`, `flow-row.layout.patch`, and
  `node.props.patch`.
- Focused app gate passed with operation, reducer, runtime, and text commit
  coverage after the mutation-path-equality lane.

RISK:

- Reducer is still the semantic router because `EditorAction` remains the
  switch input; operations are not yet the source-of-truth dispatch contract.
- Full validation remains the conservative default for many migrated branches,
  though the policy is now declared in operation commit results.
- Draft/no-history mutation still normalizes/asserts through the commit helper;
  the policy is explicit, but the validation cost is unchanged.
- Paginated snapshot adoption is still branch-specific for operations that
  receive optional paginated results.

UNKNOWN:

- Browser-level add/duplicate stress behavior is not covered by the current
  browser smoke; reducer-level stress fixture coverage exists.
- True scoped validation for subtree/table operations is not implemented.

## Next Job Item

The reducer responsibility extraction lane is complete for the current plan.

Recommended next lane:

1. Move operation architecture from bridge metadata toward source-of-truth
   operation plans.
2. Replace scoped validation fallback with a real subtree/table scoped
   assertion only after proving it preserves every `assertDocument(...)`
   invariant for touched scope, ancestors, and cross-document references.
3. Add browser-level add/duplicate/reorder stress smoke when UI stability, not
   reducer contract, is the target.

The reducer now has a shared commit path and reducer-facing operation plans for
node, table, flow-row, structural, draft, and text commit paths covered by this
plan.

## Related Docs

- `docs/EDITOR_OPERATION_ARCHITECTURE.md`
- `docs/EDITOR_STABILITY_GATES.md`
- `docs/EDITOR_RENDER_ACTION_OWNERSHIP.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
