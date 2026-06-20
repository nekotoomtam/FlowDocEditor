# Editor Operation Source Of Truth Plan

Status: Historical and implementation ledger for moving editor runtime dispatch from
action-first to operation-first. Phase 1 dispatch migration, Phase 2
structural operation dispatch, and the first Phase 3 node mutation pilots are
complete. The basic node mutation group is now covered, and Phase 4 has started
with flow-row structure/layout and table structure operation result helpers.
Document settings, text draft/commit, node props, field patch, style patch, list
structure, drag placement, and paragraph split/merge operation result helpers
are now covered. Runtime operation dispatch now injects DocumentNode v2 graph
context for graph-backed operation families. Node delete, duplicate, reorder,
node props, field patch, text draft/plain text commit, flow-row structure/layout,
table structure, document settings, and style operations now carry semantic
operation payloads that their planners read before the compatibility
`EditorAction` snapshot.
Stress-fixture and browser evidence are still pending.
Document Model v2 is now the accepted direction for broad table/flow-row and
fixture redesign work; see `docs/DOCUMENT_MODEL_V2_PLAN.md` and
`docs/DOCUMENT_MODEL_V2_CONTRACT.md`.

Use this plan with `docs/EDITOR_OPERATION_ARCHITECTURE.md` for implementation
history. For the current Phase 2 design gate that separates stable operation
commands, legacy UI action snapshots, runtime context, operation plans, and
future AI/external caller semantics, use
`docs/EDITOR_OPERATION_COMMAND_ARCHITECTURE_PLAN.md`.

## Request

Move the editor toward:

```text
User intent -> Operation envelope -> Operation plan -> reducer commit adapter
```

The first acceptance target is not a rewrite. The first target is that runtime
dispatch creates and carries one `EditorOperationEnvelope` before reducer commit,
and render invalidation consumes that same operation instead of rebuilding it
later from an `EditorAction`.

## Evidence Baseline

- `src/app/editor/_components/EditorShell.tsx` owned the common
  `dispatchEditorAction(...)` adapter and previously dispatched raw
  `EditorAction` values into `useReducer(...)`.
- `src/app/editor/_components/shell/useEditorPaginationLifecycleController.ts`
  previously rebuilt an operation from the pending action before resolving
  render invalidation.
- `src/app/editor/_components/operations/useDispatchEditorOperation.ts` is still
  a compatibility helper, not the runtime source of truth.
- `src/app/editor/_components/editorReducer.ts` still owns the compatibility
  action switch for `legacy.action` and state-only commands, but every
  non-legacy `EditorOperationKind` is routed by operation kind before fallback.
- `EditorOperationEnvelope.action` remains as a compatibility snapshot, but
  the migrated node, field, text, flow-row, table, document settings, and style
  planners read semantic `EditorOperationEnvelope.payload` values first.

## Phase Plan

### Phase 0: Baseline And Visible Plan

Goal: make the lane visible before code movement.

Status: Done.

Acceptance:

- This plan exists and is linked from `docs/DOCS_INDEX.md`.
- Current action-first evidence is cited before migration claims are made.
- Later phases can be tracked without asking for per-patch approval.

### Phase 1: Operation Envelope As Runtime Dispatch Input

Goal: `EditorShell` dispatches operation envelopes to reducer state, while
keeping `dispatchEditorAction(...)` as a lossless compatibility adapter for
existing UI call sites.

Status: Done.

Acceptance:

- `editorReducer.ts` exports an operation-first reducer entrypoint.
- `EditorShell.tsx` uses that operation reducer in `useReducer(...)`.
- `dispatchEditorAction(...)` creates one operation envelope before dispatch.
- Pending render invalidation stores and reuses the same operation envelope.
- No direct raw action `dispatch(...)` calls remain in `EditorShell.tsx`.
- Focused tests prove operation reducer output matches the legacy action
  reducer for representative action groups.

### Phase 2: Operation-Aware Structural Dispatch

Goal: prepared structural operation plans dispatch operation envelopes directly
instead of unpacking `operation.action` back into the action adapter.

Status: Done.

Acceptance:

- Split and merge operation handlers can dispatch the prepared operation
  envelope with their optimistic runtime metadata intact.
- `SET_PAGINATED` compatibility actions remain explicit legacy actions until
  pagination adoption is represented as a dedicated operation.
- Existing optimistic refocus, preview settle, and history behavior remain
  unchanged.

### Phase 3: Pilot Operation Plan As Semantic Owner

Goal: pick one non-typing mutation and move semantic planning out of the
reducer branch into an operation plan.

Initial pilots: `node.delete`, `node.duplicate`, and `node.reorder`.

Status: Done for the basic node mutation group.

Acceptance:

- Operation result declares validation policy, history policy, validation scope,
  selection policy, and failure behavior.
- Runtime `reduceEditorOperation(...)` routes `node.delete` and
  `node.duplicate`, and `node.reorder` by operation kind before falling back to
  legacy action reduction.
- Reducer branches become commit adapters for the same operation result helpers.
- Existing reducer tests and new operation-plan tests cover no-op and commit
  paths.

### Phase 4: Broaden Source-Of-Truth Coverage

Goal: repeat Phase 3 by operation group: `node.duplicate`, `node.reorder`,
table structure, flow-row structure/layout, and document settings.

Status: In progress. Flow-row structure/layout, table structure, document
settings, text draft/commit, node props, field patch, style patch, list
structure, drag placement, and paragraph split/merge operation groups now share
operation result helpers. Node mutation planning can consume an operation
runtime DocumentNode v2 graph for diagnostics, capability preflight, and scoped
validation policy while keeping current document commit behavior unchanged.
The graph-backed planning decision is now a shared utility used by node,
flow-row, table, paragraph, list, and drag operation planning. Runtime dispatch
injects that graph context automatically for graph-backed operation kinds.
Scoped validation remains a full-validation fallback deferral, not a completed
subtree validator. Browser stress evidence remains pending.

Acceptance:

- Each migrated group has symmetric validation/history/render behavior.
- Long-document stability gates identify operation kind, scope, and fallback
  page scope.
- Browser stress evidence is recorded before claiming user-perceived stability.

Architecture checkpoint:

- Broad table and flow-row operation work should use
  `docs/DOCUMENT_MODEL_V2_PLAN.md` and
  `docs/DOCUMENT_MODEL_V2_CONTRACT.md` as the model direction.
- Current v1 fixtures may remain regression evidence, but they should not be
  treated as product-level stability proof for the v2 architecture.
- Operation planning should prefer a single document graph/index contract over
  adding more node-family-specific traversal branches.

## Job Ledger

| Date | Phase | Item | Status |
|---|---|---|---|
| 2026-06-19 | 0 | Re-read agent/job/review docs and operation architecture docs. | Done |
| 2026-06-19 | 0 | Confirm current runtime still had action-first dispatch and operation bridge metadata. | Done |
| 2026-06-19 | 1 | Add operation-first reducer entrypoint and route `EditorShell` dispatch through operation envelopes. | Done |
| 2026-06-19 | 1 | Reuse pending operation envelope for render invalidation. | Done |
| 2026-06-19 | 1 | Add reducer compatibility tests for operation envelopes. | Done |
| 2026-06-19 | 1 | Run focused operation tests, type-check, and app test suite. | Done |
| 2026-06-19 | 2 | Route prepared split/merge structural operation envelopes through operation dispatch instead of unpacking back to action dispatch. | Done |
| 2026-06-19 | 2 | Preserve `SET_PAGINATED` as explicit legacy pagination adoption while structural mutations dispatch operation envelopes. | Done |
| 2026-06-19 | 2 | Run structural handler tests, type-check, flaky timeout reruns, and app test suite. | Done |
| 2026-06-19 | 3 | Move `node.delete` semantics into node operation result helpers and route runtime operation dispatch by `operation.kind`. | Done |
| 2026-06-19 | 3 | Move `node.duplicate` semantics into the same node operation result helper layer. | Done |
| 2026-06-19 | 3 | Move `node.reorder` semantics into the same node operation result helper layer. | Done |
| 2026-06-19 | 3 | Run focused node operation tests, type-check, and app test suite. | Done |
| 2026-06-19 | 4 | Add current-runtime graph diagnostics for node operation planning contexts. | Done |
| 2026-06-19 | 4 | Move `flow-row.structure.patch` semantics into flow-row operation result helpers. | Done |
| 2026-06-19 | 4 | Move `flow-row.layout.patch` semantics into flow-row operation result helpers. | Done |
| 2026-06-19 | 4 | Move `table.structure.patch` semantics into table operation result helpers and route runtime operation dispatch by operation kind. | Done |
| 2026-06-19 | 4 | Move `document.settings.patch` semantics into document settings operation result helpers and route runtime operation dispatch by operation kind. | Done |
| 2026-06-19 | 4 | Move `text.draft` and `text.commit` semantics into text operation result wrappers and route runtime operation dispatch by operation kind. | Done |
| 2026-06-19 | 4 | Move `node.props.patch` and `field.patch` semantics into operation result helpers and route runtime operation dispatch by operation kind. | Done |
| 2026-06-19 | 4 | Move `style.patch` semantics and heading guard policy into style operation result helpers and route runtime operation dispatch by operation kind. | Done |
| 2026-06-19 | 4 | Move `list.structure.patch` commit policy into list operation result helpers and route runtime operation dispatch by operation kind. | Done |
| 2026-06-19 | 4 | Move `drag.placement` commit policy into drag operation result helpers and route runtime operation dispatch by operation kind. | Done |
| 2026-06-19 | 4 | Move `paragraph.split` and `paragraph.merge` commit policy into paragraph operation result helpers and route runtime operation dispatch by operation kind. | Done |
| 2026-06-19 | 4 | Audit operation reducer coverage: all non-legacy `EditorOperationKind` values route before the compatibility action fallback. | Done |
| 2026-06-19 | 4 | Add a regression gate that fails if a non-legacy operation kind silently falls through to the legacy action reducer. | Done |
| 2026-06-19 | 4 | Add the first operation-level DocumentNode v2 graph consumer in node mutation planning. | Done |
| 2026-06-19 | 4 | Use DocumentNode v2 graph capabilities as node mutation planning preflight and scoped validation policy. | Done |
| 2026-06-19 | 4 | Extract graph-backed planning decisions into a shared operation utility and apply it to flow-row and table planning. | Done |
| 2026-06-19 | 4 | Apply shared graph-backed planning to paragraph, list, and drag operation groups. | Done |
| 2026-06-19 | 4 | Inject DocumentNode v2 graph runtime automatically in the editor operation dispatch path. | Done |
| 2026-06-19 | 4 | Record scoped validation as a full-validation fallback deferral, not an implemented subtree validator. | Deferred |
| 2026-06-19 | 4 | Add semantic operation payloads for node delete, duplicate, reorder, and node props planning. | Done |
| 2026-06-19 | 4 | Add semantic operation payloads for field, text draft/plain commit, flow-row, table structure, document settings, and style planning. | Done |

## Verification

Current Phase 1 verification:

- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorOperationReducer.test.ts src/app/editor/_components/operations/__tests__/editorOperationFromAction.test.ts src/app/editor/_components/operations/__tests__/editorRenderInvalidation.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `git diff --check`

Current Phase 2 verification:

- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorStructuralHandlers.test.ts src/app/editor/_components/operations/__tests__/editorOperationReducer.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`
- Timeout reruns that passed after the first full-suite timeout:
  `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerNodeMutation.test.ts`
  and
  `npm.cmd run test:app -- src/app/editor/_components/__tests__/realFontDrift.test.ts`

Current Phase 3 verification:

- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorNodeOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorOperationReducer.test.ts src/app/editor/_components/__tests__/editorReducerNodeMutation.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`

Current Phase 4 focused verification:

- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorNodeOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorNodeOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDocumentGraphDiagnostics.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorNodeOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorFlowRowOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorTableOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDocumentGraphDiagnostics.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorParagraphOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorListOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDragOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDocumentGraphDiagnostics.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorFlowRowOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorTableOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorDocumentSettingsOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorTextCommitPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorNodePropsOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorFieldOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorStyleOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorListOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorDragOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorParagraphOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorOperationRuntime.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorOperationRuntime.test.ts src/app/editor/_components/operations/__tests__/editorNodeOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorFlowRowOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorTableOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorParagraphOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorListOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDragOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDocumentGraphDiagnostics.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorOperationReducer.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerLayoutMutation.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerTableMutation.test.ts src/app/editor/_components/__tests__/editorReducerLayoutMutation.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerDocumentSettingsMutation.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerTextCommitPolicy.test.ts src/app/editor/_components/__tests__/editorReducerTextFieldMutation.test.ts`

## Fixture Direction

The existing `public/mock/flowdoc-stress-mock.flowdoc.json` remains useful as a
regression baseline, but it should not define the target architecture. If the
fixture structure is tied too strongly to an old document shape, replace it with
a new stress fixture set before using browser smoke results as product-level
stability evidence.

Recommended future fixture split:

- `stress-node-mutations.flowdoc.json`: many body nodes, nested sections, lists,
  and predictable reorder/delete/duplicate targets.
- `stress-flow-row.flowdoc.json`: long document with rows, stacks, mixed
  widths, and resize/add-column targets.
- `stress-table.flowdoc.json`: tables with enough rows/columns/spans to test
  table-specific invalidation and pagination fallback.
- `stress-typing.flowdoc.json`: long paragraphs and Thai/Latin mixed text for
  draft/commit smoothness.

Browser stress smoke against `public/mock/flowdoc-stress-mock.flowdoc.json` was
not run in Phase 1, Phase 2, or the Phase 3 node pilots, so user-perceived
long-document stability remains an explicit Phase 4 evidence requirement after
the fixture direction is settled.

## Stop Conditions

Continue autonomously while the next phase item is reversible and inside this
plan. Stop for owner checkpoint only when:

- A phase requires choosing a product behavior policy.
- A change would rewrite broad reducer semantics at once.
- Tests reveal behavior drift that cannot be corrected locally.
- Browser or fixture evidence is required but unavailable in the current
  environment.
