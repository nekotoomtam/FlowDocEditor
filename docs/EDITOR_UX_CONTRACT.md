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
- Active paragraph text may be owned visually by the textarea during editing,
  but the authored text remains in `DocumentNode`.
- Full browser/server pagination should reconcile after edit settles or exits.
- Continuation fragments need extra care: only the clicked fragment should enter
  edit mode, and continuation text/caret offsets must remain slice-aware.

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
- Split-fragment inline editing still needs focused hardening before it should
  be considered complete.

Accepted limitations should be documented and should not become invisible
regressions.

## Change Rule

If an editor change affects selection, inline edit, undo/redo, table editing,
preview reconciliation, or visible layout stability:

- update this contract if the expectation changed
- update `docs/WORK_LOG.md`
- choose verification using `docs/TEST_STRATEGY.md`
- browser-check the main interaction risk when practical
