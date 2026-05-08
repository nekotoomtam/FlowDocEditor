# Layout Engine Checklist

This checklist tracks flow layout, pagination, page breaks, renderer-facing
layout output, and editor layout interactions. It should stay focused on shared
layout behavior and the contract consumed by editor/PDF/DOCX, not text caret
details covered in `docs/TEXT_ENGINE_CHECKLIST.md`.

## Current Foundation

- [x] `packages/core` owns flow layout and pagination contracts.
- [x] `DocumentNode` stays authored-data-only; computed geometry lives in
  measured/paginated output.
- [x] `PaginatedDocument` is the renderer-facing layout output.
- [x] Editor preview renders from `PaginatedDocument`.
- [x] Server/API pagination is the authoritative layout truth for final page
  settling and export.
- [x] Browser pagination is available as temporary interactive preview.
- [x] PDF and DOCX renderers consume `PaginatedDocument`.
- [x] Row/stack placement and resize interactions exist in the editor.
- [x] Page margin resize interactions exist in the editor.
- [x] Table nodes, rows, cells, and basic table pagination exist.

## Near-Term Checklist

- [x] Add pagination golden fixtures.
  - 15 tests in `packages/core/src/pagination/__tests__/paginator.test.ts`.
  - Covers: fragment geometry (x/y/width), paragraph stacking, spacer placement,
    paragraph/spacer overflow (whole-block move to next page), tall-paragraph
    overflow at page top, row/stack parentNodeId relationships, two-column width
    split, paragraph hard-newline line texts, line x positions, line top-to-bottom
    order.
- [x] Add layout drift fixtures for server-authoritative reconciliation.
  - 6 tests in `packages/core/src/pagination/__tests__/drift.test.ts`.
  - Two separate measurers (browser=narrower, server=wider) simulate real metrics gap.
  - Covers: agreement on short text, server wraps more on long ASCII/Thai, drift
    accumulates with near-boundary lines, page-break shift, fragment height drift.
- [x] Add renderer smoke tests.
  - 11 tests in `packages/core/src/renderer/__tests__/renderer.test.ts`.
  - PDF: verifies %PDF header, single/multi-paragraph, spacer, row/columns, multi-page, empty paragraph.
  - DOCX: verifies PK ZIP header, same document shapes as PDF set.
  - Both renderers use no FontProvider (Helvetica fallback) to stay dependency-free in CI.
- [x] Verify fragment parent/child relationships.
  - Tests in `paginator.test.ts` (row/stack group, new table group).
  - Row: row.parent=body, stack.parent=row, paragraph-in-stack.parent=stack.
  - Table: table.parent=body, table-row.parent=table, table-cell.parent=row,
    paragraph-in-cell.parent=cell.
  - All fragments on a page are ordered top-to-bottom by Y.
- [ ] Define page-break behavior for each node type.
  - [x] Spacer: move as a whole block. It should not split across pages.
    Extremely tall spacers may overflow and should be treated as an authored
    edge case.
  - [x] Row/stack: row is atomic for now. Stacks do not split independently.
    If a row fits on the next page, move the whole row; if it is taller than one
    content page, allow documented overflow for now.
  - [x] Table row: `allowBreak=false` moves the row as a whole; `allowBreak=true`
    may split the row across pages.
  - [x] TOC placeholder: temporary fixed-height block. Pagination places the
    placeholder first, then TOC lines are filled in post-processing; it does not
    yet repaginate if generated TOC content exceeds the placeholder.
  - [ ] Paragraph: currently moves as a whole block and can overflow when taller
    than one page. Add line-level paragraph splitting as the first real layout
    split slice.
- [ ] Stabilize row and stack pagination rules.
  - Preserve row min-height semantics across browser/server/export.
  - Keep stack width shares normalized after operations.
  - Decide how multi-column rows behave when one stack overflows.
- [ ] Stabilize table pagination rules.
  - Validate and test row/col operations against grid invariants.
  - Cover rowspan/colspan with page breaks before expanding table editing UI.
  - Decide whether a table row with spans can split or must move whole.
- [ ] Add layout assertion helpers for paginated output.
  - No fragment should sit outside the section content box unless explicitly
    documented.
  - Fragment heights should be non-negative.
  - Page fragments should be ordered top-to-bottom within a page.
  - Split fragments for the same node should preserve document order.
- [ ] Make editor resize preview converge with authoritative pagination.
  - Column resize preview should avoid committing invalid stack widths.
  - Row min-height preview should use the same natural-height rule as
    pagination.
  - Page margin resize should settle through server/API pagination.
- [ ] Document DOCX layout limitations.
  - DOCX pagination is not pixel-authoritative like PDF/editor preview.
  - Keep renderer-specific compromises explicit.

## Important Design Rules

- [ ] Layout rules belong in `packages/core`, not React/CSS.
- [ ] `DocumentNode` must not store computed `x`, `y`, `width`, `height`,
  page numbers, fragment ids, or resize preview geometry.
- [ ] Renderer code must consume `PaginatedDocument`; it should not reflow
  paragraphs, rows, or tables independently.
- [ ] Editor interaction state may preview layout but must reconcile to
  server/API pagination.
- [ ] Page-break behavior must be deterministic for the same document,
  measurer, and word breaker.
- [ ] Table layout must respect table grid invariants before visual niceties.
- [ ] Temporary renderer/editor limitations should be documented in this
  checklist or `docs/WORK_LOG.md`.

## Later Work

- [ ] Split paragraphs across pages by measured lines.
  - Preserve `spacingBefore` and `spacingAfter` semantics across first/last
    fragments.
  - Preserve segment offsets for caret/selection mapping.
  - Keep fragment order stable for renderer grouping and drift comparison.
- [ ] Incremental pagination from the first changed fragment forward.
- [ ] Stable fragment identity for selection, annotations, comments, or future
  collaborative cursors.
- [ ] Repeating table headers across page breaks.
- [ ] Keep-with-next / keep-lines-together paragraph options.
- [ ] Widow/orphan control.
- [ ] Page templates with richer header/footer flows.
- [ ] Section-level page numbering and restart rules.
- [ ] Multi-section export smoke tests.
- [ ] Visual regression tests for representative document fixtures.

## Open Questions

- [ ] Should a row split when one stack overflows, or should the whole row move
  when possible? Current decision: whole row moves when possible; overflow is
  documented for rows taller than a page until paragraph splitting is stable.
- [ ] How should table rows with rowspan/colspan behave at page boundaries?
- [x] Should spacers split across pages or always move whole? -> Move whole.
- [ ] What is the minimum pagination golden fixture set before changing
  `paginator.ts` again?
- [ ] Which layout differences are acceptable for DOCX versus PDF/editor
  preview?
