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
- Type enough text to wrap into 3-4 visual lines.
- Confirm typed text remains visible while editing.
- Exit edit.
- Run undo, then redo.
- Confirm the paragraph returns to the same visible layout after redo.
- Watch for flicker, jump, unwanted scroll, or text disappearing.

### Split Paragraph Or Continuation Edit

Use only for changes that touch cross-page paragraph editing or continuation
metadata.

- Use a paragraph long enough to split across pages.
- Enter edit on the intended fragment.
- Confirm only the clicked fragment enters edit mode.
- Confirm continuation text and caret offsets remain slice-aware.
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
