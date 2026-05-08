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
- [x] Stabilize row and stack pagination rules.
  - Row height = max(minHeight, tallest-stack-natural-height). Verified in tests.
  - All stacks in a row share the same height as the row fragment.
  - Stack widths sum to contentBox.width; proportional to widthShare; contiguous x positions.
  - Multi-column overflow: whole row moves to next page as a unit; both stacks land on same page.
  - Very tall rows (taller than one page) stay at contentTop without crashing (documented overflow).
  - 12 tests in `packages/core/src/pagination/__tests__/rowStack.test.ts`.
  - All tests pass `assertPaginatedDocument` with no violations.
- [x] Stabilize table pagination rules.
  - Rowspan group detection: `buildRowspanGroups` in `paginator.ts` uses union-find
    to group rows sharing rowspan cells. Multi-row groups are paginated as a unit
    (approach B): page-break decision uses total group height; if the group doesn't
    fit, the whole group moves to the next page. Single-row groups retain existing
    behavior (allowBreak, split, move-whole).
  - Upgrade path to approach A documented: group detection is shared; A adds
    split-at-row-boundary logic within a group.
  - Grid invariants: `addTableRow`, `removeTableRow`, `addTableColumn`,
    `removeTableColumn` all pass `assertDocument` and `assertPaginatedDocument`.
  - 14 tests in `packages/core/src/pagination/__tests__/tablePagination.test.ts`
    covering: no-rowspan baseline, 2/3-row groups staying on same page, group
    moving to next page as unit, mixed groups, and operations+grid invariants.
- [x] Add layout assertion helpers for paginated output.
  - `checkPaginatedDocument(paginated)` → `PaginationViolation[]` in
    `packages/core/src/pagination/assertPaginated.ts`.
  - `assertPaginatedDocument(paginated)` throws with full violation list.
  - Four rules: negative-height, outside-content-box (x/x+width with 0.5pt epsilon),
    wrong-y-order (Y non-decreasing within a page), split-fragment-order (same nodeId
    must appear in ascending page order).
  - 17 tests covering happy path, each violation type, epsilon tolerance, and
    assertPaginatedDocument throw behavior.
- [x] Make editor resize preview converge with authoritative pagination.
  - Column resize: added `Math.max(0.01, ...)` guard in `EditorShell` commit
    path so widthShare never reaches 0 from floating-point rounding.
  - Row min-height: preview uses browser canvas measurer (acceptable drift,
    documented). After commit, server/API pagination settles the authoritative
    result.
  - Page margin: already settles through server/API pagination on commit.
  - 15 tests in `packages/core/src/pagination/__tests__/resizeConvergence.test.ts`
    verifying column resize (normal, near-min, minimum-clamp), row min-height
    (increase, decrease, natural fallback, large), and margin update (symmetric,
    large, asymmetric, x-position after resize) all pass `assertPaginatedDocument`.
- [x] Document DOCX layout limitations.
  - **Pagination**: DOCX export produces correct content structure but cannot
    guarantee page breaks match the editor preview or PDF. Word/LibreOffice
    reflows text using their own engine after opening the file.
  - **Font metrics**: DOCX specifies font names only. Actual line-breaking and
    glyph widths depend on which fonts are installed on the reader's system.
    FlowDoc's fontkit metrics (used for PDF and editor preview) will not match.
  - **Column layout**: Row/stack columns are rendered as invisible-border tables.
    Visual output is close but not pixel-perfect with the editor preview.
  - **Text measurement**: Line breaking inside DOCX paragraphs is controlled by
    the reader application, not FlowDoc's WordBreaker or TextMeasurer.
  - **Spacing and borders**: spacingBefore/After and border widths are converted
    to EMU/twips. Rounding may introduce sub-pt differences from PDF output.
  - **Accepted compromise**: DOCX is an exchange format. Exact visual fidelity
    is intentionally not a goal; structural correctness (paragraphs, tables,
    columns, headers, footers) is the target.

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
