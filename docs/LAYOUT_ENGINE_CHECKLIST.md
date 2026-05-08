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
  - [x] Paragraph: splits across pages by measured lines. Keep the older
    whole-block overflow behavior only for node types whose split rules are still
    intentionally deferred.
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
  - Current rowspan decision: keep linked rows together. If a multi-row rowspan
    group is taller than one content page, treat it as documented overflow.
  - Upgrade path to approach A documented: group detection is shared; A adds
    split-at-row-boundary logic within a group.
  - Grid invariants: `addTableRow`, `removeTableRow`, `addTableColumn`,
    `removeTableColumn` all pass `assertDocument` and `assertPaginatedDocument`.
  - 14 tests in `packages/core/src/pagination/__tests__/tablePagination.test.ts`
    covering: no-rowspan baseline, 2/3-row groups staying on same page, group
    moving to next page as unit, mixed groups, and operations+grid invariants.
- [x] Add too-tall rowspan group edge-case coverage.
  - Fixed `paginateTable`: multi-row rowspan groups now always advance to the
    next page's `contentTop` when they don't fit, even if the group is taller
    than one content page. Matches paragraph behavior.
  - Regression test added: too-tall group after filler content starts at
    `contentTop` (72pt), not mid-page; both rows still land on the same page.
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


## Recheck Addendum — App/Core Boundary

These items came from reviewing the current app layer together with `packages/core`.
They are mostly boundary guards and regression targets, not new feature work.

- [x] Call `assertPaginatedDocument(paginated)` at every authoritative pagination boundary.
  - Added after `paginateDocument(...)` in `/api/paginate` — returns 500 with violation
    details on failure; logs to server console.
  - Added after `paginateDocument(...)` in `/api/export` — same behavior before
    PDF/DOCX render so renderer never receives an invalid layout.
- [x] Make font asset resolution deterministic.
  - Both API routes now log `console.error` with the full path and error when the
    font file is missing, instead of silently falling back.
  - `/api/paginate` adds `X-FlowDoc-Font: fallback` response header when using
    Helvetica fallback so callers can detect the degraded state.
  - Fallback to `createFontkitMeasurer(null)` is still allowed for dev/CI
    environments where the font is absent, but is now always visible in server logs.
- [ ] Expand drift comparison beyond paragraph fragments.
  - Current `comparePagination` intentionally ignores non-paragraph fragments.
  - Add row, stack, table, table-row, table-cell/header/footer/page-template movement
    to the drift snapshot so page movement and geometry drift are visible for every
    layout-owned node type.
  - Keep line-count drift paragraph-only, but make page/geometry drift universal.
- [ ] Give table cells a stable renderer/debug fragment identity.
  - Current cell rendering can be represented as stack-like fragments with cell render
    props. This works visually, but weakens debugging and drift reporting.
  - Prefer an explicit `nodeType: "table-cell"` fragment or a clear discriminated
    subtype before more table features are added.
- [ ] Harden page-number layout measurement.
  - Current inline `pageNumber` measurement uses a one-digit placeholder (`"0"`).
  - Add a two-pass layout or configurable placeholder width before documents commonly
    exceed 9 pages.
  - Add regression tests for page 9 → 10 boundary and page number in narrow header/footer columns.
- [ ] Define TOC overflow policy.
  - Current TOC is filled post-pagination and does not repaginate when generated lines
    exceed the placeholder.
  - Choose one: fixed-height clipped TOC, auto-grow with repagination, or explicit
    validation error when generated TOC exceeds reserved space.
  - Add a fixture where TOC content is intentionally taller than the placeholder.
- [ ] Extend table row splitting from two-slice to multi-page loop.
  - Current row/cell split behavior is good enough for ordinary rows but should be
    stress-tested with content taller than two pages.
  - Add tests for a single breakable row with cell text spanning 3+ pages.
  - Keep rowspan-linked groups conservative until split-at-row-boundary rules are explicit.
- [ ] Add renderer contract checks around fragment coverage.
  - For PDF/DOCX smoke tests, verify not only file headers but that renderer input
    includes expected fragment kinds and split fragments before render.
  - This catches accidental renderer reflow or dropped fragment types earlier.
- [ ] Keep checklist status synchronized with implementation status.
  - When an item moves to `Later Work` and becomes complete, update older `Near-Term`
    wording that may still describe the pre-implementation behavior.
  - Paragraph splitting was one such case: old text said whole-block move, later text
    said measured-line split.

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

- [x] Split paragraphs across pages by measured lines.
  - `paginateParagraph` splits at line boundaries: fast path when the whole
    paragraph fits; split loop when it overflows.
  - `spacingBefore` on first fragment only; `spacingAfter` on last fragment only.
  - Segment offsets are preserved (per-line segments reference the full text string).
  - Fragment order is stable: fragments of the same nodeId appear in ascending
    page order, passing `assertPaginatedDocument`.
  - Force-at-least-one-line guard prevents infinite loops when a single line is
    taller than the content page.
  - 8 tests in `paginator.test.ts` (split group): total line count preserved,
    first/continuation fragment y positions, spacingBefore/After placement,
    3-page span, assertPaginatedDocument, paragraph after split.
- [ ] Incremental pagination from the first changed fragment forward.
- [ ] Stable fragment identity for selection, annotations, comments, or future
  collaborative cursors.
- [x] Repeating table headers across page breaks.
  - Added `headerRowCount?: number` to `TablePropsSchema` / `TableProps`.
  - `paginateTable` now repeats the first `headerRowCount` rows at contentTop of
    every continuation page. Headers are placed via `placeHeaders()` after any
    page advance for non-header content groups.
  - Header fragments appear in ascending page order, passing `assertPaginatedDocument`.
  - Content rows on continuation pages start below the repeated header.
  - 5 tests in `tablePagination.test.ts`: baseline no-header, header repeats on
    every page, header starts at contentTop, content below header, fragment order.
- [x] Keep-with-next paragraph option.
  - Added `keepWithNext?: boolean` to `ParagraphPropsSchema`.
  - `paginateVerticalContainer` looks ahead to the next sibling before placing a
    paragraph with `keepWithNext=true`. If `child.height + nextChild.height` doesn't
    fit on the current page (and we're not already at contentTop), the page is
    advanced before placing the paragraph.
  - Safety guard: only advances when `cursorY > contentTop + 1` — prevents infinite
    loops when the combined height exceeds one full page.
  - `keepTogether` (whole-block no-split) deferred — produces bad UX for long
    paragraphs; addressed if a real use case arises.
  - 5 tests in `keepWithNext.test.ts`: baseline without flag, heading moves with
    next sibling, stays on page 1 when fits, no-loop guard, multiple headings.
- [ ] Widow/orphan control.
- [ ] Page templates with richer header/footer flows.
- [x] Basic page numbering (inline `pageNumber` node).
  - Added `PageNumberInline` schema in `inline.ts`. Paragraph children can include
    `{ type: "pageNumber" }` nodes.
  - `measureParagraph` uses `"0"` as a 1-digit placeholder for layout measurement;
    tracks `pageNumberRanges` to classify segments as `kind: "pageNumber"`.
  - `paginateParagraph` calls `resolvePageNumbers(lines, pageIndex + 1)` after
    placing each fragment — substitutes `"0"` placeholder with the actual page
    number string in both line text and segment text.
  - Works in both fast-path (whole paragraph fits) and split-path (multi-page).
  - 5 tests in `pageNumbers.test.ts`: resolves to "1" on page 1, resolves to "2"
    on page 2, multiple pageNumber nodes in one paragraph, prefix text preserved.
  - Known limitation: layout width measured with "0" (1 digit); pages 10+ may
    overflow slightly. Acceptable for current use cases (header/footer context).
- [ ] Section-level page numbering and restart rules.
- [ ] Multi-section export smoke tests.
- [ ] Visual regression tests for representative document fixtures.

## Open Questions

- [ ] Should a row split when one stack overflows, or should the whole row move
  when possible? Current decision: whole row moves when possible; overflow is
  documented for rows taller than a page until paragraph splitting is stable.
- [ ] How should advanced table spans behave at page boundaries beyond the
  current rowspan approach B?
  - Resolved now: rowspan-linked rows stay together as a unit.
  - Still open: split-at-row-boundary within a rowspan group, colspan-specific
    split behavior, and interactions with `allowBreak=true`.
- [x] Should spacers split across pages or always move whole? -> Move whole.
- [ ] What is the minimum pagination golden fixture set before changing
  `paginator.ts` again?
- [ ] Which layout differences are acceptable for DOCX versus PDF/editor
  preview?
