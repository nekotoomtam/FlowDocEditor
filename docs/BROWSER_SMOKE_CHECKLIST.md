# Browser Smoke Checklist

This checklist defines the short manual/browser checks expected for meaningful
editor UX changes. It protects the parts of FlowDocEditor that unit tests often
cannot see: click feel, visible text, flicker, selection intent, and status
feedback.

Use this document together with `docs/EDITOR_UX_CONTRACT.md` and
`docs/TEST_STRATEGY.md`.

## When To Run

Run a focused browser smoke check when a change touches:

- selection, hover, drag, resize, or inline editing
- undo/redo behavior
- table selection or table property controls
- preview reconciliation, drift display, or layout status UI
- export/status wiring visible from the editor
- any bug the user originally found by interacting with the canvas

Docs-only changes do not need a browser check unless the work intentionally
validates a current browser behavior.

## Setup

- Open `http://localhost:4000/editor`.
- Confirm the editor loads and no unexpected layout error is visible.
- Be aware that `localStorage` may contain a dirty document from earlier manual
  work. Use the existing document when the bug depends on it; use New or clear
  storage only when the test requires a clean document.
- Keep the browser scenario small. The goal is to check the main user-facing
  risk, not to retest the whole application.

## Smoke Sets

### Load And Status

Use after changes to app boot, API status, pagination status, or export-visible
state.

- Load the editor route.
- Confirm the toolbar, block palette, canvas, outline, and property panel region
  render.
- Confirm there is no unexpected layout error badge.
- If server font fallback is expected, confirm the visible warning or status is
  understandable.

### Paragraph Inline Edit

Use for paragraph text, undo/redo, local reflow, and preview reconciliation
changes.

- Start from a body paragraph.
- Enter inline edit.
- Confirm the paragraph text does not visibly jump when edit mode opens.
- Type enough text to wrap into 3-4 visual lines.
- Confirm typed text remains visible while editing.
- During fast typing, confirm stale visual pagination keeps textarea text
  visible as fallback, the editor does not visibly flicker between textarea and
  SVG text on every keystroke, and the active edit session does not snap back to
  SVG text after an idle pause.
- Confirm entering edit without typing may use the fresh SVG visual layer, while
  autofocus/programmatic selection alone does not lock textarea mode.
- Confirm a second click inside the active textarea to place the caret does not
  switch to visible textarea text or visibly change line layout by itself.
- Confirm keyboard commands, text input, or composition start still lock the
  active edit session to visible textarea text until edit exits.
- Confirm the active inline textarea does not grow into a giant hit area that
  extends far past the active fragment/page.
- For page-boundary checks, use a paragraph near the bottom of a page and type
  enough text to overflow; confirm continuation content appears before blur,
  then delete back below the overflow and confirm the continuation disappears.
- If the change touches caret page tracking, keep typing until the caret crosses
  into a continuation fragment and confirm focus remains in the inline textarea.
- Move the caret with arrow keys or mouse selection without typing and confirm
  caret/page tracking updates without committing or changing the paragraph text.
- If the active textarea moves between pages, confirm the old textarea blur does
  not end the inline edit session.
- Exit edit.
- Run undo, then redo.
- Confirm the paragraph returns to the same visible layout after redo.
- Watch for flicker, jump, unwanted scroll, or text disappearing.

### Editor State Race And Reconciliation

Use when changes touch `EditorShell` document state, `previewDoc`,
`state.paginated`, inline edit transactions, undo/redo history, server
reconciliation, or export while layout status is not settled.

- Start from a clean or known document state and note which one was used.
- Enter inline edit on a body paragraph and type enough text to wrap into 3-4
  visual lines.
- While still in edit mode, confirm typed text remains visible and the canvas
  does not collapse, blink, or show duplicate text.
- Exit edit and wait for the layout status to settle.
- Run undo, then redo. Confirm both the text and visible wrapping return to the
  same state without a transient wrong layout.
- Repeat the edit with a quick blur after typing, then confirm stale server
  pagination does not overwrite the latest text.
- If the change touches fill mode, switch template/fill mode around the edit and
  confirm the resolved preview does not mutate the template.
- If the change touches export/status wiring, trigger export while the layout is
  optimistic or reconciling and confirm export goes through the API path without
  making the canvas snapshot the source of truth.

Record any remaining flicker, stale preview, layout status mismatch, or
undo/redo mismatch as a specific follow-up.

### Split Paragraph Or Continuation Edit

Use only for changes that touch cross-page paragraph editing or continuation
metadata.

- Use a paragraph long enough to split across pages.
- Enter edit on the intended fragment.
- Confirm only the clicked fragment enters edit mode.
- Confirm continuation text and caret offsets remain slice-aware.
- For caret-following changes, type across a fragment boundary and backspace
  back across it; confirm the active textarea follows the caret page when
  segment offsets are available.
- For continuation key handling changes, press Enter inside a continuation
  fragment and confirm the split happens at the intended full-paragraph offset.
- Backspace at the start of a continuation fragment should delete across the
  continuation boundary; Backspace at the true start of a paragraph should merge
  with the previous paragraph when one exists.
- Exit edit and confirm the document settles without duplicate or missing text.

This is a targeted hardening check, not required for every ordinary paragraph
change.

### Table Cell Selection And Panel

Use for table selection, cell editing, or property panel changes.

- Click text inside a table cell from the canvas.
- Confirm the selected structure is `table-cell`, not only the inner paragraph.
- Confirm the `TABLE-CELL` property panel appears.
- Edit the cell text from the panel and confirm the canvas updates.
- Confirm no invalid document/layout error appears.

### Table Row/Column Operations

Use for table operation or table authoring changes.

- Select a table cell.
- Insert a column to the left or right.
- Confirm the visible table structure/outline changes as expected.
- Delete the inserted column.
- Confirm the table returns to the previous column count.
- Confirm total table width does not visibly grow unless the tested feature is an
  explicit resize action.
- For row break work, toggle row `allowBreak` and confirm the authored control is
  reachable.

### Export Or Renderer Status

Use when editor UI changes how export, font fallback, or authoritative
pagination status is presented.

- Trigger or inspect the affected export/status path.
- Confirm any failure or fallback is visible and not silent.
- Confirm editor preview remains usable after the status update.

Renderer correctness itself belongs to `docs/EXPORT_RENDERER_CONTRACT.md` and
focused renderer tests; this browser check only verifies the editor-facing
status.

## Evidence To Record

Record enough detail in `docs/WORK_LOG.md` or the final response that a future
session knows what was actually checked:

- the page or document state used
- the main clicks/typing performed
- expected versus observed behavior
- whether a layout error, fallback warning, flicker, jump, or drift appeared
- whether a screenshot was captured, if visual evidence mattered

Do not claim a broad browser pass when only one focused interaction was tested.

## Pass Criteria

A browser smoke check passes when:

- the main user-facing risk behaves as expected
- the editor remains usable after the interaction
- no unexpected layout error is visible
- any degraded state is visible and understandable
- observed limitations are documented as follow-up work, not hidden

If the browser behavior is better but still imperfect, record the remaining
symptom precisely so the next slice starts from reality.
