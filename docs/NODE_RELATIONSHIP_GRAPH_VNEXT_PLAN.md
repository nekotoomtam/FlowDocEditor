# Node Relationship Graph vNext Plan

Status: Phase 2 design baseline for Node Model vNext.

Use this document after `docs/NODE_MODEL_VNEXT_CONTRACT.md` when designing the
runtime relationship graph that operation planning, selection, drag/drop,
history, validation, pagination, export, and future AI/external operation calls
will consume.

This is not a runtime implementation yet. It defines the graph contract so the
implementation can move deliberately instead of letting each editor feature
infer node relationships differently.

## Request

The owner accepted a semi-rebuild direction: new architecture first, with
selective reuse of useful prototype lessons. The next step is to design the
relationship graph that makes vNext node relationships authoritative.

Request-to-plan trace:

```text
User request
  -> Node Model vNext Plan
    -> Phase 2: relationship graph design
      -> Job item: define the runtime graph contract
        -> Execution step: write this plan
```

Current position:

- Request: continue from the Node Model vNext baseline.
- Plan: Node Model vNext Plan.
- Phase: Phase 2, relationship graph design.
- Job item: define graph indexes, surfaces, typed selection/drop, and scopes.
- Status: done.
- Why this item is current: the node set is now explicit, but editor behavior
  still needs one runtime truth for parentage, surfaces, scope, and allowed
  operations.
- Next transition: Phase 5, operation planning integration. Package/schema and
  prototype adapter boundaries are captured in
  `docs/NODE_MODEL_VNEXT_PACKAGE_SCHEMA_BOUNDARY_PLAN.md` and
  `docs/NODE_MODEL_VNEXT_PROTOTYPE_ADAPTER_PLAN.md`.

## Inputs

Primary contract:

- `docs/NODE_MODEL_VNEXT_CONTRACT.md`
- `docs/NODE_MODEL_VNEXT_PACKAGE_SCHEMA_BOUNDARY_PLAN.md`
- `docs/NODE_MODEL_VNEXT_PROTOTYPE_ADAPTER_PLAN.md`

Prototype evidence:

- `packages/core/src/document/documentV2.ts` already has
  `DocumentGraphIndexV2`, parent references, children indexes,
  table-descendant ownership, and node capabilities.
- `packages/core/src/placement/types.ts` already describes a useful
  drag/drop pipeline: pointer -> geometry -> zone -> intent -> law ->
  operation -> transform.
- `docs/EDITOR_OPERATION_ARCHITECTURE.md` already says operation planning
  should declare validation, history, render, preview settle, and focus
  policies before reducer commit.
- `docs/EDITOR_UX_CONTRACT.md` already separates editor-only interaction state
  such as selection, hover, drag, resize, caret, and focus from authored
  document state.
- `docs/PRODUCT_REPORT_V2_SCENARIO_CONTRACT.md` is the current product anchor
  for checking whether the model serves a real workflow.

Prototype constraints that should not bind vNext:

- `paragraph` as the only text block name.
- `row` / `stack` or `flow-row` / `flow-stack` as final layout node names.
- header/footer roots disguised as stacks or bodies without a zone role.
- placement operations that carry legacy parent container types such as
  `body`, `stack`, or `flow-stack`.
- a single untyped `selectedNodeId` representing text, node, table, column, and
  zone selection.

## Goal

Define one runtime graph contract that answers:

- where every node lives;
- what every node can contain;
- what every node can do;
- which surface an operation belongs to;
- where selection can legally point;
- where a drag/drop target can legally resolve;
- what history scope an operation should use;
- what validation scope is required;
- what pagination/export scope is affected.

## Non-Goals

- Do not implement the graph in code in this phase.
- Do not rename existing runtime nodes yet.
- Do not change persisted document or package version.
- Do not delete current v2 graph/fixture/smoke coverage.
- Do not lower existing smoke thresholds.
- Do not choose final migration mechanics before the package/schema boundary
  is designed.

## Core Principle

The graph is the shared relationship truth.

```text
Authored document
  -> Relationship graph
    -> operation planning
    -> selection validation
    -> drop target law
    -> history policy
    -> validation policy
    -> pagination/export invalidation
```

No layer should recompute parentage or container semantics from scratch when a
graph query already answers it.

## Graph Shape

Suggested runtime shape:

```ts
type NodeRelationshipGraph = {
  document: DocumentModelVNext;
  nodesById: Map<NodeId, AuthoredNode>;
  sectionsById: Map<SectionId, SectionNode>;
  zonesById: Map<NodeId, ZoneNode>;
  sectionByNodeId: Map<NodeId, SectionId>;
  zoneByNodeId: Map<NodeId, NodeId>;
  parentByNodeId: Map<NodeId, ParentRef>;
  childrenByNodeId: Map<NodeId, readonly NodeId[]>;
  siblingsByNodeId: Map<NodeId, SiblingContext>;
  ancestorsByNodeId: Map<NodeId, readonly NodeId[]>;
  descendantsByNodeId: Map<NodeId, readonly NodeId[]>;
  nearestByNodeId: Map<NodeId, NearestContext>;
  capabilitiesByType: Record<NodeType, NodeCapabilities>;
  surfacesByNodeId: Map<NodeId, NodeSurfaces>;
  scopesByNodeId: Map<NodeId, NodeScopes>;
  diagnostics: RelationshipGraphDiagnostics;
};
```

The graph is derived from the authored document and rebuilt or incrementally
updated after authored document changes. It is not persisted.

## Parent References

Parent references must point to the actual relationship field, not a generic
"container" guess.

```ts
type ParentRef =
  | { kind: "document"; childField: "sectionIds"; index: number }
  | { kind: "section"; sectionId: SectionId; childField: "zoneIds"; index: number }
  | { kind: "zone"; sectionId: SectionId; zoneId: NodeId; childField: "childIds"; index: number }
  | { kind: "columns"; columnsId: NodeId; childField: "columnIds"; index: number }
  | { kind: "column"; columnsId: NodeId; columnId: NodeId; childField: "childIds"; index: number }
  | { kind: "table"; tableId: NodeId; childField: "rowIds"; index: number }
  | { kind: "table-row"; tableId: NodeId; rowId: NodeId; childField: "cellIds"; index: number }
  | { kind: "table-cell"; tableId: NodeId; rowId: NodeId; cellId: NodeId; childField: "childIds"; index: number };
```

Rules:

- Every authored node except the document root must have exactly one parent.
- Parent references must carry enough context for operation planning to mutate
  the correct child list without re-traversal.
- Table descendant references must carry table id.
- Column descendant references must carry columns id.
- Zone descendant references must carry section and zone id.

## Nearest Context

Operations frequently need nearest semantic owners. The graph should precompute
or efficiently query them.

```ts
type NearestContext = {
  sectionId: SectionId;
  zoneId: NodeId;
  blockId: NodeId | null;
  textBlockId: NodeId | null;
  columnsId: NodeId | null;
  columnId: NodeId | null;
  tableId: NodeId | null;
  tableRowId: NodeId | null;
  tableCellId: NodeId | null;
};
```

Examples:

- A text-block inside a table cell has `tableId`, `tableRowId`,
  `tableCellId`, `sectionId`, and `zoneId`.
- A text-block inside a column has `columnsId`, `columnId`, `sectionId`, and
  `zoneId`.
- A heading in body has `sectionId`, `zoneId`, and `textBlockId`.

## Node Surfaces

Surfaces describe how editor systems should interact with a node.

```ts
type NodeSurfaces = {
  operation: OperationSurface;
  selection: SelectionSurface;
  drop: DropSurface;
  resize: ResizeSurface | null;
  text: TextSurface | null;
  pagination: PaginationSurface;
  export: ExportSurface;
};
```

Suggested surface values:

```ts
type OperationSurface =
  | "document"
  | "section"
  | "zone"
  | "block"
  | "text"
  | "layout-columns"
  | "table"
  | "inline";

type SelectionSurface =
  | "none"
  | "node"
  | "text"
  | "table"
  | "table-cell"
  | "column"
  | "zone";

type DropSurface =
  | "none"
  | "block-list"
  | "column-list"
  | "table-grid"
  | "inline";

type ResizeSurface =
  | "columns"
  | "column"
  | "table-column"
  | "table-row"
  | "spacer";
```

Rule:

```text
UI chrome may render many affordances, but each affordance must correspond to a
surface declared by the graph.
```

## Node Scopes

Scopes define blast radius and policy.

```ts
type NodeScopes = {
  history: HistoryScope;
  validation: ValidationScope;
  pagination: PaginationScope;
  export: ExportScope;
  renderInvalidation: RenderInvalidationScope;
};
```

Suggested scopes:

```ts
type HistoryScope =
  | "none"
  | "text-session"
  | "block-structure"
  | "layout-structure"
  | "table-structure"
  | "section-structure"
  | "document-settings";

type ValidationScope =
  | "read-only"
  | "node"
  | "parent"
  | "subtree"
  | "table"
  | "section"
  | "document";

type PaginationScope =
  | "none"
  | "text-block"
  | "block"
  | "columns"
  | "table"
  | "zone"
  | "section"
  | "document";

type ExportScope =
  | "none"
  | "zone"
  | "section"
  | "document";
```

Rules:

- History scope is operation-specific, but the graph provides the default
  scope for each target.
- Validation scope must be at least as broad as the relationship being changed.
- Pagination scope should be narrow only when the affected relation is known.
- Export scope must never depend on editor-only preview state.

## Typed Selection

The graph must validate selection.

```ts
type EditorSelection =
  | { kind: "none" }
  | { kind: "node"; nodeId: NodeId; surface: SelectionSurface }
  | { kind: "text"; textBlockId: NodeId; anchor: TextOffset; focus: TextOffset }
  | { kind: "table-cell"; tableId: NodeId; rowId: NodeId; cellId: NodeId }
  | { kind: "column"; columnsId: NodeId; columnId: NodeId }
  | { kind: "zone"; sectionId: SectionId; zoneId: NodeId };
```

Selection graph queries:

```ts
function resolveSelectionTarget(graph, rawTarget): EditorSelection;
function validateSelection(graph, selection): SelectionValidationResult;
function reconcileSelectionAfterMutation(graph, previousSelection, operationResult): EditorSelection;
```

Rules:

- `text` selection must target `text-block` only.
- `table-cell` selection must include table, row, and cell ids.
- `column` selection must include columns and column ids.
- `zone` selection must include section and zone ids.
- Selection reconciliation after mutation must be explicit: preserve, move to
  inserted node, move to parent, move to nearest editable text-block, or clear.

## Typed Drop Targets

Drop targets must be typed relationship edits.

```ts
type DropTarget =
  | { kind: "before"; parentId: NodeId; beforeNodeId: NodeId; index: number }
  | { kind: "after"; parentId: NodeId; afterNodeId: NodeId; index: number }
  | { kind: "inside"; parentId: NodeId; index: number }
  | { kind: "column-edge"; columnsId: NodeId; columnId: NodeId; position: "before" | "after" }
  | { kind: "table-row-edge"; tableId: NodeId; rowId: NodeId; position: "before" | "after" }
  | { kind: "table-column-edge"; tableId: NodeId; columnIndex: number; position: "before" | "after" }
  | { kind: "inline"; textBlockId: NodeId; offset: number };
```

Drop target graph queries:

```ts
function resolveDropTargetFromPoint(graph, geometry, source, point): DropTargetResult;
function validateDropTarget(graph, source, target): DropTargetValidationResult;
function planDropOperation(graph, source, target): OperationPlanResult;
```

Rules:

- Geometry can suggest candidate targets, but graph validation decides whether
  they are legal.
- Palette insertion and document drag/copy must both produce a typed
  `DropTarget`.
- Drag/drop cannot commit if the target cannot be represented as a typed graph
  relation.
- Drop highlight rendering must use the same `DropTarget` that operation
  planning will commit.
- Cross-section, cross-zone, table-grid, and columns edits must be explicit
  cases, not fallthrough behavior.

## Operation Planning Queries

Operation planning should read graph facts through stable query functions.

Suggested API:

```ts
function getNode(graph, nodeId): AuthoredNode | null;
function getParent(graph, nodeId): ParentRef | null;
function getChildren(graph, nodeId): readonly NodeId[];
function getSiblings(graph, nodeId): SiblingContext | null;
function getAncestors(graph, nodeId): readonly NodeId[];
function getNearest(graph, nodeId): NearestContext | null;
function getCapabilities(graph, nodeId): NodeCapabilities | null;
function getSurfaces(graph, nodeId): NodeSurfaces | null;
function getScopes(graph, nodeId): NodeScopes | null;
function canContain(graph, parentId, childType): boolean;
function canMove(graph, sourceId, target): GraphDecision;
function canDelete(graph, nodeId): GraphDecision;
function canDuplicate(graph, nodeId): GraphDecision;
function canSplit(graph, textBlockId, offset): GraphDecision;
function canMerge(graph, previousTextBlockId, nextTextBlockId): GraphDecision;
```

`GraphDecision` should carry:

- `ok`;
- reason code;
- user-facing reason when needed;
- operation surface;
- history scope;
- validation scope;
- pagination scope;
- fallback requirement, if scoped validation or render invalidation is unsafe.

## Graph Invariants

The graph builder must reject or diagnose:

- duplicate ids;
- missing parent;
- multiple parents;
- missing child ids;
- child type not allowed by parent;
- cycles;
- orphan nodes;
- invalid zone roles;
- invalid section/zone ownership;
- invalid columns width policy;
- invalid table row/cell/grid references;
- inline node outside text-block;
- role metadata inconsistent with text-block role;
- generated output persisted as authored nodes;
- editor-only data persisted into authored document.

## Relationship Diagnostics

Graph diagnostics should be structured and testable.

```ts
type RelationshipGraphIssue = {
  severity: "error" | "warning";
  code:
    | "duplicate-id"
    | "missing-parent"
    | "multiple-parents"
    | "missing-child"
    | "invalid-child-type"
    | "cycle"
    | "orphan-node"
    | "invalid-zone-role"
    | "invalid-role-metadata"
    | "invalid-columns-width"
    | "invalid-table-grid"
    | "editor-state-persisted";
  nodeId?: NodeId;
  parentId?: NodeId;
  path: string;
  message: string;
};
```

Rules:

- Hard errors block import, operation commit, and export.
- Warnings may allow import but must be surfaced for readiness or migration
  review.
- Operation plans should cite graph issue codes when refusing an action.

## Adapter Stance

The existing system can be reused selectively, but adapters must be explicit.

Good reuse:

- text measurement and line wrapping where the input can be `text-block`;
- table grid math where the input can be `table`;
- pagination algorithms once they consume zones/text-blocks/tables/columns;
- field registry and data snapshot validation;
- smoke harness patterns and product-report scenarios.

Unsafe reuse:

- APIs that require `paragraph` as the final text primitive;
- placement operations that require `row`, `stack`, or `flow-stack`;
- selection code that only accepts a single `selectedNodeId`;
- reducer branches that recompute parentage after operation planning;
- header/footer behavior that depends on root stacks instead of zones.

Adapter rule:

```text
Adapters may translate current/prototype shapes into graph facts, but graph
facts must not expose prototype names as vNext concepts.
```

## Product Anchor Gates

The vNext graph design should eventually support these product-report
workflows:

- resolve cover/body/header/footer zones;
- resolve heading text-blocks for TOC;
- resolve paragraph/list/caption/note roles;
- insert text-block after a body text-block;
- drag-copy a text-block into a valid sibling position;
- resize columns and add a column;
- add table row/column;
- edit field-ref inline inside text-block;
- preserve history scope for text, block, layout, and table changes;
- compute affected pagination/export scope.

The current `product-report-v2` fixture remains a reference anchor until a
vNext fixture exists.

## Phase Map

Parent goal:

- Make node relationships the shared source of truth before rebuilding schema,
  operation planning, selection, drop, history, validation, pagination, and
  export around vNext.

Current job lane:

- Relationship graph design.

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Graph contract | Docs | Graph shape, parent refs, surfaces, scopes, selection/drop targets, queries, and invariants are explicit | done | this document |
| 2 | Schema/package boundary | Docs | Decide whether graph operates on vNext persisted shape directly or through adapter during migration | done | `docs/NODE_MODEL_VNEXT_PACKAGE_SCHEMA_BOUNDARY_PLAN.md` |
| 3 | Prototype adapter plan | Docs/tests | Map v2 graph/placement facts to vNext graph concepts without leaking prototype names | done | `docs/NODE_MODEL_VNEXT_PROTOTYPE_ADAPTER_PLAN.md` |
| 4 | Core graph implementation slice | Core schema/document tests | Build read-only graph for a minimal vNext document shape | done | `packages/core/src/document/documentVNext.ts`; `packages/core/src/document/documentVNext.test.ts` |
| 5 | Operation planning integration | Editor operation tests | First operation group consumes graph decisions instead of local inference | next | operation tests |
| 6 | Selection/drop integration | Editor UX/smoke | Typed selection and drop target law share graph decisions | pending | product smoke |

## Stop Conditions

Stop for owner review before:

- choosing a persisted schema/package version;
- making `columns` nesting or table-in-table valid;
- changing undo/redo semantics;
- changing export truth source;
- removing current placement or v2 graph coverage;
- converting runtime code before graph API and adapter boundaries are accepted.

Continue autonomously when:

- refining graph API and diagnostics;
- mapping prototype graph concepts to vNext graph concepts;
- writing examples and non-runtime docs;
- adding docs index links;
- designing focused tests that do not change runtime behavior.

## Decision Rule

When a graph design choice conflicts with prototype convenience, prefer:

1. one explicit parent for every authored node;
2. typed surfaces over UI-specific guesses;
3. typed selection/drop over ambiguous selected node ids;
4. operation plans that carry graph decisions into commit;
5. scoped validation only when graph ownership is certain;
6. product anchor behavior over stress-only mechanics.
