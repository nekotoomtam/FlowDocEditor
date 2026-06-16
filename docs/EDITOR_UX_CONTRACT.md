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
- Long documents may virtualize off-viewport page rendering in the center
  canvas, but page frames used for scrolling/navigation must remain present and
  virtualization must not change authored document state, pagination output,
  undo/redo, PDF export, or DOCX export behavior.
- Long document startup may show a lightweight pagination shell and complete
  browser preview pagination in a background worker. Until that preview result
  returns, the editor should show a preparing-layout state instead of exposing
  stale document/page geometry for editing. This is an editor responsiveness
  optimization only; core pagination, server/API pagination, export, undo/redo,
  and authored document state remain unchanged.
- Browser preview layout readiness is explicit editor state:
  `placeholder`, `settling`, `partial`, or `full`. The editor may use
  non-full states for responsive preview behavior, but final export readiness
  must not treat a non-full browser preview layout as complete. The `partial`
  state is an editor-only display lane for visible-window pagination. It must
  not be written into reducer history, undo/redo snapshots, export payloads, or
  server-owned pagination state unless a later design promotes it intentionally.
  Browser workers may emit partial layout only for structures with explicit
  partial-pagination support; unsupported structures must stay on the full
  pagination path.
- The right rail owns details for the current task: `Properties` for the
  selected or active object and `Page` for section/page setup.
- `Design` should default to outline/layout editing, `Fields` should surface
  field-related entry points without changing document schema, `Fill` should use
  the existing fill-mode locking rules, and `Render` should surface export
  readiness/actions without bypassing the export gate.
- The `Outline` header may expose a compact add shortcut that switches the left
  rail into `Add`; item-level contextual add remains deferred until its
  interaction rules are explicitly designed.
- The Add panel may expose `Divider` as an authored visible block in document
  and header/footer-safe scopes. It may expose `Page break` only in document
  body scope until non-body semantics are designed. It may expose `TOC` only in
  document body scope as an authored placeholder for generated heading entries.
  Body-flow TOC renders as an isolated generated page: pagination starts it on a
  clean page and moves following body content to the next page without inserting
  an authored `page-break` node. TOC entries are collected from direct body
  paragraph headings only; heading-styled paragraphs inside stacks, columns, and
  table cells are visual/local headings in this slice. Paragraph heading controls
  and heading paragraph presets should be exposed only when the selected paragraph
  is a direct body child.
- Outline reorder is limited to direct children of a section `body`, within the
  same section body. It mutates only the logical `body.childIds` order through a
  core document operation.
- Outline reorder must not create invalid list hierarchy. If a direct body-child
  list item is reordered, the core operation should move that item as a
  contiguous list subtree segment: the source item plus following body children
  in the same list instance whose list level is deeper than the source level.
  Moving a source into its own subtree is invalid and must leave the document
  unchanged. If the resulting body order would make a list instance start at a
  nested level or jump by more than one level, the core operation must also
  leave the document unchanged. Automatic list-level repair remains out of
  scope until an explicit design accepts authored level changes.
- Outline should expose invalid list reorder targets as blocked drop targets
  with no-drop feedback and an accessibility status. Dropping on a blocked
  target may still pass through the editor action lifecycle so active drafts are
  finalized, but the core operation remains responsible for leaving the
  document unchanged.
- A six-dot grip on a direct body-child outline row is the drag affordance for
  this reorder. Nested outline nodes, stack children, flow-table rows and cells,
  canvas row handles, and cross-section reorder remain out of scope.
- During outline reorder, the editor should show a custom drag ghost containing
  the dragged row icon and label, dim the source row as an in-place placeholder,
  and highlight the active target row/drop edge. If a list source will move
  deeper same-instance child items with it, the ghost should expose that child
  count as an editor-only affordance. The ghost is editor-only interaction state
  and must not become document data.
- Outline rows may use subtle depth lanes: each nested row can show faint
  vertical guide marks on the left, while its tint begins at that depth lane
  rather than filling the whole row from the panel edge. The tint and guides
  must remain subtle and yield to selected, hover, drag source, and drop-target
  states.

## Selection Rules

- Single-clicking a normal body paragraph enters or prepares paragraph editing
  according to the current editor mode.
- Single-clicking rendered content inside a table cell selects the parent
  `flow-table-cell`, not only the internal paragraph.
- Structural containers such as rows, stacks, tables, table rows, and table cells
  should be selectable when their properties are editable.
- Flow Table cell hit targets take priority over row chrome. `flow-table-row`
  fragments are visual-only in the canvas until a dedicated row handle/gutter
  exists, so row chrome does not steal clicks from merged or row-spanning cells.
- Selection should not silently mutate the document.
- The canvas may show a breadcrumb-style selection path as editor-only chrome.
  Hover paths are preview-only and must not change selection. Selected paths may
  expose clickable context nodes, but clicking them is still selection state only
  and must not create a document history entry.
- Normal node chrome must not use per-node background tint as the primary
  structure cue. Authored fills, active edit previews, selection outlines,
  resize affordances, and read-only zone backgrounds remain allowed.
- Rich text toolbar scope indicators are editor-only affordances. They should
  communicate the command target (`Paragraph`, `Next text`, or `Selected text`)
  without becoming document data or creating history entries.
- The canvas may show a selected-node action rail as editor-only chrome. The
  rail is action-focused, separate from the path, and should stay selected-only
  so hover remains preview-only. Drag, duplicate, and delete actions must route
  through the normal editor lifecycle and history behavior.
- Divider and page-break fragments should be selectable and draggable like other
  authored body blocks. The page-break marker is editor chrome for an authored
  control node; it is not PDF output text and must not be confused with computed
  page-boundary drift.
- While dragging content, the same-page area below an authored page-break marker
  should render as a blocked drop area. Content after a page break starts on the
  next page, so the editor must not show a normal same-page insertion affordance
  there.
- Background clicks should clear selection and close inline edit through the
  normal edit transaction path.

## Property Panel Rules

- Primary labels, values, and commands should remain visible without requiring
  hover help.
- Repeated explanatory rule text may use a compact `InfoHint` beside the
  relevant label when showing the full text would clutter the panel.
- Divider line color, style, and width controls should use the same compact
  visual language as paragraph/box border controls. Divider spacing should be
  presented as above/below spacing around the line, with bounded UI controls so
  authoring cannot accidentally create extreme gaps from normal panel edits.
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
- Current active-edit baseline: for text-only paragraphs, input, caret, and
  selection are captured by the native edit layer during active typing. This is
  a stability-first baseline to avoid delayed feedback, text overlap, and
  visual jitter while the user is typing.
- A future FlowDoc-owned parity target may move active text, caret, and
  selection visuals back to measured FlowDoc geometry, but that target is not
  the current active typing baseline. Do not re-enable SVG live echo, SVG draft
  replacement, custom-caret-only rendering, or measured draft-line swapping for
  active typing bugs unless a later task explicitly changes this contract.
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
- During active text-only paragraph editing, the native edit layer is the single
  visual truth. It owns visible text, caret, and selection until the edit
  session exits; the measured SVG paragraph text, unmeasured live echo, local
  SVG draft replacement, and measured draft lines must not be visible for that
  active paragraph at the same time.
- The native edit layer must be positioned over the paragraph content box and
  inherit the paragraph typography closely enough to avoid edit-entry drift.
  It must not collapse wrapped paragraph text into a single line, visually
  overlap old text, or switch visual modes during a typing burst.
- The native edit layer should start at the measured text block, using the
  first visible FlowDoc line `y` when available instead of the broader fragment
  rectangle top. Geometry/height sync that reads textarea layout must run after
  visible native input feedback, be throttled, and update chrome only when the
  native height changes.
- Text input feedback must not wait for paragraph measurement. The native layer
  keeps local draft state immediately while parent/session draft sync may be
  coalesced behind it.
- On blur, Escape, or commit, the native layer may remain visible in a
  committing state until the measured FlowDoc layout for the committed draft is
  ready. The editor should then swap back to measured SVG layout once, rather
  than briefly showing stale responsive preview lines.
- During active WYSIWYG table-cell edits, draft reflow or page-boundary
  continuation may scroll the editor canvas just enough to keep the SVG caret
  visible. This is viewport-only editor state and must not mutate document
  content, pagination semantics, history, PDF, or DOCX export.
- WYSIWYG edits must not draw unmeasured live-echo text over old
  `fragment.lines`. During active native editing, live echo, SVG draft
  replacement, and measured draft-line swapping are disabled so there is no
  second visual truth fighting the native layer.
- Table-cell WYSIWYG edits should not draw the unwrapped live-echo caret over
  responsive pagination results. For text-only table-cell paragraphs, the
  native edit layer remains the active visual owner while table geometry catches
  up, then measured FlowDoc layout resumes after commit/settle.
- During active table-cell native editing, editor-only visual preview/chrome may
  exist before responsive draft pagination settles. The healthy lifecycle is:
  reflow decision -> visual preview/chrome created or updated -> draft
  pagination scheduled -> browser-preview pagination -> draft pagination state
  clears -> visual preview/chrome clears. Final settled state must keep the
  native edit layer stable, keep legacy SVG/live-echo/draft-replacement paths
  absent, and leave `data-wysiwyg-table-cell-visual-chrome` count at `0`.
  Visual chrome may temporarily reach the pre-clear count, currently observed as
  `6`, before pagination settles; future scheduling changes must preserve or
  explicitly await the clear step.
- In the FlowDoc-owned text-engine lane, printable Space input must insert a
  literal U+0020 space whether the browser reports the key as `" "`, `Space`,
  or `Spacebar`.
- Editor SVG text layers must preserve authored interior whitespace when
  drawing text. Line-edge whitespace trimming remains a layout/document policy,
  so the active WYSIWYG edit layer may draw an editor-only trailing-whitespace
  caret overlay to show the caret advancing over draft spaces without changing
  pagination, export, or stored document semantics.
- Immediate text-engine visual state should avoid repeated synchronous flushes
  during key-repeat bursts. Key repeat must not create document history,
  pagination, paragraph measurement on every keypress, or nested-update loops
  beyond the actual text changes.
- Measured FlowDoc layout remains the final visual source of truth after the
  edit settles. The native edit layer is only the active-session visual owner
  for immediate typing feedback and commit handoff.
- Text-changing WYSIWYG draft sync may coalesce parent/session updates to the
  latest payload across a short quiet window so typing, Space repeat, Backspace
  repeat, and line wrapping do not push every key through the whole editor tree.
  The local active paragraph remains the immediate visual truth while the parent
  sync is pending. Pending draft sync must still flush before edit completion,
  blur completion, rich text toolbar focus, rich text shortcut handling, and
  unmount cleanup so commit/style commands never read a stale final character.
  Stale parent props must not overwrite a newer local draft while that local
  draft is still the active visual truth.
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
- In the rich text draft lane, non-layout run styles (`textColor`,
  `textDecoration`, `strikethrough`) may use an active-paragraph visual preview
  instead of full draft pagination when the paragraph is not inside row-stack,
  Flow Stack, or Flow Table layout. Layout-affecting styles and complex
  containers must continue through draft pagination.
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
- Pointer/range selection may coalesce move events to the latest position per
  animation frame, and duplicate caret/selection offsets should be ignored.
  Selection remains editor/session state only and must not dirty document
  content or layout history by itself.
- During pointer-drag range selection, the active WYSIWYG text layer may render
  a local selection preview and defer syncing the authoritative editor session
  selection until pointerup/cancel resolution. The preview must remain local to
  the text layer, use the same FlowDoc line geometry, and must not create
  document history or pagination state.
- While that pointer-selection overlay is active, wheel input may be forwarded
  to the editor canvas scroll container so the user can continue extending a
  selection through vertically distant content. This is editor-only interaction
  behavior and must not mutate document content or history.
- Rich text toolbar display/scope state may debounce non-collapsed range
  selections during pointer drags, but toolbar commands must apply to the
  latest live text selection rather than the debounced display snapshot.
- WYSIWYG selection-drag and canvas commit performance probes must remain
  editor-only and trace-gated. They may record scalar timings and counts for
  pointer frame, hit-test, selection apply, overlay geometry, and React commit
  work, but must not store paragraph text or mutate document/history state.
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
- Backspace at the true start of a flow-table-cell paragraph should not call the
  body-paragraph merge operation.
- Backspace at the true start of an empty flow-table-cell paragraph deletes that
  paragraph only through the dedicated table-cell operation when a previous
  paragraph remains in the same cell; the only paragraph in a cell remains a
  no-op.
- When the flagged WYSIWYG text engine is enabled, paragraphs inside
  `flow-table-cell` should use the same active paragraph text-engine path as
  body paragraphs. Table-cell boundary Backspace remains table-specific.

### Active Typing Bug Triage

Agents investigating active typing bugs should first classify the issue before
changing code:

- `native-layer-geometry`: the native edit layer does not align with the
  measured paragraph content box, first line, typography, or active chrome.
- `session-sync`: local native draft, parent draft, or edit-session state is
  stale or overwritten.
- `blur-commit-handoff`: the editor reveals stale measured layout before the
  committed measured layout is ready.
- `re-enter-edit-parity`: re-entering an already edited paragraph uses stale
  slice, focus, caret, or line geometry.
- `old-path-leakage`: live echo, SVG draft replacement, measured draft-line
  swapping, or custom-caret-only visuals become visible during native active
  editing.

Do not jump directly to pagination, layout, schema, or export changes for an
active typing bug unless the classification points there with file/function
evidence.

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

## Page Margin Editing Rules

- Page margin guides are passive in the normal canvas state. A single pointer
  down on a margin guide must not begin a resize.
- Double-clicking the page margin area intentionally enters margin edit mode.
- In margin edit mode, the content box may be lightly tinted as editor-only
  chrome, and margin guide lines/drag handles should become visually stronger.
- Clicking the page content area or the canvas outside the page exits margin
  edit mode without changing document data.
- Dragging a margin handle still commits through the existing page-margin update
  path so one drag creates one authored margin change.
- The right-rail `Page > Margins` fields remain the recovery path for zero or
  very small margins where canvas handles are hard to target.

## Header/Footer Zone Editing Rules

- Header/footer reserved areas are a separate editor-only mode, not part of page
  margin editing.
- Double-clicking a header/footer reserved area enters header/footer zone mode
  for that section.
- Header/footer zone mode takes priority over page margin activation in the same
  section so margin handles do not appear under the active zone.
- While header/footer zone mode is active, body selection, inline editing,
  drag/resize, and margin activation are suppressed for that section.
- Clicking the body area or the canvas outside the page exits header/footer zone
  mode without changing document data.
- Clicking or double-clicking inside the active header/footer reserved area must
  keep header/footer zone mode active. The active zone affordance is shown on
  every rendered page in the edited section.
- Clicking empty space inside the active header/footer reserved area exits the
  current paragraph inline edit/selection only; it must not exit header/footer
  zone mode.
- Header/footer reserved heights are editable through the right-rail page panel
  and must commit through document history like other page settings.
- The right-rail Header/Footer panel uses the mini page map as the primary
  reserved-height control. Header and Footer values are editable in `pt`, Body
  remains read-only, and all percentages reflect usable page height. Changes
  must commit through reserved-zone operations and must not create a second
  source of document state.
- The mini page map's header/body and body/footer boundary lines may be dragged
  as an editor-only affordance for the same reserved-height values. Drag preview
  must remain clamped by the same reserved-zone rules, and the authored document
  change is committed only when the drag ends.
- While header/footer zone mode is active, hovering near the active zone's body
  boundary may expose a canvas resize affordance for the same reserved-height
  value. It must not exit header/footer zone mode, must stay above the body exit
  overlay, and must commit through the same reserved-zone update path on drag
  end.
- Header/footer content that visually exceeds the reserved height should be
  clipped to the active reserved area in the editor preview, with editor-only
  dashed cut-edge markers showing where content is hidden outside the visible
  zone. Before scrolling, the bottom edge marks hidden content below; after
  scrolling, the top edge also appears while content is hidden above. A compact
  visible scroll rail/thumb may show that additional zone content is available.
  Wheel scrolling inside the active zone, or clicking/dragging the compact
  indicator, may adjust an editor-only scroll offset so authors can inspect
  overflow content. Indicator pointer and wheel input must not fall through to
  the canvas behind it, and this offset must not mutate document content,
  reserved heights, pagination, PDF, or DOCX export.
- PDF export must clip header/footer drawing to the paginated reserved-zone
  boxes so exported pages show the same visible header/footer bounds as the
  editor preview. Overflow inspection scroll is editor-only and must not change
  the exported clip box.
- Header/footer content that exceeds the reserved zone should surface a
  non-blocking layout warning. PDF export clips that overflow; DOCX export keeps
  the header/footer structure and may reflow or show extra content in Word.
- If a header/footer paragraph is already in inline edit mode, that active edit
  surface keeps the visual scroll offset it had when editing began. While the
  edit remains active, zone overflow scroll input is consumed without changing
  the zone scroll offset and compact scroll controls are hidden. Authors can
  click out of the paragraph, while remaining in header/footer mode, before
  scrolling hidden zone content.
- Header and Footer switches in the right rail enable zones independently.
  Turning a zero-height zone on assigns the authoring default (`80pt`). Turning
  a zone off is allowed only when its reserved zone roots are empty; authored
  content must never be deleted or hidden by a switch toggle.
- First activation of a zero-height header/footer authoring zone assigns `80pt`
  to that zone so the editable area is immediately usable. Existing non-zero
  authored/imported reserved heights must not be expanded by activation.
- Active header/footer reserved heights must stay at least one editable line
  tall (`24pt` in the current UI). Sections without header/footer roots and
  with zero reserved height remain zero so older body-only documents do not
  gain blank space automatically.
- Header and footer reserved heights are capped together at 70% of usable page
  height after top/bottom margins, leaving at least 30% for body layout.
- Header/footer horizontal mode is authored page setup. The first supported
  modes are `body` (`In frame`) and `full` (`Full`); absent values resolve to
  `body` so existing documents preserve their current margin-bound behavior.
- `body` mode lays header/footer content and edit hit areas inside the body
  content width. `full` mode lays them from the page left edge to the page right
  edge without changing body content margins.
- Header/footer zone mode may accept Flow Row / Flow Stack layout blocks through
  the same authored section nodes used by pagination and export, but only the
  header/footer root stack should behave like a body-like container. Ordinary
  column stacks must continue rejecting nested row-like insertions.
- While header/footer zone mode is active, Add panel block choices must be
  scoped to header/footer-safe blocks. The first supported palette sources are
  Paragraph, Divider, and explicit Flow Columns presets; table, field, Page
  break, and other body-only structural sources stay hidden or disabled until
  their semantics are designed.
- Header/footer drop preview and commit must target only the active zone root:
  Header mode inserts into the header root, Footer mode inserts into the footer
  root. If a section has reserved space but no corresponding root node, editor
  authoring hydration must create an empty root stack before accepting content
  so the visible zone is also a real document container.
- The first header/footer content authoring pass supports paragraph inline
  editing only inside the active header/footer zone. Active header/footer
  paragraphs enter inline edit on single click, matching body paragraph
  selection/edit behavior. Body editing remains suppressed while header/footer
  mode is active, and table, field, resize, and body-to-zone move semantics stay
  deferred.
- A future custom horizontal range is deferred until its document semantics,
  undo/redo behavior, export mapping, and editor affordance are designed.

## Flow Row Editing Rules

- Adding a column from a selected `flow-row` is a global row action: it adds one
  empty `flow-stack` and rebalances all direct child stack width shares equally.
- Adding a column from a selected `flow-stack` edge is a local action: it inserts
  before or after that stack by splitting only the selected stack width share.
- Dragging an authored `flow-stack` moves the stack subtree as a column. Dropping
  it on an existing `flow-row` edge inserts that same stack before or after the
  target column using the same local split-width rule as column creation.
  Dropping it into body/page space creates a new full-width `flow-row` containing
  that stack with `widthShare: 100`.
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
`docs/WYSIWYG_EDITOR_ROADMAP.md`. It describes the long-term FlowDoc-owned
visual parity target and historical textarea-assisted guardrails. The current
active typing baseline is the native edit layer described above.

- WYSIWYG work must not change the document model first.
- For the future FlowDoc-owned parity target, `PaginatedLine` /
  `fragment.lines` should become the active edit visual truth. Until that
  target is explicitly resumed, the native edit layer remains the current
  active-session visual owner for text-only typing.
- The editor may keep visible native text during composition, unstable states,
  or the current stability-first active editing baseline.
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

## Action Classification

Editor actions should be classified before they are allowed to influence layout
feedback. The shared classification vocabulary is:

- `uiImpact`: `none`, `selection`, `visual`, `layout`, or `structure`
- `layoutScope`: `none`, `node`, `block`, `table`, `from-index`, or `document`
- `priority`: `sync`, `visible`, or `background`

Selection, hover, drag preview, and clear-result actions are sync interaction
state and must not request blocking layout feedback. Visual-only authored
changes such as text color, underline, strikethrough, paragraph box fill, and
style rename can reconcile server layout in the background while keeping the
canvas visible. For visual-only actions that can be represented by patching the
existing `PaginatedDocument` render props, the browser preview may take a
visual-only fast lane: reuse the current page/fragment geometry, repaint the
affected paragraph render props, and let server/API pagination reconcile in the
background for export truth. Metric or structural changes may still require
browser/server layout, but normal editor actions should suppress the full-canvas
loading wash and preserve the current visible layout while the layout status
settles.

The visual-only fast lane must be conservative. If an action needs new line
runs, new wrapping, different geometry, TOC page-number changes, or any
unsupported render-prop transformation, it must fall back to the normal browser
pagination path rather than showing stale or ambiguous document state.

Initial document load remains a separate blocking path owned by the document
prepare/placeholder flow. Action classification must not make an unloaded
document look ready.

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
- visual-only style change: changing text color or paragraph fill should repaint
  the visible paragraph without a full-canvas loading wash; export readiness may
  still wait for the background server check

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
