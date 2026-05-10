# Layout Engine Checklist

This checklist tracks flow layout, pagination, page breaks, renderer-facing
layout output, and editor layout interactions. It should stay focused on shared
layout behavior and the contract consumed by editor/PDF/DOCX, not text caret
details covered in `docs/TEXT_ENGINE_CHECKLIST.md`.

Table authoring and editor operation rules live in
`docs/TABLE_EDITING_CONTRACT.md`.

Product-level direction lives in `docs/PRODUCT_DIRECTION.md`: FlowDocEditor
should grow from document generation into a workflow-ready editor.

Architecture overview lives in `docs/ARCHITECTURE_OVERVIEW.md`.

Editor UX expectations live in `docs/EDITOR_UX_CONTRACT.md`.

Session workflow rules live in `docs/AGENT_WORKFLOW.md`.

Test and QA level guidance lives in `docs/TEST_STRATEGY.md`.

Export renderer rules live in `docs/EXPORT_RENDERER_CONTRACT.md`.

Fixture ownership lives in `docs/FIXTURE_CATALOG.md`.

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
  - 23 tests in `packages/core/src/pagination/__tests__/paginator.test.ts`.
  - Covers: fragment geometry (x/y/width), paragraph stacking, spacer placement,
    paragraph splits across pages by measured lines, spacer moves whole to next page,
    tall-paragraph at page top forces progress without crash, row/stack parentNodeId
    relationships, two-column width split, paragraph hard-newline line texts, line
    x positions, line top-to-bottom order, table fragment relationships.
- [x] Add layout drift fixtures for server-authoritative reconciliation.
  - 6 tests in `packages/core/src/pagination/__tests__/drift.test.ts`.
  - Two separate measurers (browser=narrower, server=wider) simulate real metrics gap.
  - Covers: agreement on short text, server wraps more on long ASCII/Thai, drift
    accumulates with near-boundary lines, page-break shift, fragment height drift.
- [x] Add renderer smoke tests.
  - 16 tests in `packages/core/src/renderer/__tests__/renderer.test.ts`.
  - PDF: verifies %PDF header, single/multi-paragraph, spacer, row/columns, multi-page, empty paragraph.
  - DOCX: verifies PK ZIP header, same document shapes as PDF set.
  - Renderer input contract: 5 tests verifying fragment kinds and split fragments before render.
  - Both renderers use no FontProvider (Helvetica fallback) to stay dependency-free in CI.
- [x] Verify fragment parent/child relationships.
  - Tests in `paginator.test.ts` (row/stack group, new table group).
  - Row: row.parent=body, stack.parent=row, paragraph-in-stack.parent=stack.
  - Table: table.parent=body, table-row.parent=table, table-cell (nodeType="table-cell").parent=table-row,
    paragraph-in-cell.parent=table-cell.
  - All fragments on a page are ordered top-to-bottom by Y.
- [x] Define page-break behavior for each node type.
  - [x] Spacer: move as a whole block. It should not split across pages.
    Extremely tall spacers may overflow and should be treated as an authored
    edge case.
  - [x] Row/stack: row is atomic for now. Stacks do not split independently.
    If a row fits on the next page, move the whole row; if it is taller than one
    content page, allow documented overflow for now.
  - [x] Table row: `allowBreak=true` is the default for single-row groups and may
    split the row across pages; `allowBreak=false` moves the row as a whole.
  - [x] TOC placeholder: estimated-height block in pass 1. Pagination fills TOC
    lines in post-processing; if generated TOC content exceeds the placeholder,
    pass 2 repaginates with the corrected height before rendering lines.
  - [x] Paragraph: splits across pages by measured lines. Keep the older
    whole-block overflow behavior only for node types whose split rules are still
    intentionally deferred.
- [x] Stabilize row and stack pagination rules.
  - Row height = max(minHeight, tallest-stack-natural-height). Verified in tests.
  - All stacks in a row share the same height as the row fragment.
  - Stack widths sum to contentBox.width; proportional to widthShare; contiguous x positions.
  - Multi-column overflow: whole row moves to next page as a unit; both stacks land on same page.
  - Very tall rows (taller than one page) stay at contentTop without crashing (documented overflow).
  - 13 tests in `packages/core/src/pagination/__tests__/rowStack.test.ts`.
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
  - Column operations preserve total table width: insertion splits the target
    column; deletion transfers removed width to a neighbor.
  - 35 tests in `packages/core/src/pagination/__tests__/tablePagination.test.ts`
    covering: no-rowspan baseline, 2/3-row groups staying on same page, group
    moving to next page as unit, mixed groups, operations+grid invariants, and
    multi-page breakable row split (3-page, line count preserved, fragment order),
    column width preservation, plus product fixtures for customs basic table,
    rowspan boundary, and breakable uneven cells.
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

- [x] Add cross-page behavior contract.
  - Added `docs/CROSS_PAGE_BEHAVIOR.md` as the source of truth for page-boundary
    behavior across body paragraphs, row/stack columns, atomic rows, breakable
    table rows, rowspan-linked groups, repeated table headers, page numbers, and
    TOC repagination.
  - Documents current supported behavior, explicit overflow fallbacks, fragment
    metadata expectations, and deferred work.
  - Added row/stack regression coverage that locks the current rule: paragraph
    content inside a stack does not split independently; the row remains the
    page-break unit.


## Cross-Page Line Splitting Checklist

This section makes paragraph continuation across page boundaries explicit. The
engine already supports the first paragraph-level version; the remaining work is
to harden the contract so future selection, annotations, comments, renderer
debugging, and table/list behavior do not reinterpret the split differently.

### Goal

Long text blocks should continue across page boundaries without moving the
entire paragraph to the next page, while still preserving the authored paragraph
as one source node. Pagination owns the split decision; renderers only draw the
fragments they receive.

### Core Contract

- [x] Paragraph measurement exposes line-level layout data before pagination.
  - Required data: line text, y/height, width, baseline/vertical position, and
    segment/range information needed to map the line back to source text.
- [x] Pagination may split a paragraph at measured line boundaries.
  - The split point must be chosen from measured lines, not recomputed by the
    editor, PDF renderer, or DOCX renderer.
- [x] Split paragraph fragments preserve the same source paragraph identity.
  - Continuation fragments should remain traceable to the same `nodeId` so drift
    comparison and later selection/comment features can understand that the
    fragments came from one authored paragraph.
- [x] Fragment ordering is deterministic for the same document, measurer, and
  word breaker.
  - Fragments for the same source node must appear in ascending page/order.
  - A refactor that changes split points should be treated as a pagination
    behavior change and covered by fixtures.
- [x] First/last fragment spacing is handled by pagination.
  - `spacingBefore` belongs to the first fragment.
  - `spacingAfter` belongs to the last fragment.
  - Continuation fragments should not double-apply paragraph spacing.
- [x] A too-tall single line cannot create an infinite pagination loop.
  - If one line cannot fit in the content box, pagination must force progress and
    document the overflow.

### Metadata To Harden Next

- [x] Introduce explicit paragraph-fragment metadata for debugging and future
  editor features.
  - Added 5 optional fields to `PageFragment`: `fragmentIndex` (0-based position),
    `lineStart` (first line index in source paragraph), `lineEnd` (exclusive end),
    `continuesFrom` (true if a previous fragment exists), `isContinued` (true if
    a subsequent fragment exists).
  - Populated in both fast path (whole paragraph fits) and split path. Fast path
    always produces `fragmentIndex=0, lineStart=0, lineEnd=totalLines,
    continuesFrom=false, isContinued=false`.
  - 7 tests in `fragmentMeta.test.ts`: fast-path single fragment, first/last/middle
    fragment flags for 2-page and 3-page splits, lineStart/lineEnd contiguity (no
    gaps or overlaps), lineEnd-lineStart equals fragment line count, fragmentIndex
    strictly increasing, assertPaginatedDocument passes.
- [x] Decide whether fragment identity should stay implicit (`nodeId` + order) or
  become explicit (`fragmentId`).
  - Decision: stay implicit. `nodeId + pageIndex` is unique per page; `fragmentIndex`
    is available for ordered access. An explicit `fragmentId` string adds no new
    capability until selection or annotation features need a stable reference that
    survives document edits — deferred to that point.
- [x] Extend `comparePagination` so paragraph continuation is reported as a
  first-class concept.
  - Added `fragmentCount` and `splitBoundaries` (lineStart of each continuation
    fragment) to `FragmentSnapshot` in `comparePagination.ts`.
  - Added to `FragmentDrift`: `browserFragmentCount`, `serverFragmentCount`,
    `continuationChanged` (fragment count differs — split added or removed),
    `splitBoundaryMoved` (same count but split points differ).
  - Added `continuationChangedCount` to `DriftReport`.
  - `driftMap` now includes entries where only continuation changed (lineDelta=0,
    no pageMovement) so callers can surface split-boundary drift explicitly.
  - Uses `lineStart` metadata from fragment (added in paragraph-fragment metadata
    work) for accurate split-boundary tracking; falls back to cumulative line count
    when `lineStart` is absent.
  - 4 new tests in `comparePagination.test.ts`: continuationChanged browser→server,
    splitBoundaryMoved same fragment count, no drift when splits match, multi-paragraph
    continuationChangedCount.

### Policy Stages

- [x] Stage 1: split paragraphs at any measured line boundary.
  - This gives the engine usable long-paragraph pagination without overfitting
    typographic rules too early.
- [x] Stage 2: add widow/orphan policy.
  - Orphan: if only 1 line fits at the bottom of a page and more lines follow,
    advance to the next page so at least 2 lines start together.
  - Widow: if only 1 line would remain on the next page, reduce the current
    fragment by 1 line so the next page receives at least 2 lines.
  - Both guards skip when `cursorY <= contentTop + 1` — prevents infinite loops
    when the content box is too small for 2 lines (impossible case handled
    gracefully by falling back to normal split).
  - Widow guard also requires `count >= 2` to avoid creating an orphan as a
    side effect of the widow adjustment.
  - 8 tests in `widowOrphan.test.ts`: orphan moves 3-line para to page 2,
    line count preserved, single-line para unaffected, contentTop guard,
    widow splits 4 lines 2+2, line count preserved, 2-line remainder unaffected,
    assertPaginatedDocument passes for all cases.
- [x] Stage 3: add keep-together / keep-with-next interactions.
  - `keepWithNext` implemented: paragraph stays on the same page as its next sibling.
  - `keepTogether` (whole-block no-split) deferred — bad UX for long paragraphs.
- [ ] Stage 4: define list-item continuation rules.
  - Decide whether list marker/bullet rendering belongs only on the first
    fragment or repeats on continuation fragments.
  - Ensure continuation indentation is renderer-independent.
- [x] Stage 5: define table-cell text continuation rules separately from normal
  paragraph continuation.
  - Basic cell text continuation implemented: `pushCellSlice` splits cell content
    at measured line boundaries across pages when the row has `allowBreak=true`.
  - Rowspan-linked groups remain conservative (whole-group approach B).
  - Split-at-row-boundary within rowspan groups still deferred.

### Renderer Rules

- [x] Add renderer contract tests for split paragraph fragments.
  - 5 tests in "renderer input contract" describe block in `renderer.test.ts`.
  - Verifies fragment kinds present, split fragments on multiple pages, ascending
    page order, PDF handles split fragments, DOCX handles split fragments.
- [x] Keep DOCX limitation documented separately.
  - DOCX limitations documented in "Document DOCX layout limitations" checklist item.
  - FlowDoc exports intended structure; Word/LibreOffice may reflow after opening.

### Debug / Observability

- [x] Add a debug view or structured trace for paragraph split decisions.
  - Added `ParagraphSplitDecision` interface to `pagination/types.ts` with fields:
    `nodeId`, `pageIndex`, `fragmentIndex`, `lineCount`, `availableHeight`,
    `fragmentHeight`, `isSplit`, `forcedProgress`, `orphanPrevented`, `widowPrevented`.
  - Added optional `onSplitDecision?: (d: ParagraphSplitDecision) => void` parameter
    to `paginateDocument` (and threaded through `runAllSections`, `paginateSection`,
    `paginateFlowBox`, `paginateVerticalContainer`, `paginateParagraph`). Zero cost
    when not provided — no allocations in the production path.
  - Emitted in fast path (whole paragraph fits: `isSplit=false`) and for every
    fragment placed in the split loop (`isSplit=true`). Orphan/widow flags are set
    on the fragment that benefited from the policy (not the ones that were skipped).
  - 9 tests in `splitTrace.test.ts`: fast-path fields, split emits one decision per
    fragment, fragmentIndex increments, total lineCount preserved, availableHeight/
    fragmentHeight > 0, orphanPrevented flag, widowPrevented flag + lineCount check,
    multiple paragraphs.
- [x] Add golden fixtures for representative continuation cases.
  - 2-page paragraph: covered in `paginator.test.ts` (split group).
  - 3+ page paragraph: covered in `paginator.test.ts` ("paragraph spanning 3 pages").
  - paragraph after a split paragraph: covered in `paginator.test.ts`.
  - split paragraph with page number inline: covered in `pageNumbers.test.ts` (page 9→10).
  - split paragraph inside a table cell: covered in `tablePagination.test.ts` (multi-page row split).

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
- [x] Expand drift comparison beyond paragraph fragments.
  - Added `GeometryDrift` type and `geometryDriftMap: Map<string, GeometryDrift>` to
    `DriftReport`. Tracks page movement and height delta for `row`, `stack`, and
    `table-row` fragments.
  - `pageBreakChanged` now covers all tracked fragment types, not just paragraphs.
  - `driftCount` and `driftMap` remain paragraph-only — existing editor overlay and
    toolbar badge are unaffected.
  - `EditorShell` console log now shows a "layout geometry drift" sub-group when the
    Drift overlay is active and geometry drift is detected.
  - Added 4 new tests in `comparePagination.test.ts`: row height drift, table-row page
    movement, no geometry drift when matching, stack drift tracked independently.
- [x] Give table cells a stable renderer/debug fragment identity.
  - Added `"table-cell"` to `PageFragment.nodeType` union in `pagination/types.ts`.
  - Updated `paginateTableRowFull` and `paginateTableRowSplit` to push cell fragments
    with `nodeType: "table-cell"` instead of `"stack"`.
  - Updated PDF renderer: check `nodeType === "table-cell"` instead of `nodeType === "stack" && cellRenderProps`.
  - Updated DOCX renderer: separated `"table-cell"` branch from `"stack"` branch so
    regular stacks no longer rely on `parentNodeId` lookup to distinguish themselves from cells.
  - Added `"table-cell"` to `TRACKED_LAYOUT_TYPES` in `comparePagination.ts` so cell
    page movement and height drift are now reported.
  - Updated `DetectTargetInput` and `PlacementTarget` in placement types to accept
    `"table-cell" | "table-row" | "table"` (placement detection returns null for these, as expected).
  - Updated `paginator.test.ts`: cell fragment test now asserts `nodeType === "table-cell"`.
- [x] Harden page-number layout measurement.
  - Changed placeholder from `"0"` (1-digit) to `"00"` (2-digit) in `measureParagraph`.
    Covers pages 1–99; layout now reserves enough width so page 10+ never visually overflows.
  - Fixed `pushStackContents`: paragraphs inside row/stack columns were not calling
    `resolvePageNumbers`, so page numbers inside columns stayed as `"00"`. Now resolved correctly.
  - Added 2 regression tests in `pageNumbers.test.ts`: page 9→10 boundary resolves to "10",
    and narrow column (widthShare=20) passes `assertPaginatedDocument` and resolves to "1".
- [x] Define TOC overflow policy.
  - Chosen: two-pass repagination. Pass 1 paginates with estimated height; if actual
    TOC content exceeds the placeholder, Pass 2 repaginates with the corrected height
    so Y positions below the TOC are correct and no content overlaps.
  - `computeTocActualHeight` computes height from real entries (title + filtered entries).
  - `computeTocOverrides` maps nodeId → actual height for all overflowing TOC fragments.
  - `runAllSections` helper extracted so both passes share the same section-loop logic.
  - `TOC_TITLE_FS`, `TOC_TITLE_LH`, `TOC_TITLE_AFTER` exported from `layout/flow.ts` and
    imported in `paginator.ts` (removed duplicate local constants in `fillTocFragments`).
  - `tocHeightOverrides?: Map<string, number>` threaded through `flowSection`, `flowNode`,
    `flowVerticalContainer`, `flowRow` so the corrected height reaches `case "toc"`.
  - 6 tests in `tocOverflow.test.ts`: no-overflow single-section, overflow grows fragment
    height, lines don't exceed fragment bottom, entries have correct page numbers after
    pass 2, assertPaginatedDocument passes, exact-match single-entry no-overflow.
- [x] Extend table row splitting from two-slice to multi-page loop.
  - Replaced `pushCellFirstSlice`/`pushCellSecondSlice` with `pushCellSlice(from, to)` — general
    function that places cell content between any two split points.
  - Replaced `computeSplitPoint` with `computeSplitPointFrom(from)` — computes the next split
    from a given offset, enabling iterative page placement.
  - Rewrote `paginateTableRowSplit` as a loop: each iteration places one page's slice of the row,
    computes the next split point, and advances until all content is placed.
  - Fixed `paginateTable` condition: `!doesntFit && !tooTallForOnePage` now triggers split for
    rows taller than one content page even when starting at contentTop.
  - Fixed `pushTableCellContents`: table cell paragraphs now call `resolvePageNumbers` (same bug
    as `pushStackContents` fixed earlier).
  - Covered in `tablePagination.test.ts`: 3-page split produces 3+ page fragments, total
    line count preserved, ascending page order, full and continuation line
    metadata, assertPaginatedDocument passes, 2-page regression.
  - Rowspan-linked groups remain conservative (whole-group approach B, no intra-group split).
- [x] Add renderer contract checks around fragment coverage.
  - Added "renderer input contract" describe block in `renderer.test.ts` (5 tests):
    - row/stack/paragraph fragment kinds all present in paginated input
    - split paragraph (80 lines) produces ≥2 fragments on different pages
    - split fragments are ordered by ascending pageIndex
    - PDF renderer handles split fragments without throwing
    - DOCX renderer handles split fragments without throwing
  - Tests assert on the paginated document structure before the renderer runs,
    catching dropped or merged fragment types at the pagination layer.
- [x] Keep checklist status synchronized with implementation status.
  - Updated "Add pagination golden fixtures" wording: paragraphs now split by lines,
    not whole-block move; test count updated to 23.
  - Updated renderer smoke test count from 11 to 16.
  - Updated table fragment relationship description to use `nodeType="table-cell"`.
  - Marked Stage 3 (keepWithNext done, keepTogether deferred) and Stage 5 (basic
    table-cell continuation done) as complete.
  - Marked renderer contract tests and DOCX limitation items as complete.
  - Marked golden continuation fixtures as complete.
- [x] Add table editing contract before deeper cross-page table work.
  - Added `docs/TABLE_EDITING_CONTRACT.md` to define table ownership, authored
    table model rules, editor cell selection behavior, editable props, row/column
    operation expectations, pagination-related table props, and verification bar.
  - Linked the contract from `docs/LAYOUT_ENGINE_SPEC.md`,
    `docs/CROSS_PAGE_BEHAVIOR.md`, and product scenario documentation.
  - Documented that column insert/delete are not implicit table resize actions:
    insertion preserves total width by splitting a column, and deletion preserves
    total width by transferring width to a neighbor.

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
  - Covered in `tablePagination.test.ts`: baseline no-header, header repeats on
    every page, header starts at contentTop, content below header, fragment order,
    and product fixtures exercise repeated headers in customs-style tables.
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
  - 6 tests in `keepWithNext.test.ts`: baseline without flag, heading moves with
    next sibling, stays on page 1 when fits, no-loop guard, multiple headings,
    and the report-keep-with-next product fixture.
- [x] Widow/orphan control. → done as Stage 2 (Policy Stages section above).
- [ ] Page templates with richer header/footer flows.
- [x] Basic page numbering (inline `pageNumber` node).
  - Added `PageNumberInline` schema in `inline.ts`. Paragraph children can include
    `{ type: "pageNumber" }` nodes.
  - `measureParagraph` uses `"00"` as a 2-digit placeholder for layout measurement;
    tracks `pageNumberRanges` to classify segments as `kind: "pageNumber"`.
  - `paginateParagraph` calls `resolvePageNumbers(lines, pageIndex + 1)` after
    placing each fragment — substitutes placeholder with the actual page number
    string in both line text and segment text.
  - Works in both fast-path (whole paragraph fits) and split-path (multi-page).
  - Also resolved in `pushStackContents` (row/stack columns) and
    `pushTableCellContents` (table cells) — previously these paths never called
    `resolvePageNumbers` and left page numbers as the placeholder string.
  - 7 tests in `pageNumbers.test.ts`: resolves to "1" on page 1, "2" on page 2,
    multiple nodes, prefix text preserved, standalone node, page 9→10 boundary,
    narrow column assertPaginatedDocument.
- [x] Section-level page numbering and restart rules.
  - Added `pageNumberStart?: number` to `PageSettingsSchema` / `PageSettings`. When set,
    the section's display page numbers restart at that value instead of continuing
    from the global page index.
  - `pageNumberOffset = pageNumberStart - startPageIndex - 1` is computed in
    `paginateSection` and stored on `PageFlowCursor`. All five `resolvePageNumbers`
    call sites now use `pageIndex + 1 + pageNumberOffset` so inline `pageNumber`
    nodes resolve to the section-local display number.
  - `pageNumberOffset` threaded through `advancePage`, `pushStackContents`,
    `pushTableCellContents`, and `pushCellSlice` (all default to 0 when absent).
  - **Bug fixed**: `paginateSection` now densifies the section-local `pages` array
    before returning. Previously, non-first sections (startPageIndex > 0) stored
    pages at global array indices, leaving sparse holes at the front. This caused
    crashes when iterating pages and incorrect first-page header detection.
  - 5 tests in `sectionPageNumbers.test.ts`: global numbering continues across
    sections (default), restart at 1 on second section, pageNumberStart=5 on first
    section, explicit pageNumberStart=1 same as default, assertPaginatedDocument
    passes.
- [x] Multi-section export smoke and DOCX structure tests.
  - 14 tests in `renderer/__tests__/multiSection.test.ts` covering:
  - **Pagination structure**: two-section document produces two `PaginatedSection`s,
    each section's pages array is dense (no sparse holes), page number restart
    displays correct inline numbers, TOC + content section fills TOC entries,
    3-section document passes `assertPaginatedDocument`.
  - **PDF smoke**: two-section, TOC + content section (ASCII title — Helvetica
    fallback cannot encode Thai), page number restart section — all produce valid
    `%PDF` header without throwing.
  - **Product fixtures**: report cover/TOC/body pagination and report DOCX
    structure fixture covering cover, TOC, body section boundaries, and editable
    body text in `word/document.xml`.
  - **DOCX smoke + structure**: two-section, TOC + content section — both
    produce valid PK ZIP header without throwing. DOCX XML structure tests also
    assert that two FlowDoc sections emit two Word section properties and a
    multi-page FlowDoc document emits one Word section per paginated page.
  - All renderer tests use ASCII text (Helvetica fallback); Thai-text scenarios
    are covered in pagination-only tests.
- [ ] Visual regression tests for representative document fixtures.

## Open Questions

- [x] Should a row split when one stack overflows, or should the whole row move
  when possible? → Whole row moves when possible. Overflow without split is the
  documented behavior for rows taller than a page. Covered by 12 tests in
  `rowStack.test.ts`.
- [x] How should advanced table spans behave at page boundaries beyond the
  current rowspan approach B?
  - Rowspan-linked rows stay together as a unit (approach B). Covered by
    `tablePagination.test.ts`.
  - Deferred: split-at-row-boundary within a rowspan group, colspan-specific
    split behavior, and interactions with `allowBreak=true` — deferred until
    a concrete use case requires them.
- [x] Should spacers split across pages or always move whole? → Move whole.
- [x] What is the minimum pagination golden fixture set before changing
  `paginator.ts` again?
  → The current suite (274 core tests) is the minimum. Any change to
  `paginator.ts` must keep all existing tests green. High-risk areas (paragraph
  split, widow/orphan, TOC overflow, table rowspan, page numbers) each have
  dedicated test files. Adding a regression test for the specific behavior being
  changed is required before the change lands.
- [x] Which layout differences are acceptable for DOCX versus PDF/editor preview?
  → Documented in "Document DOCX layout limitations" checklist item. Summary:
  DOCX is an exchange format — structural correctness is the goal, not visual
  fidelity. Pagination, font metrics, line breaking, and column layout will
  differ from PDF/editor preview when opened in Word/LibreOffice. This is
  intentional and accepted.

## Cross-Page & Table Editing Improvements

These items address UX issues discovered during real document editing.

- [ ] Harden split-paragraph inline editing UX. [OPEN]
  - Root cause: entering edit mode triggers immediate browser re-pagination.
    Browser measurer may compute fewer lines than fontkit (drift) → paragraph
    appears to collapse onto one page momentarily, then server pagination
    corrects it back → visible flicker/blink.
  - Fix 1 (done): removed `inlineEditNodeId` from full browser pagination effect
    deps → entering edit mode no longer triggers re-pagination.
  - Fix 2 (done): `inlineEditPageIndex` stored in EditorShell; passed through
    EditorCanvas → PageView; `isInlineEditing` checks pageIndex so only the
    clicked fragment enters edit mode (not all fragments of the split paragraph).
  - Fix 3 (done): local reflow skips split paragraphs (isSplitParagraph guard).
  - Fix 4 (done): continuation fragments use `fullText.slice(continuationCharStart)`
    as textarea value and adjust `initialCaretIndex` to be relative to the slice.
    Live text overlay disabled for continuation fragments.
  - Current status: improved but not fully closed. Later inline-edit undo/layout
    work stabilized normal paragraph edit/undo behavior, but continuation-fragment
    caret positioning and split-fragment editing still need focused browser
    validation before this item should be marked complete.

- [x] Change default `allowBreak` to `true` for table rows.
  - Single-row groups (no rowspan) will split at line boundaries by default
    instead of jumping as a whole block to the next page.
  - Rowspan groups are unaffected — approach B keeps them together regardless
    of `allowBreak`.
  - Explicit `allowBreak=false` remains available for authored keep-together rows.
  - Added regression tests: default single-row group splits across pages; explicit
    `allowBreak=false` still moves whole when it fits on the next page.

- [x] Live text preview in table cell during inline editing.
  - Fixed by making editor paragraph lookup search both section-level nodes and
    table-internal `table.nodes`.
  - `ParagraphTextSurface` now opens table-cell paragraph editors with the
    existing text instead of an empty textarea.
  - `EditorShell` local reflow now finds table-cell paragraph nodes, while
    `findParagraphFragment` already locates their paginated paragraph fragments.
  - Slight Y-position drift remains acceptable until server pagination settles —
    same trade-off as body paragraph local reflow.

- [x] Make table cells directly editable from the canvas before cross-page table work.
  - Single-clicking text inside a table cell selects the parent `table-cell`
    instead of the inner paragraph, so the cell property panel is reachable from
    the document canvas.
  - Double-clicking a table cell opens inline editing for the first paragraph in
    that cell.
  - The table-cell property panel exposes text editing, padding, background,
    vertical alignment, row insertion/deletion, and column insertion/deletion.
  - The table property panel exposes `headerRowCount`; the row property panel
    exposes `allowBreak`.
  - Browser-checked selecting a cell, editing cell text, inserting a column, and
    deleting a column without layout errors.
