# Text Engine Checklist

This checklist tracks the current text engine foundation, near-term work, and
future directions. It should stay focused on shared core behavior, not
editor-only shortcuts.

## Already In Place

- [x] Shared `TextMeasurer` contract.
- [x] Shared `WordBreaker` contract.
- [x] Server/API pagination path uses fontkit measurement.
- [x] Server/API pagination path uses `Intl.Segmenter` through `thaiWordBreaker`.
- [x] Default project font is routed through the shared font registry.
- [x] Paragraph measurement returns measured lines.
- [x] Pagination returns renderer-facing `PaginatedLine` output.
- [x] Editor preview renders from `PaginatedDocument` instead of CSS flow.
- [x] Inline editing surface exists for paragraphs.
- [x] Optional `LineSegment` scaffold exists on measured and paginated lines.
- [x] Text reflow direction is documented in `docs/TEXT_REFLOW_PLAN.md`.

## Near-Term Checklist

- [x] Populate `LineSegment` data in `measureParagraph`.
- [x] Preserve source offsets for each line and segment.
- [x] Classify segments as `word`, `space`, `field`, or `grapheme`.
- [x] Add grapheme fallback for over-wide segments so long unbroken text wraps.
- [x] Use segment data for paragraph caret hit testing instead of line-width ratios.
- [x] Make inline editing spacing and displayed line spacing continue to converge.
- [x] Add focused fixtures for Thai, English, mixed Thai/English, numbers, and long unbroken text.
- [x] Add golden checks for paragraph wrapping at fixed widths.
- [x] Add debug visualization for line segments and break points.
- [ ] Keep server/export pagination authoritative while browser preview catches up.
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
    - 8 tests: no-drift, +/- line delta, page movement, split-page aggregation,
      non-paragraph ignored, totalParagraphs count. Root vitest.config.ts added.
  - [x] Add soft/hard reflow rules for wrap and page-break risk during typing.
    - Soft event (line count unchanged): patch only active paragraph lines,
      no surrounding layout change.
    - Hard event (line count changes): run full browser pagination immediately
      (0ms) so fragments below shift without waiting for 200ms debounce.
  - [x] Reset soft/hard line-count tracking for every inline edit session.
    - Refs reset to null when inlineEditNodeId becomes null, so re-entering
      the same paragraph starts fresh with no stale line-count state.

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
- [ ] Add PDF/DOCX smoke tests that compare expected text flow behavior.
- [x] Build paragraph-local reflow for typing, delete, and resize previews.
- [ ] Add incremental reflow from the edited line forward.

## Open Questions

- [x] Should text offsets use UTF-16 indices, Unicode code points, or grapheme indices? → UTF-16 (matching textarea); grapheme snapping applied at caret layer.
- [ ] How should `fieldRef` offsets map when the display value differs from the template placeholder?
- [x] How much temporary browser preview drift is acceptable during active typing?
  → Measured: zero drift for normal content. Only grapheme fallback and exact
    boundary cases drift. Acceptable for current use cases.
- [ ] Should resize previews reflow only the active paragraph or also nearby paragraphs?
- [ ] What is the minimum golden fixture set before changing line breaking behavior again?
