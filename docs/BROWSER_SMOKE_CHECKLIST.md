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
- For local rich text draft work, `npm.cmd run dev:wysiwyg` starts the dev
  server with the base WYSIWYG text engine, inline edit, and rich draft flags
  enabled together.
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
- header/footer preview text renders from `PaginatedDocument` zone fragments and
  remains read-only/non-interactive
- paragraph inline edit commits multiline text through either the legacy
  textarea control or the current WYSIWYG text-engine layer/input bridge
- same-fragment drag selection produces a visible WYSIWYG selection overlay
- stack paragraph inline edit keeps document-visual layout parity while typing
- Thai paragraph inline edit keeps composition/IME fallback visible and commits
  Thai text with combining marks and emoji
- paragraph text color from the property-panel palette takes the visual-only
  browser preview fast lane and does not show the initial layout loading overlay
- table-cell paragraph inline edit exposes the guarded visual contract
- continuation-fragment inline edit can start from a three-fragment paragraph,
  keep textarea values bounded to fragment slices, relocate the active textarea
  when caret tracking moves across pages after typing settles, type across
  browser reflow without duplicate/garbled visible text, stay focused, undo/redo
  as one edit session, and Backspace across the continuation boundary. These
  continuation checks are legacy-textarea-specific and are skipped with an
  explicit log when the current text-engine path is active.
- fieldRef paragraphs do not enter any inline text edit control
- flow-table-cell paragraph Backspace at the true start, including the active
  draft-island path and the immediate post-Enter-split paragraph, does not call
  body-paragraph merge or corrupt the table; empty post-Enter-split cell
  paragraphs dispatch `DELETE_EMPTY_TABLE_CELL_PARAGRAPH`, remove only that
  paragraph from the cell, restore/remove correctly through Undo/Redo, and
  refocus the previous cell paragraph
- autosave writes `FlowDocPackage v2` to localStorage
- undo and redo restore the expected paragraph text
- clicking inside a table cell selects the parent `flow-table-cell` and opens that
  property panel
- flow-table-cell property-panel column insert/delete updates authored column count
  without a layout error
- flow-table-cell property-panel row insert/delete updates authored row count
  without a layout error
- Fill mode shows a required-field readiness warning for an empty used field
  and clears the warning after the value is filled
- Fill mode blocks PDF export with the field-specific reason while readiness has
  errors, then enables export again after the value is fixed and layout settles
- filled values are autosaved as package v2 `data.values`
- a package v2 custom registry appears in the Field palette and selected
  fieldRef details appear in the property panel
- property-panel fieldRef label/fallback edits autosave back into package v2

Run the rich draft smoke when a change touches the flag-gated rich text draft
bridge, rich toolbar commands, pending style, selected-range rich styling, or
rich draft visual preview behavior:

- Windows PowerShell: `npm.cmd run smoke:wysiwyg-rich-draft`
- Non-Windows: `npm run smoke:wysiwyg-rich-draft`

The rich draft smoke starts a flagged editor and verifies styled paragraph
commit/undo/redo, keyboard-created bold runs, toolbar-created underline runs,
collapsed-caret toolbar state, selected-range toolbar styling with a visible
SVG selection overlay, `range` toolbar mode, the rich toolbar scope chip, and a
styled Flow Table cell paragraph.

Use `SMOKE_BASE_URL=http://localhost:<port>/editor npm run smoke:editor` when
you intentionally want to run against an already-started server. That external
server must already have `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1` when the
WYSIWYG smoke assertions are expected to pass. Use `SMOKE_PORT=<port>` when
port `4010` is unavailable.
By default the script uses Playwright's bundled Chromium. Use
`SMOKE_BROWSER_CHANNEL=chrome` / `SMOKE_BROWSER_CHANNEL=msedge` for an
installed Playwright browser channel, or `SMOKE_EXECUTABLE_PATH=<path>` for a
system Chromium/Chrome/Edge executable. Set only one of
`SMOKE_BROWSER_CHANNEL` and `SMOKE_EXECUTABLE_PATH` per run.
If bundled Chromium is missing, the smoke launcher prints FlowDoc-specific
guidance with the install and system-browser alternatives.

## Header/Footer Zone Mode Smoke

Use this focused manual/browser check when changing header/footer zone
interaction or the page-margin overlap rules:

- Open `/editor?flowdocTestScenario=header-footer-zones`.
- Confirm header and footer preview text appears on each page.
- Confirm passive page-margin activation bands are present before entering a
  header/footer zone.
- Double-click the header reserved area. Confirm the header zone becomes active,
  the body is lightly muted, and margin activation bands are hidden for that
  section.
- Click the body area or canvas outside the page. Confirm header/footer zone
  mode exits and passive margin activation returns.
- Repeat once for the footer reserved area.
- Expand the right-rail `Header/Footer` page card, edit a reserved height, and
  confirm the page content area reflows through normal undoable page settings.
- In the same card, switch `In frame` to `Full` and confirm the active
  header/footer zone spans the full page width while body content margins stay
  unchanged. Switch back to `In frame` and confirm the zone returns to the body
  content width.
- While a header/footer zone is active, open Add. Confirm the palette is scoped
  to Paragraph and Flow Columns presets, with Table and Fields unavailable.
- While a header/footer zone is active, drag a `50 | 50` layout block from Add
  into the zone. Confirm the drop preview appears in the active zone and the
  inserted Flow Row / Flow Stack content repeats in that header/footer zone
  rather than in the body.
- While a header/footer zone is active, drag a Paragraph block from Add into the
  zone, double-click the paragraph, type text, and confirm the typed content
  stays inside the active header/footer zone.

## CI Browser Smoke Setup

`npm ci` installs Playwright's package dependency, but it does not guarantee
that Playwright browser binaries are present on every review or CI machine.
Use one of these setups before the browser gate:

```bash
npm ci
npx playwright install chromium
npm run review:browser
```

or:

```bash
npm ci
SMOKE_EXECUTABLE_PATH=/path/to/chrome npm run review:browser
```

The convenience command `npm run review:browser:install` installs bundled
Chromium and then runs `review:browser`. `review:gate` and `review:browser` are
separate gates; a non-browser pass does not prove editor browser behavior.

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

### WYSIWYG Stress Lifecycle

Use when changing WYSIWYG enter/exit, undo/redo, loading overlay suppression,
or preview layout status on large documents.

- Run `npm run smoke:wysiwyg-stress-lifecycle`.
- The smoke loads `public/mock/flowdoc-stress-mock.flowdoc.json`, jumps to page
  15, switches between two paragraph/list fragments, exits WYSIWYG, deletes the
  selected fragment, and runs Undo.
- For Document Model v2 long-document lifecycle evidence, run:

  ```powershell
  $env:FLOWDOC_STRESS_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:STRESS_FIRST_TARGET_ALIAS="typing.primary"; $env:STRESS_SECOND_TARGET_ALIAS="typing.deepDocument"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-stress-lifecycle
  ```

  The long-v2 lifecycle summary reports `targetRevealMs` separately from
  `clickSwitchMs`; do not treat page-frame reveal/scroll time as click-to-edit
  runtime.
- For long-document add/copy node mutation evidence, run:

  ```powershell
  $env:FLOWDOC_MUTATION_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:MUTATION_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-node-mutation
  ```

  This covers palette add, canvas drag-copy, preview settling, and undo restore
  on the long v2 fixture.
- For long-document split/backspace merge evidence, run:

  ```powershell
  $env:FLOWDOC_PROBE_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:PROBE_TARGET_ALIAS="node.split"; $env:PROBE_MODE="enter-backspace-after-dispatch"; $env:PROBE_ENTER_SPLIT_TEXT="Browser probes"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
  ```

  This covers structural Enter split, Backspace merge, previous-node refocus,
  immediate-lane pagination isolation, and console/page error checks.
- For long-document table/flow-row structure mutation evidence, run:

  ```powershell
  $env:FLOWDOC_STRUCTURE_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:STRUCTURE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-structure-mutation
  ```

  This covers table add row, table add column, table column resize, flow-stack
  add column, flow-row resize, preview settling, and undo restore on the long v2
  fixture.
- To look for intermittent preview/draft lifecycle loops, run
  `npm run smoke:wysiwyg-stress-lifecycle-repeat`; this runs the same stress
  lifecycle smoke three measured times. Override with
  `npm run smoke:wysiwyg-stress-lifecycle-repeat5`,
  `node scripts/wysiwyg-stress-lifecycle-smoke.mjs --repeat=5`, or
  `STRESS_REPEAT=5` when a longer five-sample gate is needed.
- Confirm the run reports no initial layout loading overlay, no preview layout
  blocking, no `settled-preview` finalize event, and no synchronous
  `inline-edit-exit-pagination` event.
- The JSON summary includes `consoleErrorSignatures.maximumUpdateDepth` and
  per-phase `previewSettle.superseded` counts. The default supersede burst
  guard is 10 per phase; override with `STRESS_MAX_PREVIEW_SETTLE_SUPERSEDES`
  only while investigating a known burst.
- The undo phase waits for the restored paragraph and redo enablement, then
  requires preview layout status `full` before taking the final summary. The
  default full-status wait is 8000ms; override with
  `STRESS_MAX_UNDO_FULL_WAIT_MS` only while investigating slow settling. Repeat
  summaries include `undoRestoreMs`, `undoFullWaitMs`,
  `undoStatusBeforeFullWait`, and final `undoStatus`.
- If investigating typing lag, run `npm run smoke:wysiwyg-smoothness` separately
  because that probe measures keypress-to-paint and render jank rather than the
  lifecycle/undo path.

### Outline Panel Stress Reorder

Use when changing Outline rendering, virtualization, direct body-child reorder,
or left-rail large-document behavior.

- Windows PowerShell: `npm.cmd run smoke:outline-panel`.
- Non-Windows: `npm run smoke:outline-panel`.
- For the list-item active draft variant, run
  `npm.cmd run smoke:outline-panel-list-draft` on Windows PowerShell or
  `npm run smoke:outline-panel-list-draft` elsewhere.
- For the list subtree move variant, run
  `npm.cmd run smoke:outline-panel-list-subtree-reorder` on Windows PowerShell
  or `npm run smoke:outline-panel-list-subtree-reorder` elsewhere. This opens
  an active draft on the level-1 list item `li_00033`, drags it after
  `li_00057`, and expects the level-2 child `li_00035` to move with the source
  item as one body-order segment while the drag ghost reports one subtree child
  and Undo/Redo preserves the finalized draft.
- For the active-list-item self-reorder variant, run
  `npm.cmd run smoke:outline-panel-active-list-reorder` on Windows PowerShell
  or `npm run smoke:outline-panel-active-list-reorder` elsewhere. This opens an
  active draft on the level-2 list item `li_00035`, then drags that same list
  item after the level-2 sibling `li_00057` so the authored list remains
  schema-valid while the active node itself is reordered.
- For the invalid list hierarchy guard, run
  `npm.cmd run smoke:outline-panel-invalid-list-reorder` on Windows PowerShell
  or `npm run smoke:outline-panel-invalid-list-reorder` elsewhere. This opens an
  active draft on `li_00033`, attempts the invalid `li_00033` after `li_00035`
  drop into its own subtree, verifies the target exposes `source-subtree`
  blocked feedback, confirms the drag ghost still reports one subtree child,
  confirms the active draft still finalizes, verifies the body order stays
  unchanged, and confirms no document assertion is emitted in the browser.
- To catch intermittent list-subtree move regressions, run
  `npm.cmd run smoke:outline-panel-list-subtree-reorder-repeat` on Windows
  PowerShell or `npm run smoke:outline-panel-list-subtree-reorder-repeat`
  elsewhere; it runs the list subtree move variant three times and expects the
  subtree source draft to preserve text/list signature through Undo/Redo and
  report one subtree child in the drag ghost.
- To catch intermittent self-reorder regressions, run
  `npm.cmd run smoke:outline-panel-active-list-reorder-repeat` on Windows
  PowerShell or `npm run smoke:outline-panel-active-list-reorder-repeat`
  elsewhere; it runs the active-list-item self-reorder variant three times.
- To catch intermittent invalid-list blocked-drop regressions, run
  `npm.cmd run smoke:outline-panel-invalid-list-reorder-repeat` on Windows
  PowerShell or `npm run smoke:outline-panel-invalid-list-reorder-repeat`
  elsewhere; it runs the invalid-list no-op variant three times and expects
  `source-subtree` blocked feedback plus one subtree child in the drag ghost.
- To catch intermittent active list-draft finalize/reorder regressions, run
  `npm.cmd run smoke:outline-panel-list-draft-repeat` on Windows PowerShell or
  `npm run smoke:outline-panel-list-draft-repeat` elsewhere; it runs the
  list-item variant three times with compact per-sample output. Override with
  `node scripts/outline-panel-list-draft-repeat-smoke.mjs --repeat=5`,
  `OUTLINE_PANEL_LIST_DRAFT_REPEAT=5`, or `SMOKE_REPEAT=5` when a longer gate
  is needed.
- The smoke loads `public/mock/flowdoc-stress-mock.flowdoc.json`, waits for the
  Outline to virtualize, opens an active paragraph draft on `cover_title`, types
  a Thai marker, drags `cover_project` after `cover_note`, and verifies
  persisted body order plus committed draft text through local storage. The
  list-item variant opens `li_00033` and verifies the committed text exactly
  matches the active draft while the original list `instanceId`, `level`, and
  `itemId` are preserved through reorder, Undo, and Redo.
- Confirm the run reports `outline.domVirtualized=true`, total Outline rows
  much larger than rendered rows, and no console/page/resource errors.
- Confirm the active-edit summary reports a positive `inlineFinalize` delta, a
  positive `reorder` delta, and that Undo/Redo preserve the typed active-draft
  marker while only changing the body order. For the list-item variant, confirm
  `activeEdit.listSignaturePreserved=true`.
- Override `FLOWDOC_PROBE_FILE`, `OUTLINE_REORDER_SOURCE_NODE_ID`,
  `OUTLINE_REORDER_TARGET_NODE_ID`, `OUTLINE_REORDER_POSITION`, or
  `OUTLINE_ACTIVE_EDIT_NODE_ID` only when the target document/order changes
  intentionally.

### WYSIWYG List Level Active Draft

Use when changing list level commands, active draft finalization, list toolbar
behavior, or list marker rendering.

- Windows PowerShell: `npm.cmd run smoke:wysiwyg-list-level-draft`.
- Non-Windows: `npm run smoke:wysiwyg-list-level-draft`.
- To catch intermittent active-draft list-level regressions, run
  `npm run smoke:wysiwyg-list-level-draft-repeat`; this runs the same smoke
  three measured times. Override with
  `npm run smoke:wysiwyg-list-level-draft-repeat5`,
  `node scripts/wysiwyg-list-level-active-draft-smoke.mjs --repeat=5`, or
  `LIST_LEVEL_REPEAT=5` when a longer five-sample gate is needed.
- The smoke seeds a small list document, starts an active rich draft on a list
  item, types text before a toolbar indent, verifies the text commits before
  the level change, resumes editing, types again, blurs, checks undo/redo, then
  verifies active-draft `Shift+Tab` and `Tab` keyboard level changes, plus
  active-draft `Enter` splitting into the next list item.
- Confirm the stored paragraph text includes the typed markers exactly as
  paragraph content while visual list markers remain renderer-owned metadata.
- Confirm the keyboard phase reports `keyboardShiftTab.level=0`,
  `keyboardTab.level=1`, `keyboardNoopTab.level=1`, and
  `keyboardNoopShiftTab.level=0` without writing tab characters or generated
  markers into paragraph text.
- Confirm no-op keyboard phases keep the same list-level action count before
  and after the keypress.
- Confirm the Enter split phase reports matching source/new list levels,
  preserves the list instance, creates a different new `itemId`, and records a
  `SPLIT_PARAGRAPH` action plus a structural Enter split event.
- Confirm the run reports no console/page/resource errors.
- The repeat summary includes final levels, no-op action-count stability, and
  `listLevelActionCount`, `splitParagraphActionCount`, and
  `structuralEnterSplitCount` for each sample.

### WYSIWYG DevTools Trace

Use when changing active-typing render scope, page memoization, draft layout
measurement, or React commit churn.

- Windows PowerShell compact run:
  `$env:TRACE_WRITE_RAW='0'; $env:TRACE_COMPACT='1'; $env:TRACE_TOP_LIMIT='4'; node scripts/wysiwyg-devtools-trace.mjs`.
- The script starts a flagged dev server unless `SMOKE_BASE_URL` points at an
  already-running `/editor` server with WYSIWYG text-engine and perf trace flags
  enabled.
- Default scenario is `wysiwyg-stage3-boundary`, target node
  `stage3-boundary-target`, 80 keys, and 10ms between keys. Override with
  `PROBE_TARGET_NODE_ID`, `PROBE_BURST_LENGTH`, or `PROBE_INTERVAL_MS` when a
  patch intentionally changes the measured path.
- Set `TRACE_WRITE_RAW=1` to write raw Chrome trace JSON under
  `tmp/devtools-traces/`; those files are local diagnostic artifacts and should
  not be committed.
- `appPerf` reports the measured typing window only. When
  `TRACE_DETACHED_LIVE_LAYER_SAFETY=1` is enabled, post-trace interaction costs
  are reported separately under `postTraceSafetyAppPerf`, and the combined view
  remains available under `totalAppPerf`. Use `perfWindows` to confirm the event
  split before comparing counts across runs.
- Treat `CpuProfiler::StartProfiling` and React dev scheduler frames as
  diagnostic overhead unless a trace also points at a FlowDoc source function or
  a reproducible app perf regression.
- Review `appPerf.editorCanvasCommit.byRenderReason` before accepting a runtime
  patch. The count split is the gate for whether churn is input, parent-sync,
  selection, structural, visual, pagination, or unattributed.
- Review `appPerf.pageSlotAttribution` next. `memoMissCount` means active
  WYSIWYG props reached page slot render scope; `count: 0` means the canvas
  commit stayed above or outside page slot memo comparison.
- Review `appPerf.editorCanvasCommit.visualCorrelation` when visual commits are
  high. `islandAndFragmentSplit` points at nested draft-island React commits;
  `fragmentSplitOnly` points at visual split work inside the canvas profiler
  window without a matching island profiler commit.
- Review `appPerf.editorCanvasCommit.visualUnchangedCorrelation.subtreePathCounts`
  when `visual-unchanged` is high. `island+surface+fragmentSplit` points at the
  draft island surface subtree; `fragmentSplit` means the canvas commit was
  attributed to split work without a matching island or surface profiler commit.
- Review `appPerf.fragmentSplit` before changing render behavior. A high
  `outputUnchangedCount` means split geometry repeated; use
  `fragmentSplit.visualSignature` to tell whether rendered line content changed
  before changing pagination, page memoization, or draft rendering.
- For sampled split telemetry, compare `appPerf.fragmentSplit.emittedCount`
  with `observedCount`, `attributionHintCount`, and
  `suppressedOutputUnchangedCount`. `emittedCount` is the main perf-buffer
  count; `observedCount` includes hidden attribution hints used to classify
  canvas commits.
- Review `appPerf.fragmentSplit.identity` before memoizing draft split output.
  `array-new/surface-keys-same` means fragment references churn while the
  surface keys stay stable. Do not treat stable surface keys alone as safe reuse;
  line text and style can still change while geometry and keys stay the same.
  `arrayReusedCount` and `resultReusedCount` report the guarded final split
  result passed downstream after reuse, not the freshly generated pre-reuse
  array. Still compare island/surface React commit counts before claiming
  render churn fell.
- `flowdoc-island-visible-lines` is input-to-island-visible timing emitted from
  the draft island root commit. Do not use it alone as proof that a child
  visual-lines memo patch reduced React work; compare canvas, island, and
  surface commit counts.
- Review `appPerf.draftIslandMeasure` before claiming draft measurement churn.
  `emittedCount` is the main perf-buffer count and should track true cache
  misses/measurement work; `observedCount` also includes cache-hit attribution
  hints from dev render resolves. Use `cacheMissCount` and `cacheHitCount`
  together rather than treating every observed cache hit as a new measurement.
  `identityReusedCount` reports cache-hit resolves where the draft island kept
  the previous layout object for downstream memo/split stability; compare it
  with `fragmentSplit.observedCount` before claiming repeated split work fell.
- Review `appPerf.visualLinesCommit` after visual-lines memo changes. Compare
  its count with `appPerf.fragmentSplit.visualSignature.visualChangedCount` and
  `visualSameCount`; a lower visual-lines commit count can confirm the child
  subtree is no longer committing for every visual-same repeat even if the
  surface/root commit counts remain high.
- After draft island surface memo changes, compare
  `flowdoc-island-surface-react-commit` against `flowdoc-island-react-commit`,
  `appPerf.visualLinesCommit.count`, and
  `appPerf.fragmentSplit.visualSignature.visualChangedCount`. Do not claim a
  root/input-lane win from a surface-count reduction alone.
- Review `appPerf.islandSurfaceCommit` before splitting caret or selection
  overlays out of the surface view. `selectionChangedCount` tracks active range
  selection, while collapsed typing should primarily appear as
  `revision+text-length+caret`; do not optimize selection overlay code when the
  trace points at collapsed caret/text metadata instead.
- Review `appPerf.islandSurfaceChromeCommit` after static-chrome memo patches.
  For plain collapsed typing, the chrome child should usually mount once and
  stay quiet while `islandSurfaceCommit` continues to track live caret/text
  metadata. Do not move surface data attributes off the island SVG without
  checking probes that read `data-wysiwyg-flowdoc-draft-*` from that element.
- Review `appPerf.islandCaretCommit` after caret overlay patches. The caret
  child should track rendered caret geometry, while the island surface wrapper
  may still commit for live SVG data attributes. A low caret duration with high
  `islandSurfaceCommit.revision+text-length+caret` means the remaining work is
  the live-attribute/surface contract, not the caret line subtree.
- Before any ref-based island SVG attr sync, update or verify
  `resolveDraftIslandSurfaceLiveAttributes` tests. Probes read
  `data-wysiwyg-flowdoc-draft-*`, `data-wysiwyg-custom-caret-visible`, and
  `data-wysiwyg-island-revision` from the island SVG itself; the helper is the
  source-of-truth contract for those live attributes.
- After enabling ref-based island SVG attr sync, verify absent live values are
  removed, not left stale. In particular, range selection may remove
  `data-wysiwyg-flowdoc-draft-caret-offset` and
  `data-wysiwyg-custom-caret-visible`; collapsed typing should restore both
  through the same helper output. Keep React-rendered attrs as fallback until a
  separate trace proves removing them from React diff preserves probe timing.
- To run the ref-sync-only island attr experiment, set
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_REACT_LIVE_ATTRS=0` before
  `scripts/wysiwyg-devtools-trace.mjs`. Verify `action.islandReactLiveAttrs`
  reports `0` and `activeIslandSurfaceAttrs` has current `textLength`,
  `caretOffset`, collapsed selection, custom caret visibility, revision, and
  line count after the typing burst. This validates the attr contract but does
  not by itself prove surface commits fell.
- The detached island live layer now defaults on for active text-engine
  development/test lanes and stays off by default in production. Explicit
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_SURFACE_LIVE_LAYER=0` keeps the legacy
  inline surface baseline available, and `=1` still forces the detached path.
  The trace runner also passes `=1` to its managed dev server when the env var
  is not explicitly set so historical trace runs remain comparable. Verify
  `action.islandSurfaceLiveLayer` reports `1` in ordinary trace runs,
  measured `appPerf.islandSurfaceCommit.count` is `0`, the static chrome stays
  near one mount, and `appPerf.islandSurfaceLiveLayerCommit` carries the live
  typing work.
- Add `TRACE_DETACHED_LIVE_LAYER_SAFETY=1` to the same detached run before
  treating it as a promotion candidate. The script will perform keyboard range
  selection, long keyboard selection, pointer collapse, composition probing,
  page-boundary expansion/selection, and outside-click blur after the measured
  typing burst. The safety summary must report `ok: true`; keyboard selection
  should keep only the hidden input bridge, show non-zero selected text and
  overlay counts, long keyboard selection should select a larger span and, when
  the island has multiple lines, report multiple surface-selection overlay
  rects, pointer collapse should restore a collapsed selection with bridge-only
  editing, composition probing should keep text length/selection stable while
  clearing bridge echo text, page-boundary expansion should create at least two
  island surfaces on at least two pages without mounting a native textarea, the
  page-boundary selection should report selected overlays on at least two
  surfaces/pages, and blur should remove the bridge without mounting a native
  textarea. The page-boundary expansion uses a synthetic plain-text paste
  payload after the measured trace is already stopped; override the payload size
  with `TRACE_PAGE_BOUNDARY_SAFETY_LINE_COUNT` only when debugging this gate.
  Compare safety-only costs through `postTraceSafetyAppPerf`; do not use
  `totalAppPerf` as the typing baseline for default-promotion decisions.
- Review `appPerf.islandRootCommit` before changing the draft island root or
  local draft state path. `draftChangedCount` and
  `inputToVisibleActiveCount` show active local-draft/input commits;
  `layoutChangedCount`, `surfaceChangedCount`, and `anchorChangedCount` show
  whether the root churn is actually geometry, surface identity, or anchoring.
- After the root/runtime extraction, `flowdoc-island-react-commit` still
  measures the runtime island subtree for compatibility. Treat it as runtime
  child churn, not proof that the exported static wrapper re-rendered.
- Before publishing every local draft input into `wysiwygDraftStore`, compare
  `editor-canvas-react-commit`, island/surface commit counts, and
  `pageSlotAttribution.count`. The current safe contract keeps per-input draft
  truth local to the island and uses the store as a versioned session snapshot;
  per-key global publication must not wake canvas paragraph subscribers.
- When per-key store publication is enabled, verify draft/session subscriber
  separation. Draft snapshots may update on every input for explicit live
  consumers, but session snapshots must remain stable until the active node
  changes. Toolbar selection UI should subscribe/debounce outside shell render,
  while toolbar commands must read the latest selection from the store getter at
  command time.
- Review `appPerf.fragmentSplit.visualSignature` before narrowing render
  attribution or reusing draft split output. `output-same/visual-changed` means
  geometry stayed stable while rendered line content changed; only
  `output-same/visual-same` is a candidate for unchanged-output reuse.
- Treat `editorCanvasCommit.byRenderReason.visual-unchanged` as repeated visual
  split work whose matched split event had unchanged visual signature, not as
  proof that the canvas/page visual output changed.

### WYSIWYG Text Engine Stage 3 Stress

Use before closing the FlowDoc-owned Stage 3 text-engine lane.

- Start the editor with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`.
- Open `/editor?flowdocTestScenario=wysiwyg-stage3-boundary`.
- Confirm `data-editor-test-scenario="wysiwyg-stage3-boundary"` on the editor
  shell.
- Confirm the target paragraph `stage3-boundary-target` starts as one fragment.
- Click the target paragraph and confirm `data-wysiwyg-input-bridge="true"` is
  present while non-bridge `textarea[data-inline-edit-node-id]` and visible
  native textarea fallback are absent.
- Use real keypresses on the bridge, not clipboard-backed `fill()` / `type()`.
- Press End, then enough Enter/text keys to overflow the target across the page
  boundary. Confirm the target has at least two fragments, the marker is
  visible, and no layout error badge appears.
- Backspace the inserted marker/newlines until the target returns to one
  fragment. Confirm the marker is gone and no non-bridge inline textarea
  appears.
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
  present while non-bridge `textarea[data-inline-edit-node-id]` and visible
  native textarea fallback are absent.
- Press End, then Shift+ArrowLeft one or more times. Confirm
  `data-wysiwyg-selection="true"` or `data-wysiwyg-selection-overlay="true"`
  appears and the text remains SVG-rendered.
- Double-click inside the active text-engine paragraph. Confirm
  `data-wysiwyg-selection="true"` or `data-wysiwyg-selection-overlay="true"`
  appears and no non-bridge inline textarea mounts.
- After the target paragraph crosses a page boundary, use Shift+Home/End or an
  equivalent full-paragraph selection and confirm selection overlays appear on
  the active fragment and at least one continuation fragment without mounting a
  second input bridge.
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
- Use `SMOKE_EXECUTABLE_PATH=<path>` when the reviewer has a system Chromium or
  Chrome-family executable but no Playwright browser channel installed. Leave
  both browser-selection variables unset to use bundled Chromium.

The automated smoke starts the flagged editor, opens
`/editor?flowdocTestScenario=wysiwyg-stage3-boundary`, and checks double-click
WYSIWYG word selection, cross-fragment selection overlays, cross-fragment
same-paragraph pointer drag selection, perf trace separation between immediate
input and debounced browser preview pagination, paste, copy, cut, keyboard
undo/redo, focus restoration, page-boundary reflow, duplicate IME suppression,
no live continuation overlap with downstream paragraph fragments, heavy
row-stack paragraph editing without independent paragraph splitting, no inline
textarea mount, no layout error, and no browser console/page errors.

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
  present while non-bridge `textarea[data-inline-edit-node-id]` and visible
  native textarea fallback are absent.
- Put a heavy plain-text clipboard payload on the system clipboard: include
  Thai/English text, multiple newlines, a long unbroken token, and a final cut
  marker such as `CUTME4C`.
- Press End and paste with Ctrl/Cmd+V. Confirm the marker text is visible in
  SVG text, line endings render as document line breaks, the target crosses to
  at least two fragments, no inline textarea appears, and no layout error is
  visible.
- Drag-select from visible text in the active continued fragment back to visible
  text in the earlier fragment. Confirm the SVG selection overlay appears on at
  least two target pages and the DOM live accessibility status reports selected
  characters.
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
- Click the stack paragraph `stage3-stack-target`, type a heavy multiline
  marker such as `STAGE4_STACK_MARKER`, and confirm the paragraph stays on the
  text-engine path without textarea fallback. The row/stack columns should keep
  stable widths, both stack fragments should still match the row height, and the
  stack target should remain one fragment inside `stage3-stack-left`.

This check protects clipboard, IME adapter behavior, cross-fragment selection
overlay and pointer drag selection for the same paragraph, and the DOM live
accessibility status. It does not claim full screen reader product validation,
cross-fragment edit semantics beyond same-paragraph selection, or table-cell
text-engine coverage.

### WYSIWYG Table-Cell Boundary Smoke

Use after changes to responsive draft pagination, table-cell text-engine
eligibility, table-cell page-boundary preview, or active cell continuation
editing.

Automated command:

- Windows PowerShell: `npm.cmd run smoke:wysiwyg-table-cell-boundary`
- Non-Windows: `npm run smoke:wysiwyg-table-cell-boundary`
- To run the full table-cell boundary matrix, use
  `npm.cmd run smoke:wysiwyg-table-cell-boundary-matrix` on Windows PowerShell
  or `npm run smoke:wysiwyg-table-cell-boundary-matrix` elsewhere. This runs the
  base table-cell, colspan, rowspan, mixed-span, and over-case targets
  sequentially and fails on the first target regression.
- To look for intermittent table-cell boundary regressions, run
  `npm.cmd run smoke:wysiwyg-table-cell-boundary-matrix-repeat` on Windows
  PowerShell or `npm run smoke:wysiwyg-table-cell-boundary-matrix-repeat`
  elsewhere; it runs the same matrix three times with compact child output so
  the pass/fail summary stays readable. Add `-- --stream-child-output` when a
  debugging run needs the full child smoke transcript. Use
  `node scripts/wysiwyg-table-cell-boundary-matrix-smoke.mjs --repeat=2` for a
  shorter local probe, and add `--targets=flow-table-mixed-span` when narrowing
  investigation to one target. The matrix runner retries a child process once
  only when the process exits like an infrastructure/browser crash before the
  child smoke prints an `ok:true` or `ok:false` JSON summary; assertion failures
  are not retried. The guard can be checked without launching the browser with
  `npm.cmd run smoke:wysiwyg-table-cell-boundary-matrix-probe` on Windows
  PowerShell or `npm run smoke:wysiwyg-table-cell-boundary-matrix-probe`
  elsewhere. The probe covers both sides of the retry guard: child-reported
  `ok:false` failures do not retry, while a child process crash before any
  `ok` summary retries once and can pass on the next attempt.
- For the colspan-only Flow Table target, use
  `npm.cmd run smoke:wysiwyg-flow-table-colspan-boundary` on Windows
  PowerShell or `npm run smoke:wysiwyg-flow-table-colspan-boundary` elsewhere.
- For the colspan-only Flow Table 3-4 page over-case target, use
  `npm.cmd run smoke:wysiwyg-flow-table-colspan-overcase` on Windows
  PowerShell or `npm run smoke:wysiwyg-flow-table-colspan-overcase` elsewhere.
- For the rowspan Flow Table target, use
  `npm.cmd run smoke:wysiwyg-flow-table-rowspan-boundary` on Windows
  PowerShell or `npm run smoke:wysiwyg-flow-table-rowspan-boundary` elsewhere.
- For the mixed `rowspan` + `colspan` Flow Table target, use
  `npm.cmd run smoke:wysiwyg-flow-table-mixed-span-boundary` on Windows
  PowerShell or `npm run smoke:wysiwyg-flow-table-mixed-span-boundary`
  elsewhere.
- Use `SMOKE_PORT=<port>` to choose a dev-server port.
- Use `SMOKE_BASE_URL=http://localhost:<port>/editor` only when pointing at an
  already-running server with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1` and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1`.

The automated smoke starts the flagged editor, opens
`/editor?flowdocTestScenario=wysiwyg-stage3-boundary`, double-clicks the
`stage3-table-cell-target` paragraph inside a table cell, types a heavy
multiline payload, and verifies:

- the active cell paragraph splits across multiple pages through browser
  preview pagination
- the active draft-island text-engine layer remains mounted with multiple
  pointer fragments
- exactly one hidden input bridge owns text input, and no native or legacy
  inline textarea fallback mounts
- the base table-cell target accepts active-draft `Enter`, creates the next
  paragraph inside the same `flow-table-cell`, records a `SPLIT_PARAGRAPH`
  action plus structural Enter split event, and commits typed text into that
  new cell paragraph
- no layout error appears
- the first table-cell browser-preview pagination starts within the responsive
  threshold

This check protects Phase A table-cell cross-page typing responsiveness and
guards that Phase B visual-only chrome does not remain after settled browser
preview pagination. Focused `EditorCanvas` unit coverage owns the pre-settled
chrome shape. The base table-cell smoke does not claim full multi-cell live
table preview. The Flow Table colspan variant uses the same script against
`stage3-flow-table-colspan-target`, additionally checking that the target cell
keeps colspan-width chrome and the shorter sibling paragraph is not duplicated
on continuation slices, while also covering active-draft `Enter`, immediate
empty paragraph Backspace delete, and that operation's Undo/Redo restoration.
The colspan over-case variant uses the same target with a longer
customer-data-like payload and requires at least three active target pages,
checking 3-4 page live pagination, pointer fragments, continuation re-entry,
and performance trace duration budgets. The Flow Table rowspan
variant uses the same script against `stage3-flow-table-rowspan-target`,
checking that the active cell continues through multiple row parents and the
authored sibling paragraphs are not duplicated, while also covering
active-draft `Enter`, immediate empty paragraph Backspace delete, and that
operation's Undo/Redo restoration. The mixed-span variant uses
`stage3-flow-table-mixed-span-target`, checking that a `rowspan>1` and
`colspan>1` active cell keeps its wide cell chrome, continues through multiple
row parents, does not duplicate sibling paragraphs, can be re-entered from a
continuation fragment with a single click while staying on the text-engine path,
and also covers active-draft `Enter`, immediate empty paragraph Backspace
delete, and that operation's Undo/Redo restoration.

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
- If the change touches export/status wiring, trigger or inspect export while
  the layout is optimistic, reconciling, drifted, or fill readiness has errors;
  confirm export is blocked or clearly warned without making the canvas snapshot
  the source of truth.

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
- Confirm the selected structure is `flow-table-cell`, not only the inner paragraph.
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
- Confirm `/fonts/Sarabun/Sarabun-Regular.ttf` is reachable from the browser when export or
  font status changes are in scope.
- Confirm PDF/DOCX export buttons are disabled or blocked while authoritative
  layout, font, drift, or fill-readiness state is unsafe.
- For the P0 user-report path, load a saved company/government/university style
  package, switch to Fill mode, verify header/footer preview visibility, confirm
  no font fallback or layout warning is visible, export PDF, and verify the PDF
  page count.
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
