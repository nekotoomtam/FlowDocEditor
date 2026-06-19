# Document Model v2 Plan

Status: Completed against the Document Model v2 whole-plan gate. The v2
contract, schema/assert/migration foundation, graph index, table operation
boundary, graph-backed editor operation planning, v2 stress fixtures, and
authored package output are implemented and verified. Editor runtime still
stores the current v1 document shape for layout/render/export compatibility,
while import/export/persistence use DocumentNode v2 at the authored storage
boundary.

Use this document before changing authored document schema, node graph
traversal, table storage, flow-row/flow-stack behavior, long-document stress
fixtures, import/export package semantics, or editor operation planning that
depends on node parentage.

This is a plan-level decision made before production users exist. The goal is
to remove known structural debt now rather than preserve a pre-production shape
that would make editor stability and operation ownership harder later.

## Request

The owner accepted the unified graph direction for the next document model:

```text
DocumentNode v2
  -> one section node graph
  -> one active container family: flow-row / flow-stack
  -> table rows, cells, and cell content in the same section node map
  -> runtime graph index for parentage and capabilities
  -> new fixtures built from the v2 contract
```

The accepted option is the previous "Option B: Document Model v2 as Unified
Graph" proposal.

The Phase 1 design contract lives in
`docs/DOCUMENT_MODEL_V2_CONTRACT.md`.

## Current Evidence

Current code supports more shapes than the target model should keep:

- `packages/core/src/schema/block.ts` defines both legacy `stack` / `row` and
  active `flow-stack` / `flow-row` node families.
- `packages/core/src/schema/table.ts` defines `flow-table.nodes`, so table rows,
  cells, and cell content can live in a second nested node graph inside a table.
- `packages/core/src/schema/document.ts` also defines section-level `nodes`,
  making the current authored model a graph that can contain a nested graph.
- `packages/core/src/document/operations.ts` parent lookup has to understand
  body, row/stack, flow-row/flow-stack, and flow-table-cell containment.
- `packages/core/src/document/assert.ts` has separate validation paths for
  legacy row/stack width share and flow-row/flow-stack width share.
- `docs/FLOW_ROW_STACK_SPEC.md` was written for a compatibility period where
  `row` / `stack` remained stable primitives.
- `docs/FLOW_TABLE_SPEC.md` documents the current table semantics with an
  internal `nodes` map.

These facts are acceptable as the current implementation, but they are not the
target architecture for the next stability-focused model.

## Decision

Document Model v2 will use a single authored node graph per section.

Rules:

- `section.nodes` is the only authored node map for section-local content.
- `flow-row` and `flow-stack` are the only active side-by-side container family
  in v2.
- Legacy `row` and `stack` are not valid targets for new v2 fixtures, tests, or
  editor authoring.
- Legacy `row` and `stack` may exist only as import-only v1 compatibility while
  migration code still needs them.
- `flow-table`, `flow-table-row`, and `flow-table-cell` remain the current node
  type names unless a later explicit rename is accepted.
- Table rows, table cells, and cell child blocks are stored in `section.nodes`,
  not inside `flow-table.nodes`.
- Parentage, child order, section membership, table membership, and node
  capabilities are derived into a runtime `DocumentGraphIndex`.
- `DocumentGraphIndex` is not persisted in FlowDoc packages, export output, or
  authored JSON.
- Operations should consume the graph index and node capability contract instead
  of reimplementing traversal per node family.
- Paginated output remains the only layout truth. v2 must not store page
  geometry, line ranges, continuation flags, or render fragments in
  `DocumentNode`.

## Decision Gate Confirmation

The accepted Phase 1 gates are:

| Gate | Decision |
|---|---|
| Document/package versioning | `DocumentNode.version` becomes `2`; `FlowDocPackage.packageVersion` may remain `2` because package version and document version are separate. |
| Canonical authoring | New editor-authored documents should use Document Model v2 after migration is implemented. |
| Flow Table naming | Keep `flow-table`, `flow-table-row`, and `flow-table-cell` names in this slice. |
| Flow Row naming | Keep `flow-row` and `flow-stack` names in this slice. |
| Legacy row/stack | Do not author `row` / `stack` in v2. Import should explicitly migrate compatible v1 `row` / `stack` content to `flow-row` / `flow-stack`; reject only when migration cannot produce a valid graph. |
| Old mocks | Keep old JSON mocks as legacy baselines until v2 fixture replacements exist; do not let old mocks define the target architecture. |

## Target Authored Shape

This is a contract sketch, not final TypeScript:

```ts
type DocumentNodeV2 = {
  schemaVersion: 2;
  id: string;
  title?: string;
  sections: DocumentSectionV2[];
};

type DocumentSectionV2 = {
  id: string;
  roots: {
    body: NodeId;
    header?: NodeId;
    footer?: NodeId;
  };
  nodes: Record<NodeId, AuthoredNodeV2>;
};

type AuthoredNodeV2 =
  | BodyNodeV2
  | FlowRowNodeV2
  | FlowStackNodeV2
  | FlowTableNodeV2
  | FlowTableRowNodeV2
  | FlowTableCellNodeV2
  | ParagraphNodeV2
  | SpacerNodeV2
  | DividerNodeV2
  | PageBreakNodeV2
  | TocNodeV2;

type FlowTableNodeV2 = {
  id: NodeId;
  type: "flow-table";
  props: FlowTableProps;
  columns: FlowTableColumn[];
  rowIds: NodeId[];
};

type FlowTableRowNodeV2 = {
  id: NodeId;
  type: "flow-table-row";
  props: FlowTableRowProps;
  cellIds: NodeId[];
};

type FlowTableCellNodeV2 = {
  id: NodeId;
  type: "flow-table-cell";
  props: FlowTableCellProps;
  childIds: NodeId[];
};
```

## Runtime Graph Index

The editor and core operations should derive an index from `DocumentNodeV2`.

Minimum index fields:

```ts
type DocumentGraphIndex = {
  parentById: Map<NodeId, NodeParentRef>;
  sectionById: Map<NodeId, SectionId>;
  childrenById: Map<NodeId, NodeId[]>;
  nodeTypeById: Map<NodeId, AuthoredNodeV2["type"]>;
  tableByDescendantId: Map<NodeId, NodeId>;
  capabilitiesByType: Record<AuthoredNodeV2["type"], NodeCapabilities>;
};
```

Rules:

- The index is rebuilt or incrementally updated as runtime state, not authored
  document data.
- The index is the common source for delete, duplicate, reorder, split, merge,
  table structure edits, selection routing, and operation target scope.
- Parent pointers should not be persisted unless a later design proves that the
  consistency cost is worth it.

## Node Capability Contract

Each node type needs a declarative capability description.

Examples:

```ts
type NodeCapabilities = {
  childrenField?: "childIds" | "rowIds" | "cellIds";
  allowedChildTypes: string[];
  layoutRole:
    | "root"
    | "block"
    | "flow-row"
    | "flow-stack"
    | "table"
    | "table-row"
    | "table-cell"
    | "inline-container";
  canContainText: boolean;
  canSplitAcrossPages: boolean;
  canBeDeleted: boolean;
  canBeDuplicated: boolean;
  canBeReordered: boolean;
};
```

Operation planning should ask the capability contract what a node can do rather
than scatter switch statements across reducer, operation helpers, assert, and
layout code.

## Paragraph Style Direction

v2 should make paragraph style truth explicit.

Current paragraph data still mixes direct formatting props with
`paragraphStyleId` and `styleOverrides`. For v2, canonical authored style should
move toward:

- `styleId` for the named base style
- `styleOverrides` for intentional local differences
- semantic paragraph behavior such as list binding, keep rules, and box policy
- resolved visual style only as derived runtime/export data, not canonical
  authored truth

This can be staged after the graph model if it would make the first v2 slice too
large, but new fixtures should avoid expanding direct formatting as the primary
truth.

## Fixture Direction

Old JSON mocks should not define v2 architecture.

New fixture rules:

- Build new fixtures from this v2 contract.
- Do not use legacy `row` / `stack` in new fixtures.
- Do not use `flow-table.nodes` in v2 fixtures.
- Do not hardcode generated ids in browser scripts as product targets.
- Add semantic target aliases near the fixture manifest, such as:
  - `targets.typing.primary`
  - `targets.typing.boundary`
  - `targets.node.delete`
  - `targets.node.duplicate`
  - `targets.node.reorderSource`
  - `targets.flowRow.resizeTarget`
  - `targets.table.primaryCell`

## Phase Map

Parent goal:

- Make the authored document model stable enough for operation-first editing
  and long-document responsiveness before production users exist.

Current job lane:

- Document Model v2 architecture and migration plan.

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 0 | Lock decision | Docs only | Accepted direction is written and indexed | done | This document and `docs/DOCS_INDEX.md` |
| 1 | Define v2 contract | Schema/design docs | Node graph, capabilities, table storage, and style direction are explicit | done | `docs/DOCUMENT_MODEL_V2_CONTRACT.md` |
| 2 | Decide import boundary | Package/import docs and migration helper | v1 import-only rules and package-v2/document-v2 helper are clear | done | `migratePersistedDocumentPackageToDocumentV2(...)` |
| 3 | Implement schema foundation | Core schema/normalize/assert | v2 section graph validates without nested table maps or legacy row/stack authoring | done | `DocumentNodeV2Schema`, `assertDocumentV2(...)`, `migrateDocumentToV2(...)`, `documentV2` tests |
| 4 | Add graph index | Core document utilities and editor operation planning | Operations can resolve parent/children/capabilities through one index | done | `buildDocumentGraphIndexV2(...)`, `getDocumentGraphSiblingContextV2(...)`, `orderedDocumentParagraphsV2(...)`, `adaptDocumentV2ToCurrentDocument(...)`, `createDocumentGraphDiagnosticsFromV2(...)`, `createOperationDocumentGraphDiagnostics(...)`, `createEditorGraphPlanningDecision(...)`, `attachEditorOperationDocumentGraphRuntime(...)`, `parsePersistedDocument(...)` v2 adapter path; node, flow-row, table, paragraph, list, and drag planning consume operation runtime DocumentNode v2 graph diagnostics/preflight/scoped policy where safe; scoped validation has an explicit full-validation fallback deferral recorded in `docs/EDITOR_OPERATION_ARCHITECTURE.md`; focused graph-backed operation tests pass |
| 5 | Flatten table operations | Core table operations, layout, pagination adapters | Table row/cell/content parentage uses section graph while preserving grid law | done | `resolveFlowTableFromSectionGraphV2(...)`, `addFlowTableRowV2(...)`, `removeFlowTableRowV2(...)`, `addFlowTableColumnV2(...)`, `removeFlowTableColumnV2(...)`, `resizeFlowTableColumnPairV2(...)`, `fitFlowTableToSectionWidthV2(...)`, `updateFlowTableCellSpanV2(...)`, `deleteEmptyFlowTableCellParagraphV2(...)`, `documentV2` table operation tests |
| 6 | Rebuild fixtures | `public/mock`, smoke scripts, fixture docs | Stress fixtures use v2 and semantic target aliases | done | `public/mock/stress-typing-v2.flowdoc.json`, `public/mock/stress-node-mutations-v2.flowdoc.json`, `public/mock/stress-flow-row-v2.flowdoc.json`, `public/mock/stress-table-v2.flowdoc.json`, `public/mock/flowdoc-v2-mock-manifest.json`, `documentV2StressFixture.test.ts`, `scripts/flowdoc-fixture-targets.mjs`, v2 smoothness/lifecycle smoke alias runs |
| 7 | Retire v1 authoring paths | Editor UI/tests/docs | New authoring no longer emits legacy row/stack or nested table nodes | done | `createAuthoredDocumentPackageV2(...)`, localStorage/export persistence tests, v1 runtime compatibility audit; final review gate passed |

## Whole Plan Completion Gate

This plan is complete only when the Document Model v2 lane is no longer just an
import/adapter path.

Completion requires:

- Phase 4 is closed by automatic operation runtime graph injection, or by an
  explicit scoped-validation deferral that is recorded outside this phase.
- Phase 5 remains green: v2 table mutations preserve flattened section graph
  storage and Flow Table grid law.
- Phase 6 provides v2 stress fixtures with semantic aliases for typing, node
  mutation, flow-row, and table workflows, plus browser smoke evidence.
- Phase 7 prevents new editor authoring from emitting legacy `row` / `stack`
  or nested `flow-table.nodes`.
- Persistence/import/export boundaries still accept v1 as import-only
  compatibility while new authored output uses v2 semantics.
- Verification has passed at the required levels: focused core/app tests,
  type-check, full app/core suites, diff hygiene, and the named browser smoke
  gates when the environment can run them.

Do not call the whole plan done while any required phase is `pending`,
`in_progress`, or `blocked`. A phase may be marked `deferred` only when the
deferral is explicit, bounded, and not needed for the owner-stated stability
goal.

## Detailed Remaining Phase Breakdown

| Phase item | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 4A | Build v2 graph index and traversal helpers | Core document utilities | Parent, child, sibling, table, and paragraph traversal resolves from one index | done | `buildDocumentGraphIndexV2(...)`, `getDocumentGraphChildrenV2(...)`, `getDocumentGraphSiblingContextV2(...)`, `orderedDocumentParagraphsV2(...)` |
| 4B | Make editor operation planning consume graph diagnostics | Editor operation plans | Node, flow-row, table, paragraph, list, and drag planning share graph decision vocabulary | done | `createOperationDocumentGraphDiagnostics(...)`, `createEditorGraphPlanningDecision(...)`, operation plan tests |
| 4C | Inject v2 graph runtime automatically | Editor operation dispatch/runtime | Operation envelopes get a graph runtime from the current/v2 document boundary without test-only manual wiring | done | `attachEditorOperationDocumentGraphRuntime(...)`, `EditorShell.dispatchEditorOperation(...)`, `editorOperationRuntime.test.ts` |
| 4D | Resolve scoped validation policy | Operation commit adapter and validation docs | `validationPolicy: "scoped"` either has an implemented scoped validator or an explicit full-fallback deferral outside Phase 4 | deferred | `commitEditorOperationResult(...)` still routes non-`prevalidated` document commits through `pushDoc(...)`; explicit deferral recorded in `docs/EDITOR_OPERATION_ARCHITECTURE.md` |
| 4E | Close operation stability evidence | Editor stability gates | Graph-backed operation paths pass focused tests and named smoke checks where applicable | done | `npm.cmd run test:app -- editorOperationRuntime + graph-backed operation plan tests` passed 8 files / 48 tests |
| 6A | Keep first v2 stress fixture usable | Public mock and fixture target helper | Existing v2 fixture imports, validates, and exposes semantic target aliases | done | `stress-node-mutations-v2.flowdoc.json`, `flowdoc-v2-mock-manifest.json`, `scripts/flowdoc-fixture-targets.mjs` |
| 6B | Add fixture breadth | Public mock and fixture generator | Separate or expanded v2 fixtures cover typing, node mutations, flow-row, and table workflows without legacy row/stack or nested table maps | done | `generate-flowdoc-v2-fixtures.mjs`, four v2 fixture files, `documentV2StressFixture.test.ts` |
| 6C | Add table/flow-row target aliases | Fixture metadata and smoke scripts | Browser probes can target table and flow-row workflows by semantic alias, not generated ids | done | `flowdoc-v2-mock-manifest.json`, `scripts/flowdoc-fixture-targets.mjs`, `scripts/flowdoc-fixture-targets.test.mjs` |
| 6D | Record browser stress evidence | Browser smoke scripts | v2 smoothness and lifecycle smoke pass with console/page errors at zero, or environment limits are recorded | done | `smoke:wysiwyg-smoothness` and `smoke:wysiwyg-stress-lifecycle` against `stress-typing-v2` semantic aliases passed on bundled Chromium |
| 6E | Update fixture catalog and stability docs | Docs | Fixture ownership and coverage gaps reflect the new v2 fixture set | done | `docs/FIXTURE_CATALOG.md`, `docs/EDITOR_STABILITY_GATES.md` |
| 7A | Audit remaining v1 authoring paths | Editor/core/docs | Remaining producers of legacy `row` / `stack` or nested `flow-table.nodes` are listed with owner layer and migration path | done | Audit: palette row/columns map to `flow-row`; `createDefaultFlowTable(...)` remains current runtime shape; `adaptDocumentV2ToCurrentDocument(...)` intentionally re-nests tables for runtime compatibility; v1 mocks remain legacy baselines |
| 7B | Switch new authored output to v2 semantics | Editor persistence/default document path | New local authored output no longer writes v1-only authoring shape while v1 remains import-only | done | `createAuthoredDocumentPackageV2(...)`, `saveDocumentToStorage(...)`, `serializeDocumentPackage(...)`, `serializeDocumentPackageWithFields(...)`, `documentPersistence.test.ts` |
| 7C | Route editor table/flow-row authoring through v2-compatible helpers | Editor operation plans and core helpers | Add/remove/update authoring paths preserve v2 graph semantics and do not create nested table maps for new authored output | done | Authored package emission migrates current runtime edits through `migrateDocumentToV2(...)`; table regression test asserts exported `flow-table` has no `nodes` map and descendants live in section graph; direct v2 table helpers remain available from Phase 5 |
| 7D | Preserve import/export/pagination contracts | Persistence, layout, export | v1 compatibility imports still work; pagination/export truth remains `PaginatedDocument`, not persisted graph state | done | `parsePersistedDocument(...)` accepts v1 and DocumentNode v2 through adapter; exported JSON does not persist pagination; persistence tests cover v2 package parse back to current runtime |
| 7E | Retire or demote legacy mocks | `public/mock`, docs, tests | Old v1 JSON mocks are either replaced by v2 fixtures or explicitly labeled legacy regression baselines | done | `docs/FIXTURE_CATALOG.md`, `docs/EDITOR_STABILITY_GATES.md`, v2 fixture set in `public/mock` |
| 7F | Final review gate | Whole repo and browser smoke | Type-check, focused tests, full suites, diff hygiene, and relevant browser smoke pass | done | `npm.cmd run type-check`, `npm.cmd run test -w packages/core`, `npm.cmd run test:app`, focused persistence/fixture/operation suites, v2 smoothness/lifecycle smoke, and `git diff --check` passed |

Current position:

- Request: complete the whole Document Model v2 migration lane and use the
  whole-plan gate as the measurement point.
- Plan: close remaining graph-runtime, fixture, and authoring-retirement phases
  with visible phase/job tracking.
- Phase: complete.
- Job item: Document Model v2 migration lane is closed against the whole-plan
  gate.
- Status: done.
- Why this item is current: Phase 7F passed after type-check, focused tests,
  full app/core suites, browser smoke, and diff hygiene.
- Next transition: future work should start from a new plan item, with scoped
  validation and primary runtime v2 state treated as explicit follow-up lanes.

## Implementation Ledger

| Date | Phase | Item | Status | Evidence |
|---|---|---|---|---|
| 2026-06-19 | 1 | Write Document Model v2 contract. | done | `docs/DOCUMENT_MODEL_V2_CONTRACT.md` |
| 2026-06-19 | 2 | Add package-v2/document-v2 migration helper while keeping package envelope v2. | done | `migratePersistedDocumentPackageToDocumentV2(...)` |
| 2026-06-19 | 3 | Add v2 schema, v1-to-v2 migration, v2 assertion, and graph index foundation. | done | `packages/core/src/schema/documentV2.ts`, `packages/core/src/document/documentV2.ts` |
| 2026-06-19 | 3 | Verify focused v2 migration and persistence helper tests. | done | `documentV2` core test and `documentPersistence.test.ts` |
| 2026-06-19 | 3 | Close the schema/assert foundation for v2 section graph authoring. | done | `npm.cmd run test -w packages/core -- documentV2` |
| 2026-06-19 | 4 | Add graph read helpers for v2 child traversal, paragraph ordering, and sibling context. | done | `getDocumentGraphChildrenV2(...)`, `getDocumentGraphSiblingContextV2(...)`, `orderedDocumentParagraphsV2(...)` |
| 2026-06-19 | 4 | Add temporary v2-to-current runtime adapter for layout/export transition tests. | done | `adaptDocumentV2ToCurrentDocument(...)` |
| 2026-06-19 | 4 | Add v2 field registry validation and direct package-v2/document-v2 migration acceptance. | done | `validateFieldRegistryReferencesV2(...)`, `migratePersistedDocumentPackageToDocumentV2(...)` |
| 2026-06-19 | 4 | Start editor operation planning graph-context diagnostics for node and flow-row operation groups. | done | `editorDocumentGraphDiagnostics.ts`, `editorFlowRowOperationPlans.ts` |
| 2026-06-19 | 4 | Extend editor operation planning graph-context diagnostics to table structure operation groups. | done | `editorTableOperationPlans.ts`, `editorTableOperationPlans.test.ts` |
| 2026-06-19 | 4 | Move document settings operation planning into operation result helpers. | done | `editorDocumentSettingsOperationPlans.ts`, `editorDocumentSettingsOperationPlans.test.ts` |
| 2026-06-19 | 4 | Move text draft/commit operation planning into operation result wrappers. | done | `editorTextCommitPlans.ts`, `editorTextCommitPlans.test.ts` |
| 2026-06-19 | 4 | Move node props and field patch operation planning into operation result helpers. | done | `editorNodePropsOperationPlans.ts`, `editorFieldOperationPlans.ts` |
| 2026-06-19 | 4 | Move style patch operation planning and heading guard policy into operation result helpers. | done | `editorStyleOperationPlans.ts`, `editorStyleOperationPlans.test.ts` |
| 2026-06-19 | 4 | Move list structure commit policy into operation result helpers. | done | `editorListOperationPlans.ts`, `editorListOperationPlans.test.ts` |
| 2026-06-19 | 4 | Move drag placement commit policy into operation result helpers. | done | `editorDragOperationPlans.ts`, `editorDragOperationPlans.test.ts` |
| 2026-06-19 | 4 | Move paragraph split/merge commit policy into operation result helpers. | done | `editorParagraphOperationPlans.ts`, `editorParagraphOperationPlans.test.ts` |
| 2026-06-19 | 4 | Add v2 graph-index diagnostics boundary without flipping editor runtime state. | done | `createDocumentGraphDiagnosticsFromV2(...)`, `editorDocumentGraphDiagnostics.test.ts` |
| 2026-06-19 | 4 | Let the persisted editor import path accept valid DocumentNode v2 input through the current runtime adapter. | done | `parsePersistedDocument(...)`, `adaptDocumentV2ToCurrentDocument(...)`, `documentPersistence.test.ts` |
| 2026-06-19 | 4 | Add the first operation-level DocumentNode v2 graph consumer in node mutation planning. | done | `EditorOperationEnvelope.runtime.documentGraph`, `createOperationDocumentGraphDiagnostics(...)`, `editorNodeOperationPlans.test.ts` |
| 2026-06-19 | 4 | Use DocumentNode v2 graph capabilities as node mutation planning preflight and scoped validation policy. | done | `createNodeGraphPlanningDecision(...)`, `editorNodeOperationPlans.test.ts` |
| 2026-06-19 | 4 | Extract graph-backed planning decisions into a shared operation utility and apply it to flow-row and table planning. | done | `createEditorGraphPlanningDecision(...)`, `editorFlowRowOperationPlans.test.ts`, `editorTableOperationPlans.test.ts` |
| 2026-06-19 | 4 | Apply shared graph-backed planning to paragraph, list, and drag operation groups. | done | `editorParagraphOperationPlans.test.ts`, `editorListOperationPlans.test.ts`, `editorDragOperationPlans.test.ts` |
| 2026-06-19 | 4 | Inject DocumentNode v2 graph runtime through the real editor operation dispatch path. | done | `attachEditorOperationDocumentGraphRuntime(...)`, `EditorShell.dispatchEditorOperation(...)`, `editorOperationRuntime.test.ts` |
| 2026-06-19 | 4 | Record scoped validation as an explicit full-validation fallback deferral outside Phase 4. | deferred | `docs/EDITOR_OPERATION_ARCHITECTURE.md`, `commitEditorOperationResult(...)` |
| 2026-06-19 | 4 | Close focused graph-backed operation stability evidence. | done | `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorOperationRuntime.test.ts src/app/editor/_components/operations/__tests__/editorNodeOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorFlowRowOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorTableOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorParagraphOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorListOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDragOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDocumentGraphDiagnostics.test.ts` |
| 2026-06-19 | 5 | Add direct DocumentNode v2 table operation helpers that read table parentage from `section.nodes` and write row/cell/content mutations back to flattened graph storage. | done | `resolveFlowTableFromSectionGraphV2(...)`, `addFlowTableRowV2(...)`, `removeFlowTableRowV2(...)`, `addFlowTableColumnV2(...)`, `removeFlowTableColumnV2(...)`, `resizeFlowTableColumnPairV2(...)`, `fitFlowTableToSectionWidthV2(...)`, `updateFlowTableCellSpanV2(...)`, `deleteEmptyFlowTableCellParagraphV2(...)`, `npm.cmd run test -w packages/core -- documentV2` |
| 2026-06-19 | 6 | Add the first v2 stress fixture with semantic target aliases. | done | `stress-node-mutations-v2.flowdoc.json`, `flowdoc-v2-mock-manifest.json`, `documentV2StressFixture.test.ts` |
| 2026-06-19 | 6 | Wire browser smoke scripts to consume v2 fixture semantic target aliases. | done | `scripts/flowdoc-fixture-targets.mjs`, `scripts/wysiwyg-smoothness-probe.mjs`, `scripts/wysiwyg-stress-lifecycle-smoke.mjs`, v2 smoothness and lifecycle smoke runs |
| 2026-06-19 | 6 | Expand v2 stress fixtures into typing, node, flow-row, and table workflow variants. | done | `stress-typing-v2.flowdoc.json`, `stress-node-mutations-v2.flowdoc.json`, `stress-flow-row-v2.flowdoc.json`, `stress-table-v2.flowdoc.json`, `generate-flowdoc-v2-fixtures.mjs` |
| 2026-06-19 | 6 | Verify every v2 fixture variant imports, asserts as DocumentNode v2, and resolves semantic aliases through the graph index. | done | `npm.cmd run test:app -- scripts/flowdoc-fixture-targets.test.mjs src/app/editor/_components/__tests__/documentV2StressFixture.test.ts` |
| 2026-06-19 | 6 | Update fixture catalog and stability gates for the v2 fixture set. | done | `docs/FIXTURE_CATALOG.md`, `docs/EDITOR_STABILITY_GATES.md` |
| 2026-06-19 | 6 | Record v2 browser smoke evidence on semantic typing aliases. | done | `FLOWDOC_PROBE_FILE=public/mock/stress-typing-v2.flowdoc.json PROBE_TARGET_ALIAS=typing.primary npm.cmd run smoke:wysiwyg-smoothness`; `FLOWDOC_STRESS_FILE=public/mock/stress-typing-v2.flowdoc.json STRESS_FIRST_TARGET_ALIAS=typing.primary STRESS_SECOND_TARGET_ALIAS=typing.boundary npm.cmd run smoke:wysiwyg-stress-lifecycle` |
| 2026-06-19 | 7 | Audit remaining v1/current runtime compatibility surfaces and classify retained paths. | done | `rg` audit; `createDefaultFlowTable(...)` and `adaptDocumentV2ToCurrentDocument(...)` retained as runtime/import compatibility, not persisted v2 authoring |
| 2026-06-19 | 7 | Close Document Model v2 lane against the whole-plan gate. | done | `npm.cmd run type-check`; `npm.cmd run test -w packages/core`; `npm.cmd run test:app`; focused persistence/fixture/operation suites; v2 smoothness/lifecycle smoke; `git diff --check` |
| 2026-06-19 | 7 | Switch authored localStorage and JSON package export to DocumentNode v2 storage. | done | `createAuthoredDocumentPackageV2(...)`, `saveDocumentToStorage(...)`, `serializeDocumentPackage(...)`, `serializeDocumentPackageWithFields(...)` |
| 2026-06-19 | 7 | Add regression coverage that authored flow-table package output is flattened v2 storage. | done | `documentPersistence.test.ts` asserts exported `flow-table` has no `nodes` and parse adapts it back to current runtime |

## Migration Strategy

Because there are no production users, v2 does not need to preserve every old
pre-production fixture shape.

Recommended approach:

1. Treat current model as v1/current, not final architecture.
2. Keep v1 import helpers only where they are needed to open existing local
   development files or tests during transition.
3. Do not create new v1-style fixtures.
4. Convert or delete old internal mocks when a v2 replacement exists.
5. Flatten `flow-table.nodes` into `section.nodes` through an explicit one-way
   migration helper for v1 imports.
6. Treat legacy `row` / `stack` as unsupported in new v2 authoring. If a v1
   import contains compatible legacy row/stack content, migrate it to
   `flow-row` / `flow-stack`. Reject only when migration cannot produce a valid
   v2 graph without data loss.

## Alternatives Rejected

### v1.5 Clean Legacy

Rejected as the main path because it keeps nested table graphs and two
container families. It can reduce short-term churn, but it does not fix the
core stability problem.

### Subdocument Island

Rejected as the default because keeping table as an isolated subdocument means
operations still need graph-boundary logic. Use this only if a future product
requirement proves that embedded portable subdocuments matter more than editor
operation simplicity.

### Nested Tree

Rejected because it makes id-based structural editing, undo/redo, scoped
mutation, and long-document indexing harder. It is easier to read as JSON but
not better for this editor.

## Verification Plan

For this docs-only decision:

- Review docs diff.
- Ensure `docs/DOCS_INDEX.md` points to this plan.
- Ensure `docs/DOCS_INDEX.md` points to the Phase 1 contract.
- Ensure current v1 specs state how they relate to the v2 direction.

For future implementation:

- Schema tests for valid v2 graph and invalid legacy/nested-table authoring.
- Normalize/assert tests for parent/child/table/capability invariants.
- Operation tests for delete, duplicate, reorder, split, merge, and table
  structure through `DocumentGraphIndex`.
- Pagination tests proving v2 table and flow-row/flow-stack output still
  produces the same layout truth in `PaginatedDocument`.
- Renderer tests proving PDF/DOCX/editor output consumes paginated fragments and
  does not invent a second layout policy.
- Browser stress smokes against v2 fixtures with semantic target aliases.

Current foundation verification:

- `npm.cmd run test -w packages/core -- documentV2`
- `npm.cmd run test -w packages/core -- fieldRegistry`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorFlowRowOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorTableOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorDocumentSettingsOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorTextCommitPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorNodePropsOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorFieldOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorStyleOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorListOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorDragOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorParagraphOperationPlans.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorDocumentGraphDiagnostics.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorNodeOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDocumentGraphDiagnostics.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorNodeOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorFlowRowOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorTableOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDocumentGraphDiagnostics.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorParagraphOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorListOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDragOperationPlans.test.ts src/app/editor/_components/operations/__tests__/editorDocumentGraphDiagnostics.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentV2StressFixture.test.ts`
- `npm.cmd run test:app -- scripts/flowdoc-fixture-targets.test.mjs`
- `npm.cmd run test -w packages/core -- documentV2`
- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core`
- `npm.cmd run test:app`
- `git diff --check`
- `$env:FLOWDOC_PROBE_FILE="public/mock/stress-typing-v2.flowdoc.json"; $env:PROBE_TARGET_ALIAS="typing.primary"; $env:PROBE_BURST_LENGTH="1"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness`
- `$env:FLOWDOC_STRESS_FILE="public/mock/stress-typing-v2.flowdoc.json"; $env:STRESS_FIRST_TARGET_ALIAS="typing.primary"; $env:STRESS_SECOND_TARGET_ALIAS="typing.boundary"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-stress-lifecycle`

## Stop Conditions

Stop for an owner checkpoint if:

- v2 needs a product-facing rename from `flow-*` names to plain names such as
  `table`, `row`, or `column`.
- migration policy must preserve unknown external documents.
- implementation would change export or pagination semantics before the v2
  graph contract is accepted.
- tests reveal that a v2 graph invariant contradicts an accepted product
  scenario.

## Related Docs

- `docs/EDITOR_OPERATION_ARCHITECTURE.md`
- `docs/EDITOR_OPERATION_SOURCE_OF_TRUTH_PLAN.md`
- `docs/DOCUMENT_MODEL_V2_CONTRACT.md`
- `docs/FLOW_ROW_STACK_SPEC.md`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
