# Text Reflow Plan

This note captures the intended direction for paragraph editing, resizing, and
line reflow. The goal is to make interactive editing feel close to the shared
layout engine without turning `DocumentNode` into a render cache.

Current implementation status is tracked in `docs/TEXT_ENGINE_CHECKLIST.md`.
Project-wide test level guidance lives in `docs/TEST_STRATEGY.md`.

## Core Rule

`DocumentNode` stores authored content only. It must not store computed line
positions, word widths, caret geometry, or resize previews.

Line and segment positions belong to measured or paginated layout output:

```txt
DocumentNode paragraph children
  -> measureParagraph
  -> MeasuredLine + LineSegment
  -> PaginatedLine + LineSegment
  -> editor / PDF / DOCX renderers
```

## Three Reflow Detail Levels

Interactive text work can use different precision depending on distance from
the active edit point.

1. Near caret or pointer:
   - Highest detail.
   - Needs caret hit testing, grapheme or cluster positions, and current-line
     editing feedback.

2. Lines after the edited line:
   - Medium detail.
   - Reflow enough lines to make text move naturally after insert/delete/resize.
   - Can use measured line segments and offsets instead of full glyph data.

3. Farther paragraph or document content:
   - Coarse detail.
   - Word or segment widths are enough for rough reflow until authoritative
     pagination confirms the final output.

## Segment Contract

`LineSegment` is a layout result for future editor work:

```ts
interface LineSegment {
  text: string
  start: number
  end: number
  x: number // relative to the start of the visual line
  width: number
  kind: "word" | "space" | "field" | "grapheme" | "pageNumber"
  breakableAfter: boolean
}
```

Expected future uses:

- caret hit testing
- selection range mapping
- paragraph-local reflow after typing or delete
- column/row resize preview
- debug visualization of line breaking decisions

## Staged Implementation

1. Add optional segment fields to measured and paginated lines. Done.
2. Populate segments from the existing word breaker and text measurer. Done.
3. Add grapheme fallback for over-wide segments so long unbroken text can wrap. Done.
4. Use segment offsets for caret hit testing instead of line-width ratios. Done.
5. Use the inline textarea as the active edit surface while tracking local
   height/geometry, then reconcile measured lines through browser/server
   pagination after edit settle/exit. Current behavior.
6. Move browser measurement toward the same font-aware path as server/export.

## Open Questions

- How should inline `fieldRef` map into segment offsets when it resolves to
  display text but remains a template placeholder?

Resolved:

- Segment offsets use UTF-16 indices to match textarea selection APIs. Grapheme
  snapping happens at the caret layer.
- Browser-side preview drift is acceptable only as measurable temporary
  interaction drift. Current observed drift is zero for normal content and
  limited to grapheme fallback / exact-boundary cases; authoritative
  server/export pagination remains the final layout truth.
