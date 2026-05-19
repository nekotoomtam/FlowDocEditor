# Flow Table Spec

Status: Design draft with partial runtime implementation. Flow Table remains
experimental and is not the default inserted table.

Implementation status:

- Schema, assert-layer validation, and a standalone grid resolver exist for the
  draft `flow-table` node family.
- The grid resolver now exposes mutation-oriented slot metadata: each occupied
  slot records its physical row/column, origin row/column, span size, and
  whether the slot is the cell origin. This is the C2.0 foundation for
  span-aware structural edits.
- Static flow layout exists for authored columns, `colspan`, `rowspan`, row
  height, and cell box padding.
- Pagination supports breakable row/cell continuation across pages. Short
  sibling cell content is not duplicated on continuation slices.
- R1 Flow Table rowspan pagination planner metadata exists.
- R2A Flow Table rowspan-linked groups can split at row boundaries when every
  row in the group is breakable. Continuation cell fragments keep the authored
  cell `nodeId` and use the visible row fragment as `parentNodeId`.
- R3A Flow Table spanning-cell paragraph content can split across those
  row-boundary continuation slices using the existing cell split-point helpers.
- R3B/R3C core pagination covers mixed `rowspan`/`colspan` continuation
  geometry and forced one-unit overflow warnings inside rowspan slices.
- R3D oversized final rowspan slices can continue spanning-cell paragraph
  content line-by-line across additional pages instead of placing the remaining
  text as one overflowing final row slice. Rowspan pagination also keeps
  filling the current page when a later row-boundary slice can make line-level
  progress in the remaining page space.
- Core pagination repeats `headerRowCount` Flow Table header rows on body
  continuation pages.
- PDF and editor preview draw Flow Table cell `box` fill/border from paginated
  `flow-table-cell` fragments.
- DOCX output has best-effort fixed-table projection from paginated Flow Table
  fragments, including grid/span metadata.
- Editor insertion is available as an explicit 3x3 `flow-table` palette block.
  Initial selection/text editing support is conservative and does not replace
  legacy `table`.
- Span-free editor row/column operations are available as the C1 slice. They
  intentionally no-op when the table contains `rowspan` or `colspan`; C2 owns
  span-aware structural edits.
- C2.1 span-aware row/column insertion is available. If an inserted row or
  column boundary cuts through an existing span, the existing cell expands its
  `rowspan` or `colspan`; new empty cells are created only in uncovered slots.
- C2.2 conservative span-aware row/column deletion is available for targets
  that do not require moving a span origin. Deleting inside a span shrinks the
  covering cell; deleting a row/column that owns a continuing span still no-ops.
- C2.3A safe cell span controls are available. A selected Flow Table cell can
  expand its `rowspan`/`colspan` only through empty cells that are wholly inside
  the new span rectangle. Shrinking a span creates empty replacement cells for
  vacated slots.
- C2.3B/C2.4 convenience controls are available for safe empty-cell merge and
  unmerge. `Merge right` and `Merge down` increase the selected cell span only
  when the next cells are empty and wholly consumed by the requested rectangle.
  `Unmerge` collapses the selected span to `1x1` and creates empty replacement
  cells.
- C2.5A non-empty merge is available for selected-cell expansion. Consumed
  cells are removed and their non-empty child blocks are appended to the
  selected cell in row-major order.
- C2.6 neighbor-origin merge is available for `Merge left` and `Merge up`.
  These actions keep the aligned left/upper neighbor as the surviving origin,
  consume the selected cell through the same span operation, append content in
  row-major order, and move editor selection to the surviving neighbor.
- C2.7A PropertyPanel text editing surfaces every paragraph child in a selected
  Flow Table cell, including paragraphs appended by non-empty merge.
- C2.8A merge-map schema, assert, and normalize foundation exists for future
  content restoration.
- C2.8B merge-map writing is available during Flow Table cell span expansion.
  Merge records relative source slots for appended content and carries existing
  merge maps through chained merges.
- C2.8C merge-map restoration is available during Flow Table cell shrink and
  unmerge. Mapped children whose source slots remain inside the surviving span
  stay with the origin cell; mapped children from released slots move to the
  replacement cells created for those slots. Restored cells do not carry a new
  merge map in this slice.
- C2.8D merge-map row/column operation maintenance is available. Inserting a
  row or column through a mapped span shifts later relative offsets forward;
  deleting a row or column through a mapped span drops mappings for the deleted
  slots, keeps those child blocks on the origin cell to avoid data loss, and
  shifts later offsets back.
- True span-origin movement remains deferred.
- Broader property editing and row/column/span operations remain intentionally
  incremental.

This document drafts a new table primitive that can be developed beside the
current `table` node. The working title is **Flow Table** and the provisional
node type name is `flow-table`.

Use this document together with:

- `docs/TABLE_EDITING_CONTRACT.md` for the current table model
- `docs/CROSS_PAGE_BEHAVIOR.md` for page-boundary policy
- `docs/FLOW_ROW_STACK_SPEC.md` for the separate-primitive rollout pattern
- `docs/EXPORT_RENDERER_CONTRACT.md` for renderer ownership
- `docs/TEST_STRATEGY.md` for verification levels

## Decision

Flow Table is a new explicit primitive, not a hidden replacement for the
existing `table` node.

Rules:

- Existing `table` nodes remain current/legacy authored nodes during Flow Table
  development.
- New Flow Table content uses an explicit `flow-table` node type.
- The draft node family name is `flow-table`, `flow-table-row`, and
  `flow-table-cell`; final TypeScript naming may still adjust during schema
  review.
- Flow Table cell visual styling uses a `box` object in v1, matching the
  paragraph/flow-stack box concept.
- There is no automatic migration from `table` to `flow-table`.
- There is no render-time projection that secretly lays out old `table` nodes
  with the Flow Table engine.
- There is no hidden compatibility conversion.
- If Flow Table reaches acceptance, new insertions may default to Flow Table
  while existing `table` documents remain readable.
- Hiding or removing legacy `table` is an open decision after Flow Table
  acceptance, not part of v1.

This mirrors the successful `row` / `stack` and `flow-row` / `flow-stack`
separation pattern: protect existing behavior while a stronger primitive proves
itself.

## Why Not Patch Current Table First

The current table path is already doing several hard things:

- authored grid structure, columns, rows, cells, rowspans, and colspans
- row splitting through a table-specific pagination loop
- repeated header rows
- cell border, padding, background, and vertical-align props
- PDF/DOCX/editor output from paginated fragments

Changing the current `table` semantics directly would risk surprising existing
documents and make debugging harder. A separate primitive lets Flow Table define
new page-slicing rules without silently changing the meaning of old documents.

## Relationship To Flow Row / Flow Stack

Flow Table is not `flow-row` / `flow-stack`.

Shared principles:

- use a new explicit primitive instead of mutating old semantics
- core pagination owns page slices and continuation boundaries
- editor/PDF/DOCX consume `PaginatedDocument`
- renderers must not remeasure or choose page breaks
- no empty continuation slices without progress
- forced progress must be explicit and test-covered when content cannot fit
  cleanly on a page

Different responsibilities:

- `flow-row` / `flow-stack` handles side-by-side long-form content with no grid
  law.
- Flow Table handles document tables with column identity, row identity,
  headers, `rowspan`, `colspan`, cell chrome, and table-specific split policy.

Flow Table should reuse the page-slice baseline proven by `flow-row` /
`flow-stack`: paginate before render, emit continuation slices, keep visual
geometry derived from paginated fragments, shrink final slices where the table
policy allows it, and warn on forced progress. It must still keep table
grid/span semantics native to the table engine.

## Rowspan Pagination Roadmap

Current model:

- `packages/core/src/layout/flow.ts` measures a `rowspan>1` Flow Table cell only
  at its origin row. The emitted cell flow box spans the summed height of the
  covered rows.
- `packages/core/src/pagination/paginator.ts` groups rows touched by `rowspan`
  through `planFlowTableRowspanGroups(...)`.
- `paginateFlowTable(...)` keeps `allowBreak=false` rowspan-linked groups
  atomic. Breakable rowspan-linked groups can split at row boundaries, and
  spanning-cell paragraph content may split across those page slices.

Design direction for future patches:

- R1 adds explicit split metadata for rowspan groups without changing authored
  schema or pagination output: group row indices, row slice boundaries, origin
  cells that continue across the boundary, and covered slots that should receive
  visual continuation chrome.
- R2A splits a rowspan-linked group only at row boundaries first. A spanning
  cell fragment may continue on the next page for chrome/grid fidelity, keeps
  the authored cell `nodeId`, and uses the visible row fragment as
  `parentNodeId`.
- R3A splits inside the content of a rowspan origin cell by reusing the existing
  cell content split-point helpers instead of adding a second paragraph slicer.
- Header repetition, forced-progress warnings, and shorter sibling non-duplicate
  rules must stay aligned with the non-rowspan Flow Table split path.

Guardrails:

- Do not move an authored span origin to another row as part of pagination.
- Do not add computed page/slice data to `DocumentNode`.
- Do not make the editor draw a rowspan continuation that core pagination
  cannot reproduce.
- Keep legacy `table` behavior unchanged unless a separate design accepts the
  same rowspan split policy there too.

## Current Evidence

The current code/docs show why Flow Table should be designed as a separate
primitive:

- `packages/core/src/schema/table.ts` defines current authored table props:
  table border/header rows, row `allowBreak`, and cell `rowspan`, `colspan`,
  `padding`, `background`, and `verticalAlign`.
- `packages/core/src/layout/flow.ts` measures current tables in `flowTable(...)`
  and treats table cells as stack-like internal flow boxes before pagination
  emits table-cell fragments.
- `packages/core/src/pagination/paginator.ts` owns current table pagination in
  `paginateTable(...)`, `paginateTableRowFull(...)`,
  `paginateTableRowSplit(...)`, `pushTableCellContents(...)`, and
  `pushCellSlice(...)`.
- `packages/core/src/renderer/pdf/index.ts` renders table cells from
  `cellRenderProps` in `drawCellBorders(...)`; it does not own table layout.
- `docs/TABLE_EDITING_CONTRACT.md` states that renderers consume paginated
  fragments and must not invent a separate table layout policy.
- `docs/CROSS_PAGE_BEHAVIOR.md` documents the current table split and header
  repeat behavior as current `table` behavior, not as the final Flow Table
  architecture.

## Goals

- Create a table-native primitive that can fragment across pages without
  relying on hidden migration or renderer-side relayout.
- Preserve grid/span semantics as first-class authored structure.
- Make PDF/editor visual output consume the same cell slice primitives.
- Keep current `table` behavior stable while Flow Table is experimental.
- Let Flow Table become the future insertion default only after acceptance.
- Keep the model extensible for complex document tables without overcommitting
  v1 to every advanced split case.

## Non-Goals

- Do not auto-convert existing `table` nodes.
- Do not secretly render existing `table` nodes with Flow Table.
- Do not remove legacy `table` in v1.
- Do not promise pixel-perfect DOCX output.
- Do not implement live cross-page WYSIWYG editing in v1.
- Do not implement advanced split-inside-rowspan behavior in v1 unless a later
  design accepts the added complexity.
- Do not use Flow Table as a generic layout grid or as a replacement for
  `flow-row` / `flow-stack`.

## Authored Model Draft

The `flow-table` node family is the accepted working name for the draft. Exact
exported TypeScript aliases may still change during implementation review.

```ts
type FlowTableNode = {
  id: string
  type: "flow-table"
  props: {
    headerRowCount?: number
    border?: CellBorder
  }
  columns: Array<{ width: UnitValue }>
  rowIds: string[]
  nodes: Record<string, FlowTableRowNode | FlowTableCellNode | ParagraphNode | SpacerNode>
}

type FlowTableRowNode = {
  id: string
  type: "flow-table-row"
  props: {
    allowBreak?: boolean
    height?: UnitValue
  }
  cellIds: string[]
}

type FlowTableCellNode = {
  id: string
  type: "flow-table-cell"
  props: {
    colspan?: number
    rowspan?: number
    box?: {
      fill?: string
      padding?: {
        top: UnitValue
        right: UnitValue
        bottom: UnitValue
        left: UnitValue
      }
      border?: CellBorder
    }
    verticalAlign?: "top" | "middle" | "bottom"
    mergeMap?: {
      version: 1
      entries: Array<{
        rowOffset: number
        colOffset: number
        childIds: string[]
      }>
    }
  }
  childIds: string[]
}
```

Draft choices:

- Use a `box` object for cell visual styling so fill, padding, and border use
  the same conceptual shape as paragraph and flow-stack boxes. This is the v1
  draft direction, not an open model question.
- Keep `rowspan` / `colspan` in the authored model from the beginning.
- Keep columns authored as document units, not computed widths.
- `mergeMap` is optional authored metadata used only to restore merged child
  content back to relative cell slots during span shrink/unmerge. It must not
  drive layout, pagination, or renderer geometry.
- Keep computed row heights, cell slice geometry, page indices, and line split
  ranges out of authored data.

## Grid Law

Flow Table must define a strict grid law before implementation:

- `columns.length` is the table grid width.
- Each row resolves into occupied column slots.
- A cell's `colspan` reserves adjacent columns in the same row.
- A cell's `rowspan` reserves the same columns in later rows.
- Invalid overlaps, orphan cells, missing row ids, and impossible spans are
  document validity failures, not renderer concerns.
- The shared resolver is the canonical source for authored table occupancy.
  Mutation code should read resolver placements/slots instead of reimplementing
  rowspan/colspan cursor logic.
- Row/column insertion through spans should expand the covering origin cell and
  create new cells only for slots not covered by that expanded span.
- Row/column deletion through spans may shrink covering cells only when the
  deleted target is not the origin of a continuing span. Deletion that would
  require moving an origin cell or deciding where to move content must no-op.
- Direct cell span authoring must preserve grid law through a core operation.
  Expansion may consume only cells whose entire current span is inside the
  requested rectangle. Non-empty merge appends consumed child blocks in
  row-major order. Shrinking must fill vacated slots with new empty cells.
  Merge left/up must use an existing aligned neighbor origin rather than moving
  the selected cell's authored origin.
- Operations that add or remove rows/columns must preserve the grid law or fail
  clearly.

The assert layer should reject invalid Flow Table structure before pagination.

## Pagination Model Draft

Pagination emits page slices from one authored Flow Table.

Conceptual output:

```txt
page 0:
  flow-table T slice 0
    flow-table-row R1 slice 0
      flow-table-cell C1 slice 0
        paragraph fragments
      flow-table-cell C2 slice 0
    flow-table-row R2 slice 0

page 1:
  flow-table T slice 1
    repeated header rows when applicable
    flow-table-row R2 slice 1
      flow-table-cell C1 slice 1
        continued paragraph fragments
```

Each emitted fragment should preserve:

- authored source node id
- parent/child traceability
- page index
- fragment index where useful
- continuation flags
- line ranges for paragraph children
- explicit warnings for forced-progress overflow

Renderers and editor selection should use fragment metadata, not object order or
DOM heuristics.

## Split Policy Draft

v1 should be conservative.

Normal cells and rows:

- Rows with `allowBreak=false` move as a whole when possible.
- Rows with `allowBreak=true` or omitted may split by cell content progress.
- Cell paragraph content may split by measured line boundaries.
- Short cells in a split row should not duplicate content on continuation
  slices.
- Empty continuation slices are not allowed while remaining content is still at
  the same split point.
- If no clean page can fit one content unit, pagination may force one content
  unit and attach an explicit warning.

Headers:

- `headerRowCount` repeats header rows on continuation pages where body rows
  continue.
- Header rows should be authored rows, not renderer-only decorations.
- Repeated headers belong to paginated output.

Rowspan:

- Any row connected by the same rowspan forms a rowspan-linked row group.
- Breakable rowspan-linked row groups may split at row boundaries. The spanning
  cell emits one `flow-table-cell` fragment per page slice it covers, keeping
  its authored `nodeId` and original grid/span metadata.
- Continuation spanning-cell fragments use the visible row fragment as
  `parentNodeId`; this is render containment, not authored parentage.
- If any row in the rowspan-linked group has `allowBreak=false`, the group
  remains atomic and moves as a unit when possible.
- If a row-boundary slice contains a row taller than one clean page, that row may
  force whole-row progress.
- Paragraph content inside a spanning cell uses the existing Flow Table cell
  split-point helpers across row-boundary continuation slices. Continuation
  paragraph fragments stay parented to the authored spanning cell, while
  continuation cell chrome uses the visible row as render parent.
- If a single visible row slice inside a rowspan group is taller than the page
  because of spanning-cell content, Flow Table may subdivide that visible row
  slice across pages using the same line/spacer split accounting as normal
  breakable table-cell content. Short sibling cells still render their content
  once and only their chrome continues.
- Row-boundary slices do not force an immediate page advance when the current
  page still has usable height. A following row slice may start on the same page
  and continue the spanning-cell paragraph there.
- A spanning cell that also has `colspan>1` keeps the summed column width and
  original grid/span metadata across continuation slices.
- If a non-final row-boundary slice cannot fit normal spanning-cell content
  progress, pagination may force one content unit and attach a
  `forced-flow-table-split-overflow` warning to the visible row and spanning
  cell fragments for that slice.

Colspan:

- Colspan affects width and grid occupancy from the first implementation.
- Colspan does not create cross-page state by itself; it is mostly horizontal
  geometry plus normal vertical cell fragmentation.
- Colspan cells may split vertically like normal cells only when the owning row
  is breakable and no rowspan-linked policy blocks the split.

## Cell Visual Semantics

Flow Table cell style is document styling, not editor-only chrome.

Cell box rules should mirror the paragraph/flow-stack split-box idea:

- fill draws on every emitted cell slice
- left/right borders draw on every emitted slice
- top border draws only on the first logical cell slice
- bottom border draws only on the final logical cell slice
- top padding applies only to the first logical cell slice
- bottom padding applies only to the final logical cell slice
- horizontal padding applies on every slice

This should be implemented as shared table-cell drawing primitives consumed by
editor preview and PDF. DOCX can map the same metadata to Word table cell
features as a best-effort exchange format.

## Renderer Behavior

PDF/editor:

- consume Flow Table fragments from `PaginatedDocument`
- draw cell fills, borders, and text from paginated geometry
- do not compute row splits, header repeats, or span layout
- share helper primitives for table-cell visual output

DOCX:

- remains best-effort
- should serialize Flow Table to editable Word tables when possible
- projects paginated Flow Table row/cell fragments into fixed-layout Word
  tables as the first DOCX support slice
- preserves row heights, cell widths, repeated header fragments, and cell box
  fill/border/padding metadata where Word table formatting supports it
- emits renderer-facing Flow Table grid/span metadata so DOCX can project
  `colspan` to Word `gridSpan` and `rowspan` to Word vertical merge metadata
- may differ after Word/LibreOffice reflows text
- must not become a second Flow Table layout engine

## Editor Behavior Draft

v1 editor support should be static and explicit:

- palette inserts a new 3x3 Flow Table primitive, not legacy `table`
- selection can target table, row, and cell fragments
- property panel can edit the first accepted v1 props: table header rows,
  row break allowance, and basic cell text/vertical alignment
- text editing can stay conservative and reuse current safe cell-edit paths
- live cross-page WYSIWYG editing inside Flow Table is deferred
- safe span editing UI may expose `rowspan`/`colspan`, directional merge with
  row-major content append, and unmerge only through core operations that
  preserve grid law; merge-map-backed unmerge restores mapped children to
  replacement cells where source-slot metadata exists

## Migration And Compatibility

No automatic migration is planned.

Explicit decisions:

- Existing documents with `table` keep `table`.
- New Flow Table documents use `flow-table`.
- Import does not rewrite `table` to `flow-table`.
- Renderers do not secretly project `table` into Flow Table.
- Persistence should round-trip both node families independently while both are
  supported.
- A future manual conversion command may be discussed later, but it is not part
  of v1.
- Removing or hiding legacy `table` is an open decision after Flow Table
  acceptance.

## Implementation Path

Suggested order:

1. Finalize this spec enough to accept v1 scope.
2. Add schema and assert/normalize support for `flow-table`,
   `flow-table-row`, and `flow-table-cell`.
3. Add small document operation helpers for insertion only.
4. Add core layout measurement for one-page static Flow Tables.
5. Add pagination for non-spanning rows.
6. Add `colspan` width/grid support.
7. Add conservative `rowspan` atomic-group support.
8. Add repeated header rows.
9. Add split row/cell continuation for non-rowspan groups.
10. Add PDF/editor cell visual primitives and focused raster tests.
11. Add DOCX best-effort projection.
12. Add insertion UI after schema, pagination, PDF, and editor preview have
    enough coverage. Current status: explicit 3x3 palette insertion exists.
13. Add C1 span-free row/column editor operations. Current status: implemented
    for non-spanning Flow Tables.
14. Add C2.0 mutation-oriented grid resolver metadata. Current status:
    implemented without changing editor operations.
15. Add C2.1 span-aware row/column insertion. Current status: implemented for
    add row/add column only.
16. Add C2.2 conservative span-aware row/column deletion. Current status:
    implemented only for targets that do not move span origins.
17. Add C2.3A safe cell span controls. Current status: implemented for
    empty-cell expansion and empty-cell replacement on shrink.
18. Add C2.3B/C2.4 safe empty-cell merge and unmerge controls. Current status:
    implemented using the C2.3A span operation.
19. Add C2.5A non-empty merge with row-major content append. Current status:
    implemented for selected-cell expansion.
20. Add C2.6 neighbor-origin merge left/up. Current status: implemented for
    aligned neighboring origins without true span-origin movement.
21. Add C2.7A merged-cell multi-paragraph text editing in the PropertyPanel.
    Current status: implemented for existing paragraph children.
22. Add C2.8A merge-map schema/assert/normalize foundation. Current status:
    implemented without changing merge/unmerge behavior.
23. Add C2.8B merge-map writing during Flow Table cell merge. Current status:
    implemented for span expansion.
24. Add C2.8C merge-map restoration during Flow Table cell shrink/unmerge.
    Current status: implemented for existing relative slot metadata.
25. Add C2.8D merge-map maintenance during Flow Table row/column insertion
    and deletion. Current status: implemented for conservative shift/prune
    semantics.
26. Add Flow Table rowspan row-boundary pagination. Current status:
    implemented for breakable groups, including spanning-cell content flow,
    mixed `rowspan`/`colspan` core pagination coverage, and forced-warning
    fallback for low-capacity rowspan slices.
27. Add C2 span-origin movement and broader span authoring operations.

## Test Plan

Schema/assert tests:

- valid one-row Flow Table passes
- invalid missing row/cell ids fail
- overlapping spans fail
- out-of-range spans fail
- legacy `table` remains valid and unchanged

Pagination tests:

- one-page Flow Table emits table/row/cell/paragraph fragments
- column widths and colspan widths match authored columns
- `allowBreak=false` rowspan-linked Flow Table rows stay atomic
- breakable rowspan-linked Flow Table rows split at row boundaries with
  continuation cell chrome, spanning-cell content fragments, and mixed
  `rowspan`/`colspan` geometry
- breakable non-rowspan rows split by line ranges
- repeated headers appear on continuation pages
- no empty continuation slice without progress
- forced-progress warnings appear for impossible non-rowspan and rowspan slice
  cases

Renderer/editor tests:

- PDF renders Flow Table without throwing
- PDF raster checks cell fill/border geometry
- PDF raster checks Flow Table rowspan continuation cell fill/border geometry
- editor preview draws from the same cell primitives
- DOCX emits valid ZIP output with useful table structure

Product fixture tests:

- dense customs-style table
- repeated header multi-page table
- breakable uneven row table
- span boundary table

## Acceptance Gate

Flow Table should not become the default inserted table until:

- schema/assert/normalize support is covered
- static pagination supports the accepted v1 cases
- PDF/editor preview use the same paginated cell primitives
- focused PDF raster visual tests pass for cell fill/border/split behavior
- DOCX best-effort output is documented and smoke-tested
- legacy `table` documents remain unaffected
- no automatic migration exists

## Risk Map

High risks:

- grid law bugs causing hidden overlap or orphan cells
- row/column operation bugs corrupting spans
- empty continuation slices duplicating or skipping content
- rowspan policy becoming ambiguous across pages
- repeated headers consuming all available height
- renderer code accidentally becoming a second layout engine
- user confusion if legacy `table` and Flow Table are not visibly distinct

Mitigation:

- keep Flow Table explicit and separate
- implement schema/assert before editor UI
- add pagination tests before renderer output
- keep v1 split policy conservative
- use PDF raster tests for visual primitives, not for broad layout invention
- defer legacy table hiding/removal until Flow Table acceptance

## Open Decisions

- Whether `box` should share exact TypeScript types with paragraph/flow-stack
  boxes or use table-specific aliases with the same conceptual shape.
- Whether v1 needs manual row/column insertion operations or insertion-only
  static fixtures are enough at first. Current answer: v1 has C1 span-free
  row/column operations; span-aware edits remain C2.
- Whether `height` should be accepted in Flow Table rows in v1.
- How much vertical-align behavior belongs in v1.
- Whether split-inside-rowspan should ever be supported or remain permanently
  out of scope.
- When, if ever, legacy `table` should be hidden or removed from the insertion
  UI.
