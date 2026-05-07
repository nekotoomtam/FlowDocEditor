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
- [ ] Add focused fixtures for Thai, English, mixed Thai/English, numbers, and long unbroken text.
- [ ] Add golden checks for paragraph wrapping at fixed widths.
- [x] Add debug visualization for line segments and break points.
- [ ] Keep server/export pagination authoritative while browser preview catches up.

## Important Design Rules

- [ ] Do not store line positions, segment widths, or caret geometry in `DocumentNode`.
- [ ] Keep computed text layout in measured/paginated output.
- [ ] Keep field values out of template text; unresolved templates should keep `fieldRef`.
- [ ] Treat `fieldRef` as a future segment type, not just plain text.
- [ ] Prefer shared core line-breaking rules over editor-only wrapping behavior.
- [ ] Document any preview drift between browser/editor and server/export.

## Later Work

- [ ] Introduce shaped text runs as a separate contract from plain measured lines.
- [ ] Track glyph or cluster positions for accurate caret and selection.
- [ ] Add baseline, ascender, and descender metrics.
- [ ] Support per-run fonts and fallback fonts.
- [ ] Move browser/editor measurement toward the same font-aware path as server/export.
- [ ] Consider a Web Worker for browser-side layout.
- [ ] Consider HarfBuzz/WASM only after the current fontkit + segment contracts become limiting.
- [ ] Add PDF/DOCX smoke tests that compare expected text flow behavior.
- [ ] Build paragraph-local reflow for typing, delete, and resize previews.
- [ ] Add incremental reflow from the edited line forward.

## Open Questions

- [ ] Should text offsets use UTF-16 indices, Unicode code points, or grapheme indices?
- [ ] How should `fieldRef` offsets map when the display value differs from the template placeholder?
- [ ] How much temporary browser preview drift is acceptable during active typing?
- [ ] Should resize previews reflow only the active paragraph or also nearby paragraphs?
- [ ] What is the minimum golden fixture set before changing line breaking behavior again?
