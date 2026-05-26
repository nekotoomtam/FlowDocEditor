# List Style Manager Contract

This contract defines how FlowDoc exposes list styles and list groups to users.
Use it before changing style-manager UI, list style editing, list group
selection, list context inspection, or paragraph-list property behavior.

## Decision

List authoring is split into three concepts:

```txt
List Style = numbering appearance and level geometry
List Group = numbering scope shared by paragraphs
Paragraph.list = this paragraph belongs to a group at this level
```

The internal schema name for a List Group is `ListInstance`. The user-facing UI
may call it `List Group` because that is the useful mental model when selecting
or inspecting a set of related numbered paragraphs.

List Style Manager must not turn lists into wrapper nodes. Paragraphs remain in
normal document flow. Group membership is derived from
`paragraph.props.list.instanceId`.

## Relationship To Existing Models

The list numbering model remains the engine source of truth:

```txt
document.listStyles -> list style definitions
document.listInstances -> list groups / numbering instances
paragraph.props.list.instanceId -> group membership
paragraph.props.list.level -> level within the group
paragraph.props.list.itemId -> semantic list item identity
numbering resolver -> generated visible marker
```

List Style Manager must not store generated marker text in paragraph children.
Visible labels such as `1.`, `1.1`, `(1)`, or `•` remain derived output.

Paragraph styles and list styles are separate:

- paragraph styles define text appearance, spacing, heading state, and box style
- list styles define marker format, marker indent, body indent, and level rules
- list groups define which paragraphs share a numbering stream

When a paragraph is both a heading and a list item, it may have both
`headingLevel` and `props.list`.

## TOC Boundary

List Group is not a TOC group.

TOC generation is based on heading/outline semantics. A heading may also be a
list item, but that does not make TOC responsible for list numbering.

Current and near-term rule:

```txt
headingLevel -> entry belongs in TOC
paragraph.props.list -> heading has generated marker text
TOC entry text -> may include resolved list marker plus paragraph text
```

For example, a TOR clause heading can be:

```ts
props: {
  headingLevel: 1,
  list: {
    instanceId: "tor-main",
    level: 0,
    itemId: "tor.background",
  },
}
```

This means "include this paragraph in TOC" and "derive its visible clause
number from `tor-main`." These are two different authored facts.

Headings that are not real list items, such as appendix titles or manually
authored chapter labels, should not be forced into List Groups only because
their visible text looks numbered.

## UI Model

List Group visibility belongs primarily in the Outline because a group is a
set of document paragraphs, not a style resource. The Outline may render
virtual contiguous list-group runs derived from sibling paragraph
`props.list.instanceId` values:

```txt
Outline
  List Group: TOR Main
    1. Background
    1.1 Objective

  Paragraph

  List Group: Bullet Scope
    • Requirement input
    • Schema draft
```

These wrappers are editor chrome only. They must not create wrapper nodes,
change `body.childIds`, change stack `childIds`, or rewrite paragraph
`props.list`.

The same virtual grouping rule applies inside nested paragraph containers that
own ordered child content, including `stack`, `flow-stack`, and
`flow-table-cell` content. A `flow-table` may expand in Outline as table rows
and cells so list groups inside a cell are discoverable, but those row/cell
entries are still editor read UI and must not change numbering scope by
themselves.

The app Outline should derive this tree through a pure read model before
rendering. The read model owns container expansion and virtual
`list-group-run` items; the React panel should render those items rather than
reimplementing document traversal inline.

The left rail `Styles` tab may show more than paragraph styles:

```txt
Styles
  Paragraph styles
    Body
    Heading 1

  List styles
    TOR Clause
    Parenthesized Number
    Bullet

  List groups
    TOR Main
    Qualification Documents
    Appendix A
```

Selecting a List Style opens a List Style Editor in the right rail.

Selecting a List Group opens a List Group Inspector/Editor in the right rail.
The group view should answer "what group am I looking at?" before it offers
mutating actions.

The Styles tab List Groups slice is allowed as a read/debug surface, but the
normal user-facing place to discover "which group is this paragraph in?" is the
Outline and paragraph List Context.

The paragraph Property Panel should not become the full list editor. It may show
a List Context section for the selected paragraph:

```txt
List
  Group: TOR Main
  Style: TOR Clause
  Level: 2
  Number: 3.2.1
  Items in group: 18
  [Select group] [Edit style]
```

That section is an inspector and quick-action surface. It should not replace the
document-level List Style Manager.

The `Select group` quick action should open the Outline and select the virtual
List Group run. The `Edit style` quick action may open the Styles tab/List
Style editor because List Style is the document resource being edited.

## List Style Editor Scope

The first editable List Style Editor should focus on fields that already exist
on `ListLevelDefinition`:

- level selection, exposed as user levels 1 through 8
- marker format
- marker pattern
- start at
- marker indent
- body indent
- tab stop when needed
- restart-after-level when needed

Marker color, font, size, and text emphasis should inherit from the paragraph
render props in the first phase. Dedicated marker text styling needs a separate
schema decision because preview, PDF, DOCX, and history must agree.

Side effect rule: editing a List Style changes the style definition used by
referencing groups. It must not rewrite paragraph children or paragraph text.

## List Group Scope

A List Group represents a numbering scope. It is useful even when the user does
not want to split or merge groups, because it tells them which paragraphs are
counted together.

User-facing list creation should create a List Group immediately. A toolbar
command such as `1.`, `(1)`, or `•` should not silently reuse one global default
instance for unrelated paragraphs. The new group can be auto-named from its id
until editable display names exist, and the UI should select/open that group so
the user can see what was created.

A List Group view should show:

- group id and future display name
- list style id and style label
- start-at value when present
- item count
- first and last resolved marker when available
- selected paragraph membership when opened from a paragraph

Future group editing may support:

- rename group
- change group style
- set or clear group start-at
- select/highlight all items in the group
- create a new group from a selected range
- continue another group by assigning the same `instanceId`

Range-based group splitting or continuing is out of scope until selection and
history semantics are explicit.

## Display Names

Current list schema stores ids but not user display names. The first read-only
manager may derive labels from known preset ids or from the raw id.

Before editable user naming is added, the schema should explicitly accept
display names on list styles and list groups, for example:

```ts
interface ListStyleDefinition {
  id: string
  name?: string
  levels: ListLevelDefinition[]
}

interface ListInstance {
  id: string
  name?: string
  styleId: string
  startAt?: number
}
```

Do not overload `id` as a mutable display label. Ids remain stable references.

## Read Model

The first data layer should be read-only and derived from the current document:

- list style items from `document.listStyles`
- list group items from `document.listInstances`
- group item counts from paragraph traversal
- selected paragraph list context from `paragraph.props.list`
- resolved marker text from the numbering resolver

The read model must follow the same document-order traversal used by list
numbering. It must not walk only top-level body ids if list items can exist in
flow rows, stacks, or table cells.

## Behavior Rules

List manager behavior must preserve these boundaries:

- editing List Style does not edit Paragraph Style
- editing List Group does not edit paragraph text
- selecting a group is not the same as selecting a wrapper node
- generated marker text is not authored text
- TOC headings are not list groups
- paragraph-level indent props are not silently added on top of list
  `markerIndent` / `bodyIndent`

Core list operations should stay semantic:

- apply or clear list metadata
- change list level
- restart at paragraph or group level
- set group style
- create or rename style/group only through explicit operations

UI code should not manually compose partial list structures when an operation
exists.

## Minimal Implementation Path

Phase 1:

- add List Style Manager read model
- expose List Styles and List Groups in the existing Styles left rail
- add read-only right-rail panels for selected list style and list group
- add focused tests for item labels, group counts, and selected group state

Phase 2:

- add selected-paragraph List Context inspector
- show group/style/level/resolved marker/item count
- add "Select group" and "Edit style" navigation actions

Phase 3:

- add schema display names if accepted
- add rename operations for list styles and list groups
- keep ids stable

Phase 4:

- add editable List Style controls for level pattern, format, start-at,
  marker indent, and body indent
- verify preview/PDF/DOCX marker geometry

Phase 5:

- add editable List Group controls for style selection and start-at
- defer range split/continue until selection/history behavior is designed

## Test Expectations

List Style Manager changes should cover:

- read model lists all document list styles
- read model lists all document list groups
- group item count follows real paragraph traversal order
- selected paragraph context resolves group, style, level, marker text, and
  item count
- selecting a List Style does not select a paragraph node
- selecting a List Group does not create a wrapper node
- editing a list style/group does not mutate paragraph children
- TOC collection remains heading-based, not group-based
