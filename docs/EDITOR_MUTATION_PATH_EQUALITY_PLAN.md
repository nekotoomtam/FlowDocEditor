# Editor Mutation Path Equality Plan

Status: Complete for the delegated mutation-path-equality lane. A post
source-of-truth regression gate now verifies that every non-legacy
`EditorOperationKind` routes before the compatibility action fallback.

Use this document after the reducer responsibility extraction lane and when
auditing operation-route coverage. The goal is to remove remaining asymmetry
between editor mutation branches while keeping behavior small, reversible, and
evidence-based.

## Job Contract

User request:

- Keep the first remaining architecture item as the next lane and break the
  plan down before continuing.

Current lane:

- Mutation path equality across the remaining editor reducer branches that
  still commit documents directly.

Goal:

- Every meaningful authored-document mutation should either:
  - commit through an operation commit result with explicit validation,
    history, selection/paginated patch, and diagnostics policy; or
  - be intentionally documented as lifecycle/read-only/deferred work.

Definition of done:

- Remaining direct reducer mutation branches are inventoried.
- Operation metadata gaps are closed before branch migration.
- Low-risk direct `pushDoc(...)` branches move to the operation commit adapter
  with tests.
- Higher-risk document-wide, lifecycle, and source-of-truth work is explicitly
  deferred rather than silently mixed into this lane.
- Focused operation/reducer tests and type-check pass for touched paths.

Autonomy:

- Codex may implement small reversible code and docs patches inside this lane.
- Codex must stop before schema changes, persistence changes, export ownership
  changes, real subtree-only validation, or replacing `EditorAction` as the
  source dispatch contract.

Out of scope:

- Making the operation architecture the source of truth.
- Removing the reducer.
- Changing persisted FlowDoc document/package schema.
- Replacing full-document validation with real scoped validation.
- Changing export, pagination truth, or undo/redo semantics.

## Current Position

Request to plan trace:

```text
User request: keep item 1 first and break the plan down
  -> Plan: mutation path equality across remaining reducer mutation branches
  -> Phase 6: verification and lane closure
      -> Job item 6.2: keep operation-route coverage guarded after source-of-truth migration
        -> Execution step: add a regression gate for every non-legacy operation kind
```

Current position:

- Request: keep mutation-path equality guarded after source-of-truth operation
  architecture.
- Plan: mutation path equality across remaining reducer mutation branches.
- Phase: Phase 6, verification and lane closure.
- Job item: 6.2 add operation-route regression gate.
- Status: done.
- Why this item is current: operation source-of-truth migration is now covered
  for non-legacy operation kinds, so regression protection matters more than
  another branch migration.
- Next transition: this lane is complete. The next architecture lane is either
  real scoped validation, v2 runtime graph consumption, or v2 stress fixtures,
  depending on owner priority.

## Evidence Inventory

Already migrated in the previous lane:

- Node delete, duplicate, reorder, flow-row add-column, table structure,
  paragraph split/merge, list structure, empty table-cell paragraph delete,
  draft text, and text commit paths now use operation commit results or
  reducer-facing operation plans.

Initial direct mutation evidence:

- `DRAG_COMMIT` still calls `pushDoc(...)` directly after
  `applyPlacementOperation(...)` in `src/app/editor/_components/editorReducer.ts`.
- Simple node/text/style mutations still call `pushDoc(...)` directly:
  `UPDATE_PROPS`, `UPDATE_TEXT`, `UPDATE_PARAGRAPH_TEXT_STYLE`,
  `APPLY_PARAGRAPH_STYLE_PRESET`, `CLEAR_PARAGRAPH_STYLE`,
  `DETACH_PARAGRAPH_STYLE`, `PATCH_PARAGRAPH_STYLE_OVERRIDES`,
  `PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX`,
  `PATCH_PARAGRAPH_STYLE_DEFINITION`,
  `RENAME_PARAGRAPH_STYLE_DEFINITION`,
  `RESET_PARAGRAPH_STYLE_OVERRIDES`,
  `UPDATE_TEXT_RUN_STYLE_RANGE`, `UPDATE_FIELD_REF`,
  `UPDATE_PARAGRAPH_BOX_STYLE`, `UPDATE_FLOW_STACK_BOX_STYLE`, and
  `UPDATE_FLOW_TABLE_CELL_SPAN`.
- Layout/document branches still call `pushDoc(...)` directly:
  `RESIZE_COLUMNS`, `RESIZE_ROW_MIN_HEIGHT`, `UPDATE_MARGIN`,
  `UPDATE_RESERVED_ZONES`, `ENSURE_HEADER_FOOTER_ZONE_VISIBLE`,
  `DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY`, and
  `UPDATE_HEADER_FOOTER_HORIZONTAL_MODE`.
- `LOAD_DOCUMENT`, `UNDO`, and `REDO` still update editor state directly. This
  is expected lifecycle behavior for now and should not be mixed with ordinary
  mutation migration without a separate design.

Operation metadata gaps:

- Closed in this lane. `EditorOperationKind` now distinguishes document
  settings, drag placement, field patches, flow-row layout patches, and generic
  node prop patches.
- `editorOperationFromAction.ts` now maps the remaining migrated mutation
  groups away from `legacy.action`.

Current direct reducer mutation result:

- `rg -n "pushDoc\\(" src/app/editor/_components/editorReducer.ts` found no
  remaining direct reducer branches after Phase 5.
- `pushDoc(...)` remains owned by `editorReducerCommit.ts` and is reached
  through `commitEditorOperationResult(...)`.

## Phase Map

Parent goal:

- Make editor mutations stable for long documents by making validation,
  history, render invalidation, selection, pagination, and diagnostics policies
  comparable across operation types.

Current job lane:

- Mutation path equality before operation source-of-truth migration.

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 0 | Establish inventory and durable lane plan. | Docs, reducer inventory, operation mapping. | Remaining direct mutation paths are grouped and this plan is visible. | done | This document; reducer `pushDoc(...)` inventory. |
| 1 | Close operation metadata gaps. | `EditorOperationKind`, `editorOperationFromAction.ts`, operation mapping tests, render invalidation tests where needed. | Remaining direct mutation branches have explicit operation kinds/scopes or documented lifecycle deferral. | done | `editorOperationFromAction.test.ts` and `editorRenderInvalidation.test.ts` cover the added operation kinds; classifier test passed. |
| 2 | Migrate low-risk style/visual mutation branches. | Paragraph style, text-run style, paragraph/flow-stack box style, style presets/overrides. | Branches use `commitEditorOperationResult(...)`, preserve selection behavior, and pass reducer tests. | done | Style branches now use `commitStylePatchOperation(...)`; rich-text reducer tests and operation tests passed. |
| 3 | Migrate node/text/field property mutation branches. | `UPDATE_PROPS`, `UPDATE_TEXT`, `UPDATE_FIELD_REF`, no-op policies, target node selection policies. | Branches declare operation kind, validation policy, history policy, and tests cover no-op/success. | done | Text/props/field branches now use operation commit results; focused reducer/operation tests passed. |
| 4 | Migrate structural layout leftovers. | `DRAG_COMMIT`, `RESIZE_COLUMNS`, `RESIZE_ROW_MIN_HEIGHT`, `UPDATE_FLOW_TABLE_CELL_SPAN`. | Branches use operation commit results while preserving optional paginated adoption and drag cleanup. | done | Layout reducer tests, table/node reducer tests, and operation tests passed. |
| 5 | Migrate or explicitly defer document-wide settings. | Margins, reserved zones, header/footer visibility/mode. | Document-wide mutations declare conservative operation metadata and full-validation/full-document layout policy, or are documented as deferred. | done | Document settings helper added; document settings and rich-text reserved-zone tests passed. |
| 6 | Verification and lane closure. | Focused reducer/operation tests, type-check, app operation gate, docs update. | Tests pass, residual risks named, source-of-truth migration remains separate. | done | Type-check and app operation/reducer gate passed. |

## Job Ledger

| Item | Status | Owner role | Purpose | Verification | Notes |
|---|---|---|---|---|---|
| 0.1 | done | Design Reviewer | Inventory remaining direct mutation paths and make the plan visible. | Docs/code evidence cited. | Added this document and linked it from the docs index/audit. |
| 1.1 | done | Minimal Patch Implementer | Add missing operation kinds and action mapping for remaining mutation groups. | Operation mapping tests. | Metadata-only first. |
| 1.2 | done | Regression/Risk Reviewer | Confirm render invalidation/classifier still matches the new operation kinds. | Render invalidation and classifier tests. | No reducer behavior change. |
| 2.1 | done | Minimal Patch Implementer | Add a style-patch commit helper and migrate low-risk style branches. | Reducer tests for no-op/success/selection. | Focused style/rich-text tests passed. |
| 3.1 | done | Minimal Patch Implementer | Migrate text/props/field branches with explicit commit results. | Reducer tests for no-op/success/history. | Focused reducer tests passed. |
| 4.1 | done | Design Reviewer | Design drag/resize leftover migration before code changes. | Existing drag/resize tests or new focused tests. | Drag cleanup and paginated adoption preserved in focused tests. |
| 5.1 | done | Design Reviewer | Decide document-wide operation metadata and deferral boundary. | Docs plus focused reducer tests if migrated. | Kept document-layout conservative. |
| 6.1 | done | Blocker Reviewer | Run operation gate, type-check, and update risk status. | Commands recorded in final handoff. | Lane closure check passed. |
| 6.2 | done | Regression/Risk Reviewer | Guard that non-legacy operation kinds cannot silently fall back to `legacy.action`. | `editorOperationReducer.test.ts` route coverage gate. | Mismatched non-legacy kind plus `SELECT_NODE` must leave state unchanged. |

## Stop Conditions

Stop and ask the owner before continuing if:

- The next patch would change document schema, package schema, export truth, or
  persistence semantics.
- A branch migration would alter undo/redo history semantics.
- A patch requires real scoped validation instead of full-document fallback.
- Operation source-of-truth migration becomes necessary to proceed.
- Browser-level long-document UI stability must be claimed as PASS without a
  matching stress smoke.

## Next Job Item

Next job item:

- No required job item remains in this lane.

Why:

- Direct reducer `pushDoc(...)` branches have been removed.
- Operation metadata is explicit for the migrated mutation groups.
- Focused operation/reducer tests and type-check passed.
- Lifecycle actions such as `LOAD_DOCUMENT`, `UNDO`, and `REDO` remain
  intentionally outside this mutation-path-equality lane.

Recommended next lane:

- Real scoped validation, v2 runtime graph consumption, or v2 stress fixtures.
- Real scoped validation remains a separate lane because it changes validation
  implementation risk, not only mutation routing.
