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
- WYSIWYG inline editing is opt-in. Set
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1` before starting the app when the
  smoke intentionally targets the experimental WYSIWYG path.
- Confirm the editor loads and no unexpected layout error is visible.
- Be aware that `localStorage` may contain a dirty document from earlier manual
  work. Use the existing document when the bug depends on it; use New or clear
  storage only when the test requires a clean document.
- Keep the browser scenario small. The goal is to check the main user-facing
  risk, not to retest the whole application.

## Automated Smoke

Run the automated editor smoke when the change touches the default editor load,
paragraph inline editing, undo/redo, table selection, fill readiness, or the
property panel:

- Windows PowerShell: `npm.cmd run smoke:editor`
- Non-Windows: `npm run smoke:editor`

The script starts an isolated Next dev server on port `4010`, loads fixture
documents into `localStorage`, explicitly enables
`NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1` for that server, then verifies:

- editor shell, toolbar, canvas, and first page render
- no unexpected layout error badge is visible
- paragraph inline edit commits multiline text
- same-fragment drag selection produces a visible WYSIWYG selection overlay
- stack paragraph inline edit keeps document-visual layout parity while typing
- Thai paragraph inline edit keeps composition/IME fallback visible and commits
  Thai text with combining marks and emoji
- table-cell paragraph inline edit exposes the guarded visual contract
- continuation-fragment inline edit can start from a three-fragment paragraph,
  keep textarea values bounded to fragment slices, relocate the active textarea
  when caret tracking moves across pages after typing settles, type across
  browser reflow without duplicate/garbled visible text, stay focused, undo/redo
  as one edit session, and Backspace across the continuation boundary
- fieldRef paragraphs do not enter plain textarea inline edit
- table-cell paragraph Backspace at the true start does not call body-paragraph
  merge or corrupt the table
- autosave writes `FlowDocPackage v2` to localStorage
- undo and redo restore the expected paragraph text
- clicking inside a table cell selects the parent `table-cell` and opens that
  property panel
- table-cell property-panel column insert/delete updates authored column count
  without a layout error
- table-cell property-panel row insert/delete updates authored row count
  without a layout error
- Fill mode shows a required-field readiness warning for an empty used field
  and clears the warning after the value is filled
- filled values are autosaved as package v2 `data.values`
- a package v2 custom registry appears in the Field palette and selected
  fieldRef details appear in the property panel
- property-panel fieldRef label/fallback edits autosave back into package v2

Use `SMOKE_BASE_URL=http://localhost:<port>/editor npm run smoke:editor` when
you intentionally want to run against an already-started server. That external
server must already have `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1` when the
WYSIWYG smoke assertions are expected to pass. Use `SMOKE_PORT=<port>` when
port `4010` is unavailable.

This automated smoke is still focused coverage. It does not replace manual
checks for perceived flicker, scroll feel, drag interactions, export artifacts,
or PDF/editor visual parity.

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
- During fast typing, confirm fresh visual pagination returns the visible text
  to SVG/document rendering, while stale visual pagination keeps textarea text
  visible as fallback instead of making text disappear.
- Confirm the collapsed custom caret appears when SVG geometry is fresh,
  selection is collapsed, and composition is inactive.
- Confirm same-fragment range selection draws a visible SVG selection overlay
  when geometry is available.
- Confirm missing caret geometry, missing selection geometry, or composition
  falls back to visible textarea text/native caret rather than leaving invisible
  input state.
- Confirm entering edit without typing may use the fresh SVG visual layer, while
  autofocus/programmatic selection alone does not force visible textarea mode.
- Confirm a second click inside the active textarea to place the caret does not
  switch to visible textarea text or visibly change line layout by itself.
- Confirm keyboard text input hands back to SVG/custom-caret visuals after the
  active draft becomes fresh; composition start may stay in native textarea
  fallback until composition ends.
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

### WYSIWYG Text Engine Stage 3 Stress

Use before closing the FlowDoc-owned Stage 3 text-engine lane.

- Start the editor with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`.
- Open `/editor?flowdocTestScenario=wysiwyg-stage3-boundary`.
- Confirm `data-editor-test-scenario="wysiwyg-stage3-boundary"` on the editor
  shell.
- Confirm the target paragraph `stage3-boundary-target` starts as one fragment.
- Click the target paragraph and confirm `data-wysiwyg-input-bridge="true"` is
  present while `textarea[data-inline-edit-node-id]` is absent.
- Use real keypresses on the bridge, not clipboard-backed `fill()` / `type()`.
- Press End, then enough Enter/text keys to overflow the target across the page
  boundary. Confirm the target has at least two fragments, the marker is
  visible, and no layout error badge appears.
- Backspace the inserted marker/newlines until the target returns to one
  fragment. Confirm the marker is gone and no inline textarea appears.
- Type a small marker, exit edit, then Undo and Redo. Confirm the marker
  disappears and returns with no layout error.

This fixture is dev/test-only and intentionally should not autosave over the
user's normal localStorage document.

### WYSIWYG Text Engine Stage 4 Selection

Use while hardening the FlowDoc-owned Stage 4 selection lane.

- Start the editor with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`.
- Open `/editor?flowdocTestScenario=wysiwyg-stage3-boundary`.
- Confirm the target paragraph `stage3-boundary-target` starts as one fragment.
- Click the target paragraph and confirm `data-wysiwyg-input-bridge="true"` is
  present while `textarea[data-inline-edit-node-id]` is absent.
- Press End, then Shift+ArrowLeft one or more times. Confirm
  `data-wysiwyg-selection="true"` appears and the text remains SVG-rendered.
- Press an unshifted ArrowLeft or ArrowRight. Confirm the selection overlay
  collapses without changing text.
- Press End, Enter, Enter, and a short marker such as `S4B`. Confirm the target
  crosses to at least two fragments without mounting an inline textarea.
- Select the marker with Shift+ArrowLeft and press Backspace. Confirm the
  marker disappears, the selection overlay collapses, and no layout error is
  visible.
- Backspace the inserted newlines until the target returns to one fragment.
  Confirm no inline textarea is mounted and no layout error appears.

This check protects keyboard selection semantics, selected-range deletion, and
the Stage 3 page-boundary reflow path together. It does not claim clipboard,
IME, accessibility, or cross-fragment selection coverage.

### WYSIWYG Text Engine Stage 4 Clipboard And IME

Use while hardening the FlowDoc-owned Stage 4 clipboard and composition lane.

Automated command:

- Windows PowerShell: `npm.cmd run smoke:wysiwyg-stage4c`
- Non-Windows: `npm run smoke:wysiwyg-stage4c`
- Use `SMOKE_PORT=<port>` to choose a dev-server port.
- Use `SMOKE_BASE_URL=http://localhost:<port>/editor` only when pointing at an
  already-running server that has `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`.
- Use `SMOKE_BROWSER_CHANNEL=chrome` or `SMOKE_BROWSER_CHANNEL=msedge` to run
  the same automated gate against installed Chrome or Edge through Playwright.

The automated smoke starts the flagged editor, opens
`/editor?flowdocTestScenario=wysiwyg-stage3-boundary`, and checks paste, copy,
cut, keyboard undo/redo, focus restoration, page-boundary reflow, duplicate IME
suppression, no inline textarea mount, no layout error, and no browser
console/page errors.

For real OS IME coverage, use `docs/WYSIWYG_STAGE4C_IME_MATRIX.md`. The
automated smoke uses synthetic composition events and is not enough by itself
to claim Windows Thai IME confidence.
Latest Stage 4C evidence is recorded in
`docs/WYSIWYG_STAGE4C_IME_RESULTS.md`.

Manual equivalent:

- Start the editor with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`.
- Open `/editor?flowdocTestScenario=wysiwyg-stage3-boundary`.
- Confirm the target paragraph `stage3-boundary-target` starts as one fragment.
- Click the target paragraph and confirm `data-wysiwyg-input-bridge="true"` is
  present while `textarea[data-inline-edit-node-id]` is absent.
- Put a heavy plain-text clipboard payload on the system clipboard: include
  Thai/English text, multiple newlines, a long unbroken token, and a final cut
  marker such as `CUTME4C`.
- Press End and paste with Ctrl/Cmd+V. Confirm the marker text is visible in
  SVG text, line endings render as document line breaks, the target crosses to
  at least two fragments, no inline textarea appears, and no layout error is
  visible.
- Press End, select the cut marker with Shift+ArrowLeft, and cut with
  Ctrl/Cmd+X. Confirm the system clipboard contains the selected marker, the
  marker is removed from SVG text, the selection overlay collapses, no inline
  textarea appears, and no layout error is visible.
- Exit edit with Escape, then Undo and Redo from the keyboard. Confirm Undo
  removes the pasted payload and returns the target to one fragment; Redo
  restores the pasted payload without restoring the cut marker.
- For IME, dispatch or perform a composition sequence on the hidden bridge.
  Confirm intermediate composition input does not mutate visible SVG text,
  compositionend commits the final text exactly once, the hidden bridge is
  empty afterward, no inline textarea appears, and no layout error is visible.

This check protects clipboard and IME adapter behavior. It does not claim
accessibility announcements, cross-fragment selection, or table-cell
text-engine coverage.

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
- Confirm the active textarea value is bounded to the active fragment slice and
  full paragraph reconstruction preserves the prefix and suffix without
  duplicate or garbled text.
- For caret-following changes, type across a fragment boundary and backspace
  back across it; confirm the active textarea follows the caret page when
  segment offsets are available, after the active typing burst is no longer
  locked.
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
- For package export changes, confirm `Save JSON` writes the current package
  shape and preserves the active registry when the scenario uses fields.
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
