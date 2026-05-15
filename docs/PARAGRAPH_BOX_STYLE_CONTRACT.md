# Paragraph Box Style Contract

This contract defines the first supported paragraph box styling surface for
FlowDocEditor. It exists so editor controls, pagination, PDF export, DOCX
export, and future schema migrations all agree on what a paragraph box means.

Use this document together with `docs/EDITOR_UX_CONTRACT.md`,
`docs/LAYOUT_ENGINE_SPEC.md`, `docs/EXPORT_RENDERER_CONTRACT.md`, and
`docs/TEST_STRATEGY.md`.

## Purpose

Paragraph box styling is document styling, not CSS styling.

Version 1 is intentionally small:

- fill color
- four-sided padding
- four-sided border

The goal is to support common document boxes such as callouts, labeled content,
form-like fields, and visually grouped paragraphs without introducing
web-layout-only features that export formats cannot reliably represent.

## Out Of Scope For Version 1

The following are intentionally deferred:

- rounded corners
- shadows
- opacity
- gradients
- image fills
- per-corner radius
- blend modes
- arbitrary CSS-like decoration

These features may be useful visually, but they are not needed for the current
document workflow and would create export ambiguity.

## Authored Model

The authored paragraph props should gain a box-style object close to:

```ts
box?: {
  fill?: string
  padding?: {
    top: UnitValue
    right: UnitValue
    bottom: UnitValue
    left: UnitValue
  }
  border?: {
    top?: BorderSide
    right?: BorderSide
    bottom?: BorderSide
    left?: BorderSide
  }
}
```

`BorderSide` should reuse the table-cell border vocabulary where possible:

```ts
{
  style: "solid" | "dashed" | "dotted" | "none"
  width: UnitValue
  color: string
}
```

The document model should keep using document units (`pt`, and any existing
`UnitValue` units the project supports). The property panel may present friendlier
controls, but saved document data should not become CSS-pixel-specific.

## Layout Semantics

Paragraph box style participates in layout. It is not editor-only chrome.

Spacing and box dimensions are separate:

- `spacingBefore` and `spacingAfter` are outside spacing between blocks.
- padding is inside the paragraph box.
- border is the visible edge of the paragraph box.
- fill covers the paragraph box, not the external spacing.

Pagination should treat the paragraph's flow advance as:

```txt
spacingBefore
+ borderTop + paddingTop
+ measured line content
+ paddingBottom + borderBottom
+ spacingAfter
```

Horizontal measurement should use the content width:

```txt
contentWidth = fragmentWidth
  - borderLeft - paddingLeft
  - paddingRight - borderRight
```

Text line `x` positions should be based on the content box, not the outer
fragment edge. Alignment should operate within the content box.

## Split Paragraph Semantics

Long boxed paragraphs may split across pages. The visual box should behave like
one logical paragraph box sliced across pages.

Default split policy:

- horizontal padding and side borders apply on every fragment
- top padding and top border apply only to the first fragment
- bottom padding and bottom border apply only to the final fragment
- fill applies to every emitted visible box slice
- intermediate continuation fragments do not draw closing top/bottom borders

This mirrors the existing table-cell continuation idea and avoids making a
single logical paragraph look like separate independent boxes after a page
break.

If a future product decision wants repeated full boxes on each page, that should
be a separate authored option, not the default.

## Renderer Contract

Renderers must consume `PaginatedDocument` as the layout source of truth.

If paragraph box style needs render information that is not currently in
`PaginatedDocument`, pagination should enrich paragraph render metadata first.
PDF, DOCX, and editor rendering should not recompute paragraph measurement or
box split policy independently.

PDF/editor are expected to match the authoritative paginated geometry.

DOCX is best-effort:

- fill maps to Word paragraph shading where possible
- borders map to Word paragraph borders where possible
- padding maps to the closest Word paragraph border spacing/indent behavior
  where possible
- DOCX may reflow and may not be pixel-perfect with the editor/PDF

Any DOCX approximation must be documented in renderer tests or contract notes.

## Editor UX Contract

The property panel should group box controls separately from text controls.

Recommended structure:

- Text
- Box
- Layout

Within `Box`, use collapsible sections instead of nested tabs:

- Fill
- Padding
- Border
- Reset box style

Primary labels, current values, and actions must remain visible. Explanatory
limitations such as DOCX best-effort behavior may use `InfoHint`.

Editor selection chrome must remain visually distinct from authored paragraph
box style. A selected paragraph with an authored border should still show the
selection outline as editor chrome, not as document content.

## Verification

Choose focused tests by touched layer.

Required before exposing controls:

- schema accepts and normalizes valid box style
- invalid border widths, colors, and negative padding fail or normalize safely
- paragraph measurement subtracts horizontal padding/border from text width
- paragraph total height includes vertical padding/border
- split paragraph fragments apply first/middle/final padding and border policy
- editor canvas draws fill/border from paginated metadata
- PDF renderer draws fill/border from paginated metadata
- PDF drawing primitives and the opt-in PDF raster visual gate protect fill and
  border placement when a local PDF rasterizer is available
- DOCX renderer emits valid editable output and documents any approximation
- export/API path still validates through `assertPaginatedDocument`

## Acceptance Rule

A property should not appear in the user-facing property panel until it has:

- authored schema support
- normalization/default behavior
- pagination semantics
- editor preview rendering
- PDF rendering
- DOCX best-effort handling or a visible documented limitation
- focused tests for the changed layers
