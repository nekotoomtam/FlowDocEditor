# WYSIWYG Editor Roadmap

This document describes the future WYSIWYG inline editing track. It is a staged
plan, not the default editing behavior yet.

The goal is to move from the current textarea-assisted hybrid editor toward an
editor where text, caret, and selection are drawn from the same paginated visual
model as normal document rendering.

## Core Decision

- `PaginatedLine` and `fragment.lines` are visual truth.
- `draftText` is input truth while an inline edit session is active.
- The textarea is an input device and fallback surface, not the layout source.
- Server pagination remains authoritative for settled/export layout.
- The WYSIWYG track must stay opt-in/internal until its stability gates pass.

## Guardrails

- Do not change `DocumentNode` schema for WYSIWYG geometry.
- Do not make textarea layout authoritative.
- Do not change paginator, export, PDF, DOCX, or server behavior as part of the
  first WYSIWYG milestones.
- Keep fallback-to-textarea available for composition, IME, or unstable states.
- Selection is not part of the first custom caret milestone.
- Cross-page selection waits until single-page paragraph selection is stable.
- Caret candidates are not the same thing as line segments.

## Stage 0: Stabilize Current Hybrid

Keep the existing textarea input surface usable and predictable.

- Entering edit should not visibly jump.
- Typed text must not disappear.
- Pointer-only caret placement should not expose textarea layout drift.
- Text input, keyboard commands, and composition may lock to visible textarea
  text until edit exits.
- Blur/commit returns to normal SVG rendering.
- Undo remains one edit session.

## Stage 1: Visual Truth Contract

Define the WYSIWYG data contract before adding a custom caret.

- Visual source: `PaginatedLine` / `fragment.lines`.
- Input source: `draftText`.
- Caret state: paragraph-local UTF-16 offset.
- Selection state: paragraph-local offset range, deferred for first caret work.
- Visual freshness: rendered lines must be tied to the current draft version.
- Textarea geometry must not become document or layout truth.

## Stage 2: Caret Mapping Contract

This is the key foundation for caret, hit testing, selection, and cross-page
editing.

Initial internal helper:

- `src/app/editor/_components/wysiwygCaretMapping.ts`
- This helper is not wired into default editor interaction yet.
- It exists so caret mapping behavior can be tested before custom caret UX is
  enabled.

Define:

- paragraph offset: UTF-16 offset into the full paragraph text.
- fragment offset: paragraph offset clipped to a paginated fragment range.
- line offset: paragraph offset clipped to one `PaginatedLine`.
- caret candidate: a valid caret stop derived from text boundary logic and
  measured line geometry.
- offset to position: map a paragraph offset to page, fragment, line, x, y, and
  height.
- point to offset: map a visual point to the nearest valid paragraph offset.
- coordinate space: hit testing uses page-local document coordinates, then maps
  into fragment/line coordinates.

Line segments can narrow the search range, but final caret stops need a
separate candidate resolver so Thai marks, emoji, ligatures, and zero-width
joiners do not split incorrectly.

Composition-safe rule:

- While IME/composition is active, native textarea behavior may stay visible.
- Custom caret/overlay logic must not block browser composition UI.

## Stage 3: Collapsed Custom Caret

Draw only the collapsed caret first.

Initial internal helper:

- `resolveCollapsedCaretOverlayInFragment(...)`
- `resolveParagraphCollapsedCaretOverlay(...)`
- These helpers return page-local line geometry for a collapsed caret.
- The default editor now renders the collapsed custom caret for plain paragraph
  inline editing when the active visual snapshot is fresh, the textarea
  selection is collapsed, and composition is not active.

- Use the caret mapping contract for offset to position.
- Draw an SVG caret over paginated text.
- Keep the textarea focused for input, IME, keyboard, and clipboard basics.
- Do not implement selection highlight yet.
- Fall back to visible textarea text during composition or mapping uncertainty.
- Fall back to visible textarea text and the native textarea caret when the
  custom caret cannot be resolved from current `fragment.lines` geometry.

## Stage 4: Hit Testing Activation

Let clicks on SVG text set `caretIndex`.

Initial activation:

- `EditorCanvas` uses `resolveCaretOffsetFromPointInFragment(...)` for
  paragraph pointer hit testing.
- Pointer hit testing passes the editor browser text measurer into the mapping
  helper so click-to-caret uses the same measurement source as preview
  pagination and custom caret placement.
- The older line-width ratio fallback remains available when segment geometry
  is missing.

- Use point to offset mapping.
- Start with one paragraph and page-local coordinates.
- Use fragment ranges for split paragraphs.
- Point-to-offset mapping should compare the click point against measured
  grapheme-safe caret candidates, not infer text offsets from a segment-width
  ratio. This keeps variable-width glyphs, Thai marks, emoji, and ZWJ sequences
  from drifting toward invalid or visibly wrong caret stops.
- Do not implement drag selection yet.

## Stage 5: Selection Overlay

Draw selection highlight from paragraph offset ranges.

Initial internal helper:

- `resolveSelectionOverlayRectsInFragment(...)`
- `resolveParagraphSelectionOverlayRects(...)`
- These helpers return page-local highlight rectangles, but drag selection,
  clipboard behavior, and visible editor highlights are still deferred.

- Start with a single-page paragraph.
- Then support multi-line within a paragraph.
- Then support split fragments across pages.
- Keep clipboard/cut behavior conservative until the highlight model is stable.

## Stage 6: IME, Clipboard, And Accessibility Hardening

Harden real-world text input behavior.

Initial internal helper:

- `src/app/editor/_components/wysiwygTextInteraction.ts`
- Native textarea fallback reasons are explicit: composition, clipboard,
  accessibility, stale visual state, and missing geometry.
- Current key handling can be classified without changing default textarea
  behavior.
- Textarea selection snapshots can be converted into full paragraph UTF-16
  offsets for continuation fragments.
- Copy, cut, and paste remain native by default.

- Composition update and composition end behavior.
- Thai and combined grapheme caret stops.
- Copy, cut, paste, and selected text replacement.
- Keyboard selection shortcuts.
- Screen reader and focus expectations.
- Explicit fallback rules for unsupported cases.

## Stage 7: Hidden Input Mode

Only after the earlier stages are stable, reduce textarea to a mostly invisible
input layer.

- SVG is visual truth for text, caret, and selection.
- Textarea remains available for input, IME, clipboard, and accessibility where
  needed.
- Visible textarea fallback remains allowed during composition or unstable
  states.
