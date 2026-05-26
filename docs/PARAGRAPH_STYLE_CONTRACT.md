# Paragraph Style Contract

This contract defines the first central style foundation for FlowDocEditor.
Use it before changing paragraph presets, text-run presets, property-panel style
editing, generated document content, or future group/repeat display rules.

## Decision

Paragraph styling remains document-owned and export-neutral.

The runtime path resolves paragraph style references before pagination. The
authored document still keeps reusable definitions beside direct paragraph props
so authoring can reference shared presets without duplicating font, spacing,
indent, and heading rules across every paragraph.

```txt
DocumentNode.document.styles.paragraphStyles -> reusable paragraph style rules
DocumentNode.document.styles.textRunStyles -> reusable inline run style rules
ParagraphNode.props.paragraphStyleId -> optional paragraph style reference
ParagraphNode.props.styleOverrides -> node-local differences from that style
ParagraphNode.props -> current authored paragraph props
Style resolver -> temporary effective props for layout/render/export
```

Do not store computed effective styles, renderer-specific styles, editor
selection state, or group/repeat runtime display state in style definitions.

## Shape

The document may own reusable style definitions:

```ts
interface ParagraphStyleProperties {
  align?: "left" | "center" | "right" | "justify"
  fontSize?: UnitValue
  fontFamilyKey?: string
  textColor?: string
  fontWeight?: "normal" | "bold"
  fontStyle?: "normal" | "italic"
  textDecoration?: "none" | "underline"
  strikethrough?: boolean
  lineHeight?: number
  spacingBefore?: UnitValue
  spacingAfter?: UnitValue
  textIndent?: UnitValue
  indentLeft?: UnitValue
  indentRight?: UnitValue
  headingLevel?: 1 | 2 | 3
  keepWithNext?: boolean
  box?: ParagraphBoxStyle
}

interface ParagraphStyleDefinition {
  id: string
  name?: string
  props: ParagraphStyleProperties
}

interface TextRunStyleDefinition {
  id: string
  name?: string
  style: TextRunStyle
}

interface DocumentStyleDefinitions {
  paragraphStyles?: Record<string, ParagraphStyleDefinition>
  textRunStyles?: Record<string, TextRunStyleDefinition>
}
```

`paragraphStyles` are paragraph visual rules. They must not own list numbering
identity, list instances, field values, data snapshots, generated content, or
history state.

`textRunStyles` are reusable inline text style rules. They do not replace rich
text run overrides; they provide a future preset source for authoring.

## Cascade Direction

The intended effective-style order is:

```txt
engine defaults
-> paragraph style definition
-> local paragraph overrides
-> list marker/body geometry when paragraph.props.list is present
-> inline text-run style
```

List geometry remains separate:

- `listStyles` define marker format and marker/body geometry.
- `paragraphStyles` define text appearance and paragraph spacing defaults.
- `ParagraphNode.props.list.itemId` remains semantic list item identity.

When a paragraph is a list item, list `markerIndent` and `bodyIndent` stay the
truth for generated marker/body placement. Paragraph styles may define font,
spacing, and heading defaults, but they must not silently override list
numbering state.

## Current Phase

This phase establishes the first usable style boundary:

- documents may store central style definitions
- definitions are validated and normalized
- pure style resolver helpers can merge definitions and local overrides
- preset helpers can install initial TOR paragraph styles into a document
- semantic operations can apply, clear, and reset paragraph style metadata
- the editor property panel can apply, clear, and reset preset-backed paragraph
  styles
- pagination resolves paragraph style refs into temporary effective props before
  measurement, render props, TOC collection, and export fragments

Do not migrate existing paragraphs to style references until a separate design
accepts the new authoring behavior and undo/history implications.

`paragraphStyleId` may be stored on paragraph props as authoring metadata.
Helper resolvers derive styled props for layout and tests without rewriting the
authored paragraph.

`styleOverrides` stores only values intentionally changed on this paragraph
after a central style is applied. If `paragraphStyleId` is absent, the paragraph
may still keep direct props as it does today; style overrides alone are valid
metadata but do not replace the current direct-props render path.

Style operations may still sync direct paragraph props from a style definition.
This keeps saved documents visually stable in older render paths while the
pagination boundary uses effective style resolution directly.

Style removal semantics:

- Clear removes `paragraphStyleId` and `styleOverrides` while preserving the
  current direct props.
- Reset removes `styleOverrides` and returns the paragraph to its referenced
  style.
- Detach resolves the current effective paragraph appearance into direct props,
  then removes `paragraphStyleId` and `styleOverrides`.

Property-panel paragraph-wide controls must write to `styleOverrides` when a
paragraph already has `paragraphStyleId` or existing `styleOverrides`. They must
not rewrite `children[].style`; inline rich text remains the more specific
layer. This keeps central paragraph style as the wrapper and text-run styling as
local emphasis.

Property-panel box controls follow the same rule. Because `box` is a nested
object, a local `styleOverrides.box` owns the whole effective box after the edit.
Use an explicit empty object to clear a box inherited from a paragraph style.

`styleOverrides.headingLevel: null` is the explicit local value for clearing a
heading inherited from a style definition. Missing `headingLevel` means "inherit
from the paragraph style"; `null` means "this paragraph is not a heading."

## Presets

FlowDoc ships initial paragraph style presets in
`packages/core/src/document/paragraphStylePresets.ts`.

Current preset ids:

- `tor.body`
- `tor.heading1`
- `tor.heading2`
- `tor.heading3`
- `tor.tableBody`
- `tor.signatureText`

Presets are reusable definitions only. Documents should clone a preset into
`document.styles.paragraphStyles` before paragraphs reference it.

## Core Operations

Style-aware editor behavior should call semantic operations instead of mutating
paragraph props ad hoc.

Active core operations:

- `ensureParagraphStylePreset`: clone a known preset into the document.
- `upsertParagraphStyleDefinition`: insert or replace a document-owned style.
- `applyParagraphStylePreset`: install a preset, set `paragraphStyleId`, clear
  overrides by default, and sync direct props for current render paths.
- `applyParagraphStyleId`: apply an existing document style reference.
- `clearParagraphStyleId`: remove the paragraph style reference and clear
  overrides by default.
- `detachParagraphStyle`: remove style metadata after copying the current
  effective paragraph appearance into direct props.
- `patchParagraphStyleOverrideBox`: merge box-control edits into the current
  effective box and store the result as a local `styleOverrides.box`.
- `updateParagraphStyleOverrides`: set or clear node-local style differences.
- `patchParagraphStyleOverrides`: merge node-local style differences without
  replacing unrelated override keys or text-run styling.
- `resetParagraphStyleOverrides`: remove overrides and sync direct props back to
  the referenced style when available.

## Future Direction

Later phases may add:

- richer style preset UI in the right property panel
- document starter presets for TOR body, heading, caption, table body, and
  signature text
- generated group display rules that reference paragraph/table/list styles
- key-history support for style definition changes

Each phase must keep the authored document, resolved layout, and export output
consistent. Generated or resolved style values should remain derived output, not
stored back into authored paragraph children.

## Test Expectations

Style foundation changes should cover:

- schema acceptance for valid paragraph/text-run style definitions
- assertion failure when a style id does not match its map key
- normalization of legacy or unsafe font keys inside style definitions
- resolver precedence from style definition to local override
- unit-value cloning so callers cannot mutate shared style definitions
- pagination uses resolved paragraph style props without mutating authored props
- property-panel paragraph-wide style edits preserve inline text-run styling

Run focused core tests before wider editor/layout tests:

- Windows PowerShell:
  `npm.cmd run test -w packages/core -- paragraphStyles operations normalize assert`
- Non-Windows:
  `npm run test -w packages/core -- paragraphStyles operations normalize assert`
