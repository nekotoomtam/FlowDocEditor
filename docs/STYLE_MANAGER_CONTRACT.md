# Style Manager Contract

This contract defines the document-level Style Manager. Use it before changing
style-manager UI, style definition editing, default document styles, style
selection behavior, or future style deletion/history behavior.

## Decision

The Style Manager manages document-owned style resources.

Style Manager is not a selected-paragraph property panel. It is a document
resource browser/editor:

```txt
Left rail Styles tab -> selects a document style resource
Right rail Style Editor -> edits that selected style definition
Paragraph Property Panel -> applies/resets/detaches styles on selected nodes
```

Editing a style definition changes `document.styles.paragraphStyles[styleId]`.
It must not rewrite every paragraph that references the style. Paragraph
appearance changes through the existing style resolver and pagination boundary.

## Ownership

There are two style sources:

- App presets: built-in starter definitions shipped with FlowDoc.
- Document styles: cloned, document-owned definitions stored in the document.

Paragraphs must reference document styles, not app presets directly.

App presets are templates only. After a preset is cloned into
`document.styles.paragraphStyles`, the document-owned copy becomes the source of
truth for that document.

## Required Base Style

Every document should have at least one paragraph style.

The document should identify one base paragraph style:

```ts
document.styles = {
  baseParagraphStyleId: "tor.body",
  paragraphStyles: {
    "tor.body": { ... }
  }
}
```

The schema field is:

```ts
interface DocumentStyleDefinitions {
  baseParagraphStyleId?: string
  paragraphStyles?: Record<string, ParagraphStyleDefinition>
  textRunStyles?: Record<string, TextRunStyleDefinition>
}
```

Product rules:

- one base paragraph style must exist when paragraph styles exist
- new documents should start with a base paragraph style
- the base style cannot be deleted
- the base style can be edited
- new styles may copy from the base style or another existing style
- future style deletion can fall back to the base style

The base style represents the document's default paragraph appearance, not a
global application default.

## UI Model

The left rail gets a separate `Styles` tab.

The Styles tab lists document styles and style-adjacent document resources,
grouped by resource type. The first slice focused on paragraph styles:

```txt
Styles
  Paragraph styles
    Body
    Heading 1
    Heading 2
    Heading 3
    Table Body
    Signature
```

List style and list group behavior is defined in
`docs/LIST_STYLE_MANAGER_CONTRACT.md`. It may extend the same Styles tab with
read-only `List styles` and `List groups` before editable list controls are
introduced.

Selecting a style in the left rail creates a resource selection, not a node
selection.

The first UI slice may stop at left-rail resource selection. In that state, the
left rail can highlight the selected style resource while the right rail keeps
its existing page/properties behavior until the Style Editor shell is added.

The right rail shows a Style Editor when a style resource is selected. Selecting
a document node again returns the right rail to the normal node Property Panel.

The first Style Editor shell may render the selected style definition as a
read-only resource summary. Editable controls should be added only when they can
write through the semantic style-definition operations and history path.

The first editable Style Editor slice supports direct editing for paragraph
style definition fields that already flow through `ParagraphStyleProperties`:
name, font family, font size, text color, bold/italic/underline/strike,
line height, alignment, spacing, indents, heading level, keep-with-next, box
fill, box padding, and uniform box border style/width/color. Side-specific
border editing remains a later UI slice because it needs edge-aware controls.

## Data Layer

The first core read model lives in
`packages/core/src/document/styleManager.ts`.

It converts document-owned style resources into UI-ready resource items. The
paragraph slice converts paragraph style definitions:

- `buildStyleManagerState(doc)`
- `buildParagraphStyleManagerItems(styles)`

The data layer is intentionally read-only. It returns document-owned style
resources with base-style status, list-style summaries, list-group summaries,
and first-phase capabilities, but it must not mutate the document, create
styles, delete styles, or apply styles to paragraphs.

## Style Editor Scope

The first Style Editor should edit paragraph style definition fields already
supported by `ParagraphStyleProperties`:

- name
- font family
- font size
- text color
- bold, italic, underline, strikethrough
- line height
- align
- spacing before and after
- heading level
- keep with next
- box fill, padding, and border when practical

It must not edit:

- list numbering identity or list instance state
- field values or data snapshots
- generated content
- paragraph children
- text-run inline styles
- migration/history metadata

## Behavior Rules

Editing a style definition:

- changes only the document style definition
- creates one undo/history operation
- affects referenced paragraphs through resolver output
- does not clear paragraph `styleOverrides`
- does not rewrite `children[].style`

Core operation entry points for the first Style Editor are:

- `patchParagraphStyleDefinition(doc, styleId, patch)`
- `renameParagraphStyleDefinition(doc, styleId, name)`

Paragraph-level operations keep their current meanings:

- Apply style: set a paragraph's `paragraphStyleId`.
- Reset: clear local `styleOverrides`.
- Detach: copy effective appearance into direct props, then remove style
  metadata.
- Clear: remove style metadata while preserving current direct props.

## Deletion Policy

Style deletion is out of scope for the first Style Manager implementation.

Future deletion rules:

- the base style cannot be deleted
- unused non-base styles can be deleted
- used non-base styles must offer an explicit resolution path
- acceptable future resolution paths include replace with base style, detach
  affected paragraphs, or cancel

The first implementation should not silently replace paragraph style references
when deleting a style.

## History And Diff

Style definition editing should be recorded as a style definition change, not as
many paragraph node changes.

Good future diff language:

```txt
Style changed: Body
- fontSize: 12pt -> 13pt
- lineHeight: 1.5 -> 1.35
Affected paragraphs: derived from references
```

Paragraph renumbering, field resolution, generated content, and migrations are
separate concerns and must remain out of the first Style Manager phase.

## Minimal Implementation Path

Phase 1:

- ensure loaded/new documents can have a base paragraph style
- add left rail Styles tab
- add resource selection state for selected style id
- add right rail Style Editor shell
- edit document-owned paragraph style definitions through semantic operations
- cover resolver-driven behavior with focused tests

Phase 2:

- add richer style editing controls
- add create/copy style
- show affected paragraph count
- polish style preview

Phase 3:

- design style deletion
- design migration/history semantics

## Test Expectations

Style Manager changes should cover:

- document style definition edits do not rewrite paragraph nodes
- referenced paragraphs change through style resolver output
- paragraph `styleOverrides` continue to win over style definitions
- base style cannot be deleted once deletion exists
- selecting a style resource opens Style Editor instead of node Property Panel
- switching back to a node restores normal Property Panel behavior
