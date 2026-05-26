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
  bodyIndent: UnitValue
  tabStop?: UnitValue
}

interface ListStyleDefinition {
  id: string
  levels: ListLevelDefinition[]
}

interface ListInstance {
  id: string
  styleId: string
  startAt?: number
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
Prefer stable semantic keys such as `tor.background` or
`tor.scope.documentManagement.template.fields` over short labels such as
`background`, because reorder, insert, and renumber operations should preserve
item identity.

The current supported level range is `0..7` internally, exposed to users as
levels 1 through 8.

`ListLevelDefinition.bodyIndent` is the canonical list-level body start. Older
draft documents may still contain list-level `textIndent`; normalization treats
that legacy field as `bodyIndent` and writes the canonical name forward.
Paragraph `props.textIndent` remains the normal first-line paragraph indent and
is not the same concept as list body start.

## Presets

FlowDoc ships initial reusable list style presets in
`packages/core/src/document/listPresets.ts`. Presets are style definitions only;
documents still create their own `listInstances` so independent parts of a
document can restart or continue without accidentally sharing counters.

Current preset ids:

- `tor-clause`: decimal TOR clause numbering from internal levels `0..7`.
  Level 0 renders `%1.`, level 1 renders `%1.%2`, and level 7 renders
  `%1.%2.%3.%4.%5.%6.%7.%8`.
- `paren-decimal`: one-level parenthesized decimal numbering, e.g. `(1)`.
- `bullet-basic`: one-level bullet marker.

Preset definitions should be cloned before being inserted into a document. Use
the exported helpers instead of mutating preset constants directly.
Editor and template operations should install a preset-backed instance through
`ensureListPresetInstance` instead of manually composing `listStyles` and
`listInstances` in UI code.

Do not add display names, paragraph `styleId`, or broader style-system metadata
to list presets until the paragraph style contract exists. The active schema
currently treats list style definitions as numbering rules, not as paragraph
styles.

`packages/core/src/fixtures/torListFixture.ts` is the current-schema TOR list
fixture. It intentionally uses section `nodes` plus `body.childIds`, `fieldRef`
inline nodes, semantic `itemId` values, list presets, and derived resolver
output instead of the conceptual top-level `blocks` shape.

## Core Operations

List-aware editor behavior must call semantic operations instead of mutating
paragraph list props ad hoc.

Active core operations:

- `ensureListPresetInstance`: install a cloned preset style and create/update a
  list instance in one operation.
- `toggleParagraphListPreset`: toggle selected paragraphs between a preset list
  instance and normal paragraphs.
- `applyParagraphList` / `clearParagraphList`: assign or remove list metadata
  without touching paragraph children.
- `changeParagraphListLevel`, `indentListItem`, `outdentListItem`: change list
  level only.
- `restartParagraphListAt`: set or clear paragraph-level `startAt`.
- `backspaceListItemAtStart`: apply Word-like list boundary Backspace for a
  list item. Nested items outdent one level; top-level items clear list
  metadata without merging paragraphs.
- `splitListItemAtIndex`: split a text-run-only list item and assign the new
  paragraph a unique list `itemId`. The fallback item identity is the new
  paragraph id until semantic history key generation exists.
- `exitListItem`: clear list metadata only when the current list item is empty.
- `mergeListItemWithPrevious`: merge a text-run-only list item into the previous
  paragraph while preserving the previous paragraph's list identity.

Current split/merge list operations intentionally no-op for paragraphs that
contain inline objects such as `fieldRef`. This protects field content until the
rich inline split/merge policy is explicitly designed.

The editor reducer routes existing structural paragraph split/merge actions
through list-aware operations first. This prevents duplicated `itemId` values
when a listed paragraph is split by an explicit structural action, while keeping
non-list paragraphs on the existing split/merge path.

## Editor Keyboard Behavior

List keyboard wiring is context-specific in v1. Current editor contracts still
apply to normal non-list paragraphs:

- Plain Enter in inline textareas inserts `\n` into the current paragraph.
- Keyboard Tab inside the active edit session follows browser focus behavior;
  pasted tab characters normalize to three spaces.

When the active paragraph has `props.list`, plain Enter is a structural
Word-like list command:

- Enter on a non-empty list item -> split/create next list item.
- Enter on an empty list item -> exit list.
- Shift+Enter on a list item -> insert `\n` inside the same list item.
- Tab on a list item -> increase list level.
- Shift+Tab on a list item -> decrease list level.
- Backspace at true paragraph start on a nested list item -> decrease list
  level.
- Backspace at true paragraph start on a top-level list item -> clear list
  metadata and keep the paragraph content.

This keeps normal paragraph editing compatible with `EDITOR_UX_CONTRACT.md` and
`WYSIWYG_WHITESPACE_MATRIX.md`, while making list items behave like document
structure. The structural action must carry the latest draft text into the
reducer before splitting, exiting, indenting, or outdenting so WYSIWYG draft
state is not lost.

Deferred list key bindings:

- Backspace after a top-level list item has already been converted to a normal
  paragraph -> normal paragraph merge behavior.

## Editor Toolbar

The minimal v1 toolbar exposes preset-backed list creation for the currently
selected paragraph. Creating a list from a non-list paragraph creates a new
document-owned list instance/List Group immediately, then assigns the paragraph
to that group. This keeps independent list scopes visible in Style Manager from
the moment the list exists.

- `1.` applies/toggles the `tor-clause` preset through a new `tor-main_*`
  group when the selected paragraph is not already using that preset.
- `(1)` applies/toggles the `paren-decimal` preset through a new
  `flowdoc-paren-decimal_*` group.
- `•` applies/toggles the `bullet-basic` preset through a new
  `flowdoc-bullet-basic_*` group.
- `In` and `Out` call the same list level operation family as Tab and
  Shift+Tab, but do not force inline edit re-entry after a toolbar click.
- Indent operations must no-op when the current list style does not define the
  requested target level, such as `bullet-basic` level 1.

When a selected paragraph already uses the same preset, the toolbar clears that
existing group membership instead of switching it to another group. This keeps
imported or generated list instances stable for history and future diff.
Structural Enter on an existing list item continues the same group through the
split operation; it does not create a new group.

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
- List instance `startAt` sets the first top-level ordinal for that instance.
- Paragraph `startAt` restarts the counter for that paragraph's level.
- By default, deeper counters reset when any shallower level advances.
- `restartAfterLevel` narrows the reset trigger for that level. If a level
  defines `restartAfterLevel: 0`, that level resets when level 0 advances, but
  continues through level 1 sibling advances.
- Missing intermediate parent counters use that level's style `startAt`.
- Missing level 0 parent counters use the list instance `startAt` when present.
- Marker text is derived from counters plus the level pattern.
- Marker text must not be written back into paragraph children.
- Document validation rejects authored level jumps per list instance. The first
  item in an instance must be level 0, and a later item may move at most one
  level deeper than the previous item in that same instance.

Traversal order is part of the contract:

- Walk sections in document order.
- Start from each section `bodyRootId` and recursively follow `childIds`.
- `flow-row` children are visited by their `childIds`, so stacks are traversed
  left-to-right according to authored row order.
- `flow-stack` children are visited top-to-bottom by `childIds`.
- `flow-table` contents are visited by `rowIds`, then each row's `cellIds`, then
  each cell's `childIds`.
- Paragraphs sharing the same `instanceId` count through these containers. Use a
  different list instance when numbering should restart or stay independent.

Current v1 restart precedence is:

```txt
list level startAt < list instance startAt < paragraph list startAt
```

A boolean `restart` field is not active schema today. Add it only with an
explicit schema/version decision.

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
  bodyIndent: number
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
and `bodyIndent`.

For body paragraph pagination, list item lines are measured and positioned with
the list level's `bodyIndent` as the effective body start. This is runtime
layout state only and must not be written back into paragraph props.

Indent ownership:

- Normal paragraphs use `paragraph.props.indentLeft`, `indentRight`, and
  `textIndent`.
- Listed paragraphs use the resolved list level's `markerIndent` and
  `bodyIndent` as the primary marker/body geometry in v1.
- Existing paragraph indent props remain authored paragraph data, but they are
  not added on top of list indents by the v1 generated-marker path.
- Any future "additional indent" or paragraph-level list indent override needs
  a named schema field and tests; it must not be an implicit side effect of the
  current paragraph indent fields.

Preview rendering draws `listMarker.text` as generated SVG text from
`PageFragment.listMarker`. The marker is outside WYSIWYG caret, selection, and
paragraph text editing ranges.

Inline edit/draft geometry must use the same generated body start as preview
layout. A list item's WYSIWYG draft lines and any legacy textarea fallback must
start from `PageFragment.listMarker.bodyX` / the level `bodyIndent` at runtime,
without writing indentation or leading spaces back into
`ParagraphNode.children` or authored paragraph indent props.
When paragraph boxes or other content insets are present, draft layout must treat
`bodyX` as the absolute visual truth and convert it back to an effective
paragraph-local body indent from the paragraph content origin.

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
