# Table Editing Contract

This document defines the table authoring rules that must stay true while table
pagination and cross-page behavior continue to evolve. It focuses on the
editable document model and editor operations. For page-boundary behavior, use
`docs/CROSS_PAGE_BEHAVIOR.md` as the source of truth.

## Ownership

- `packages/core` owns table structure, grid invariants, document operations,
  and pagination semantics.
- The editor owns selection, property controls, and interaction state. It should
  call core operations or update authored props; it should not manually patch a
  table into a shape that core would reject.
- Renderers consume the paginated fragments they receive. They must not invent a
  separate table layout policy.

## Authored Table Model

Tables are authored data, not computed layout output.

- `table.columns` stores authored column widths.
- `table.rowIds` stores row order.
- `table.nodes` owns table rows, cells, and cell child content.
- `table-cell` nodes are the editable cell containers. Paragraphs inside cells
  remain normal authored paragraph nodes, but they are scoped to the table.
- `headerRowCount` means the first N rows are header rows for pagination.
- `allowBreak` belongs to table rows. Omitted means `true` for single-row groups.

Computed values such as page index, rendered cell x/y, split line boundaries,
and repeated-header placement belong to `PaginatedDocument`, not the table model.

Flow measurement note:

- During layout measurement, table cells currently use stack-like
  `FlowBox.nodeType="stack"` container semantics.
- Pagination converts those cell flow boxes to
  `PageFragment.nodeType="table-cell"` for renderer/debug/placement identity.
- Code that needs rendered or user-visible table identity should use authored
  `table-cell` nodes or paginated fragments, not infer it from the internal
  flow-box container detail.

## Editor Selection Rules

The canvas should make the table structure directly editable.

- Single-clicking rendered content inside a cell selects the parent
  `table-cell`, not the inner paragraph.
- Double-clicking a table cell may enter inline edit for the first paragraph in
  that cell.
- The property panel for `table-cell` is the main surface for cell text and cell
  props.
- Body paragraphs must keep their normal click-to-edit behavior. Table-specific
  selection should not make non-table paragraph editing worse.
- If a cell has no editable paragraph, the editor may no-op or create a valid
  paragraph through a core operation. It must not create orphan nodes.

## Editable Props

The editor may expose these authored table props:

- Table: `headerRowCount`
- Row: `allowBreak`
- Cell: text in the first paragraph child, `padding`, `background`,
  `verticalAlign`

Prop controls should clamp to values the schema accepts:

- `headerRowCount` stays between 0 and the current row count.
- `padding` stays non-negative.
- `background` stores only 6-digit hex without a leading `#`.
- `verticalAlign` is one of `top`, `middle`, or `bottom`.

## Row And Column Operations

Table operations must preserve document validity.

- `addTableRow` and `removeTableRow` must preserve table grid invariants and
  pass `assertDocument`.
- `addTableColumn` and `removeTableColumn` must preserve table grid invariants
  and pass `assertDocument`.
- Row deletion must keep `headerRowCount` valid by clamping it to the remaining
  row count.
- Column insertion should keep the total table width stable by splitting the
  target or nearest column width.
- Column deletion should keep the total table width stable by transferring the
  removed width to a neighboring column.
- Adding or deleting columns is not an implicit table resize. A future explicit
  resize interaction should be the only UI action that intentionally changes the
  total table width.
- Operations that cannot preserve the table grid should no-op or fail clearly
  rather than leaving cleanup work for the UI.

Flow Table C1 operations:

- `flow-table` has separate row/column operations from legacy `table`.
- C1 supports add/remove row and add/remove column only for span-free Flow
  Tables where every cell has `rowspan=1` and `colspan=1`.
- If a Flow Table contains any span, C1 structural operations no-op. Span-aware
  row/column edits belong to the later C2 span operation slice.
- Flow Table row deletion must clamp `headerRowCount` in the same way as legacy
  table row deletion.
- Flow Table column insertion/deletion must preserve total authored table width
  by splitting the target column or transferring removed width to a neighbor.

Flow Table C2 foundation:

- Span-aware structural operations must use the shared Flow Table grid resolver
  to decide cell origin positions, covered slots, and row/column boundaries.
- Operation code must not maintain a second ad hoc rowspan/colspan cursor once
  it needs to edit spanned Flow Tables.
- The C2.0 resolver metadata does not change editor behavior by itself. It is
  preparation for later span-aware add/remove and merge/unmerge patches.
- C2.1 allows add-row and add-column operations on spanned Flow Tables. When
  the insert boundary cuts through `rowspan` or `colspan`, the covering origin
  cell expands its span and the new row/column creates cells only in uncovered
  slots.
- C2.2 allows conservative row/column deletion on spanned Flow Tables only when
  the operation does not move a span origin.
- Deleting a target covered by a span from above/left may shrink the covering
  `rowspan` or `colspan`.
- Deleting a row/column that is the origin of a continuing span must no-op
  until a later patch defines content/origin movement rules.
- C2.3A allows direct Flow Table cell `rowspan`/`colspan` edits only through a
  core operation that keeps the grid valid. Expansion may consume only empty
  cells that are wholly inside the requested span rectangle. Shrinking creates
  empty replacement cells in vacated slots.
- C2.3B/C2.4 allows directional empty-cell merge and unmerge controls that
  call the same core span operation. `Merge right`/`Merge down` are convenience
  actions for increasing `colspan`/`rowspan`; `Unmerge` collapses the selected
  span to `1x1`.
- C2.5A allows directional merge through non-empty consumed cells when those
  cells are wholly inside the requested span rectangle. Consumed cell child
  blocks are appended to the selected cell in row-major order; empty placeholder
  paragraphs are discarded.
- C2.6 allows `Merge left` and `Merge up` only when one aligned neighboring
  origin can consume the selected cell. The surviving origin is the existing
  left/upper neighbor, content is appended in row-major order, and editor
  selection moves to that surviving cell.
- C2.7A allows the Flow Table cell PropertyPanel to surface every paragraph
  child in the selected cell. This keeps content appended by non-empty merge
  visible and editable without adding source-cell mapping metadata.
- C2.8A adds optional Flow Table cell `mergeMap` metadata to the schema,
  assertion, and normalization layers. This is a document-owned foundation for
  later content restoration.
- C2.8B writes `mergeMap` during Flow Table cell span expansion when merge
  appends non-empty content or carries existing mapped content. Chained merges
  must shift relative offsets instead of flattening source slots.
- C2.8C consumes `mergeMap` during Flow Table cell shrink/unmerge. Mapped
  child blocks whose source slots remain inside the surviving span stay in the
  origin cell; mapped child blocks from released slots move into the replacement
  cells created for those slots. Unmapped child blocks stay with the origin cell
  to avoid data loss. Restored cells do not receive a new `mergeMap` in this
  slice.
- C2.8D keeps `mergeMap` conservative under row/column insertion and deletion.
  Inserting a row/column through a mapped span shifts mappings at or after the
  inserted relative offset forward. Deleting a row/column through a mapped span
  drops mappings for deleted source slots, keeps those child blocks on the
  origin cell, and shifts mappings after the deleted relative offset back.
- These controls must not move an authored span origin or make the property
  panel patch span props directly. Left/up merge is a neighbor-origin action,
  not selected-cell origin movement.

## Pagination-Related Authoring Rules

These authored props directly affect cross-page behavior:

- `headerRowCount`: header rows repeat on continuation pages where body rows
  continue.
- `allowBreak=false`: a single-row group should move as a whole when possible.
- `allowBreak=true` or omitted: a single-row group may split by table-cell
  paragraph line boundaries.
- Rowspan-linked groups stay atomic until split-at-row-boundary inside rowspan
  groups is explicitly implemented.

Changing these rules requires updating `docs/CROSS_PAGE_BEHAVIOR.md`, adding or
adjusting fixtures, and keeping the full test suite green.

## Verification Bar

Any table editing change should check the smallest set that protects the touched
behavior:

- Core table operation or pagination change:
  - run the focused `tablePagination.test.ts`
  - run the full test command for the current shell
- Editor table interaction change:
  - run type-check for the current shell
  - browser-check selection and property-panel flow on `http://localhost:4000/editor`
- Contract or behavior change:
  - update this document, `docs/CROSS_PAGE_BEHAVIOR.md`, or
    `docs/LAYOUT_ENGINE_CHECKLIST.md` as appropriate

## Current Deferred Work

- Canvas selection/editing ergonomics for multiple paragraphs inside one table
  cell.
- Explicit table or column resize UI.
- Broader content-mapping controls beyond merge-map-backed shrink/unmerge.
- True span-origin movement for arbitrary left/up span authoring.
- Split-at-row-boundary within rowspan-linked groups.
- Visual regression tests for editor/PDF parity on multi-page tables.
