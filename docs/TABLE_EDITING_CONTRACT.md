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
- Column insertion should keep the total table width stable by splitting the
  target or nearest column width.
- Column deletion should keep the total table width stable by transferring the
  removed width to a neighboring column.
- Adding or deleting columns is not an implicit table resize. A future explicit
  resize interaction should be the only UI action that intentionally changes the
  total table width.
- Operations that cannot preserve the table grid should no-op or fail clearly
  rather than leaving cleanup work for the UI.

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

- Selection and editing for multiple paragraphs inside one table cell.
- Explicit table or column resize UI.
- Span-aware authoring UI for `rowspan` and `colspan`.
- Split-at-row-boundary within rowspan-linked groups.
- Visual regression tests for editor/PDF parity on multi-page tables.
