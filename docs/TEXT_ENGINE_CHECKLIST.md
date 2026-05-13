# Text Engine Checklist

This checklist tracks the current text engine foundation, near-term work, and
future directions. It should stay focused on shared core behavior, not
editor-only shortcuts.

For the product-level direction, see `docs/PRODUCT_DIRECTION.md`. For test and
QA level guidance, see `docs/TEST_STRATEGY.md`.

## Already In Place

- [x] Shared `TextMeasurer` contract.
- [x] Shared `WordBreaker` contract.
- [x] Server/API pagination path uses fontkit measurement.
- [x] Server/API pagination path uses `Intl.Segmenter` through `thaiWordBreaker`.
- [x] Default project font is routed through the shared font registry.
  - Runtime source of truth: `public/fonts/THSarabun.ttf`.
  - Server/API loads from `process.cwd()/public/fonts/...`; browser CSS loads
    from `/fonts/...`.
  - Do not depend on `src/fonts/THSarabun.ttf` unless the font loading contract
    is intentionally changed.
- [x] Paragraph measurement returns measured lines.
- [x] Pagination returns renderer-facing `PaginatedLine` output.
- [x] Editor preview renders from `PaginatedDocument` instead of CSS flow.
- [x] Inline editing surface exists for paragraphs.
- [x] Optional `LineSegment` scaffold exists on measured and paginated lines.
- [x] Text reflow direction is documented in `docs/TEXT_REFLOW_PLAN.md`.

## Near-Term Checklist

- [x] Populate `LineSegment` data in `measureParagraph`.
- [x] Preserve source offsets for each line and segment.
- [x] Classify segments as `word`, `space`, `field`, `grapheme`, or `pageNumber`.
- [x] Add grapheme fallback for over-wide segments so long unbroken text wraps.
- [x] Use segment data for paragraph caret hit testing instead of line-width ratios.
- [x] Make inline editing spacing and displayed line spacing continue to converge.
- [x] Add focused fixtures for Thai, English, mixed Thai/English, numbers, and long unbroken text.
- [x] Add golden checks for paragraph wrapping at fixed widths.
- [x] Add debug visualization for line segments and break points.
- [x] Keep server/export pagination authoritative while browser preview catches up.
  - Server/API pagination is the layout truth for export and final page
    settling.
  - Browser pagination and paragraph-local reflow are temporary interaction
    previews only.
  - Any mismatch between browser preview and server pagination should be treated
    as measurable layout drift, not as a second source of truth.
  - [x] Editor preview now reconciles back to `/api/paginate` after debounce,
    while local/browser pagination keeps interaction responsive.
  - [x] Add drift comparison between browser and server paginated output.
    - Drift overlay added (toolbar "Drift" button). Orange = server wraps more,
      blue = server wraps fewer. Console log lists drifted paragraphs.
    - Observed: normal Thai/English text with spaces → zero drift. Drift only
      appears on unbreakable long text (grapheme fallback path) and exact
      boundary cases. Does not occur in typical ใบขน/report content.
    - Conclusion: fontkit-in-browser is not urgent. Defer until real drift is
      observed in production content.
  - [x] Make drift comparison robust for paragraphs split across pages.
    - Aggregate line counts and heights across all fragments with the same
      `nodeId` instead of keeping only one fragment snapshot.
    - Track per-node page lists so page movement can be reported separately
      from line-count changes.
  - [x] Show page-break-only drift in the editor overlay.
    - Page movement visible even when line counts match: purple overlay + "PG"
      badge. Orange (+L), blue (-L) remain for line-count drift.
  - [x] Add focused tests for `comparePagination`.
    - Covered by `comparePagination.test.ts`: no-drift, +/- line delta, page
      movement, split-page aggregation, non-paragraph handling, and
      totalParagraphs count. Root vitest.config.ts added.
  - [x] Add soft/hard reflow risk tracking during typing.
    - Current editor interaction truth is the native textarea while inline edit
      is active.
    - The editor measures line-count risk and shifts fragment geometry for live
      height changes; it does not patch measured paragraph lines during active
      inline editing.
    - Full browser/server pagination is deferred until the inline edit settles
      or exits, then reconciles back to authoritative layout.
  - [x] Reset soft/hard line-count tracking for every inline edit session.
    - Refs reset to null when inlineEditNodeId becomes null, so re-entering
      the same paragraph starts fresh with no stale line-count state.


## Recheck Addendum — Text Measurement Boundary

- [x] Make server font loading observable.
  - `/api/paginate` logs `console.error` and sets `X-FlowDoc-Font: fallback` header
    when the default font is missing.
  - `/api/export` now also sets `X-FlowDoc-Font: fallback` header when font is
    missing, matching paginate route behavior. Previously export fell back silently
    with no observable signal to the caller.
- [x] Add drift fixtures for Thai/page-boundary cases.
  - Covered by the "Thai-specific and near-boundary" describe block in
    `drift.test.ts`:
    - Thai + English mixed text crosses line boundary (browser 1 line, server 2 lines).
    - Long unbroken Thai token (140 chars): browser 2 lines vs server 3 lines via grapheme fallback.
    - Thai paragraph stays on page 0 with browser but drifts to page 1+ with server.
    - Thai + digits mixture drifts at line boundary.
  - Tests use mock measurers (browser=narrower, server=wider) consistent with existing drift tests.
    No real font needed; all cases are deterministic.
  - Level 2 real-font coverage is now covered by
    `src/app/editor/_components/__tests__/realFontDrift.test.ts`:
    - loads runtime `public/fonts/THSarabun.ttf` into Chromium canvas and
      fontkit from the same font bytes.
    - checks representative Thai/mixed/long-token width parity within a
      sub-point tolerance.
    - paginates a representative Thai document through browser-canvas metrics
      and server fontkit metrics, then asserts `comparePagination` reports no
      line, page-break, continuation, or geometry drift.
    - skips only when the Playwright Chromium runtime is unavailable. Missing
      runtime font is covered by non-skipped font contract/export tests.
- [x] Separate preview drift from authoritative failure.
  - Server/export `assertPaginatedDocument` failure returns HTTP 500 and blocks export;
    already done in `/api/paginate` and `/api/export`.
  - Added `fontFallback` state in `EditorShell`: set when server responds with
    `X-FlowDoc-Font: fallback` header. Shows amber "⚠ fallback font" indicator in
    the toolbar so the user knows Thai layout may be incorrect.
  - Added `layoutError` state: set when `/api/paginate` returns non-OK status.
    Shows red "⚠ layout error" indicator in the toolbar. Cleared on next successful
    server pagination. Editor continues showing browser preview in this state.

## Important Design Rules

- [ ] Do not store line positions, segment widths, or caret geometry in `DocumentNode`.
- [ ] Keep computed text layout in measured/paginated output.
- [ ] Keep field values out of template text; unresolved templates should keep `fieldRef`.
- [ ] Treat `fieldRef` as a future segment type, not just plain text.
- [ ] Prefer shared core line-breaking rules over editor-only wrapping behavior.
- [ ] Document any preview drift between browser/editor and server/export.
- [ ] Do not let browser canvas measurement become an independent layout truth.
- [ ] Reconcile interactive preview back to server/API pagination after idle,
  blur, or before export.

## Later Work

- [ ] Introduce shaped text runs as a separate contract from plain measured lines.
- [ ] Track glyph or cluster positions for accurate caret and selection.
- [ ] Add baseline, ascender, and descender metrics.
- [ ] Support per-run fonts and fallback fonts.
- [ ] Move browser/editor measurement toward the same font-aware path as server/export.
- [ ] Consider a Web Worker for browser-side layout.
- [ ] Consider HarfBuzz/WASM only after the current fontkit + segment contracts become limiting.
- [x] Add PDF/DOCX smoke tests that compare expected text flow behavior.
  - Covered by `renderer/__tests__/textFlow.test.ts`:
  - **Line content**: short text → 1 line preserved, hard newlines → correct text per
    line, long text wraps (text preserved across lines), empty paragraph → 1 empty line.
  - **Spacing**: spacingBefore/After add to fragment height, spacingBefore shifts first
    line y, two-paragraph stacking with spacingAfter is contiguous.
  - **Alignment**: alignment offset baked into `line.x` by `buildPaginatedLines` — left
    x = contentX, right x = contentX + width - textWidth, center x = midpoint offset.
    `lineVisualLeft` / `lineX` in EditorCanvas + ParagraphTextSurface simplified to use
    `line.x` as base. renderProps still carries alignment for DOCX paragraph style.
  - **Column layout**: two-column x positions, fragment widths, and line x in left
    column all correct; assertPaginatedDocument passes.
  - **Renderer smoke**: PDF (%PDF) and DOCX (PK) for spacing+alignment, wrapped text,
    two-column, hard-newline documents — all render without throwing.
- [x] Build paragraph-local edit preview for typing, delete, and resize.
  - Current production behavior uses the inline textarea as the active visual
    text surface and updates local fragment height/geometry while editing.
  - Measured line output is reconciled by browser/server pagination after the
    edit settles or exits.
- [x] Add `measureParagraphFrom` as a core helper and test it.
  - Added `measureParagraphFrom(node, fromOffset, width, measurer, wb)` to
    `layout/measure.ts`. Refactored shared text-building logic into
    `buildParagraphFullText` and `measureHardLines` helpers. `measureHardLines`
    skips hard lines ending before `fromOffset`, then measures only from the
    containing hard line onward with correct `offsetBase`.
  - Earlier editor code used this helper to patch active paragraph lines; the
    current editor no longer uses that path during inline editing because the
    textarea owns active wrapping/caret behavior.
  - Covered by the `measureParagraphFrom` describe block in `measure.test.ts`:
    fromOffset=0 equals full measurement, fromOffset in second hard line starts
    from Beta, segment offsets reference original full text, lineHeight matches,
    fromOffset past all content returns empty tail.

## Open Questions

- [x] Should text offsets use UTF-16 indices, Unicode code points, or grapheme indices? → UTF-16 (matching textarea); grapheme snapping applied at caret layer.
- [ ] How should `fieldRef` offsets map when the display value differs from the template placeholder?
  → Deferred until fieldRef rendering is built. Current assumption: `fieldRef` is
  a single segment whose measured width uses the placeholder text length. When
  the resolved value is longer/shorter, the layout will differ — this is a known
  limitation that will need a two-pass approach or pre-resolved measurement.
- [x] How much temporary browser preview drift is acceptable during active typing?
  → Measured: zero drift for normal content. Only grapheme fallback and exact
    boundary cases drift. Acceptable for current use cases.
- [x] Should resize previews reflow only the active paragraph or also nearby paragraphs?
  → Active paragraph only (current behavior). The inline edit surface updates the
  active fragment's live height/geometry; measured lines and surrounding layout
  reconcile after browser/server pagination settles.
- [x] What is the minimum golden fixture set before changing line breaking behavior again?
  → The current measure, drift, and paginator split fixtures are the minimum.
  Any change to `measureParagraph` or `wrapLines` must keep existing measure
  tests green. High-risk cases (Thai, mixed Thai/English, grapheme fallback,
  hard newlines, segment offsets) each have dedicated fixtures.
