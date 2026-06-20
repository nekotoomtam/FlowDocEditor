# Editor Runtime Document Model v2 Plan

Status: Active delegated job plan for Architecture Evolution Phase 1.

Use this document when moving editor runtime planning toward DocumentNode v2 as
the primary graph identity. This plan does not flip the entire editor state to
v2 in one patch.

## Parent Goal

Architecture evolution Phase 1:

```text
Runtime Document Model v2 primary path
```

The goal is to make runtime mutation/planning paths consume one v2 graph
identity contract instead of repeatedly adapting current document shape or
re-deriving parentage in each subsystem.

## Current Baseline

Completed foundations:

- New authored package output is DocumentNode v2.
- DocumentNode v2 schema, migration, assertion, graph index, and table helpers
  exist.
- Operation dispatch can attach a DocumentNode v2 graph runtime to selected
  operation kinds.
- Operation planners can consume v2 graph diagnostics for node, flow-row, table,
  paragraph, list, and drag groups.

Still current-shape runtime:

- `parsePersistedDocumentV2RuntimeValue(...)` adapts v2 input back to the
  current runtime document shape with `adaptDocumentV2ToCurrentDocument(...)`.
- `EditorShell` stores and renders `state.doc` as the current runtime shape.
- `attachEditorOperationDocumentGraphRuntime(...)` builds a v2 graph runtime
  snapshot from the current document when dispatching selected operations.
- `createOperationDocumentGraphDiagnostics(...)` reuses the v2 graph index from
  the operation runtime snapshot, or falls back to current-document traversal.
- Rendering, selection, property panels, WYSIWYG eligibility, and many tests
  still expect nested current runtime table shape.

## Evidence

| Evidence | Meaning |
|---|---|
| `src/app/editor/_components/documentPersistence.ts` `createAuthoredDocumentPackageV2(...)` | Authored storage already migrates current runtime documents to DocumentNode v2 before serialization. |
| `src/app/editor/_components/documentPersistence.ts` `parsePersistedDocumentV2RuntimeValue(...)` | Imported v2 packages are adapted back to current runtime shape for editor compatibility. |
| `src/app/editor/_components/operations/editorOperationRuntime.ts` `attachEditorOperationDocumentGraphRuntime(...)` | Operation dispatch currently builds v2 graph runtime by calling `migrateDocumentToV2(doc)`. |
| `src/app/editor/_components/EditorShell.tsx` `dispatchEditorOperation(...)` | Real editor dispatch attaches graph runtime before reducer commit. |
| `src/app/editor/_components/operations/editorDocumentGraphDiagnostics.ts` `createOperationDocumentGraphDiagnostics(...)` | Operation plans prefer operation runtime DocumentNode v2 graph diagnostics when present. |
| `packages/core/src/document/documentV2.ts` `buildDocumentGraphIndexV2(...)` | v2 graph parentage/capability index exists and is the target runtime identity. |

## Non-Goals

- Do not rewrite `EditorState.doc` to DocumentNode v2 in one patch.
- Do not remove current runtime compatibility for layout/render/export.
- Do not change package import/export semantics.
- Do not change pagination or export output.
- Do not delete legacy fixtures or tests in this phase.

## Phase Map

| Phase | Goal | Scope | Done criteria | Status |
|---|---|---|---|---|
| 0 | Plan and audit | Docs and current-code evidence | Runtime v2 primary-path jobs are explicit and ordered | done |
| 1 | Runtime graph identity boundary | Editor runtime helper/types | One reusable runtime graph snapshot object owns v2 document/index/diagnostics identity for a current doc | done |
| 2 | Dispatch graph reuse | `EditorShell`, operation runtime | Dispatch uses the runtime graph identity instead of migrating independently per operation | done |
| 3 | Operation planning graph contract | Operation graph diagnostics/planning | Planners consume graph snapshot diagnostics/index through one contract, with fallback explicit | done |
| 4 | Current-shape compatibility classification | Render/selection/property/WYSIWYG paths | Remaining current-shape readers are classified as render compatibility, editor state compatibility, or migration targets | done |
| 5 | First v2-first hot path | One bounded mutation/planning path | One selected hot path consumes v2 graph parentage without current-shape traversal in planning | done |
| 6 | Verification and next lane handoff | Tests/docs | Focused tests, type-check, and owner-readable ledger prove behavior preservation | done |

## Recommended Job Order

1. Create the runtime graph identity boundary.
2. Reuse that boundary from operation dispatch.
3. Route graph diagnostics through the boundary rather than rebuilding indexes
   inside each diagnostic call.
4. Audit remaining current-shape readers and classify them.
5. Pick one hot path for v2-first planning.

Why:

- A shared graph identity reduces repeated `migrateDocumentToV2(...)` and
  repeated `buildDocumentGraphIndexV2(...)` work before broader migration.
- Operation planning already has the strongest v2 integration, so it is the
  safest first consumer.
- Render/export/layout compatibility can stay current-shape until v2 runtime
  planning is proven.

## Completed Patch 1.1: Runtime Graph Identity Boundary

Created a runtime graph helper near operation runtime:

```text
createEditorDocumentGraphRuntime(doc)
  -> sourceModel: "document-v2"
  -> document: DocumentNodeV2
  -> index: DocumentGraphIndexV2
  -> sourceDocument: current runtime doc identity
```

Completed:

- updated `EditorOperationDocumentGraphRuntime` to carry the graph index, not
  only the migrated v2 document
- made `attachEditorOperationDocumentGraphRuntime(...)` use the helper
- made `createDocumentGraphDiagnosticsFromV2(...)` accept an existing index
  when available
- added focused tests proving the index is reused and diagnostics still match

This patch should not change reducer behavior, document output, pagination, or
rendering.

## Later Patch Candidates

### Patch 2: Shell-Level Runtime Graph Cache

Done. `EditorShell` owns a graph runtime cache keyed by the current `state.doc`
identity and passes it to operation dispatch. This avoids rebuilding the v2
document/index for every graph-backed operation while the document identity is
unchanged.

### Patch 3: Explicit Fallback Policy

Partially done in code. `createOperationDocumentGraphDiagnostics(...)` now
reuses the runtime graph snapshot index when present and falls back to
current-document diagnostics otherwise. A separate compatibility-reader audit
still needs to document remaining current-shape consumers outside operation
planning.

### Patch 4: V2-First Hot Path

Done for operation preflight. Graph-backed operation planning uses the runtime
DocumentNode v2 graph snapshot before current-shape mutation is committed.

### Patch 5: Compatibility Surface Audit

Done below. Render, selection, property panel, WYSIWYG, pagination, persistence,
and export surfaces are classified before any runtime document flip.

## Current-Shape Compatibility Reader Audit

Status: completed as Patch 4.1.

| Area | Classification | Evidence | Decision |
|---|---|---|---|
| Editor state and history | Current runtime owner | `src/app/editor/_components/editorReducer.ts` `EditorState` stores `doc: DocumentNode`; `HistoryEntry` stores `doc: DocumentNode`; `LOAD_DOCUMENT` normalizes current-shape docs. | Do not flip `EditorState.doc` in this phase. It needs a dedicated state/history migration lane. |
| Persistence boundary | V2 storage with current runtime adapter | `src/app/editor/_components/documentPersistence.ts` `createAuthoredDocumentPackageV2(...)` migrates runtime docs to DocumentNode v2; `parsePersistedDocumentV2RuntimeValue(...)` adapts v2 packages back through `adaptDocumentV2ToCurrentDocument(...)`. | Keep this adapter until render, reducer, pagination, and WYSIWYG readers can accept v2. |
| Operation planning | V2-first planning compatibility | `src/app/editor/_components/operations/editorOperationRuntime.ts` `createEditorDocumentGraphRuntime(...)` owns v2 document/index identity; `editorDocumentGraphDiagnostics.ts` `createOperationDocumentGraphDiagnostics(...)` reuses that index; `editorGraphPlanningDecision.ts` switches policy when `graphSourceModel` is `document-v2`. | This is the first safe v2-first hot path. Keep mutation output current-shape for now. |
| Canvas render and canvas interaction | Render compatibility reader | `src/app/editor/_components/EditorCanvas.tsx` `findTableNode(...)`, `resolveSelectedTableId(...)`, `findParagraphNode(...)`, and `isTableCellId(...)` traverse `doc.document.sections`, `section.nodes`, and nested `table.nodes`. | Do not migrate renderer directly. Add a v2-aware lookup/render adapter before changing canvas input shape. |
| Selection context and property panel | UX reader and migration target | `src/app/editor/_components/selectionContext.ts` `buildSelectionContext(...)` walks current parents and nested table nodes; `PropertyPanel.tsx` `findNode(...)`, `findFlowTableOf(...)`, and `findFlowRowOfStack(...)` read current-shape structures. | Good next migration target after operation planning, but only through a shared graph lookup contract. |
| WYSIWYG inline edit lifecycle | High-risk current-shape reader | `src/app/editor/_components/inlineEditSurfaceState.ts` `findParagraphNode(...)` and `isParagraphInsideTableCell(...)`; `wysiwygTextEligibility.ts` `isWysiwygTextEngineFragmentEligible(...)` combine current doc lookup with paginated fragments. | Keep current-shape until paragraph lookup, table-cell ancestry, and paginated fragment identity have v2-aware adapters. |
| Browser pagination and preview | Layout compatibility reader | `src/app/editor/_components/browserPaginationStrategy.ts` `estimateDocumentPaginationWeight(...)`; `shell/useEditorPreviewDocumentController.ts` `paginatePreviewDoc(...)`; `shell/useWysiwygDraftPaginationController.ts` paginates `DocumentNode` drafts. | Do not flip before the pagination snapshot identity lane. |
| Export controller | Export compatibility reader | `src/app/editor/_components/shell/useEditorExportController.ts` takes `docRef: MutableRefObject<DocumentNode>` and `resolvePreviewDoc(doc: DocumentNode)`. | Keep export input current-shape until pagination/render contracts accept v2. |

## First V2-First Hot Path

Status: completed as Patch 5.1.

Selected path: graph-backed operation preflight.

Why this path:

- It runs before mutation and can reject unresolved or disallowed targets without
  changing document output.
- It is already isolated behind `EditorOperationEnvelope.runtime.documentGraph`.
- It avoids render/export/pagination shape changes.

Evidence:

- `src/app/editor/_components/operations/editorNodeOperationPlans.ts`
  `createNodeDeleteCommitResult(...)` reads
  `createOperationDocumentGraphDiagnostics(...)` and
  `createEditorGraphPlanningDecision(...)` before calling current-shape
  `deleteNode(...)`.
- `src/app/editor/_components/operations/editorGraphPlanningDecision.ts`
  `createEditorGraphPlanningDecision(...)` switches to scoped validation and
  document-v2 diagnostics only when the graph source is `document-v2`.
- Focused operation tests cover node, flow-row, table, paragraph, list, and drag
  graph decisions.

## Stop Conditions

Stop for owner review before:

- flipping `EditorState.doc` to DocumentNode v2
- changing pagination/export/render input shape
- removing `adaptDocumentV2ToCurrentDocument(...)`
- removing current runtime table nested-node compatibility
- changing persisted package semantics

Continue without per-patch approval when:

- the patch only adds or reuses graph runtime identity
- behavior is unchanged and focused tests cover the boundary
- current runtime compatibility stays intact

## Verification Plan

For Phase 1 patches:

- focused operation runtime and graph diagnostics tests
- focused operation planner tests for any migrated group
- `npm.cmd run type-check`
- `npm.cmd run test:app` after touching `EditorShell` or shared operation
  runtime
- `npm.cmd run test -w packages/core -- documentV2` when changing core v2 graph
  helpers
- `git diff --check`

Browser smoke is not required for a pure graph identity helper, but becomes
required before claiming responsiveness or visual stability improvements.

## Job Ledger

| Item | Status | Purpose | Verification | Notes |
|---|---|---|---|---|
| 0.1 | done | Create Phase 1 runtime v2 primary-path plan. | Docs diff check. | No runtime behavior change. |
| 1.1 | done | Add reusable editor document graph runtime identity. | Operation runtime/diagnostics tests and type-check passed. | `createEditorDocumentGraphRuntime(...)` owns v2 document/index identity. |
| 2.1 | done | Reuse graph runtime identity from shell dispatch. | Focused operation tests, type-check, and full app test passed. | `EditorShell` cache reuses graph runtime per `state.doc` identity. |
| 3.1 | done | Route diagnostics through graph identity without rebuilding index when present. | Graph diagnostics tests and type-check passed. | Completed as part of Patch 1.1. |
| 4.1 | done | Classify current-shape compatibility readers. | Docs + rg evidence. | Precondition for broader runtime flip. |
| 5.1 | done | Identify first v2-first hot path. | Focused operation tests and full app test passed. | Graph-backed operation preflight is the bounded first path. |
| 6.1 | done | Verify Phase 1 and prepare handoff. | Focused operation tests, type-check, full app test, and `git diff --check` passed. | Next lane is operation semantics without action dependency. |

## Current Position

- Request: start going through the architecture evolution plan one phase at a
  time.
- Parent plan: `docs/EDITOR_ARCHITECTURE_EVOLUTION_PLAN.md`.
- Current phase: Phase 1, Runtime Document Model v2 primary path.
- Current job item: Phase 1 complete.
- Status: Patch 1.1, Patch 2.1, Patch 4.1, Patch 5.1, and verification
  complete.
- Next architecture lane: Operation semantics without action dependency.
