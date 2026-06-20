# Editor Stability Gates

Status: Long-document editor stability gate contract.

Use this document before accepting changes to editor typing, node add/remove,
table structure edits, reorder/drag, undo/redo, preview settle, or render
invalidation. The goal is user-perceived normal behavior on long documents,
not just absence of exceptions.

## Definition Of Stable

For this project, stable editor behavior means:

- The authored document remains valid.
- The visible editor does not show stale, duplicated, missing, or out-of-order
  content after interaction.
- Typing, deleting, adding/removing nodes, table edits, reorder, undo, and redo
  remain responsive enough to feel normal on a long document.
- Browser preview pagination, server pagination, export readiness, and history
  ownership remain clear.
- A partial or stale preview must never become authoritative document, history,
  or export state.

## Primary Stress Fixture

Primary fixture:

```text
public/mock/flowdoc-stress-mock.flowdoc.json
```

Document Model v2 fixture set:

```text
public/mock/stress-typing-v2.flowdoc.json
public/mock/stress-node-mutations-v2.flowdoc.json
public/mock/stress-flow-row-v2.flowdoc.json
public/mock/stress-table-v2.flowdoc.json
public/mock/stress-long-v2.flowdoc.json
```

These fixtures have semantic target aliases in `mockData.targets` and validate
through the current runtime adapter. The smoothness and stress lifecycle smoke
scripts can consume those aliases for targeted v2 fixture checks. The focused
v2 fixtures cover workflow-specific contracts, while `stress-long-v2` provides
legacy-scale v2 body pressure for Phase 4 long-document probes. The v2 set is
the product-direction fixture set for new Document Model v2 work; the v1 stress
fixture remains the broader legacy regression baseline until v2 browser smoke
evidence reaches equivalent breadth.

Current known fixture shape from existing docs and local stress runs:

- Thai stress document with one section.
- More than 1,400 document nodes and more than 1,200 body children.
- Browser smoke runs currently paginate it to more than 200 editor pages.
- Outline stress exposes more than 6,000 outline rows while rendering a bounded
  visible window.

Do not claim an editor change is stable for long documents unless it is checked
against this fixture or a larger named fixture.

## Verdict Levels

Use the project review vocabulary:

| Verdict | Meaning |
|---|---|
| PASS | Correctness and the relevant responsiveness gate pass with evidence. |
| FAIL / BLOCKER | Invalid document state, stale overwrite, history corruption, focus loss, export readiness break, uncaught error, or severe responsiveness miss. |
| RISK | Correctness passes but responsiveness, coverage, or ownership is not good enough for the stated goal. |
| UNKNOWN | Not exercised by the current code/docs/tests. |

## Universal Gates

These apply to every editor stability check:

- `console.errors = 0`.
- `console.pageErrors = 0`.
- No `node not found` runtime error.
- No layout error badge.
- No maximum update depth error.
- No stale preview result overwrites a newer document, inline node, structural
  generation, or draft version.
- Undo and redo restore document data and the matching paginated snapshot.
- Export must use the current checked `previewDoc` through `/api/export`, not a
  partial browser preview.

## Active Typing Gates

Primary probe:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"; $env:PROBE_TARGET_NODE_ID="p_00114"; $env:PROBE_TARGET_PAGE_INDEX="14"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
```

Focused modes:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"; $env:PROBE_TARGET_NODE_ID="p_00114"; $env:PROBE_TARGET_PAGE_INDEX="14"; $env:PROBE_READY_TIMEOUT_MS="240000"
$env:PROBE_MODE="typing"; $env:PROBE_BURST_LENGTH="400"; $env:PROBE_INTERVAL_MS="30"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_MODE="wrap-typing"; $env:PROBE_BURST_LENGTH="160"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_MODE="delete"; $env:PROBE_BURST_LENGTH="120"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
```

Boundary targets:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"; $env:PROBE_READY_TIMEOUT_MS="240000"
$env:PROBE_TARGET_NODE_ID="p_00104"; $env:PROBE_TARGET_PAGE_INDEX="12"; $env:PROBE_MODE="wrap-typing"; $env:PROBE_BURST_LENGTH="160"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_TARGET_NODE_ID="p_00104"; $env:PROBE_TARGET_PAGE_INDEX="12"; $env:PROBE_MODE="typing"; $env:PROBE_BURST_LENGTH="400"; $env:PROBE_INTERVAL_MS="30"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_TARGET_NODE_ID="p_00132"; $env:PROBE_TARGET_PAGE_INDEX="14"; $env:PROBE_MODE="wrap-typing"; $env:PROBE_BURST_LENGTH="160"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
```

Document Model v2 target-alias check:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/stress-typing-v2.flowdoc.json"; $env:PROBE_TARGET_ALIAS="typing.primary"; $env:PROBE_BURST_LENGTH="1"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
```

Document Model v2 long-document target-alias check:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:PROBE_TARGET_ALIAS="typing.deepDocument"; $env:PROBE_BURST_LENGTH="1"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
```

Typing PASS requires:

- `ok = true`.
- `paintLatencyMs.p95 <= 33`.
- `paintLatencyMs.p99 <= 100`.
- `perfEvents.browserPreviewPagination.count = 0` during the immediate input
  lane.
- `typingLayer` stability checks pass.
- No page-break overlap is detected.

Typing RISK:

- `ok = true`, but `paintLatencyMs.p95 > 33`, `paintLatencyMs.p99 > 100`, or
  repeated visible spikes are observed.
- `keystrokeTotalMs` has large p95/p99 outliers even when paint latency passes.
- Boundary-height handoff appears during no-wait input and needs attribution.

Typing FAIL / BLOCKER:

- Console/page errors.
- `browserPreviewPagination.count > 0` in the immediate input lane.
- `paintLatencyMs.p95 > 66` or `paintLatencyMs.p99 > 250` for the primary
  stress target.
- Text duplicates, disappears, appears out of order, or caret/selection becomes
  unusable.

## WYSIWYG Stress Lifecycle Gate

Command:

```powershell
npm.cmd run smoke:wysiwyg-stress-lifecycle
```

Document Model v2 target-alias command:

```powershell
$env:FLOWDOC_STRESS_FILE="public/mock/stress-typing-v2.flowdoc.json"; $env:STRESS_FIRST_TARGET_ALIAS="typing.primary"; $env:STRESS_SECOND_TARGET_ALIAS="typing.boundary"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-stress-lifecycle
```

Document Model v2 long-document target-alias command:

```powershell
$env:FLOWDOC_STRESS_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:STRESS_FIRST_TARGET_ALIAS="typing.primary"; $env:STRESS_SECOND_TARGET_ALIAS="typing.deepDocument"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-stress-lifecycle
```

PASS requires:

- Stress fixture loads.
- Click-to-switch edit stays below the script threshold.
- Alias target reveal/scroll time is reported separately as `targetRevealMs`
  and must not be mixed into click-to-switch runtime.
- Exit edit stays below the script threshold.
- Responsive finalize stays below the script threshold.
- Preview-settle supersedes stay within the script threshold.
- Delete selected fragment and Undo both complete.
- Preview layout returns to `full`.
- Console/page errors are zero.

Use repeat variants for intermittent regressions:

```powershell
npm.cmd run smoke:wysiwyg-stress-lifecycle-repeat
npm.cmd run smoke:wysiwyg-stress-lifecycle-repeat5
```

## Node Mutation Gates

This gate covers:

- `node.delete`
- `node.duplicate`
- drag-to-copy or add-node style insertions
- body-child reorder and drag placement

Document Model v2 long-document node mutation command:

```powershell
$env:FLOWDOC_MUTATION_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:MUTATION_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-node-mutation
```

Document Model v2 long-document split/merge command:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:PROBE_TARGET_ALIAS="node.split"; $env:PROBE_MODE="enter-backspace-after-dispatch"; $env:PROBE_ENTER_SPLIT_TEXT="Browser probes"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
```

Current coverage:

- Stress lifecycle covers delete and undo on the stress fixture.
- Browser node-mutation smoke covers palette add and canvas drag-copy plus undo
  on `stress-long-v2`.
- Browser split/merge smoke covers `node.split` on `stress-long-v2`, verifies
  split dispatch, merge dispatch, new-node removal, refocus to the previous
  node, no full pagination before island, and zero console/page errors.
- Outline stress covers reorder with active draft preservation on the stress
  fixture.
- Reducer stress coverage duplicates `p_00114`, adds a flow-row stack column,
  and verifies undo restore on `flowdoc-stress-mock.flowdoc.json`.

PASS for future node-mutation work requires:

- Operation kind, validation policy, history policy, render invalidation lane,
  and preview-settle policy are declared.
- The operation creates exactly one intentional history entry or declares a
  no-history reason.
- Selection/refocus is deterministic after commit and after undo/redo.
- Preview layout returns to `full`.
- No full-canvas loading overlay remains stuck.
- Reducer/operation diagnostics record validation time, commit time, render
  invalidation scope, preview-settle time, and canvas commit time.
- A stress fixture smoke covers add/duplicate/delete plus undo/redo. Browser
  node-mutation smoke covers add and drag-copy/undo; browser lifecycle smoke
  covers delete/undo; browser split/merge smoke covers structural
  split/backspace merge; reducer smoke covers operation-level
  duplicate/add/undo.

## Table Mutation Gates

This gate covers:

- table row add/remove
- table column add/remove
- table fit-to-width
- flow-row/stack column add
- table span edits that affect structure

Document Model v2 long-document table/flow-row structure command:

```powershell
$env:FLOWDOC_STRUCTURE_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:STRUCTURE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-structure-mutation
```

PASS requires:

- Table root and affected descendants are explicit operation scope.
- Table operation preserves core table invariants.
- Render invalidation lane is `table-layout` unless a wider lane is justified.
- Preview settles without stale overwrite.
- Undo/redo restores table structure and matching pagination.
- A browser smoke confirms visible table structure changes on a long document
  or a named table-heavy fixture.

Current coverage:

- Existing tests cover many core table operations and table pagination cases.
- Browser structure-mutation smoke covers table add row, table add column,
  table column resize, flow-stack add column, flow-row resize, preview settle,
  undo restore, and zero console/page errors on `stress-long-v2`.
- The remaining gap is legacy-v1 `flowdoc-stress-mock.flowdoc.json` parity for
  table add/remove browser workflows. New v2 work should use `stress-long-v2`
  first.

## Outline Reorder Gate

Command:

```powershell
npm.cmd run smoke:outline-panel-list-draft
```

PASS requires:

- Stress fixture loads.
- Outline virtualization remains enabled.
- Rendered row count stays bounded.
- Active draft text is preserved through reorder.
- List signature is preserved.
- Undo and redo preserve the active draft text/list signature.
- Invalid list hierarchy moves remain blocked.

Use repeat variants when changing outline/reorder behavior.

## Operation Architecture Gate

Before changing operation architecture or moving a reducer path, run at least:

```powershell
npm.cmd test -- src/app/editor/_components/operations/__tests__/editorRenderInvalidation.test.ts src/app/editor/_components/__tests__/editorActionClassifier.test.ts src/app/editor/_components/runtime/__tests__/previewSettleRuntime.test.ts
```

For structural edit paths, also include:

```powershell
npm.cmd test -- src/app/editor/_components/runtime/__tests__/structuralEditRuntime.test.ts src/app/editor/_components/runtime/__tests__/canvasViewportRuntime.test.ts src/app/editor/_components/__tests__/EditorCanvasPageSlot.test.ts src/app/editor/_components/__tests__/editorPreviewDisplay.test.ts src/app/editor/_components/__tests__/editorPreviewLayoutStatus.test.ts
```

PASS requires:

- Operation mapping remains deterministic.
- Render invalidation scope is tested.
- Preview settle stale/supersede behavior remains tested.
- Canvas page-scope behavior remains tested when the operation affects render
  scope.

## Release Readiness Rule

A change can be accepted as a minimal patch with RISK only when:

- Correctness gates pass.
- The risk is documented with metric evidence.
- The risk does not make the user's primary workflow unusable.
- The next patch is named.

A change must not be called stable when:

- It has no stress fixture evidence for the operation it changes.
- It only passes a small fixture while the stated risk is long-document
  behavior.
- It improves visual responsiveness by weakening document validity, pagination
  truth, history, undo/redo, or export ownership.

## Related Docs

- `docs/EDITOR_OPERATION_ARCHITECTURE.md`
- `docs/EDITOR_RENDER_ACTION_OWNERSHIP.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md`
- `docs/WYSIWYG_PARAGRAPH_INTERACTION_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
