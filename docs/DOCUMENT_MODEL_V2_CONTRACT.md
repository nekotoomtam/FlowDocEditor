# Document Model v2 Contract

Status: Accepted Phase 1 design contract. Foundation implementation started;
schema/assert/migration and first graph read boundary are in place.

Use this document before implementing `DocumentNode.version = 2`, document
schema migration, graph indexing, table flattening, v2 fixtures, or operation
planning that depends on node parentage.

This contract refines `docs/DOCUMENT_MODEL_V2_PLAN.md`. The plan explains why
the architecture is changing; this document defines the target authored shape
and the rules implementation should satisfy.

## Contract Summary

- `DocumentNode.version` becomes `2`.
- `FlowDocPackage.packageVersion` can remain `2` while it contains
  `DocumentNode.version = 2`.
- `packageVersion` changes only when the package envelope changes.
- `document.version` changes when authored document schema changes.
- v2 has one authored node graph per section: `section.nodes`.
- v2 does not persist `flow-table.nodes`.
- v2 does not author legacy `row` or `stack`.
- v1 import must explicitly migrate compatible `row` / `stack` content to
  `flow-row` / `flow-stack`; reject only when migration cannot preserve a valid
  authored graph.
- `flow-table`, `flow-table-row`, and `flow-table-cell` names stay for this
  slice.
- `flow-row` and `flow-stack` names stay for this slice.
- Runtime parentage and capability data belongs in `DocumentGraphIndex`, not in
  persisted document JSON.

## Evidence Baseline

Current evidence for why v2 is needed:

- `packages/core/src/schema/document.ts` currently fixes document schema to
  `version: 1`.
- `docs/FLOWDOC_PACKAGE_CONTRACT.md` separates `packageVersion` from
  `document.version`, so a document schema bump does not require a package
  envelope bump.
- `packages/core/src/schema/block.ts` includes both legacy `row` / `stack` and
  active `flow-row` / `flow-stack`.
- `packages/core/src/schema/table.ts` stores Flow Table descendants inside
  `flow-table.nodes`.
- `packages/core/src/document/assert.ts` currently validates table-cell child
  content from the nested table node map and validates flow-row/flow-stack
  separately from legacy row/stack.
- `packages/core/src/document/operations.ts` currently has to search parentage
  across section nodes and nested table nodes.

## Versioning Boundary

Document Model v2 is a document schema migration, not a package-envelope
redesign.

Rules:

- New editor-authored documents should write `DocumentNode.version = 2`.
- New localStorage and default JSON export may continue to write
  `FlowDocPackage.packageVersion = 2`.
- A package v2 file may contain either document v1 during the transition or
  document v2 after migration is implemented.
- After the v2 migration is active, editor state should receive document v2.
- Raw `DocumentNode v1`, `FlowDocPackage v1`, and package v2 containing
  document v1 remain import inputs only.
- Export, pagination, and renderers still consume a validated current
  `DocumentNode`; they must not depend on package metadata.

`FlowDocPackage v3` is not required unless the package envelope itself changes.
Examples that would justify a package version bump include changing package id
semantics, replacing `fields`, changing `data`, or changing package-level
metadata shape.

## Authored Shape

This is the target TypeScript shape. Exact exported names may change during
implementation, but the structure should not.

```ts
type DocumentNodeV2 = {
  version: 2;
  document: {
    id: string;
    meta?: DocumentMeta;
    styles?: DocumentStyleDefinitions;
    listStyles?: Record<string, ListStyleDefinition>;
    listInstances?: Record<string, ListInstance>;
    sections: DocumentSectionV2[];
  };
};

type DocumentSectionV2 = {
  id: string;
  type: "section";
  page: PageSettings;
  roots: SectionRootsV2;
  nodes: Record<NodeId, AuthoredNodeV2>;
};

type SectionRootsV2 = {
  body: NodeId;
  header?: NodeId;
  headerFirstPage?: NodeId;
  footer?: NodeId;
  footerFirstPage?: NodeId;
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
```

Section root ids must point to `body` nodes. The root role comes from the
`roots` field, not from a persisted node prop.

## Node Identity Rules

Rules:

- Node ids are globally unique within a document.
- Every node id appears in exactly one `section.nodes` map.
- Every non-root node has exactly one authored parent.
- Root body nodes have a section-root parent, not another node parent.
- There are no orphan nodes in v2 documents.
- There are no cycles in child references.
- Inline node ids remain local inline ids inside paragraph `children`; they are
  not members of `section.nodes`.
- List instance ids, style ids, field keys, and inline ids are not node ids.

Global node-id uniqueness is intentional because editor selection, operation
targeting, and render invalidation already treat node ids as stable editor
targets. If a v1 import contains duplicate node ids across sections or between
section and table-local maps, migration must rewrite the colliding ids
deterministically and update all authored references.

## Containment Rules

Containment is explicit and should be represented through node capabilities.

| Parent | Children field | Allowed child node types |
|---|---|---|
| Section root | `roots.*` | `body` |
| `body` | `childIds` | `paragraph`, `spacer`, `divider`, `page-break`, `toc`, `flow-row`, `flow-table` |
| `flow-row` | `childIds` | `flow-stack` |
| `flow-stack` | `childIds` | `paragraph`, `spacer`, `divider` |
| `flow-table` | `rowIds` | `flow-table-row` |
| `flow-table-row` | `cellIds` | `flow-table-cell` |
| `flow-table-cell` | `childIds` | `paragraph`, `spacer` |
| `paragraph` | `children` | inline nodes only |

First-slice restrictions:

- Nested `flow-row` is not accepted.
- `flow-table` inside `flow-stack` is not accepted.
- `page-break` inside `flow-stack` or `flow-table-cell` is not accepted.
- `toc` inside `flow-stack` or `flow-table-cell` is not accepted.
- `flow-table-row` and `flow-table-cell` are addressable nodes, but they are not
  valid body children.

These restrictions match the current safer behavior and prevent Phase 1 from
silently expanding layout semantics. A later design may add more allowed child
types by changing the node capability contract.

## Flow Row / Flow Stack Rules

Rules:

- `flow-row.childIds` must contain one or more `flow-stack` ids.
- Each direct `flow-stack` child of a `flow-row` must declare `widthShare`.
- Direct child `widthShare` values must sum to exactly `100`.
- `flow-stack` may contain `paragraph`, `spacer`, and `divider` children only in
  this contract.
- `flow-row` and `flow-stack` remain authored layout primitives, not table
  aliases.
- Legacy `row` and `stack` do not exist in v2 authored output.

The current `flow-row` / `flow-stack` names stay. Renaming them to product-facing
plain names is a separate owner decision.

## Flow Table Rules

The Flow Table node names stay, but storage changes.

```ts
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

Rules:

- `flow-table.nodes` is removed from v2 authored storage.
- Table rows, table cells, and table-cell content nodes live in the owning
  section's `nodes` map.
- `flow-table.rowIds` references row nodes in `section.nodes`.
- `flow-table-row.cellIds` references cell nodes in `section.nodes`.
- `flow-table-cell.childIds` references paragraph or spacer nodes in
  `section.nodes`.
- Existing grid law, `rowspan`, `colspan`, `headerRowCount`,
  `repeatHeaderRows`, cell `box`, vertical alignment, and `mergeMap` semantics
  remain table-owned.
- `mergeMap.entries[].childIds` must be rewritten during migration if child ids
  are rewritten while flattening table-local nodes.
- Computed row heights, page slices, repeated header fragments, line ranges,
  and continuation flags remain paginated output, not authored table data.

Flattening table storage must not make table layout a generic flow-row layout.
Flow Table remains the table/grid primitive.

## Node Capability Contract

The implementation should define node capabilities in one place and make core
operations consume those capabilities.

Suggested shape:

```ts
type NodeCapabilities = {
  childrenField?: "childIds" | "rowIds" | "cellIds";
  allowedChildTypes: AuthoredNodeV2["type"][];
  parentRoles: NodeParentRole[];
  layoutRole:
    | "section-root"
    | "block"
    | "flow-row"
    | "flow-stack"
    | "table"
    | "table-row"
    | "table-cell"
    | "generated-block";
  operationSurface: "document" | "flow-row" | "table" | "inline";
  canContainText: boolean;
  canSplitAcrossPages: boolean;
  canBeDeleted: boolean;
  canBeDuplicated: boolean;
  canBeReordered: boolean;
};
```

Initial capability table:

| Node type | Surface | Children field | Delete | Duplicate | Reorder | Split across pages |
|---|---|---|---|---|---|---|
| `body` | document | `childIds` | no | no | no | no |
| `flow-row` | flow-row | `childIds` | yes | yes | yes | yes |
| `flow-stack` | flow-row | `childIds` | yes | yes | yes | yes |
| `flow-table` | table | `rowIds` | yes | yes | yes | yes |
| `flow-table-row` | table | `cellIds` | table op | no | table op | yes |
| `flow-table-cell` | table | `childIds` | table op | no | no | yes |
| `paragraph` | document | inline `children` | yes | yes | yes | yes |
| `spacer` | document | none | yes | yes | yes | no |
| `divider` | document | none | yes | yes | yes | no |
| `page-break` | document | none | yes | yes | yes | no |
| `toc` | generated-block | none | yes | yes | yes | yes |

`table op` means the action is valid only through table-aware row/column/span
operations, not through a generic body reorder/delete helper.

## Runtime DocumentGraphIndex

The graph index is derived runtime state.

```ts
type DocumentGraphIndex = {
  nodeById: Map<NodeId, AuthoredNodeV2>;
  sectionById: Map<NodeId, SectionId>;
  parentById: Map<NodeId, NodeParentRef>;
  childrenById: Map<NodeId, readonly NodeId[]>;
  rootBySectionAndRole: Map<string, NodeId>;
  tableByDescendantId: Map<NodeId, NodeId>;
  rowByCellId: Map<NodeId, NodeId>;
  capabilitiesByType: Record<AuthoredNodeV2["type"], NodeCapabilities>;
};

type NodeParentRef =
  | { kind: "section-root"; sectionId: SectionId; root: keyof SectionRootsV2 }
  | { kind: "childIds"; sectionId: SectionId; parentId: NodeId; index: number }
  | { kind: "rowIds"; sectionId: SectionId; tableId: NodeId; index: number }
  | { kind: "cellIds"; sectionId: SectionId; tableId: NodeId; rowId: NodeId; index: number };
```

Rules:

- The graph index is not persisted.
- The graph index should be cheap to rebuild for a document and suitable for
  future scoped/incremental updates.
- Core operations should use the graph index for parent lookup instead of
  scanning every section and nested table map.
- Selection, outline, render invalidation, and operation planning should share
  the same parentage interpretation.
- The index builder must fail or report diagnostics for duplicate ids, missing
  child references, cycles, and invalid containment.

## Validation Invariants

`assertDocumentV2` should enforce at least:

- document version is `2`
- package-independent document identity exists
- each section has exactly one required body root
- optional header/footer roots reference valid body nodes when present
- all node ids are globally unique
- all root ids exist in the section's `nodes`
- all non-root nodes are reachable from a section root
- every non-root node has exactly one parent
- containment rules match the capability contract
- `flow-row` direct children are `flow-stack`
- `flow-stack` width shares are present and total `100`
- `flow-table` grid law remains valid
- table rows/cells/cell content are reachable through table ids, not orphaned
- paragraph/list/style/field references remain valid under their existing
  contracts
- no authored node stores computed layout geometry, page index, fragment id,
  line ranges, or continuation flags

`normalizeDocumentV2` may fill default props and migrate old shapes, but it must
not hide invalid graph relationships by silently dropping content.

## Import And Migration Boundary

Import must be explicit.

Accepted inputs during the transition:

- raw `DocumentNode v1`
- `FlowDocPackage v1`
- `FlowDocPackage v2` containing `DocumentNode v1`
- `FlowDocPackage v2` containing `DocumentNode v2`

Target output after migration:

- `FlowDocPackage.packageVersion = 2`
- `package.document.version = 2`
- no `row` / `stack` authored nodes
- no `flow-table.nodes`

Migration rules:

- Map section root fields to `section.roots`.
- Keep package metadata, field registry, and data snapshot unchanged.
- Convert compatible `row` to `flow-row`.
- Convert compatible `stack` to `flow-stack`.
- Preserve `gap`, `minHeight`, and `widthShare` where the concepts match.
- Flatten `flow-table.nodes` into the owning `section.nodes`.
- Rewrite table `rowIds`, row `cellIds`, cell `childIds`, and merge-map
  `childIds` when ids are rewritten.
- Reject imports that cannot be converted into a valid v2 graph without data
  loss.
- Return migration diagnostics for unsupported legacy constructs rather than
  silently changing behavior.

Because there are no production users, migration should prioritize a valid,
simple v2 graph over preserving every pre-production visual detail. The editor
must not emit migrated legacy primitives back out as v1 authoring.

## Fixture Rules

New fixtures must be v2 fixtures.

Rules:

- Do not create new fixtures with `DocumentNode.version = 1`.
- Do not create new fixtures with `row` / `stack`.
- Do not create new fixtures with `flow-table.nodes`.
- Existing `public/mock/*.flowdoc.json` files may remain legacy baselines until
  v2 replacements exist.
- Browser scripts should target semantic aliases from fixture metadata instead
  of generated node ids.

Recommended target alias shape:

```ts
type FlowDocFixtureTargets = {
  typing?: {
    primary?: NodeId;
    boundary?: NodeId;
  };
  node?: {
    delete?: NodeId;
    duplicate?: NodeId;
    reorderSource?: NodeId;
    reorderTarget?: NodeId;
  };
  flowRow?: {
    resizeTarget?: NodeId;
    addColumnTarget?: NodeId;
  };
  table?: {
    primaryCell?: NodeId;
    primaryRow?: NodeId;
    spanCell?: NodeId;
  };
};
```

The exact package location for fixture metadata can be decided in the fixture
phase, but tests and smoke scripts should not depend on generated ids such as
`p_00114` as product-level targets.

## Paragraph Style Boundary

Paragraph style cleanup is not the first v2 implementation slice.

Direction:

- Keep existing paragraph props enough for migration and rendering.
- Do not expand direct formatting as the preferred v2 fixture style.
- Prefer named styles plus local `styleOverrides` for new v2 fixtures.
- Move toward a style-first paragraph contract after graph/storage migration is
  stable.

This prevents the graph migration from turning into a full typography/style
rewrite.

## Implementation Acceptance

Phase 1 contract is done when:

- this document is indexed from `docs/DOCS_INDEX.md`
- `docs/DOCUMENT_MODEL_V2_PLAN.md` points to this contract
- package v2 vs document v2 boundary is explicit
- row/stack import migration policy is explicit
- table flattening rules are explicit
- graph index and node capabilities are explicit enough to drive schema work

Implementation phases after this contract must still add tests before claiming
runtime support.

Current foundation status:

- `DocumentNodeV2Schema` exists in `packages/core/src/schema/documentV2.ts`.
- `migrateDocumentToV2(...)`, `assertDocumentV2(...)`, and
  `buildDocumentGraphIndexV2(...)` exist in
  `packages/core/src/document/documentV2.ts`.
- `getDocumentGraphChildrenV2(...)`, `getDocumentGraphSiblingContextV2(...)`,
  `orderedSectionParagraphsV2(...)`, and `orderedDocumentParagraphsV2(...)`
  provide the first v2 graph read boundary for traversal and parent/sibling
  lookup.
- `adaptDocumentV2ToCurrentDocument(...)` provides a temporary bridge from v2
  authored storage back to the current v1 runtime shape for layout/export
  transition tests. It re-nests flow-table descendants into `flow-table.nodes`
  and converts v2 reserved-zone body roots back to current stack roots.
- `resolveFlowTableFromSectionGraphV2(...)`, `addFlowTableRowV2(...)`,
  `removeFlowTableRowV2(...)`, `addFlowTableColumnV2(...)`,
  `removeFlowTableColumnV2(...)`, `resizeFlowTableColumnPairV2(...)`,
  `fitFlowTableToSectionWidthV2(...)`, `updateFlowTableCellSpanV2(...)`, and
  `deleteEmptyFlowTableCellParagraphV2(...)` provide the first direct v2 table
  operation boundary. They read row/cell/content parentage from flattened
  `section.nodes`, reuse the existing Flow Table grid law, and write results
  back without persisting `flow-table.nodes`.
- `validateFieldRegistryReferencesV2(...)` validates field references in v2
  documents, including flattened flow-table-cell paragraphs stored in
  `section.nodes`.
- `migratePersistedDocumentPackageToDocumentV2(...)` exists as an additive
  package helper. It keeps `FlowDocPackage.packageVersion = 2` while returning
  `DocumentNode.version = 2`, and it accepts package v2 input that already
  contains `DocumentNode.version = 2`.
- Authored localStorage saves and JSON package exports now use
  `createAuthoredDocumentPackageV2(...)`, which migrates the current runtime
  document to DocumentNode v2 storage before serialization. This means new
  authored package output does not persist legacy `row` / `stack` or
  `flow-table.nodes`, while the editor runtime can still adapt v2 input back to
  the current shape during the transition.
- The editor runtime has not been flipped to use DocumentNode v2 as its primary
  state shape yet.

## Non-Goals

- Do not rename `flow-table` to `table` in this slice.
- Do not rename `flow-row` / `flow-stack` in this slice.
- Do not persist `DocumentGraphIndex`.
- Do not persist paginated output in document JSON.
- Do not make renderers compute table or flow-row layout independently.
- Do not solve the full paragraph style model in the first v2 graph slice.
- Do not delete legacy mocks until v2 fixture replacements exist.

## Related Docs

- `docs/DOCUMENT_MODEL_V2_PLAN.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOW_ROW_STACK_SPEC.md`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/EDITOR_OPERATION_ARCHITECTURE.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
