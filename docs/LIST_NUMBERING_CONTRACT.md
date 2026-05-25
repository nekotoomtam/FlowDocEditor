# List Numbering Contract

This contract defines the first FlowDoc list/numbering model. It keeps list
numbers semantic and derived, instead of storing visible numbering text inside
paragraph content.

Use this document before changing paragraph list metadata, numbering
resolution, list rendering, list editor operations, DOCX/PDF list export, or
future list-aware history/diff behavior.

## Decision

FlowDoc list v1 is paragraph-based:

```txt
ParagraphNode.children -> authored content only
ParagraphNode.props.list -> list item metadata
DocumentNode.document.listStyles -> numbering style definitions
DocumentNode.document.listInstances -> independent numbering streams
Numbering resolver -> generated marker text
```

Do not store visible list labels such as `1.`, `1.1`, `(1)`, or bullet glyphs
inside paragraph text runs.

## Shape

The document owns reusable list styles and list instances:

```ts
interface ListLevelDefinition {
  level: number
  format: "decimal" | "thaiLetter" | "lowerLetter" | "upperLetter" |
    "lowerRoman" | "upperRoman" | "bullet" | "custom"
  pattern: string
  startAt: number
  restartAfterLevel?: number
  markerIndent: UnitValue
  textIndent: UnitValue
  tabStop?: UnitValue
}

interface ListStyleDefinition {
  id: string
  levels: ListLevelDefinition[]
}

interface ListInstance {
  id: string
  styleId: string
}

interface ParagraphListProps {
  instanceId: string
  level: number
  itemId: string
  startAt?: number
}
```

`ParagraphListProps.itemId` is semantic item identity for future history/diff.
It is not the visible number, not the paragraph id, and not a position index.

The current supported level range is `0..7` internally, exposed to users as
levels 1 through 8.

## Resolver

The numbering resolver walks authored document order and creates generated
marker metadata:

```ts
interface ResolvedListMarker {
  paragraphId: string
  instanceId: string
  styleId: string
  itemId: string
  level: number
  ordinal: number
  markerText: string
}
```

Rules:

- Each list instance counts independently, even when instances share a style.
- Paragraph `startAt` restarts the counter for that paragraph's level.
- Deeper counters reset when a shallower level advances.
- Missing intermediate parent counters use that level's style `startAt`.
- Marker text is derived from counters plus the level pattern.
- Marker text must not be written back into paragraph children.

## Layout

List markers are generated decoration before the paragraph body:

```txt
[marker area] [body text area]
4.2.3         first line text...
              continuation line...
```

Paragraph indent behavior must be stable before list marker rendering:

- `indentLeft` and `indentRight` affect measured wrap width.
- `textIndent` affects only the first visual line.
- Continuation lines align from the paragraph body start, not the marker start.
- Split paragraph continuation fragments must not repeat the marker.

Pagination carries generated marker metadata separately from paragraph lines:

```ts
interface ListMarkerRenderProps {
  text: string
  level: number
  ordinal: number
  instanceId: string
  styleId: string
  itemId: string
  markerIndent: number
  textIndent: number
  markerX: number
  bodyX: number
}

interface PageFragment {
  listMarker?: ListMarkerRenderProps
}
```

`PageFragment.listMarker` is attached only to the first fragment of a split
paragraph. It must not be copied into `PageFragment.lines`, line segments, line
runs, or paragraph children.

`markerX` and `bodyX` are absolute page coordinates in abstract pt. They are
derived from the paragraph content edge plus the list level's `markerIndent`
and `textIndent`.

For body paragraph pagination, list item lines are measured and positioned with
the list level's `textIndent` as the effective body start. This is runtime
layout state only and must not be written back into paragraph props.

Preview rendering draws `listMarker.text` as generated SVG text from
`PageFragment.listMarker`. The marker is outside WYSIWYG caret, selection, and
paragraph text editing ranges.

PDF rendering draws `listMarker.text` from `PageFragment.listMarker` as a
separate text operation at `markerX` and the first paragraph line baseline. The
marker is not appended to `PageFragment.lines`, rich-text runs, or paragraph
children.

## History And Diff

List numbers are derived state. Future history/diff should compare:

- `itemId`
- paragraph/node identity
- content
- list instance
- level
- position

A changed visible number alone should be explainable as derived renumbering
when content and item identity are unchanged.

## Initial Scope

V1 implementation order:

1. Paragraph indent measurement and positioning.
2. List schema and numbering resolver.
3. Marker rendering from resolved numbering metadata.
4. Minimal TOR presets.
5. Editor operations and keyboard behavior.

Phase 2 remaining markers:

- None required for v1 generated marker rendering.

Optional hardening:

- Add PDF visual regression coverage for generated marker placement.

Phase 2 completed markers:

- Thread list numbering context through body/stack paragraph pagination.
- Thread list numbering context through static `row` paragraph pagination.
- Thread list numbering context through `flow-row` paragraph pagination.
- Thread list numbering context through `flow-table` paragraph pagination.
- Render generated markers in preview from `PageFragment.listMarker`.
- Render generated markers in PDF from `PageFragment.listMarker`.
- Export generated markers in DOCX as marker run plus hanging indent, without
  writing marker text back into paragraph children.
- Keep header/footer zone generated list markers out of v1 scope. List
  numbering resolution is body-order derived state and does not walk repeated
  header/footer roots.

Deferred:

- `listNumberRef` cross references.
- Data-generated repeat lists.
- Full Word numbering import/export parity.
- Rich list property panel.
- Persisted semantic history entries.
