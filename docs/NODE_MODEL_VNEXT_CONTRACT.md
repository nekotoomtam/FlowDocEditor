# Node Model vNext Contract

Status: Draft baseline for the next document/editor architecture.

Use this document before redesigning authored node types, node relationships,
selection, drag/drop, operation planning, history scope, validation scope,
pagination boundaries, export semantics, or future AI/external operation calls.

This is a design contract, not an implementation claim. The current
DocumentNode v2 work remains valuable prototype evidence, but vNext is allowed
to step back from v2 naming and runtime compromises when the better model is
clear.

## Request

The owner wants to stop dragging the prototype forward as if it were the final
architecture. The new direction is to use the lessons from Document Model v2,
operation-first work, product-report-v2, and browser smoke evidence to design a
cleaner node relationship model before continuing implementation.

Request-to-plan trace:

```text
User request
  -> Node Model vNext Plan
    -> Phase 1: baseline contract
      -> Job item: define the node set and relationship rules
        -> Execution step: write this contract
```

Current position:

- Request: step back and design the next node model from the product goal.
- Plan: Node Model vNext Plan.
- Phase: Phase 5.5, extractable workspace.
- Job item: create a temporary vNext home that can move to a new repository.
- Status: done.
- Why this item is current: Phase 1 locked the node set, Phase 2 locked the
  relationship graph, Phase 3 locked the persisted boundary, and Phase 4 now
  defines how prototype evidence can feed vNext without leaking old names.
  Phase 5 proves a small vNext schema/graph slice in code without wiring
  persistence or editor runtime. Phase 5.5 moves that direction into an
  isolated workspace boundary.
- Next transition: Phase 6, product fixture and migration/parser slices inside
  `vnext-workspace/`.

## Evidence From The Prototype

The current system taught us useful lessons:

- Document Model v2 improved authored graph shape by moving toward one section
  graph, removing authored legacy `row` / `stack`, and flattening
  `flow-table.nodes`.
- The v2 graph index already proves that parent, children, table ownership,
  and capability data should be computed centrally.
- Operation architecture already points toward operation envelopes and plans,
  but compatibility action snapshots and reducer commit adapters still remain.
- `product-report-v2` showed the value of a product-shaped anchor: typing and
  table/flow-row structure workflows can pass while node mutation latency still
  exposes relationship/interaction risk.
- Browser smoke evidence suggests that drop target geometry, operation
  targeting, history, and responsiveness should not be inferred separately by
  each UI feature.

Conclusion:

```text
The next model should make node relationship truth explicit before operation,
selection, drop, history, pagination, and export layers build on top of it.
```

## Goals

- Define a small, clear authored node set for product documents.
- Separate document structure, zones, block content, layout columns, tables,
  generated blocks, utility blocks, and inline content.
- Replace `paragraph` with `text-block` as the authored text node.
- Treat heading, list item, caption, note, and label as roles of `text-block`,
  not separate node families.
- Replace row/stack-style layout with `columns` / `column`.
- Keep table semantics separate from layout columns.
- Make parent/child/sibling/zone relationships the source of truth for editor
  operation planning.
- Make selection, editing, drag/drop, history, validation, pagination, and
  export consume the same relationship graph.
- Keep future AI/external operations simple: they should target semantic node
  operations without knowing legacy editor internals.

## Non-Goals

- Do not implement vNext in this contract.
- Do not rename current runtime nodes in place without a migration plan.
- Do not make `flow-row` / `flow-stack` final by only changing display labels.
- Do not keep `paragraph` as the final text primitive.
- Do not make table a special case of layout columns.
- Do not persist editor selection, drop highlights, pagination output, or
  operation metadata into authored document JSON.
- Do not change FlowDoc package envelope versioning until the persistence
  boundary is designed.

## Canonical Node Set

The baseline node set is:

```text
document
section
zone

text-block
columns
column
table
table-row
table-cell
toc
page-break
divider
spacer

inline:
text
field-ref
page-number
line-break
```

### Structural Nodes

`document`

- Owns document metadata, style registries, field registry linkage, data
  readiness linkage, and section order.
- Is not a draggable or editable canvas node.
- Is the top-level operation boundary for document settings, schema migration,
  import/export readiness, and whole-document validation.

`section`

- Owns page settings, section-level numbering, section metadata, and zones.
- Is not a normal block container.
- Defines pagination/export boundaries.
- May have one or more zones.

`zone`

- Represents authored content regions inside a section.
- Required zone role: `body`.
- Optional zone roles: `header`, `footer`, `first-page-header`,
  `first-page-footer`.
- Replaces the current pattern where header/footer roots are disguised as
  stacks or bodies without clear semantic role.
- Owns an ordered `childIds` list of block nodes.

### Block Nodes

`text-block`

- The only block node that owns inline children.
- Replaces `paragraph` as the authored text primitive.
- Carries a `role` that defines semantic purpose:
  - `paragraph`
  - `heading`
  - `list-item`
  - `caption`
  - `note`
  - `label`
- Carries role-specific metadata only when relevant.
- Is the base unit for text editing, split, merge, inline formatting, list
  marker behavior, TOC extraction, outline extraction, and most text history
  entries.

`columns`

- Layout container for side-by-side document content.
- Replaces final use of `flow-row` / `row`.
- Owns ordered `columnIds`.
- Owns layout-only settings such as gap, vertical alignment, and optional
  width policy.
- Is not a table and must not expose table row/cell semantics.

`column`

- Child of `columns`.
- Owns block `childIds`.
- Carries width share or width policy.
- Replaces final use of `flow-stack` / `stack` as a column container.
- May contain normal blocks, but first slice should restrict deeply nested
  columns until pagination/export semantics are proven.

`table`

- Table/grid primitive.
- Owns ordered `rowIds` and column definitions.
- Owns table-specific settings: header row count, repeated headers, borders,
  fixed/fit width policy, and grid law.
- Is not a layout columns container.

`table-row`

- Child of `table`.
- Owns ordered `cellIds`.
- Carries row-specific metadata: height, breakability, repeated header role
  through table header rules, and row grouping when needed.
- Is not a generic block container.

`table-cell`

- Child of `table-row`.
- Owns block `childIds`.
- Carries grid placement metadata: rowspan, colspan, merge map, vertical
  alignment, and cell box style.
- May contain `text-block` and simple utility blocks.
- Table-cell text is still edited through `text-block`, not through a separate
  paragraph model.

`toc`

- Generated block placeholder.
- Its authored data is configuration, not generated entries.
- Pagination/rendering may generate fragments from headings, but generated
  entries must not become authored child nodes unless a separate feature
  explicitly materializes them.

`page-break`

- Explicit pagination control.
- Has no children.
- May only appear where pagination semantics are defined.

`divider`

- Visual separator block.
- Has no children.

`spacer`

- Intentional empty space.
- Has no children.

### Inline Nodes

Inline nodes can appear only inside `text-block.children`.

`text`

- Plain editable text run.
- May carry inline style overrides.

`field-ref`

- Scalar field reference.
- References the field registry by key.
- Does not own resolved data value.

`page-number`

- Pagination-resolved inline.
- May appear only in zones or text-block roles where page-number semantics are
  allowed.

`line-break`

- Explicit line break inside a text block.
- Distinct from block splitting.
- Should be used sparingly, mostly for authored line breaks inside labels,
  addresses, signatures, or compact report text.

## Text-Block Contract

The core text shape:

```ts
type TextBlockNode = {
  id: NodeId;
  type: "text-block";
  role: "paragraph" | "heading" | "list-item" | "caption" | "note" | "label";
  children: InlineNode[];
  styleId?: string;
  styleOverrides?: TextBlockStyleOverrides;
  heading?: HeadingMetadata;
  list?: ListItemMetadata;
  caption?: CaptionMetadata;
  note?: NoteMetadata;
  label?: LabelMetadata;
};
```

Rules:

- `text-block` is always the editable text surface.
- `heading` is not a separate node type.
- `list-item` is not a separate node type.
- `caption`, `note`, and `label` are not separate node types.
- Role metadata must be absent unless the matching role needs it.
- Split/merge must preserve role rules:
  - splitting a paragraph yields paragraphs;
  - splitting a heading may create paragraph continuation unless explicitly
    configured otherwise;
  - splitting a list item yields a sibling list item with list continuation;
  - merging list items must preserve list numbering rules;
  - captions and labels may block split/merge if product rules require atomic
    behavior.

## Relationship Model

The authored graph should be flat per section or per document, but relationship
truth should be computed by one graph index.

The graph index must answer:

- node by id;
- section by node id;
- zone by node id;
- parent by node id;
- ordered children by node id;
- siblings by node id;
- previous/next editable text-block;
- nearest block ancestor;
- nearest layout ancestor;
- nearest table ancestor;
- nearest zone;
- nearest section;
- operation surface;
- selection surface;
- drop surface;
- history scope;
- validation scope;
- pagination scope;
- export scope.

The graph index is runtime/editor metadata. It must not be persisted into the
authored document.

Suggested parent references:

```ts
type ParentRef =
  | { kind: "document"; childField: "sectionIds"; index: number }
  | { kind: "section"; sectionId: SectionId; childField: "zoneIds"; index: number }
  | { kind: "zone"; zoneId: NodeId; childField: "childIds"; index: number }
  | { kind: "columns"; columnsId: NodeId; childField: "columnIds"; index: number }
  | { kind: "column"; columnId: NodeId; childField: "childIds"; index: number }
  | { kind: "table"; tableId: NodeId; childField: "rowIds"; index: number }
  | { kind: "table-row"; rowId: NodeId; childField: "cellIds"; index: number }
  | { kind: "table-cell"; cellId: NodeId; childField: "childIds"; index: number };
```

## Containment Rules

Initial containment:

| Parent | Children field | Allowed child nodes |
|---|---|---|
| `document` | `sectionIds` | `section` |
| `section` | `zoneIds` | `zone` |
| `zone` | `childIds` | `text-block`, `columns`, `table`, `toc`, `page-break`, `divider`, `spacer` |
| `columns` | `columnIds` | `column` |
| `column` | `childIds` | `text-block`, `table`, `divider`, `spacer` |
| `table` | `rowIds` | `table-row` |
| `table-row` | `cellIds` | `table-cell` |
| `table-cell` | `childIds` | `text-block`, `divider`, `spacer` |
| `text-block` | `children` | inline nodes only |

First-slice restrictions:

- No nested `columns` inside `column`.
- No `columns` inside `table-cell`.
- No `toc` inside `column` or `table-cell`.
- No `page-break` inside `column` or `table-cell` until pagination semantics
  are designed.
- No `table` inside `table-cell` in the first slice.
- No arbitrary block nodes inside generated output.

These restrictions are not product forever-rules. They keep the first
implementation slice stable while relationship, pagination, and export
semantics become explicit.

## Node Capability Contract

Each node type must have declared capabilities. Capabilities are not inferred
from component implementation.

Suggested capability shape:

```ts
type NodeCapabilities = {
  type: NodeType;
  family:
    | "structure"
    | "zone"
    | "text"
    | "layout"
    | "table"
    | "generated"
    | "utility"
    | "inline";
  canSelect: boolean;
  canEditText: boolean;
  canContainBlocks: boolean;
  canContainInline: boolean;
  canDrag: boolean;
  canDropBeforeAfter: boolean;
  canDropInside: boolean;
  canResize: boolean;
  canSplit: boolean;
  canMerge: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canReorder: boolean;
  operationSurface: OperationSurface;
  historyScope: HistoryScope;
  validationScope: ValidationScope;
  paginationScope: PaginationScope;
  exportScope: ExportScope;
};
```

Initial capability table:

| Node | Family | Select | Edit text | Drop inside | Resize | Split/Merge | Delete/Dupe/Reorder |
|---|---|---:|---:|---:|---:|---:|---:|
| `document` | structure | no | no | no | no | no | no |
| `section` | structure | optional | no | no | no | no | section ops only |
| `zone` | zone | optional | no | yes | no | no | no |
| `text-block` | text | yes | yes | no | no | yes | yes |
| `columns` | layout | yes | no | no | yes | no | yes |
| `column` | layout | yes | no | yes | width | no | column ops |
| `table` | table | yes | no | no | table/columns | no | yes |
| `table-row` | table | table op | no | no | row height | no | table ops |
| `table-cell` | table | yes | no | yes | no | no | table ops |
| `toc` | generated | yes | no | no | no | no | yes |
| `page-break` | utility | yes | no | no | no | no | yes |
| `divider` | utility | yes | no | no | no | no | yes |
| `spacer` | utility | yes | no | no | no | no | yes |

`table ops` means row/cell actions must go through table-aware operations, not
generic body delete/reorder helpers.

## Operation Surface

Operations should target semantic surfaces, not raw UI components.

Suggested operation surfaces:

- `document`
- `section`
- `zone`
- `block`
- `text`
- `layout-columns`
- `table`
- `inline`

Examples:

- Typing: `text-block` -> `text` surface.
- Heading level change: `text-block` role metadata -> `text` surface.
- List indent/outdent: `text-block` list metadata -> `text` or `list` policy.
- Insert paragraph: parent zone/column/cell -> `block` surface.
- Resize columns: `columns`/`column` -> `layout-columns` surface.
- Add table column: `table` -> `table` surface.
- Edit field reference: inline `field-ref` inside `text-block` -> `inline`
  surface.

Rule:

```text
Operation planning must ask the relationship graph whether the target and
parent are valid before mutating document state.
```

## Selection Model

Selection must separate:

- selected authored node;
- text selection inside a text-block;
- table cell selection;
- column/layout selection;
- zone/section selection;
- active drag/drop target;
- active resize target.

Do not overload one `selectedNodeId` to mean every kind of selection without
typed selection context.

Suggested selection shape:

```ts
type EditorSelection =
  | { kind: "none" }
  | { kind: "node"; nodeId: NodeId; surface: OperationSurface }
  | { kind: "text"; textBlockId: NodeId; anchor: TextOffset; focus: TextOffset }
  | { kind: "table-cell"; tableId: NodeId; rowId: NodeId; cellId: NodeId }
  | { kind: "column"; columnsId: NodeId; columnId: NodeId }
  | { kind: "zone"; sectionId: SectionId; zoneId: NodeId };
```

Selection must be derived and validated against the relationship graph after
document mutations.

## Drop Model

Drop behavior must be relation-driven.

Drop targets should be typed:

```ts
type DropTarget =
  | { kind: "before"; parentId: NodeId; beforeNodeId: NodeId }
  | { kind: "after"; parentId: NodeId; afterNodeId: NodeId }
  | { kind: "inside"; parentId: NodeId; index: number }
  | { kind: "column-edge"; columnsId: NodeId; columnId: NodeId; position: "before" | "after" }
  | { kind: "table-row-edge"; tableId: NodeId; rowId: NodeId; position: "before" | "after" }
  | { kind: "table-column-edge"; tableId: NodeId; columnIndex: number; position: "before" | "after" };
```

Rules:

- A visual drop highlight must correspond to a valid typed drop target.
- A drag/drop operation must not recompute a different parent in the reducer.
- Drop target calculation must use the same relationship graph as operation
  planning.
- Palette block insertion and node drag-copy must share the same drop target
  contract.
- Invalid drop targets should be explicit, not silent no-ops.

## History Scope

History must be owned by operation semantics and relationship scope.

Suggested scopes:

- `none`: selection-only or visual-only changes.
- `text-session`: draft typing session that commits one undoable edit.
- `block-structure`: add/delete/duplicate/reorder/split/merge block changes.
- `layout-structure`: columns/column structure changes.
- `table-structure`: row/column/cell/span changes.
- `section-structure`: section/zone changes.
- `document-settings`: page, style, field registry, or document metadata
  changes.

Rules:

- A user-visible authored mutation must create or merge into an intentional
  history entry.
- Field/data fill state must not become authored document history unless the
  field registry or authored field-ref node changes.
- Undo/redo must restore both document state and the display state that belongs
  to that document version.

## Validation Scope

Validation should be explicit and relation-aware.

Suggested scopes:

- `node`: one node and its local invariants.
- `parent`: node plus parent/children relationship.
- `subtree`: parent and reachable descendants.
- `table`: table grid and all row/cell descendants.
- `section`: section zones and all reachable nodes.
- `document`: whole authored document.

Rules:

- Full document validation remains available as fallback.
- Operation plans must declare whether validation is full, scoped, prevalidated,
  or read-only.
- Scoped validation cannot claim safety if relationship graph ownership is
  uncertain.
- Table grid validation stays table-owned.
- Columns width-share validation stays layout-columns-owned.

## Pagination And Export Boundaries

Pagination and export must consume authored structure plus computed layout, not
editor interaction state.

Rules:

- `section` is the primary pagination/export boundary.
- `zone` identifies header/footer/body roles for pagination and export.
- `text-block` is the text measurement and line-splitting unit.
- `columns` is a layout primitive; it may split by column content rules, not by
  table row rules.
- `table` is a table/grid primitive; it owns row/cell continuation rules.
- `toc` generates pagination-aware output from heading text-blocks.
- `page-number` resolves from pagination output, not from authored JSON.
- Export must not consume browser-only partial preview as authoritative state.

## AI / External Operation Boundary

Future AI and external callers should operate through stable commands, not raw
node mutation internals.

Examples:

```text
insert text-block role=heading after node X
insert text-block role=list-item inside column Y at index 2
set text-block role from paragraph to heading(level=2)
insert table row after row R
insert columns with 2 columns after block B
replace field-ref key K in text-block T
```

Rules:

- External callers must use operation commands validated against the
  relationship graph.
- External callers should not need to know current runtime adapters.
- Operation commands must be deterministic and auditable.
- Generated ids may be created by the operation layer, not by the caller.

## Migration Stance

Current prototype names are evidence, not final constraints.

Mapping direction:

| Prototype/current | vNext direction |
|---|---|
| `paragraph` | `text-block role=paragraph` |
| heading paragraph props | `text-block role=heading` |
| list paragraph props | `text-block role=list-item` |
| legacy `row` | migrate/reject; do not author |
| legacy `stack` | migrate/reject; do not author |
| `flow-row` | `columns` |
| `flow-stack` | `column` |
| `flow-table` | `table` |
| `flow-table-row` | `table-row` |
| `flow-table-cell` | `table-cell` |
| body root stack/body ambiguity | `zone role=body/header/footer/...` |

Do not migrate all runtime code at once. The first implementation should build
the relationship contract and adapter boundaries before replacing every node
name.

## Product Anchor

`product-report-v2` remains the product evidence anchor while vNext is
designed.

The future vNext product anchor should cover:

- cover section;
- TOC section;
- body section with page-number restart;
- body/header/footer zones;
- text-block roles for heading, paragraph, label, and list-item;
- columns/column summary layout;
- table/table-row/table-cell detail area;
- field-ref inline data binding;
- page-number inline resolution;
- typing, split/merge, add/delete/duplicate/reorder;
- table row/column mutation;
- columns resize/add-column mutation;
- history restore;
- export readiness.

## Phase Map

Parent goal:

- Replace prototype-driven node architecture with a relationship-first node
  model that can support editor, operation, history, pagination, export, and
  future AI callers.

Current job lane:

- Node Model vNext design.

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Baseline contract | Docs | Node set, text-block role model, containment, capabilities, and relationship rules are explicit | done | this document; `docs/DOCS_INDEX.md` |
| 2 | Relationship graph design | Core/editor design docs | Runtime graph index shape, selection/drop/history/validation scopes are accepted | done | `docs/NODE_RELATIONSHIP_GRAPH_VNEXT_PLAN.md` |
| 3 | Package/schema boundary design | Persistence/docs/tests | Decide document version/package version boundary and migration strategy | done | `docs/NODE_MODEL_VNEXT_PACKAGE_SCHEMA_BOUNDARY_PLAN.md` |
| 4 | Prototype adapter plan | Core/editor docs/tests | Current v2/runtime adapters are mapped to vNext without big-bang rewrite | done | `docs/NODE_MODEL_VNEXT_PROTOTYPE_ADAPTER_PLAN.md` |
| 5 | First implementation slice | Core schema/graph/tests | A small vNext graph or adapter proves text-block/zone/columns basics | done | `packages/core/src/schema/documentVNext.ts`; `packages/core/src/document/documentVNext.ts`; `packages/core/src/document/documentVNext.test.ts` |
| 5.5 | Extractable workspace | Repo structure/docs/tests | vNext has a temporary home that can move to a new repository and runs local checks | done | `vnext-workspace/README.md`; `vnext-workspace/docs/WORKSPACE_BOUNDARY.md`; `vnext-workspace/tests` |
| 6 | Product anchor migration | Fixture/tests/smoke | Product-report anchor exists in vNext shape and passes selected gates | next | `vnext-workspace/fixtures/product-report-vnext-minimal.flowdoc.json` |
| 7 | Migration adapter | Migration/tests | v1/v2 inputs migrate to document v3 with diagnostics | pending | migration tests |
| 8 | Package parser | Persistence/tests | Package v2 with document v3 parse/serialize behavior is explicit | pending | persistence tests |
| 9 | Operation integration | Editor operation plans/tests | Operations consume relationship graph instead of UI-specific inference | pending | operation tests and browser smoke |

## Stop Conditions

Stop for owner review before:

- changing persisted document version;
- changing FlowDoc package envelope version;
- removing current v2 fixture coverage;
- replacing operation runtime paths;
- changing undo/redo semantics;
- changing pagination or export truth source;
- accepting nested columns/table-in-table semantics;
- claiming vNext stability before product anchor smoke evidence exists.

Continue autonomously when:

- refining this design doc;
- adding evidence links;
- drafting relationship graph shape;
- mapping prototype names to vNext names;
- writing non-runtime design tests or examples;
- updating docs index references.

## Decision Rule

When choosing between preserving prototype compatibility and clarifying the
model, prefer:

1. explicit authored relationship truth;
2. clear operation ownership;
3. stable history scope;
4. valid pagination/export semantics;
5. product-report workflow correctness;
6. compatibility adapters that can be removed later.

Do not keep a prototype node name merely because existing code can be patched to
survive it.
