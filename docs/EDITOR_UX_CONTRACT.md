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

## Selection Rules

- Single-clicking a normal body paragraph enters or prepares paragraph editing
  according to the current editor mode.
- Single-clicking rendered content inside a table cell selects the parent
  `table-cell`, not only the internal paragraph.
- Structural containers such as rows, stacks, tables, table rows, and table cells
  should be selectable when their properties are editable.
- Selection should not silently mutate the document.
- Background clicks should clear selection and close inline edit through the
  normal edit transaction path.

## Inline Editing Rules

- Inline editing should preserve visible text.
- Entering edit mode should not trigger unnecessary full re-pagination that
  causes visible collapse/flicker.
- Active paragraph input/caret handling is owned by the textarea during editing,
  but the authored text remains in `DocumentNode`.
- During inline paragraph editing, browser pagination may run against
  `previewDoc` with the active draft and update the canvas as optimistic visual
  layout so long paragraphs can show continuation fragments before blur.
- When entering inline edit and the active edit visual snapshot is fresh for
  the current draft, the active fragment may render the same SVG
  `fragment.lines` used by normal mode and make textarea text transparent. This
  keeps edit entry visually close to normal mode.
- When the active edit visual snapshot is stale, the textarea must keep visible
  text as a fallback so fast typing never makes text disappear.
- Once the user changes text, uses a keyboard edit/navigation command, or starts
  composition in the inline textarea, edit mode should lock to visible textarea
  text until that edit session ends. It should not auto-handoff back to SVG
  while focus remains in the same edit session, because textarea and SVG text
  layout are different engines.
- Programmatic focus/selection on edit entry should not trigger this visual
  lock. `onSelect` may update caret state but must not be the lock trigger.
- Pointer clicks used only to place the native caret should not trigger the
  visual lock by themselves; otherwise a second click can reveal textarea
  layout drift before the user actually edits text.
- The editor should avoid showing both layers visibly at the same time.
- Page splitting and non-active continuation fragments still come from
  `PaginatedDocument`.
- Full browser/server pagination should reconcile after edit settles or exits.
- Continuation fragments need extra care: only the clicked fragment should enter
  edit mode, and continuation text/caret offsets must remain slice-aware.
- When segment offsets are available, the active inline textarea may move to the
  paginated fragment/page containing the current caret. The caret index remains
  UTF-16 text-offset based and must not become page geometry stored in
  `DocumentNode`.
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

## Preview And Authoritative Layout

- Browser pagination is allowed as a fast interaction preview.
- Server/API pagination is authoritative for final layout status and export.
- Preview drift should be measurable, not hidden.
- The editor may show optimistic layout while editing, but it should settle back
  predictably.
- Layout assertion failures and font fallback should be visible to the user.

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
  must call `/api/export` with the current `previewDoc` and let the API paginate
  and assert output. It must not serialize the current canvas snapshot.
- Selection, caret, drag, resize, and inline-edit transaction snapshots are
  ephemeral interaction state only.

## Status And Feedback

The editor should surface important degraded states:

- font fallback when server/API uses fallback font metrics
- layout assertion failure from `/api/paginate`
- optimistic layout while authoritative pagination is pending
- drift information when the drift overlay is enabled

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
  Continuation-slice Enter/Backspace mapping is covered, but cross-fragment text
  selection and fully caret-perfect WYSIWYG editing remain deferred.

Accepted limitations should be documented and should not become invisible
regressions.

## Change Rule

If an editor change affects selection, inline edit, undo/redo, table editing,
preview reconciliation, or visible layout stability:

- update this contract if the expectation changed
- update `docs/WORK_LOG.md`
- choose verification using `docs/TEST_STRATEGY.md`
- browser-check the main interaction risk when practical
