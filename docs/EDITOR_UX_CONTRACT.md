# Editor UX Contract

This document defines the editor interaction behavior FlowDocEditor should
protect as it grows from document generation into a workflow-ready editor.

The engine can be correct and still feel unusable if the editor jumps, flickers,
selects the wrong structure, or makes undo/redo feel random. This contract keeps
those user-facing expectations explicit.

## Ownership

- The editor owns interaction state: selection, hover, drag, resize, caret,
  inline edit, mode, loading, and temporary preview state.
- Core owns document semantics and layout contracts.
- Editor UI should call core operations or update schema-valid authored props.
- Editor-only state must not be stored in `DocumentNode`.

## UX North Star

The editor should feel stable, predictable, and inspectable.

Users should be able to:

- click the structure they intend to edit
- type without text disappearing
- undo and redo by human editing intent
- adjust tables without the table unexpectedly changing total width
- see layout/status problems clearly
- trust that preview will reconcile to authoritative pagination

## Panel Information Architecture

- The top workflow navigation communicates the current document-authoring
  phase: `Design`, `Fields`, `Fill`, and `Render`. These phases are user-facing
  workflow language, not new document-model states.
- The left rail owns document overview and add-entry tools. `Outline` shows the
  logical document tree; `Add` hosts block and field palette entry points.
- The center canvas owns the paged visual editing surface and should not need to
  carry broad document-structure navigation tools.
- The right rail owns details for the current task: `Properties` for the
  selected or active object and `Page` for section/page setup.
- `Design` should default to outline/layout editing, `Fields` should surface
  field-related entry points without changing document schema, `Fill` should use
  the existing fill-mode locking rules, and `Render` should surface export
  readiness/actions without bypassing the export gate.
- The `Outline` header may expose a compact add shortcut that switches the left
  rail into `Add`; item-level contextual add remains deferred until its
  interaction rules are explicitly designed.
- Outline reorder is limited to direct children of a section `body`, within the
  same section body. It mutates only the logical `body.childIds` order through a
  core document operation.
- A six-dot grip on a direct body-child outline row is the drag affordance for
  this reorder. Nested outline nodes, stack children, table/flow-table rows and
  cells, canvas row handles, and cross-section reorder remain out of scope.
- During outline reorder, the editor should show a custom drag ghost containing
  the dragged row icon and label, dim the source row as an in-place placeholder,
  and highlight the active target row/drop edge. The ghost is editor-only
  interaction state and must not become document data.
- Outline rows may use subtle depth lanes: each nested row can show faint
  vertical guide marks on the left, while its tint begins at that depth lane
  rather than filling the whole row from the panel edge. The tint and guides
  must remain subtle and yield to selected, hover, drag source, and drop-target
  states.

## Selection Rules

- Single-clicking a normal body paragraph enters or prepares paragraph editing
  according to the current editor mode.
- Single-clicking rendered content inside a table cell selects the parent
  `table-cell`, not only the internal paragraph.
- Structural containers such as rows, stacks, tables, table rows, and table cells
  should be selectable when their properties are editable.
- Flow Table cell hit targets take priority over row chrome. `flow-table-row`
  fragments are visual-only in the canvas until a dedicated row handle/gutter
  exists, so row chrome does not steal clicks from merged or row-spanning cells.
- Selection should not silently mutate the document.
- Background clicks should clear selection and close inline edit through the
  normal edit transaction path.

## Property Panel Rules

- Primary labels, values, and commands should remain visible without requiring
  hover help.
- Repeated explanatory rule text may use a compact `InfoHint` beside the
  relevant label when showing the full text would clutter the panel.
- `InfoHint` should explain constraints, consequences, or safer alternatives.
  It must not hide required field names, current authored values, or destructive
  action warnings.

## Paragraph Box Style Rules

Paragraph box styling is defined in
`docs/PARAGRAPH_BOX_STYLE_CONTRACT.md`.

- Box style is authored document content, not editor-only chrome.
- Version 1 is limited to fill, four-sided padding, and four-sided border.
- Rounded corners, shadows, opacity, gradients, and CSS-like decoration are out
  of scope for the first supported box style.
- Property-panel box controls should be grouped separately from text controls.
- Editor selection outlines must remain visually distinct from authored
  paragraph borders.
- PDF/editor preview should match authoritative paginated box geometry. DOCX is
  allowed to be best-effort where Word paragraph formatting cannot match the
  PDF/editor exactly.

## Inline Editing Rules

- Inline editing should preserve visible text.
- Entering edit mode should not trigger unnecessary full re-pagination that
  causes visible collapse/flicker.
- Active paragraph input/caret events are captured by the textarea during
  editing, but visible text should come from the document renderer whenever the
  active draft has a fresh paginated snapshot.
- The textarea inline editor is a plain-text bridge only. Paragraphs containing
  fields, page numbers, or other non-text inline nodes should not enter textarea
  editing or be rewritten through property-panel textareas.
- During inline paragraph editing, browser pagination may run against
  `previewDoc` with the active draft and update the canvas as optimistic visual
  layout so long paragraphs can show continuation fragments before blur.
- For same-page body paragraph draft growth/shrink, the active draft visual
  preview must move downstream fragments by the active paragraph height delta so
  typing a new wrapped line does not visually overlap the next block while the
  edit is still active.
- When entering inline edit and the active edit visual snapshot is fresh for
  the current draft, the active fragment may render the same SVG
  `fragment.lines` used by normal mode and make textarea text transparent. This
  keeps edit entry visually close to normal mode.
- When the active edit visual snapshot is stale, the textarea must keep visible
  text as a fallback so fast typing never makes text disappear.
- After text input, edit mode should hand back to the SVG/document visual layer
  as soon as browser pagination catches up to the active draft. The textarea may
  be visible only as a short stale-frame fallback, or for composition/IME states
  that are not yet safe to render through the paginated layer.
- The active typing lock should start from keyboard interaction before native
  textarea input lands, not only after React observes the input event, so a
  normal typing burst does not insert characters into a transparent textarea
  before the fallback layer appears.
- When the active draft has fresh SVG lines and the textarea selection is
  collapsed, the editor should draw the collapsed caret from paginated line
  geometry and hide the native textarea caret.
- The active custom caret should blink while the editor focus remains in the
  inline text session. A caret-only move must keep the SVG caret visible and
  must not require document or pagination changes.
- In the FlowDoc-owned text-engine lane, ArrowLeft/ArrowRight/ArrowUp/ArrowDown
  should update the transient caret/selection state from FlowDoc text and line
  geometry. Vertical ArrowUp/ArrowDown navigation should use the rendered
  `fragment.lines` order and preserve the user's visual x target across
  shorter or longer adjacent lines.
- When a single active fragment has fresh SVG lines and range-selection geometry
  can be resolved, drag/range selection may stay in document-visual mode and
  draw SVG highlight rectangles from paragraph offsets. If the custom caret or
  selection overlay cannot be resolved, or composition is active, the editor
  should fall back to visible textarea text/native caret.
- Programmatic focus/selection on edit entry should not force the visible
  textarea layer. `onSelect` may update caret state without changing the visual
  owner.
- Pointer clicks used only to place the native caret should not force the
  visible textarea layer by themselves; otherwise a second click can reveal
  textarea layout drift before the user actually edits text.
- The editor should avoid showing both layers visibly at the same time.
- Page splitting and non-active continuation fragments still come from
  `PaginatedDocument`.
- Full browser/server pagination should reconcile after edit settles or exits.
- Continuation fragments need extra care: only the clicked fragment should enter
  edit mode, and continuation text/caret offsets must remain slice-aware. The
  active textarea must hold only the current fragment text slice when line
  segment ranges are available, while preserving stable prefix/suffix context
  so edits reconstruct the full paragraph without duplicating text.
- Active textarea instances must be keyed by their fragment slice identity, not
  only paragraph id, so remounted continuation slices do not reuse stale DOM
  values with a new `preText` prefix. Slice context should remain stable while
  the same textarea is active, even if browser pagination updates line ends
  during a typing burst.
- When segment offsets are available, the active inline textarea may move to the
  paginated fragment/page containing the current caret. The caret index remains
  UTF-16 text-offset based and must not become page geometry stored in
  `DocumentNode`. Relocation should wait while the active typing visual lock is
  held or the document visual is stale so keystrokes are not delivered into a
  remounting textarea.
- Caret movement without text changes should update editor caret state without
  dispatching a document draft update.
- Blur from remounting/repositioning the active inline textarea should not
  finalize the edit session if focus lands on the replacement textarea for the
  same paragraph.
- Enter and Backspace inside inline edit should operate on full paragraph text
  offsets even when the active textarea is rendering only a continuation slice.
  Backspace at the start of a continuation slice should edit across the
  continuation boundary, not merge the paragraph unless the caret is at the true
  start of the full paragraph.
- Plain Enter in inline textareas should insert a newline in the current
  paragraph while textarea is the bridge editor. Structural paragraph split is
  deferred to a more explicit command or the WYSIWYG track.
- Structural Backspace merge should keep the user in an active textarea when
  possible and must not reuse stale SVG paragraph snapshots as the edit visual.
- Backspace at the true start of a table-cell paragraph should not call the
  body-paragraph merge operation.
- When the flagged WYSIWYG text engine is enabled, paragraphs inside `table-cell`
  and `flow-table-cell` should use the same active paragraph text-engine path as
  body paragraphs. Table-cell boundary Backspace remains table-specific.

## Undo/Redo Rules

- One intentional inline edit session should become one undo history entry.
- Undo/redo history should restore both document data and the pagination snapshot
  needed for stable visual restoration.
- Typing drafts should not flood undo history.
- Exiting edit with no text change should not create a meaningless history step.
- Current Fill mode policy: template undo/redo is disabled while filling. Field
  inputs may use native browser input undo; dedicated submission history is
  deferred.

## Table Editing Rules

Table-specific interaction rules are defined in
`docs/TABLE_EDITING_CONTRACT.md`. Editor UX expectations include:

- table cells are reachable from the canvas
- the table-cell panel exposes cell-level controls
- insert/delete column preserves total table width
- row `allowBreak` and table `headerRowCount` are visible authored controls
- table operations should not leave the editor in an invalid document state
- Flow Table row chrome is geometry/debug state only until a dedicated row
  handle exists; it should not draw visible row labels, fills, strokes, or
  selection outlines over merged cell hit areas.
- margin resizing with tables should expose a visible, predictable drag affordance
  and enough feedback that users understand the table is being reflowed.

## Flow Row Editing Rules

- Adding a column from a selected `flow-row` is a global row action: it adds one
  empty `flow-stack` and rebalances all direct child stack width shares equally.
- Adding a column from a selected `flow-stack` edge is a local action: it inserts
  before or after that stack by splitting only the selected stack width share.
- `flow-stack` width changes should be sibling-safe: the user chooses the
  neighboring column to resize against, only that pair changes, and the owning
  `flow-row` width shares must still total exactly `100`.
- The current `flow-stack` minimum width is an interaction guard, not a
  content-measured layout minimum. The preferred minimum is `8%` per column,
  with an adaptive lower effective minimum for already narrow sibling pairs.
- Property-panel pair resize and canvas pair resize are the safe paths for
  `flow-stack` width edits. Canvas drag resize must use the same sibling-safe
  pair rule: only the two stacks around the dragged divider change.

## Preview And Authoritative Layout

- Browser pagination is allowed as a fast interaction preview.
- Server/API pagination is authoritative for final layout status and export.
- Preview drift should be measurable, not hidden.
- The editor may show optimistic layout while editing, but it should settle back
  predictably.
- Layout assertion failures and font fallback should be visible to the user.
- Header/footer fragments in `PaginatedDocument` should be inspectable in the
  editor preview as read-only content. They should not intercept body
  selection, inline editing, drag, resize, or table editing unless a separate
  header/footer authoring mode is designed and accepted.
- Layout warnings shown after the current `previewDoc` reconciles through
  `/api/paginate` should come from the server `PaginatedDocument`. Optimistic
  browser-preview warnings are only a temporary pre-reconcile signal and should
  not override the current server result.

## WYSIWYG Track Guardrails

The WYSIWYG editor track is documented in
`docs/WYSIWYG_EDITOR_ROADMAP.md`. It is an opt-in/internal future path until its
stability gates pass.

- WYSIWYG work must not change the document model first.
- `PaginatedLine` / `fragment.lines` are visual truth; textarea remains an input
  device, not layout truth.
- The editor may fall back to visible textarea text during composition or other
  unstable states.
- Caret milestones must not include selection overlay work by default.
- Cross-page selection is deferred until single-page paragraph selection is
  stable.
- Caret candidates are a separate contract from line segments; segments provide
  coarse measured ranges, not final caret boundaries.

## State Race Invariants

The editor may hold multiple derived views of the same document while the user
is typing, undoing, or waiting for server pagination. These views must stay
classified:

- `state.doc` is the authored template document.
- `previewDoc` is the current authored/resolved document used for preview,
  filling, pagination requests, and export requests.
- `state.paginated` is a visual layout snapshot. It may be optimistic or
  restored from history, but it must not become authored document truth.
- Stale `/api/paginate` responses must not overwrite newer document or layout
  state.
- Inline edit drafts may update authored text without pushing history while the
  edit is active. Ending one intentional edit session should create at most one
  undo entry.
- Undo/redo should restore document data and its matching paginated snapshot
  together so redo does not briefly show a different layout.
- Export may be triggered while the editor is optimistic or reconciling, but it
  must not produce a file until the current `previewDoc` has been checked by
  server/API pagination and unsafe font, drift, or fill-readiness state is
  cleared. Blocking drift includes page-break changes, paragraph continuation
  changes, line wrapping changes, split-boundary movement, and tracked geometry
  drift across body, header, footer, and TOC fragments. Layout fragment warnings
  such as forced table split overflow must be visible from the current server
  pagination result and block final export until resolved. Fill mode final
  export must also block missing required field values.
  When export does run, it must call `/api/export` with the current `previewDoc`
  and let the API paginate and assert output. It must not serialize the current
  canvas snapshot.
- Selection, caret, drag, resize, and inline-edit transaction snapshots are
  ephemeral interaction state only.

## Status And Feedback

The editor should surface important degraded states:

- font fallback when server/API uses fallback font metrics
- layout assertion failure from `/api/paginate`
- optimistic layout while authoritative pagination is pending
- drift information when the drift overlay is enabled
- layout fragment warnings from pagination output
- export blocking reasons when authoritative layout, font, drift, or fill data
  readiness is unsafe, including missing required values for final export

Silent degraded layout is worse than a visible warning.

## Browser Smoke Expectations

Meaningful editor UX changes should get a focused browser check. Use the
smallest scenario that covers the risk.
Detailed check steps and evidence expectations live in
`docs/BROWSER_SMOKE_CHECKLIST.md`.

Common checks:

- paragraph edit: type, wrap, blur, undo, redo
- split paragraph edit: enter edit on the intended fragment and verify no
  obvious collapse/flicker
- table cell: select from canvas and confirm `TABLE-CELL` panel appears
- table operation: insert/delete column and confirm table outline/count changes
- status: confirm no unexpected layout error appears

The browser check does not replace core tests. It protects human-facing feel.

## Accepted Current Limitations

- Some advanced editor behaviors are still delivered in slices.
- Browser preview can temporarily differ from server/export pagination.
- DOCX may reflow after opening and is not an exact editor/PDF visual match.
- The first live inline pagination slice improves visual continuity before blur,
  and active textarea page tracking now follows segment offsets when available.
  Continuation-slice typing, Enter/Backspace mapping, and same-fragment drag
  selection overlays are covered, but cross-fragment text selection and fully
  caret-perfect WYSIWYG editing remain deferred.

Accepted limitations should be documented and should not become invisible
regressions.

## Change Rule

If an editor change affects selection, inline edit, undo/redo, table editing,
preview reconciliation, or visible layout stability:

- update this contract if the expectation changed
- update `docs/WORK_LOG.md`
- choose verification using `docs/TEST_STRATEGY.md`
- browser-check the main interaction risk when practical
