# Work Log Recent

This file keeps only the most recent active work-log section for agent context. The full historical log is archived at `docs/archive/WORK_LOG_FULL.md`.

﻿# Work Log

This document tracks completed work on FlowDocEditor so future sessions can quickly see what changed, what was verified, and what remains open.

For the expected collaborator/session workflow, including when to update this
file, see `docs/AGENT_WORKFLOW.md`.

## Log Format

Each entry should include:

- Date/time
- Goal
- Summary of completed work
- Files changed
- Verification performed
- Notes or follow-ups

---

## 2026-05-18

### Add Flow Table C2.8D Merge Map Row/Column Maintenance

Goal: Keep Flow Table merge-map metadata valid and useful when row/column
operations edit spans that already contain mapped merged content.

Completed:

- Added operation helpers to normalize shifted/pruned `mergeMap` entries after
  row/column structural edits.
- Shifted mapped row offsets forward when inserting a row through a mapped span.
- Shifted mapped column offsets forward when inserting a column through a
  mapped span.
- Shifted offsets back when deleting an inserted empty row through a mapped
  span.
- Pruned mappings for deleted source slots while keeping their child blocks on
  the origin cell to avoid data loss.
- Added focused operation coverage for insert-row, insert-column, remove
  inserted-row, and mapped-column deletion fallback behavior.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/assert.test.ts src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- This does not add true arbitrary span-origin movement.
- Deleting a source slot intentionally preserves child content on the origin
  cell instead of trying to restore a deleted slot.
- The project version marker test was aligned to the already-accepted `0.5.6`
  root package marker so the app suite can pass after the prior release bump.

### Add Flow Table C2.8C Merge Map Restoration

Goal: Use Flow Table merge-map metadata to restore merged content during
span shrink and unmerge without adding new UI controls.

Completed:

- Added shrink/unmerge content splitting for `flow-table-cell.props.mergeMap`.
- Kept mapped child blocks whose source slots remain inside the new span on the
  surviving origin cell.
- Reused mapped child blocks from released slots when creating replacement
  cells.
- Kept unmapped child blocks on the origin cell to avoid data loss.
- Cleared `mergeMap` metadata from restored cells in this slice.
- Added focused operation coverage for full unmerge restoration and partial
  shrink restoration.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/assert.test.ts src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- This does not add true arbitrary span-origin movement.
- Restored replacement cells do not receive nested merge maps yet.

### Add Flow Table C2.8B Merge Map Writing

Goal: Start recording source-slot metadata during Flow Table cell merge without
turning on unmerge restoration yet.

Completed:

- Updated `updateFlowTableCellSpan(...)` to write `mergeMap` during span
  expansion when merge appends non-empty content or carries existing mapped
  content.
- Composed merge maps across chained merges by shifting consumed cell offsets
  relative to the surviving origin cell.
- Kept empty-only merge free of unnecessary metadata.
- Cleared stale `mergeMap` metadata on shrink/unmerge because restoration is
  still deferred in this slice.
- Added focused operation coverage for 2x2 non-empty merge mapping,
  neighbor-origin left/up mapping, chained merge offset preservation, empty-only
  merge, and current no-restore unmerge behavior.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/assert.test.ts src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- Unmerge content restoration from `mergeMap` remains deferred to C2.8C.
- True arbitrary span-origin movement remains deferred.

### Add Flow Table C2.8A Merge Map Schema Foundation

Goal: Add a document-owned metadata foundation for future Flow Table content
restoration without changing current merge/unmerge behavior.

Completed:

- Added optional `flow-table-cell.props.mergeMap` schema with versioned entries
  that map child ids to relative row/column offsets inside the current span.
- Added assert-layer validation that merge-map offsets stay inside the current
  `rowspan`/`colspan`, mapped child ids belong to the owning cell, and a child
  id is not mapped more than once.
- Added normalization for stale merge-map entries, pruning invalid offsets,
  missing child ids, and duplicate child mappings.
- Added focused assert and normalize coverage for valid metadata, invalid
  child references, out-of-span offsets, and stale-entry pruning.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `packages/core/src/schema/table.ts`
- `packages/core/src/document/assert.ts`
- `packages/core/src/document/assert.test.ts`
- `packages/core/src/document/normalize.ts`
- `packages/core/src/document/normalize.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/assert.test.ts src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- Merge/unmerge operations do not yet write or consume `mergeMap`.
- Content restoration remains deferred to the next C2.8 slice.

### Add Flow Table C2.7A Merged Cell Multi-Paragraph Text Editing

Goal: Keep content appended by non-empty Flow Table merge visible and editable
from the PropertyPanel without changing schema, pagination, export, or merge
metadata.

Completed:

- Updated the selected Flow Table cell PropertyPanel to render every paragraph
  child as its own text area instead of only the first child paragraph.
- Kept mixed-inline paragraphs read-only through the existing
  `isPlainTextParagraph(...)` guard.
- Kept text updates on the existing `updateParagraphText(...)` operation, which
  already supports paragraphs nested inside `flow-table` nodes.
- Added PropertyPanel coverage for a merged cell containing multiple paragraph
  children.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`
- `$env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:editor`

Notes:

- This patch does not add paragraph add/delete/reorder controls.
- Canvas-level selection ergonomics for multiple paragraph children remain
  deferred.

## 2026-05-17

### Add Flow Table C2.6 Neighbor-Origin Merge Left/Up

Goal: Add practical `Merge left` and `Merge up` controls without introducing
true span-origin movement or source-cell content mapping metadata.

Completed:

- Added a core `resolveFlowTableCellMergeTarget(...)` helper that resolves
  directional merge intent into the existing span operation target.
- Kept `Merge right`/`Merge down` as selected-cell expansion and added
  `Merge left`/`Merge up` as neighbor-origin actions when an aligned left/upper
  origin can consume the selected cell.
- Reused `updateFlowTableCellSpan(...)` for all content append and grid-law
  preservation.
- Moved editor selection to the surviving neighbor after left/up merge.
- Added focused operation coverage for merge left, merge up, and misaligned
  left-neighbor blocking.
- Updated PropertyPanel coverage for the new left/up affordances.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`
- `$env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:editor`

Notes:

- Default bundled-Chromium `npm.cmd run smoke:editor` timed out after 240s
  before emitting pass/fail detail. The same smoke passed with system Chrome.
- True arbitrary span-origin movement remains deferred.
- Source-cell content mapping restoration remains deferred.

### Add Flow Table C2.5A Non-Empty Merge Append

Goal: Allow practical Flow Table merge through non-empty cells without adding
source-cell content metadata or span-origin movement.

Completed:

- Updated the shared Flow Table span operation so selected-cell expansion may
  consume non-empty cells that are wholly inside the requested span rectangle.
- Appended consumed cell child blocks to the selected cell in row-major order.
- Discarded empty placeholder paragraphs from consumed cells so empty merge
  does not create extra blank content.
- Kept unmerge behavior intentionally one-way for content: combined content
  stays in the selected cell and vacated slots receive empty replacement cells.
- Updated PropertyPanel copy for `Merge right`, `Merge down`, and `Unmerge` to
  reflect content append behavior.
- Added focused operation coverage for row-major content append and unmerge
  after content merge.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`
- `npm.cmd run smoke:editor`

Notes:

- Source-cell content mapping restoration remains deferred.
- Span-origin movement remains deferred.

### Add Flow Table C2.3B/C2.4 Empty Merge And Unmerge Controls

Goal: Make the safe span operation easier to use from the PropertyPanel without
adding non-empty content merge or span-origin movement.

Completed:

- Added Flow Table cell `Merge right`, `Merge down`, and `Unmerge` controls.
- Wired the buttons through `canUpdateFlowTableCellSpan(...)` and
  `updateFlowTableCellSpan(...)` so the editor never patches span props
  directly.
- Kept merge limited to empty cells wholly consumed by the requested span
  rectangle.
- Kept unmerge limited to collapsing the selected span to `1x1` and creating
  empty replacement cells.
- Added focused operation coverage for one-step right/down empty-cell merge.
- Extended PropertyPanel coverage for merge/unmerge affordances and blocked
  merge titles.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`
- `npm.cmd run smoke:editor`

Notes:

- Non-empty content merge remains a design gate.
- Span-origin movement remains deferred.

### Add Flow Table C2.3A Safe Cell Span Controls

Goal: Let the PropertyPanel author Flow Table cell `rowspan`/`colspan` through
a core operation without enabling content merge, span-origin movement, or
direct panel-side table patching.

Completed:

- Added `updateFlowTableCellSpan(...)` and
  `canUpdateFlowTableCellSpan(...)` to the document operations layer.
- Expansion now succeeds only when every consumed cell is empty and wholly
  inside the requested span rectangle.
- Shrinking a selected span creates empty replacement cells in the vacated grid
  slots so the Flow Table remains valid.
- Kept non-empty content merge and span-origin movement out of scope; blocked
  attempts no-op.
- Wired Flow Table cell PropertyPanel span controls through the new core
  operation.
- Added focused core and app coverage for empty-cell expansion, non-empty-cell
  blocking, shrink replacement cells, and rendered span controls.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- This is not general merge/unmerge. Cells with authored content are not merged
  or moved.
- Cross-page WYSIWYG editing inside Flow Table remains deferred.

### Add Flow Table C2.2 Conservative Span-Aware Delete

Goal: Let Flow Table delete rows/columns through spans only when the operation
can preserve grid law without moving a span origin or deciding where content
should move.

Completed:

- Added exported `canRemoveFlowTableRow(...)` and
  `canRemoveFlowTableColumn(...)` helpers backed by the shared Flow Table grid
  resolver.
- Updated `removeFlowTableRow(...)` so deleting a row covered by a `rowspan`
  from above shrinks the covering cell, deletes only origin cells that live
  fully in the removed row, and still blocks deletion when the removed row owns
  a continuing span.
- Updated `removeFlowTableColumn(...)` with the same conservative policy for
  `colspan`, including width transfer preservation.
- Rewired PropertyPanel delete buttons to use the same core safe-delete helpers
  that document mutations use.
- Added focused tests for safe row deletion through `rowspan`, blocked row
  origin deletion, safe column deletion through `colspan`, blocked column origin
  deletion, and property-panel enablement/locking.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`

Notes:

- Span-origin movement and merge/unmerge remain intentionally deferred.
- Browser smoke was not run for this entry yet.

### Add Flow Table C2.1 Span-Aware Insert Operations

Goal: Let Flow Table add-row and add-column operations work on valid spanned
tables without enabling span-aware deletion or merge/unmerge yet.

Completed:

- Updated `addFlowTableRow(...)` to use the Flow Table grid resolver for
  insert-boundary decisions.
- When a new row cuts through an existing `rowspan`, the covering origin cell
  now expands its `rowspan`; the inserted row creates empty cells only in
  columns not covered by that span.
- Updated `addFlowTableColumn(...)` with the same resolver-backed policy for
  `colspan`, including width splitting and total table width preservation.
- Kept spanned row/column deletion conservative: delete still no-ops until C2
  defines origin/content movement rules.
- Opened PropertyPanel add-row/add-column controls for valid spanned Flow
  Tables while keeping delete controls disabled for spanned grids.
- Added focused core tests for row insertion through `rowspan` and column
  insertion through `colspan`, plus app markup coverage for add-only spanned
  controls.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`

Notes:

- Span-aware deletion and merge/unmerge remain intentionally deferred.
- Browser smoke was not run for this entry yet.

### Add Flow Table C2.0 Grid Mutation Metadata

Goal: Start C2 span-aware Flow Table work with a resolver-only foundation that
does not change editor operations yet.

Completed:

- Extended `resolveFlowTableGrid(...)` with mutation-oriented metadata while
  preserving the existing `slots` and `placements` surfaces used by layout and
  pagination.
- Added per-slot origin metadata so future operations can distinguish physical
  row/column slots from the originating cell row/column.
- Added placement end bounds, covered slot lists, and placement lookup by cell
  id for later span-aware row/column operations.
- Added `tryResolveFlowTableGrid(...)` for callers that need typed invalid
  results rather than exceptions.
- Hardened resolver validation for duplicate cell references and invalid
  non-positive spans when the resolver is called outside document assertion.
- Updated Flow Table spec, table editing contract, and test strategy notes for
  the C2.0 boundary.

Verification:

- `npm.cmd run test -w packages/core -- src/document/flowTableGrid.test.ts`

Notes:

- Span-aware add/remove row/column behavior remains intentionally unchanged.
- Merge/unmerge remains a later C2 product/operation decision.

### Add Flow Table Editor Entry

Goal: Start Flow Table editor usability with a small, reversible A1 slice:
explicit 3x3 insertion plus enough selection/text support to inspect and edit
the inserted primitive.

Completed:

- Added `createDefaultFlowTable()` and mapped the `flow-table` palette source
  to a schema-valid 3x3 Flow Table with paragraph children in every cell.
- Added `flow-table` to placement palette typing and protected body insertion
  while keeping Flow Table insertion rejected inside `flow-stack`.
- Added the Flow Table palette item without replacing the legacy `table`
  palette item.
- Extended editor selection helpers, breadcrumb context, outline, and property
  lookup to recognize `flow-table`, `flow-table-row`, and `flow-table-cell`.
- Reused conservative table-cell text paths for Flow Table cell text editing,
  field references, filling, and snapshot binding.
- Documented the current editor-entry status in the Flow Table spec and test
  strategy.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/placement/law.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorPalette.test.ts src/app/editor/_components/__tests__/selectionContext.test.ts`
- `npm.cmd run test -w packages/core -- src/fieldRegistry/index.test.ts src/binding/index.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- Legacy `table` insertion is intentionally still present.
- Flow Table row/column/span editing operations remain later slices.
- Live cross-page WYSIWYG editing inside Flow Table remains deferred.

### Add Flow Table DOCX Span Metadata

Goal: Carry Flow Table span semantics through pagination into DOCX without
making the DOCX renderer read authored schema or recompute table layout.

Completed:

- Added renderer-facing Flow Table grid metadata to paginated table and row
  fragments.
- Added renderer-facing Flow Table cell span metadata with column index,
  `colspan`, and `rowspan`.
- Updated DOCX Flow Table projection to use paginated base column widths,
  Word `gridSpan`, and Word vertical merge metadata.
- Added pagination assertions for Flow Table grid/span metadata.
- Added DOCX XML coverage for Flow Table base grid columns, `gridSpan`, and
  `vMerge` output.
- Hardened split/repeated-header DOCX coverage so continuation pages without a
  parent table fragment still preserve base column widths.
- Updated Flow Table, renderer contract, and test strategy docs.

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- DOCX still consumes only `PaginatedDocument`; it does not import schema,
  layout, measurers, or word breakers.
- Split-inside-rowspan remains intentionally deferred under the current Flow
  Table pagination policy.

### Add Flow Table DOCX Fragment Projection

Goal: Add the first best-effort DOCX support slice for Flow Table by projecting
paginated fragments to editable fixed-layout Word tables without adding
semantic span metadata yet.

Completed:

- Extended DOCX fragment grouping to recognize `flow-table`,
  `flow-table-row`, and `flow-table-cell` fragments.
- Added synthetic Flow Table grouping for continuation pages that contain
  repeated header/body row fragments without a parent table fragment.
- Projected Flow Table rows/cells to fixed-layout DOCX tables using paginated
  table width, row heights, cell widths, cell box fill/border/padding metadata,
  and editable paragraph children.
- Added focused DOCX renderer tests for static Flow Table geometry/styling and
  split Flow Table output with repeated headers.
- Updated renderer contract, Flow Table spec, and test strategy notes for the
  Phase A DOCX projection scope.

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd test`

Notes:

- Semantic DOCX span metadata such as `gridSpan` and `vMerge` was intentionally
  deferred from this Phase A slice and is covered by the later DOCX span
  metadata entry above.
- DOCX remains an exchange format; PDF/editor pagination remains the visual
  authority.

### Add Flow Table Repeated Headers

Goal: Bring Flow Table closer to authored table behavior by repeating
`headerRowCount` rows during core pagination, without adding DOCX projection or
editor UI yet.

Completed:

- Reused the legacy table pagination policy for Flow Table header repetition.
- Added `placeHeaders` support for Flow Table body continuation pages.
- Updated Flow Table row splitting so repeated headers consume continuation page
  height before body row split decisions.
- Kept header rows atomic; body rows still split only in non-rowspan groups.
- Added focused tests for normal repeated headers and tall repeated headers that
  leave limited body capacity.
- Updated Flow Table, cross-page, and layout specs to record the new behavior.

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts src/document/flowTableGrid.test.ts src/document/assert.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- DOCX Flow Table projection, editor insertion/property UI, and
  split-inside-rowspan remain intentionally deferred.

### Draw Flow Table Cell Boxes In PDF And Editor

Goal: Make the first Flow Table visual output consume paginated
`flow-table-cell` box metadata without adding DOCX, repeated headers, or editor
authoring UI yet.

Completed:

- Wired PDF rendering to draw `flow-table-cell.boxRenderProps` through the
  shared fragment box primitive.
- Wired editor SVG preview to draw Flow Table cell fill/border and hide generic
  editor chrome over authored cell boxes.
- Added primitive tests for Flow Table cell static and split border semantics.
- Added a PDF smoke test plus opt-in raster coverage for Flow Table cell
  fill/border pixels.
- Added an EditorCanvas markup test for Flow Table cell box rendering.
- Updated Flow Table and export renderer docs to record the supported visual
  slice.

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- DOCX Flow Table projection, repeated headers, editor insertion/property UI,
  and split-inside-rowspan remain intentionally deferred.

### Add Flow Table Non-Rowspan Split Pagination

Goal: Add the first cross-page Flow Table slice without taking on repeated
headers, renderer output, editor UI, or split-inside-rowspan behavior.

Completed:

- Added breakable non-rowspan Flow Table row/cell split pagination.
- Preserved `allowBreak=false` row movement and kept rowspan-linked Flow Table
  rows atomic in v1.
- Added Flow Table forced-progress warning plumbing for impossible low-capacity
  row splits.
- Ensured shorter sibling cells do not duplicate their paragraph content on
  continuation slices.
- Kept Flow Table parent fragments aligned with the first row when a split must
  start on a clean page.
- Updated cross-page and layout specs to record the new Flow Table split policy.

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts src/document/flowTableGrid.test.ts src/document/assert.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- Repeated headers, PDF/DOCX/editor rendering, editor insertion/property UI, and
  split-inside-rowspan remain intentionally deferred.

### Add Flow Table Static Layout And Pagination

Goal: Let the new Flow Table primitive produce core geometry for one-page,
unsplit cases before adding cross-page row/cell split behavior or editor UI.

Completed:

- Added `flow-table`, `flow-table-row`, and `flow-table-cell` flow fragment
  kinds.
- Implemented static Flow Table measurement using authored columns,
  `colspan`, `rowspan`, row height, and cell box padding.
- Added unsplit block pagination for Flow Table. A Flow Table moves to the next
  page when it does not fit the remaining space, but row/cell splitting remains
  deferred.
- Emitted Flow Table page fragments with paragraph child fragments and
  cell-level `boxRenderProps` metadata for later renderer work.
- Extended drift/placement type surfaces enough to accept the new fragment
  kinds without enabling editor insertion or drag behavior.
- Added focused pagination tests for one-page fragments, span geometry, and
  whole-table page movement.

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts src/document/flowTableGrid.test.ts src/document/assert.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- Runtime row/cell split pagination, repeated headers, PDF/DOCX rendering,
  editor insertion, and property editing are intentionally deferred.

### Add Flow Table Schema And Grid Resolver

Goal: Start Flow Table implementation with a small reversible model/assertion
slice before touching layout, pagination, renderer, or editor insertion.

Completed:

- Added draft `flow-table`, `flow-table-row`, and `flow-table-cell` schema
  support with cell `box` styling.
- Added a standalone `resolveFlowTableGrid(...)` helper that resolves
  row/column occupancy for `colspan` and `rowspan`.
- Wired `assertDocument(...)` to validate Flow Table internals, row/cell
  reachability, child ownership, header row count, and grid fill/span rules.
- Kept runtime layout disabled with an explicit `flow-table layout is not
  implemented yet` error if a hand-authored Flow Table reaches the flow layer.
- Added focused tests for Flow Table grid resolution and document assertion.

Verification:

- `npm.cmd run test -w packages/core -- src/document/assert.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- Runtime layout, pagination, renderer output, editor insertion, and property
  editing are intentionally deferred.

### Draft Flow Table Spec

Goal: Capture the agreed direction for a new explicit table primitive before
changing schema, pagination, editor, or renderer code.

Completed:

- Added `docs/FLOW_TABLE_SPEC.md` as the Flow Table design draft.
- Recorded the core decision that Flow Table is a separate explicit primitive,
  not an automatic migration or hidden projection of legacy `table`.
- Defined provisional authored model, grid law, pagination slices, conservative
  v1 split policy, renderer/editor behavior, migration stance, implementation
  path, test plan, acceptance gate, risk map, and open decisions.
- Locked the draft direction for the `flow-table` node family name, cell `box`
  styling, `colspan` grid support from the start, and conservative atomic
  `rowspan` groups in v1.
- Updated `docs/DOCS_INDEX.md` so future table design work can find the new
  spec.

Verification:

- `git diff --check`

Notes:

- This is docs-only. No runtime `table` or proposed `flow-table` behavior was
  changed.

### Add PDF Raster Coverage For Split Boxed Paragraphs

Goal: Prove the PDF renderer draws a split paragraph box as one logical box
sliced across pages.

Completed:

- Extended the PDF raster test helper so a test can rasterize a specific PDF
  page from the same exported artifact.
- Added an opt-in raster case for a boxed paragraph that splits across pages.
- Checked that the first slice draws top/side borders but no bottom border, and
  the final slice draws bottom/side borders but no top border.
- Updated renderer/test docs to record focused split paragraph box raster
  coverage.

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:pdf-visual`
- `git diff --check`

Notes:

- This keeps renderer behavior unchanged and only adds a focused PDF visual
  guardrail for the existing paragraph box split contract.

### Add PDF Raster Coverage For Border Styles

Goal: Strengthen the PDF-first export guardrail by checking authored dashed and
dotted paragraph borders in actual rasterized PDF output.

Completed:

- Added an opt-in PDF raster visual regression case for dashed and dotted
  paragraph box borders.
- Kept the change test-only for renderer behavior; the test samples actual PDF
  pixels and verifies that styled strokes include both colored segments and
  uncolored gaps.
- Updated renderer/test docs to record the new focused PDF border-style raster
  coverage.

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:pdf-visual`
- `git diff --check`

Notes:

- Broad PDF/editor visual parity remains deferred; this is a focused
  border-style guardrail.

## 2026-05-16

### Bump Self-Use Baseline To 0.5.3

Goal: Mark the accepted flow-stack box/export/visual-script work as the next
self-use patch baseline.

Completed:

- Bumped the root package and lockfile version marker to `0.5.3`.
- Updated versioning docs so the current baseline points at `0.5.3`.
- Updated the project version marker test to assert the accepted `0.5.3`
  baseline.
- Gave the long flow-row pagination stability regression an explicit timeout
  after the full suite showed the fixture can exceed Vitest's default 5 second
  limit on this machine.
- Recorded `0.5.3` as the patch baseline for flow-stack Box styling,
  flow-row DOCX projection, focused PDF raster visual smoke, and local
  visual/WYSIWYG convenience scripts.

Verification:

- `npm.cmd pkg get version`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- No git tag was created; project versions remain release-readiness markers.

### Add Convenience Scripts For Visual And WYSIWYG Runs

Goal: Reduce repeated local PowerShell environment setup for PDF raster visual
checks and WYSIWYG development sessions.

Completed:

- Added `npm run test:pdf-visual`, which sets
  `FLOWDOC_PDF_VISUAL_REGRESSION=1` and runs the focused PDF raster test.
- Added `npm run dev:wysiwyg`, which starts the existing dev server with
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1` and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`.
- Added small Node wrappers so the commands do not depend on PowerShell-only
  `$env:` syntax.
- Made the PDF visual wrapper pass an explicit `FLOWDOC_PDFTOPPM_PATH` when it
  falls back to WinGet-installed Poppler on Windows.
- Reused npm's active `npm_execpath` inside both wrappers so nested commands do
  not depend on `npm.cmd` being discoverable in PATH.
- Prepended the active Node executable directory to wrapper child environments
  so npm-run subcommands can resolve `node` in restricted shells.
- Updated test/WYSIWYG docs to point at the new convenience commands.

Verification:

- `node --check scripts/run-pdf-visual-regression.mjs`
- `node --check scripts/dev-wysiwyg.mjs`
- `npm.cmd pkg get scripts.test:pdf-visual scripts.dev:wysiwyg`
- `npm.cmd run test:pdf-visual`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- `npm.cmd run test:pdf-visual` passed after the wrapper resolved the
  WinGet-installed Poppler path.
- `npm.cmd run dev:wysiwyg` was not launched during verification because it
  intentionally starts a long-running Next dev server.

### Add Flow-Row PDF Raster Visual Smoke

Goal: Add focused PDF visual protection for flow-row/flow-stack output while
keeping rasterization optional and environment-specific.

Completed:

- Added an opt-in PDF raster visual regression case for a three-stack
  `flow-row` with fixed gaps, distinct stack fills, and solid borders.
- The raster case checks fill pixels, border pixels, and gap pixels against the
  paginated geometry consumed by `PdfRenderer`.
- Kept the default suite independent of rasterizer availability; the new case
  runs only with `FLOWDOC_PDF_VISUAL_REGRESSION=1`.
- Updated fixture/test docs to record focused flow-row PDF raster coverage while
  keeping broad PDF/editor parity as a future visual regression area.

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- The local machine has ImageMagick but no detected `pdftoppm` or Ghostscript,
  so the opt-in raster path itself was not run in this session. The default gate
  passed with the raster assertions skipped as designed.

### Tighten Flow-Row DOCX Layout Projection

Goal: Make DOCX export preserve the overall flow-row/flow-stack layout more
closely without treating DOCX as a pixel-perfect target.

Completed:

- Kept the authored model as `flow-row` / `flow-stack` and tightened only the
  DOCX renderer projection.
- Projected each `flow-row` slice to a fixed-layout Word table using paginated
  row width, stack column widths, and exact row slice height.
- Added empty fixed-width gap cells between flow-stack cells so DOCX preserves
  paginated inter-stack gaps instead of collapsing columns together.
- Set zero cell margins for unboxed flow-stacks so Word's default table padding
  does not shift stack content away from the editor/PDF geometry.
- Preserved existing flow-stack box shading, borders, and padding through table
  cell formatting.
- Added `flow-row-export-golden`, a product export fixture with multi-column
  flow-row content, gaps, styled flow-stack boxes, PDF page-count parity, DOCX
  fixed-layout projection, and marker de-duplication checks.
- Added renderer coverage that inspects DOCX XML for fixed table layout,
  exact row height, paginated column widths, and gap columns.
- Updated the export and flow-row/flow-stack docs to record the renderer-only
  table projection and the remaining DOCX exchange-format limitation.

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/productExportGolden.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- DOCX still lets Word/LibreOffice own final text reflow. This slice improves
  overall table/column/box geometry only; hard line-break serialization remains
  intentionally deferred.

### Add Flow-Stack Box Styling

Goal: Give selected flow-stacks a real authored Box surface while keeping
flow-row styling deferred.

Completed:

- Added `flow-stack.props.box` using the existing paragraph box fill, padding,
  and border shape.
- Added a history-safe `updateFlowStackBoxStyle(...)` operation and routed the
  flow-stack Box property panel through it.
- Made flow-stack box padding and border participate in core measurement and
  pagination: horizontal insets reduce child paragraph width, and vertical
  insets contribute to stack slice height.
- Added fragment-level `boxRenderProps` so editor preview, PDF, and DOCX consume
  the same paginated metadata.
- Rendered flow-stack fill/borders in editor preview and PDF, and mapped them to
  DOCX layout-table cell shading, borders, and margins.
- Moved flow-row and flow-stack `Min height` controls into their `Layout` tabs.
- Updated the flow-row/flow-stack roadmap/spec to record the focused
  flow-stack box decision while keeping flow-row box styling deferred.

Verification:

- `npm.cmd test -- packages/core/src/document/normalize.test.ts packages/core/src/document/operations.test.ts packages/core/src/layout/__tests__/flowRowStack.test.ts packages/core/src/pagination/__tests__/flowRowStack.test.ts packages/core/src/renderer/__tests__/renderer.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- Flow-row Box styling is intentionally not implemented in this slice.
- DOCX remains best-effort and uses table-cell formatting for flow-stack box
  output; PDF/editor continue to be the visual authority.

## 2026-05-14

### P0R5 Browser Smoke Carry-Over

Goal: Close the Round 5 carry-over around browser smoke reproducibility and
reviewer/CI clarity before starting P1 report primitives.

Completed:

- Added a shared `scripts/smoke-browser.mjs` launcher used by both browser
  smoke scripts.
- Kept bundled Chromium as the default and preserved `SMOKE_BROWSER_CHANNEL`
  and `SMOKE_EXECUTABLE_PATH` support.
- Wrapped missing bundled Playwright Chromium launch errors with
  FlowDoc-specific guidance:
  `npx playwright install chromium`,
  `SMOKE_EXECUTABLE_PATH=/path/to/chrome npm run review:browser`, or
  `SMOKE_BROWSER_CHANNEL=chrome npm run review:browser`.
- Added `review:browser:install` for CI/review machines that want to install
  bundled Chromium and immediately run the browser gate.
- Added `review:gate:full` so a single non-browser command checks the review
  archive manifest and then runs `review:gate`.
- Updated browser smoke, test strategy, agent workflow, and review packet docs
  to clarify that `review:gate` and `review:browser` are separate gates and
  that `npm ci` does not guarantee Playwright browser binaries.

Files changed:

- `package.json`
- `scripts/smoke-browser.mjs`
- `scripts/editor-smoke.mjs`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `scripts/create-review-archive.mjs`
- `docs/AGENT_WORKFLOW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `node --check scripts/smoke-browser.mjs`
- `node --check scripts/editor-smoke.mjs`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `node --check scripts/create-review-archive.mjs`
- `node --check scripts/review-browser.mjs`
- simulated missing bundled Chromium with `PLAYWRIGHT_BROWSERS_PATH` pointing
  at an empty path; the launcher printed the FlowDoc-specific install/system
  browser guidance.
- `npm.cmd run review:gate:full`
  - archive check passed: 195 files would be included.
  - core tests passed: 28 files / 344 tests.
  - app tests passed: 25 files / 232 tests.
  - `review:build` passed.
- `npm.cmd run review:browser`
  - editor smoke and Stage 4C smoke passed on bundled Chromium.
- `$env:SMOKE_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'; npm.cmd run review:browser`
  - editor smoke and Stage 4C smoke passed on system Chrome executable path.

Notes:

- `review:browser:install` was added for CI/reviewer convenience but was not run
  in this session because bundled Chromium was already available.
- No P1 report primitive work was started in this carry-over patch.

## 2026-05-13

### P0R4 Review Round 4 Exit Hardening

Goal: Close the remaining P0 exit blockers from Round 4 before starting any
P1 or P0-003+ work.

Completed:

- Moved layout-warning collection into shared core pagination code and made
  `/api/export` fail closed with `LAYOUT_WARNINGS_BLOCKED` for server
  pagination warnings such as forced table split overflow.
- Changed editor export readiness to use server layout warnings after the
  current `previewDoc` has reconciled through `/api/paginate`, while keeping
  optimistic preview warnings only as a pre-reconcile signal.
- Added a reproducible `review:build` wrapper and wired `review:gate` to run
  standalone type-check, full tests, and that build path from archived sources.
- Extended review archive checks to require the build/browser smoke scripts.
- Made browser smoke scripts default to bundled Chromium while also supporting
  `SMOKE_BROWSER_CHANNEL` or `SMOKE_EXECUTABLE_PATH` for installed/system
  Chromium-family browsers.
- Updated export/editor/test/browser/archive contracts and coverage snapshots.

Files changed:

- `package.json`
- `next.config.ts`
- `scripts/review-build.mjs`
- `scripts/create-review-archive.mjs`
- `scripts/editor-smoke.mjs`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `packages/core/src/pagination/warnings.ts`
- `packages/core/src/pagination/index.ts`
- `src/app/api/export/route.ts`
- `src/app/api/__tests__/exportPaginate.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/exportReadiness.ts`
- `src/app/editor/_components/__tests__/exportReadiness.test.ts`
- `docs/AGENT_WORKFLOW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `node --check scripts/editor-smoke.mjs`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `node --check scripts/review-build.mjs`
- `node --check scripts/create-review-archive.mjs`
- `npm.cmd run test:app -- src/app/api/__tests__/exportPaginate.test.ts src/app/editor/_components/__tests__/exportReadiness.test.ts`
  - 2 files / 24 tests passed.
- `npm.cmd run type-check`
- `npm.cmd run review:build`
- `npm.cmd run review:gate`
  - core tests passed: 28 files / 344 tests.
  - app tests passed: 25 files / 232 tests.
  - `review:build` passed.
- `npm.cmd run review:browser`
  - editor smoke and Stage 4C smoke passed on bundled Chromium.
- `$env:SMOKE_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'; npm.cmd run review:browser`
  - editor smoke and Stage 4C smoke passed on system Chrome executable path.
- `npm.cmd run review:archive -- --check`
  - 194 files would be included, including `public/fonts/THSarabun.ttf`.

Notes:

- This round intentionally did not start P0-003+ or P1 feature work.
- System Chrome surfaced a favicon-only 404 console message in editor smoke; the
  smoke now ignores only the favicon 404 while keeping unexpected resource and
  console errors blocking.

### P0R3 Review Round 3 Hardening

Goal: Close the Round 3 reproducibility and user-trust gaps before starting
P1 report features.

Completed:

- Hardened `scripts/create-review-archive.mjs` so `--check` validates required
  root/package/config/script/public/source/doc paths and rejects generated/cache
  paths such as `node_modules`, `.next`, `.vite`, and test result caches.
- Made `npm.cmd run review:archive` create `flowdoc-review-archive.zip` and
  verify the ZIP entries after writing.
- Extended `comparePagination` to compare body, header, and footer zones; text
  drift now includes `paragraph` and `toc` fragments, and geometry drift now
  includes `row`, `stack`, `table`, `table-row`, `table-cell`, `toc`, and
  `spacer` fragments with zone metadata.
- Surfaced layout fragment warnings through `collectLayoutFragmentWarnings`,
  toolbar status, and export readiness. `forced-table-split-overflow` now blocks
  final export instead of remaining test-only metadata.
- Added a final forced-slice regression for the last remaining-line edge to
  protect contiguous line accounting after forced slice height adjustment.
- Added a P0 user-report browser smoke path that loads a saved company report
  package, switches to Fill mode, verifies header/footer visibility and safe
  export readiness, downloads PDF, and checks the PDF page count.
- Updated active contracts and coverage snapshots.

Files changed:

- `package.json`
- `scripts/create-review-archive.mjs`
- `scripts/editor-smoke.mjs`
- `src/app/editor/_components/comparePagination.ts`
- `src/app/editor/_components/exportReadiness.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/comparePagination.test.ts`
- `src/app/editor/_components/__tests__/exportReadiness.test.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/AGENT_WORKFLOW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- generated review artifact: `flowdoc-review-archive.zip`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/comparePagination.test.ts src/app/editor/_components/__tests__/exportReadiness.test.ts`
  - 2 files / 32 tests passed.
- `npm.cmd run test:core -- src/pagination/__tests__/tablePagination.test.ts`
  - 1 file / 43 tests passed.
- `npm.cmd run smoke:editor`
  - editor smoke passed, including the user-report package PDF export path.
- `npm.cmd run review:archive`
  - created `flowdoc-review-archive.zip` with 192 files and verified ZIP
    entries after writing.
- `npm.cmd run review:archive -- --check`
  - 192 files would be included, including `public/fonts/THSarabun.ttf`.
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 28 files / 344 tests.
  - app tests passed: 25 files / 227 tests.
  - production build passed.
- `npm.cmd run review:browser`
  - editor smoke passed.
  - WYSIWYG Stage 4C smoke passed on bundled Chromium.

Notes:

- This still does not start P1 report primitives such as lists, images,
  captions, inline style runs, or header/footer authoring UX.
- `/api/export` still accepts a bound document; package-aware final export
  validation remains P1 unless the API product scope requires it sooner.

### P0R2 Review Round 2 Hardening

Goal: Close the second P0 review gaps without starting P1 report features.

Completed:

- Added review archive reproducibility through `npm run review:archive`, with
  `--check` coverage for root package/config files, `scripts/`,
  `public/fonts/THSarabun.ttf`, `src/`, `packages/`, and `docs/`.
- Kept `public/fonts/THSarabun.ttf` as the runtime font source of truth and
  added a guard that any legacy `src/fonts/THSarabun.ttf` copy must be absent or
  byte-identical.
- Made `/api/export` fail closed with code `FONT_FALLBACK_BLOCKED` when the
  default runtime font is missing. `/api/paginate` still exposes fallback state
  because it is a layout-check endpoint, not a final artifact endpoint.
- Tightened export readiness so final export blocks on page-break drift,
  continuation drift, line-count drift, split-boundary drift, tracked geometry
  drift, runtime font fallback, and missing required Fill-mode values.
- Promoted user report fixture assertions to the production measurement stack:
  `fontkit + public/fonts/THSarabun.ttf + thaiWordBreaker`.
- Added `forced-table-split-overflow` fragment warnings and forced-slice height
  adjustment for table no-progress fallback slices.
- Extended browser smoke to verify `/fonts/THSarabun.ttf` is reachable.

Files changed:

- `package.json`
- `scripts/create-review-archive.mjs`
- `scripts/editor-smoke.mjs`
- `src/app/api/export/route.ts`
- `src/app/api/__tests__/exportPaginate.test.ts`
- `src/app/api/__tests__/runtimeFont.test.ts`
- `src/app/editor/_components/exportReadiness.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/exportReadiness.test.ts`
- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `packages/core/src/pagination/__tests__/userReportFixtures.test.ts`
- `docs/AGENT_WORKFLOW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/api/__tests__/runtimeFont.test.ts src/app/api/__tests__/exportPaginate.test.ts src/app/editor/_components/__tests__/exportReadiness.test.ts`
  - 3 files / 18 tests passed.
- `npm.cmd run test:core -- src/pagination/__tests__/userReportFixtures.test.ts src/pagination/__tests__/tablePagination.test.ts`
  - 2 files / 55 tests passed.
- `npm.cmd run test:core -- src/renderer/__tests__/userReportExport.test.ts`
  - 1 file / 4 tests passed.
- `npm.cmd run test:app`
  - 25 files / 221 tests passed.
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 28 files / 343 tests.
  - app tests passed: 25 files / 221 tests.
  - production build passed.
- `npm.cmd run review:browser`
  - editor smoke passed.
  - WYSIWYG Stage 4C smoke passed on bundled Chromium.
- `npm.cmd run review:archive -- --check`
  - 192 files would be included, including `public/fonts/THSarabun.ttf`.
- `git diff --check`
  - no whitespace errors; only Windows CRLF conversion warnings.

Notes:

- This does not add P1 report features such as lists, images, captions, inline
  style runs, or header/footer authoring UX.
- Strict drift blocking may reject more exports, intentionally favoring
  preview/PDF trust for P0.
- Missing required values remain data-snapshot warnings for draft/readiness
  display, but final Fill-mode export now treats them as blockers.

### P0-007 User-Level Report Fixture Suite

Goal: Add representative saved report packages that protect product-facing
company, government, and university report workflows across pagination, PDF
export, and at least one editor import/export path.

Completed:

- Added `USER_REPORT_FIXTURES` as saved `FlowDocPackage v2` fixtures for:
  - `company-report`: cover, scalar fieldRefs, data snapshot, header/footer,
    page numbers, and a multi-page KPI table.
  - `government-report`: cover, TOC, formal Thai body, `keepWithNext` heading,
    bordered table, and restarted footer page numbers.
  - `university-report`: cover, TOC, body page restart, long Thai continuation,
    and footer page numbers.
- Added pagination fixture tests covering package shape, exact section/page
  counts, TOC entries, footer page-number text, long-body continuation, and
  multi-page table row counts.
- Added PDF export tests for every user report fixture using the runtime
  `public/fonts/THSarabun.ttf`; missing font now fails this fixture gate.
- Added an app-level import/data-bind/export path for the company report package
  through `parsePersistedDocument`, `bindDocumentWithSnapshot`, and `/api/export`.
- Updated fixture/product/test strategy docs so the user-level fixtures are
  discoverable.

Files changed:

- `packages/core/src/fixtures/userReportFixtures.ts`
- `packages/core/src/pagination/__tests__/userReportFixtures.test.ts`
- `packages/core/src/renderer/__tests__/userReportExport.test.ts`
- `src/app/api/__tests__/userReportImportExport.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:core -- src/pagination/__tests__/userReportFixtures.test.ts src/renderer/__tests__/userReportExport.test.ts`
  - 2 files / 11 tests passed.
- `npm.cmd run test:app -- src/app/api/__tests__/userReportImportExport.test.ts`
  - 1 file / 1 test passed.
- `npm.cmd run type-check`
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 28 files / 337 tests.
  - app tests passed: 25 files / 214 tests.
  - production build passed.
- `npm.cmd run review:browser`
  - editor smoke passed.
  - WYSIWYG Stage 4C smoke passed on bundled Chromium.

Notes:

- The fixtures avoid claiming unsupported image/list/indent behavior. Those
  remain P1+ report-product work.
- The app path test binds scalar data before export, matching the current
  FlowDocPackage v2 and Fill-mode data contract without changing persistence
  semantics.

### P0-006 WYSIWYG Production Gate

Goal: Keep the FlowDoc-owned WYSIWYG text engine experimental and feature-gated
until manual Thai IME, page-boundary smoothness, and fallback gates pass.

Completed:

- Hardened `resolveWysiwygTextEngineEnabled` so production builds require both
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE` and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE_PRODUCTION_ACK`.
- Kept development/test verification behavior intact: the normal text-engine
  flag still enables the experimental lane for smoke and focused testing.
- Added focused config coverage proving production does not enable the text
  engine with only the rollout flag.
- Added `docs/WYSIWYG_PRODUCTION_GATE.md` with release states, required
  automated/manual gates, the page-boundary smoothness checklist, safe fallback
  switch, and known closed gates.
- Linked the production gate from the docs index, WYSIWYG plan, roadmap, review
  packet, and test strategy.

Files changed:

- `src/app/editor/_components/wysiwygInlineEditConfig.ts`
- `src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts`
- `docs/WYSIWYG_PRODUCTION_GATE.md`
- `docs/DOCS_INDEX.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts`
  - 1 file / 10 tests passed.
- `npm.cmd run type-check`
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 26 files / 326 tests.
  - app tests passed: 24 files / 213 tests.
  - production build passed.
- `npm.cmd run smoke:wysiwyg-stage4c`
  - Passed on bundled Chromium.

Notes:

- This does not enable WYSIWYG by default.
- This does not claim real Thai IME PASS, full screen reader validation, or
  table-cell text-engine readiness; those remain manual/design gates.

### P0-005 Breakable Table-Row No-Progress Guard

Goal: Prevent breakable table-row pagination from consuming continuation slice
height when remaining table-cell content cannot advance because padding,
repeated headers, or tiny page capacity leave no room for a line.

Completed:

- Added split-progress helpers in the table row split loop to compare each
  cell's current split point with the computed end split point before a
  non-final slice is emitted.
- If no remaining cell content advances, pagination now moves to a cleaner
  continuation page when that can increase capacity.
- If a clean continuation page still cannot fit one content unit, pagination
  uses an explicit overflow-progress fallback that forces one spacer/line
  forward instead of emitting an empty body-row slice.
- Added a regression fixture with a repeated 55-line table header and padded
  body cell that previously produced empty body-row slices before any body text
  advanced.
- Documented the no-progress rule in the layout and cross-page contracts.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:core -- src/pagination/__tests__/tablePagination.test.ts`
  - 1 file / 42 tests passed.
- `npm.cmd run type-check`
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 26 files / 326 tests.
  - app tests passed: 24 files / 212 tests.
  - production build passed.

Notes:

- The guard does not change table schema, row/column authoring behavior,
  renderer contracts, or rowspan-linked row policy.
- The overflow fallback is intentionally limited to the no-progress edge where
  the alternative is an empty continuation slice with unchanged cell split
  positions.

### P0-003 Header/Footer Editor Preview Parity

Goal: Make editor preview inspect resolved header/footer content instead of
showing only placeholder rectangles, without opening header/footer authoring or
changing pagination/export semantics.

Completed:

- Replaced header/footer placeholder-only rendering in `EditorCanvas` with
  read-only zone fragments that render paragraph/TOC text from
  `page.headerFragments` and `page.footerFragments`.
- Kept zone fragments non-interactive with `pointer-events: none`, so body
  paragraph selection, inline editing, drag, resize, and table editing remain
  owned by body fragments.
- Preserved the existing pagination/export contract: PDF still consumes
  `headerFragments`, body `fragments`, and `footerFragments` from
  `PaginatedDocument`; no schema or renderer behavior was changed.
- Added focused SSR coverage for editor canvas header/footer text rendering.
- Extended editor browser smoke with a document fixture that includes
  header/footer roots and asserts rendered zone text is visible and read-only.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
  - 2 files / 44 tests passed.
- `node --check scripts/editor-smoke.mjs`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
  - Passed.
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 26 files / 325 tests.
  - app tests passed: 24 files / 212 tests.
  - production build passed.

Notes:

- This intentionally does not add header/footer editing controls, selection, or
  a document model change.
- Header/footer zone layout continues to come from pagination output; the
  editor preview only renders the resolved fragments it receives.

### P0-004 Export Readiness Guard

Goal: Block unsafe PDF/DOCX export when authoritative layout, runtime font,
browser/server drift, or Fill-mode data readiness is not safe.

Completed:

- Added a focused `exportReadiness` helper that checks server layout status,
  whether the checked layout belongs to the current `previewDoc`, layout errors,
  font fallback, page-break drift, paragraph continuation drift, and Fill-mode
  readiness errors.
- Tracked the latest server-checked `previewDoc` in `EditorShell`, so export is
  not treated as safe during the small window after the authored/resolved
  document changes but before `/api/paginate` settles.
- Disabled PDF/DOCX export buttons while export readiness is unsafe and surfaced
  the first blocking reason in the toolbar with the full reason list in the
  control title.
- Kept `/api/export` as the export authority when export is allowed, and now
  also consumes the export response `X-FlowDoc-Font: fallback` header before
  downloading an artifact.
- Extended editor smoke coverage with a Fill-mode readiness-error package that
  blocks PDF export and then re-enables export after the data error is fixed and
  layout settles.
- Updated editor/export/browser contracts for the new export readiness behavior.

Files changed:

- `src/app/editor/_components/exportReadiness.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/exportReadiness.test.ts`
- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/exportReadiness.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts src/app/api/__tests__/exportPaginate.test.ts`
  - 3 files / 12 tests passed.
- `node --check scripts/editor-smoke.mjs`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
  - Passed.
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 26 files / 325 tests.
  - app tests passed: 23 files / 211 tests.
  - production build passed.

Notes:

- This does not implement table split guards, WYSIWYG production release gates,
  or user-level report fixtures.
- Missing required field values currently remain readiness warnings, matching
  the existing data snapshot contract; P0-004 blocks Fill-mode readiness errors.

### Stage 1 P0 Runtime Font And Review Gate Hardening

Goal: Start P0 Stage 1 by normalizing the runtime font contract and adding a
reproducible review gate without starting P0-003 or later work.

Completed:

- Added a shared API runtime font loader for `public/fonts/THSarabun.ttf` and
  routed both `/api/paginate` and `/api/export` through it.
- Added a non-skipped runtime font contract test and strengthened API route
  smoke coverage to assert normal dev/test output does not use
  `X-FlowDoc-Font: fallback`.
- Changed product export golden coverage so missing runtime font fails instead
  of skipping, while keeping real browser/font drift skippable only for missing
  Playwright/Chromium runtime.
- Added root `test:core`, `review:gate`, and `review:browser` scripts. The
  browser review wrapper protects the two smoke scripts from being run while an
  incompatible dev server is already active.
- Updated active contracts and review packet commands to make the Stage 1 gates
  reproducible.

Files changed:

- `src/app/api/runtimeFont.ts`
- `src/app/api/paginate/route.ts`
- `src/app/api/export/route.ts`
- `src/app/api/__tests__/runtimeFont.test.ts`
- `src/app/api/__tests__/exportPaginate.test.ts`
- `packages/core/src/renderer/__tests__/productExportGolden.test.ts`
- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `scripts/review-browser.mjs`
- `package.json`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/api/__tests__/runtimeFont.test.ts src/app/api/__tests__/exportPaginate.test.ts src/app/editor/_components/__tests__/realFontDrift.test.ts`
  - 3 files / 8 tests passed.
- `npm.cmd run test:core -- src/renderer/__tests__/productExportGolden.test.ts`
  - 1 file / 4 tests passed.
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 26 files / 325 tests.
  - app tests passed: 22 files / 206 tests.
  - production build passed.
- `node --check scripts/review-browser.mjs`
- `npm.cmd run review:browser`
  - editor smoke passed.
  - WYSIWYG Stage 4C smoke passed on bundled Chromium.

Notes:

- P0-003+ was intentionally not started.
- Stopped an existing local Next dev server on `localhost:4000` to verify the
  browser gate against the smoke-owned servers.

### Prepare WYSIWYG Stage 4 Review Baseline

Goal: Freeze the current Option 1 WYSIWYG baseline for a larger review without
adding more editor behavior.

Completed:

- Added a Stage 4 review packet that summarizes scope, out-of-scope items,
  PASS/RISK/UNKNOWN status, verification commands, and reviewer notes.
- Linked the review packet from the active docs index.
- Kept this slice documentation-only so the baseline logic and previous smoke
  evidence stay stable for review.

Files changed:

- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/DOCS_INDEX.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- Documentation-only follow-up. The baseline verification remains the Stage 4E
  focused tests, browser smoke runs, type-check, full test suite, and
  `git diff --check` recorded below.

Notes:

- The review packet explicitly does not claim table-cell text-engine support,
  independent row/column continuation, real OS IME acceptance, or full screen
  reader validation.

### Add Stage 4E Row-Stack Paragraph Coverage

Goal: Continue Option 1 by covering paragraph editing inside row/stack columns
without changing the current atomic row/stack pagination contract or opening
table-cell text-engine editing.

Completed:

- Added a row/stack target to the Stage 3 boundary stress scenario, with a left
  editable stack paragraph and a right sibling stack paragraph for geometry
  comparison.
- Kept row-stack paragraphs eligible for the text-engine lane and added an
  explicit test that they do not fall back to visible textarea editing.
- Guarded row-stack paragraphs out of the body-paragraph live visual split
  preview, so typing in a column cannot create independent continuation
  fragments that bypass the containing row.
- Extended the Stage 4C smoke with a heavy row-stack paragraph edit. The smoke
  inserts `STAGE4_STACK_MARKER`, confirms no textarea mounts, confirms the
  stack target remains one fragment and one pointer fragment, and checks
  row/stack width and height relationships after the edit.
- Preserved the existing body paragraph page-boundary visual preview behavior
  with focused regression coverage.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/wysiwygStage3StressScenarios.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c`
- `npm.cmd test`

Notes:

- This does not change `DocumentNode`, core pagination, export, undo/redo, or
  table-cell text-engine eligibility.
- Row/stack paragraph content remains governed by the current atomic row
  policy: the paragraph does not split independently from its row. Independent
  row/column continuation remains a future design gate.

### Add Stage 4D Cross-Fragment Pointer Selection

Goal: Continue Option 1 in the body/split text-engine lane by making
same-paragraph pointer selection work across active and continuation fragments
without opening the table-cell decision gate.

Completed:

- Added pointer fragment targets for every visible fragment of the active
  text-engine paragraph, using draft visual preview fragments when the current
  draft crosses a page boundary.
- Updated `WysiwygTextLayer` pointer offset resolution so drag selection can
  map client coordinates back to the nearest paragraph fragment across pages.
- Added a document-level transparent drag overlay that appears only after real
  pointer movement, keeping cross-fragment move/up deterministic without
  breaking click or double-click word selection.
- Extended the Stage 4C smoke to drag-select from visible text in the active
  continued fragment back to visible text in the earlier fragment and require
  selection overlays on multiple target pages.
- Updated Stage 4 evidence and browser checklist wording for the new pointer
  drag coverage.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c`
- `npm.cmd test`
- `git diff --check`

Notes:

- This keeps selection state transient in the editor/session. It does not
  change `DocumentNode`, pagination semantics, export, undo/redo, or table-cell
  text-engine eligibility.
- Cross-fragment edit semantics beyond same-paragraph selection remain a later
  Stage 4/5 risk.

### Consolidate Stage 4C+4 Evidence And Browser Gates

Goal: Keep the current body/split text-engine stage auditable before moving to
the next WYSIWYG stage.

Completed:

- Reconciled the Stage 4C+4 evidence file with the current browser smoke gate:
  clipboard, synthetic composition, double-click selection, cross-fragment
  overlays, accessibility status, live continuation overlap protection, and
  perf trace separation.
- Recorded that the latest bundled Chromium, installed Chrome, and installed
  Edge smoke runs used the already-running flagged server at
  `http://localhost:4000/editor` because an isolated Next smoke server was
  blocked by the repo dev-server lock.
- Kept real Thai IME, full screen reader validation, full cross-fragment
  drag/edit semantics, and table-cell text-engine editing marked as risk or
  unknown instead of treating automated smoke as product-complete proof.

Files changed:

- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification:

- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This consolidation changes documentation only. It does not change editor
  behavior, document model semantics, pagination output, export, undo/redo, or
  table-cell eligibility.

### Add Text-Engine Performance Trace Guard

Goal: Continue Option 1 by protecting the body/split text-engine critical input
lane before opening any table-cell text-engine work.

Completed:

- Added `inline-edit-draft-update` perf events for text-engine draft changes so
  the existing perf trace covers the FlowDoc-owned input bridge, not only the
  legacy textarea path.
- Extended the Stage 4C smoke with a heavy text insertion perf check that
  resets `window.__flowDocWysiwygPerfEvents`, inserts a long marker through the
  hidden text-engine bridge, and asserts `browser-preview-pagination` is absent
  from the immediate input lane.
- If the same smoke observes a debounced `browser-preview-pagination`, it
  asserts it starts after the draft update instead of in the synchronous input
  path.
- Updated the WYSIWYG plan and browser checklist to record the perf gate.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `git diff --check`

Notes:

- This patch changes instrumentation and smoke coverage only. It does not
  change `DocumentNode`, pagination output, export, undo/redo, or table-cell
  eligibility.
- Starting an isolated smoke server without `SMOKE_BASE_URL` was blocked by
  the existing Next dev-server lock for this repo on `localhost:4000`, so the
  smoke was run against that already-running flagged server.

### Add WYSIWYG Text-Engine Accessibility Status

Goal: Continue Option 1 by improving the body/split text-engine lane without
opening the table-cell text-engine decision gate.

Completed:

- Added an accessibility status helper derived from `WysiwygTextSessionState`
  so caret and selection announcements use the same draft/caret/selection state
  as the text-engine lane.
- Added a visually hidden polite live region in `EditorShell` and connected the
  active text-engine layer and hidden input bridge with `aria-describedby`.
- Extended the Stage 4C smoke to assert the live status updates for caret and
  selection during the heavy cross-page clipboard flow.
- Updated the WYSIWYG plan and browser checklist to distinguish DOM live-status
  coverage from full screen reader product validation.

Files changed:

- `src/app/editor/_components/useWysiwygTextSession.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `git diff --check`

Notes:

- This is an editor accessibility-state patch only. It does not change
  `DocumentNode`, pagination, export, undo/redo, or table-cell eligibility.

### Guard Table-Cell Text-Engine Decision Gate

Goal: Continue the WYSIWYG staged work without silently expanding table-cell
editing into the text-engine lane before row/cell reflow semantics are designed.

Completed:

- Rechecked the table editing contract and cross-page behavior contract before
  touching table-related WYSIWYG behavior.
- Kept table-cell paragraphs explicitly outside the text-engine lane for now:
  they still fail closed to the guarded non-text-engine edit path instead of
  using the hidden text-engine input bridge.
- Added regression coverage that a table-cell paragraph with the text-engine
  flag enabled does not render `data-wysiwyg-text-engine-layer` or the hidden
  `data-wysiwyg-input-bridge`.
- Updated the WYSIWYG plan to distinguish the completed passive
  cross-fragment selection overlay from the still-deferred full drag/edit
  semantics and table-cell text-engine editing decision gate.

Files changed:

- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This guard does not change `DocumentNode`, core pagination, table pagination,
  export behavior, undo/redo, or the existing table-cell property-panel flow.
- Enabling text-engine editing inside table cells is the next big decision gate
  because it must define row/cell live reflow and continuation behavior instead
  of treating table-cell paragraphs like normal body paragraphs.

### Stabilize WYSIWYG Active Draft Page-Boundary Preview

Goal: Keep Stage 4C+3 typing feedback visible and stable when the active
paragraph grows across a page boundary, without letting full-document pagination
sit on the critical keypress path.

Completed:

- Added a canvas-owned WYSIWYG draft visual preview that measures only the
  active paragraph and splits draft lines across existing pages for live
  rendering.
- The live preview uses direct line capacity, not widow/orphan adjustment, so
  the current page keeps the lines that still fit and only overflowing draft
  lines move to the next page while typing.
- Updated active paragraph chrome to use the draft visual fragment and shifted
  downstream fragments when a live continuation is inserted, including chrome
  and a small gap so the continuation does not overlap the next paragraph.
- Kept plain body split paragraphs on the text-engine path after exit/re-enter
  by allowing continuation fragments through eligibility while still rejecting
  table-cell paragraphs.
- Removed duplicate React bridge handlers from the text-engine input bridge so
  keydown, beforeinput, input, clipboard, and composition events go through one
  native adapter path for normal and shifted typing.
- Added same-fragment double-click word selection in the text-engine layer,
  resolving the selected word from FlowDoc draft offsets and rendering the
  existing SVG selection overlay without mounting a textarea.
- Added passive SVG selection overlays for non-active continuation fragments of
  the active paragraph, so a full-paragraph selection can visibly span page
  fragments while keeping a single hidden input bridge on the active fragment.
- Kept full browser/server pagination as the settling/export truth and guarded
  aborted or page-transition server pagination fetches from logging false
  console errors.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/wysiwygTextEligibility.ts`
- `src/app/editor/_components/wysiwygDraftVisualPreview.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts`
- `scripts/wysiwyg-stage4c-smoke.mjs`

Verification:

- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c`
- Browser check on `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`
  confirmed the target paragraph changed from one fragment to two with the
  first fragment staying at `lineStart=0,lineEnd=9` and the overflow fragment
  starting at `lineStart=9`, one active input bridge, and no inline textarea.
- Bundled Chromium, installed Chrome, and installed Edge Stage 4C smoke runs
  confirmed double-click selection produced a WYSIWYG selection overlay before
  the clipboard/IME flows.
- The Stage 4C smoke also selected from the end of the overflowed paragraph
  back to the start and confirmed WYSIWYG selection overlays on at least two
  target pages before collapsing the selection for the copy/cut flow.
- The same browser check exited edit and re-entered the continuation paragraph;
  settled line ranges stayed `0-8` / `8-10` before and after re-entry.
- A headless browser geometry check confirmed the live continuation bottom was
  below the next downstream paragraph top with no overlap, no inline textarea,
  no layout error badge, and no console errors.
- The automated Stage 4C smoke now waits for WYSIWYG selection and clipboard
  state to settle before copy/cut assertions, and asserts that the live target
  continuation does not overlap downstream paragraph fragments while the
  text-engine bridge is active.

Notes:

- This is an editor-only live visual preview. It does not change
  `DocumentNode`, core pagination, authoritative server/export pagination,
  undo/redo semantics, or renderer output.
- `npm.cmd run smoke:editor` could not be used as a clean broader gate while
  the flagged `localhost:4000` text-engine server was running: the isolated
  server path hit the Next dev-server lock, and the external-server path expects
  the legacy textarea lane. Stage 4C smoke was run against the active
  text-engine lane instead.
- Before the smoke wait hardening, one installed Chrome run had a transient
  selection/clipboard timing failure. After the script waited for selection and
  clipboard state to settle, bundled Chromium, installed Chrome, and installed
  Edge Stage 4C runs passed.

### Add Stage 4C+3 Browser-Channel IME Evidence

Goal: Strengthen Stage 4C clipboard/IME confidence with repeatable installed
Chrome and Edge evidence while keeping real Windows Thai IME rows honest.

Completed:

- Added `SMOKE_BROWSER_CHANNEL` support to `scripts/wysiwyg-stage4c-smoke.mjs`
  so the Stage 4C gate can run on bundled Chromium, installed Chrome, or
  installed Edge through Playwright.
- Kept browser/page/resource failures strict, but ignored only the
  browser-generated `404 /favicon.ico` console message seen in installed
  Chrome and Edge channel runs.
- Added `docs/WYSIWYG_STAGE4C_IME_RESULTS.md` to record the current evidence,
  environment, installed input methods, browser versions, PASS/RISK/UNKNOWN
  result matrix, and minimal next patch.
- Updated the browser smoke checklist, test strategy, docs index, real IME
  matrix, and WYSIWYG text-engine plan to link the evidence and channel command.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DOCS_INDEX.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4C_IME_MATRIX.md`
- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `scripts/wysiwyg-stage4c-smoke.mjs`

Verification:

- `node --check scripts\wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c; $code=$LASTEXITCODE; Remove-Item Env:SMOKE_BROWSER_CHANNEL; exit $code`
- `$env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c; $code=$LASTEXITCODE; Remove-Item Env:SMOKE_BROWSER_CHANNEL; exit $code`

Notes:

- `Get-WinUserLanguageList` found Thai `041E:0000041E` and English US
  `0409:00000409` installed.
- Chrome `148.0.7778.97` and Edge `148.0.3967.54` channel runs passed the
  automated Stage 4C workflow.
- Real Windows Thai IME rows remain `UNKNOWN` until a human/unrestricted desktop
  session completes `docs/WYSIWYG_STAGE4C_IME_MATRIX.md`.
- No editor runtime behavior, document model, pagination, undo/redo semantics,
  or export behavior changed in this patch.

### Add Stage 4C Real OS IME Matrix

Goal: Define the real-world IME verification gate that must complement the
automated Stage 4C smoke before raising clipboard/IME confidence to the
9.2-9.5 range.

Completed:

- Added `docs/WYSIWYG_STAGE4C_IME_MATRIX.md` as the source of truth for manual
  Windows Chrome/Edge Thai IME coverage.
- Defined PASS, FAIL / BLOCKER, RISK, and UNKNOWN terms for Stage 4C IME rows.
- Added preflight commands, DevTools probes, required environment rows,
  eight manual case groups, an evidence template, and blocker rules.
- Linked the matrix from the docs index, browser smoke checklist, test strategy,
  and WYSIWYG text-engine plan.
- Recorded that Chrome and Edge are installed on this machine, while the active
  Windows input-method list could not be read reliably from the current
  sandboxed shell session.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DOCS_INDEX.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4C_IME_MATRIX.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run smoke:wysiwyg-stage4c`
- `git diff --check`

Notes:

- This closes the documentation and evidence format for Stage 4C+2, but the
  real OS IME rows remain `UNKNOWN` until a human/unrestricted desktop session
  records Windows Chrome and Edge Thai IME results.
- No editor runtime behavior, document model, pagination, export, or test code
  changed in this patch.

### Add Automated Stage 4C WYSIWYG Smoke Gate

Goal: Turn the Stage 4C clipboard/IME browser verification into a repeatable
repo command so future WYSIWYG text-engine changes cannot silently regress
paste, cut, composition, focus, or undo/redo behavior.

Completed:

- Added `scripts/wysiwyg-stage4c-smoke.mjs`, a Playwright smoke that starts the
  flagged editor with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1` and opens the
  `wysiwyg-stage3-boundary` scenario.
- Added `npm.cmd run smoke:wysiwyg-stage4c` / `npm run smoke:wysiwyg-stage4c`.
- The smoke verifies the text-engine bridge mounts with no inline textarea,
  pastes a heavy Thai/English CRLF payload, crosses the target paragraph from
  one fragment to at least two fragments, copies and cuts the selected
  `CUTME4C` marker through the system clipboard, exits with Escape, verifies
  editor focus restoration, and checks keyboard Undo/Redo.
- The same smoke verifies synthetic IME composition commits exactly once,
  suppresses duplicate final input, leaves the hidden bridge empty, and records
  browser console/page errors as failures.
- Hardened script cleanup so spawned Next dev servers are awaited on shutdown,
  and clipboard permissions use the actual scenario origin for `SMOKE_BASE_URL`
  compatibility.
- Updated the browser checklist, test strategy, and text-engine plan to make
  this command the Stage 4C automated gate.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `package.json`
- `scripts/wysiwyg-stage4c-smoke.mjs`

Verification:

- `npm.cmd run smoke:wysiwyg-stage4c`
- `SMOKE_PORT=4017 npm.cmd run smoke:wysiwyg-stage4c`
- `npm.cmd run type-check`

Notes:

- The smoke intentionally remains synthetic for IME composition. Real OS IME
  coverage still belongs to the planned manual matrix.
- The command cannot run while another Next dev server for this same repo is
  already holding the Next dev lock, unless `SMOKE_BASE_URL` points at an
  already-running flagged server.

### Harden WYSIWYG Text Engine Clipboard And IME

Goal: Continue Stage 4C by routing paste, copy, cut, and IME composition
through FlowDoc-owned text draft operations while keeping the hidden
`contentEditable` bridge adapter-only.

Completed:

- Added plain-text clipboard helpers to `useWysiwygTextSession`, including CRLF
  normalization, selected-text extraction from FlowDoc offsets, and selected
  cut as one draft change.
- Wired paste/copy/cut handlers in the text-engine bridge so visible text,
  selection, wrapping, and layout remain owned by SVG/FlowDoc geometry.
- Added Ctrl/Cmd+C/X/V fallback handling through the Clipboard API because the
  SVG selection overlay is not a native browser selection.
- Added IME composition guards so intermediate composition input does not
  mutate the draft, compositionend commits once, and duplicate final input is
  suppressed.
- Restored editor focus after keyboard edit exit and made editor undo/redo
  shortcut matching case-insensitive.
- Updated the text-engine plan, browser smoke checklist, and test strategy for
  the Stage 4C clipboard/IME gate.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/useWysiwygTextSession.ts`
- `src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- Browser Playwright smoke on `http://localhost:4016/editor?flowdocTestScenario=wysiwyg-stage3-boundary` with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`, `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`, and `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1`: pasted heavy Thai/English multiline text through Ctrl+V, crossed the target from one fragment to two, selected and cut `CUTME4C` through Ctrl+X with the system clipboard matching the selected text, committed with Escape, Undo returned the target to one fragment with the pasted marker gone, Redo restored the pasted marker and two-fragment layout without restoring the cut marker, synthetic IME composition committed `IME4Cทดสอบ` exactly once, the hidden bridge was empty after composition, no inline textarea mounted, and no layout error was visible.

Notes:

- The in-app browser plugin was attempted first, but this session blocked local
  `localhost` and `127.0.0.1` navigation with `ERR_BLOCKED_BY_CLIENT`. Browser
  verification used the same local Playwright runtime as the project smoke
  suite.
- A pre-existing Next dev server for this repo did not have the text-engine
  flags enabled, so it was stopped before running the flagged Stage 4C smoke.
- This intentionally does not change `DocumentNode`, server/API pagination,
  export behavior, accessibility announcements, cross-fragment selection, or
  table-cell text-engine editing.

### Add WYSIWYG Text Engine Selection Foundation

Goal: Continue Stage 4B by making the FlowDoc-owned text-engine lane handle
keyboard selection and selected-range deletion from editor/session state, while
keeping document schema, export, undo, and pagination ownership unchanged.

Completed:

- Fixed shifted keyboard navigation in `useWysiwygTextSession` so repeated
  Shift+Arrow preserves the original anchor and moves the focus endpoint by
  grapheme-aware offsets.
- Added same-fragment pointer selection wiring in the SVG text-engine layer,
  using a transparent SVG hit area, FlowDoc point-to-offset mapping, and the
  existing SVG selection overlay geometry.
- Kept the hidden `contentEditable` bridge as input-only; visible text,
  selection, caret, wrapping, and layout remain owned by FlowDoc SVG geometry.
- Added focused tests for forward/backward Shift+Arrow selection, Home/End
  selection extension, unshifted collapse behavior, text-engine overlay
  rendering, and selected deletion in the heavy Stage 3 boundary fixture.
- Updated the text-engine plan, browser smoke checklist, and test strategy with
  the current Stage 4B selection contract and remaining deferred work.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/useWysiwygTextSession.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- Browser Playwright smoke on `http://localhost:4013/editor?flowdocTestScenario=wysiwyg-stage3-boundary` with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`, `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`, and `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1`: target started as one fragment, Shift+Arrow rendered a WYSIWYG selection overlay, unshifted Arrow collapsed it, `Enter Enter S4B` overflowed the target to two fragments, Shift+Arrow selected the marker, Backspace deleted the selected range, further Backspace returned the target to one fragment, no inline textarea mounted, and no layout error was visible.
- Browser Playwright drag smoke on `http://localhost:4014/editor?flowdocTestScenario=wysiwyg-stage3-boundary` with the same flags: dragging inside the text-engine layer produced a WYSIWYG selection overlay, no inline textarea mounted, and no layout error was visible.
- Browser Playwright undo/redo smoke on `http://localhost:4015/editor?flowdocTestScenario=wysiwyg-stage3-boundary` with the same flags: after selected deletion and replacement marker `S4C`, commit removed the input bridge, Undo returned the target to one fragment with the marker gone, Redo restored the marker and two-fragment overflow, and no layout error was visible.
- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `git diff --check`

Notes:

- The in-app browser plugin was attempted first, but local navigation/runtime
  issues made it unreliable in this session. The browser verification above
  used the same local Playwright runtime as the project's automated smoke
  suite.
- This intentionally does not change `DocumentNode`, server/API pagination,
  export behavior, undo transaction policy, clipboard/cut handling, OS IME
  composition hardening, accessibility announcements, cross-fragment selection,
  or table-cell text-engine editing.

### Clean Stage 4A Verification Baseline

Goal: Start the next WYSIWYG text-engine stage by removing verification noise
before adding selection, clipboard, or IME behavior, while keeping the Stage 3
stress fixture in the baseline.

Completed:

- Changed the real-font drift test to load Playwright's Chromium runtime
  optionally, so `npm.cmd run type-check` no longer fails when local
  `node_modules/playwright` is unavailable.
- Kept the real-font drift coverage intact for environments that do have the
  runtime: the test still launches Chromium and compares canvas measurement
  with fontkit when `public/fonts/THSarabun.ttf` and Playwright are available.
- Re-ran the Stage 3 heavy/stress baseline alongside the real-font drift test.
- Restored the declared Playwright package into local `node_modules` with
  `npm.cmd install`, then ran the automated editor smoke successfully.

Files changed:

- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd run test -w packages/core -- src/layout/__tests__/measure.test.ts src/pagination/__tests__/paginator.test.ts src/pagination/__tests__/tablePagination.test.ts src/pagination/__tests__/rowStack.test.ts`
- `npm.cmd test`
- `git diff --check`
- `npm.cmd run smoke:editor`

Notes:

- Before restoring dependencies, `npm.cmd run smoke:editor` failed because
  `node_modules/playwright` was missing. After `npm.cmd install`, Playwright
  resolved as `1.59.1`, the real-font drift test ran and passed locally, and
  the isolated editor smoke passed.
- A smoke run against the already-running `localhost:4000` text-engine dev
  server failed because that server intentionally did not match the smoke
  script's legacy-inline-edit expectations. The successful run let the smoke
  script start its own isolated server.
- This is a verification-baseline patch only. It intentionally does not change
  editor runtime behavior, document schema, pagination semantics, export,
  selection, clipboard, or IME behavior.

---

## 2026-05-12

### Add WYSIWYG Text Engine Draft Pagination

Goal: Continue Stage 3 of the FlowDoc-owned WYSIWYG text engine by letting
page-boundary paragraph drafts render from draft paginated geometry without
making textarea layout authoritative or committing document text on each
keypress.

Completed:

- Added a normalized draft preview document helper for active WYSIWYG text
  drafts.
- Added hard-page-boundary draft pagination scheduling with generation guards,
  draft-version checks, caret page tracking, and optimistic paginated preview
  updates.
- Added a deterministic Stage 3 stress scenario, available in dev/test mode via
  `/editor?flowdocTestScenario=wysiwyg-stage3-boundary`, that seeds a target
  paragraph near a page boundary with dense downstream content.
- Disabled autosave while a dev/test scenario is active so stress runs do not
  persist over the user's normal editor localStorage document.
- Let eligible continuation paragraph fragments render through the
  WYSIWYG text layer when draft pagination is active.
- Kept same-page hard-local edits on the local height patch path, and kept
  table-cell paragraphs on the guarded fallback path.
- Added a hidden `contentEditable` non-textarea input bridge inside the SVG
  text-engine layer, with native keyboard/input listeners, so browser keyboard
  events reach the FlowDoc text draft handler while SVG lines remain the
  visual/layout truth.
- Extended the inline-edit blur guard so remounting from a textarea to the
  text-engine SVG textbox, or between text-engine fragments, does not finalize
  the edit when focus lands on a replacement surface for the same paragraph.
- Updated the active WYSIWYG text engine plan to reflect that
  hard-page-boundary edits now queue debounced draft pagination instead of
  remaining detect-only.

Files changed:

- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/inlineEditBlur.ts`
- `src/app/editor/_components/useInlineEditSession.ts`
- `src/app/editor/_components/wysiwygDraftPreview.ts`
- `src/app/editor/_components/wysiwygStage3StressScenarios.ts`
- `src/app/editor/_components/__tests__/inlineEditBlur.test.ts`
- `src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `npm.cmd run test -w packages/core -- src/layout/__tests__/measure.test.ts src/pagination/__tests__/paginator.test.ts src/pagination/__tests__/tablePagination.test.ts src/pagination/__tests__/rowStack.test.ts`
- `git diff --check`
- Browser smoke on `http://localhost:4000/editor` with
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`,
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`, and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1` confirmed the editor loaded,
  flags were true, no layout error badge appeared, clicking a body paragraph
  opened the text-engine layer, no inline textarea was mounted, and the hidden
  input bridge was present.
- 2026-05-13 browser keypress recheck on the same flagged server confirmed
  short text entry through the bridge (`ZX9`) updated the SVG text-engine layer,
  no inline textarea was mounted, and no layout error appeared. A longer
  keypress sequence wrapped the active paragraph from 3 to 5 SVG text lines,
  kept the bridge active, and still showed no layout error.
- 2026-05-13 Stage 3 stress browser smoke on
  `/editor?flowdocTestScenario=wysiwyg-stage3-boundary` confirmed the target
  paragraph started as one fragment, real bridge keypresses moved it to two
  fragments across the page boundary, Backspace shrank it back to one fragment,
  no inline textarea mounted, no layout error appeared, and commit/Undo/Redo
  restored the typed marker.

Notes:

- `npm.cmd run type-check` is still blocked by the pre-existing
  `realFontDrift.test.ts` missing `playwright` package and implicit-any errors.
  No new type-check error remains from this patch.
- `npm.cmd run smoke:editor` is blocked by the same missing `playwright`
  package. Browser automation also exposed local tooling limits:
  `localhost:4011` was blocked, Chrome extension navigation to localhost was
  blocked, some in-app browser tabs timed out at the CDP layer after reload,
  and `locator.type()` / `locator.fill()` require a virtual clipboard that was
  unavailable in this session. Real browser `press()` key events did work
  against the non-textarea bridge. The successful browser portion used an
  outside-sandbox dev server on `localhost:4000`.
- This intentionally does not change `DocumentNode` schema, server/API
  pagination ownership, export behavior, undo transaction policy, IME/clipboard
  hardening, or table-cell WYSIWYG editing.

---

### Add Slice-Aware WYSIWYG Selection Foundation

Goal: Address the reported WYSIWYG blockers without changing document schema,
paginator/export ownership, or making textarea layout authoritative.

Completed:

- Made inline edit textarea values slice-aware for both first and continuation
  fragments. When a paragraph spans pages, the active textarea now holds only
  the active fragment text slice and reconstructs the full paragraph with stable
  prefix/suffix context.
- Stabilized slice context across active textarea renders so browser pagination
  updates cannot duplicate or garble text during a typing burst.
- Marked edit start as visually fresh for the current draft snapshot, allowing
  document-visual mode on entry when geometry is available.
- Started the active typing visual lock from key interaction before native
  textarea input lands, and lengthened the lock for human-speed typing so the
  editor does not switch to transparent SVG visuals between ordinary
  keystrokes.
- Deferred active textarea page relocation while the typing visual lock is held
  or the document visual is stale, avoiding remounts while keystrokes are still
  being delivered.
- Added same-fragment drag selection support by mapping pointer positions to
  WYSIWYG paragraph offsets and drawing SVG selection overlays from existing
  paginated line geometry.
- Added editor fragment debug data attributes for smoke assertions without
  changing authored document data.
- Extended automated editor smoke coverage for stack paragraph visual parity,
  table-cell visual contract, drag selection overlay, slice-bounded
  continuation textareas, visible marker uniqueness, undo/redo, and continuation
  boundary Backspace.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/useInlineEditSession.ts`
- `src/app/editor/_components/wysiwygTextInteraction.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `scripts/editor-smoke.mjs`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/inlineEditCaret.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts`
- `npm.cmd run type-check`
- `SMOKE_BASE_URL=http://localhost:4000/editor npm.cmd run smoke:editor`
- `npm.cmd test`
- Human-speed Playwright probe on `http://localhost:4000/editor`: typed enough
  text at 130ms per character to wrap to three visible lines; textarea value
  stayed correct and visible during typing, then handed off to document visual
  after the idle window.

Notes:

- This intentionally does not change `DocumentNode`, core pagination policy,
  export behavior, server pagination, clipboard/cut handling, IME hardening, or
  cross-fragment selection. Cross-fragment selection remains deferred.
- The isolated smoke server could not start because another Next dev server was
  already running for this worktree. The same smoke suite was run successfully
  against the existing `http://localhost:4000/editor` server.

---

### Stabilize Inline Edit Input Bridge

Goal: Make the current hybrid inline editor more predictable during typing
while keeping textarea fallback available and avoiding document/schema/layout
rewrite scope.

Completed:

- Routed inline textarea key decisions and full-text/caret snapshots through
  `wysiwygTextInteraction` so paragraph editing has one shared input bridge
  policy.
- Aligned plain Enter classification with the current editor contract: native
  multiline textarea behavior remains the default, and structural paragraph
  split is available only as an explicit future mode.
- Added a short document-visual typing lock to `useInlineEditSession` so fresh
  browser pagination does not immediately reclaim the visible layer during an
  active typing burst.
- Kept the existing stale-visual fallback path: textarea text remains visible
  when paginated visual output is not ready for the active draft.
- Added focused tests for Enter policy, textarea snapshot conversion, and visual
  readiness while the typing lock is active.

Files changed:

- `src/app/editor/_components/wysiwygTextInteraction.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/useInlineEditSession.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `src/app/editor/_components/__tests__/useInlineEditSession.test.ts`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `npm.cmd test`

Notes:

- This intentionally does not enable WYSIWYG by default, change
  `DocumentNode`, replace textarea with hidden-input editing, add selection
  overlays, change pagination/export behavior, or claim full IME/clipboard
  hardening.
- Manual in-app browser probing confirmed the default textarea fallback path can
  enter inline edit, show typed text, exit without a layout error, and clean up
  the active textarea. A manual WYSIWYG-flag browser perception pass was not
  completed; the automated editor smoke script remains the WYSIWYG-flag browser
  coverage for this patch.
- Post-test status: user manual testing found this round is not acceptable as a
  stable WYSIWYG result. Reported blockers are paragraph edit layout drift in
  non-body containers, odd cross-page continuation behavior when typing across a
  page boundary, and unavailable drag text selection. Treat this as
  FAIL/BLOCKER and move to the staged real-WYSIWYG plan rather than continuing
  to polish the hybrid textarea layout as the final path.

---

### Add Agent Operating Model

Goal: Create a detailed role and responsibility model for Codex and other
project agents without changing runtime behavior.

Completed:

- Added `docs/agent/AGENT_OPERATING_MODEL.md` as the detailed operating model
  for lead, reviewer, implementer, regression, test, docs, and multi-agent
  work division.
- Linked the new operating model from `docs/agent/CODEX_ROLES.md` so the
  existing concise role list remains the quick reference.
- Updated `docs/DOCS_INDEX.md` so future sessions can find the detailed agent
  ownership and routing guidance.

Files changed:

- `docs/agent/AGENT_OPERATING_MODEL.md`
- `docs/agent/CODEX_ROLES.md`
- `docs/DOCS_INDEX.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `git diff --check`

Notes:

- This is documentation-only. It intentionally does not change runtime code,
  editor behavior, layout behavior, tests, or product decision authority.

---

## 2026-05-11

### Adopt Document-First FlowDocPackage V1

Goal: Apply the product decision to choose the package/envelope direction while
keeping this implementation focused on the document foundation only.

Completed:

- Added document-first `FlowDocPackage v1` support in editor persistence.
- Kept core editing/layout/export APIs working with `DocumentNode`; the package
  is the persisted/import/export JSON shape, not the layout engine input.
- Changed localStorage save to store a package with `packageVersion: 1`,
  `kind: "document"`, package metadata, and the underlying `DocumentNode`.
- Changed JSON export to emit a package and download as `*.flowdoc.json`.
- Kept legacy raw `DocumentNode v1` import/load support so existing saved JSON
  and smoke fixtures still work.
- Updated the automated editor smoke script so its localStorage assertions can
  read either legacy raw documents or `FlowDocPackage v1` after autosave.
- Added package parser tests for package JSON, legacy raw document JSON,
  unsupported document/package versions, invalid package shape, invalid
  document structure, localStorage behavior, and JSON package serialization.
- Updated architecture, fixture catalog, and test strategy docs to document the
  new document-first package boundary.
- Follow-up Phase 1 package contract work added
  `docs/FLOWDOC_PACKAGE_CONTRACT.md`, linked it from the docs index,
  architecture, engineering principles, and test strategy, and enforced
  `package.id === package.document.document.id` in the package parser.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `scripts/editor-smoke.mjs`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DOCS_INDEX.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`
- Phase 1 focused recheck:
  `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`

Notes:

- This intentionally does not add field registry, data versions, key-based
  history, reviewer workflow, or binding-data persistence yet. Those remain
  higher layers that can be built on top of the package foundation.

### Harden Package Import/Export UX

Goal: Continue the package foundation by making JSON import/export safer and
more understandable without adding form/history layers.

Completed:

- Added concise user-facing import success/failure messages for package and
  legacy raw document JSON.
- Added distinct failure messages for invalid JSON, unsupported document
  versions, unsupported package versions, invalid packages, and invalid
  documents.
- Sanitized document titles before using them as `.flowdoc.json` filenames.
- Updated JSON export to show a short toolbar status after preparing a package
  download.
- Updated JSON import to show a short toolbar status for package imports,
  legacy imports, file-read failure, and parse/validation failure.
- Updated the hidden file input to accept `.flowdoc.json`, `.json`, and
  `application/json`.
- Added focused persistence tests for safe filenames and status message mapping.
- Updated package contract, fixture catalog, test strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is still document-first package UX only. It does not add field registry,
  data versions, key history, reviewer workflow, or template library behavior.

### Add Package Migration Entrypoint

Goal: Continue Phase 3 by routing persisted/editor JSON through one migration
entrypoint before editor state receives a document.

Completed:

- Added `migratePersistedDocumentPackage(...)`.
- Made `parsePersistedDocument(...)` use the migration entrypoint.
- Legacy raw `DocumentNode v1` JSON now migrates into a canonical
  `FlowDocPackage v1`.
- Existing `FlowDocPackage v1` migration is idempotent.
- Kept migration document-first only; no form/history/reviewer data was added.
- Added focused tests for raw document migration and package v1 idempotence.
- Updated the package contract migration section.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This establishes the migration seam needed for future package versions while
  keeping current runtime behavior compatible with raw document imports.

### Harden Table Structural Operations

Goal: Continue Phase 4 by moving table authoring guarantees closer to the core
operations that mutate table rows and columns.

Completed:

- Added operation-level fixtures for inserting a row above the first row,
  deleting a row subtree, preserving last-row safety, inserting a column to the
  left of the first column, deleting a column subtree, preserving table width,
  and preserving last-column safety.
- Fixed row deletion so `headerRowCount` is clamped to the remaining row count
  instead of leaving the table in an invalid authored state.
- Kept the change at the document/table model layer. No span-aware authoring UI,
  column resize UI, or higher-level package/history behavior was added.
- Updated the table editing contract, fixture catalog, and test strategy.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Extend Table Property Panel Browser Smoke

Goal: Continue Phase 5 by checking that the table-cell property panel can drive
row and column operations in the real editor route, not only at the core
operation layer.

Completed:

- Extended `scripts/editor-smoke.mjs` with localStorage table-shape helpers so
  the smoke verifies authored row/column counts after browser interactions.
- Added smoke coverage for selecting a table cell, inserting a column to the
  right, selecting the inserted cell through its paragraph, deleting that
  inserted column, inserting a row below, selecting the inserted row cell, and
  deleting that inserted row.
- Kept the smoke tied to `FlowDocPackage v1` or legacy raw document storage so
  autosave format changes do not make the browser check brittle.
- Updated browser smoke, fixture catalog, and test strategy docs to reflect the
  new row/column property-panel coverage.

Files changed:

- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This remains focused browser coverage. It does not replace future visual
  regression tests, broad editor workflow automation, or manual checks for
  perceived flicker and scroll feel.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FieldRef Operation Fixtures

Goal: Continue Phase 6 by protecting the document-level key/field foundation
without starting the future form, history, or reviewer layers.

Completed:

- Added operation fixtures for inserting a `fieldRef` inline into a normal body
  paragraph.
- Added operation fixtures for inserting a `fieldRef` inline into a paragraph
  scoped inside a table cell.
- Verified that insertion preserves existing text runs instead of flattening the
  paragraph into plain text.
- Updated fixture catalog and test strategy counts.

Files changed:

- `packages/core/src/document/operations.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This intentionally stops at authored `DocumentNode` behavior. It does not add
  field registries, data snapshots, key-based history, or reviewer workflows.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FieldRef Package Roundtrip Fixture

Goal: Continue Phase 7 by making sure the document-first package boundary keeps
structured inline keys intact.

Completed:

- Added a persistence fixture that serializes a document containing an inline
  `fieldRef` to `FlowDocPackage v1`, then parses it back through the normal
  import path.
- Verified the `fieldRef` id, key, label, fallback, and surrounding text run are
  preserved.
- Updated the package contract, fixture catalog, and test strategy counts.

Files changed:

- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This still stops at package/document preservation. It does not add a field
  registry, binding data payload, key history, or reviewer workflow.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Field Registry Contract And Validation Fixtures

Goal: Start Phase A of the document/key foundation by giving `fieldRef.key` a
clear registry contract without making current binding strict or changing
`DocumentNode`.

Completed:

- Added `docs/FIELD_REGISTRY_CONTRACT.md` defining field keys, registry v1
  shape, scalar inline field rules, validation policy, ownership boundaries,
  and future package direction.
- Added `packages/core/src/fieldRegistry/index.ts` with
  `FieldRegistryV1`, `FieldDefinitionV1`, `collectDocumentFieldRefs(...)`,
  `validateFieldRegistryReferences(...)`, and
  `hasFieldRegistryErrors(...)`.
- Added focused registry fixtures for body paragraph refs, table-cell refs,
  registered scalar refs, duplicate keys, missing definitions, and invalid
  inline targets for `image`/`collection`.
- Aligned the sample editor field palette definition type with the core field
  registry shape while keeping palette drag data compatible.
- Updated docs index, architecture, engineering principles, package contract,
  agent workflow, fixture catalog, and test strategy.

Files changed:

- `packages/core/src/fieldRegistry/index.ts`
- `packages/core/src/fieldRegistry/index.test.ts`
- `src/app/_lib/fieldRegistry.ts`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/fieldRegistry/index.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- Binding remains descriptive and non-strict for now. Missing registry
  definitions are warnings in the new validation helper, not binding failures.
- `FlowDocPackage v1` still does not persist the registry; that remains a future
  package migration decision.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FlowDoc Package V2 Proposal

Goal: Continue Phase B by defining the next package direction before changing
runtime storage, import/export behavior, or localStorage format.

Completed:

- Added `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`.
- Proposed `FlowDocPackageV2` with required package-level `fields:
  FieldRegistryV1`.
- Reserved optional/deferred package locations for `data`, `history`, and
  migration records without making them active behavior.
- Defined v2 goals, non-goals, identity rules, ownership boundaries, validation
  levels, migration direction, import/export policy, test expectations, and
  open decisions.
- Linked the proposal from docs index, package contract, field registry
  contract, architecture overview, test strategy, and agent workflow.

Files changed:

- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`

Notes:

- This is proposal-only work. It intentionally does not implement package v2
  parsing, migration, localStorage changes, or JSON export changes.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FlowDoc Package V2 Parser Compatibility

Goal: Continue Phase C by proving the v2 package proposal in the persistence
boundary while keeping default save/export behavior on package v1.

Completed:

- Added `FlowDocPackageV2` and `FlowDocPackage` union types to editor
  persistence.
- Added package v2 parser support with required `fields: FieldRegistryV1`.
- Kept `CURRENT_PACKAGE_VERSION` and `serializeDocumentPackage(...)` on v1 so
  localStorage saves and JSON export behavior do not change yet.
- Added registry validation during v2 parsing: duplicate keys and inline
  `collection`/`image` field targets reject the package, while missing field
  definitions are surfaced as warnings.
- Added focused persistence tests for v2 parse success, missing-definition
  warnings, duplicate registry rejection, collection-target rejection, and
  default export remaining v1.
- Updated package/proposal/test/fixture docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This does not migrate localStorage, switch JSON export to v2, or add data/key
  history storage.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Data Snapshot Contract And Validation Fixtures

Goal: Continue Phase D by defining field values outside `DocumentNode` before
wiring data into binding, packages, or key history.

Completed:

- Added `docs/DATA_SNAPSHOT_CONTRACT.md`.
- Added `packages/core/src/dataSnapshot/index.ts` with
  `DataSnapshotV1`, scalar value types, `validateDataSnapshot(...)`, and
  `hasDataSnapshotErrors(...)`.
- Added focused data snapshot fixtures for valid scalar values, required-field
  readiness warnings, unknown-key warnings, invalid value type errors, invalid
  enum value errors, and unsupported `image`/`collection` snapshot values.
- Linked the data snapshot contract from docs index, agent workflow,
  architecture, field registry contract, package v2 proposal, fixture catalog,
  and test strategy.

Files changed:

- `packages/core/src/dataSnapshot/index.ts`
- `packages/core/src/dataSnapshot/index.test.ts`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/dataSnapshot/index.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This does not persist data snapshots in package JSON and does not wire
  snapshots into binding yet.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Snapshot Binding Preview Foundation

Goal: Continue Phase E by wiring scalar data snapshots into temporary binding
preview without changing package persistence or mutating template documents.

Completed:

- Added `bindDocumentWithSnapshot(...)` to the core binding layer.
- Kept the existing nested `FieldData` binding entrypoint intact for
  compatibility.
- Bound flat `DataSnapshotV1.values` keys such as `customer.name` directly to
  matching inline `fieldRef.key` values.
- Returned data snapshot validation issues alongside the resolved document so
  callers can decide how to handle warnings/errors.
- Made invalid snapshot values fall back instead of rendering invalid data into
  preview/export output.
- Allowed missing values to use inline `fieldRef.fallback`, registry fallback,
  or empty text.
- Updated Fill mode to store values as `DataSnapshotV1` and preview through the
  snapshot binding helper.
- Updated architecture, field registry, package v2 proposal, data snapshot,
  fixture catalog, and test strategy docs.

Files changed:

- `packages/core/src/binding/index.ts`
- `packages/core/src/binding/index.test.ts`
- `src/app/_lib/fieldRegistry.ts`
- `src/app/editor/_components/FillingPanel.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/binding/index.test.ts src/dataSnapshot/index.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This still does not persist data snapshots in package JSON, switch
  localStorage/export to package v2, or implement key history.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Document Data Readiness Feedback

Goal: Continue Phase F by surfacing registry/snapshot readiness without making
readiness warnings block opening, editing, or preview.

Completed:

- Added `packages/core/src/readiness/index.ts` with
  `assessDocumentDataReadiness(...)`.
- Combined field registry reference issues and data snapshot validation issues
  into one readiness report.
- Scoped required snapshot checks to fields actually used by the current
  document so unused required registry fields do not warn in Fill mode.
- Added readiness fixtures for valid data, missing registry definitions,
  missing used required values, unused required fields, and invalid snapshot
  values.
- Updated Fill mode to show compact non-blocking readiness errors/warnings in
  the filling panel.
- Extended the automated editor smoke with a Fill mode readiness warning/clear
  check on an isolated fieldRef document.
- Updated architecture, field registry, package v2 proposal, data snapshot,
  browser smoke, fixture catalog, and test strategy docs.

Files changed:

- `packages/core/src/readiness/index.ts`
- `packages/core/src/readiness/index.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/FillingPanel.tsx`
- `scripts/editor-smoke.mjs`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/readiness/index.test.ts src/binding/index.test.ts src/dataSnapshot/index.test.ts src/fieldRegistry/index.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- Readiness remains informational in the editor. This does not decide publish,
  export, package migration, or review-workflow blocking policy.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Surface Package V2 Registry Import Warnings

Goal: Continue Phase G by making package v2 registry readiness visible during
JSON import without changing the active save/export package format.

Completed:

- Extended `documentImportSuccessMessage(...)` to include registry warning
  counts when a parsed package reports warning-level field registry issues.
- Updated JSON import wiring so package v2 missing-definition warnings appear
  in the toolbar import status.
- Added focused persistence coverage for the warning status message.
- Updated package contract, package v2 proposal, fixture catalog, test
  strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is still non-blocking readiness feedback. It does not migrate
  localStorage/export to package v2.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add In-Memory Package V2 Migration Helper

Goal: Continue the package v2 path by proving explicit migration behavior
without changing current localStorage or JSON export defaults.

Completed:

- Added `migratePersistedDocumentPackageToV2(...)`.
- Added `createDocumentPackageV2(...)` for explicit package v2 construction.
- Migrated package v1 input to package v2 in memory with an empty
  `FieldRegistryV1`.
- Migrated legacy raw `DocumentNode v1` JSON to package v2 in memory with an
  empty `FieldRegistryV1`.
- Surfaced missing field definitions as warning-level registry issues during
  v2 migration.
- Kept existing package v2 input idempotent and preserved optional `data`,
  `history`, and `migrations` members.
- Kept `serializeDocumentPackage(...)`, localStorage save, and JSON export on
  package v1.
- Updated package contract, package v2 proposal, fixture catalog, test
  strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is the last low-risk migration foundation before choosing whether
  package v2 should become the active localStorage and/or JSON export format.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Activate Package V2 For LocalStorage

Goal: Activate package v2 in the lowest-risk runtime boundary while keeping
downloaded JSON export on package v1.

Completed:

- Added `CURRENT_STORAGE_PACKAGE_VERSION = 2`.
- Changed localStorage autosave to write `FlowDocPackage v2`.
- Kept `serializeDocumentPackage(...)` and JSON export writing
  `FlowDocPackage v1`.
- Allowed `saveDocumentToStorage(...)` to receive the active
  `FieldRegistryV1`.
- Preserved package v2 field registries loaded from localStorage or JSON import
  in editor Fill mode, readiness checks, and subsequent autosaves.
- Used the sample editor field registry for new documents and legacy/package
  v1 inputs that do not carry a package-level registry.
- Updated the automated editor smoke to assert autosaved localStorage packages
  are v2.
- Updated package contract, package v2 proposal, browser smoke, fixture catalog,
  test strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/FillingPanel.tsx`
- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- JSON export intentionally remains package v1. The next major decision is
  whether and when downloaded `.flowdoc.json` files should switch to package v2.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Transition Package V2 JSON Export

Goal: Continue the short transition toward package v2 as the canonical file
format without removing the stable package v1 export yet.

Completed:

- Added `serializeDocumentPackageV2(...)`.
- Added an explicit `Save v2` editor toolbar action that downloads package v2
  JSON with the active field registry.
- Kept the existing `Save JSON` action writing package v1.
- Added `.v2.flowdoc.json` filenames for transition package v2 downloads so v1
  and v2 exports are not easy to confuse or overwrite.
- Added focused persistence coverage for package v2 export serialization and
  v2 filename generation.
- Updated package contract, package v2 proposal, browser smoke checklist,
  fixture catalog, test strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is intentionally transitional. The next package decision should make
  package v2 the default JSON export and remove or demote package v1 export.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Automated Editor Browser Smoke

Goal: Start Phase 1 of the stability roadmap by turning the most important
manual editor smoke path into a repeatable browser check.

Completed:

- Added Playwright as a dev dependency and installed the Chromium browser
  runtime for local smoke execution.
- Added `npm.cmd run smoke:editor` / `npm run smoke:editor`.
- Added `scripts/editor-smoke.mjs`, which starts an isolated Next dev server on
  port `4010`, seeds a deterministic editor document in `localStorage`, and
  checks the real `/editor` route through Chromium.
- Covered editor load/status, paragraph multiline inline edit commit,
  undo/redo, and table-cell selection into the property panel.
- Added stable `data-testid` hooks for the editor shell, toolbar, canvas,
  page/fragments, layout error badge, and property-panel title.
- Updated the browser smoke checklist, test strategy, and fixture catalog so
  future sessions know what the automated smoke covers and what still requires
  manual inspection.

Files changed:

- `package.json`
- `package-lock.json`
- `scripts/editor-smoke.mjs`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- The smoke is deliberately focused coverage. It does not replace visual
  regression, PDF/editor parity checks, drag/resize interaction checks, or
  manual review for perceived flicker.
- The script uses `localhost` by default because Next.js 16 dev resources block
  the `127.0.0.1` origin unless it is explicitly allowed in Next config.

### Add Real-Font Thai Drift Fixtures

Goal: Start Phase 2 by checking the actual runtime Thai font path, not only
mock browser/server width differences.

Completed:

- Added `realFontDrift.test.ts` under the app component tests.
- Loaded `public/fonts/THSarabun.ttf` into both Chromium canvas and the
  server-side fontkit measurer from the same font bytes.
- Added representative width parity coverage for Thai, mixed Thai/English,
  digits, long Thai tokens, and long ASCII text.
- Added a browser-canvas pagination helper that fills a synchronous measurement
  cache from Chromium, allowing the existing core paginator to run unchanged.
- Compared browser-canvas pagination and server fontkit pagination through
  `comparePagination`, asserting no line-count, page-break, continuation, or
  geometry drift for a representative Thai document.
- Updated fixture/test strategy/text-engine docs to move real-font Thai drift
  out of the known-gap bucket.

Files changed:

- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- The test skips when either the runtime font file or Playwright Chromium
  runtime is unavailable. When both are present, it exercises the real browser
  canvas and real fontkit paths.
- This is still not visual regression. It locks text measurement and pagination
  drift for the real Thai font before broader PDF/editor parity work.

### Add Product Export Golden Smoke

Goal: Start Phase 3 by checking product fixtures through renderer output
without brittle binary snapshots.

Completed:

- Added `productExportGolden.test.ts` under core renderer tests.
- Rebuilt the customs and report product fixtures in the renderer layer, then
  paginated them with the server-style stack: `public/fonts/THSarabun.ttf`,
  `createFontkitMeasurer`, and `thaiWordBreaker`.
- Rendered customs and report fixtures through `PdfRenderer` with a real Thai
  `FontProvider`, then loaded the generated PDF with `pdf-lib` to verify page
  count parity with authoritative pagination.
- Preserved pre-render customs table invariants in the export smoke: 3 pages,
  repeated header rows, 130 body rows, and fixed column geometry.
- Rendered the customs fixture through `DocxRenderer` and inspected
  `word/document.xml` with `JSZip` to verify generated table-row structure
  matches the paginated table rows.
- Updated fixture catalog, test strategy, and export renderer contract to mark
  product export smoke coverage as present while keeping visual regression
  clearly deferred.

Files changed:

- `packages/core/src/renderer/__tests__/productExportGolden.test.ts`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/productExportGolden.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- The test intentionally avoids binary PDF/DOCX snapshots. It checks stable
  artifact properties: PDF page count and DOCX XML row structure.
- This still does not prove pixel-level PDF/editor visual parity.

### Add API Export/Paginate Contract Smoke

Goal: Start Phase 4 by protecting the actual Next route boundary for
pagination and export, not only the core renderer classes.

Completed:

- Added direct route tests for `src/app/api/paginate/route.ts` and
  `src/app/api/export/route.ts`.
- Covered `/api/paginate` success with asserted `PaginatedDocument` JSON.
- Covered invalid JSON rejection for `/api/paginate`.
- Covered invalid export format rejection for `/api/export`.
- Covered `/api/export` PDF success headers, `%PDF` bytes, and page readability
  through `pdf-lib`.
- Covered `/api/export` DOCX success headers, `PK` ZIP bytes, and editable
  `word/document.xml` readability through `JSZip`.
- Updated fixture catalog, test strategy, and export renderer contract to note
  API route contract smoke coverage.

Files changed:

- `src/app/api/__tests__/exportPaginate.test.ts`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/api/__tests__/exportPaginate.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- These are direct route-function tests. They do not start a Next dev server.
- The tests intentionally stay at the API boundary: status, headers, asserted
  JSON, and readable artifact bytes. Deep product page/table semantics remain
  in core renderer/product golden tests.

### Add Version-1 Document Persistence Guard

Goal: Start Phase 5 conservatively by hardening localStorage and JSON import
without changing the persisted document format.

Completed:

- Added `documentPersistence.ts` for the editor.
- Centralized version-1 document parsing for localStorage and JSON import.
- Kept the existing raw `DocumentNode` storage format and `flowdoc_document`
  key.
- Normalized persisted/imported documents before they enter editor state.
- Validated normalized documents with `assertDocument`, rejecting invalid JSON,
  unsupported versions, and structurally invalid documents.
- Updated `EditorShell` to use the shared persistence helper for save, load, and
  import.
- Added focused app tests for parse/normalize, invalid JSON, unsupported
  version, invalid structure, and localStorage key behavior.
- Updated architecture, fixture catalog, and test strategy docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This was the conservative guard before the package direction was chosen. The
  later `FlowDocPackage v1` entry keeps the same validation guard while moving
  persisted/editor JSON to a document-first package envelope.

### Add Product Pagination Golden Fixtures

Goal: Read the documentation set first, then add fixture coverage that aligns
with the documented product scenarios and test strategy.

Completed:

- Read the docs index, product scenarios, fixture catalog, test strategy,
  cross-page/page-fragmentation/export contracts, table contract, text reflow
  plan, and recent work log themes.
- Added `product fixture — customs-page-count-golden` to lock the customs table
  page count, repeated header count, footer page numbers, and fixed column
  geometry.
- Added `product fixture — report-page-count-golden` to lock cover/TOC/body
  page counts, body footer restart numbers, and long paragraph continuation
  ranges.
- Updated `assertDocument` so authored `toc` blocks are accepted in body/stack
  positions, matching the existing product fixtures and renderer/API contract
  direction.
- Updated fixture/test documentation with the new fixture ownership and current
  test inventory.

Files changed:

- `docs/FIXTURE_CATALOG.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `packages/core/src/document/assert.ts`
- `packages/core/src/document/assert.test.ts`
- `packages/core/src/pagination/__tests__/productGolden.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/productGolden.test.ts`
- `npm.cmd run test -w packages/core -- src/document/assert.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/multiSection.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`

Notes:

- This intentionally does not add pixel-level PDF/editor visual regression.
  The docs still mark that as future work; this change freezes the
  renderer-facing `PaginatedDocument` baseline first.

### Add Internal WYSIWYG Text Interaction Policy

Goal: Continue Stage 6 with pure IME, clipboard, keyboard, accessibility, and
selection-range policy helpers while keeping default textarea UX unchanged.

Completed:

- Added `src/app/editor/_components/wysiwygTextInteraction.ts`.
- Added explicit native fallback reasons for composition, clipboard,
  accessibility, stale visual state, and missing geometry.
- Added pure classification for current inline edit keyboard decisions:
  native, end edit, split paragraph, and merge/boundary backspace.
- Kept copy/cut/paste policy native by default.
- Added selection snapshot helpers that convert textarea local selection into
  full paragraph UTF-16 offsets, including continuation-fragment `preText` and
  backward selection direction.
- Updated the WYSIWYG roadmap with the Stage 6 internal helper contract.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygTextInteraction.ts`
- `src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `npm.cmd run test:app`
- `npm.cmd test`

Notes:

- This does not replace native IME or clipboard behavior. It only gives future
  WYSIWYG stages a tested policy layer to call.

### Add Internal Selection Overlay Geometry

Goal: Continue Stage 5 as an internal geometry contract for selection
highlights without enabling visible selection UI or clipboard behavior.

Completed:

- Added selection overlay rectangle helpers to `wysiwygCaretMapping.ts`.
- Covered single-line, multi-line, and split-fragment paragraph selection
  geometry in focused tests.
- Updated the WYSIWYG roadmap to mark selection overlay geometry as internal
  only, with drag selection and clipboard behavior still deferred.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd test`

Notes:

- This does not render visible selection highlights and does not change native
  textarea selection behavior.

### Activate WYSIWYG Point-To-Offset Hit Testing

Goal: Start Stage 4 by routing paragraph pointer hit testing through the new
WYSIWYG point-to-offset mapping helper while preserving the previous fallback
path.

Completed:

- Updated `EditorCanvas` paragraph click/double-click caret lookup to call
  `resolveCaretOffsetFromPointInFragment(...)`.
- Kept the older line-width ratio fallback for fragments that do not have
  segment geometry.
- Documented the Stage 4 activation in the WYSIWYG roadmap.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor`: clicking paragraph text opens
  inline edit and starts with transparent textarea/SVG visual after the
  point-to-offset helper activation.

Notes:

- This activates the mapping contract for click hit testing only. It does not
  draw a custom caret and does not add drag selection.

### Add Internal Collapsed Caret Overlay Geometry

Goal: Continue Stage 3 safely by deriving collapsed caret overlay geometry from
the new WYSIWYG mapping contract without rendering a custom caret in the editor
yet.

Completed:

- Added collapsed caret overlay geometry helpers to
  `wysiwygCaretMapping.ts`.
- Covered single-fragment and split-fragment overlay coordinates in focused
  tests.
- Updated the WYSIWYG roadmap to note that Stage 3 has internal geometry
  helpers, but default editor rendering is unchanged.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd test`

Notes:

- This deliberately avoids drawing the custom caret in `ParagraphTextSurface`
  until the native textarea interaction/fallback rules are ready.

### Start Internal WYSIWYG Caret Mapping Contract

Goal: Begin Stage 1-2 of the WYSIWYG track with an internal caret mapping
contract that can be tested without changing the default editor UX.

Completed:

- Added `src/app/editor/_components/wysiwygCaretMapping.ts` as an internal
  helper for WYSIWYG caret mapping.
- Defined tested mapping primitives for:
  - grapheme-safe caret candidates from `PaginatedLine` segments
  - paragraph offset to page-local caret position
  - page-local point to paragraph offset
  - split-fragment boundary selection across pages
- Kept the helper segment-driven and page-local; it does not store geometry in
  `DocumentNode` and is not wired into default editor interaction yet.
- Updated the WYSIWYG roadmap with the internal helper location and opt-in note.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd run test:app`
- `npm.cmd test`

Notes:

- This is still not a custom caret implementation. It is the contract layer that
  future collapsed caret and hit testing work can consume.

### Document WYSIWYG Roadmap And Narrow Pointer Lock

Goal: Lock the future WYSIWYG direction in docs while fixing the failed active
edit visual lock trigger where a second caret-placement click exposed textarea
layout drift.

Completed:

- Removed `onPointerDown` as a trigger for locking the active edit session to
  visible textarea text. Pointer events still stop propagation, but a caret
  placement click no longer changes the visual layer by itself.
- Kept visible textarea locking for actual text input, keyboard interaction, and
  composition start.
- Added `docs/WYSIWYG_EDITOR_ROADMAP.md` with the staged WYSIWYG track:
  current hybrid stability, visual truth contract, caret mapping contract,
  collapsed custom caret, hit testing, selection overlay, IME/clipboard/
  accessibility hardening, and hidden input mode.
- Documented WYSIWYG guardrails in the editor UX contract, including no document
  model changes first, no textarea layout truth, composition fallback, deferred
  selection, and `caret candidates != line segments`.
- Updated browser smoke expectations for second-click caret placement and
  keyboard/input/composition locking.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor`: opening inline paragraph edit
  starts with transparent textarea/SVG visual, a second caret-placement click
  keeps the textarea transparent, typing locks the textarea visible, and Escape
  exits back to normal SVG rendering.

Notes:

- This does not start custom caret implementation. The roadmap remains an
  internal future track until the hybrid editor is stable enough.

### Lock Active Inline Edit Visual Mode

Goal: Stop active paragraph editing from snapping after idle by preventing
automatic handoff from textarea text back to SVG text once the user has started
interacting with the textarea.

Completed:

- Replaced the short settle timer with a node-scoped visual lock:
  `inlineEditVisualLockNodeId`.
- Kept SVG visual parity available on edit entry when the paginated visual
  snapshot is already fresh.
- Lock the active edit session to visible textarea text after real user
  interaction (`onInput`, `onKeyDown`, `onPointerDown`, or
  `onCompositionStart`).
- Kept `onSelect` as caret-state only so autofocus/programmatic caret setup
  does not lock textarea mode by itself.
- Reset the visual lock when starting a new edit session, ending edit, or
  replacing the document.
- Updated editor UX and browser smoke docs with the active-session visual lock
  contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` with the current localStorage
  document:
  - reloaded the editor and confirmed no visible `layout error` /
    `Server pagination failed` badge;
  - entered inline edit and confirmed the initial fresh state kept textarea text
    transparent after autofocus/programmatic selection;
  - typed one `x` and confirmed textarea text became visible;
  - waited past the previous idle handoff window and confirmed textarea text
    stayed visible instead of snapping back to SVG;
  - used native textarea undo to restore the smoke character, closed edit with
    Escape, and restored app undo/redo state after the smoke check.

Notes:

- This is a visual-mode decision only. It does not change document truth,
  browser/server pagination, export, schema, or custom caret/selection behavior.

### Hold Textarea Fallback During Active Inline Typing

Goal: Reduce inline edit visual jitter after the guarded overlay change by
avoiding rapid per-keystroke switching between the native textarea text layer
and the SVG paginated text layer.

Completed:

- Added a short inline edit visual settle gate. Each draft text change keeps the
  textarea visible for the current typing burst, then allows the SVG visual
  layer only after the user pauses briefly and browser pagination has caught up.
- Kept the previous freshness guard: stale visual snapshots still cannot hide
  typed text, and fresh SVG lines only become the visual layer after the settle
  delay.
- Documented the intended behavior in the editor UX contract and browser smoke
  checklist.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` with the current localStorage
  document:
  - reloaded the editor and confirmed no visible `layout error` /
    `Server pagination failed` badge;
  - opened a paragraph inline editor and confirmed the settled fresh state keeps
    textarea text transparent;
  - typed one `x` and confirmed textarea text became visible during the typing
    burst;
  - waited for the settle delay and confirmed textarea text became transparent
    again once the SVG visual layer was ready;
  - closed edit with Escape and used Undo to restore the one-character smoke
    change.

Notes:

- This is still not a custom caret/selection implementation. It only smooths
  the handoff between textarea fallback and SVG visual parity.

### Add Guarded Inline Edit Visual Overlay

Goal: Make normal paragraph view and inline edit view share the same visual
text source when safe, without starting a custom caret/selection project.

Completed:

- Added inline edit draft/visual version tracking so the editor knows when the
  current paginated visual lines match the active draft.
- Kept textarea input/caret as the interaction truth, but render active SVG
  paragraph lines during edit when the visual snapshot is fresh.
- Kept textarea text visible as the fallback while visual pagination is stale,
  preventing fast typing from making text disappear.
- Made the textarea geometry intent explicit: foreignObject chrome expands the
  hit/outline box while matching padding keeps the content origin aligned with
  the paragraph fragment.
- Added focused app tests for the guarded overlay helper behavior and updated
  UX/smoke docs with the no-disappear/no-double-text contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` with the current localStorage
  document:
  - reloaded the editor and confirmed the toolbar/pages rendered with no visible
    `layout error` / `Server pagination failed` badge;
  - opened an inline paragraph editor and confirmed exactly one active textarea;
  - confirmed the fresh edit state uses transparent textarea text with visible
    caret color, allowing the SVG paragraph lines to be the visual layer;
  - closed the inline editor with Escape and confirmed the textarea unmounted
    with no visible layout error badge.

Notes:

- This keeps server pagination, export, schema, and the core pagination engine
  unchanged. Custom caret/selection remains a later decision gate.
- The browser console buffer still contained earlier authoritative pagination
  errors from the page session, so the smoke result is based on visible status
  and current editor state rather than a clean console log.

### Fit Oversized Table Columns During Flow

Goal: Clear the server `/api/paginate` layout assertion failure where table
cells could extend slightly past the page content box when authored column
widths exceeded the available table container width.

Completed:

- Added table column width resolution in the flow layer. Authored table column
  widths are preserved in `DocumentNode`, but layout scales them down
  proportionally when their sum exceeds the available parent width.
- Kept the last table column absorbing floating-point remainder so the final
  cell right edge lands on the available width instead of drifting outside the
  content box.
- Added a core pagination test for an oversized 3-column table that now fits the
  available content width and passes `assertPaginatedDocument`.
- Browser recheck on the current editor document confirmed the visible
  `Server pagination failed` / `layout error` badge disappeared after reload.

Files changed:

- `docs/WORK_LOG.md`
- `packages/core/src/layout/flow.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- tablePagination`
- `npm.cmd test`
- Browser reload of `http://localhost:4000/editor`

Notes:

- This is a layout containment fix only. It does not change schema, authored
  table columns, export APIs, or renderer behavior.

### Restore Visible Active Inline Text Feedback

Goal: Fix the live inline pagination UX regression where the native textarea
caret/input layer was transparent while SVG lines waited for debounced browser
pagination, making typed text invisible and line-click caret placement feel
wrong.

Completed:

- Made the active paragraph textarea render visible text again so immediate
  typing feedback and the native caret live in the same browser layout layer.
- Stopped rendering the active fragment SVG text lines while the textarea is
  active, avoiding duplicate text. Continuation fragments still render from the
  paginated snapshot.
- Clamped the active textarea overlay height to the active paginated fragment
  height instead of autosizing to full `scrollHeight`, preventing a long
  transparent hit area from growing past the page while pagination catches up.
- Reduced inline browser pagination cadence from 100ms to 16ms so page splits
  update during sustained typing instead of mostly after typing stops.
- Updated editor UX and smoke docs to describe the hybrid contract: active
  fragment visual feedback belongs to the textarea, page continuation belongs
  to the paginator.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser inspection on `http://localhost:4000/editor` confirmed the active
  inline textarea now uses visible text color instead of `transparent`; the
  existing local document still shows the separate server pagination failed
  badge noted in the previous entry.

Notes:

- This does not add a mini paginator in `ParagraphTextSurface`. The textarea
  only owns immediate active-fragment feedback; cross-page layout still comes
  from browser/server pagination.

### Harden Inline Edit Relocation Blur And Caret Movement

Goal: Close the main UX risks after adding caret-following across live
pagination: accidental edit finalization during textarea relocation and stale
caret state when the user moves the caret without typing.

Completed:

- Added a delayed blur guard for inline edit textareas. Blur from an old
  remounted textarea waits briefly and is ignored when focus lands on another
  inline textarea for the same paragraph.
- Added a focused `shouldFinalizeInlineEditBlur()` helper with tests for same
  node relocation, outside blur, changed active node, and unknown-node fallback.
- Added `onInlineEditCaretChange` through `ParagraphTextSurface` and
  `EditorCanvas` so selection/arrow-key caret movement updates
  `inlineEditCaretIndex` without dispatching `UPDATE_INLINE_TEXT_DRAFT`.
- Marked active inline textareas with `data-inline-edit-node-id` for relocation
  focus checks.
- Updated editor UX and browser smoke docs with the blur/caret hardening
  contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/inlineEditBlur.ts`
- `src/app/editor/_components/__tests__/inlineEditBlur.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` confirmed the editor route,
  toolbar, pages, and outline rendered; the current local document still showed
  `Server pagination failed — editor is showing browser preview only`, with no
  console warnings/errors captured.

Notes:

- This keeps the architecture unchanged: no schema/export/server/pagination
  engine changes, and `ParagraphTextSurface` still does not implement page
  fragmentation.
- The server pagination badge should be investigated separately if it persists
  outside the current localStorage document/dev-server state.

### Polish Live Inline Pagination Performance Phase 4

Goal: Keep live inline pagination responsive as documents grow without changing
the pagination contract or schema.

Completed:

- Split inline edit caret lookup into reusable precomputed fragment ranges.
- Updated `EditorShell` to memoize active paragraph fragment ranges per
  paginated snapshot, so ordinary caret movement does not rescan the full
  document until pagination actually changes.
- Kept the one-shot `findInlineEditPageIndexForCaret()` helper for direct tests
  and callers that do not need cached ranges.
- Added an early generation/edit-node guard before browser pagination computes a
  new optimistic snapshot, avoiding work for callbacks that are already stale.
- Added app tests for precomputed range reuse across caret moves.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/inlineEditCaret.ts`
- `src/app/editor/_components/__tests__/inlineEditCaret.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`

Notes:

- This phase keeps browser pagination whole-document and debounced. More
  invasive affected-section or measurement-cache work remains a future engine
  optimization, not part of the inline edit UX slice.

### Harden Continuation Fragment Inline Editing Phase 3

Goal: Make Enter/Backspace inside split paragraph inline editing use the full
paragraph text offset, even when the active textarea only renders a continuation
slice.

Completed:

- Added inline edit helpers for absolute caret mapping, split text generation,
  and continuation-boundary Backspace behavior.
- Wired paragraph inline `Enter` to split at the absolute paragraph offset,
  deleting any selected local text before splitting.
- Wired `Backspace` at the start of a continuation slice to delete the previous
  grapheme across the continuation boundary instead of incorrectly merging the
  paragraph.
- Kept `Backspace` at the true start of the full paragraph mapped to
  `mergeParagraphWithPrevious()`.
- Preserved inline edit history snapshots across split/merge dispatches so the
  previous edit transaction does not linger after structural paragraph actions.
- Started a fresh inline edit transaction after split/merge focus moves to the
  new or previous paragraph.
- Updated editor UX and browser smoke docs with the continuation key handling
  contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`

Notes:

- Cross-fragment text selection and fully caret-perfect visual editing remain
  deferred polish. This phase focuses on correct full-text offset mapping and
  avoiding wrong paragraph merges from continuation slices.

### Add Inline Edit Caret Page Tracking Phase 2

Goal: Move the active inline edit surface to the paginated fragment containing
the caret once live inline pagination splits a paragraph across pages.

Completed:

- Added `findInlineEditPageIndexForCaret()` to derive the active edit page from
  paginated paragraph fragment segment ranges.
- Updated `EditorShell` to update `inlineEditPageIndex` when the caret crosses
  a live continuation boundary, while leaving the caret index as transient
  editor state rather than document geometry.
- Added app tests for first-page caret placement, continuation-page placement,
  exact split boundaries, moving back before the boundary, and missing segment
  offset fallback.
- Updated editor UX and browser smoke docs to reflect active textarea page
  tracking while keeping cross-fragment selection and fully caret-perfect
  editing deferred.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/inlineEditCaret.ts`
- `src/app/editor/_components/__tests__/inlineEditCaret.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`

Notes:

- This phase intentionally uses paginated segment offsets instead of page
  geometry in authored nodes. Editing from later continuation fragments and
  Enter/Backspace hardening remain Phase 3 work.

### Add Live Inline Pagination Preview Phase 1

Goal: Let long inline paragraph edits use browser pagination for optimistic
page continuation before blur, without turning the text surface into a second
paginator.

Completed:

- Allowed the browser `paginateDocument(previewDoc, editorTextMeasurer)` path to
  run during inline editing with a conservative debounce.
- Added a browser pagination generation guard so stale optimistic pagination
  results cannot overwrite newer draft layouts during fast typing.
- Kept server `/api/paginate` as authoritative status/drift/export truth.
- Stopped inline edit height callbacks from shifting page layout while live
  inline pagination is active, avoiding double movement when the paginator
  settles the same draft.
- Changed the active paragraph edit surface to render visual text from
  `PaginatedDocument` fragment lines instead of measuring and drawing all draft
  lines inside the current fragment.
- Stabilized editor canvas keys for sections, pages, and active inline fragments
  so frequent paginated snapshot updates are less likely to remount the textarea.
- Updated editor/browser smoke docs to describe live inline pagination as
  optimistic visual layout and keep caret-following across pages deferred.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser check on `http://localhost:4000/editor`:
  - confirmed the editor loaded with no console warnings/errors;
  - opened the existing multi-page paragraph inline editor;
  - confirmed the restored text matched the pre-smoke value before committing;
  - committed the inline session and confirmed no textarea/focus residue or
    console warnings/errors remained.

Notes:

- Browser automation could not complete the full shrink/restore smoke because
  the current Browser Use text replacement path required a virtual clipboard
  that was unavailable in this session. The attempted keystroke change was
  repaired and verified against the pre-smoke text before committing.
- Phase 1 intentionally improves visual continuity only. Caret-following across
  pages and full continuation-fragment editing remain deferred.

---

### Tighten Experimental WYSIWYG Stability Gate

Goal: Treat the current WYSIWYG inline edit path as opt-in experimental and
expand browser/runtime evidence without adding selection, clipboard, hidden
input, or new WYSIWYG stages.

Completed:

- Changed `resolveWysiwygInlineEditEnabled(...)` so the experimental WYSIWYG
  path is disabled by default in every environment unless
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT` is explicitly enabled.
- Updated the automated editor smoke server to set
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`, keeping WYSIWYG coverage
  deliberate instead of ambient dev behavior.
- Extended continuation smoke coverage to require a three-fragment paragraph,
  type from the first fragment until caret/page tracking relocates the active
  textarea to a continuation slice, preserve focus, and verify undo/redo as one
  edit session.
- Kept continuation click/edit and continuation-boundary Backspace as a
  separate browser fixture page so the smoke reports clearer gate failures.
- Added a compatibility comment to `inlineEditCaret.ts` clarifying that
  `wysiwygCaretMapping.ts` is the source of truth.
- Updated WYSIWYG, browser smoke, fixture catalog, and test-strategy docs to
  match the opt-in experimental status and current suite counts.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/inlineEditCaret.test.ts`
- `npm.cmd run smoke:editor`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- A combined browser sequence that performed page-tracking undo/redo and then
  immediately re-entered a continuation fragment was not stable enough to use
  as a single smoke gate. The smoke now separates those checks, and that
  combined runtime scenario remains a follow-up before any production-stable
  WYSIWYG claim.
- Production-stable WYSIWYG remains deferred; selection overlay, clipboard
  model, real OS IME stress, accessibility hardening, and missing-geometry
  browser mutation checks are not implemented in this slice.
