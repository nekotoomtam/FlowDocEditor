# Rich Text Spec

Status: Phase 0/1 foundation. The current codebase already stores paragraph
content as `paragraph.children`; the first rich-text slice extends `TextRun`
with optional style metadata without enabling user-facing range editing yet.

This document defines the rich-text overhaul for FlowDocEditor. Paragraph text
uses an ordered `children` array of inline nodes. Rich text adds per-run style
to text children, then later teaches layout, pagination, WYSIWYG editing,
PDF/DOCX, and UI controls to honor those run styles.

Use this document together with:

- `docs/RICH_TEXT_DRAFT_DECISION.md` — draft state decision before pending
  style, rich paste, and inline-object editing
- `docs/FLOW_TABLE_SPEC.md` — slice/Phase pattern this spec follows
- `docs/EDITOR_UX_CONTRACT.md` — editor selection and inline edit invariants
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md` — Stage 3/4 text engine that Phase 3
  extends
- `docs/EXPORT_RENDERER_CONTRACT.md` — renderer ownership
- `docs/CROSS_PAGE_BEHAVIOR.md` — paragraph split policy that must keep working
- `docs/TEST_STRATEGY.md` — verification levels per slice

## Decisions Summary

| # | Decision | Choice |
|---|---|---|
| 1 | Schema shape | Current `paragraph.children: InlineNode[]`; text nodes use optional nested `style?: TextRunStyle` |
| 2 | Styles supported in first foundation | fontSize, fontFamilyKey, textColor, fontWeight, fontStyle, textDecoration, strikethrough |
| 3 | Inheritance | Paragraph props are defaults; `TextRun.style` fields override only the fields they define |
| 4 | Edit UX | Extend Stage 4 SVG-based bridge later; styled runs are excluded from the plain textarea rewrite lane until range editing exists |
| 5 | Migration | No `paragraph.text` migration is needed in the current model; existing unstyled runs remain valid |
| 6 | Heading | Marker (`headingLevel`) + system default style map + paragraph/run override |
| 7 | Fonts | Sarabun (default) + Noto Sans Thai selectable from the active font catalog |
| 8 | Paste default | Deferred; current clipboard path remains plain text until range editing is implemented |
| 9 | Toolbar | Deferred; start with fixed controls for selection, floating mini bar later |
| 10 | Undo granularity | Typing burst grouped (~300ms); style command = own entry |
| 11 | Link UX | Deferred; link is not part of the first schema slice |

Decisions are locked at draft level. Adjustments after a Phase starts must
update this table and the related Phase section.

## Current Model And Why This Is Still A Large Change

The current paragraph model already has `paragraph.children`, with text,
`fieldRef`, and `pageNumber` inline nodes. The missing piece is that text runs
currently carry only plain text, while style lives on `paragraph.props`. That
means one paragraph can use one paragraph-level style, but cannot represent
mixed weight, size, color, or font inside the same paragraph.

Three things in the current codebase already shape the rich-text path:

- inline nodes (`pageNumber`, `fieldRef`) live next to text but in a separate
  conceptual position
- `headingLevel` stores a marker that currently still relies on paragraph-level
  font defaults
- WYSIWYG Stage 4 text engine assumes one style per paragraph in selection
  overlay geometry

This is not a big-bang rewrite. The first patch keeps existing documents valid,
adds optional `TextRun.style`, and prevents styled runs from being rewritten by
the plain-text edit bridge.

## Authored Schema

### Paragraph

```ts
type ParagraphNode = {
  type: "paragraph"
  id: string
  props: ParagraphProps
  children: InlineNode[]
}

type ParagraphProps = {
  align: "left" | "center" | "right" | "justify"
  fontSize: UnitValue
  fontFamilyKey?: string
  textColor?: string
  fontWeight?: "normal" | "bold"
  fontStyle?: "normal" | "italic"
  textDecoration?: "none" | "underline"
  strikethrough?: boolean
  lineHeight: number
  spacingBefore: UnitValue
  spacingAfter: UnitValue
  textIndent: UnitValue
  indentLeft: UnitValue
  indentRight: UnitValue
  headingLevel?: 1 | 2 | 3
}
```

### Text node

```ts
type TextRun = {
  type: "text"
  id: string
  text: string
  style?: TextRunStyle
}

type TextRunStyle = {
  fontSize?: UnitValue
  fontFamilyKey?: string
  textColor?: string
  fontWeight?: "normal" | "bold"
  fontStyle?: "normal" | "italic"
  textDecoration?: "none" | "underline"
  strikethrough?: boolean
}
```

`type: "text"` is required so the array stays polymorphic with inline nodes
without a separate `runs` lane. A missing `style` means the run inherits the
paragraph defaults.

### Inline nodes

Existing inline nodes keep their shape. They live in the same `children` array
as text nodes.

```ts
type InlineNode =
  | TextRun
  | PageNumberInline
  | FieldRefInline
```

Pages and field refs keep their current shape. Link is deferred until range
selection and rich paste have a stable operation layer.

### Style cascade

Effective style at render time, in order of precedence:

1. `textRun.style` fields (highest)
2. `paragraph.props` fields
3. `DEFAULT_PARAGRAPH_PROPS` and font registry fallback

Paragraph-only fields (`align`, `lineHeight`, `spacingBefore`, `spacingAfter`,
`textIndent`, `indentLeft`, `indentRight`) are read from `paragraph.props` only
and do not appear on text runs.

### System heading default style map

Deferred. Heading defaults should be introduced only after the first run-style
foundation is stable. Candidate initial values:

```ts
{
  1: { fontSize: 24, bold: true, spacingBefore: 12, spacingAfter: 6 },
  2: { fontSize: 18, bold: true, spacingBefore: 10, spacingAfter: 5 },
  3: { fontSize: 14, bold: true, spacingBefore: 8,  spacingAfter: 4 },
}
```

Changing this map would update every heading paragraph in every document on
next load. Paragraph props or run style overrides should win.

### Normalization rules

- Adjacent text nodes with identical authored `style` merge into one text node.
- Empty text node (`text === ""`) is dropped unless it is the only child of an
  empty paragraph (kept as a single empty text node for caret position).
- Empty or malformed `style` objects are removed.
- Unknown/legacy font keys normalize through the active font registry fallback.
- `pageNumber` inline nodes must remain `pageNumber` during normalization.

### Rich text engine operation contract

The pure paragraph rich-text engine in `packages/core/src/document/richText.ts`
uses paragraph-relative text offsets. Offsets count text-node UTF-16 code units
only; inline objects such as `fieldRef` and `pageNumber` are preserved in the
`children` array but are not themselves split or addressed as editable text in
the first engine lane.

Range rules:

- Reversed ranges are normalized before applying an operation.
- Out-of-bounds ranges are clamped to the current paragraph text length.
- Style and delete operations require a non-collapsed range; collapsed ranges
  are no-ops.
- Replacement supports collapsed insertion when replacement text is non-empty.
  A collapsed empty replacement is a no-op.
- Non-finite offsets are invalid and return no update.

Run identity rules:

- When a text run is split, the first surviving text segment keeps the source
  run id.
- Additional split or inserted segments receive new text ids.
- Merging adjacent text runs keeps the left run id.
- Splitting at the start or end of a paragraph creates one editable empty text
  run on the empty side using the nearest run style.

Inline-object rules:

- Inline objects are copied through range operations unchanged.
- Replacing a text range around an inline object may remove surrounding text,
  but must not remove or rewrite the inline object unless a future inline-object
  operation explicitly targets that object.
- A collapsed text insertion at the text offset before an inline object inserts
  before that inline object and inherits the previous text run style.

### Assert invariants

- `text.text` is a string.
- `text.style.textColor` matches `/^[0-9a-fA-F]{6}$/`.
- `text.style.fontSize` is finite and `> 0`.
- `text.style.fontFamilyKey` is non-empty when present; normalization resolves
  unknown keys to the active default.
- `text.style.fontWeight` is `"normal"` or `"bold"`.
- `text.style.fontStyle` is `"normal"` or `"italic"`.
- `text.style.textDecoration` is `"none"` or `"underline"`.

## Phase Plan

Four phases. Each phase contains slices that mirror the Flow Table slice
pattern (C1, C2.1...). Each slice has acceptance, files to touch, and tests to
add.

## Phase 1 — Run-Style Foundation

Goal: every paginated document round-trips through the new schema with no
visible change for plain text. Editor still edits unstyled paragraphs as
before; no toolbar or range editing yet. Later Phase 1 slices extend layout and
renderers once the authored model is stable.

### 1.A Schema redesign

Acceptance:
- `paragraph.children` remains the authored inline lane.
- `TextRun` accepts optional nested `style?: TextRunStyle`.
- Inline node union keeps `text`, `pageNumber`, and `fieldRef`.
- Styled text runs are additive; unstyled documents remain schema-valid.
- TypeScript build passes.

Files:
- `packages/core/src/schema/inline.ts`
- `packages/core/src/schema/index.ts`

Tests:
- `packages/core/src/schema/inline.test.ts` — shape only.

### 1.B Effective style helpers

Acceptance:
- `resolveTextRunStyle(paragraph, run)` returns paragraph defaults plus run
  overrides.
- `hasTextRunStyle(run)` identifies authored rich-style runs.
- `mergeAdjacentTextRuns(children)` merges only adjacent text runs with
  identical authored style and does not cross field/page-number boundaries.

Files:
- `packages/core/src/document/richText.ts` (new)
- `packages/core/src/document/index.ts`

Tests:
- `packages/core/src/document/richText.test.ts`.

### 1.C Plain-text edit guard

Acceptance:
- Paragraphs with any styled text run do not enter the existing plain-text
  rewrite lane.
- `updateParagraphText`, split, merge, and textarea entry stay limited to
  unstyled text-only paragraphs until rich range editing is implemented.

Files:
- `packages/core/src/document/operations.ts`
- WYSIWYG/editor callers continue using `isPlainTextParagraph`.

Tests:
- `packages/core/src/document/operations.test.ts` extended.

### 1.D Normalize

Acceptance:
- Text run style fields normalize to canonical supported values.
- Malformed run style fields are dropped instead of becoming default overrides.
- Legacy/unknown font keys normalize through the font registry fallback.
- `pageNumber` inline nodes remain page-number nodes.

Files:
- `packages/core/src/document/normalize.ts`

Tests:
- `packages/core/src/document/normalize.test.ts` extended.

### 1.E Assert

Acceptance:
- `assertDocument` rejects malformed text run style through `TextRunSchema`.
- Existing assert tests still pass after fixture migration.

Files:
- `packages/core/src/schema/inline.ts`
- `packages/core/src/document/assert.ts`

Tests:
- `packages/core/src/document/assert.test.ts`.

### 1.F Measurer per run

Acceptance:
- `FontMeasurer.measureRun(text, style)` returns width using fontkit with the
  resolved font weight/style.
- Sarabun bold/italic/bold-italic font files are loaded as expected
  variants.

Files:
- `packages/core/src/layout/font-measurer.ts`
- `packages/core/src/layout/types.ts` — `TextMeasurer` signature update.

Tests:
- `packages/core/src/layout/__tests__/font-measurer.test.ts`.

### 1.G Word break across runs

Acceptance:
- `wrapLines` reads runs in order; line break decisions consider concatenated
  text, but each break point still knows which run boundary it falls on.
- `wordcut` segments are computed over concatenated text and then mapped back
  to per-run offsets.

Files:
- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/word-breaker.ts`

Tests:
- `packages/core/src/layout/__tests__/measure.runs.test.ts` (new).

### 1.H Line layout per run

Acceptance:
- A laid-out line has an ordered list of run slices, each with `(text, style,
  x, width, baseline)`.
- Line height = max of resolved `lineHeight` across runs on the line.
- Line ascent/descent come from the dominant run when mixed (largest).

Files:
- `packages/core/src/layout/line.ts`

Tests:
- `packages/core/src/layout/__tests__/line.runs.test.ts` (new).

### 1.I PDF renderer per run

Acceptance:
- `drawText` is called once per run slice with the matching font and color.
- Underline draws a horizontal line under the run extents.
- Color falls through correctly.

Files:
- `packages/core/src/renderer/pdfRenderer.ts`

Tests:
- `packages/core/src/renderer/__tests__/renderer.test.ts` extended.
- `packages/core/src/renderer/__tests__/pdfVisualRegression.test.ts` updated
  fixtures.

### 1.J DOCX renderer per run

Acceptance:
- One `TextRun` per text-node slice with matching `bold`, `italic`,
  `underline`, `color`, `size`, `font`, `characterSpacing`.
- Link inline node → `ExternalHyperlink`.

Files:
- `packages/core/src/renderer/docxRenderer.ts`

Tests:
- `packages/core/src/renderer/__tests__/renderer.test.ts` extended.

### 1.K Editor SVG read-only render

Acceptance:
- `EditorCanvas` renders run slices as separate `<text>` elements with matching
  font weight/style/color attributes.
- Underline overlay drawn from line geometry.
- Existing canvas tests still pass with migrated fixtures.

Files:
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Tests:
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`.

### 1.L Editor edit still works (single-run lane)

Acceptance:
- Stage 4 text-engine bridge still commits text into a single text-node child.
- Existing bold/italic/underline/color on the only run are preserved through
  edit (no style stripping).
- Undo/redo still single-entry per typing burst.

Files:
- `src/app/editor/_components/wysiwygTextEligibility.ts`
- Stage 4 bridge code path that writes back to the model.

Tests:
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`.

### 1.M Existing smoke green

Acceptance:
- `npm run smoke:editor` passes against migrated fixtures.
- `npm run smoke:wysiwyg-stage4c` passes.
- `npm run smoke:wysiwyg-table-cell-boundary` passes.
- `npm run smoke:wysiwyg-flow-table-rowspan-boundary` passes.

End of Phase 1: the system reads/writes/renders rich text but no user-facing
control exists yet. Output is still visually identical to current output for
plain text.

## Phase 2 — Paragraph-Level Styles (Fixed Toolbar)

Goal: user can apply bold/italic/underline/color/fontSize to the **entire
paragraph** through a fixed top toolbar. Heading default map is the truth for
heading visuals. No selection-range styling yet.

### 2.A Fixed top toolbar shell

Acceptance:
- Toolbar appears above the canvas.
- Empty buttons for bold/italic/underline; fontSize input; color swatch; align
  group; heading dropdown.
- Toolbar reflects the currently selected paragraph's effective style (read
  through `resolveEffectiveStyle`).

Files:
- `src/app/editor/_components/RichTextToolbar.tsx` (new)
- `src/app/editor/_components/EditorShell.tsx`

Tests:
- `src/app/editor/_components/__tests__/RichTextToolbar.test.ts` (new).

### 2.B Apply at paragraph.defaultStyle

Acceptance:
- Bold/italic/underline buttons toggle `paragraph.defaultStyle.bold` etc.
- fontSize input writes to `paragraph.defaultStyle.fontSize`.
- color picker writes to `paragraph.defaultStyle.color`.
- After write, text nodes that did not have an override pick up the new style.

Files:
- `packages/core/src/document/operations.ts` — `setParagraphDefaultStyle`
  operation.

Tests:
- `packages/core/src/document/operations.test.ts`.

### 2.C Heading dropdown

Acceptance:
- Heading dropdown sets/clears `paragraph.headingLevel`.
- Setting heading does not write style fields onto the paragraph (cascade
  resolves at render time).
- Clearing heading reverts to body paragraph default style.

Files:
- `packages/core/src/document/operations.ts` — `setParagraphHeading`.

Tests:
- `packages/core/src/document/operations.test.ts`.

### 2.D Keyboard shortcuts (paragraph-scope)

Acceptance:
- `Ctrl+B`, `Ctrl+I`, `Ctrl+U` toggle paragraph default style **when no
  selection range is active**.
- `Ctrl+1` / `Ctrl+2` / `Ctrl+3` set heading level.
- `Ctrl+0` clears heading.

Files:
- `src/app/editor/_components/keyboardShortcuts.ts` (new or existing extension).

Tests:
- `src/app/editor/_components/__tests__/keyboardShortcuts.test.ts`.

### 2.E Undo granularity for paragraph style

Acceptance:
- Each toolbar/keyboard style toggle = 1 undo entry.
- Style change immediately preceding/following a typing burst does not merge
  into the typing entry.

Files:
- `src/app/editor/_components/undoStack.ts` (existing).

Tests:
- `src/app/editor/_components/__tests__/undoStack.test.ts`.

### 2.F Property panel parity

Acceptance:
- PropertyPanel paragraph section shows effective style and mirrors toolbar
  state.
- PropertyPanel writes go through the same operation as the toolbar.

Files:
- `src/app/editor/_components/PropertyPanel.tsx`

Tests:
- `src/app/editor/_components/__tests__/PropertyPanel.test.ts`.

End of Phase 2: a writer can produce a document with paragraph-level
formatting and headings. Mixed style inside one paragraph is still not
possible.

## Phase 3 — Inline Mixed Style (Selection-Based)

Goal: user can select a range inside a paragraph and apply a style only to
that range. Bridge captures range commands. Run boundaries split and merge as
needed.

This is the hardest phase. It extends the Stage 4 text engine, not replaces
it.

### 3.A Bridge selection model upgrade

Acceptance:
- The hidden contenteditable bridge exposes `(anchorOffset, focusOffset)` in
  paragraph-relative units, not just caret position.
- Selection overlay on SVG draws across run boundaries.
- Selection collapse/expand updates the model selection state correctly.

Files:
- `src/app/editor/_components/wysiwygInputBridge.ts`
- `src/app/editor/_components/wysiwygSelectionOverlay.ts`

Tests:
- `src/app/editor/_components/__tests__/wysiwygSelectionOverlay.test.ts`.

### 3.B Core op: applyInlineStyle

Acceptance:
- `applyInlineStyle(paragraphId, from, to, partialStyle)` splits text nodes at
  `from` and `to`, merges resulting overlapping nodes with the new style, then
  normalizes.
- Operation is idempotent: applying the same style to the same range twice
  produces the same document.
- Operation respects inline nodes (e.g. pageNumber): it does not split a
  pageNumber, but may apply style to text-node neighbors.

Files:
- `packages/core/src/document/operations.ts`

Tests:
- `packages/core/src/document/operations.test.ts` — extensive cases:
  - range inside one run
  - range across two runs
  - range across an inline node
  - range covering the whole paragraph
  - range that exactly matches an existing run

### 3.C Floating mini-toolbar

Acceptance:
- Mini toolbar appears above the selection when the selection range is non-
  empty.
- Mini toolbar hides on selection collapse and on caret-only state.
- Mini toolbar buttons reflect the dominant style across the selection
  (mixed = empty / indeterminate).

Files:
- `src/app/editor/_components/RichTextMiniToolbar.tsx` (new)

Tests:
- `src/app/editor/_components/__tests__/RichTextMiniToolbar.test.ts` (new).

### 3.D Mini-toolbar: bold/italic/underline range

Acceptance:
- Clicking bold on a mixed selection forces bold on the whole range.
- Clicking bold on an all-bold selection clears bold from the whole range.
- Underline and italic follow the same toggle semantics.

Files:
- Reuses `applyInlineStyle`.

Tests:
- `src/app/editor/_components/__tests__/RichTextMiniToolbar.test.ts`.

### 3.E Mini-toolbar: color, fontSize, fontFamily, letterSpacing

Acceptance:
- Color picker applies a hex color to range.
- fontSize input applies size to range.
- fontFamily dropdown lists supported families.
- letterSpacing input applies per-run letterSpacing.
- Clearing each field (clicking "remove") deletes the run-level override and
  lets the cascade resolve.

Files:
- Mini toolbar component, `applyInlineStyle`.

Tests:
- `src/app/editor/_components/__tests__/RichTextMiniToolbar.test.ts`.

### 3.F Caret pending style

Acceptance:
- When caret is collapsed and user clicks bold, the next typed character is
  bold even though no text exists yet.
- Pending style is cleared on caret move, blur, or after one typed character.
- Pending style is reflected in toolbar state.

Files:
- `src/app/editor/_components/wysiwygPendingStyle.ts` (new)

Tests:
- `src/app/editor/_components/__tests__/wysiwygPendingStyle.test.ts`.

### 3.G Ctrl+B/I/U with selection

Acceptance:
- With non-empty selection, `Ctrl+B/I/U` apply via `applyInlineStyle`.
- With empty selection, `Ctrl+B/I/U` set pending style (see 3.F).

Files:
- `src/app/editor/_components/keyboardShortcuts.ts`.

Tests:
- Same test file.

### 3.H Selection overlay multi-style

Acceptance:
- Selection overlay draws per run boundary, respecting line wraps.
- Visual selection geometry matches caret/anchor positions even when the
  selection crosses run style boundaries on the same line.

Files:
- `src/app/editor/_components/wysiwygSelectionOverlay.ts`.

Tests:
- Snapshot tests on multi-run paragraphs.

### 3.I Undo granularity for inline style

Acceptance:
- One mini-toolbar click = 1 undo entry.
- Sequential style toggles on the same range within ~300ms do not merge into
  one entry (each toggle is intentional).
- Style command immediately after a typing burst is its own entry.

Files:
- `undoStack` extension.

Tests:
- Existing undo tests + new cases.

### 3.J Table-cell parity

Acceptance:
- A table-cell paragraph supports the same Phase 3 selection-based styling.
- Flow Table cell paragraphs support the same.
- Boundary rules from `TABLE_EDITING_CONTRACT.md` still hold (Backspace at
  cell true start, etc.).

Files:
- No new files; integration is through existing table-cell text engine paths.

Tests:
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
  extended to add a mixed-style cell paragraph case.

### 3.K Stress smoke

Acceptance:
- New `npm run smoke:wysiwyg-rich-text-selection` script verifies:
  - select range across line wrap, apply bold → visual selection redraw,
    typing in the range stays bold
  - select range across an inline pageNumber → pageNumber not split, neighbor
    text styled correctly
  - select whole paragraph crossing a page boundary in a continuation
    fragment → both fragments draw the selection overlay correctly
  - IME composition inside a styled range commits with the correct style

Files:
- `scripts/wysiwyg-rich-text-selection-smoke.mjs` (new)
- `package.json` script registration
- `docs/BROWSER_SMOKE_CHECKLIST.md` updated

End of Phase 3: full inline rich text editing works for typing, selection,
and explicit style commands. Paste is still plain.

## Phase 4 — Paste, fontFamily, Link

### 4.A Paste pipeline scaffold

Acceptance:
- A central paste handler intercepts the clipboard `paste` event on the
  bridge, reads `text/html` and `text/plain`.
- The handler is the only entry point for paste content into the model.

Files:
- `src/app/editor/_components/pasteHandler.ts` (new)

Tests:
- `src/app/editor/_components/__tests__/pasteHandler.test.ts` (new).

### 4.B HTML → rich text mapper

Acceptance:
- Map `<b>`, `<strong>` → bold.
- Map `<i>`, `<em>` → italic.
- Map `<u>` → underline.
- Map `style="color: #..."` → color.
- Map `style="font-size: Npx|Npt"` → fontSize (px converted to pt at 1px = 0.75pt).
- Map `<a href="...">` → link inline node.
- Map `<br>` → split into separate paragraphs.
- Map `<p>` → paragraph boundary.
- Drop everything else (images, tables-from-Word, scripts, styles, classes).

Files:
- `src/app/editor/_components/pasteHtmlMapper.ts` (new)

Tests:
- `src/app/editor/_components/__tests__/pasteHtmlMapper.test.ts` with fixtures
  from real Word/Docs/Notion HTML clipboard payloads.

### 4.C Paste sanitization

Acceptance:
- Unknown style fields are stripped, not preserved.
- Mapped style values are clamped to schema limits (color regex, fontSize
  >= 1, etc.).
- Pasted content passes `assertDocument` after insertion.

Files:
- Same mapper file.

Tests:
- Sanitization-specific cases.

### 4.D Ctrl+Shift+V plain paste

Acceptance:
- `Ctrl+Shift+V` (and Mac `Cmd+Shift+V`) bypasses the mapper and inserts
  `text/plain` only.
- Newlines split into paragraphs.

Files:
- `pasteHandler.ts`.

Tests:
- pasteHandler test file.

### 4.E Font loader infrastructure

Acceptance:
- A `FontRegistry` lazily loads font files from `/public/fonts/`.
- Each load is cached.
- Server fontkit measurer keeps a parallel cache.
- A missing font logs a warning and falls back to Sarabun Regular.

Files:
- `packages/core/src/layout/fontRegistry.ts` (new)
- `packages/core/src/layout/font-measurer.ts` (extended)

Tests:
- `packages/core/src/layout/__tests__/fontRegistry.test.ts` (new).

### 4.F Noto Sans Thai font assets

Acceptance:
- Noto Sans Thai Regular/Bold are available under `/public/fonts/`.
- Licensing is documented through the bundled OFL file.

Files:
- `public/fonts/Noto_Sans_Thai/static/NotoSansThai-Regular.ttf`
- `public/fonts/Noto_Sans_Thai/static/NotoSansThai-Bold.ttf`

Tests:
- Registry smoke loads these files.

### 4.G fontFamily UI

Acceptance:
- Fixed toolbar shows fontFamily dropdown.
- Mini toolbar shows fontFamily dropdown when range is selected.
- Selecting font writes `text.fontFamily` (range) or
  `paragraph.defaultStyle.fontFamily` (paragraph).

Files:
- Toolbar components.

Tests:
- Toolbar tests extended.

### 4.H PDF renderer font embedding

Acceptance:
- PDF embeds only the fonts that actually appear in the document.
- DOCX sets `RPr.RFonts` per run.

Files:
- `pdfRenderer.ts`, `docxRenderer.ts`.

Tests:
- renderer tests with multi-font fixture.

### 4.I Link node — schema + render

Acceptance:
- `link` inline node renders in editor as a styled text with underline + blue
  color by default (theme-controlled).
- PDF renderer emits a clickable annotation with the link URL.
- DOCX renderer emits an `ExternalHyperlink` element.

Files:
- `packages/core/src/schema/link.ts` finalized.
- Renderer files.

Tests:
- Renderer tests with link fixture.

### 4.J Link insert UX

Acceptance:
- `Ctrl+K` (and `Cmd+K`) opens a small modal with URL input and "display text"
  input prefilled from selection.
- Submitting creates a `link` node replacing the selection.
- With no selection, the modal asks for both URL and display text.

Files:
- `src/app/editor/_components/LinkInsertModal.tsx` (new)
- `keyboardShortcuts.ts`.

Tests:
- Modal component test.

### 4.K Link auto-detect on paste

Acceptance:
- Pasted plain text that matches a URL pattern (`https?://...`) becomes a
  `link` node automatically when it appears as a standalone token.
- Pasted HTML `<a>` is mapped in 4.B.

Files:
- `pasteHandler.ts`.

Tests:
- pasteHandler test file.

### 4.L Link selection and panel

Acceptance:
- Single click on a link selects the link inline node.
- PropertyPanel exposes link `url` and `display` fields.
- Editing `url` updates the link without losing the display text and its style.

Files:
- `PropertyPanel.tsx`.

Tests:
- PropertyPanel test extended.

### 4.M Full smoke pass

Acceptance:
- `npm run smoke:editor` passes.
- `npm run smoke:wysiwyg-stage4c` passes.
- `npm run smoke:wysiwyg-table-cell-boundary` passes.
- All flow-table smoke scripts pass.
- New `npm run smoke:wysiwyg-rich-text-paste` smoke covers Word and Google
  Docs HTML payloads.
- New `npm run smoke:wysiwyg-rich-text-link` smoke covers link insert + click.

End of Phase 4: rich text feature-complete for v1 scope. Document can be
authored from scratch in FlowDoc or pasted from Word/Docs while keeping
formatting that the schema supports.

## Cross-Cutting Concerns

### Table cell parity

Every Phase that touches paragraph editing must verify that the same behavior
works inside `flow-table-cell`. Table cells already use the
same paragraph nodes; rich text comes for free at the data layer, but
selection-overlay geometry and continuation reflow must be re-verified per
phase.

### Stage 4 IME baseline

Phase 1-4 must not regress:

- IME composition does not mutate visible SVG text until `compositionend`.
- Composition followed by a style command does not lose the composed text.
- Thai IME flows (`docs/WYSIWYG_STAGE4C_IME_MATRIX.md`) still pass.

Each Phase rerun of the Stage 4C automated smoke is mandatory before claiming
the Phase complete.

### WYSIWYG pixel parity

The Layout Accuracy Goal in `project_decisions` memory applies. Each Phase:

- Server fontkit measurer drives layout.
- Editor SVG draws from the same measurer output.
- PDF export uses the same measurer.

A new fixture in `pdfVisualRegression.test.ts` per Phase compares a multi-style
paragraph render against a stored bitmap.

### Performance budget

- Paragraph re-layout on every keystroke must stay under 16 ms for paragraphs
  up to 5,000 characters with up to 50 style runs.
- Initial document load with 200 paragraphs and 1,000 runs must layout in
  under 500 ms.
- These budgets are not enforced as CI gates in v1 but are tracked in
  `WORK_LOG.md` at end of each Phase.

## Migration Plan

Pre-1.0: aggressive rewrite, no backward compat.

1. Create migration codemod `scripts/migrate-paragraph-text.mjs`.
2. Run codemod across all fixtures, sample documents in `examples/`, and
   localStorage seed data.
3. Delete `paragraph.text` field from the schema in the same PR as the
   codemod.
4. The codemod is kept in the repo for archival/reference after Phase 1.
5. After release, the codemod is deleted in a follow-up cleanup PR.

`assertDocument` rejects `paragraph.text` after this point.

## Test Strategy

Per-slice tests are listed inside each slice. The overall strategy mirrors
Flow Table:

- Unit tests in `packages/core` for schema, normalize, assert, operations,
  measure, line layout.
- App-level tests in `src/app/editor/_components/__tests__` for toolbar,
  selection overlay, bridge, keyboard, paste.
- Renderer tests for PDF and DOCX output.
- Browser smoke for end-to-end interaction.
- IME matrix re-run at the end of each phase.

A Phase is not done until all listed automated smoke scripts plus the IME
matrix pass.

## Open Questions

These need a decision before the affected slice starts. Not before Phase 1
starts unless explicitly noted.

1. **Additional Thai serif font licensing.** If a future serif option is added,
   shipping the `.ttf` from `/public/fonts/` to web clients must be explicitly
   permitted by the font license. Options:
   - Use an OFL-compatible Thai serif family.
   - Embed only on PDF export (server-side) and refuse to ship the file as a
     web font asset.
   - Keep the first catalog limited to Sarabun and Noto Sans Thai.

2. **Color picker preset list.** A swatch of preset colors is needed; full hex
   picker is power-user only. Initial proposal: 8 swatches matching official
   document palette (black, dark gray, red, blue, green, orange, purple,
   brown). Confirm before slice 2.B.

3. **Heading default map values.** The numbers proposed in
   `headingDefaults.ts` are placeholders. Confirm Thai government document
   standards (TIS, Royal Thai Government Gazette) before slice 1.B.

4. **fontFamily for table headers.** Should heading default style apply inside
   a table-cell paragraph that has `headingLevel`? Possibly yes for `รายงาน`
   reports but odd for `ใบขน` forms. Confirm before slice 2.C.

5. **Mixed-style selection toolbar state.** When a selection spans bold and
   non-bold runs, what does the bold button show? Industry default: empty /
   indeterminate, and clicking applies bold to all. Confirm before slice 3.D.

6. **Paste from Word horizontal lines and tables.** These map to FlowDoc
   structures that exist (`hr` spacer, `flow-table`). Should paste create
   them automatically or skip? Probably skip in v1 — paste is text/inline
   only. Confirm before slice 4.B.

7. **Link styling overrides.** Should a link's default underline+blue be
   themeable per document, or system-fixed? Confirm before slice 4.I.

## Phase Order And Estimate

Recommended order: 1 → 2 → 3 → 4. Phase 3 is the longest and the highest risk.

Rough effort (single contributor, part-time):

- Phase 1: 2-3 weeks
- Phase 2: 1-2 weeks
- Phase 3: 3-5 weeks
- Phase 4: 2-3 weeks

Total: ~2-3 months at part-time pace.

Phase 1 and 2 can ship to 1.0 without Phase 3-4 if scope pressure demands.
Phase 1 alone has no user-visible feature (it is foundation only). Phase 2
delivers heading + paragraph-level styling, which already covers the majority
of authored government documents.

## Acceptance For "Rich Text Complete"

- Every Phase's automated smoke passes.
- Stage 4C IME matrix passes.
- A reference document containing one of each supported style, an inline
  link, a heading, a multi-line table-cell paragraph, and a paste sample from
  Word renders identically in editor preview and PDF export.
- WORK_LOG records each Phase completion with files changed and verification
  performed.
