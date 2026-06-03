# Work Log

This document tracks completed work on FlowDocEditor so future sessions can quickly see what changed, what was verified, and what remains open.

For the expected collaborator/session workflow, including when to update this
file, see `docs/AGENT_WORKFLOW.md`.

## Log Format

Each entry should include:

- Date/time
- Goal
- Summary of completed work
- Files changed
- Verification performed
- Notes or follow-ups

---

## 2026-06-03

### Release 0.6.25 Structural Editing Gate

Goal: Mark the accepted structural Enter/Backspace WYSIWYG draft-island
hardening as the next project release-readiness baseline.

Completed:

- Bumped the root project version marker from `0.6.24` to `0.6.25`.
- Updated the root lockfile version metadata and project version marker test to
  assert the accepted `0.6.25` baseline.
- Updated `docs/VERSIONING.md` with the structural editing release gate
  baseline and retained the persisted document/package schema version boundary.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification performed:

- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerRichText.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `git diff --check`

Notes:

- No git tag was created; project versions remain release-readiness markers.
- This patch does not change `DocumentNode.version`, FlowDoc package version,
  storage package version, pagination semantics, undo/redo, export behavior, or
  Flow Table behavior.

---

### Boundary-Safe Island Page-Break Visual Suppression

Goal: Hide the stale authored page-break marker/chrome while a boundary-safe
out-of-canvas WYSIWYG structural split island owns the newly split paragraph
immediately before that page-break.

Completed:

- Added a visual-only `ActiveOutOfCanvasStructuralIsland` prop from
  `EditorShell` to `EditorCanvas` for active `mode="boundary-safe"`
  optimistic structural islands.
- Computed `suppressedPageBreakNodeId` from the optimistic document child order
  so `cover_note -> new paragraph -> cover_break` suppresses only `cover_break`.
- Refactored stale page-break suppression into
  `shouldSuppressStalePageBreakForActiveWysiwygIsland`, combining the existing
  native inline edit condition with the new out-of-canvas boundary-safe island
  condition.
- Suppressed the stale page-break marker, fragment label, chrome opacity, and
  pointer interaction while leaving the document and paginated data intact.
- Added page memo/lazy render scope wiring for the active boundary-safe island
  and suppressed page-break page.
- Extended the smoothness probe frame capture to report immediate page-break
  marker visibility, boundary-safe suppression, and marker return after settle.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification performed:

- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `SMOKE_BASE_URL=http://localhost:4000/editor PROBE_MODE=enter-mid-split FLOWDOC_PROBE_FILE=public/mock/flowdoc-long-mock.flowdoc.json PROBE_TARGET_NODE_ID=cover_note PROBE_ENTER_SPLIT_TEXT=pagination PROBE_READY_TIMEOUT_MS=30000 npm.cmd run smoke:wysiwyg-smoothness`

Observed:

- Focused app coverage passed with 181 tests.
- Long-mock smoke captured `cover_break` with
  `boundarySafePageBreakSuppressed=true`,
  `nextPageBreakMarkerVisible=false`, and `nextPageBreakLabelVisible=false`
  at the immediate post-Enter frame while the new paragraph island was active.
- The same smoke captured marker return after settled pagination at the later
  frame with `nextPageBreakBoundarySafeSuppressed=false` and
  `nextPageBreakMarkerVisible=true`.
- The smoke command still exited nonzero because the existing structural
  visibility budget is `<=500ms` and this 119-page dev-server run reported
  about `1170ms`; this is the pre-existing performance risk, not stale
  page-break visual evidence.

Notes:

- Scope intentionally did not change document operations, core pagination,
  PDF/DOCX renderers, package persistence, Flow Table code, SVG live echo,
  custom caret rendering, or key-repeat behavior.
- The fallback suppression remains local to the active island page and a narrow
  vertical range, and is only used when Shell cannot identify the precise
  page-break sibling id.

---

### WYSIWYG Structural Key Repeat Guard

Goal: Guard structural Enter/Backspace in the FlowDoc draft island so rapid key
repeat cannot run split/merge/delete-empty operations against half-transitioned
island or document state.

Completed:

- Added a narrow structural edit guard in `FlowdocDraftEditorIslandRoot` for
  `Enter` and `Backspace` only, with operation/source metadata, expected active
  node/remove hints, deterministic unlock on active-node/session change, and a
  180ms safety timeout.
- Kept normal typing and IME/composition outside the guard path.
- Added `flowdoc-island-structural-guard` perf events for engage, accept, drop,
  and unlock actions.
- Extended the smoothness probe with `enter-rapid` burst dispatch,
  `backspace-rapid`, and guard-event summaries for the long mock
  `cover_note -> cover_break` structural case.
- Added focused tests for repeated Enter/Backspace guard drops, unlock before
  immediate Enter-to-Backspace, and normal text/IME bypass.

Files changed:

- `src/app/editor/_components/FlowdocDraftEditorIslandRoot.tsx`
- `src/app/editor/_components/wysiwygPerformance.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification performed:

- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `npm.cmd run type-check`
- `SMOKE_BASE_URL=http://localhost:4000/editor PROBE_MODE=enter-rapid FLOWDOC_PROBE_FILE=public/mock/flowdoc-long-mock.flowdoc.json PROBE_TARGET_NODE_ID=cover_note PROBE_ENTER_SPLIT_TEXT=pagination PROBE_STRUCTURAL_ENTER_COUNT=8 PROBE_READY_TIMEOUT_MS=30000 npm.cmd run smoke:wysiwyg-smoothness`
- `SMOKE_BASE_URL=http://localhost:4000/editor PROBE_MODE=enter-backspace-immediate FLOWDOC_PROBE_FILE=public/mock/flowdoc-long-mock.flowdoc.json PROBE_TARGET_NODE_ID=cover_note PROBE_ENTER_SPLIT_TEXT=pagination PROBE_READY_TIMEOUT_MS=30000 npm.cmd run smoke:wysiwyg-smoothness`
- `SMOKE_BASE_URL=http://localhost:4000/editor PROBE_MODE=backspace-rapid FLOWDOC_PROBE_FILE=public/mock/flowdoc-long-mock.flowdoc.json PROBE_TARGET_NODE_ID=cover_note PROBE_ENTER_SPLIT_TEXT=pagination PROBE_STRUCTURAL_BACKSPACE_COUNT=8 PROBE_READY_TIMEOUT_MS=30000 npm.cmd run smoke:wysiwyg-smoothness`

Observed:

- Focused app coverage passed with 145 tests.
- `enter-rapid` passed with one structural split dispatch for eight Enter
  events and no console/page errors.
- `enter-backspace-immediate` passed with the source paragraph immediately
  cleared to before-text, the tail active in the draft island, source/new/page
  break order safe, no duplicate stale text, and one merge dispatch.
- `backspace-rapid` passed with one structural merge dispatch, no ghost new
  fragment/text, active node returned to `cover_note`, and no console/page
  errors.

Notes:

- Scope intentionally did not change core document operations, pagination,
  renderers, package persistence, Flow Table code, page-break suppression, or
  non-structural typing behavior.
- After a Backspace merge commits, later repeated Backspace events may edit the
  now-current paragraph text; the guard only blocks stale structural operations.
- Real IME/manual browser verification remains outside this automated pass.

---

### Long Mock Optimistic Enter Backspace Merge Commit Ordering

Goal: Fix the immediate Backspace-after-Enter path for the `cover_note`
long-mock structural island so merge/refocus uses the committed optimistic split
document and does not fall back to stale or delayed state.

Completed:

- Added a reducer fast path so `MERGE_PARAGRAPH` can accept a shell-precomputed
  merge result plus supplied optimistic `PaginatedDocument`.
- Changed optimistic merge refocus to dispatch `MERGE_PARAGRAPH` in the same
  `flushSync` transition as the island refocus setup, removing the deferred
  merge dispatch window.
- Updated immediate Backspace handling to use the optimistic split document when
  the current new paragraph exists there before the settled reducer ref catches
  up, while preserving the legacy pending split flush safety fallback.
- Allowed optimistic merge refocus to use the current paragraph fragment from
  the out-of-canvas island when a boundary-safe split has no in-canvas current
  fragment.
- Extended the smoothness probe with `enter-backspace-immediate` long-mock
  capture for node removal, returned active island, source/page-break order,
  ghost fragment/text checks, and merge timings.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/editorReducer.ts`
- `src/app/editor/_components/optimisticStructuralRefocus.ts`
- `src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`

Verification performed:

- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerRichText.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `SMOKE_BASE_URL=http://localhost:4000/editor PROBE_MODE=enter-backspace-immediate FLOWDOC_PROBE_FILE=public/mock/flowdoc-long-mock.flowdoc.json PROBE_TARGET_NODE_ID=cover_note PROBE_ENTER_SPLIT_TEXT=pagination PROBE_ENTER_FRAME_DELAYS_MS=0,50,120,300,800 PROBE_READY_TIMEOUT_MS=30000 npm.cmd run smoke:wysiwyg-smoothness`
- `git diff --check`

Observed:

- Focused app coverage passed with 141 tests.
- The long-mock Backspace probe passed with `newNodeGone=true`,
  `returnedToPreviousNode=true`, `documentOrderAfterMergeOk=true`,
  `ghostNewFragmentVisible=false`, `ghostNewTextVisible=false`,
  `sourceRestoredTail=true`, `optimisticMergeRefocusCount=1`, and
  `usedFullPaginationBeforeIsland=false`.
- Re-running `enter-mid-split` still captured `sourceImmediatelyCleared=true`,
  `activeNewParagraphInIsland=true`, and `duplicateOldTextDetected=false`, but
  exited nonzero because the existing `<=500ms` visibility budget reported
  about `530ms` on the 119-page dev-server run.

Notes:

- Merge/backspace changes were limited to optimistic plain paragraph refocus;
  table, flow-stack, row-stack, list marker, core pagination, renderers,
  package persistence, and Flow Table code were not changed.

---

### Long Mock Optimistic Enter Split Commit Ordering

Goal: Fix the `cover_note` structural Enter race where the V2 out-of-canvas
draft island could appear before the reducer/model and optimistic paginated
snapshot had committed.

Completed:

- Changed the optimistic `SPLIT_PARAGRAPH` path to dispatch in the same
  `flushSync` transition as the structural island setup, removing the deferred
  split dispatch window.
- Added a reducer fast path so `SPLIT_PARAGRAPH` can accept a shell-precomputed
  split result and supplied optimistic `PaginatedDocument` without recomputing
  the split.
- Extended the smoothness probe's `enter-mid-split` long-mock case to default
  to `public/mock/flowdoc-long-mock.flowdoc.json`, `cover_note`, split text
  `pagination`, next node `cover_break`, and immediate source/tail duplication
  frame capture.
- Added reducer coverage for precomputed split before a page break, source text
  clearing, child order, `lastSplitNodeId`, history, and optimistic pagination.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/editorReducer.ts`
- `src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`

Verification performed:

- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts`
- `SMOKE_BASE_URL=http://localhost:4000/editor PROBE_MODE=enter-mid-split FLOWDOC_PROBE_FILE=public/mock/flowdoc-long-mock.flowdoc.json PROBE_ENTER_FRAME_DELAYS_MS=0,50,120,300,800 PROBE_READY_TIMEOUT_MS=30000 npm.cmd run smoke:wysiwyg-smoothness`

Observed:

- Focused reducer coverage passed and preserved document order
  `cover_note -> cover_note_split -> cover_break`.
- Long-mock probe captured `sourceImmediatelyCleared=true`,
  `activeNewParagraphInIsland=true`, and `duplicateOldTextDetected=false`.
- The long-mock probe still exited nonzero because the existing structural
  visibility budget is `<=500ms` and the current 119-page dev-server run
  reported about `1613ms`; this remains a performance RISK, not stale-source
  duplication evidence.

Notes:

- Scope intentionally did not change merge/backspace semantics beyond keeping
  split compatible with the existing paths.
- Core pagination, renderers, package persistence, and Flow Table code were not
  changed.

---

## 2026-06-02

### V2 WYSIWYG Risk Sweep: Blur, Click, Enter, Table, Stack Guards

Goal: Sweep the eight active WYSIWYG risks after the V2 editor-island work,
keeping the patch narrow and avoiding pagination, schema, export, table-cell V2,
and flow-stack V2 expansion.

Completed:

- Kept the V2 island in a committing state during blur/click-out and delayed the
  final edit end until after paint, so the island remains the visual bridge while
  parent sync/finalize runs.
- Fixed stale closure handling in inline-edit end so WYSIWYG blur finalization
  runs once against the current session node.
- Suppressed the in-canvas paragraph text surface while the out-of-canvas V2
  island owns active plain-paragraph editing, preventing a duplicate active
  visual owner during click/edit and Enter handoff.
- Added pending optimistic Enter split rollback for immediate
  Enter-then-Backspace before the deferred split dispatch commits.
- Tightened stress lifecycle smoke target selection to skip continuation
  fragments and added env aliases so both `STRESS_PAGE_INDEX` /
  `FLOWDOC_STRESS_FILE` and `PROBE_TARGET_PAGE_INDEX` / `FLOWDOC_PROBE_FILE`
  reach the same stress target.
- Ensured the table-cell boundary smoke enables runtime WYSIWYG perf trace when
  connecting to an existing dev server.

Verification performed:

- `npm.cmd run type-check`
- `node --check scripts\wysiwyg-stress-lifecycle-smoke.mjs`
- `node --check scripts\wysiwyg-table-cell-boundary-smoke.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `PROBE_MODE=blur-handoff npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=enter PROBE_BURST_LENGTH=1 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=long-unbroken PROBE_BURST_LENGTH=220 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=mixed-pagination PROBE_BURST_LENGTH=180 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_TARGET_PAGE_INDEX=15 FLOWDOC_PROBE_FILE=public/mock/flowdoc-stress-mock.flowdoc.json npm.cmd run smoke:wysiwyg-stress-lifecycle`
- `SMOKE_BASE_URL=http://localhost:4000/editor npm.cmd run smoke:wysiwyg-table-cell-boundary`

Observed:

- Stress click-switch passed at about `656ms` with
  `browserPreviewPagination.count=0`; inline edit start/finalize were about
  `40ms` each in the passing alias-env run.
- Blur handoff finalized once after the stale-session closure fix.
- Long-unbroken typing kept `editorCanvasCommit.count=0` during the key burst.
- Mixed-pagination typing passed with no old visual leakage and no stale measured
  preview after blur.
- Table-cell boundary smoke passed on the existing server with first draft
  pagination delay about `113ms`; visual chrome rose to `6` before settle and
  cleared to `0` after settled pagination.

Notes:

- PASS for the guarded plain-paragraph V2 lifecycle checks and the existing
  table-cell boundary guard.
- RISK remains for manual Enter-then-Backspace after the split has already
  committed; the new rollback only covers the pending optimistic window.
- RISK remains for page-boundary continuation polish, full table-cell V2 parity,
  and flow-stack/row-stack V2 enablement. Those paths stay intentionally
  excluded from this slice.
- Manual QA remains the final product gate; smoke PASS is not a full UX PASS.

---

### P1 Edit/Enter Handoff Flicker Reduction

Goal: Investigate the remaining manual flicker/brief double-render feeling when
clicking into edit mode or pressing Enter, without changing pagination
algorithms, schema, table-cell behavior, flow-stack behavior, export, or the V2
typing visual model.

Completed:

- Identified that the V2 island portal could miss the first active render when
  the page overlay anchor existed in the shell ref map but had not yet been
  copied into island state.
- Resolved the page overlay anchor synchronously during island render so the
  portal does not need a second state pass just to find an already-mounted page
  overlay.
- Identified that optimistic Enter split previously committed `SET_PAGINATED`
  before `SPLIT_PARAGRAPH`, creating a short mismatch where `state.paginated`
  represented the split document while `state.doc` was still the old document.
- Changed `SPLIT_PARAGRAPH` to accept the optimistic `PaginatedDocument` and
  commit the document split plus optimistic page state in the same reducer
  action.
- Added reducer coverage for the same-action optimistic split pagination path.

Verification performed:

- `npm.cmd run type-check`
- `node --check scripts\wysiwyg-smoothness-probe.mjs`
- `node --check scripts\wysiwyg-stress-lifecycle-smoke.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `npm.cmd run smoke:wysiwyg-stress-lifecycle`
- `PROBE_MODE=enter-rapid PROBE_BURST_LENGTH=3 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=long-unbroken PROBE_BURST_LENGTH=220 npm.cmd run smoke:wysiwyg-smoothness`

Observed:

- Stress click-switch passed at about `287ms`.
- Click-switch `browserPreviewPagination.count` stayed `0`.
- Click-switch `flowdocIslandReactCommit.maxMs` was about `0.1ms`; the largest
  remaining `editorCanvasReactCommit.maxMs` was about `49.4ms`.
- Enter rapid kept `structuralRefocusUsedFullPaginationBeforeIsland=false`;
  optimistic island/caret visibility was about `26.4ms` p50 and `169.5ms` max in
  the focused run.
- Long-unbroken active typing kept `editorCanvasCommit.count=0` and
  `browserPreviewPaginationCount=0`.

Notes:

- This reduces two concrete double-render/flicker causes but is not a product
  PASS claim. Manual QA still decides whether the remaining perceived lag is
  acceptable.
- Settled pagination after Enter can still produce a later visual settle.
- Click/exit still have some EditorCanvas commit cost; that should remain a
  separate targeted slice.

---

### P1 Clean Edit-Entry Page-Boundary Pagination Guard

Goal: Reduce the remaining stress click/edit-switch spike without changing the
pagination algorithm, schema, table-cell behavior, or V2 typing visual model.

Completed:

- Reproduced the stress lifecycle spike after separating the probe's first edit
  setup events from the actual click-switch window.
- Identified that the large click-switch cost was caused by a clean edit-entry
  `browser-preview-pagination` from the previous paragraph session, not by
  draft text measurement.
- Added a V2 island guard so page-boundary reflow/pagination is only queued
  after the local draft revision has changed.
- Reset the page-boundary reflow request guard per active edit session.
- Extended smoke output to include console/page error samples for future
  diagnosis.

Verification performed:

- `node --check scripts\wysiwyg-stress-lifecycle-smoke.mjs`
- `node --check scripts\wysiwyg-smoothness-probe.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `npm.cmd run smoke:wysiwyg-stress-lifecycle`
- `PROBE_MODE=long-unbroken PROBE_BURST_LENGTH=220 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=enter-rapid PROBE_BURST_LENGTH=3 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=mixed-pagination PROBE_BURST_LENGTH=180 npm.cmd run smoke:wysiwyg-smoothness`

Observed:

- Stress click-switch passed at about `295ms`.
- Click-switch `browserPreviewPagination.count` dropped to `0`.
- Click-switch `editorCanvasReactCommit.maxMs` was about `47.2ms` in the
  passing run.
- Long-unbroken active typing kept `editorCanvasCommit.count=0` and
  `browserPreviewPaginationCount=0`.
- Console errors and page errors were `0` in the final focused smokes.

Notes:

- This slice intentionally does not optimize full pagination/cache.
- Dirty page-boundary typing can still use the existing V2 local draft surface
  and deferred settle paths; clean edit entry should not schedule settled draft
  pagination.

### Optimistic Plain Paragraph Structural Refocus

Goal: Fix the P0 Enter split/refocus delay for eligible plain body paragraphs
without optimizing full pagination, changing schema, or enabling table/stack
paths.

Completed:

- Added a plain-paragraph optimistic structural refocus path for V2
  out-of-canvas editor island Enter split.
- Preallocates the new paragraph id, locally patches the current page
  `PaginatedDocument` with source/new paragraph fragments, and starts the new
  island before full preview pagination settles.
- Keeps reducer/core operations as the actual document mutation path by passing
  the preallocated id into `SPLIT_PARAGRAPH`.
- Added structural refocus markers for optimistic island/caret visibility,
  whether full pagination happened before the island, and settled pagination.
- Kept fallback to the previous full-pagination refocus path when the paragraph
  is not an eligible plain non-continuation body paragraph.

Verification performed:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- operations`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts`
- `npm.cmd run test:app`
- `PROBE_MODE=enter PROBE_BURST_LENGTH=1 SMOKE_BASE_URL=http://localhost:4000/editor PROBE_READY_TIMEOUT_MS=60000 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=enter PROBE_BURST_LENGTH=1 FLOWDOC_PROBE_FILE=public/mock/flowdoc-stress-mock.flowdoc.json PROBE_TARGET_PAGE_INDEX=15 SMOKE_BASE_URL=http://localhost:4000/editor PROBE_READY_TIMEOUT_MS=180000 npm.cmd run smoke:wysiwyg-smoothness`

Observed:

- Stage 3 Enter smoke: optimistic island/caret visible around `41.6ms`,
  settled pagination around `88.8ms`, and
  `usedFullPaginationBeforeIsland=false`.
- Stress fixture page `15`, paragraph `p_00134`: optimistic island/caret
  visible around `127.3ms`, full pagination before island stayed `false`, and
  settled pagination followed later around `3561.4ms`.
- Console errors and page errors stayed at `0` in the focused smokes.

Notes:

- This slice intentionally does not optimize full pagination/cache. The large
  document still needs several seconds for settled pagination after the island is
  visible.
- Scope remains plain paragraph only. Table-cell, flow-stack/row-stack,
  continuation, click-switch, and blur/click-out pauses remain separate risks.

P0b hardening follow-up:

- Added split-id collision coverage for preallocated optimistic paragraph ids in
  core operations and reducer undo tests.
- Added stale optimistic-settle guard events so scheduled/worker preview
  pagination is ignored if the active inline-edit node changes, the generation
  no longer matches, or the draft revision advances before commit.
- Extended the smoothness probe with structural safety modes:
  `enter-type-before-settle`, `enter-rapid`, `enter-undo`, and
  `enter-blur-before-settle`.
- Routed island-owned `Ctrl/Cmd+Z` to `EditorShell` undo so the hidden input
  bridge does not keep browser textarea undo as the active truth.

P0b verification:

- `node --check scripts\wysiwyg-smoothness-probe.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- operations`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `PROBE_MODE=enter-type-before-settle PROBE_STRUCTURAL_TYPE_LENGTH=80 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=enter-rapid PROBE_STRUCTURAL_ENTER_COUNT=3 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=enter-undo npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=enter-blur-before-settle npm.cmd run smoke:wysiwyg-smoothness`

P0b observed:

- Focused Stage 3 structural safety probes pass with
  `structuralRefocusUsedFullPaginationBeforeIsland=false`.
- Fresh-server examples: optimistic island/caret visible at about `14ms` for
  type-before-settle, `18.2ms` max across three rapid Enter splits, `11.4ms`
  for undo safety, and `13.3ms` for blur-before-settle.
- Type-before-settle preserved the typed marker after settled pagination; undo
  removed the optimistic split node and island; blur-before-settle left no ghost
  island.
- Re-running stress-file probes in the existing dev environment exposed a
  separate pre-editor load blocker: the 4.7MB stress fixture can remain on the
  dynamic-import prepare overlay before `[data-testid="editor-shell"]` appears
  for more than 180s, with no console/page errors. This is outside the Enter
  refocus path and should be handled as a separate pre-shell load/readiness
  slice before using stress smoke as a hard P0b gate again.

### P1 Plain Paragraph Click/Edit Switch Isolation

Goal: Reduce stress-document click/edit switch latency for eligible plain body
paragraphs without changing pagination, table-cell WYSIWYG, flow-stack/row-stack
paths, schema, or export behavior.

Completed:

- Added a fast inline-edit start path for single-click V2 plain paragraphs that
  are text-only, non-continuation fragments, and not inside table cells,
  flow-stacks, or row-stacks.
- The fast path starts the V2 island immediately on pointer release instead of
  waiting for the selection/canvas paint rAF + timeout path.
- Kept the existing deferred selection-paint path for table-cell, stack,
  continuation, and other non-eligible click actions.
- Extended the stress lifecycle smoke output with start/finalize, island commit,
  canvas commit, parent sync, blur handoff, and browser-preview pagination
  summaries.

Verification performed:

- `node --check scripts\wysiwyg-stress-lifecycle-smoke.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `npm.cmd run smoke:wysiwyg-stress-lifecycle`
- `PROBE_MODE=enter-rapid PROBE_BURST_LENGTH=3 npm.cmd run smoke:wysiwyg-smoothness`

Observed:

- Before this patch, the stress lifecycle smoke reproduced click-switch
  instability: one default run failed at about `3844ms`, and a diagnostic run
  timed out waiting for the second paragraph to enter edit mode.
- After this patch, focused stress lifecycle runs passed the default `<=2000ms`
  gate with examples around `1491ms` and `363ms`.
- The second stress target (`p_00134`) used `inline-edit-start` source
  `canvas-click-immediate`; finalize remained responsive-preview and did not
  require full pagination before the island appeared.
- Stage 3 rapid Enter guard still reported
  `structuralRefocusUsedFullPaginationBeforeIsland=false`.
- The earlier pre-editor stress load blocker was not reproduced after a fresh
  dev-server run; it is currently classified as stale local dev-server state,
  not as part of this click-switch slice.

Notes:

- This is not a full canvas commit optimization. Stress runs still show
  background `EditorCanvas` commits and undo/blur costs that belong to later
  slices.
- The fast path is intentionally limited to eligible plain paragraphs. Table
  cells, flow-stack/row-stack, continuation fragments, page-boundary behavior,
  and blur/click-out atomic swap remain separate risks.

### P1 Blur / Click-Out Handoff Guard

Goal: Reduce duplicate exit/finalize work and make V2 plain-paragraph
click-out/keyboard exit ordering safer without changing pagination, schema,
table-cell WYSIWYG, flow-stack/row-stack, or export behavior.

Completed:

- Added a per-session V2 island guard so `onEndEdit` is requested only once
  even if keyboard exit and native blur both fire.
- Added a deferred Shell end path for background pointerdown while an
  out-of-canvas V2 island is active. The Shell may clear selection immediately,
  but the measured finalize/end work is scheduled after paint and skipped if
  another session has already taken over.
- Kept the existing immediate finalize path for non-V2 inline edit, header/footer
  edit, margin edit, and non-eligible paths.
- Adjusted blur-handoff instrumentation so suppressed duplicate end callbacks
  report zero-duration marker events instead of inflating latency summaries.

Verification performed:

- `node --check scripts\wysiwyg-smoothness-probe.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- `PROBE_MODE=blur-handoff npm.cmd run smoke:wysiwyg-smoothness`
- `npm.cmd run smoke:wysiwyg-stress-lifecycle`

Observed:

- `blur-handoff` smoke passed with parent sync before finalize,
  `finalizeBeforeParentSyncDetected=false`, and committed marker text visible
  after settle.
- Latest focused blur sample: `clickToLayerGoneMs≈506ms`,
  `clickToSettledMs≈556ms`, one `inline-edit-finalize`, and no console/page
  errors.
- Stress lifecycle passed with `exitMs≈217ms`, one exit finalize event, and the
  duplicate blur callback reported as `end-edit-suppressed` with zero duration.

Notes:

- This is a lifecycle/order hardening slice, not a full click-out latency
  optimization. The remaining pause is still dominated by measured finalize and
  `EditorCanvas` commit work.
- Stress lifecycle still shows background `EditorCanvas` commit spikes; one
  sample had a click-switch canvas commit around `1072ms` while still passing
  the current `<=2000ms` gate. That belongs to a later canvas/render-cost slice.

---

## 2026-06-01

### Instrument Plain Paragraph Structural Refocus

Goal: Classify the remaining plain-paragraph Enter split latency risk without
changing document structure, pagination output, or the V2 island visual model.

Completed:

- Added `inline-edit-structural-refocus` perf events around
  `useInlineEditSession.startAfterStructuralChange`.
- Split the marker into `paginate-preview`, `start-session`, and
  `missing-paragraph` actions so Enter split can be separated from canvas
  commits and draft measurement in smoke output.
- Extended the WYSIWYG smoothness probe summary with a structural refocus
  section.
- Fixed external-file smoothness target selection so
  `FLOWDOC_PROBE_FILE + PROBE_TARGET_PAGE_INDEX` filters visible paragraph
  candidates by the requested page instead of selecting the largest attached
  paragraph fragment globally.

Verification performed:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts`
- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `PROBE_MODE=enter PROBE_BURST_LENGTH=1 SMOKE_BASE_URL=http://localhost:4000/editor PROBE_READY_TIMEOUT_MS=60000 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=held-repeat PROBE_BURST_LENGTH=220 SMOKE_BASE_URL=http://localhost:4000/editor PROBE_READY_TIMEOUT_MS=60000 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=enter PROBE_BURST_LENGTH=1 FLOWDOC_PROBE_FILE=public/mock/flowdoc-stress-mock.flowdoc.json PROBE_TARGET_PAGE_INDEX=15 SMOKE_BASE_URL=http://localhost:4000/editor PROBE_READY_TIMEOUT_MS=180000 npm.cmd run smoke:wysiwyg-smoothness`

Observed:

- Single Enter in the Stage 3 smoke scenario passed with
  `paginatePreview=17.8ms`, `startSession=17.8ms`, `editorCanvasCommitCount=3`,
  `editorCanvasCommitMaxMs=12.9ms`, and console/page errors at `0`.
- Held-repeat still passed with stable `flowdoc-draft-editor-island` mode,
  hidden native input bridge, no live echo/draft replacement leakage, and
  console/page errors at `0`.
- Held-repeat still showed broader page-boundary work:
  `inputToVisibleDraftLinesMs max=128.3ms`,
  `flowdoc-island-visible-lines max=35.1ms`, and frame gap max around
  `124.2ms`.
- Follow-up on `public/mock/flowdoc-stress-mock.flowdoc.json`
  (`Mock FlowDoc Stress Thai Document`) reproduced the large-document issue:
  single Enter reported `paginatePreview` around `2718.1ms` on one run and
  `2265.5ms` on a second run, with `EditorCanvas` commit max around
  `154ms` to `234ms`.
- After page-target selection was fixed, page index `15` correctly targeted
  paragraph `p_00134` and still reported `paginatePreview=2367.7ms`,
  `startSession=2368.1ms`, and `EditorCanvas` commit max `322.1ms`.
- `npm.cmd run smoke:wysiwyg-stress-lifecycle` against the existing dev server
  failed its click-switch gate with `Click switch took 3328ms, expected <=
  2000ms`.

Notes:

- This slice intentionally does not optimize pagination or Enter split
  semantics. The small Stage 3 scenario was not enough to prove the bottleneck,
  but the stress fixture confirms the current Enter/refocus path still performs
  expensive synchronous full-preview pagination.
- The next implementation slice should avoid blocking structural refocus on
  full synchronous preview pagination for eligible plain paragraphs, while
  preserving normal measured pagination as the settled source of truth.

---

### Guard FlowDoc Island Click-Out Draft Handoff

Goal: Fix and characterize the remaining plain-paragraph V2 click-out handoff
where manual QA saw a brief pause after leaving edit mode.

Completed:

- Added a `blur-handoff` WYSIWYG smoke probe that verifies the active island
  draft text is committed after clicking outside the island.
- Added island blur/parent-sync and editor inline-edit-end perf markers so the
  click-out event order is explicit.
- Fixed the stale commit ordering by flushing the V2 island draft during
  document `pointerdown` capture when the pointer target is outside the active
  island, before `EditorShell` finalizes the edit.
- Followed up by removing the `flushSync` parent-draft path from blur/click-out
  and making finalize read the latest synchronous draft snapshot through the
  shared `resolveWysiwygDraftPaginationSource` helper.
- Kept the outside-pointer fix scoped to the active out-of-canvas island path;
  it does not change pagination, schema, table logic, export, or data binding.
- Investigated a precomputed preview fast lane and backed it out because it
  made the outside-pointer sync heavier while finalize still used the settled
  path.

Files changed:

- `src/app/editor/_components/FlowdocDraftEditorIslandRoot.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/wysiwygPerformance.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`

Verification performed:

- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `PROBE_MODE=blur-handoff SMOKE_BASE_URL=http://localhost:4000/editor PROBE_READY_TIMEOUT_MS=60000 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=held-repeat PROBE_BURST_LENGTH=220 SMOKE_BASE_URL=http://localhost:4000/editor PROBE_READY_TIMEOUT_MS=60000 npm.cmd run smoke:wysiwyg-smoothness`

Observed blur-handoff result:

- Before the fix, `inline-edit-finalize` ran before
  `flowdoc-island-parent-sync`, and the appended probe marker was missing from
  settled measured SVG.
- After the fix, `appendedTextCommitted=true` and
  `finalizeBeforeParentSyncDetected=false`.
- Latest follow-up sample after removing the blur `flushSync` path:
  `flowdoc-island-parent-sync=0.6ms`, `inline-edit-finalize=28.7ms`,
  `clickToLayerGoneMs=158.9ms`, and `clickToSettledMs=193.1ms`.
- Held-repeat smoke still passed with stable `flowdoc-draft-editor-island` mode,
  no visible native textarea, no live echo/draft replacement leakage, and
  console/page errors at `0`.

Notes:

- This is a correctness and diagnostics slice, not a full click-out latency
  optimization.
- Remaining latency is now mostly the measured-layout finalize/swap path and
  `EditorCanvas` commits, not stale draft ordering.
- Structural Enter split latency remains a separate risk because the current
  split/refocus path still runs synchronous preview pagination before reopening
  the new paragraph edit session.

---

### Anchor FlowDoc Draft Editor Island V2 To Page Overlay

Goal: Fix the approved plain-paragraph V2 scroll-anchoring blocker before
continuing selection, table-cell, page-boundary, or performance polish.

Completed:

- Added a page content overlay root inside each `EditorCanvas` page frame so
  the FlowDoc Draft Editor Island can move with the page through normal browser
  scrolling instead of viewport-fixed React state updates.
- Portaled each V2 island surface into its matching page overlay root and kept
  the hidden input bridge offscreen as input plumbing only.
- Changed V2 pointer hit testing to resolve from the actual island SVG
  `getBoundingClientRect()` and viewBox coordinate space, so click/caret mapping
  uses the same geometry the user sees.
- Added `PROBE_MODE=scroll-anchoring` to the WYSIWYG smoothness probe and
  updated multi-surface pointer probing to choose visible island-owned surfaces.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/FlowdocDraftEditorIslandRoot.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`

Verification performed:

- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `PROBE_MODE=scroll-anchoring SMOKE_BASE_URL=http://localhost:4000/editor PROBE_READY_TIMEOUT_MS=60000 npm.cmd run smoke:wysiwyg-smoothness`
- `PROBE_MODE=held-repeat PROBE_BURST_LENGTH=220 SMOKE_BASE_URL=http://localhost:4000/editor PROBE_READY_TIMEOUT_MS=60000 npm.cmd run smoke:wysiwyg-smoothness`

Observed scroll-anchoring smoke result:

- `ok=true`
- active island anchor: `page-overlay`
- `maxDeltaPx=0.0152`
- click after scroll: `ok=true`
- console errors: `0`; page errors: `0`

Notes:

- This slice intentionally does not change pagination, document schema,
  export, table-cell behavior, selection feature scope, or the hidden-input
  bridge contract.
- Remaining risks: structural Enter split latency, click-out/blur handoff
  pause, broader page-boundary continuation behavior, and table-cell parity
  remain separate slices.

### Release 0.6.24 FlowDoc Draft Editor Island Follow-Up Baseline

Goal: Accept the current FlowDoc Draft Editor Island V2 follow-up work as the
`0.6.24` project marker before the scroll-anchoring fix slice, without
changing persisted document, package, pagination, table, export, or
data-binding schemas.

Completed:

- Added island-owned selection/clipboard and wrapped-line pointer probes so the
  V2 island remains the active visual and interaction owner during plain
  paragraph editing.
- Added page-boundary local height handoff diagnostics and the narrow plain
  paragraph boundary height-preview handoff through the existing inline-edit
  height path.
- Updated split paragraph spacing semantics so an Enter split transfers outer
  spacing: the first paragraph keeps `spacingBefore`, the new paragraph keeps
  `spacingAfter`, and the new split boundary suppresses middle spacing.
- Documented the current scroll-anchoring diagnosis: the out-of-canvas island
  still routes fixed overlay position through React state, so scroll can make
  the island appear to lag the canvas until the next follow-up slice.
- Updated project version markers and versioning docs from `0.6.23` to
  `0.6.24`.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- WYSIWYG smoke/probe scripts for re-enter, smoothness, and Thai repeat checks.
- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `src/app/editor/_components/FlowdocDraftEditorIslandRoot.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- WYSIWYG support helpers/tests for reflow, performance instrumentation, and
  paragraph text surface behavior.

Verification performed:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run smoke:wysiwyg-reenter`
- Focused WYSIWYG smoothness probes for `held-repeat` and `mixed-pagination`
  were run during the follow-up slice.

Notes:

- This baseline is not a general-user `v1` claim.
- Remaining known risks: out-of-canvas island scroll anchoring, structural
  Enter split latency, click-out/blur handoff pause, broader page-boundary
  continuation behavior, and table-cell parity are separate follow-up slices.
- Manual QA remains authoritative for product acceptance.

## 2026-05-31

### Release 0.6.23 FlowDoc Draft Editor Island V2 Baseline

Goal: Accept the current plain-paragraph WYSIWYG stabilization work as the
`0.6.23` project marker before review, without changing persisted document,
package, pagination, table, export, or data-binding schemas.

Completed:

- Added the out-of-canvas FlowDoc Draft Editor Island V2 path for eligible
  plain, text-only paragraph editing so active draft text, caret, hit testing,
  and pointer ownership stay outside the main `EditorCanvas` per-key render
  path.
- Kept the hidden input bridge as keyboard/input plumbing only; visible text
  and click hit testing are FlowDoc-owned draft-line geometry.
- Added held-input/no-wait burst probe coverage and island-vs-canvas timing
  metrics so smoke checks better reflect manual held-key pressure.
- Added caret-mapping fast paths for segment-edge caret positions to reduce
  draft-line/caret render cost during long typing bursts.
- Reconnected same-page active paragraph height preview from the island through
  the existing inline-edit height preview path, scheduled after paint and
  guarded so it fires only when draft height changes meaningfully.
- Updated project version markers and versioning docs from `0.6.22` to
  `0.6.23`.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- WYSIWYG/editor docs and probes touched by the accepted stabilization slices.
- `src/app/editor/_components/FlowdocDraftEditorIslandRoot.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- WYSIWYG support helpers/tests for caret mapping, draft visual preview,
  performance instrumentation, and smoothness/re-enter/table-cell probes.

Verification performed:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd run review:build`
- `npm.cmd run review:archive -- --check`
- Focused WYSIWYG smoothness probes for `long-unbroken`, `held-repeat`, and
  `mixed-pagination` were run during the stabilization slice.

Notes:

- This baseline is not a general-user `v1` claim.
- Remaining known risks: range selection/clipboard, structural Enter/merge
  semantics, page-boundary/continuation handoff, re-enter after complex wraps,
  and table-cell behavior are separate follow-up slices.
- Manual QA remains authoritative for product acceptance.

## 2026-05-29

### Document Table-Cell WYSIWYG Visual Lifecycle

Goal: Record the table-cell native-edit visual preview/chrome lifecycle found
by instrumentation so future scheduling work does not repeat the reverted
current-turn scheduling failure.

Completed:

- Documented that active table-cell native editing may create editor-only visual
  preview/chrome before responsive draft pagination settles.
- Recorded the healthy lifecycle observed by the smoke instrumentation:
  reflow decision -> visual preview/chrome created or updated -> draft
  pagination scheduled -> browser-preview pagination -> draft pagination state
  clears -> visual preview/chrome clears.
- Noted that healthy final-state runs keep the native edit layer stable, keep
  old visual paths from leaking, allow visual chrome to reach `6` before settle,
  and require visual chrome to clear to `0` after settled pagination.
- Recorded that the previous current-turn scheduling attempt was reverted
  because it left table-cell visual chrome at the pre-clear count after settle.
- Added guidance that future scheduling optimization must preserve or explicitly
  await the preview/chrome clear lifecycle.

Files changed:

- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification performed:

- Documentation-only slice; no runtime tests run.

Notes:

- This does not change runtime behavior, smoke thresholds, pagination,
  scheduling, schema, table layout, or export behavior.

## 2026-05-28

### Fix WYSIWYG Typing Immediate Visual Feedback

Goal: Address user feedback that typing briefly freezes and newly typed text
can visually overlap old text, without changing pagination behavior, adding
layout caches, or refactoring editor architecture.

Completed:

- Removed the immediate `measureParagraph(...)` draft-layout call from the
  text-engine keypress path.
- Replaced unmeasured live-echo overlay rendering with a native text-only edit
  layer as the single active visual truth for text-only paragraph editing.
- Kept old `fragment.lines`, SVG draft replacement, live echo, and measured
  draft-line swapping hidden while the native layer is active so typed text
  cannot draw over stale visual text or fight another layout.
- Kept local native draft state on the immediate input path while parent/session
  draft sync remains coalesced behind it.
- Aligned the native edit layer to the measured first line `y` instead of the
  broader fragment top, and moved textarea geometry/height sync to a throttled
  after-paint path so keypress feedback does not wait on `scrollHeight`.
- Kept measured FlowDoc layout, responsive pagination, and commit output on the
  existing final source-of-truth paths after edit settle.
- Updated WYSIWYG contracts to record that the native edit layer owns active
  text, caret, and selection until measured FlowDoc layout is ready to swap back.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `scripts/wysiwyg-smoothness-probe.mjs`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification performed:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `npm.cmd run test:app`
- `SMOKE_BASE_URL=http://localhost:4000/editor npm.cmd run smoke:wysiwyg-smoothness`

Observed smoke result:

- `ok=true`
- `paintLatencyMs.p50=16`, `p95=33.9`, `p99=76.1`, `max=397.6`
- `text-engine-draft-measure=12` during a 400 character burst, confirming the
  input path is no longer measuring the paragraph on every keypress.
- Console errors: `0`; page errors: `0`

Notes:

- The first direct smoke attempt could not start its own Next dev server
  because a local server was already running. A retry against that server
  passed once, then the existing server stopped responding while compiling
  `/editor`; after stopping stale PID `36000`, the smoke script started its own
  server and passed.
- The smoke still reports editor-canvas React commits as the longest event.
  This slice only removes paragraph measurement and live-echo overlap from the
  immediate typing visual path; it does not optimize React rendering.
- This slice intentionally does not change pagination behavior, page-count or
  fragment-count semantics, export behavior, document schema, or layout caches.

---

### Complete 0.6.22 Version Acceptance Slice

Goal: Align the accepted project version marker with the already-bumped
`0.6.22` package files without changing performance behavior.

Completed:

- Updated the project version marker test to assert the accepted `0.6.22`
  baseline.
- Updated `docs/VERSIONING.md` so the current baseline and version table include
  `0.6.22`.
- Recorded this as a version acceptance slice after the performance profiling
  baseline work.

Files changed:

- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification performed:

- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`

Notes:

- This slice intentionally does not change performance behavior, layout
  behavior, pagination semantics, persisted document schema, or package storage
  schema.

---

### Profile Remaining Main-Thread Readiness And Interaction Costs

Goal: Add profiling-only markers for the remaining post-font-scheduling
readiness and interaction bottlenecks without adding caches, refactoring editor
architecture, or changing layout behavior.

Completed:

- Added document import/storage parse sub-stage markers for storage reads, JSON
  parse, persisted package parse, document normalize/assert, field registry
  parse, and field registry validation.
- Added invocation ids for initial editor-state creation, data snapshot
  creation, and field registry creation so repeated initialization work is
  visible in the report.
- Added React subtree profiling around the left rail and right rail, alongside
  the existing editor canvas profiler.
- Extended the baseline JSON and summary with `documentImportBreakdown`,
  `renderBreakdown`, and `interactionBreakdown`, including scroll/click target
  lookup timing, browser-clock scroll/click intervals, correlated long tasks,
  correlated React commits, and inline-edit enter/finalize markers.

Verification performed:

- `node --check scripts/flowdoc-performance-baseline.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `BASELINE_PROFILE_PAGINATION=1 BASELINE_COMPARE_REPORT=reports/perf-baseline-before-font-scheduling/latest.json npm.cmd run perf:baseline`
- `BASELINE_OUTPUT_DIR=reports/perf-baseline-mainthread-off npm.cmd run perf:baseline`
- `npm.cmd run test:app`

Observed latest profiled stress run:

- Latest report: `reports/perf-baseline/latest.json`
- Timestamped report: `reports/perf-baseline/perf-baseline-20260528-182029.json`
- `editorReadyMs=11871`, `fullReadyMs=12671`, `firstPaginationMs=5208.2`
- `preNavigationToPaginationStartMs=6339.9`
- `navigationCompleteToDocumentImported=4885.3ms`
- `main-thread-long-tasks-before-pagination=2306ms`
- Initial import/init counts: `initialEditorStateRuns=2`,
  `dataSnapshotRuns=2`, `fieldRegistryRuns=2`, `storageParseRuns=6`
- Top import/init costs: persisted package parse `352.3ms`, normalize/assert
  `337.3ms`, initial editor state `255.1ms`, storage load/parse `206.3ms`
- Top render-before-pagination cost: left rail mount/updates `811.5ms`
- Interaction costs: scroll-to-middle `1931ms`, first-click edit `907ms`,
  edit switch `786ms`, scroll-to-end `889ms`
- Interaction cause markers: scroll-to-middle had `1317ms` long tasks and one
  `1170.6ms` React commit; first-click edit had `777ms` long tasks and
  `563.2ms` React commits; edit switch had `639ms` long tasks and `506.4ms`
  React commits.
- Browser layout counts unchanged: `pageCount=227`, `fragmentCount=6644`
- Console errors: `0`; page errors: `0`

Profiling-off comparison run:

- Report: `reports/perf-baseline-mainthread-off/latest.json`
- `editorReadyMs=7590`, `fullReadyMs=8107`, `firstPaginationMs=3024.4`
- `preNavigationToPaginationStartMs=4369.9`
- `main-thread-long-tasks-before-pagination=1596ms`
- Initial import/init counts were the same:
  `initialEditorStateRuns=2`, `dataSnapshotRuns=2`,
  `fieldRegistryRuns=2`, `storageParseRuns=6`
- `pagination:browser` event reported `pageCount=227`,
  `fragmentCount=6644`
- Console errors: `0`; page errors: `0`

Notes:

- The six storage/package parse runs come from three separate initial
  lazy-initializer paths: document editor state, data snapshot, and field
  registry. In this dev baseline each ran twice, which is visible through the
  added invocation ids.
- Inline edit entry itself was small in the sampled run (`1.8ms` for first
  click); most click time was main-thread long tasks and React commit work
  around selecting/editing the document surface and right rail.
- This is profiling only. No layout cache, measurement cache, text-width cache,
  pagination algorithm change, editor architecture refactor, or output layout
  change was made.

---

### Reduce Initial Pagination Scheduling Waste Around Font Readiness

Goal: Apply a small, low-risk scheduling fix after profiling showed initial
editor readiness was dominated by fontkit readiness plus stale worker
pagination responses before the first committed browser pagination request.

Completed:

- Reused the default browser editor fontkit measurer promise so React
  StrictMode/effect replay does not start duplicate main-thread fontkit setup.
- Deferred full browser pagination while `editorTextMeasurerStatus` is still
  `loading`; the existing settling/placeholder state remains visible and the
  worker request is posted once the browser measurer is ready.
- Deferred server/API pagination until the browser preview reaches `full`, so
  initial browser pagination is not competing with server pagination during the
  editor-ready path.
- Added fontkit sub-stage markers for main font buffer load and measurer
  creation, plus `BASELINE_COMPARE_REPORT` so `latest-summary.txt` can show
  before/after readiness and layout-count comparison.

Verification performed:

- `node --check scripts/flowdoc-performance-baseline.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorTextMeasurerState.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `BASELINE_PROFILE_PAGINATION=1 BASELINE_COMPARE_REPORT=reports/perf-baseline-before-font-scheduling/latest.json npm.cmd run perf:baseline`
- `npm.cmd run test:app`

Observed latest profiled stress run:

- Latest report: `reports/perf-baseline/latest.json`
- Timestamped report: `reports/perf-baseline/perf-baseline-20260528-174944.json`
- `editorReadyMs`: `48068 -> 15128`
- `firstPaginationMs`: `9342.2 -> 4858`
- `preNavigationToPaginationStartMs`: `38519 -> 10023.6`
- `firstWorkerRequestPostedToCommittedPaginationStartMs`: `33427.7 -> 0`
- `ignoredWorkerResponses`: `2 -> 0`
- Browser layout counts unchanged: `pageCount=227`, `fragmentCount=6644`
- Console errors: `0`; page errors: `0`

Notes:

- The slow `~33s` fontkit-readiness shape was not explained by font file size:
  the latest sub-stage markers show all six font buffers loaded in `362.7ms`
  and main fontkit measurer creation in `550ms` once server contention was
  removed from the initial ready path.
- The avoidable work was stale browser worker pagination while the measurer was
  loading, plus server pagination contention before browser preview was ready.
- This is scheduling only. No measurement cache, text-width cache, pagination
  algorithm change, layout behavior change, export renderer rewrite, or editor
  architecture refactor was made.

---

### Profile Pre-Pagination Lifecycle Delay

Goal: Explain the large elapsed gap before the first committed browser
pagination event without optimizing worker, pagination, layout, or rendering.

Completed:

- Added `prePaginationBreakdown` to the baseline JSON and summary output.
- Added trace-only lifecycle markers for initial document/storage conversion,
  editor-state creation, preview document creation, fontkit readiness, browser
  pagination effect scheduling, debounce delay, worker creation, pagination
  request payload build/post, stale worker responses, server pagination request
  timing, and worker receive-to-compute boundaries.
- Added a browser Long Task observer to summarize large synchronous main-thread
  blocks before the committed pagination request.
- Kept worker-boundary timings separate from top pre-request stages so
  post-request worker compute/queue cost is not reported as pre-start delay.

Verification performed:

- `node --check scripts/flowdoc-performance-baseline.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `npm.cmd run test:app`
- profiling-off baseline:
  `BASELINE_OUTPUT_DIR=reports/perf-baseline-prepagination-off npm.cmd run perf:baseline`
- profiling-on baseline:
  `BASELINE_PROFILE_PAGINATION=1 npm.cmd run perf:baseline`

Observed latest profiled stress run:

- Latest report: `reports/perf-baseline/latest.json`
- Timestamped report: `reports/perf-baseline/perf-baseline-20260528-172409.json`
- `editorReadyMs=48068`, `firstPaginationMs=9342.2`
- `preNavigationToPaginationStartMs=38519`
- `firstWorkerRequestPostedMs=5091.3`
- `firstWorkerRequestPostedToCommittedPaginationStartMs=33427.7`
- `font-readiness/fontkit=33609.9ms`
- stale worker responses: `2` request-id mismatches
- Console errors: `0`; page errors: `0`

Notes:

- In the latest run, browser pagination was requested early, but the first
  committed pagination event waited for fontkit readiness and superseded earlier
  worker responses. Prior validation/off runs showed the same shape with a
  larger pre-pagination wait.
- This is profiling only. No cache, worker optimization, pagination algorithm,
  layout behavior, data binding, export renderer, or editor architecture change
  was made.

---

### Add Pagination Stage Profiling To Baseline

Goal: Extend the measurement-only FlowDoc performance baseline so large-document
pagination cost is broken into stable stages before choosing any optimization.

Completed:

- Added an opt-in pagination profiler with aggregated timings, counters,
  nested stages, top-stage summaries, and source labels for browser/export
  pagination.
- Instrumented the current paginator path for document preparation,
  style/list preparation, flow layout, paragraph measurement, text
  segmentation, text width measurement, table pagination/row/cell work, page
  packing, fragment generation, and browser worker overhead.
- Added `BASELINE_PROFILE_PAGINATION=1` to the baseline runner, report JSON,
  and summary output.
- Attached pagination profiles to browser worker pagination and optional
  `/api/export` PDF/DOCX export profile headers.
- Added parity coverage proving profiling does not change pagination output for
  a small fixture.

Verification performed:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__/profiler.test.ts src/pagination/__tests__/paginationProfile.test.ts`
- `npm.cmd run test:app -- src/app/_lib/__tests__/exportProfile.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts scripts/flowdoc-performance-stats.test.mjs`
- `npm.cmd run test:app`
- `npm.cmd run test:core`
- `npm.cmd run perf:baseline`
- `BASELINE_PROFILE_PAGINATION=1 npm.cmd run perf:baseline`
- `BASELINE_PROFILE_PAGINATION=1 BASELINE_INCLUDE_EXPORT=1 npm.cmd run perf:baseline`

Observed profiled stress run:

- Latest report: `reports/perf-baseline/latest.json`
- Timestamped report: `reports/perf-baseline/perf-baseline-20260528-163009.json`
- Sources: `export-pdf`, `export-docx`, and `browser`
- Browser top stages: `worker-overhead=7261.5ms`,
  `flow-layout=1867ms`, `page-packing=1601.2ms`
- Console errors: `0`; page errors: `0`

Notes:

- This is profiling only. It does not add layout caches, measurement caches,
  data binding, pagination optimization, renderer rewrites, or behavior
  changes.
- Top-stage percentages are computed from measured stage totals. Parent stages
  and child stages can overlap because nested profiling is preserved.

---

### Validate Pagination Profiling Overhead And Readiness Gap

Goal: Compare profiling-off versus profiling-on baseline runs and explain the
gap between first pagination duration and editor-ready time before choosing an
optimization target.

Completed:

- Added `readinessBreakdown` to the baseline JSON and summary, using browser
  `performance.now()` marks for first pagination start/end, editor ready, and
  full-ready.
- Clarified browser `worker-overhead` notes in the report: it is derived from
  browser pagination roundtrip minus worker compute profile and excludes React
  state apply/render commits and report writing.
- Ran no-export validation baselines with profiling off and on in separate
  report directories.

Validation observed:

- Profiling off: `firstPaginationMs=7309.3`, `editorReadyMs=98089`,
  `postFirstPaginationToEditorReadyMs=298.1`, console/page errors `0`.
- Profiling on: `firstPaginationMs=8960`, `editorReadyMs=94264`,
  `postFirstPaginationToEditorReadyMs=280`, console/page errors `0`.
- In the profiled run, browser pagination started at `85092.7ms`, ended at
  `94052.7ms`, and editor-ready was reached at `94332.7ms`.

Notes:

- The large difference between `firstPaginationMs` and `editorReadyMs` is mostly
  before first pagination starts, not after it completes. The observed
  post-pagination-to-editor-ready gap was about `280ms`.
- Profiling increased the measured pagination event by about `1.65s` in this
  one-run comparison, but total editor-ready time varied in the opposite
  direction because the pre-pagination wait is noisy and dominates the run.
- This remained validation only; no worker, pagination, rendering, or layout
  optimization was made.

---

### Harden FlowDoc Performance Baseline Harness

Goal: Finish the measurement-only FlowDoc stress baseline so one command writes
repeatable JSON performance reports without adding optimization, data binding,
or editor architecture changes.

Completed:

- Reworked `npm run perf:baseline` around the stress FlowDoc fixture contract,
  including `BASELINE_FLOWDOC_FILE`, `BASELINE_APP_URL`,
  `BASELINE_OUTPUT_DIR`, `BASELINE_INCLUDE_EXPORT`,
  `BASELINE_ALLOW_CONSOLE_ERRORS`, `BASELINE_TIMEOUT_MS`,
  `BASELINE_HEADFUL`, and `BASELINE_SLOW_MO`.
- Added clear fixture failure stages for missing files, invalid JSON, and
  invalid FlowDoc package/document shapes.
- Added a pure FlowDoc stats collector with coverage for small documents,
  nested Flow Table cell content, field refs, invalid shapes, and the stress
  fixture.
- Added minimal editor test hooks for the loaded document id/title and editable
  paragraph fragments so the harness can prove it opened the intended fixture
  and click real editable surfaces.
- Mirrored existing WYSIWYG perf trace events into
  `window.__FLOWDOC_PERF_EVENTS__` while preserving the existing
  `window.__flowDocWysiwygPerfEvents` path.
- Wrote timestamped and latest JSON reports plus a short summary under
  `reports/perf-baseline/`.
- Added `npm run perf:install-browser` for explicit Playwright Chromium setup.

Files changed:

- `scripts/flowdoc-performance-baseline.mjs`
- `scripts/flowdoc-performance-stats.mjs`
- `scripts/flowdoc-performance-stats.test.mjs`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/wysiwygPerformance.ts`
- `src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `vitest.config.ts`
- `package.json`
- `docs/PERFORMANCE_BASELINE.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification performed:

- `node --check scripts/flowdoc-performance-baseline.mjs`
- `node --check scripts/flowdoc-performance-stats.mjs`
- `npm.cmd run test:app -- scripts/flowdoc-performance-stats.test.mjs src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts scripts/flowdoc-performance-stats.test.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd run perf:baseline`
- Missing fixture check with `BASELINE_OUTPUT_DIR=reports/perf-baseline-error-check`
- Invalid JSON fixture check with `BASELINE_OUTPUT_DIR=reports/perf-baseline-error-check`
- `BASELINE_FLOWDOC_FILE=.\public\mock\flowdoc-stress-mock.flowdoc.json BASELINE_INCLUDE_EXPORT=1 npm.cmd run perf:baseline`

Baseline observed:

- Latest report: `reports/perf-baseline/latest.json`
- Stress document stats: `6062` total nodes, `3443` paragraphs, `12` flow
  tables, `420` Flow Table rows, `2100` Flow Table cells.
- Latest explicit fixture + export run: `editorReadyMs=31597`,
  `fullReadyMs=32075`, `firstClickEditMs=746`, `editSwitchMs=625`,
  `scrollToMiddleMs=1983`, `scrollToEndMs=1173`, `exportPdfMs=132734`,
  `exportDocxMs=97536`, console errors `0`, page errors `0`.

Notes or follow-ups:

- This is measurement only. It does not add layout caches, binding expansion,
  pagination optimization, workflow/history changes, WYSIWYG redesign, table
  behavior changes, or export renderer changes.
- The likely next optimization investigation should start from measured
  initial editor readiness/full pagination and export cost, not from a claimed
  performance improvement in this patch.

### Bump Editor Layout Responsiveness Baseline To 0.6.21

Goal: Accept the Phase 0-3 editor layout responsiveness work as the next
project release-readiness marker before moving to the next performance phase.

Completed:

- Bumped the root project version marker from `0.6.20` to `0.6.21`.
- Updated the root lockfile package metadata to match.
- Updated the project version marker test to assert the accepted `0.6.21`
  baseline.
- Updated versioning docs so the current baseline points at `0.6.21`.
- Kept persisted document/package schema versions unchanged.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification performed:

- `npm.cmd pkg get version`
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`

Notes or follow-ups:

- No git tag was created; project versions remain release-readiness markers.
- This patch does not change `DocumentNode.version`, FlowDoc package version,
  storage package version, pagination semantics, undo/redo, or export behavior.

### Phase 1 Performance Baseline Instrumentation

Goal: Start the large-document performance roadmap with repeatable profiling
signals before adding caches, render-dependency changes, or incremental
pagination.

Completed:

- Added `editor-action-dispatch` perf events at the shared
  `dispatchEditorAction(...)` wrapper, including action type plus
  `uiImpact`, `layoutScope`, `priority`, and whether the action is
  layout-affecting.
- Kept the event opt-in through the existing WYSIWYG perf trace runtime flag.
- Added `scripts/flowdoc-performance-baseline.mjs`, which loads a FlowDoc mock,
  counts cache candidates, captures initial editor readiness perf events,
  clicks two visible paragraphs on a target page, and optionally calls
  `/api/export` for the existing export profile header.
- Added `npm run perf:baseline` and documented the command, environment
  variables, report shape, and current stress-mock baseline.
- Made the baseline script reuse an existing `http://localhost:4000/editor`
  dev server when Next refuses to start a second dev server for the same repo.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/wysiwygPerformance.ts`
- `src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `scripts/flowdoc-performance-baseline.mjs`
- `package.json`
- `docs/PERFORMANCE_BASELINE.md`
- `docs/DOCS_INDEX.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification performed:

- `node --check scripts/flowdoc-performance-baseline.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run perf:baseline`

Baseline observed:

- Reused existing `http://localhost:4000/editor` with bundled Chromium.
- Stress mock loaded to `previewStatus=full` in about `102329ms`.
- Document counters reported `1297` body children, `6062` counted nodes,
  `3443` paragraphs, `550765` text characters, `12` flow tables, and `420`
  flow-table rows.
- Click baseline on page index `14`: `p_00114` first click about `346ms`,
  switch to `li_00116` about `888ms`.
- `editor-action-dispatch` max was about `0.1ms`; canvas React commit max was
  about `117.5ms`; console/page errors were `0`.

Notes or follow-ups:

- Export timing was intentionally skipped in the default baseline run; use
  `BASELINE_INCLUDE_EXPORT=1` when the next export-specific comparison needs
  the `/api/export` profile.
- This patch is instrumentation only. It does not add cache, incremental
  pagination, patch-worker layout, undo/redo changes, or export behavior
  changes.

### Phase 0 Editor Layout Interaction Guard

Goal: Keep normal editor actions from feeling like a full document reload while
the browser/server layout pipelines settle.

Completed:

- Kept browser preview settling non-blocking once a usable canvas layout is
  already visible; the initial placeholder/document-prepare path remains
  blocking.
- Preserved page navigation by falling back to the nearest available page index
  instead of the first page when the current page is temporarily absent after a
  layout update.
- Suppressed the server layout loading overlay for drag/drop reorder, outline
  reorder, table row/column operations, Flow Row column insertion, and Flow Row
  pair resize so the old canvas can remain visible while layout catches up.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/editorPreviewLayoutStatus.ts`
- `src/app/editor/_components/shell/editorCanvasNavigation.ts`
- `src/app/editor/_components/__tests__/editorPreviewLayoutStatus.test.ts`
- `src/app/editor/_components/__tests__/editorCanvasNavigation.test.ts`

Verification performed:

- `npm.cmd test -- src/app/editor/_components/__tests__/editorPreviewLayoutStatus.test.ts src/app/editor/_components/__tests__/editorCanvasNavigation.test.ts`
- `npm.cmd run type-check`
- Headless browser smoke on `http://localhost:4000/editor`: editor shell loaded,
  preview status reached `full`, preview blocking was `false`, initial layout
  loading was gone, and no console/page errors were reported.

Notes or follow-ups:

- This is a Phase 0 guard only. It does not implement action classification,
  measurement cache, incremental pagination, or patch-based worker layout.
- A focused stress-document manual/browser check should still verify page 15/150
  drag, add, and reorder behavior against the user's long mock document.

### Phase 1 WYSIWYG Responsive Finalize

Goal: Make clicking away from or switching a WYSIWYG paragraph respond before
the full preview/layout pipeline settles.

Completed:

- Added a responsive WYSIWYG finalize mode that commits the paragraph/rich-text
  draft to the document model while reusing the current paginated preview for
  the immediate UI response.
- Deferred canvas click inline-edit startup until after the selection paint so
  the active node can update before the edit layer work begins.
- Routed blur, background click, palette drag, canvas drag start, and context
  selection through the responsive finalize path where those actions should not
  block on full pagination.
- Routed WYSIWYG keyboard exit and undo/redo pre-dispatch finalization through
  the same responsive path, and skipped the synchronous full-document
  `inline-edit-exit-pagination` pass while the WYSIWYG text engine is active.
- Added WYSIWYG perf event markers for `inline-edit-start` and
  `inline-edit-finalize` so stress-document click latency can be inspected.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/wysiwygPerformance.ts`
- `scripts/wysiwyg-stress-lifecycle-smoke.mjs`
- `package.json`
- `docs/BROWSER_SMOKE_CHECKLIST.md`

Verification performed:

- `npm.cmd run type-check`
- `npm.cmd test -- src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/editorPreviewLayoutStatus.test.ts`
- Headless Playwright smoke on `http://localhost:4000/editor` with
  `public/mock/flowdoc-stress-mock.flowdoc.json`: loaded 227 pages / 6,644
  fragments, clicked from `p_00114` to `li_00116` on page 15, reached the next
  inline-edit layer in about 632ms, kept `data-preview-layout-blocking=false`,
  showed no initial layout loading overlay, and reported no console/page
  errors. Perf trace recorded `inline-edit-finalize` with
  `source=responsive-preview` at about 36.8ms.
- Follow-up stress smoke for WYSIWYG exit + delete + undo restored `p_00114`
  without initial layout loading or preview blocking. The previous synchronous
  exit pagination event was absent, and `inline-edit-finalize` recorded
  `source=responsive-preview` at about 54.8ms.
- Added `npm run smoke:wysiwyg-stress-lifecycle` as a permanent guard for the
  same stress lifecycle path. Running it against `http://localhost:4000/editor`
  with `flowdoc-stress-mock.flowdoc.json` reported click switch around 323ms,
  WYSIWYG exit around 253ms, responsive finalize around 36.3ms / 34.6ms, no
  preview blocking, no initial layout loading overlay, and undo settling
  without treating the canvas as blocked.

Notes or follow-ups:

- This does not implement incremental pagination, action classification, cache,
  or patch-based worker layout.
- Structural text edits can still need background layout settling; this slice
  only removes the synchronous full-pagination cost from common WYSIWYG exit and
  switch interactions.

### Phase 1b WYSIWYG Stress Typing Guard

Goal: Reduce typing delay inside the stress document without changing document
schema, pagination semantics, undo/redo, or export behavior.

Completed:

- Deferred text-changing WYSIWYG draft sync from the active text layer back to
  the editor shell through a latest-only quiet window, while keeping the local
  active paragraph as the immediate visual truth.
- Kept synchronous flushes for edit completion, blur completion, unmount, rich
  text shortcuts, and rich-text-toolbar focus so commit/style commands do not
  read stale text.
- Wrapped deferred parent/session draft sync in `startTransition` so local input
  can stay responsive while the editor shell catches up.
- Cached the paginated page/fragment summary used by the WYSIWYG perf profiler
  so trace-gated React commit events do not scan the full stress document on
  every commit.
- Extended `scripts/wysiwyg-smoothness-probe.mjs` so it can wait for large
  documents, scroll lazy-rendered pages into view, and target stress-document
  paragraphs directly.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md`

Verification performed:

- `npm.cmd run type-check`
- `npm.cmd test -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- Stress smoothness probe on `http://localhost:4000/editor` with
  `public/mock/flowdoc-stress-mock.flowdoc.json`, `p_00114`, page index `14`,
  burst `80`, interval `0`: before this slice the probe reported roughly
  `paintLatencyMs.p50=49.6`, `p95=135.5`, `p99=158.2`, `max=162.6`, and
  `jankCount=6`; after this slice it reported `p50=24.2`, `p95=54.5`,
  `p99=94.4`, `max=196.3`, and `jankCount=1`.

Notes or follow-ups:

- The active page still commits once per local visual typing update, so this is
  not the final render-architecture fix. A future page/node selector split or
  imperative text-layer lane may be needed to push p95 closer to one frame.
- The next user-reported follow-up is the brief display drift on mouse release.

### Phase 1c WYSIWYG Pointer Release Stability

Goal: Avoid a transient display mismatch when releasing the mouse after a
WYSIWYG range-selection drag.

Completed:

- Kept the local pointer-selection preview visible after pointerup until the
  authoritative editor/session selection catches up, avoiding a one-frame
  fallback to stale selection/caret state.
- Cleared the optimistic local preview automatically once the parent selection
  matches, so the preview remains editor-only and does not become document or
  history state.
- Extended the WYSIWYG smoothness selection probe to sample the first frames
  after mouse release and report `releaseMissingOverlayCount`.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `scripts/wysiwyg-smoothness-probe.mjs`
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md`

Verification performed:

- `npm.cmd run type-check`
- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd test -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- Stress selection probe on `http://localhost:4000/editor` with
  `public/mock/flowdoc-stress-mock.flowdoc.json`, `p_00114`, page index `14`,
  40 pointer moves: `overlayVisibleCount=40`, `releaseMissingOverlayCount=0`,
  and no console/page errors.

Notes or follow-ups:

- This protects the WYSIWYG range-selection release path. Other mouse-release
  paths such as structural drag/drop or resize still rely on their existing
  lifecycle guards and should be checked separately if the user reproduces a
  distinct glitch.
- Undo/redo can still produce several visible-page React commits around
  100-200ms on the 227-page stress mock; the next improvement belongs to
  page/render dependency reduction rather than full-pagination removal.
- User feedback to carry forward: fast typing can still feel slightly delayed,
  and mouse release after drag/selection can briefly show a wrong display state.
  These are tracked as separate typing/render/interaction follow-ups, not part
  of this lifecycle guard slice.

### Phase 2 Action Classification Foundation

Goal: Add the shared action classification layer so editor interactions can
decide layout feedback from action intent instead of scattered manual overlay
guards.

Completed:

- Exported the `EditorAction` union for type-safe classification outside the
  reducer without changing reducer behavior.
- Added `editorActionClassifier` with `uiImpact`, `layoutScope`, and `priority`
  classification for selection, visual-only style edits, metric edits,
  structural body edits, table edits, document layout edits, and document load.
- Added a single `dispatchEditorAction` wrapper in `EditorShell` that suppresses
  the full-canvas server layout loading overlay for visible/background actions
  while leaving `LOAD_DOCUMENT` on the existing blocking prepare path.
- Routed high-impact user actions through the wrapper: undo/redo, paragraph/list
  structural edits, canvas/property table operations, flow-row operations,
  drag/drop commit, resize/margin commits, property/style-panel edits, rich-text
  toolbar style updates, and delete actions.
- Documented the action-classification contract in the editor UX contract.

Files changed:

- `src/app/editor/_components/editorReducer.ts`
- `src/app/editor/_components/editorActionClassifier.ts`
- `src/app/editor/_components/__tests__/editorActionClassifier.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/EDITOR_UX_CONTRACT.md`

Verification performed:

- `npm.cmd run type-check`
- `npm.cmd test -- src/app/editor/_components/__tests__/editorActionClassifier.test.ts src/app/editor/_components/__tests__/editorPreviewLayoutStatus.test.ts`
- Lightweight Playwright check against existing `http://localhost:4000/editor`:
  editor shell/canvas visible, `data-preview-layout-status=full`,
  `data-preview-layout-blocking=false`, no initial/canvas loading overlay, and
  no console/page errors.

Notes or follow-ups:

- This foundation does not skip pagination yet; it only centralizes action
  intent and loading-overlay policy. The next slices can use the same
  classifier to avoid unnecessary pagination for visual-only actions and to feed
  visible-window/incremental layout work.
- Border style/width changes are intentionally treated as layout-affecting.
  Border color-only optimization was not added because current box updates often
  send full border side objects.

### Phase 2 Test Harness Cleanup

Goal: Make the editor smoke harness usable again against the current WYSIWYG
text-engine path before moving to the next performance phase.

Completed:

- Added an inline text-control smoke adapter that can detect either the legacy
  `textarea` editor or the current `data-wysiwyg-text-engine-layer` plus hidden
  input bridge.
- Routed smoke paragraph editing, selection, Thai composition, stack paragraph
  editing, and table-cell Backspace checks through the adapter.
- Kept legacy continuation-fragment textarea checks for the old path, but skip
  them explicitly when the current text-engine path is active.
- Strengthened the fieldRef check so field paragraphs must not enter any inline
  text edit control, not just a textarea.

Files changed:

- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification performed:

- `node --check scripts/editor-smoke.mjs`
- `SMOKE_BASE_URL=http://localhost:4000/editor npm.cmd run smoke:editor`

Notes or follow-ups:

- This is test-harness cleanup only. It does not change editor behavior,
  pagination, undo/redo, export, or the action classifier.
- The skipped continuation checks are legacy-textarea-specific. A future
  text-engine continuation smoke can be added separately if that path needs the
  same multi-fragment coverage.

### Phase 3 Visual-only Browser Preview Fast Lane

Goal: Start using the action-classification foundation to avoid browser full
pagination for safe visual-only actions.

Completed:

- Added a visual-only paginated update helper that reuses existing page/fragment
  geometry and patches paragraph render props for text color, underline,
  strikethrough, paragraph box fill, and visual paragraph style definition
  changes.
- Wired the helper into the browser preview pagination effect so supported
  visual-only actions update `state.paginated` immediately from the existing
  snapshot instead of scheduling browser full pagination.
- Kept server `/api/paginate` reconciliation active in the background so export
  truth and drift/readiness checks still use the current document.
- Extended the editor smoke harness with a paragraph text-color check that
  requires the browser perf trace to record `source=visual-only-fast-lane` and
  asserts the initial layout loading overlay does not appear.
- Left unsupported visual-only cases, such as rich range edits that need new
  line runs, on the normal browser pagination path.
- Documented the conservative fast-lane contract in the editor UX contract.

Files changed:

- `src/app/editor/_components/editorVisualOnlyPagination.ts`
- `src/app/editor/_components/__tests__/editorVisualOnlyPagination.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification performed:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorVisualOnlyPagination.test.ts src/app/editor/_components/__tests__/editorActionClassifier.test.ts`
- `npm.cmd run type-check`
- `node --check scripts/editor-smoke.mjs`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:editor`

Notes or follow-ups:

- `npm.cmd test -- ...` was not a valid focused gate here because the root
  script runs the whole core suite first; two pre-existing PDF golden tests
  timed out before app tests ran.
- Browser smoke now covers the visual-only text color fast lane through the
  Property Panel palette. Rich selected-range color changes still fall back to
  the normal browser pagination path because they need run/line updates.
- This is not incremental pagination. Metric and structural edits still use the
  existing browser/server layout pipeline.

## 2026-05-25

### Add Authored Divider And Page Break Nodes

Goal: Add the first explicit document-level Divider and Page break node support
without treating either feature as editor-only chrome.

Completed:

- Added `divider` and `page-break` authored nodes to schema defaults,
  normalization, document assertions, placement operations, and palette drag
  sources.
- Added divider measurement and atomic pagination with renderer-facing
  `dividerRenderProps`.
- Added authored page-break pagination as a zero-height marker fragment that
  advances following body content to the next page.
- Kept Page break body-flow-only in placement/assert rules; kept Divider out of
  Flow Table cells for this slice.
- Updated PDF rendering to draw Divider fragments and skip Page break marker
  chrome while preserving paginated page count.
- Updated DOCX rendering to serialize Divider as a paragraph border and Page
  break as a hard Word page break.
- Exposed Divider and Page break in the editor palette/canvas/property/outline
  surfaces, with Page break hidden from header/footer palette scope.
- Aligned Divider line color/style/width property controls with the existing
  paragraph/box border control language and replaced raw before/after fields
  with a bounded above/below spacing control.
- Added same-page blocked drop feedback below authored Page break markers so
  dragging content does not imply it can land under the marker on that page.
- Bumped the project version marker from `0.6.15` to `0.6.16` after accepting
  this Divider/Page break baseline.
- Updated layout, cross-page, export, and editor UX contracts for the new
  authored node semantics.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `packages/core/src/schema/block.ts`
- `packages/core/src/document/defaults.ts`
- `packages/core/src/document/assert.ts`
- `packages/core/src/document/normalize.ts`
- `packages/core/src/document/operations.ts`
- `packages/core/src/placement/types.ts`
- `packages/core/src/placement/law.ts`
- `packages/core/src/layout/types.ts`
- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/flow.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/paginator/divider.ts`
- `packages/core/src/pagination/paginator/pageBreak.ts`
- `packages/core/src/pagination/paginator/flowRow.ts`
- `packages/core/src/pagination/paginator/row.ts`
- `packages/core/src/pagination/paginator/zone.ts`
- `packages/core/src/renderer/pdf/index.ts`
- `packages/core/src/renderer/docx/index.ts`
- focused core/app tests under `packages/core/src/**/__tests__` and
  `src/app/editor/_components/__tests__`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorPalette.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/OutlinePanel.tsx`
- `src/app/editor/_components/selectionContext.ts`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd test -w packages/core -- src/pagination/__tests__/paginator.test.ts src/document/defaults.test.ts src/document/assert.test.ts src/document/normalize.test.ts src/document/operations.test.ts src/placement/law.test.ts`
- `npm.cmd test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorPalette.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts src/app/editor/_components/__tests__/OutlinePanel.test.ts`
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts src/app/editor/_components/__tests__/EditorPalette.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts src/app/editor/_components/__tests__/OutlinePanel.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd test -w packages/core -- src/document/assert.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- Project version marker is now `0.6.16`.
- Page break remains unsupported in header/footer, flow-stack, row, and Flow
  Table cell scopes until those semantics are explicitly designed.
- Divider is supported in body/stack/flow-stack/header-footer-safe authoring
  paths, but not Flow Table cells.

---

### Bump Header/Footer Canvas Authoring Baseline To 0.6.15

Goal: Record the accepted selected table actions, clone-drag behavior, and
header/footer canvas authoring chrome as the next patch baseline before
starting the Divider/Page break design work.

Completed:

- Bumped the root project version marker from `0.6.14` to `0.6.15`.
- Aligned the root lockfile and project version marker test with `0.6.15`.
- Updated versioning docs so the current baseline points at `0.6.15`.
- Kept `0.6.14` documented as the selected Flow Table action and clone-drag
  baseline because the root package marker had already moved there.
- Captured the active header/footer authoring polish in the baseline: no colored
  zone fills, selected `HEADER`/`FOOTER` paths, selected delete rail inside the
  active zone, outside-left header/footer action rails, top-left path placement,
  and footer resize hit-area overlap protection.
- Kept persisted document/package schema versions unchanged.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/selectionContext.ts`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `packages/core/src/placement/types.ts`
- `packages/core/src/placement/law.ts`
- `packages/core/src/placement/geometry.ts`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run type-check`
- Browser smoke on `/editor?flowdocTestScenario=header-footer-zones`: active
  header/footer selected path and delete rail render once, old zone fills stay
  absent, header/footer rails avoid content overlap, and header path stays above
  the selected fragment.
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`

Notes:

- This is a patch release marker only; it does not change `DocumentNode.version`,
  FlowDoc package version, storage package version, pagination semantics, or
  export behavior.
- Divider and Page break remain design/implementation follow-ups after this
  version marker.

---

## 2026-05-24

### Bump Page Margin Edit Mode Baseline To 0.6.11

Goal: Record the accepted page margin interaction change as the next patch
baseline before starting header/footer authoring design.

Completed:

- Bumped the root project version marker from `0.6.10` to `0.6.11`.
- Added an editor-only margin edit mode so page margin guides stay passive until
  the user intentionally enters edit mode.
- Switched canvas margin interaction from immediate single-click drag to
  double-click activation on margin bands, with explicit drag handles only while
  editing margins.
- Added light content/outer-zone overlays and click-away/Escape exits for the
  margin edit state.
- Kept the existing authored margin commit path through `UPDATE_MARGIN`.
- Documented page margin editing rules in the editor UX contract.
- Kept persisted document/package schema versions unchanged.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/keyboardShortcuts.test.ts src/app/editor/_components/__tests__/editorCanvasNavigation.test.ts src/app/editor/_components/__tests__/editorPageFollow.test.ts`
- `npm.cmd run type-check`
- Browser check on `/editor?flowdocTestScenario=wysiwyg-stage3-boundary&flowdocWysiwygPerfTrace=1`: double-clicked a page margin band, confirmed margin edit mode showed handles/overlays, then clicked the content overlay to return to passive guides.
- `git diff --check`

Notes:

- This is a patch release marker only; it does not change document schema,
  pagination semantics, undo/redo model, PDF, or DOCX behavior.
- Header/footer authoring remains deferred and should be designed as a separate
  zone mode, not folded into margin edit mode.

---

### Bump Text Baseline And Thai Segment Baseline To 0.6.10

Goal: Record the accepted editor/PDF text baseline convergence and readable
Thai word-segment wrapping work as the next patch baseline.

Completed:

- Bumped the root project version marker from `0.6.9` to `0.6.10`.
- Added a shared paginated-line baseline helper and applied it to editor text
  rendering plus PDF text drawing so Thai table text sits closer between views.
- Added shared Intl word segmentation repair for Thai wrapping, including
  known compound splitting and combining-mark/thanthakhat boundary repair.
- Updated package lock metadata, the project version alignment test, and
  versioning docs.
- Kept persisted document/package schema versions unchanged.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/types.ts`
- `packages/core/src/layout/word-breaker.ts`
- `packages/core/src/layout/word-segments.ts`
- `packages/core/src/layout/__tests__/measure.test.ts`
- `packages/core/src/layout/__tests__/word-segments.test.ts`
- `packages/core/src/pagination/index.ts`
- `packages/core/src/pagination/textBaseline.ts`
- `packages/core/src/pagination/__tests__/textBaseline.test.ts`
- `packages/core/src/renderer/pdf/index.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__/textBaseline.test.ts src/layout/__tests__/word-segments.test.ts src/layout/__tests__/measure.test.ts src/renderer/__tests__/textFlow.test.ts src/pagination/__tests__/drift.test.ts src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:pdf-visual`
- `git diff --check`

Notes:

- This is a patch release marker only; it does not change document schema,
  undo/redo semantics, storage package versions, or DOCX rendering behavior.
- Thai segmentation remains a conservative readability layer, not a full Thai
  dictionary or linguistic tokenizer.

---

### Bump Flow Table And Caret Stability Baseline To 0.6.9

Goal: Record the accepted Flow Table split/export hardening and WYSIWYG
table-cell caret stability work as the next patch baseline.

Completed:

- Bumped the root project version marker from `0.6.8` to `0.6.9`.
- Updated package lock metadata and the project version alignment test.
- Updated versioning docs so the current baseline points at `0.6.9`.
- Kept persisted document/package schema versions unchanged.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/editorPageFollow.test.ts src/app/editor/_components/__tests__/editorCanvasNavigation.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run type-check`

Notes:

- This is a patch release marker only; it does not change document schema,
  pagination semantics, undo/redo, PDF, or DOCX behavior by itself.

---

### Split WYSIWYG Caret Into Idle And Typing Visual Modes

Goal: Make the custom caret blink while idle, but stay steadily visible during
active typing so key-repeat and fast table input do not visually lose the caret.

Completed:

- Added a `WysiwygCaretVisualMode` with `idle` and `typing` states.
- Kept `idle` caret rendering on the existing SVG opacity animation.
- Suppressed the blink animation in `typing` mode for both mapped collapsed
  carets and live-echo carets.
- Marked the caret as `typing` whenever a WYSIWYG draft text change is applied,
  then returned it to `idle` after a short quiet window.
- Exposed `data-wysiwyg-caret-mode` on the text layer and caret line for browser
  verification.
- Documented the mode split in the editor UX and WYSIWYG text-engine docs.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- Browser probe on
  `/editor?flowdocTestScenario=wysiwyg-stage3-boundary&flowdocWysiwygPerfTrace=1`:
  edited `stage3-flow-table-colspan-target`, typed one Thai character, and
  confirmed `data-wysiwyg-caret-mode="typing"` with zero blink animations; after
  the quiet window it returned to `idle` with one blink animation.

Notes:

- This intentionally does not change pagination, document state, undo/redo,
  PDF, DOCX, or selection semantics.
- The typing hold window starts at `650ms` and can be tuned if real typing feels
  too sticky or too eager to blink.

---

### Keep WYSIWYG Table Cell Caret Visible During Reflow

Goal: Prevent the custom text caret from appearing to disappear while typing in
table cells when wrapping or responsive draft pagination moves the active
fragment within the editor canvas.

Completed:

- Added a small, testable caret-follow scroll delta helper for the editor
  canvas viewport.
- Wired the WYSIWYG text layer to scroll the canvas after caret/visual changes,
  but only when the active paragraph is inside a table cell.
- Suppressed the unwrapped live-echo visual for table-cell WYSIWYG layers so
  wrapping/continuation caret placement comes from mapped paginated line
  geometry instead of a horizontally overflowing live caret.
- Kept the behavior viewport-only; it does not change pagination, document
  state, undo/redo, PDF, or DOCX export.
- Documented the table-cell caret-follow constraint in the editor UX and
  WYSIWYG text-engine docs.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- Browser probe on
  `/editor?flowdocTestScenario=wysiwyg-stage3-boundary&flowdocWysiwygPerfTrace=1`:
  edited `stage3-flow-table-colspan-target`, typed enough Thai repeat text to
  trigger a two-fragment table-cell edit, and confirmed the active caret stayed
  inside the editor canvas viewport with `pointerFragments=2`.
- Reproduced the follow-up case where the live-echo caret moved horizontally
  outside the canvas after additional wrapped table-cell input, then verified
  the same scenario now reports `caretKind="caret"`,
  `data-wysiwyg-live-echo-suppressed="true"`, and `visible=true` at a 1280x720
  viewport.

Notes:

- This intentionally does not add a new pagination rule, table preview path, or
  export renderer behavior.

---

### Add Flow Table Visual Slice Bottom Border Caps

Goal: Make Flow Table cells that continue across a page boundary visibly close
their current page slice without changing pagination, row height accounting, or
paragraph/flow-stack split-box semantics.

Completed:

- Updated shared fragment box primitives so `flow-table-cell` fragments with
  `isContinued=true` draw their authored bottom border at the visual slice
  boundary.
- Kept the exception table-specific; split paragraphs and flow-stack boxes keep
  logical top/bottom border behavior.
- Updated DOCX Flow Table cell border projection to emit the same page-slice
  bottom cap on continued cell fragments.
- Adjusted renderer and editor primitive tests to expect bottom borders on
  non-final Flow Table cell slices.
- Updated Flow Table, cross-page, and paragraph-box contracts to document the
  table-specific page-slice cap.

Files changed:

- `packages/core/src/pagination/paragraphBoxPrimitives.ts`
- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/PARAGRAPH_BOX_STYLE_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This intentionally does not change split row/cell heights, child fragment
  placement, undo/redo state, schema, or editor selection-chrome stitching.
- DOCX remains best-effort; the page-slice cap is serialized from FlowDoc's
  paginated slices, while Word/LibreOffice still own final reflow.

---

### Keep Flow Table Split Slice Geometry Around Content

Goal: Fix Flow Table continuation slices whose row/cell fragment height could
be shorter than the paragraph fragment placed inside the slice, causing table
border geometry to lag or appear unclosed near page boundaries.

Completed:

- Updated `paginateFlowTableRowSplit` to collect table-cell content fragments
  before emitting the row/cell fragments for a split slice.
- Derived the emitted split row/cell height from the actual placed
  child-fragment bottom when content exists, falling back to the planned row
  slice height only for empty slices.
- Preserved the existing row split accounting by continuing to advance
  `heightPlaced` with the planned slice height.
- Added a focused regression test for a low-on-page Flow Table row whose final
  continuation paragraph includes an end inset.
- Added editor-side diagnostic coverage proving authored split Flow Table cell
  border primitives omit the source-page bottom border and keep the bottom
  border on the final continuation fragment.
- Updated the cross-page behavior contract to state that emitted split row/cell
  geometry must contain the child fragments placed in that slice.

Files changed:

- `packages/core/src/pagination/paginator/flowTableRow.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- Rechecked `C:/Users/nekot/Downloads/Untitled.flowdoc (3).json` through
  `/api/paginate`: the final Flow Table continuation row now reports height
  `20pt`, matching the paragraph bottom, and no split cell content overflow was
  reported.

Notes:

- This intentionally does not change DOCX-specific row-height relaxation,
  split-border policy, document schema, or undo/redo state.
- Split slice accounting still uses the planned slice height for progress, but
  emitted row/cell geometry follows the placed content height so visual borders
  do not extend past the content slice.

---

### Relax DOCX Split Flow Table Row Heights

Goal: Prevent Word from moving an oversized Flow Table split slice to the next
page and leaving a large blank area when the serialized minimum row height
exactly consumes the remaining page space.

Completed:

- Stopped emitting DOCX `trHeight` for split Flow Table row fragments
  (`continuesFrom` or `isContinued`), letting Word compute their row height from
  cell content.
- Kept minimum `atLeast` row heights for unsplit/full Flow Table rows, including
  normal header/body rows.
- Updated DOCX renderer expectations so split table slices no longer count as
  rows that must carry `w:hRule="atLeast"`.

Files changed:

- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run type-check`
- Exported `C:/Users/nekot/Downloads/Untitled.flowdoc (3).json` through
  `/api/export` as DOCX and inspected `word/document.xml`: the table header and
  unsplit row keep `atLeast` heights, while both split row slices have no
  `trHeight`; the final continuation row still carries a `single` bottom
  border.

Notes:

- This is DOCX-only and intentionally does not change pagination, editor
  preview, PDF export, or split-border policy.
- Word may now use its own intrinsic row heights for split Flow Table slices,
  which is consistent with DOCX being an exchange format rather than the
  pixel-perfect target.

---

### Preserve DOCX Flow Table Row Order Across Pages

Goal: Keep split Flow Table rows in their logical page order when serialized to
DOCX, so continuation slices do not move before source-page slices when their
page-local `y` position is smaller.

Completed:

- Updated DOCX Flow Table row sorting to compare `pageIndex` before page-local
  `y/x` coordinates.
- Added a regression test with a table pushed low on page 1 so its
  continuation row starts near the top of page 2.
- Rechecked the user-provided FlowDoc export and confirmed the DOCX row order
  is now header, normal row, first split slice, then continuation slice.

Files changed:

- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- Exported `C:/Users/nekot/Downloads/Untitled.flowdoc (3).json` through
  `/api/export` as DOCX and inspected `word/document.xml`: the final
  continuation row now appears after the first split slice and carries a
  `single` bottom border in the XML.

Notes:

- This intentionally does not change Flow Table pagination slice heights,
  editor preview behavior, PDF export, or split-border policy.
- A remaining pagination invariant risk is that the observed continuation
  row/cell height can be smaller than its paragraph fragment height.

---

### Fix DOCX Split Flow Table Source Text Duplication

Goal: Stop DOCX export from duplicating full source paragraph text when a Flow
Table cell paragraph is split across page/table slices.

Completed:

- Guarded DOCX source paragraph run reuse so it applies only when the rendered
  fragment group covers the full logical paragraph.
- Let partial continuation fragment groups fall back to paginated line/run
  slices, preserving each table-cell slice without serializing the full source
  text into every continuation cell.
- Added a focused regression test for `sourceDocument` DOCX export of a split
  Flow Table cell paragraph.

Files changed:

- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- Exported `C:/Users/nekot/Downloads/Untitled.flowdoc (3).json` through
  `/api/export` as DOCX and inspected `word/document.xml`: the long Thai table
  paragraph now serializes as partial text nodes totaling the source length
  instead of duplicating the full 204-character source paragraph.

Notes:

- This intentionally does not change Flow Table pagination, editor preview,
  page-boundary border policy, PDF export, or DOCX table geometry.
- The earlier root `npm.cmd test -- packages/core/src/renderer/__tests__/renderer.test.ts`
  invocation ran the full core suite successfully, then failed only because the
  root app test runner looked for that core path under `src/**`.

---

### Refine Bottom Page Navigation Thumbnails

Goal: Make bottom page navigation jump to the top of the selected page and
replace placeholder thumbnails with a lightweight page-layout silhouette.

Completed:

- Added explicit start-aligned page scrolling for bottom thumbnail, previous,
  and next page navigation.
- Kept inline-edit page-follow scrolling on nearest alignment so active typing
  does not jump more than needed.
- Extended page navigation items with copied page content boxes and bounded
  thumbnail fragment shapes from header, body, and footer layout fragments.
- Replaced the placeholder thumbnail glyph with a mini SVG silhouette showing
  margins, text-like line hints, and broad block/table/row/stack areas.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/editorPageFollow.ts`
- `src/app/editor/_components/__tests__/editorPageFollow.test.ts`
- `src/app/editor/_components/__tests__/editorCanvasNavigation.test.ts`
- `src/app/editor/_components/shell/EditorCanvasBottomBar.tsx`
- `src/app/editor/_components/shell/editorCanvasNavigation.ts`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorPageFollow.test.ts src/app/editor/_components/__tests__/editorCanvasNavigation.test.ts`
- `npm.cmd run type-check`
- Playwright browser check against `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary&flowdocWysiwygPerfTrace=1`: verified 3 page thumbnails render as SVG silhouettes, clicking page 2 updates the page status to `2 / 3`, scrolls the target page top to the canvas viewport top, and reports no console/page errors.

Notes:

- This intentionally does not reuse the full editor canvas renderer inside the
  thumbnail strip, so selection chrome, drag handles, inline editors, and export
  rendering stay out of the bottom navigation preview.
- This patch does not change document schema, pagination, undo/redo, export, or
  inline-edit commit behavior.

---

### Bump Canvas View/PDF Thai Baseline To 0.6.8

Goal: Record the accepted PDF Thai combining-mark parity, canvas-scoped bottom
view bar, and conservative EditorShell extraction work as the next patch
baseline.

Completed:

- Bumped the root project version marker from `0.6.7` to `0.6.8`.
- Updated the lockfile root package version to match.
- Updated the project version marker test to assert the accepted `0.6.8`
  baseline.
- Updated versioning docs so the current baseline points at `0.6.8`.
- Kept persisted document/package schema versions unchanged.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd pkg get version`
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- No git tag was created; project versions remain release-readiness markers.
- This patch does not change `DocumentNode.version`, FlowDoc package version,
  storage package version, pagination semantics, undo/redo, or export behavior.

---

### Add Canvas-Scoped Bottom View Bar

Goal: Move document view controls into a bottom bar that belongs only to the
center canvas, leaving the left and right rails independent.

Completed:

- Added a canvas-column wrapper so the bottom bar is scoped to the editor
  viewport and does not span under the side rails.
- Moved zoom view controls out of the top command bar into the bottom bar,
  with a range slider, percent reset, and Fit command.
- Added a page thumbnail filmstrip toggle from the bottom of the canvas, with
  clickable miniature page entries.
- Added bottom-left document status chips for local save state, active section,
  and selected context.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/shell/EditorCanvasColumn.tsx`
- `src/app/editor/_components/shell/EditorCanvasBottomBar.tsx`
- `src/app/editor/_components/shell/editorCanvasNavigation.ts`
- `src/app/editor/_components/shell/EditorToolbar.tsx`
- `src/app/editor/_components/shell/EditorLeftRail.tsx`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run type-check`
- Playwright browser check against `http://localhost:4000/editor`: verified the
  bottom bar bounds match the canvas column, do not overlap the side rails,
  thumbnail filmstrip opens with page entries, zoom slider updates the percent
  control, and no layout error badge or browser errors appeared.

Notes:

- This patch intentionally does not change document schema, pagination,
  undo/redo, export, inline editing, or sidebar behavior.
- Page activity is based on the selected/edited/jumped page, not full
  scroll-position tracking; scroll-derived active page highlighting remains a
  possible later slice.
- The first refactor slice extracts the canvas bottom bar and page-navigation
  helpers out of `EditorShell` while preserving the same props and behavior.
- The second refactor slice extracts the workflow/status/export/command toolbar
  into `EditorToolbar`; `RichTextToolbar` remains in `EditorShell` ownership
  because its callbacks are tied to rich draft and inline-edit lifecycle.
- The third refactor slice extracts the left rail shell into `EditorLeftRail`,
  preserving the previous fill-mode no-op selection behavior.

---

## 2026-05-23

### Coalesce WYSIWYG Draft Sync For Smooth Typing

Goal: Make continuous typing, Space repeat, Backspace repeat, Enter/newline
growth, and wrap typing feel smoother without changing document schema,
pagination semantics, undo/redo, or export behavior.

Completed:

- Added latest-only WYSIWYG draft sync inside `WysiwygTextLayer` so text
  changes keep the immediate SVG visual local and send the parent/session only
  the latest pending draft per animation frame.
- Kept caret-only and selection-only updates immediate, and kept pending text
  sync flushed before Escape commit, blur commit, rich text shortcut handling,
  and unmount cleanup.
- Guarded prop-to-local draft synchronization so stale parent props do not
  overwrite a newer local draft while the immediate visual state is active.
- Extended the smoothness probe with `space-repeat`, `delete`, `enter`, and
  `wrap-typing` modes in addition to the existing typing/selection coverage.
- Updated the editor UX contract and probe docs for the coalesced draft-sync
  lifecycle.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-rich-draft`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-smoothness`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:PROBE_MODE='space-repeat'; $env:PROBE_BURST_LENGTH='120'; $env:PROBE_INTERVAL_MS='0'; npm.cmd run smoke:wysiwyg-smoothness`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:PROBE_MODE='delete'; $env:PROBE_BURST_LENGTH='120'; $env:PROBE_INTERVAL_MS='0'; npm.cmd run smoke:wysiwyg-smoothness`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:PROBE_MODE='enter'; $env:PROBE_BURST_LENGTH='30'; $env:PROBE_INTERVAL_MS='0'; npm.cmd run smoke:wysiwyg-smoothness`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:PROBE_MODE='wrap-typing'; $env:PROBE_BURST_LENGTH='160'; $env:PROBE_INTERVAL_MS='0'; npm.cmd run smoke:wysiwyg-smoothness`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:PROBE_MODE='selection'; $env:PROBE_SELECTION_MOVE_COUNT='70'; npm.cmd run smoke:wysiwyg-smoothness`

Notes:

- The probes now pass with zero console/page errors and zero >100ms jank
  events, but typing/wrap p95 latency still shows remaining canvas commit cost.
- This patch intentionally does not change paragraph model, pagination output,
  DOCX/PDF export, or document history semantics.

---

## 2026-05-23

### Bump WYSIWYG Space Hardening Baseline To 0.6.7

Goal: Record the accepted WYSIWYG rich draft and Space/key-repeat hardening
work as the next conservative patch baseline before starting larger typing
smoothness design work.

Completed:

- Bumped the root project version marker from `0.6.6` to `0.6.7`.
- Updated the lockfile root package version to match.
- Updated the project version marker test to assert the accepted `0.6.7`
  baseline.
- Updated versioning docs so the current baseline points at `0.6.7`.
- Kept persisted document/package schema versions unchanged.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd pkg get version`
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`
- `git diff --check`

Notes:

- No git tag was created; project versions remain release-readiness markers.
- This patch does not change `DocumentNode.version`, FlowDoc package version,
  storage package version, pagination semantics, or export behavior.

---

## 2026-05-23

### Harden WYSIWYG Space Key Repeat Hot Path

Goal: Reduce risk of nested update loops and visible stutter when users hold
Space in the FlowDoc-owned WYSIWYG text engine.

Completed:

- Added equality helpers for immediate text echo and immediate draft layout
  state.
- Added a no-op guard in `applyDraftChange` so identical text/caret/selection
  changes do not call editor state again.
- Tracked immediate draft layout in a ref and deduped immediate visual state
  updates before calling React state setters.
- Limited synchronous `flushSync` use to the moment the editor enters the
  immediate visual lane instead of every repeated key event.
- Expanded the rich draft browser smoke so the Space key path presses Space 48
  times before committing.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-rich-draft-smoke.mjs`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/whitespaceParity.test.ts`
- `node --check scripts/wysiwyg-rich-draft-smoke.mjs`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-rich-draft`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:PROBE_TYPE_TEXT='          '; $env:PROBE_BURST_LENGTH='400'; npm.cmd run smoke:wysiwyg-smoothness`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-smoothness`
- `git diff --check`

Notes:

- Space-heavy probe stayed error-free with no page errors. The longest event in
  that run was an `editor-canvas-react-commit` around `34ms`; the remaining
  feel issue is still canvas commit cost, not a document/pagination semantic
  change.
- Default typing probe also stayed error-free. It still reports an
  `editor-canvas-react-commit` spike around `56ms` when crossing a page
  boundary, so broader commit-scope optimization remains separate follow-up
  work.

---

## 2026-05-23

### Restore WYSIWYG Space Key Feedback

Goal: Make Space work predictably in the FlowDoc-owned WYSIWYG text engine,
including the visual feedback for repeated and trailing spaces.

Completed:

- Normalized legacy browser space key names (`Space` and `Spacebar`) to a
  literal U+0020 before text-engine key handling.
- Preserved whitespace in editor SVG text output so repeated interior spaces do
  not collapse visually.
- Added an editor-only trailing-whitespace caret overlay so pressing Space at
  the end of a rendered line visibly advances the caret even though core layout
  still trims line-edge spaces from measured line text.
- Added browser smoke coverage that presses `Space` directly and confirms the
  committed paragraph contains the expected spaces.

Files changed:

- `src/app/editor/_components/useWysiwygTextSession.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-rich-draft-smoke.mjs`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/whitespaceParity.test.ts`
- `node --check scripts/wysiwyg-rich-draft-smoke.mjs`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-rich-draft`

Notes:

- This patch intentionally does not change core whitespace measurement,
  pagination, DOCX/PDF export, or stored document schema. It only restores input
  handling and active-editor visual feedback.

---

## 2026-05-23

### Forward WYSIWYG Pointer Selection Wheel To Canvas

Goal: Let users keep scrolling the editor canvas with the mouse wheel while a
WYSIWYG pointer-selection overlay is active.

Completed:

- Added a small wheel-delta normalizer for pixel, line, and page wheel modes.
- Forwarded wheel events from the fixed pointer-selection overlay to the
  `editor-canvas` scroll container.
- Kept the change editor-only; wheel forwarding does not touch document state,
  pagination, export, or history.
- Added focused unit coverage for wheel delta normalization.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:PROBE_MODE='selection'; $env:PROBE_SELECTION_MOVE_COUNT='50'; npm.cmd run smoke:wysiwyg-smoothness`

Notes:

- Selection probe remained healthy after the wheel-forwarding change: overlay
  visible on 50/50 moves, paint p95 about `28.5ms`, 1 final
  `inline-edit-selection-update`, and no console/page errors.
- Edge auto-scroll while dragging near the viewport boundary remains deferred.

---

## 2026-05-23

### Add Local WYSIWYG Pointer Selection Preview

Goal: Reduce range-selection drag lag by keeping pointer-move selection
preview local to the active WYSIWYG text layer and syncing the authoritative
editor session only at the end of the drag.

Completed:

- Added a tested pointer-selection resolver that clamps offsets and detects
  duplicate selection/caret state.
- Changed pointer-drag moves in `WysiwygTextLayer` to update a local selection
  preview instead of calling `onDraftChange` on every move.
- Kept click, double-click word selection, keyboard selection, text input, and
  final pointerup sync on the existing editor-session path.
- Rendered local preview rectangles from the same FlowDoc line geometry and
  kept the preview editor-only.
- Updated the WYSIWYG smoothness baseline and UX contract with the new local
  preview rule.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:PROBE_MODE='selection'; $env:PROBE_SELECTION_MOVE_COUNT='50'; npm.cmd run smoke:wysiwyg-smoothness`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-rich-draft`

Notes:

- Selection probe after local preview: overlay visible on 50/50 sampled moves,
  paint p95 about `28.8ms`, `inline-edit-selection-update` reduced to 1 final
  sync event, over-frame-budget events reduced to 2, and no console/page
  errors.
- `editor-canvas-react-commit` remains the longest event at about `42.6ms`, so
  the remaining work is now active text-layer commit cost rather than session
  state spam through `EditorShell`.
- Deferred follow-up: do not continue optimizing this path immediately while
  manual UX feels smooth. Reopen if selection drag regresses or the probe shows
  repeated over-frame-budget canvas commits again.

---

## 2026-05-23

### Add Editor Canvas React Commit Probe

Goal: Measure whether the remaining range-selection micro-lag comes from the
editor canvas React commit path before designing another optimization patch.

Completed:

- Wrapped the editor canvas subtree in a trace-gated React Profiler only when
  WYSIWYG perf tracing is active.
- Added a scalar `editor-canvas-react-commit` perf event with commit duration,
  base duration, commit time, selection length, draft metadata, and paginated
  summary counts.
- Kept normal editor runtime inert when perf tracing is disabled; the Profiler
  wrapper renders children directly outside trace mode.
- Extended perf-event unit coverage for explicit canvas commit events.
- Updated the smoothness probe baseline and UX contract to document the new
  evidence.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/wysiwygPerformance.ts`
- `src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:PROBE_MODE='selection'; $env:PROBE_SELECTION_MOVE_COUNT='50'; npm.cmd run smoke:wysiwyg-smoothness`
- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-rich-draft`

Notes:

- Selection probe baseline after the Profiler hook: overlay visible on 50/50
  sampled moves, paint p95 about `31.5ms`, and no console/page errors.
- The longest measured FlowDoc-side event is now
  `editor-canvas-react-commit` at about `59.8ms`, with 10 events over one
  frame in the standard fixture.
- Next optimization should be designed around active-page canvas commit scope
  or a more local selection overlay layer. Pointer hit-test and overlay
  rectangle math are not the current hot path in this fixture.

---

## 2026-05-23

### Add WYSIWYG Selection Drag Perf Probe

Goal: Identify the remaining subtle range-selection lag without changing
document state, pagination, undo/redo, or rich text command semantics.

Completed:

- Added trace-gated perf event kinds for WYSIWYG pointer frame coalescing,
  pointer hit-testing, pointer selection apply, and selection overlay geometry.
- Kept the new hot-path instrumentation inert when WYSIWYG perf tracing is not
  enabled; normal pointer moves do not append perf events.
- Added a `PROBE_MODE=selection` path to `scripts/wysiwyg-smoothness-probe.mjs`
  so selection drag can be measured with the same paint-latency report shape as
  typing and resize probes.
- Added focused tests that verify selection overlay perf metadata is scalar and
  does not store paragraph text.
- Documented the selection probe mode, current baseline, and interpretation.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/wysiwygPerformance.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:PROBE_MODE='selection'; $env:PROBE_SELECTION_MOVE_COUNT='50'; npm.cmd run smoke:wysiwyg-smoothness`

Notes:

- Selection probe baseline: overlay visible on 50/50 sampled moves, no measured
  FlowDoc hot-path event exceeded a frame budget, and the longest measured
  FlowDoc event was `text-engine-pointer-frame` at about `1.1ms`.
- This suggests the remaining subtle perceived lag is not currently explained
  by hit-test or overlay geometry cost in the standard fixture. React/browser
  scheduling, total page paint, or automation dispatch overhead remain the next
  likely investigation area.

---

## 2026-05-23

### Debounce Rich Toolbar Range Selection Display

Goal: Reduce rich text range-selection drag lag by keeping toolbar display
updates off every pointer-move frame while preserving accurate command targets.

Completed:

- Added a dedicated rich toolbar selection snapshot helper with equality and
  debounce decision functions.
- Debounced only non-collapsed rich toolbar display/scope selection state in
  `EditorShell`; collapsed caret/no-selection states still update immediately.
- Kept toolbar commands wired to the latest live text selection via a separate
  `commandTextSelection` path so a click during or after drag does not apply to
  a stale debounced display range.
- Added focused unit coverage for toolbar snapshot helpers and command-range
  precedence.
- Documented that debounced toolbar display state must not weaken live command
  selection accuracy.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/RichTextToolbar.tsx`
- `src/app/editor/_components/richTextToolbarSelection.ts`
- `src/app/editor/_components/__tests__/RichTextToolbar.test.ts`
- `src/app/editor/_components/__tests__/richTextToolbarSelection.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/RichTextToolbar.test.ts src/app/editor/_components/__tests__/richTextToolbarSelection.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/richTextDraftSession.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-rich-draft`
- In-app browser reload of `http://localhost:4000/editor` confirmed
  `editor-canvas`, one `editor-page`, and no visible layout/error badges.

Notes:

- This does not change document schema, undo/redo, pagination, export, or rich
  draft commit semantics.
- This is the first toolbar-local performance patch. A deeper local-selection
  architecture remains a separate decision if drag selection still feels heavy.

---

## 2026-05-22

### Coalesce WYSIWYG Range Selection Updates

Goal: Reduce lag while dragging or extending a WYSIWYG text selection.

Completed:

- Added nullable selection equality helpers and made plain/rich WYSIWYG session
  selection moves return the same state object when caret and selection offsets
  are unchanged.
- Added an early duplicate-selection guard in `EditorShell` before refreshing
  draft snapshots or emitting selection perf events.
- Coalesced text-engine pointer selection move events to the latest client
  position per animation frame, while keeping pointer down/up selection
  immediate.
- Kept selection-only changes as editor/session state. No document model,
  undo/redo, export, or pagination semantics were changed.
- Documented the selection coalescing contract.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/useWysiwygTextSession.ts`
- `src/app/editor/_components/richTextDraftSession.ts`
- `src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `src/app/editor/_components/__tests__/richTextDraftSession.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/richTextDraftSession.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-rich-draft`
- In-app browser reload of `http://localhost:4000/editor` confirmed the editor
  canvas and page rendered.

Notes:

- This is still a local interaction patch, not the deeper local-selection
  architecture. Toolbar recomputation and active page rerender still happen
  when the selected offsets actually change.

---

## 2026-05-22

### Add Rich Draft Style Preview Perf Guard

Goal: Reduce rich range-style lag without weakening document layout
correctness.

Completed:

- Added a rich draft style-patch classifier so the editor can distinguish
  layout-affecting run styles from color/underline/strikethrough changes.
- Reused the active paragraph visual-preview path for dirty rich draft
  paragraphs whose text is unchanged, allowing non-layout style edits on normal
  body paragraphs to appear without immediate full document draft pagination.
- Kept Flow Stack, row-stack, and Flow Table paragraphs on the full draft
  pagination path because their layout/container behavior needs stronger
  reconciliation.
- Added perf trace events for rich draft style commands and selection-only
  caret/range updates. Draft pagination perf events now mark whether the source
  was rich draft.
- Moved the row-stack paragraph eligibility helper into the WYSIWYG eligibility
  module so EditorCanvas and EditorShell share the same guard.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/richTextDraftCommands.ts`
- `src/app/editor/_components/wysiwygPerformance.ts`
- `src/app/editor/_components/wysiwygTextEligibility.ts`
- `src/app/editor/_components/__tests__/richTextDraftCommands.test.ts`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/RichTextToolbar.test.ts src/app/editor/_components/__tests__/richTextDraftSession.test.ts src/app/editor/_components/__tests__/richTextDraftCommands.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-rich-draft`

Notes:

- The standalone rich draft smoke startup was blocked by an already-running
  Next dev server on port `4000`, so the smoke was rerun successfully against
  that existing flagged editor.
- This does not solve all range-selection latency. The selection state still
  flows through EditorShell; deeper local-selection architecture remains a
  separate decision.

---

## 2026-05-22

### Enable Rich Draft In WYSIWYG Dev Script

Goal: Make the local `dev:wysiwyg` command start the same rich draft lane used
by the rich text range-selection smoke.

Completed:

- Added `NEXT_PUBLIC_FLOWDOC_WYSIWYG_RICH_TEXT_DRAFT=1` to
  `scripts/dev-wysiwyg.mjs`.
- Updated the dev script console output so the enabled rich draft flag is
  visible when the server starts.
- Documented that `npm.cmd run dev:wysiwyg` now enables text engine, inline
  edit, and rich draft together for local testing.

Files changed:

- `scripts/dev-wysiwyg.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `node --check scripts/dev-wysiwyg.mjs`

Notes:

- This changes only the local dev convenience command. Default app behavior and
  production flags remain unchanged.

---

## 2026-05-22

### Add Rich Toolbar Scope Affordance

Goal: Make the rich text toolbar communicate whether style commands target the
paragraph, the next typed text, or the selected range.

Completed:

- Added a compact rich toolbar scope chip with `Paragraph`, `Next text`, and
  `Selected text` states.
- Kept the scope chip editor-only; it does not write document data or create
  history entries.
- Marked collapsed active rich draft carets as `Next text` so the toolbar does
  not imply a paragraph-level edit while pending style commands are staged for
  future typing.
- Extended toolbar unit coverage and the rich draft smoke assertions for the
  new scope affordance.
- Updated the editor UX contract and browser smoke checklist.

Files changed:

- `src/app/editor/_components/RichTextToolbar.tsx`
- `src/app/editor/_components/__tests__/RichTextToolbar.test.ts`
- `scripts/wysiwyg-rich-draft-smoke.mjs`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/RichTextToolbar.test.ts`
- `node --check scripts/wysiwyg-rich-draft-smoke.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/RichTextToolbar.test.ts src/app/editor/_components/__tests__/richTextDraftCommands.test.ts src/app/editor/_components/__tests__/richTextDraftSession.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run smoke:wysiwyg-rich-draft`

Notes:

- This change does not alter document schema, rich draft command semantics,
  pagination, undo/redo, or export behavior.
- The first smoke run exposed a React style warning from mixing border
  shorthand with `borderColor`; the scope chip now uses explicit border fields.
- Further range-selection visual polish and cross-fragment rich selection are
  still separate follow-up work.

---

## 2026-05-22

### Guard Rich Draft Range Selection UX

Goal: Lock the first browser-level rich draft range-selection UX path before
adding more range editing polish.

Completed:

- Extended the rich draft browser smoke fixture with a dedicated range-selection
  paragraph.
- Added a browser smoke step that selects the `target` run with
  `Shift+ArrowLeft`, verifies SVG selection overlay visibility, verifies the
  rich text toolbar enters range mode, applies Bold from the toolbar, and
  commits only the selected range as a bold text run.
- Updated the browser smoke checklist so future editor reviews know the rich
  draft smoke now covers selected-range toolbar styling.

Files changed:

- `scripts/wysiwyg-rich-draft-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `node --check scripts/wysiwyg-rich-draft-smoke.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/RichTextToolbar.test.ts src/app/editor/_components/__tests__/richTextDraftCommands.test.ts src/app/editor/_components/__tests__/richTextDraftSession.test.ts`
- `npm.cmd run smoke:wysiwyg-rich-draft`

Notes:

- This change does not alter document schema, command semantics, pagination, or
  export behavior. It locks the current browser UX path before visual polishing.
- Cross-fragment rich range selection, rich paste, fieldRef/pageNumber direct
  semantics, and broader toolbar affordance polish remain follow-up work.

---

## 2026-05-22

### Bump Rich Draft Semantics Baseline To 0.6.6

Goal: Mark the collapsed-caret rich toolbar state hardening and richer
DOCX/export semantic coverage as the next self-use patch baseline.

Completed:

- Bumped the root project version marker from `0.6.5` to `0.6.6`.
- Updated the lockfile root package version to match.
- Updated the project version marker test to assert the accepted `0.6.6`
  baseline.
- Updated versioning docs so the current baseline points at `0.6.6`.
- Kept persisted document/package schema versions unchanged.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd pkg get version`
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This is a project release-readiness marker only. It does not change
  `DocumentNode.version`, FlowDoc package version, or storage package version.
- FieldRef/pageNumber direct rich semantics, range-selection UX polish, and
  full PDF rich-run export proof remain deferred follow-up work.

---

## 2026-05-22

### Bump Rich Draft Editor Baseline To 0.6.5

Goal: Mark the flag-gated rich draft live editor bridge and basic rich-text
toolbar/keyboard command wiring as the next self-use patch baseline.

Completed:

- Bumped the root project version marker from `0.6.4` to `0.6.5`.
- Updated the lockfile root package version to match.
- Updated the project version marker test to assert the accepted `0.6.5`
  baseline.
- Updated versioning docs so the current baseline points at `0.6.5`.
- Kept persisted document/package schema versions unchanged.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd pkg get version`
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- This is a project release-readiness marker only. It does not change
  `DocumentNode.version`, FlowDoc package version, or storage package version.
- Rich paste, fieldRef/pageNumber direct semantics, IME-specific rich-command
  proof, PDF export, and DOCX export remain deferred follow-up work.

---

## 2026-05-22

### Wire Rich Draft Toolbar And Keyboard Commands

Goal: Let the flag-gated rich draft bridge receive basic toolbar and keyboard
style commands without replacing the existing plain WYSIWYG lane.

Completed:

- Routed toolbar style patches into the active rich draft session when
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_RICH_TEXT_DRAFT` is enabled and the selected
  node is the active rich draft node.
- Routed native WYSIWYG bridge shortcuts for Ctrl/Cmd+B, Ctrl/Cmd+I, and
  Ctrl/Cmd+U through the rich draft command adapter.
- Kept the existing document-operation toolbar path for inactive rich sessions
  and for the default plain WYSIWYG lane.
- Let the toolbar render from the active rich draft paragraph and collapsed
  pending style so it does not read stale document state during an active rich
  edit.
- Added toolbar focus targeting so clicking toolbar controls does not close the
  active WYSIWYG session before the command can apply.
- Adapted provable plain bridge insertions through rich draft selection
  replacement so pending style applies to newly typed text.
- Let draft pagination build from the active rich draft paragraph for style-only
  rich draft changes.
- Extended the rich draft browser smoke to prove keyboard-created bold runs and
  toolbar-created underline runs.

Files changed:

- `docs/RICH_TEXT_DRAFT_DECISION.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `scripts/wysiwyg-rich-draft-smoke.mjs`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/RichTextToolbar.tsx`
- `src/app/editor/_components/richTextDraftCommands.ts`
- `src/app/editor/_components/richTextDraftSession.ts`
- `src/app/editor/_components/wysiwygDraftPreview.ts`
- focused app tests

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/richTextDraftCommands.test.ts src/app/editor/_components/__tests__/richTextDraftSession.test.ts src/app/editor/_components/__tests__/RichTextToolbar.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run smoke:wysiwyg-rich-draft`

Notes:

- This remains flag-gated and does not change default WYSIWYG behavior.
- Rich paste, fieldRef/pageNumber direct semantics, IME-specific rich-command
  proof, PDF export, and DOCX export remain deferred.

---

## 2026-05-22

### Add Rich Draft Browser Smoke Gate

Goal: Add browser evidence for the flag-gated rich draft live bridge before
toolbar or keyboard rich-text wiring.

Completed:

- Added `smoke:wysiwyg-rich-draft`, a Playwright smoke that starts the editor
  with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1` and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_RICH_TEXT_DRAFT=1`.
- Seeded a rich paragraph and a `flow-table` paragraph with existing styled
  runs.
- Verified the rich draft bridge mounts without the legacy textarea path.
- Verified commit, undo, and redo preserve the existing bold run in the top
  level paragraph.
- Verified commit preserves the existing italic run inside the `flow-table`
  paragraph.
- Exposed the active rich draft flag on the editor shell for smoke assertions.

Files changed:

- `docs/DOCS_INDEX.md`
- `docs/RICH_TEXT_DRAFT_DECISION.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `package.json`
- `scripts/wysiwyg-rich-draft-smoke.mjs`
- `src/app/editor/_components/EditorShell.tsx`

Verification:

- `npm.cmd run smoke:wysiwyg-rich-draft`

Notes:

- The smoke required stopping an existing local Next dev server that was
  running without the rich draft flag.
- This does not wire toolbar buttons, keyboard shortcuts, pending-style typing,
  rich paste, IME-specific browser proof, PDF, or DOCX export behavior.

---

## 2026-05-22

### Wire Flag-Gated Rich Draft Live Bridge

Goal: Start the live editor bridge for rich draft state without changing the
default WYSIWYG behavior.

Completed:

- Added `NEXT_PUBLIC_FLOWDOC_WYSIWYG_RICH_TEXT_DRAFT` as a separate opt-in flag
  that only works when the base WYSIWYG text engine is enabled.
- Added a rich draft session hook that can start from the current paragraph,
  apply plain text bridge changes, move selection, project back to the legacy
  text-session shape, and end cleanly.
- Wired `EditorShell` so the rich draft session is used only when the new flag
  is enabled; otherwise the existing plain `draftText` lane remains the active
  path.
- Kept canvas draft text, caret, selection, accessibility, and draft
  pagination on the projected `WysiwygTextSessionState` shape.
- Routed rich-session autosave snapshots through the rich paragraph replacement
  path.
- Routed rich-session finalize through `COMMIT_WYSIWYG_RICH_TEXT_EDIT`.
- Added focused tests for the config gate and rich session plain-text bridge
  behavior.

Files changed:

- `docs/RICH_TEXT_DRAFT_DECISION.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/editorReducer.ts`
- `src/app/editor/_components/richTextDraftSession.ts`
- `src/app/editor/_components/wysiwygInlineEditConfig.ts`
- `src/app/editor/_components/wysiwygTextCommit.ts`
- `src/app/editor/_components/__tests__/richTextDraftSession.test.ts`
- `src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/richTextDraftSession.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/richTextDraftCommands.test.ts`
- `npm.cmd run type-check`

Notes:

- The rich draft live bridge remains disabled by default.
- Toolbar/keyboard rich commands, pending-style typing, rich paste, IME browser
  smoke, and visual proof are still out of scope.

---

## 2026-05-22

### Add Rich Draft Commit Planner Proof

Goal: Prove the rich draft commit boundary without wiring it into the live
editor bridge.

Completed:

- Added `commitWysiwygRichTextEditState` beside the existing plain
  `commitWysiwygTextEditState` path.
- Added `getEditableParagraphFromDocument` and
  `replaceEditableParagraphInDocument` helpers so rich commit can replace a
  complete `ParagraphNode`.
- Kept the existing plain `draftText` commit path unchanged.
- Covered style-only rich commits where the plain text does not change.
- Covered no-op rich commits, nested `flow-table` paragraph replacement, and
  stale draft paragraph ids.

Files changed:

- `docs/RICH_TEXT_DRAFT_DECISION.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `src/app/editor/_components/wysiwygTextCommit.ts`
- `src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts`

Notes:

- This is still a proof boundary. No live toolbar, keyboard, WYSIWYG session,
  pagination scheduling, or dispatch path uses rich commit yet.

---

## 2026-05-22

### Add Rich Draft Command Adapter Proof

Goal: Add a small command adapter over the sibling rich draft session before
wiring toolbar or keyboard events into the live editor bridge.

Completed:

- Added `src/app/editor/_components/richTextDraftCommands.ts`, a pure
  app-layer command adapter for rich draft style commands.
- Added command-state derivation for bold, italic, underline, and
  strikethrough, including collapsed pending-style overlays.
- Matched existing toolbar/property-panel toggle semantics by using explicit
  authored off values (`normal`, `none`, and `false`) instead of clearing run
  style.
- Added primary-key shortcut resolution for `B`, `I`, and `U`, while ignoring
  composition and Alt-modified input.
- Added focused app tests for collapsed pending style, mixed range toggles,
  explicit underline off, direct style patches, shortcut resolution, and
  inactive sessions.

Files changed:

- `docs/RICH_TEXT_DRAFT_DECISION.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `src/app/editor/_components/richTextDraftCommands.ts`
- `src/app/editor/_components/__tests__/richTextDraftCommands.test.ts`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/richTextDraftCommands.test.ts`

Notes:

- No live editor runtime path uses these commands yet.
- This keeps toolbar/keyboard wiring, focus lifecycle, IME behavior, and commit
  integration out of scope for this slice.

---

## 2026-05-22

### Prove Rich Draft Sibling Session Adapter

Goal: Decide and prove the first editor-session integration shape for rich
drafts without wiring it into the live WYSIWYG bridge.

Completed:

- Updated `docs/RICH_TEXT_DRAFT_DECISION.md` to accept a sibling rich draft
  session for the first editor integration.
- Exported the core rich draft proof module through `packages/core/src/document/index.ts`.
- Added `src/app/editor/_components/richTextDraftSession.ts`, a pure app-layer
  adapter that projects rich draft paragraph state into the existing
  `WysiwygTextSessionState` shape.
- Added app tests proving:
  - sibling session start projects `baseText`, `draftText`, caret, selection,
    and page index into the legacy text-session shape
  - collapsed pending style does not dirty layout until text insertion
  - selected-range style dirties layout even when projected plain text is
    unchanged
  - rich fragment replacement projects as plain `draftText` for legacy layout
  - layout freshness remains version-counter based
  - inactive rich draft session projects to the existing inactive text session

Files changed:

- `docs/RICH_TEXT_DRAFT_DECISION.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `packages/core/src/document/index.ts`
- `src/app/editor/_components/richTextDraftSession.ts`
- `src/app/editor/_components/__tests__/richTextDraftSession.test.ts`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/richTextDraftSession.test.ts`
- `npm.cmd run test -w packages/core -- src/document/richTextDraft.test.ts src/document/richText.test.ts src/document/operations.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/richTextDraftSession.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`

Notes:

- No live editor runtime path uses the sibling rich draft session yet.
- This slice keeps the existing WYSIWYG `draftText` session untouched and proves
  the compatibility projection first.
- Next gate: wire the sibling session behind a disabled/internal flag or keep
  building pure command adapters for keyboard/toolbar commands first.

---

## 2026-05-22

### Decide And Prove Rich Text Draft Lane

Goal: Resolve the `draftText` vs rich draft state decision before pending
style, rich paste, and inline-object editing touch the editor bridge.

Completed:

- Added `docs/RICH_TEXT_DRAFT_DECISION.md` documenting the accepted proof-lane
  direction: keep the current `draftText` lane unchanged, then add a separate
  rich draft paragraph lane where `draftText` is derived projection.
- Linked the decision from `docs/RICH_TEXT_SPEC.md`.
- Added a pure core proof module, `packages/core/src/document/richTextDraft.ts`.
- Added proof tests for:
  - plain-text projection from paragraph children
  - collapsed pending style insertion
  - boundary inheritance after pending style clears
  - selected-range style command behavior
  - sanitized rich fragment replacement
  - inline-object preservation during rich fragment replacement

Files changed:

- `docs/RICH_TEXT_DRAFT_DECISION.md`
- `docs/RICH_TEXT_SPEC.md`
- `packages/core/src/document/richTextDraft.ts`
- `packages/core/src/document/richTextDraft.test.ts`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/richTextDraft.test.ts`
- `npm.cmd run test -w packages/core -- src/document/richTextDraft.test.ts src/document/richText.test.ts src/document/operations.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`

Notes:

- No editor UI, WYSIWYG bridge, pagination, PDF/DOCX, schema, or undo/redo
  behavior changed in this slice.
- The current WYSIWYG `draftText` path remains the active runtime path. The
  rich draft module is a proof lane for future integration.
- Next gate: decide where rich draft state will live in the editor session and
  how it will derive `draftText` for existing layout/selection code.

---

## 2026-05-22

### Harden Rich Text Engine Operation Contract

Goal: Lock the low-level paragraph rich-text engine rules before moving into
selection commands, pending caret style, paste, or inline-object editing.

Completed:

- Added focused tests for reversed and clamped ranges.
- Added no-op coverage for collapsed deletes, collapsed empty replacements,
  invalid offsets, already-applied style patches, and empty patches.
- Added coverage for source id preservation on the first surviving split
  segment.
- Added coverage for collapsed insertion before inline objects at the current
  text offset.
- Added coverage for paragraph-boundary splits that create one editable empty
  run on the empty side.
- Documented the rich text engine operation contract in `docs/RICH_TEXT_SPEC.md`.

Files changed:

- `packages/core/src/document/richText.test.ts`
- `docs/RICH_TEXT_SPEC.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/richText.test.ts`
- `npm.cmd run test -w packages/core -- src/document/richText.test.ts src/document/operations.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`

Notes:

- No implementation changes were needed; the existing extracted engine already
  matched the accepted contract.
- The next decision gate remains draft representation for pending style and
  rich paste: keep `draftText` plus commands, or introduce richer draft inline
  state.

---

## 2026-05-22

### Extract Rich Text Paragraph Engine Primitives

Goal: Move rich text edit primitives toward the FlowDoc-owned core engine path
without changing editor, pagination, or export behavior.

Completed:

- Added focused rich text helper coverage for range styling, deletion,
  replacement, whole-paragraph text replacement, and text-run splitting.
- Moved pure paragraph text-run primitives into `packages/core/src/document/richText.ts`.
- Kept `packages/core/src/document/operations.ts` as the document-tree wrapper
  for body and Flow Table paragraphs.
- Preserved the existing public exports from `operations.ts` for callers and
  tests that still import those names from the operations module.

Files changed:

- `packages/core/src/document/richText.ts`
- `packages/core/src/document/richText.test.ts`
- `packages/core/src/document/operations.ts`

Verification:

- `npm.cmd run test -w packages/core -- src/document/richText.test.ts src/document/operations.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/RichTextToolbar.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts`
- `npm.cmd test`

Notes:

- No `DocumentNode` schema, pagination, PDF, DOCX, or WYSIWYG input bridge
  behavior changed in this slice.
- Paste, pending caret style, and inline objects such as `fieldRef` /
  `pageNumber` remain separate design gates.

---

## 2026-05-22

### Bump Rich Text Toolbar Baseline To 0.6.4

Goal: Mark the run-level rich text groundwork and fixed paragraph text toolbar
shell as the next self-use patch baseline before continuing into range
selection work.

Completed:

- Bumped the root project version marker from `0.6.3` to `0.6.4`.
- Updated the lockfile root package version to match.
- Updated the project version marker test to assert the accepted `0.6.4`
  baseline.
- Updated versioning docs so the current baseline points at `0.6.4`.
- Kept persisted document/package schema versions unchanged.

Files changed:

- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd pkg get version`
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`
- `npm.cmd run type-check`

Notes:

- This is a project release-readiness marker only. It does not change
  `DocumentNode.version`, FlowDoc package version, or storage package version.
- Selection-range rich text, `fieldRef`, and `pageNumber` behavior remain
  deferred to follow-up slices.

---

## 2026-05-21

### Font Catalog Foundation

Goal: Add a small Thai font catalog before rich text work and trial Sarabun as
the whole-system default font.

Completed:

- Added a registry-backed first selectable font catalog with `Sarabun` and
  `Noto Sans Thai`.
- Switched the `default` font key to `sarabun`, backed by
  `public/fonts/Sarabun/Sarabun-Regular.ttf`.
- Removed the duplicate `Default (Sarabun)` registry entry so `Sarabun` is the
  visible and stored default font key for new paragraph defaults.
- Updated server and browser fontkit measurers to use the paragraph
  `fontFamilyKey` when a catalog font is selected.
- Loaded catalog fonts through the shared runtime/browser font registry and
  exposed a paragraph font selector in the property panel.
- Updated font-related architecture/export/test docs and synchronized the
  project version marker test with `0.6.0`.

Files changed:

- `packages/core/src/font-registry.ts`
- `packages/core/src/layout/font-measurer.ts`
- `src/app/api/runtimeFont.ts`
- `src/app/api/paginate/route.ts`
- `src/app/api/export/route.ts`
- `src/app/_components/DocTest.tsx`
- `src/app/debug/_components/DebugView.tsx`
- `src/app/editor/_components/browserFontkitMeasurer.ts`
- `src/app/editor/_components/editorTextMeasurerState.ts`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/layout.tsx`
- focused font/runtime/editor tests
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/TEST_STRATEGY.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- font-registry.test.ts`
- `npm.cmd run test:app -- runtimeFont.test.ts editorTextMeasurerState.test.ts fontMeasurerParity.test.ts PropertyPanel.test.ts`
- `npm.cmd test`
- `git diff --check`

Notes:

- Unused legacy font assets are removed from the active runtime font set.
- Run-level rich text and bold/italic editing remain deferred.

### Bump Font/Export Milestone To 0.6.0

Goal: Treat the font catalog, keyed measurement, paragraph font selection, and
server DOCX regular-font embedding work as a meaningful pre-v1 minor milestone.

Completed:

- Bumped the root project version marker from `0.5.19` to `0.6.0`.
- Updated the lockfile root package version to match.
- Updated the project version marker test to assert the accepted `0.6.0`
  baseline.
- Updated versioning docs so the current baseline points at `0.6.0`.
- Kept persisted document/package schema versions unchanged.

Verification:

- `npm.cmd pkg get version`
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/productExportGolden.test.ts`
- `npm.cmd test`

Notes:

- This is a project release-readiness marker only. It does not change
  `DocumentNode.version`, FlowDoc package version, or storage package version.
- One full `npm.cmd test` attempt hit the default 5s timeout in a product export
  golden test; the focused rerun passed, and the subsequent full suite passed.

### Promote Sarabun As Stored Default And Prune Fonts

Goal: Remove the duplicate `Default (Sarabun)` surface and keep only active
runtime font assets.

Completed:

- Changed `DEFAULT_FONT_KEY` to `sarabun`.
- Changed new paragraph defaults and TOC/pagination fallback props to store
  `fontFamilyKey: "sarabun"` directly.
- Kept old `default` and `thSarabun` keys as registry fallbacks to Sarabun
  during resolution and normalization.
- Removed the extra `Default (Sarabun)` entry from the paragraph font dropdown.
- Removed unused TH Sarabun, Noto Serif Thai, and unused extra weight font
  files from the active runtime font tree.
- Updated review archive and browser smoke font checks to require
  `public/fonts/Sarabun/Sarabun-Regular.ttf`.
- Increased the slow product flow-row export golden timeout to match its actual
  PDF/DOCX export cost.

Verification:

- `npm.cmd run test -w packages/core -- font-registry.test.ts normalize.test.ts renderer.test.ts productExportGolden.test.ts`
- `npm.cmd run test:app -- src/app/api/__tests__/runtimeFont.test.ts src/app/api/__tests__/exportPaginate.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts src/app/editor/_components/__tests__/fontMeasurerParity.test.ts src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd run review:archive -- --check`
- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/productExportGolden.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorTextMeasurerState.test.ts`
- `npm.cmd test`

Notes:

- Historical test fixtures may still contain `fontFamilyKey: "default"` as
  legacy input, but normalization and registry resolution map it to `sarabun`.

### Layout Refactor Guardrails and 0.5.18 Baseline

Goal: Reduce risky editor/layout concentration points while preserving current
document semantics, pagination behavior, undo/redo behavior, and export
contracts.

Completed:

- Split the large paginator orchestrator into focused pagination modules for
  cursor state, paragraph flow, TOC, row/flow-row handling, table splitting, and
  Flow Table rowspan continuation.
- Extracted conservative editor UI/state seams from `EditorShell.tsx`,
  including the editor reducer, Page panel, Add panel, and animation-frame state
  hook, while keeping reducer action behavior unchanged.
- Replaced fragile table/flow-table binding casts with type guards.
- Switched document ID generation to prefer `crypto.randomUUID()` while keeping
  a timestamp/counter fallback for environments without crypto support.
- Added a flow-row/flow-stack width-total regression check and project version
  alignment test updates.
- Added browser font loading/fallback status indicators so preview metric drift
  is visible without changing persisted document/package versions.
- Bumped the project release marker to `0.5.18`, while keeping persisted
  document/package versions unchanged.

Files changed:

- `packages/core/src/binding/index.ts`
- `packages/core/src/document/defaults.ts`
- `packages/core/src/document/defaults.test.ts`
- `packages/core/src/layout/__tests__/flowRowStack.test.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/paginator/`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/AddPanel.tsx`
- `src/app/editor/_components/PagePanel.tsx`
- `src/app/editor/_components/editorReducer.ts`
- `src/app/editor/_components/useAnimationFrameState.ts`
- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core --`
- `git diff --check`
- Playwright smoke opened
  `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`,
  found the editor shell, Page rail button, Add rail button, and no console/page
  errors.

Notes / follow-ups:

- Manual deep smoke for undo/redo, inline edit commit/reset, margin editing, and
  drag/drop remains useful before treating the EditorShell reducer extraction as
  fully accepted.
- Future EditorShell decomposition should continue in small slices around
  persistence/import-export, drag session, WYSIWYG session, and layout
  reconciliation rather than a broad rewrite.

---

## 2026-05-20

### Resize Preview Performance P1-P5

Goal: Make canvas resize feel steadier by removing the post-resize white
reconcile flash, reducing pointer-move render pressure, and avoiding avoidable
post-release layout work.

Completed:

- Suppressed the canvas loading wash for server reconciliation that immediately
  follows resize-style commits, while keeping layout status/export readiness on
  the normal server-pagination path.
- Added animation-frame-backed transient state for column, row-min-height, and
  margin resize previews so pointer movement coalesces to the display frame.
- Kept the latest resize draft in refs so pointerup commits the newest drag
  position even when the visual state update is waiting for the next animation
  frame.
- Memoized page rendering so pages unaffected by the active resize draft do not
  rerender only because the transient drag object changed.
- Precomputed page-local document lookup sets used by fragment rendering instead
  of repeatedly scanning the whole document inside the fragment loop.
- Reused the just-computed column-resize browser pagination result for the next
  preview reconciliation pass, avoiding a duplicate browser pagination run after
  release.
- Moved live column-resize feedback to a fixed editor-only preview line that is
  updated imperatively during pointer movement; the document model and page
  fragments now update on pointerup instead of on every move.
- Added a WYSIWYG text-engine immediate echo path that flushes the local typed
  glyph preview before the heavier parent draft/reflow update runs.
- Kept the immediate text echo alive until visual draft lines or parent live
  echo can take over, preventing the typed glyph preview from disappearing just
  because the parent draft state caught up first.
- Changed WYSIWYG draft pagination scheduling to latest-only trailing behavior:
  responsive requests now keep only one latest request, wait for a short quiet
  window, and force a run within a max-lag budget so rapid typing does not kick
  off near-per-key draft pagination work.
- Added P3-A instrumentation for active WYSIWYG draft paragraph measurement via
  `text-engine-draft-measure` perf events, including only scalar metadata such
  as text length, line count, available width, and measured height.
- Added source/delay metadata to browser preview pagination perf events so
  future probes can distinguish WYSIWYG draft pagination from ordinary preview
  pagination.
- Added P3-B fallback canvas text measurement width caching, keyed by text,
  font family key, and font size, matching the existing browser fontkit
  measurer cache shape.
- Added bounded grapheme-boundary caching in the core layout measurer while
  preserving the previous "fresh array per call" behavior to avoid caller
  mutation corrupting cached layout data.
- Bumped the project release marker to `0.5.17` after resize, drag, and WYSIWYG
  typing smoothness verification, while keeping persisted document/package
  versions unchanged.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/browserTextMeasurer.ts`
- `src/app/editor/_components/wysiwygPerformance.ts`
- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/__tests__/browserTextMeasurer.test.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/__tests__/measure.test.ts`
- `package.json`
- `package-lock.json`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorPalette.test.ts src/app/editor/_components/__tests__/OutlinePanel.test.ts`
- `npm.cmd run test -w packages/core -- document/operations.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/browserTextMeasurer.test.ts src/app/editor/_components/__tests__/editorTextMeasurerState.test.ts src/app/editor/_components/__tests__/fontMeasurerParity.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `npm.cmd run test -w packages/core -- src/layout/__tests__/measure.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `SMOKE_BASE_URL=http://localhost:4000/editor PROBE_BURST_LENGTH=80 npm.cmd run smoke:wysiwyg-smoothness`
- `SMOKE_BASE_URL=http://localhost:4000/editor PROBE_BURST_LENGTH=120 PROBE_INTERVAL_MS=20 npm.cmd run smoke:wysiwyg-smoothness`
- Custom Playwright typing echo probe on
  `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`
  observed `0/12` missed visual-change samples, p95 visual-change latency around
  `0.2ms`, and no console/page errors.
- After latest-only scheduling, the 120-key/20ms smoothness probe passed with
  no console/page errors, p95 paint latency around `31.9ms`, and p95 key total
  latency around `145.3ms`.
- After P3-A instrumentation, the 80-key smoothness probe passed with no
  console/page errors, p95 paint latency around `30.9ms`, and p95 key total
  latency around `122.5ms`. Perf events were `0` on the already-running local
  server because that server was not launched with
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1`.
- After P3-B cache work, the 80-key smoothness probe passed with no
  console/page errors, p95 paint latency around `31.4ms`, and p95 key total
  latency around `165.4ms`.
- Browser smoke on
  `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`
  confirmed typing has no console/page errors with p95 paint latency around
  `29ms` for an 80-key burst.
- Browser resize probe using `C:/Users/nekot/Downloads/Untitled.flowdoc (1).json`
  confirmed `9` column handles, preview line visible for all `70` sampled drag
  moves, preview hidden after pointerup, no console/page errors, average move
  command time around `18.4ms`, p95 move command time around `26.4ms`, and p95
  frame interval around `16.8ms`.
- `npm.cmd run smoke:editor` with `SMOKE_BASE_URL=http://localhost:4000/editor`
  is currently blocked by the smoke script expecting the older textarea inline
  edit fallback while the app is running the WYSIWYG text-engine bridge.

Notes:

- This patch does not change document schema, core pagination semantics,
  undo/redo ownership, or export readiness rules.

### Outline Depth Lane UX

Goal: Make nested outline layers easier to scan at a glance without adding
heavier hierarchy chrome.

Completed:

- Added subtle depth-based row background lanes to the outline tree.
- Added faint vertical guide marks for nested levels, with each row tint
  beginning from its own depth lane instead of filling from the panel edge.
- Kept selected, hover, drag source, and drop-target states visually dominant
  over the depth lane.
- Replaced direct hover DOM style mutation with React state-driven row styling
  so hover enter/leave does not erase the depth color.

Files changed:

- `src/app/editor/_components/OutlinePanel.tsx`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/OutlinePanel.test.ts`
- `npm.cmd run type-check`
- Browser smoke on
  `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`
  confirmed nested outline rows render lane gradients and distinct nested
  background starts.

Notes:

- This patch does not change outline reorder behavior.

### Outline Drag Ghost UX

Goal: Make outline reorder feel like the user is lifting a real node, not
dragging an invisible browser drag payload.

Completed:

- Added a custom fixed-position outline drag ghost with the dragged row icon and
  label.
- Hid the native browser drag image so the custom ghost is the only visible
  dragged object.
- Dimmed the source outline row as an in-place placeholder while dragging.
- Strengthened target feedback with a row-level highlight plus the existing
  before/after drop edge.
- Kept the existing direct-body-child reorder grammar; this patch does not
  switch outline reorder from insertion to swap.

Files changed:

- `src/app/editor/_components/OutlinePanel.tsx`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/OutlinePanel.test.ts src/app/editor/_components/__tests__/EditorPalette.test.ts`
- `npm.cmd run type-check`
- Playwright smoke on
  `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`
  started an outline drag, confirmed the custom ghost and source placeholder,
  dropped the first row after the second, observed the outline order update, and
  reported no layout-error badge or duplicate-key/page error.

Notes:

- Outline swap behavior and nested/inside drop behavior remain intentionally
  deferred.

### Body Paragraph Live Height Preview Fix

Goal: Restore live same-page reflow while typing in normal body paragraphs, so
new wrapped lines resize the active block and push following content down
without waiting for edit exit.

Completed:

- Allowed same-page WYSIWYG height patching for non-table-cell paragraphs while
  keeping table/flow-table cell paragraphs on their guarded pagination path.
- Added source-page draft-preview shifting for ordinary body paragraphs in the
  canvas, so replacing the active paragraph with draft lines also moves later
  same-page fragments by the paragraph height delta.
- Kept table-cell draft visual chrome and continuation-fragment insertion paths
  separate from the body paragraph same-page shift.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/wysiwygDraftVisualPreview.ts`
- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts`
- `npm.cmd run type-check`
- Playwright smoke on
  `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`
  edited `stage3-downstream-p1`; the active paragraph grew by about 40 px and
  `stage3-downstream-p2` shifted down by about 39 px within the live edit, with
  no layout-error badge or duplicate-key/page error.

Notes:

- Table-cell local row/cell height reflow remains intentionally guarded by the
  existing draft pagination path.

### Editor Panel IA: Left Outline/Add And Right Details

Goal: Reframe the editor shell so the left side owns document overview/add
entry points, the center remains the paged canvas, and the right side stays
focused on page/settings details for the current selection.

Completed:

- Added a top workflow navigation row for `Design`, `Fields`, `Fill`, and
  `Render`, matching the intended authoring phases while preserving existing
  editor modes underneath.
- Split the toolbar into a workflow row and a command row so undo/redo, zoom,
  debug overlays, and document JSON actions remain available without competing
  with the workflow tabs.
- Mapped `Design` to template editing with the left outline visible, `Fields`
  to template editing with the left add panel visible, `Fill` to the existing
  fill mode, and `Render` to the export/readiness area without bypassing the
  existing export gate.
- Added a left rail mode switch with `Outline` and `Add`.
- Moved the existing outline panel from the right rail to the left rail.
- Moved the existing block and field palettes into the left `Add` panel.
- Added an `Outline` header shortcut that switches directly to the `Add` panel.
- Added outline drag reorder for direct children of a section `body`, using a
  six-dot grip and before/after drop line inside the same body.
- Removed the `Outline` bookmark/content path from the right rail, leaving
  `Page` and `Properties`.
- Kept this as editor-shell IA plus outline-only body-child reorder; no document
  schema, pagination, or export behavior changed.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/OutlinePanel.tsx`
- `src/app/editor/_components/__tests__/OutlinePanel.test.ts`
- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/OutlinePanel.test.ts src/app/editor/_components/__tests__/EditorPalette.test.ts`
- `npm.cmd run type-check`
- Playwright smoke on
  `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`
  confirmed the left rail starts on `outline`, the outline `+` shortcut opens
  `add`, the `Add` panel renders, the right rail no longer exposes an outline
  bookmark, and no page errors were reported.
- Playwright smoke on the same scenario confirmed the top workflow navigation:
  `Design` starts active with the left outline, `Fields` opens the left add
  panel, `Fill` enters the existing fill/properties mode without the outline
  add shortcut, and `Render` opens the page/export context while the right rail
  still has no outline bookmark.
- Playwright smoke on the same scenario confirmed 17 reorderable direct
  body-child outline rows, dragged the first row after the second, observed the
  outline order update, and reported no layout-error badge or duplicate-key
  console warning.

Notes:

- Nested outline reorder, canvas row drag handles, stack/table/flow-table
  row/cell reorder, cross-section reorder, and item-level contextual add remain
  intentionally deferred.

### Flow Stack Drag/Drop And Pair Resize UX

Goal: Make `flow-row` / `flow-stack` layout editing feel direct on canvas
without changing the document model or the existing property-panel commands.

Completed:

- Added a placement operation for dragging `columns` / `flow-columns` onto a
  `flow-stack` edge so canvas drop uses the existing local stack split
  behavior instead of rejecting the drop or creating nested flow rows.
- Kept row-level add-column as the balanced/rebalance action and stack-edge
  insertion as the local split action.
- Enabled canvas pair resize handles for `flow-row` / `flow-stack` siblings.
- Reused the property-panel flow-stack resize minimum-share helper for canvas
  resize commit, so the 8% preferred minimum and narrow-pair fallback are
  consistent.
- Kept resize visual preview sibling-safe and preserved authored column gaps.
- Removed the mouse-up snap-back by committing the resized document and its
  optimistic paginated layout together.
- Updated the editor UX contract and bumped the project release marker to
  `0.5.15` after verification.

Files changed:

- `packages/core/src/placement/types.ts`
- `packages/core/src/placement/law.ts`
- `packages/core/src/placement/law.test.ts`
- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `src/app/__tests__/projectVersion.test.ts`
- `package.json`
- `package-lock.json`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/VERSIONING.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/placement/law.test.ts`
- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run test -w packages/core`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/flowStackResize.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run test:app`
- `npm.cmd run type-check`
- Playwright smoke on
  `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`
  loaded the editor, found resize handles, and reported no page errors.

Notes:

- This is editor interaction behavior plus placement plumbing only. It does not
  change `DocumentNode` schema, persisted package/document versions, export
  behavior, or row-level balanced add-column semantics.
- Canvas vertical min-height resize for `flow-row` remains intentionally
  separate from this pair-resize work.

### WYSIWYG Caret Blink And Vertical Navigation

Goal: Make the active editor caret feel like a normal text editor caret and
teach the FlowDoc-owned text engine to handle ArrowUp/ArrowDown from rendered
line geometry.

Completed:

- Added a blinking SVG animation to the custom collapsed caret, including the
  live text-echo caret used while draft text is waiting for settled layout.
- Added vertical caret navigation over ordered `PageFragment.lines`, preserving
  the desired x position across shorter lines and continuation fragments.
- Routed text-engine ArrowUp/ArrowDown through the FlowDoc caret session instead
  of letting the hidden input bridge move an invisible browser caret.
- Kept caret-only movement from scheduling responsive draft pagination, so
  navigation does not trigger unnecessary layout work.
- Updated the editor UX contract for blinking custom caret and geometry-owned
  arrow navigation expectations.

Files changed:

- `docs/EDITOR_UX_CONTRACT.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd test -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- Browser Playwright smoke on
  `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`:
  clicked `stage3-boundary-target`, confirmed one SVG caret blink animation,
  pressed ArrowDown and saw the caret y-position move to the next visual line,
  with no textarea fallback and no immediate WYSIWYG perf events.

Notes:

- This is editor interaction state only. It does not change `DocumentNode`,
  pagination semantics, undo/redo history, or export output.

### Flow Table Rowspan Atomic-When-Fits Policy

Goal: Restore the legacy `table` rowspan grouping intuition for Flow Table so
that merged-cell groups stay together as a unit by default, only splitting at
row boundaries when the group itself exceeds one full clean page. The earlier
0.5.13 line-by-line approach was breaking the visual merge that authors expect
when they author a rowspan.

Completed:

- In `paginateFlowTable`, multi-row rowspan-linked groups now check whether the
  whole group fits one full clean page. If so, the group goes through the
  atomic `paginateFlowTableRowFull` path (mirroring legacy `table`):
  `shouldMoveBlockToNextPage` advances the cursor, then every row is placed
  whole. Groups whose `totalHeight` exceeds one full clean page still enter
  `paginateFlowTableRowspanGroupSplit` with the existing R2A/R3D guards.
- Updated the first-group atomic check at the top of `paginateFlowTable` so it
  recognizes the new atomic-when-fits case for multi-row groups.
- Restored the early-return `advancePage` in
  `paginateFlowTableRowspanGroupSplit` for single-row slices that do not fit
  the remaining page space but fit one full clean page, so each row also tries
  to stay whole when possible. The line-by-line `paginateFlowTableRowspanTallRowSlice`
  subdivider stays for genuinely oversized single-row slices.
- Removed the two 0.5.13 tests that asserted line-by-line subdivision for
  groups that fit one full page. Updated existing rowspan continuation tests
  to either expect atomic placement (for small groups) or to use row heights
  that genuinely exceed one full clean page (for the split-path scenarios).
  Updated the DOCX renderer rowspan continuation fixture to use 250pt rows so
  the group still drives split chrome.
- Updated Flow Table, cross-page, and layout specs to document the
  atomic-when-fits R3F policy and clarified that R3D applies only to genuinely
  oversized single-row slices inside a forced split path.
- Bumped the project release marker to `0.5.14` after verification.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `src/app/__tests__/projectVersion.test.ts`
- `package.json`
- `package-lock.json`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`

Notes:

- This reverses the design pivot introduced in 0.5.13 (and partially in 0.5.12
  for the row-boundary same-page-fill behavior). Merged-cell visual integrity
  now wins over packing efficiency by default.
- Single-row breakable rows (non-rowspan) keep their existing line-by-line
  split-when-needed behavior; only multi-row rowspan-linked groups are now
  atomic by default.
- Legacy `table` rowspan splitting remains intentionally deferred — Flow Table
  still uses `paginateFlowTableRowspanGroupSplit` for groups that exceed one
  full clean page.

---

## 2026-05-19

### Flow Table Rowspan Line Boundary On Remaining Page Space

Goal: Make breakable rowspan-linked Flow Table rows behave like normal
paragraph cross-page flow when the row slice does not fit the remaining page
space, instead of pushing the whole row to the next page or producing extra
near-empty continuation pages when the trailing row absorbs spillover content.

Completed:

- Removed the early-return `advancePage` in
  `paginateFlowTableRowspanGroupSplit` that pushed a single-row rowspan slice
  whole to the next page whenever the slice could otherwise fit one full clean
  page.
- Removed the `remainingRowHeight` cap on `sliceHeight` inside
  `paginateFlowTableRowspanTallRowSlice` so a continuation slice on a fresh
  page can absorb all remaining spanning-cell content even when the authored
  row height (driven by rowspan spillover) is smaller than the available page
  height. The final-slice clamp now also fires whenever content stops
  continuing, shrinking the row slice down to its measured content height
  instead of trailing a tall blank rectangle.
- The line-by-line subdivider now runs for every single-row slice that does
  not fit the remaining page space, so spanning-cell content uses up the
  usable page space first and finishes inside the next continuation page
  instead of spilling a single trailing line onto an extra page.
- Added focused pagination coverage for the "fits one full page but not the
  remaining page space" case, asserting exactly two pages worth of spanning
  paragraph fragments, contiguous line ranges, sibling cells rendering once,
  and fragments staying within the page content box.
- Updated Flow Table, cross-page, and layout specs to describe the new R3E
  remaining-page-space behavior.
- Bumped the project release marker to `0.5.13` after verification.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `src/app/__tests__/projectVersion.test.ts`
- `package.json`
- `package-lock.json`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`

Notes:

- Multi-row rowspan slices that fit the remaining page space still go through
  the existing `pushFlowTableRowspanGroupSlice` path; only single-row slices
  that exceed the remaining height now use the line-by-line subdivider.
- Shorter sibling cells render their content once but their cell chrome still
  extends through the visible row continuation slices, consistent with the
  earlier R3D behavior.
- Legacy `table` rowspan splitting remains intentionally deferred.

### Flow Table Rowspan Tall Slice And WYSIWYG Boundary Polish

Goal: Make Flow Table rowspan continuation feel as close to normal paragraph
cross-page flow as possible by removing oversized blank final slices, keeping
the active page filled when later row slices can use the remaining height, and
keeping WYSIWYG caret/chrome anchored to the real final fragment instead of a
padded continuation rectangle.

Completed:

- Added `paginateFlowTableRowspanTallRowSlice` so a single visible row slice
  inside a rowspan group whose spanning-cell content exceeds the remaining page
  height now subdivides line-by-line across pages, reusing the existing cell
  split-point helpers and forced-progress warning shape from the non-rowspan
  path.
- Removed the unconditional page advance between rowspan row-boundary slices so
  a following row slice can start on the same page and continue the
  spanning-cell paragraph there when usable height remains.
- Clamped the final rowspan slice height to the measured spanning-cell content
  height when authored row height has already been satisfied, so the final
  visible row no longer leaves a tall blank rectangle below the last paragraph
  line.
- Added focused pagination coverage for the oversized-final-slice case
  including continuous line ranges, mixed sibling non-duplication, and clean
  final cell/row height bounds.
- Hardened the WYSIWYG paragraph layer blur to settle before ending the inline
  edit so that the same-node input-bridge focus transition does not prematurely
  close the editing session; covered by a new
  `isWysiwygTextSessionFocusTarget` unit test.
- Tightened `scripts/wysiwyg-table-cell-boundary-smoke.mjs` to assert that the
  final rowspan target paragraph fragment is covered by aligned cell/row chrome
  and that the input bridge and caret stay anchored to that final fragment
  during boundary editing.
- Updated Flow Table, cross-page, and layout specs to record the new R3D
  oversized-slice and same-page-fill behavior.
- Bumped the project release marker to `0.5.12` after verification.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-table-cell-boundary-smoke.mjs`
- `src/app/__tests__/projectVersion.test.ts`
- `package.json`
- `package-lock.json`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`

Notes:

- Split-inside-rowspan still respects the authored row-boundary slices; only a
  single oversized visible row slice is allowed to subdivide further so short
  sibling cells remain placed once.
- Legacy `table` rowspan splitting remains intentionally deferred.
- The browser smoke script change is assertion-only; running the smoke gate is
  not required to land the pagination/editor changes but is recommended before
  the next stage 3 sweep.

## 2026-05-17

### Add Flow Table Repeated Headers

Goal: Bring Flow Table closer to authored table behavior by repeating
`headerRowCount` rows during core pagination, without adding DOCX projection or
editor UI yet.

Completed:

- Reused the legacy table pagination policy for Flow Table header repetition.
- Added `placeHeaders` support for Flow Table body continuation pages.
- Updated Flow Table row splitting so repeated headers consume continuation page
  height before body row split decisions.
- Kept header rows atomic; body rows still split only in non-rowspan groups.
- Added focused tests for normal repeated headers and tall repeated headers that
  leave limited body capacity.
- Updated Flow Table, cross-page, and layout specs to record the new behavior.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts src/document/flowTableGrid.test.ts src/document/assert.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- DOCX Flow Table projection, editor insertion/property UI, and
  split-inside-rowspan remain intentionally deferred.

### Draw Flow Table Cell Boxes In PDF And Editor

Goal: Make the first Flow Table visual output consume paginated
`flow-table-cell` box metadata without adding DOCX, repeated headers, or editor
authoring UI yet.

Completed:

- Wired PDF rendering to draw `flow-table-cell.boxRenderProps` through the
  shared fragment box primitive.
- Wired editor SVG preview to draw Flow Table cell fill/border and hide generic
  editor chrome over authored cell boxes.
- Added primitive tests for Flow Table cell static and split border semantics.
- Added a PDF smoke test plus opt-in raster coverage for Flow Table cell
  fill/border pixels.
- Added an EditorCanvas markup test for Flow Table cell box rendering.
- Updated Flow Table and export renderer docs to record the supported visual
  slice.

Files changed:

- `packages/core/src/renderer/pdf/index.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `packages/core/src/renderer/__tests__/pdfVisualRegression.test.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- DOCX Flow Table projection, repeated headers, editor insertion/property UI,
  and split-inside-rowspan remain intentionally deferred.

### Add Flow Table Non-Rowspan Split Pagination

Goal: Add the first cross-page Flow Table slice without taking on repeated
headers, renderer output, editor UI, or split-inside-rowspan behavior.

Completed:

- Added breakable non-rowspan Flow Table row/cell split pagination.
- Preserved `allowBreak=false` row movement and kept rowspan-linked Flow Table
  rows atomic in v1.
- Added Flow Table forced-progress warning plumbing for impossible low-capacity
  row splits.
- Ensured shorter sibling cells do not duplicate their paragraph content on
  continuation slices.
- Kept Flow Table parent fragments aligned with the first row when a split must
  start on a clean page.
- Updated cross-page and layout specs to record the new Flow Table split policy.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/warnings.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts src/document/flowTableGrid.test.ts src/document/assert.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- Repeated headers, PDF/DOCX/editor rendering, editor insertion/property UI, and
  split-inside-rowspan remain intentionally deferred.

### Add Flow Table Static Layout And Pagination

Goal: Let the new Flow Table primitive produce core geometry for one-page,
unsplit cases before adding cross-page row/cell split behavior or editor UI.

Completed:

- Added `flow-table`, `flow-table-row`, and `flow-table-cell` flow fragment
  kinds.
- Implemented static Flow Table measurement using authored columns,
  `colspan`, `rowspan`, row height, and cell box padding.
- Added unsplit block pagination for Flow Table. A Flow Table moves to the next
  page when it does not fit the remaining space, but row/cell splitting remains
  deferred.
- Emitted Flow Table page fragments with paragraph child fragments and
  cell-level `boxRenderProps` metadata for later renderer work.
- Extended drift/placement type surfaces enough to accept the new fragment
  kinds without enabling editor insertion or drag behavior.
- Added focused pagination tests for one-page fragments, span geometry, and
  whole-table page movement.

Files changed:

- `packages/core/src/layout/types.ts`
- `packages/core/src/layout/flow.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `packages/core/src/placement/types.ts`
- `packages/core/src/placement/geometry.ts`
- `src/app/editor/_components/comparePagination.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts src/document/flowTableGrid.test.ts src/document/assert.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- Runtime row/cell split pagination, repeated headers, PDF/DOCX rendering,
  editor insertion, and property editing are intentionally deferred.

### Add Flow Table Schema And Grid Resolver

Goal: Start Flow Table implementation with a small reversible model/assertion
slice before touching layout, pagination, renderer, or editor insertion.

Completed:

- Added draft `flow-table`, `flow-table-row`, and `flow-table-cell` schema
  support with cell `box` styling.
- Added a standalone `resolveFlowTableGrid(...)` helper that resolves
  row/column occupancy for `colspan` and `rowspan`.
- Wired `assertDocument(...)` to validate Flow Table internals, row/cell
  reachability, child ownership, header row count, and grid fill/span rules.
- Kept runtime layout disabled with an explicit `flow-table layout is not
  implemented yet` error if a hand-authored Flow Table reaches the flow layer.
- Added focused tests for Flow Table grid resolution and document assertion.

Files changed:

- `packages/core/src/schema/table.ts`
- `packages/core/src/schema/block.ts`
- `packages/core/src/document/flowTableGrid.ts`
- `packages/core/src/document/flowTableGrid.test.ts`
- `packages/core/src/document/assert.ts`
- `packages/core/src/document/assert.test.ts`
- `packages/core/src/document/normalize.ts`
- `packages/core/src/layout/flow.ts`
- `src/app/editor/_components/selectionContext.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/assert.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- Runtime layout, pagination, renderer output, editor insertion, and property
  editing are intentionally deferred.

### Draft Flow Table Spec

Goal: Capture the agreed direction for a new explicit table primitive before
changing schema, pagination, editor, or renderer code.

Completed:

- Added `docs/FLOW_TABLE_SPEC.md` as the Flow Table design draft.
- Recorded the core decision that Flow Table is a separate explicit primitive,
  not an automatic migration or hidden projection of legacy `table`.
- Defined provisional authored model, grid law, pagination slices, conservative
  v1 split policy, renderer/editor behavior, migration stance, implementation
  path, test plan, acceptance gate, risk map, and open decisions.
- Locked the draft direction for the `flow-table` node family name, cell `box`
  styling, `colspan` grid support from the start, and conservative atomic
  `rowspan` groups in v1.
- Updated `docs/DOCS_INDEX.md` so future table design work can find the new
  spec.

Files changed:

- `docs/FLOW_TABLE_SPEC.md`
- `docs/DOCS_INDEX.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `git diff --check`

Notes:

- This is docs-only. No runtime `table` or proposed `flow-table` behavior was
  changed.

### Add PDF Raster Coverage For Split Boxed Paragraphs

Goal: Prove the PDF renderer draws a split paragraph box as one logical box
sliced across pages.

Completed:

- Extended the PDF raster test helper so a test can rasterize a specific PDF
  page from the same exported artifact.
- Added an opt-in raster case for a boxed paragraph that splits across pages.
- Checked that the first slice draws top/side borders but no bottom border, and
  the final slice draws bottom/side borders but no top border.
- Updated renderer/test docs to record focused split paragraph box raster
  coverage.

Files changed:

- `packages/core/src/renderer/__tests__/pdfVisualRegression.test.ts`
- `docs/TEST_STRATEGY.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:pdf-visual`
- `git diff --check`

Notes:

- This keeps renderer behavior unchanged and only adds a focused PDF visual
  guardrail for the existing paragraph box split contract.

### Add PDF Raster Coverage For Border Styles

Goal: Strengthen the PDF-first export guardrail by checking authored dashed and
dotted paragraph borders in actual rasterized PDF output.

Completed:

- Added an opt-in PDF raster visual regression case for dashed and dotted
  paragraph box borders.
- Kept the change test-only for renderer behavior; the test samples actual PDF
  pixels and verifies that styled strokes include both colored segments and
  uncolored gaps.
- Updated renderer/test docs to record the new focused PDF border-style raster
  coverage.

Files changed:

- `packages/core/src/renderer/__tests__/pdfVisualRegression.test.ts`
- `docs/TEST_STRATEGY.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:pdf-visual`
- `git diff --check`

Notes:

- Broad PDF/editor visual parity remains deferred; this is a focused
  border-style guardrail.

## 2026-05-16

### Bump Self-Use Baseline To 0.5.3

Goal: Mark the accepted flow-stack box/export/visual-script work as the next
self-use patch baseline.

Completed:

- Bumped the root package and lockfile version marker to `0.5.3`.
- Updated versioning docs so the current baseline points at `0.5.3`.
- Updated the project version marker test to assert the accepted `0.5.3`
  baseline.
- Gave the long flow-row pagination stability regression an explicit timeout
  after the full suite showed the fixture can exceed Vitest's default 5 second
  limit on this machine.
- Recorded `0.5.3` as the patch baseline for flow-stack Box styling,
  flow-row DOCX projection, focused PDF raster visual smoke, and local
  visual/WYSIWYG convenience scripts.

Files changed:

- `package.json`
- `package-lock.json`
- `docs/VERSIONING.md`
- `src/app/__tests__/projectVersion.test.ts`
- `packages/core/src/pagination/__tests__/flowRowStack.test.ts`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd pkg get version`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- No git tag was created; project versions remain release-readiness markers.

### Add Convenience Scripts For Visual And WYSIWYG Runs

Goal: Reduce repeated local PowerShell environment setup for PDF raster visual
checks and WYSIWYG development sessions.

Completed:

- Added `npm run test:pdf-visual`, which sets
  `FLOWDOC_PDF_VISUAL_REGRESSION=1` and runs the focused PDF raster test.
- Added `npm run dev:wysiwyg`, which starts the existing dev server with
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1` and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`.
- Added small Node wrappers so the commands do not depend on PowerShell-only
  `$env:` syntax.
- Made the PDF visual wrapper pass an explicit `FLOWDOC_PDFTOPPM_PATH` when it
  falls back to WinGet-installed Poppler on Windows.
- Reused npm's active `npm_execpath` inside both wrappers so nested commands do
  not depend on `npm.cmd` being discoverable in PATH.
- Prepended the active Node executable directory to wrapper child environments
  so npm-run subcommands can resolve `node` in restricted shells.
- Updated test/WYSIWYG docs to point at the new convenience commands.

Files changed:

- `package.json`
- `scripts/run-pdf-visual-regression.mjs`
- `scripts/dev-wysiwyg.mjs`
- `packages/core/src/renderer/__tests__/pdfVisualRegression.test.ts`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_PRODUCTION_GATE.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `node --check scripts/run-pdf-visual-regression.mjs`
- `node --check scripts/dev-wysiwyg.mjs`
- `npm.cmd pkg get scripts.test:pdf-visual scripts.dev:wysiwyg`
- `npm.cmd run test:pdf-visual`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- `npm.cmd run test:pdf-visual` passed after the wrapper resolved the
  WinGet-installed Poppler path.
- `npm.cmd run dev:wysiwyg` was not launched during verification because it
  intentionally starts a long-running Next dev server.

### Add Flow-Row PDF Raster Visual Smoke

Goal: Add focused PDF visual protection for flow-row/flow-stack output while
keeping rasterization optional and environment-specific.

Completed:

- Added an opt-in PDF raster visual regression case for a three-stack
  `flow-row` with fixed gaps, distinct stack fills, and solid borders.
- The raster case checks fill pixels, border pixels, and gap pixels against the
  paginated geometry consumed by `PdfRenderer`.
- Kept the default suite independent of rasterizer availability; the new case
  runs only with `FLOWDOC_PDF_VISUAL_REGRESSION=1`.
- Updated fixture/test docs to record focused flow-row PDF raster coverage while
  keeping broad PDF/editor parity as a future visual regression area.

Files changed:

- `packages/core/src/renderer/__tests__/pdfVisualRegression.test.ts`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- The local machine has ImageMagick but no detected `pdftoppm` or Ghostscript,
  so the opt-in raster path itself was not run in this session. The default gate
  passed with the raster assertions skipped as designed.

### Tighten Flow-Row DOCX Layout Projection

Goal: Make DOCX export preserve the overall flow-row/flow-stack layout more
closely without treating DOCX as a pixel-perfect target.

Completed:

- Kept the authored model as `flow-row` / `flow-stack` and tightened only the
  DOCX renderer projection.
- Projected each `flow-row` slice to a fixed-layout Word table using paginated
  row width, stack column widths, and exact row slice height.
- Added empty fixed-width gap cells between flow-stack cells so DOCX preserves
  paginated inter-stack gaps instead of collapsing columns together.
- Set zero cell margins for unboxed flow-stacks so Word's default table padding
  does not shift stack content away from the editor/PDF geometry.
- Preserved existing flow-stack box shading, borders, and padding through table
  cell formatting.
- Added `flow-row-export-golden`, a product export fixture with multi-column
  flow-row content, gaps, styled flow-stack boxes, PDF page-count parity, DOCX
  fixed-layout projection, and marker de-duplication checks.
- Added renderer coverage that inspects DOCX XML for fixed table layout,
  exact row height, paginated column widths, and gap columns.
- Updated the export and flow-row/flow-stack docs to record the renderer-only
  table projection and the remaining DOCX exchange-format limitation.

Files changed:

- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `packages/core/src/renderer/__tests__/productExportGolden.test.ts`
- `docs/FLOW_ROW_STACK_SPEC.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/productExportGolden.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- DOCX still lets Word/LibreOffice own final text reflow. This slice improves
  overall table/column/box geometry only; hard line-break serialization remains
  intentionally deferred.

### Add Flow-Stack Box Styling

Goal: Give selected flow-stacks a real authored Box surface while keeping
flow-row styling deferred.

Completed:

- Added `flow-stack.props.box` using the existing paragraph box fill, padding,
  and border shape.
- Added a history-safe `updateFlowStackBoxStyle(...)` operation and routed the
  flow-stack Box property panel through it.
- Made flow-stack box padding and border participate in core measurement and
  pagination: horizontal insets reduce child paragraph width, and vertical
  insets contribute to stack slice height.
- Added fragment-level `boxRenderProps` so editor preview, PDF, and DOCX consume
  the same paginated metadata instead of recomputing document styling.
- Rendered flow-stack fill/borders in the editor canvas and PDF renderer.
- Mapped flow-stack boxes to DOCX layout-table cell shading, borders, and
  margins as best-effort exchange-format output.
- Moved flow-row and flow-stack `Min height` controls into their `Layout` tabs.
- Updated the flow-row/flow-stack roadmap/spec to record the focused
  flow-stack box decision while keeping flow-row box styling deferred.

Files changed:

- `packages/core/src/schema/block.ts`
- `packages/core/src/document/normalize.ts`
- `packages/core/src/document/operations.ts`
- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/flow.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/paragraphBoxPrimitives.ts`
- `packages/core/src/renderer/pdf/index.ts`
- `packages/core/src/renderer/docx/index.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- focused tests in core/app touched areas
- `docs/FLOW_ROW_STACK_SPEC.md`
- `docs/FLOW_ROW_STACK_ROADMAP.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -- packages/core/src/document/normalize.test.ts packages/core/src/document/operations.test.ts packages/core/src/layout/__tests__/flowRowStack.test.ts packages/core/src/pagination/__tests__/flowRowStack.test.ts packages/core/src/renderer/__tests__/renderer.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- Flow-row Box styling is intentionally not implemented in this slice.
- DOCX remains best-effort and uses table-cell formatting for flow-stack box
  output; PDF/editor continue to be the visual authority.

### Unify Right Rail Panel Layout

Goal: Make the Page, Outline, and Properties right-rail rooms use the same
header language and reduce the cramped nested spacing in paragraph box controls.

Completed:

- Added a shared right-rail panel header/shell helper.
- Routed Page, Outline, and Properties headers through the same height, padding,
  border, and uppercase visual treatment.
- Added right-rail drag resizing with a `260px` to `320px` visible range and a
  near-icon-rail drag collapse path that keeps the explicit collapse button.
- Kept the last visible right-rail width when collapsing so reopening returns to
  the user's chosen width.
- Kept the rail resize handle available while the rail is collapsed, allowing a
  direct drag-left gesture to reopen and resize the rail without pressing the
  explicit expand button.
- Added a hover affordance on the right-rail resize handle and moved drag-close
  to a half-width threshold so a small resize below `260px` stays visually
  pinned at `260px` instead of shrinking or closing the rail.
- Restyled the right-rail icon sidebar from bordered button chrome into
  bookmark-like markers with a left-to-right active gradient; when collapsed,
  the active marker moves to the expand control.
- Gave the active bookmark marker a small overhang into the content panel so it
  reads as a tab protruding from the right rail instead of a flat in-rail label.
- Restyled the document canvas scrollbar to the same thin, quieter scrollbar
  language used by the right rail and gave the canvas a little extra right
  gutter.
- Removed the outer paragraph Box wrapper border and padding so `Fill`,
  `Padding`, and `Border` use the available rail width directly.
- Changed the paragraph `Text` / `Box` switch from button-like controls to a
  non-sticky underline tab bar mounted directly under the Paragraph header.
- Removed the duplicate inner `Box` heading from the Box tab so Text and Box
  read as sibling paragraph inspector sections.
- Added matching `Layout` / `Box` tabs for `flow-row` and `flow-stack`
  properties: layout controls keep column/gap/resize behavior, while the
  current Box tab holds the existing minimum-height control only.
- Lightened right-rail scrollbars through the shared panel body style.
- Tightened paragraph box section/card spacing and compass controls without
  changing the authored paragraph box model or document operations.
- Stopped the editor-only paragraph chrome from painting behind authored
  paragraph boxes, so box fills and borders no longer look shorter than the
  surrounding paragraph block in the canvas.
- Mapped authored paragraph/table border styles into PDF line drawing options so
  dashed and dotted borders survive PDF export; DOCX style mapping was already
  present and is now covered by explicit assertions.
- Restyled Outline rows with compact row height, hover/selected chrome, and
  ellipsized labels.
- Added focused tests for the shared header, right-rail resize rules, and
  Outline panel structure.

Files changed:

- `src/app/editor/_components/RightRailPanel.tsx`
- `src/app/editor/_components/rightRailResize.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `src/app/editor/_components/OutlinePanel.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/__tests__/RightRailPanel.test.ts`
- `src/app/editor/_components/__tests__/rightRailResize.test.ts`
- `src/app/editor/_components/__tests__/OutlinePanel.test.ts`
- `src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `packages/core/src/renderer/pdf/index.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/rightRailResize.test.ts src/app/editor/_components/__tests__/RightRailPanel.test.ts src/app/editor/_components/__tests__/OutlinePanel.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- Browser inspection on `http://localhost:4000/editor`:
  - Page, Outline, and Paragraph headers all reported `min-height: 42px`,
    `padding: 0px 14px`, and a `1px` bottom border.
  - Paragraph Box controls reported no outer border and `padding: 0px`.
  - Boxed paragraph canvas markup reported transparent editor chrome behind the
    authored box and preserved the authored box fill/border geometry.
  - Renderer tests confirmed PDF border style options for solid, dashed, and
    dotted lines and DOCX `w:val` output for dashed and dotted paragraph
    borders.
  - Dragging the right rail expanded it from about `260px` to about `320px`.
  - Hovering the resize handle showed a visible drag affordance.
  - Dragging slightly below the visible minimum kept the rail visually pinned at
    `260px`, while dragging past the half-width close threshold reduced the rail
    to the icon strip and reopening restored the chosen expanded width.
  - A Playwright probe measured the hover handle style, shallow drag snapback to
    `260px`, half-width drag collapse to `36px`, and collapsed drag-open to
    `320px`.
  - A Playwright probe confirmed the active Page marker uses the gradient while
    open, and the active gradient moves to the expand control after collapse.
  - A Playwright probe confirmed the active bookmark overhang renders wider than
    the rail slot and keeps the same overhang on the expand control when
    collapsed.
  - With the rail collapsed, dragging the edge handle left reopened the rail to
    about `320px`.
  - The paragraph `Text` / `Box` switch stayed as an underline active tab with
    thin right-rail scrollbar styling.
  - The Paragraph `Text` / `Box` tab bar reported no `position: sticky` and no
    negative margin after being moved outside the scroll body.
  - The Paragraph Box tab no longer rendered a second inner `Box` heading before
    the Fill, Padding, and Border controls.
  - Flow-row and flow-stack Properties panels rendered matching `Layout` /
    `Box` tabs; browser inspection confirmed `Layout` contains column/gap or
    resize controls and `Box` contains only `Min height (pt)`.
  - The document canvas reported thin scrollbar styling and the added right
    gutter.
  - Page, Outline, and Paragraph Box right-rail screenshots were inspected.
- `git diff --check`

Notes:

- This is right-rail layout/chrome only. It does not change document schema,
  pagination, undo/redo, export behavior, WYSIWYG editing, or paragraph box
  authored semantics.
- Broader visual tuning of individual Box controls can continue as a separate
  UX slice if the rail still feels too dense after use.

### Make Row/Columns Flow-Backed Authoring

Goal: Let the product-facing Row/Columns tools use the newer
`flow-row`/`flow-stack` engine while preserving legacy `row`/`stack` documents.

Completed:

- Removed the separate `Flow cols` palette item.
- Kept `Row` and `Columns` as the visible authoring language.
- Mapped new `Row` palette insertion to a one-stack `flow-row`.
- Mapped new `Columns` palette insertion to a two-stack `flow-row`.
- Kept the legacy `flow-columns` palette source as an internal compatibility
  alias.
- Updated placement-law source classification so new Row/Columns palette drags
  are treated as flow-backed row sources, not legacy row expansion requests.
- Changed body-level horizontal paragraph wrapping to create
  `flow-row`/`flow-stack` columns.
- Preserved direct legacy-stack wrap behavior so explicit old operations inside
  legacy stacks still create old `row`/`stack` nodes.
- Updated visible editor labels so flow-backed rows/stacks display as
  `Row`/`Stack` in the property header, selection path, outline, and canvas
  chrome.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `packages/core/src/placement/law.ts`
- `packages/core/src/placement/law.test.ts`
- `src/app/editor/_components/EditorPalette.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/OutlinePanel.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/selectionContext.ts`
- `src/app/editor/_components/__tests__/EditorPalette.test.ts`
- `src/app/editor/_components/__tests__/OutlinePanel.test.ts`
- `src/app/editor/_components/__tests__/selectionContext.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -w packages/core -- src/document/operations.test.ts src/placement/law.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorPalette.test.ts src/app/editor/_components/__tests__/OutlinePanel.test.ts src/app/editor/_components/__tests__/selectionContext.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd run test:core`
- Browser inspection on `http://localhost:4000/editor` confirmed the palette
  shows `Row` and `Columns`, no longer shows `Flow cols`, and selecting a
  flow-backed stack displays the property header as `Stack`.
- `git diff --check`

Notes:

- This is an authoring and visible-label migration only. It intentionally does
  not remove legacy `row`/`stack` from schema, assertions, pagination, or
  existing documents.
- Header/footer roots still rely on legacy `stack` semantics.
- Automatic migration of existing legacy rows remains a separate explicit
  command/workflow.

### Bump Self-Use Baseline To 0.5.2

Goal: Mark the accepted right-rail, paragraph box border export, and
flow-backed Row/Columns authoring work as the next conservative `0.5.x` patch
baseline.

Completed:

- Bumped the project version marker from `0.5.1` to `0.5.2`.
- Updated the lockfile root package version to match.
- Updated versioning docs so the current baseline points at `0.5.2`.

Verification:

- `npm.cmd version 0.5.2 --no-git-tag-version`
- `npm.cmd pkg get version`

Notes:

- This remains a `0.5.x` self-use patch baseline, not a `0.6.0` milestone and
  not a `v1` readiness claim.

### Add Paragraph Box Editor Preview Rendering

Goal: Make the editor canvas display authored paragraph box fill and borders
from paginated metadata before exposing any property-panel controls.

Completed:

- Added shared paragraph box layout primitives in pagination coordinates.
- Updated the PDF renderer helper to consume the shared primitive logic and
  only adapt coordinates for PDF's bottom-left origin.
- Added editor canvas rendering for paragraph box fill and four border sides.
- Kept authored paragraph box drawing separate from selection/hover/editor node
  chrome so selected boxes still show an editor outline.
- Added focused editor tests for fill/border rendering and split-fragment
  top/bottom-open policy.

Files changed:

- `packages/core/src/pagination/paragraphBoxPrimitives.ts`
- `packages/core/src/pagination/index.ts`
- `packages/core/src/renderer/pdf/index.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run test -w packages/core --`
- `npm.cmd run test:app`
- `npm.cmd run type-check`

Notes:

- This intentionally does not add property-panel controls for paragraph box
  fill, padding, or border yet.
- This intentionally does not change the document schema, normalization,
  pagination semantics, PDF output intent, or DOCX output intent from the
  already-approved paragraph box foundation.

---

### Add Paragraph Box PDF Visual Regression Gate

Goal: Add the first two layers of paragraph box PDF visual protection without
making the default test suite depend on machine-specific PDF rasterizers.

Completed:

- Added an opt-in PDF raster visual regression test for paragraph box fill and
  four border sides.
- Kept the test off by default behind `FLOWDOC_PDF_VISUAL_REGRESSION=1`.
- Let the raster test use `pdftoppm` when available, or ImageMagick only when
  Ghostscript is also available.
- Sampled rasterized PDF pixels against the paginated drawing primitives so the
  test checks actual PDF output without adding new npm dependencies.
- Documented the rasterizer requirement and updated renderer/test fixture
  coverage notes.

Files changed:

- `packages/core/src/renderer/__tests__/pdfVisualRegression.test.ts`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/PARAGRAPH_BOX_STYLE_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/pdfVisualRegression.test.ts`
- `$env:FLOWDOC_PDF_VISUAL_REGRESSION='1'; npm.cmd run test -w packages/core -- src/renderer/__tests__/pdfVisualRegression.test.ts`
  - expected local failure: this machine has no `pdftoppm` and no Ghostscript
    for ImageMagick PDF input.
- `npm.cmd run test -w packages/core --`
- `npm.cmd run test:app`

Notes:

- This does not claim broad PDF/editor pixel parity yet.
- The actual raster assertion should run in CI or reviewer machines only after
  installing `pdftoppm` or ImageMagick with Ghostscript.

---

### Add Paragraph Box Export Renderer Support

Goal: Make export renderers consume paragraph box metadata from
`PaginatedDocument` without adding property-panel controls or editor UI yet.

Completed:

- Added PDF paragraph box drawing from `fragment.renderProps.box`.
- Kept PDF fill inside the paragraph box rect, excluding external
  `spacingBefore` and `spacingAfter`.
- Applied paragraph box split policy in PDF: side borders on every slice, top
  border only on the first fragment, bottom border only on the final fragment.
- Added DOCX best-effort paragraph shading, borders, and border spacing for
  paragraph box fill, border, and padding.
- Kept renderers consuming `PaginatedDocument` only; no schema, measurement, or
  pagination imports were added to renderer production code.
- Added focused renderer tests for PDF primitive geometry, split box borders,
  boxed PDF smoke, and DOCX XML shading/border output.

Files changed:

- `packages/core/src/renderer/pdf/index.ts`
- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd test -w packages/core -- src/renderer/__tests__/textFlow.test.ts`
- `npm.cmd test -w packages/core -- src/renderer/__tests__/multiSection.test.ts`
- `npm.cmd test -w packages/core -- src/pagination/__tests__/paginator.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This intentionally does not add editor canvas preview rendering yet.
- This intentionally does not add property-panel controls yet.
- DOCX padding remains best-effort through Word paragraph border spacing.

---

## 2026-05-15

### Define Paragraph Box Style Contract

Goal: Lock the v1 paragraph box-style scope before changing schema,
pagination, editor rendering, PDF export, or DOCX export.

Completed:

- Added a paragraph box style contract that limits v1 to fill, four-sided
  padding, and four-sided border.
- Explicitly deferred rounded corners, shadows, opacity, gradients, image
  fills, and CSS-like decoration.
- Defined spacing-vs-padding semantics, horizontal measurement rules, total
  height rules, and split paragraph first/middle/final fragment behavior.
- Documented renderer expectations: PDF/editor must follow authoritative
  paginated geometry, while DOCX remains best-effort for paragraph padding.
- Added the contract to the docs index and linked it from editor and export
  contracts.

Files changed:

- `docs/PARAGRAPH_BOX_STYLE_CONTRACT.md`
- `docs/DOCS_INDEX.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no automated tests required.

Notes:

- This intentionally does not change `DocumentNode`, pagination, editor
  rendering, PDF rendering, DOCX rendering, or property-panel controls yet.

---

### Add Paragraph Box Schema And Normalization

Goal: Add the authored document-model entry point for paragraph box style
without changing layout, editor rendering, export, or property-panel behavior.

Completed:

- Added paragraph box schema support for fill, four-sided padding, and
  four-sided border.
- Kept rounded corners, shadows, opacity, gradients, and CSS-like decoration
  out of the schema.
- Added non-negative unit guards for paragraph box padding and border widths.
- Normalized valid paragraph box style data while safely removing or repairing
  unsafe imported values.
- Added focused normalization coverage for valid box props and unsafe raw input.

Files changed:

- `packages/core/src/schema/block.ts`
- `packages/core/src/document/normalize.ts`
- `packages/core/src/document/normalize.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -w packages/core -- src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This intentionally does not change paragraph measurement, pagination
  metadata, editor preview rendering, PDF rendering, DOCX rendering, or
  property-panel controls yet.
- User-facing controls should remain hidden until the box style has layout,
  editor, PDF, and DOCX coverage as defined in
  `docs/PARAGRAPH_BOX_STYLE_CONTRACT.md`.

---

### Add Paragraph Box Layout And Pagination Geometry

Goal: Make paragraph box style affect core measurement and paginated geometry
before exposing editor controls or renderer drawing behavior.

Completed:

- Added measured paragraph box metadata for fill, padding, border, content
  width, and total height.
- Measured paragraph lines against the inner content width after horizontal
  padding and border are removed.
- Shifted paginated line x/y positions into the paragraph content box.
- Applied top padding/border only on the first paragraph fragment and bottom
  padding/border only on the final fragment.
- Passed resolved box metadata through `ParagraphRenderProps` for future
  editor/PDF/DOCX renderer work.
- Added focused layout and pagination tests for measurement width, split
  fragment insets, and render metadata.

Files changed:

- `packages/core/src/layout/types.ts`
- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/__tests__/measure.test.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/paginator.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -w packages/core -- src/layout/__tests__/measure.test.ts`
- `npm.cmd test -w packages/core -- src/pagination/__tests__/paginator.test.ts`
- `npm.cmd test -w packages/core -- src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This intentionally does not draw paragraph fill or border in the editor/PDF
  renderer yet.
- This intentionally does not expose paragraph box property-panel controls yet.

---

### Add Paragraph Box Core Operation

Goal: Provide a small history-safe document operation for future paragraph box
controls without requiring UI code to hand-merge nested box state.

Completed:

- Added `updateParagraphBoxStyle(...)` for fill, four-sided padding, and
  four-sided border updates.
- Supported body paragraphs and paragraphs inside table cells.
- Preserved paragraph text/content while updating only `props.box`.
- Pruned empty box state after fill, padding, and border channels are cleared.
- Removed ineffective border sides when style is `none` or width resolves to
  zero.
- Added focused operation coverage for body paragraphs, table-cell paragraphs,
  partial patch merging, and clearing all box channels.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd test -w packages/core -- src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This intentionally does not add property-panel controls yet.
- Editor code can still use the generic `UPDATE_PROPS` path, but future UI
  should prefer this operation to avoid losing nested padding/border state.

---

### Add Balanced Flow Row Column Action

Goal: Make the `flow-row` property-panel column action behave like a row-level
operation instead of silently splitting the last column.

Completed:

- Changed row-level `addFlowStackColumn(doc, rowId)` to append one empty
  `flow-stack` and rebalance all direct child stack `widthShare` values equally.
- Preserved selected-`flow-stack` before/after insertion as the local action
  that splits only the selected stack's width share.
- Updated the row property-panel button to `+ Balanced col`.
- Updated the row column hint to explain the difference between balanced
  row-level add and selected-stack edge insertion.
- Added core regression coverage for `20 / 60 / 20 -> 25 / 25 / 25 / 25`.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/FLOW_ROW_STACK_SPEC.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This intentionally changes only the row-selected action. Stack edge buttons
  remain the precise before/after local insertion path.

---

### Keep Empty Flow Stack Chrome Visible

Goal: Prevent active `flow-row` slices from showing row-blue blank areas where
empty authored `flow-stack` columns should remain visible and droppable.

Completed:

- Updated flow-row pagination so every emitted row slice includes a visual
  `flow-stack` fragment for each authored direct child stack.
- Kept paragraph/spacer child fragments limited to stacks that actually have
  content progress in that slice.
- Added regression coverage for a four-column row with content in only one
  stack.
- Strengthened the long three-stack pagination check so every visible row slice
  carries all authored stack chrome.
- Documented the visual-stack-fragment rule in the flow-row/flow-stack spec.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/flowRowStack.test.ts`
- `docs/FLOW_ROW_STACK_SPEC.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -w packages/core -- src/pagination/__tests__/flowRowStack.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This changes visual/layout fragments only. It does not add paragraph/spacer
  content to empty stacks and should not create extra empty row continuation
  slices because the row loop still runs only while some stack has remaining
  content.

---

### Add Property Panel Info Hints

Goal: Reduce right-panel hint clutter while keeping editor constraints
discoverable near the controls they affect.

Completed:

- Added a reusable `InfoHint` button for compact explanatory help.
- Rendered the hint bubble in the document body with fixed positioning so the
  property-panel scroll container cannot clip it.
- Removed the native browser `title` tooltip from the `InfoHint` button so the
  custom tooltip is the only hover surface.
- Moved repeated property-panel rule text into `InfoHint` for row min height,
  flow-row column/min-height behavior, legacy stack resize status, flow-stack
  column insertion, flow-stack pair resize, and flow-stack width/min-height
  constraints.
- Kept primary labels, current values, buttons, and destructive actions visible.
- Documented when property-panel help may use compact hints.

Files changed:

- `src/app/editor/_components/InfoHint.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/__tests__/InfoHint.test.ts`
- `src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/InfoHint.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- The row-level `+ Col` behavior still uses the current implementation text.
  Balanced row add remains a separate design/implementation task.

---

### Add Flow Stack Pair Resize Guard

Goal: Let users adjust `flow-stack` width shares from the property panel while
keeping the authored `flow-row` width total valid and preventing columns from
collapsing during the interaction.

Completed:

- Added a focused `flowStackResize` helper for pairwise share math.
- Set the preferred `flow-stack` resize minimum to `8%` per column.
- Added an adaptive effective minimum for already narrow pairs so existing
  narrow documents remain adjustable instead of becoming stuck.
- Added a selected-`flow-stack` property-panel resize control where the user
  chooses the left or right neighbor, then adjusts only that selected pair.
- Reused the existing `RESIZE_COLUMNS` reducer action so the resize path stays
  history-backed and schema-valid.
- Documented that property-panel pair resize is the current safe path; canvas
  drag resize for `flow-row` / `flow-stack` remains deferred.

Files changed:

- `src/app/editor/_components/flowStackResize.ts`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/flowStackResize.test.ts`
- `src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/flowStackResize.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts src/app/editor/_components/__tests__/selectionContext.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts src/app/editor/_components/__tests__/flowStackResize.test.ts src/app/editor/_components/__tests__/selectionContext.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- In-app browser smoke on `http://localhost:4000/editor`: dragged `Flow cols`
  onto the canvas, selected the left `flow-stack`, confirmed the resize control
  shows `min 8%`, and used `+ 1%` to update the pair from `50/50` to `51/49`.

Notes:

- The minimum is an interaction guard, not a content-aware minimum width.
- The resize operation changes only the selected sibling pair and relies on the
  existing document assertion that `flow-row` widths total exactly `100`.
- Broader manual feel check is still recommended for slider dragging and
  narrow-column edge cases.

---

### Add Property Panel Selection Context Picker

Goal: Let users quickly inspect and switch between the node they clicked and
its local parents from the right-side property panel without replacing the
document outline or changing document/layout semantics.

Completed:

- Added a small `path` trigger beside the property-panel title when the selected
  node has visible local context.
- Added a popover-style context list ordered from topmost parent to deepest
  clicked node, such as `Flow row -> Flow stack -> Paragraph`.
- Kept the context anchored to the latest selected/clicked node so users can
  switch to a parent panel without losing the original local context.
- Added a shared selection-context helper that can describe flow, row/stack,
  and existing table parent chains while hiding `body`.
- Selecting a normal inline-edit paragraph now also selects that paragraph so
  the property panel can expose its local context while preserving the existing
  inline-edit start path.
- Moved flow-stack add-column affordances out of the canvas and into the right
  property panel as a center-column control with left/right edge buttons.

Files changed:

- `src/app/editor/_components/selectionContext.ts`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/selectionContext.test.ts`
- `src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/selectionContext.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts src/app/editor/_components/__tests__/selectionContext.test.ts`
- `npm.cmd run type-check`

Notes:

- This is a local-context picker, not a replacement for `OUTLINE`.
- Browser/manual check still needed for click feel and popover placement.
- Canvas-side add-column handles are intentionally removed; column insertion now
  lives in the property panel.

---

### Add Flow Row Column Control

Goal: Let users add a new `flow-stack` column to an existing `flow-row` without
changing old `row` / `stack` semantics or introducing a new layout path.

Completed:

- Added `addFlowStackColumn(...)` as a core document operation.
- When adding after a selected `flow-stack`, the operation splits that stack's
  `widthShare` and leaves other sibling columns unchanged.
- When adding from a selected `flow-row`, the operation adds after the last
  stack by splitting the last stack's `widthShare`.
- Added property-panel controls for `flow-row` and `flow-stack` selections.
- Added selected-`flow-stack` property-panel edge controls for inserting a
  column before or after the selected stack.
- Extended the core operation to support both before/after insertion while
  still splitting only the target stack's `widthShare`.
- Added focused operation tests for adding after a selected stack and adding
  from the row-level control.
- Added property-panel coverage for the selected-stack column edge controls.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `src/app/editor/_components/PropertyPanel.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/exportReadiness.test.ts src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `git diff --check`

Notes:

- Resize remains the existing pairwise drag behavior; no new reorder, span, or
  nested-flow behavior was added.
- Top/bottom add-row handles, drag-to-add-column, and keyboard path remain
  deferred UX levels for later slices.
- Manual browser check still needed for the property-panel button feel; the
  local dev server could not be started cleanly from this sandbox session.

---

### Stabilize Editor Toolbar Status Slot

Goal: Reduce visible toolbar flicker/jump when layout, export, document IO, and
drag status messages appear or disappear quickly.

Completed:

- Added a fixed status region on the right side of the editor toolbar.
- Kept status messages single-line with overflow/ellipsis inside the reserved
  slot instead of letting them push the toolbar layout.
- Moved the drag helper text into the same status slot so drag feedback uses
  the stabilized area.
- Removed transient toolbar messages for autosave time, initial layout,
  reconciling layout, and preview layout to avoid short-lived visual flashes.
- Suppressed the export-readiness toolbar text for transient server-layout
  pending states while still showing non-transient export blockers.
- Did not change document state, pagination, save/load, export rules, or
  undo/redo behavior.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `git diff --check`

Notes:

- Manual check still needed: confirm the status slot reduces the perceived
  flicker during flow-row typing/dragging on the real editor canvas.

---

### Flow Row Persistence And Snapshot Verification

Goal: Lock focused evidence that authored `flow-row` / `flow-stack` content can
survive package persistence and core insert/delete snapshots without flattening
or moving column content.

Completed:

- Added a localStorage round-trip regression test for a two-stack `flow-row`
  with multiple paragraphs in both columns.
- Verified that package v2 persistence keeps `body -> flow-row -> flow-stack`
  topology, `widthShare`, child order, and paragraph text intact after reload.
- Added a core operation snapshot test that inserts into the second
  `flow-stack`, then deletes the inserted paragraph while preserving sibling
  stack topology.

Files changed:

- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- `EditorShell` undo/redo evidence remains code-inspection/manual-browser
  scope for this slice: reducer history stores `{ doc, paginated }` snapshots,
  but no reducer export or broad app harness was added just to test it.
- Browser smoke was not re-run in this slice.

---

### Flow Row Placement Targeting

Goal: Make `flow-row` column hit-testing route paragraph drops into the intended
`flow-stack` instead of falling back to a body-level placement below the row.

Completed:

- Extended placement geometry so `flow-row` uses row-like column hit-testing and
  computes column rectangles from `flow-stack.widthShare`.
- Updated placement law so `row-stack-inner` can target `flow-stack` centers for
  paragraph/spacer insertion while keeping `flow-row` edge column insertion
  explicitly unsupported.
- Updated the editor drop highlight to draw against the actual targeted
  `flow-stack` column when the semantic target is `row-stack-inner`.
- Added focused regression coverage for right-column `flow-stack` targeting and
  second-stack paragraph insertion.

Files changed:

- `packages/core/src/placement/geometry.ts`
- `packages/core/src/placement/law.ts`
- `packages/core/src/placement/geometry.test.ts`
- `packages/core/src/placement/law.test.ts`
- `packages/core/src/document/operations.test.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -w packages/core -- src/placement/geometry.test.ts src/placement/law.test.ts src/document/operations.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `git diff --check`

Notes:

- User manual feedback confirmed left/right `flow-stack` placement, insertion
  between existing paragraphs, and post-drop typing behavior are broadly OK.
- Follow-up polish patch: separated drop-preview color from selection blue,
  softened `flow-row` / `flow-stack` backgrounds, and made paragraphs inside
  `flow-stack` use container-tight visual chrome so they do not appear to
  protrude beyond the aligned stack area.
- Follow-up polish adjustment: center drops into a row/flow stack now preview as
  a compact insertion line after the last visible child instead of a large ghost
  block across the remaining empty stack area.
- Browser smoke remains not verified in this session because the in-app browser
  rendered a black/empty page and the project smoke script could not attach to
  the existing dev server.

---

### Flow Stack Phase C-C-B Responsive Draft Snapshot

Goal: Keep split `flow-stack` draft pagination close to key-repeat input so
downstream layout has a chance to update while the key is still held, without
adding a separate local cross-page layout preview.

Completed:

- Added a WYSIWYG draft-pagination source helper that prefers the latest
  synchronous draft snapshot over the React session ref when pagination fires.
- Stored the latest draft text/caret snapshot immediately in
  `handleWysiwygTextDraftChange`, before React state/effects need to catch up.
- Updated the responsive draft pagination timer to paginate from that latest
  snapshot and reschedule if a newer snapshot arrives during pagination.
- Kept the existing authoritative draft-pagination path; no document schema,
  undo/redo, export, or custom cross-page local preview behavior changed.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/editorPageFollow.test.ts`
- `npm.cmd run type-check`

Notes:

- Manual follow-up: in an already split `flow-stack` paragraph with another node
  below, hold Backspace and confirm the downstream node reflows during the key
  repeat rather than only after key release.
- User manual feedback after this patch: downstream nodes still waited until key
  release, so stale draft source alone was not the root cause.

Follow-up:

- Added a frame-based responsive pagination pump for the same C-C-B goal:
  responsive `flow-stack` draft pagination now uses `requestAnimationFrame`
  when available instead of relying only on a short timer.
- Added coverage for choosing the frame path only for responsive pagination and
  keeping normal settled pagination on timers.
- Re-ran verification after the frame pump:
  - `npm.cmd test -- src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/editorPageFollow.test.ts`
  - `npm.cmd run type-check`
  - `git diff --check`
- Added core evidence after the user clarified the failing node is a body
  paragraph outside the `flow-row`: core pagination already pulls following body
  blocks upward when a split `flow-row` shrinks.
  - `packages/core/src/pagination/__tests__/flowRowStack.test.ts`
  - `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowRowStack.test.ts`
- Current review read: the remaining C-C-B failure is in the live editor
  update/render path, not in core pagination. The next patch should either add
  focused editor-path diagnostics or make a tightly scoped responsive
  draft-pagination paint policy; do not change the `flow-row` pagination model
  for this symptom without new evidence.
- Follow-up patch: keep the responsive `flow-stack` draft-pagination marker
  active once a split/re-entered split edit has entered that path, even if the
  latest draft pagination temporarily shrinks the edited paragraph back to one
  fragment. This avoids dropping back to the 450ms settled delay while body
  siblings below the `flow-row` may still need cross-page draft pagination.

---

### Flow Stack Phase C-C-A Caret Page Follow

Goal: When responsive draft pagination moves the active `flow-stack` edit
fragment to another page, intentionally follow that page without reintroducing
the edit-entry focus jump.

Completed:

- Added small page-follow helpers for:
  - detecting a real active edit page transition;
  - resolving the rendered page key from `PaginatedDocument`;
  - scrolling the target page with nearest alignment and an older-browser
    fallback.
- Updated `EditorShell` so WYSIWYG draft pagination and caret-page relocation
  request a viewport follow only when the edit session already had a previous
  page and then moves to a different page.
- Kept first edit entry/click behavior out of this auto-follow path so C-B's
  no-forced-focus-scroll behavior remains intact.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/editorPageFollow.ts`
- `src/app/editor/_components/__tests__/editorPageFollow.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/editorPageFollow.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`

Notes:

- Manual follow-up: type in a `flow-stack` paragraph until the caret moves to a
  continuation page; the editor should follow the target page. Clicking into an
  already visible paragraph should still avoid the old focus jump.
- C-C-B remains open: already split `flow-stack` deletion with other downstream
  nodes below should be reviewed separately to ensure those nodes move during
  key-repeat, not only after key release.

---

### Flow Stack Phase C-B Focus Scroll Guard

Goal: Reduce the edit-entry viewport jump for `flow-stack` WYSIWYG editing
without weakening active caret/page tracking during cross-page typing.

Completed:

- Added a small focus helper that focuses the hidden text-engine bridge and
  legacy textarea with `preventScroll: true`, with a fallback for browsers that
  do not accept focus options.
- Routed the WYSIWYG text-engine edit-entry, pointer-placement, word-selection,
  and legacy textarea focus paths through the helper.
- Added focused unit coverage for the helper so future edits keep the
  no-forced-scroll behavior.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `npm.cmd run type-check`

Notes:

- This intentionally does not remove active fragment/page tracking. Typing at a
  page boundary should still follow the caret and keep the continuation
  responsive.
- Manual follow-up: click into an already visible `flow-stack` line should no
  longer jump just because the editor focuses its bridge input; typing across a
  page boundary should still move/follow the active caret.

---

### Flow Stack Phase C-A Re-Entered Split Draft Pagination

Goal: Keep a `flow-stack` paragraph that already spans multiple page slices on
the responsive draft-pagination path after the user exits edit mode and
re-enters the paragraph.

Completed:

- Added a focused helper for deciding when a `flow-stack` paragraph should use
  responsive draft pagination:
  - active first page-boundary handoff still qualifies;
  - re-entered already split `flow-stack` paragraphs qualify based on the
    current paginated fragment count;
  - non-`flow-stack` split paragraphs are not promoted into this path.
- Updated the WYSIWYG draft-change handler to use the helper so typing or
  deletion in a re-entered split `flow-stack` paragraph schedules draft
  pagination even when the previous `wysiwygDraftPaginationNodeId` marker was
  cleared on edit exit.
- Updated the cross-page behavior contract to distinguish this C-A responsive
  draft-pagination path from full live cross-page caret/selection behavior.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts`
- `npm.cmd run type-check`
- User manual smoke:
  - re-entered split `flow-stack` paragraph accepted typing/deletion;
  - draft changes visibly pushed/reflowed the continuation while edit was still
    active;
  - commit/blur final layout was stable with no reported missing or duplicated
    text.

Notes:

- This is not a full Phase C implementation. Cross-page caret/selection polish
  and adaptive long-document performance remain follow-up work.
- UX follow-up: active draft pagination can move the editing viewport/page
  aggressively toward the active fragment. Prefer preventing focus-induced
  scroll or preserving viewport position before removing page tracking entirely.

---

### Flow Stack Phase B Scope Lock Tests

Goal: Lock the remaining Phase B `flow-stack` WYSIWYG behavior without
claiming full live cross-page editing.

Completed:

- Added coverage for same-page `flow-stack` shrink after inline deletion so the
  edited paragraph, owning `flow-row`, sibling `flow-stack` fragments, later
  stack children, and following body fragments all move together.
- Added coverage that `flow-stack` same-page line-count changes may opt into the
  local height patch path while still queuing settled pagination.
- Added coverage that draft preview documents can update paragraph text inside a
  `flow-stack` without mutating the authored source document.
- Added coverage that committing a WYSIWYG draft inside a `flow-stack` updates
  only the paragraph text, preserves the `flow-row` / `flow-stack` tree, records
  one history entry, and clears redo state.
- Updated the cross-page behavior contract to describe same-page growth and
  shrink as Phase B behavior while keeping full live cross-page editing deferred.

Files changed:

- `src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts`
- `npm.cmd test -- src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPersistence.test.ts`
- `npm.cmd run type-check`
- `git diff --check` (passed with line-ending warnings only)
- User manual smoke with WYSIWYG flags enabled:
  - flow-row/flow-stack placement passed;
  - same-page typing growth passed;
  - same-page deletion shrink passed;
  - page-boundary handoff passed with screenshot evidence;
  - commit/blur and edit re-entry within the same page passed.

Notes:

- This is a Phase B test/contract lock. Already-split live `flow-stack`
  typing/deletion remains Phase C.
- Manual smoke pass does not include already-split live editing in continuation
  slices; that remains Phase C.

---

### Flow Stack Page-Boundary Draft Pagination Handoff

Goal: Reduce the visible pause when a flagged WYSIWYG edit inside a
`flow-stack` paragraph reaches the page boundary, without claiming full live
cross-page editing.

Completed:

- Added a shared `isParagraphInsideFlowStack(...)` helper for editor text-engine
  decisions.
- Kept same-page `flow-stack` height preview behavior on the local preview path.
- Routed `flow-stack` hard page-boundary edits to a short draft-pagination
  delay so core pagination can create the next `flow-row` / `flow-stack` slice.
- Kept an already pending responsive `flow-stack` draft-pagination timer alive
  during key-repeat deletion so shrink-back cannot be starved until key release.
- Kept non-`flow-stack` draft pagination on the existing settling delay.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/wysiwygTextEligibility.ts`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts`
- `npm.cmd test -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- Browser reload smoke on `http://localhost:4000/editor`; WYSIWYG text engine
  flag was `true` and no console warnings/errors were observed.

Notes:

- This remains a Phase B handoff. It does not implement full live cross-page
  `flow-stack` caret/selection behavior.

---

### Flow Stack Same-Page Live Reflow Preview

Goal: Make the first `flow-row` / `flow-stack` authoring path feel responsive
while typing without changing core pagination or claiming full live cross-page
WYSIWYG support.

Completed:

- Allowed WYSIWYG text-engine hard-local reflow inside `flow-stack` paragraphs
  to patch same-page paragraph height while still queuing settled pagination.
- Extended inline edit height preview to recognize
  `paragraph -> flow-stack -> flow-row` parent chains.
- Kept sibling `flow-stack` fragments aligned to the edited `flow-row` slice
  height during same-page preview growth.
- Shifted later fragments inside the edited `flow-stack` and blocks below the
  `flow-row` by the local preview delta.

Files changed:

- `src/app/editor/_components/inlineEditHeightPreview.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- Browser reload smoke on `http://localhost:4000/editor`; no console warnings or
  errors observed after reload.

Notes:

- This is the A-phase same-page preview patch only. Page-boundary handoff and
  full live cross-page `flow-stack` editing remain separate follow-ups.

---

### Flow Row / Flow Stack 0.5.0 Acceptance

Goal: Complete the static `flow-row` / `flow-stack` milestone review and bump
the project release marker to `0.5.0`.

Completed:

- Recorded a PASS/RISK/UNKNOWN acceptance review for the static milestone.
- Bumped the root project version marker from `0.4.0` to `0.5.0`.
- Kept persisted package/document schema versions unchanged.
- Added a version consistency test so `package.json` and `package-lock.json`
  cannot drift silently.
- Documented that browser/manual smoke, sibling-safe resize controls,
  add-flow-stack controls, and DOCX exact visual fidelity remain `0.5.x`
  follow-up work.

Files changed:

- `package.json`
- `package-lock.json`
- `docs/FLOW_ROW_STACK_ACCEPTANCE_REVIEW.md`
- `docs/FLOW_ROW_STACK_ROADMAP.md`
- `docs/VERSIONING.md`
- `docs/DOCS_INDEX.md`
- `docs/WORK_LOG.md`
- `src/app/__tests__/projectVersion.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core --`
- `npm.cmd test -- src/app/__tests__/projectVersion.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`

Notes:

- This is a release-readiness marker only. It does not change persisted
  `packageVersion`, `document.version`, or production WYSIWYG defaults.

---

### Flow Row / Flow Stack 0.5.0 Design Draft

Goal: Record the decision to keep existing `row` / `stack` atomic while planning
a parallel `flow-row` / `flow-stack` primitive for long-form cross-page
row/column layout.

Completed:

- Added a draft design/spec for `flow-row` / `flow-stack` as the planned `0.5.0`
  milestone.
- Updated version semantics so `0.5.0` maps to static flow-row/flow-stack
  fragmentation rather than a generic stability bump.
- Linked the new design from the docs index and cross-page behavior contract.
- Kept this as design documentation only; no schema, pagination, renderer, or
  editor behavior changed.

Files changed:

- `docs/FLOW_ROW_STACK_SPEC.md`
- `docs/VERSIONING.md`
- `docs/DOCS_INDEX.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; not run.

Notes:

- Implementation should begin with schema and core pagination tests before any
  editor live-edit behavior.

---

## 2026-05-14

### WYSIWYG Server Trial Config Reminder

Goal: Record the local/self-use WYSIWYG flag lesson and prevent a future staging
or server trial from silently exercising the legacy textarea path.

Completed:

- Added a production-gate reminder that local/manual WYSIWYG parity evidence must
  first confirm `data-wysiwyg-text-engine-enabled="true"`.
- Documented that a staging/server trial must set the public WYSIWYG flags before
  the client bundle is built.
- Kept this as documentation only; no deploy tooling or default-on behavior was
  added because the editor is still in self-use/experimental validation.

Files changed:

- `docs/WYSIWYG_PRODUCTION_GATE.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; not run.

Notes:

- Future production acknowledgement still requires the release checklist in
  `docs/WYSIWYG_PRODUCTION_GATE.md`.

---

### Persist Active WYSIWYG Drafts Before Local Reload

Goal: Prevent a localStorage reload or browser close from reopening the previous
committed paragraph text while an active WYSIWYG text draft was still visible in
the editor.

Completed:

- Added a persistable WYSIWYG draft helper that applies the active draft text to
  a normalized document snapshot without storing computed layout geometry.
- Updated editor autosave to save that draft-aware snapshot while a WYSIWYG text
  session is active.
- Added `pagehide` and hidden-visibility flush handling so closing/reloading the
  page writes the latest active draft to localStorage before the next open.
- Kept undo/redo and document state unchanged during active typing; this only
  affects the persisted snapshot used after reload.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/wysiwygDraftPersistence.ts`
- `src/app/editor/_components/__tests__/wysiwygDraftPersistence.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygDraftPersistence.test.ts src/app/editor/_components/__tests__/editorTextMeasurerState.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/fontMeasurerParity.test.ts src/app/editor/_components/__tests__/editorTextMeasurerState.test.ts src/app/editor/_components/__tests__/wysiwygDraftPersistence.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts`

Notes:

- Browser smoke with a separate WYSIWYG-enabled dev server could not run while
  the existing Next dev server for this repo was active; Next blocked the second
  dev server. Do not kill the user's running server automatically.

---

### Guard WYSIWYG Edit-Enter From Draft Layout Recalculation

Goal: Prevent a plain click into WYSIWYG text edit mode from recalculating and
patching paragraph lines before the user has actually changed the draft text.

Completed:

- Added an explicit draft-change check so the WYSIWYG text engine keeps the
  existing `fragment.lines` on edit enter.
- Deferred local draft layout measurement until `draftText` differs from the
  current document text.
- Added a focused helper test for the edit-enter/no-change case.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPersistence.test.ts`

Notes:

- Local browser inspection of `http://localhost:4000/editor` reported
  `data-wysiwyg-text-engine-enabled="false"`, so that running dev server was
  still using the legacy textarea edit path. Restart the dev server with
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1` before manually validating this
  path.

---

### Note Deferred Page-Boundary Live Preview Polish

Goal: Preserve the user's page-boundary UX observation without changing
pagination behavior immediately.

Completed:

- Added a deferred polish note for active WYSIWYG page-boundary typing.
- Captured the distinction between current settled-layout correctness and
  preferred live-typing feel:
  - current live preview mirrors settled widow/orphan splitting and can pull one
    already-visible line down when the draft first crosses a page boundary;
  - preferred active typing should move only newly overflowing lines, then
    reconcile to settled widow/orphan pagination after debounce, blur, or edit
    exit.
- Kept this classified as UX polish/RISK rather than a blocker.

Files changed:

- `docs/WYSIWYG_PARITY_PLAN.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only note; no tests run.

Notes:

- Do not change this behavior without a focused page-boundary preview design,
  because the previous widow/orphan alignment fixed edit/re-enter drift.

---

### WYSIWYG Re-Enter User-Like Variants And Split Preview Fix

Goal: Match the user's reported reproduction more closely by typing through
keyboard events until text wraps naturally, then exiting, re-entering, and
inserting a new line.

Completed:

- Extended `scripts/wysiwyg-reenter-drift-probe.mjs` from one baseline flow to
  three independent variants:
  - `page-boundary-bulk-keyboard-type`
  - `gradual-word-wrap-then-line-insert`
  - `repeated-key-wrap-then-line-insert`
- The two user-like variants reload the fixture, type through keyboard events
  until a new line appears by wrapping, exit edit, re-enter edit, press Enter,
  and insert a new line at the clicked caret.
- The new variants reproduced the drift before the fix:
  - `second edit draft vs post second exit` failed.
  - live draft preview split the first fragment at `lineEnd=9`.
  - post-exit pagination split the first fragment at `lineEnd=8`.
- Patched `splitWysiwygDraftVisualFragments(...)` so WYSIWYG draft preview
  applies the same widow/orphan split behavior as paragraph pagination instead
  of greedily leaving a single line on the following page.
- Updated `wysiwygDraftVisualPreview.test.ts` to lock the widow-prevention
  split expectation.
- Reduced the default probe output to readable per-fragment summaries and added
  `REENTER_VERBOSE=1` for full line text/geometry snapshots.
- Filtered favicon-only local app 404 noise in the re-enter probe while still
  failing on active console, page, or resource errors.
- Updated `docs/WYSIWYG_REENTER_DRIFT_PROBE.md` and
  `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md` with the new evidence.

Files changed:

- `scripts/wysiwyg-reenter-drift-probe.mjs`
- `src/app/editor/_components/wysiwygDraftVisualPreview.ts`
- `src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts`
- `docs/WYSIWYG_REENTER_DRIFT_PROBE.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`

Verification:

- `node --check scripts/wysiwyg-reenter-drift-probe.mjs` PASS.
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts`
  PASS: 5/5.
- `npm.cmd run smoke:wysiwyg-reenter` PASS on bundled Chromium:
  - variants passing: 3/3.
  - comparisons passing: 12/12.
  - gradual word variant: 8 → 9 lines on natural wrap, then 1 → 2 fragments
    after re-enter line insertion.
  - repeated-key variant: 50 `A` key presses produced 8 → 9 lines, then
    1 → 2 fragments after re-enter line insertion.
- `npm.cmd run smoke:wysiwyg-stage4c` PASS on bundled Chromium.
- `$env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-reenter`
  PASS on installed Chrome:
  - variants passing: 3/3.
  - comparisons passing: 12/12.
- `$env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-reenter`
  PASS on installed Edge:
  - variants passing: 3/3.
  - comparisons passing: 12/12.
- `npm.cmd run review:browser` PASS on bundled Chromium: editor smoke passed
  and Stage 4C smoke returned `ok: true`.
- `npm.cmd run review:gate` PASS: type-check, core 344/344, app 251/251,
  build OK.

Notes / follow-ups:

- One parallel `review:gate` attempt overlapped with a smoke dev-server
  shutdown and temporarily saw missing `.next/dev/types` files. A serial rerun
  passed. Keep browser smoke and `review:gate` sequential when using generated
  Next dev types.
- Manual human review is still needed for perceived typing rhythm and real
  Windows Thai IME candidate-window behavior.

---

### WYSIWYG Thai Repeat Re-Enter Screenshot Follow-Up

Goal: Recheck the user's captured screenshot flow: start from a normal
paragraph, hold repeated Thai keys until wrapping occurs, exit edit, re-enter,
then insert another Thai run.

Completed:

- Confirmed the originally active `localhost:4000` server had
  `data-wysiwyg-text-engine-enabled="false"` and mounted the legacy `textarea`
  path with `data-inline-edit-fallback-reason="wysiwyg-disabled"`.
- Stopped the stale unflagged PID 36660 after owner approval.
- Reproduced the same flow on a flagged text-engine server with a
  localStorage-backed default paragraph and confirmed equivalent edit/show
  snapshots matched:
  - show vs first edit entry.
  - first edit draft vs post first exit.
  - post first exit vs second edit entry.
  - second edit draft vs post second exit.
- Added `scripts/wysiwyg-thai-repeat-reenter-probe.mjs` and
  `npm.cmd run smoke:wysiwyg-thai-repeat` so this screenshot class is now a
  repeatable browser smoke.
- Documented that `data-wysiwyg-text-engine-enabled="false"` means the app is
  still on the legacy textarea path and should not be treated as WYSIWYG parity
  evidence.

Files changed:

- `scripts/wysiwyg-thai-repeat-reenter-probe.mjs`
- `package.json`
- `docs/WYSIWYG_REENTER_DRIFT_PROBE.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`

Verification:

- `node --check scripts/wysiwyg-thai-repeat-reenter-probe.mjs` PASS.
- `npm.cmd run smoke:wysiwyg-thai-repeat` PASS on bundled Chromium:
  - first repeated Thai run: 245 characters, 1 → 3 lines.
  - second repeated Thai run after re-enter: 45 characters, ending at 4 lines.
  - comparisons passing: 4/4.
- `$env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-thai-repeat`
  PASS on installed Chrome: comparisons passing 4/4.
- `$env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-thai-repeat`
  PASS on installed Edge: comparisons passing 4/4.
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-thai-repeat`
  PASS against the flagged dev server left running for manual review.

Notes / follow-ups:

- This does not flip the product/default WYSIWYG flag. The legacy textarea path
  remains a known non-parity fallback unless the text engine is enabled.
- Real Windows Thai IME candidate-window behavior remains a manual gate.

---

### WYSIWYG Re-Enter Drift Probe And Browser Smoke Unblock

Goal: Restore the flagged WYSIWYG browser smoke gate and add a focused probe
for the user-reported edit/show re-entry layout drift class.

Completed:

- Stopped the stale unflagged Next dev server that was blocking smoke scripts
  from starting their own flagged server.
- Re-ran `smoke:wysiwyg-stage4c` successfully on bundled Chromium.
- Added `scripts/wysiwyg-reenter-drift-probe.mjs` and
  `npm.cmd run smoke:wysiwyg-reenter`.
- The new probe opens the Stage 3 page-boundary scenario, enters edit, records
  SVG line snapshots, types a long payload that must split the target
  paragraph across pages, exits edit, re-enters, continues typing, exits again,
  and compares equivalent edit/show line text and geometry.
- Added `docs/WYSIWYG_REENTER_DRIFT_PROBE.md` and linked it from
  `docs/DOCS_INDEX.md`.
- Updated `docs/WYSIWYG_SMOOTHNESS_PROBE.md` to point the known
  edit-reenter symptom to the dedicated probe instead of leaving it as a
  next-session TODO.
- Updated `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md` with the current Stage 4C
  smoke and re-enter probe evidence.

Files changed:

- `scripts/wysiwyg-reenter-drift-probe.mjs` (new)
- `package.json`
- `docs/WYSIWYG_REENTER_DRIFT_PROBE.md` (new)
- `docs/DOCS_INDEX.md`
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run smoke:wysiwyg-stage4c` PASS on bundled Chromium:
  clipboard/IME/selection/stack smoke returned `ok: true`.
- `node --check scripts/wysiwyg-reenter-drift-probe.mjs` PASS.
- `npm.cmd run smoke:wysiwyg-reenter` PASS on bundled Chromium:
  - first insert forced the target paragraph from 1 fragment / 8 lines to
    2 fragments / 13 lines.
  - second insert ended at 2 fragments / 16 lines.
  - all 4 equivalent edit/show/re-enter line-geometry comparisons matched.
  - console errors: 0; page errors: 0.

Notes / follow-ups:

- The standard Stage 3 page-boundary fixture does not currently reproduce the
  reported re-enter drift. This is useful evidence, but not a global closure.
  If a real user document still drifts, reuse the probe harness with a fixture
  matching that document's paragraph width, font size, Thai/Latin mix,
  whitespace, and page position.
- Chrome and Edge channel runs for the new re-enter probe remain pending.

---

### WYSIWYG Parity Review Follow-Up — Cache, Fallback, And Whitespace Claims

Goal: Close the four review gaps found in the WYSIWYG edit/show parity
recheck without changing the document schema, pagination semantics, or the
accepted current line-edge whitespace policy.

Completed:

- Removed the embedded NUL-byte cache separator from
  `browserFontkitMeasurer.ts` and replaced it with a structured cache key.
- Changed browser fontkit setup failure to return `null`, so `EditorShell`
  keeps the existing canvas measurer fallback instead of silently swapping to
  heuristic default measurement.
- Updated `fontMeasurerParity.test.ts` for the new null-return contract and
  kept exact server/browser fontkit width and line-height parity coverage.
- Added measured-line assertions to `whitespaceParity.test.ts` documenting
  the current visual policy: interior spaces render, while line-leading,
  line-trailing, and wrap-boundary spaces remain authored text but are not
  rendered as line-edge glyphs.
- Downgraded Phase B visual edge-space claims in
  `WYSIWYG_WHITESPACE_MATRIX.md` and `WYSIWYG_PARITY_PLAN.md` from PASS to
  RISK until a product/layout decision explicitly accepts or changes that
  behavior.
- Corrected the Phase A claim from "100 sampled strings" to representative
  mixed Latin/Thai/whitespace parity coverage.

Files changed:

- `src/app/editor/_components/browserFontkitMeasurer.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/fontMeasurerParity.test.ts`
- `src/app/editor/_components/__tests__/whitespaceParity.test.ts`
- `docs/WYSIWYG_WHITESPACE_MATRIX.md`
- `docs/WYSIWYG_PARITY_PLAN.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/fontMeasurerParity.test.ts src/app/editor/_components/__tests__/whitespaceParity.test.ts`
  PASS: 2 files, 19 tests.
- `npm.cmd run type-check` PASS.
- `npm.cmd run test:core` PASS: 344/344.
- `npm.cmd run test:app` PASS: 251/251.
- `npm.cmd run review:build` PASS.
- `npm.cmd run review:gate` PASS: type-check, core 344/344, app 251/251,
  build OK.
- `git diff --check` PASS; PowerShell only reported existing LF/CRLF warnings.

Notes / follow-ups:

- `npm.cmd run smoke:wysiwyg-stage4c` could not start its flagged dev server
  because Next reported an existing dev server for this repo at
  `http://localhost:4000` (PID 60488). Running the smoke against that existing
  server also failed because `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE` was not
  enabled there. This remains UNKNOWN for this follow-up until the active
  server is stopped or restarted with the required flags.
- Rows 3-5 are now intentionally documented as visual RISK, not fixed. Closing
  them requires a product/layout decision and coordinated renderer/pagination
  tests.

---

### WYSIWYG Parity Phase C — Smoothness Probe Baseline

Goal: Convert the "page-boundary typing smoothness" RISK item in the Stage 4
review packet from a subjective manual check into an objective, repeatable
measurement, and document the symptom categories the probe does and does not
cover so user-reported feel issues can be triaged.

Completed:

- Added `scripts/wysiwyg-smoothness-probe.mjs`:
  - Reuses the Stage 3 boundary scenario and the existing dev-server bring-up
    pattern from `wysiwyg-stage4c-smoke.mjs`.
  - Starts a flagged Next dev server with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1`.
  - Types a controlled burst (default 400 chars @ 30ms intervals), captures
    per-keystroke paint latency via a double `requestAnimationFrame` proxy,
    and reads `window.__flowDocWysiwygPerfEvents` for FlowDoc-side timings.
  - Outputs a JSON report with paint-latency percentiles, perf-event counts
    by kind, frame-budget breaches, jank counts, and a page-boundary
    crossing indicator.
- Added `npm.cmd run smoke:wysiwyg-smoothness` to `package.json`.
- Authored `docs/WYSIWYG_SMOOTHNESS_PROBE.md`:
  - Documents how to run the probe (default, headed, custom burst).
  - Explains every metric and its threshold.
  - Adds a **Symptom Categories** table that lists exactly which user-felt
    symptoms the probe surfaces objectively and which symptoms it does not
    cover. Symptoms in the "Not Covered" column require separate gates
    (caret offset assertions, DOM mutation tests, real IME matrix, headed
    visual review, cold-start probe, etc.).
  - Defines the Phase C smoothness decision gate.
- Captured the first baseline on bundled Chromium (Phase A+B landed):
  - `ok: true`, page-boundary crossed (1 → 2 fragments).
  - paint p50/p95/p99/max = 24.5 / 32.5 / 33.5 / 36.5 ms.
  - `browser-preview-pagination` count during the burst = 0
    (immediate-input lane stays light through a page-boundary crossing).
  - jank count = 0; over-frame-budget count = 0; longest perf event = 0.2ms.

Files changed:

- `scripts/wysiwyg-smoothness-probe.mjs` (new)
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md` (new, includes baseline JSON)
- `package.json` (new `smoke:wysiwyg-smoothness` script)
- `docs/DOCS_INDEX.md` (link added)

Verification:

- `npm.cmd run smoke:wysiwyg-smoothness` PASS on bundled Chromium with the
  baseline numbers above.
- No console errors, no page errors during a 400-char burst that crosses
  a page boundary.

Notes / follow-ups:

- The probe is intentionally narrow — it covers the measurable subset of
  smoothness. The "Not Covered" table in `WYSIWYG_SMOOTHNESS_PROBE.md`
  enumerates the symptoms that still need separate gates. User-reported
  feel issues should be matched against that table before being treated as
  smoothness regressions.
- **Open symptom captured in this session** — edit-reenter layout drift:
  the line wrap point inside the active paragraph shifts between the first
  and second edit session, even after a long idle wait (so it is not a
  font-load race). The smoothness probe does not catch this because it
  types a single burst. Full triage notes and the recommended next-session
  probe live in `docs/WYSIWYG_SMOOTHNESS_PROBE.md` under "Known Open
  Symptom — Edit-Reenter Layout Drift".
- `perfEvents.total` is capped at 200 by the existing `MAX_WYSIWYG_PERF_EVENTS`
  ring buffer in `wysiwygPerformance.ts`; a 400-char burst reports 200 events
  by design.
- Real Chrome / Edge channel runs and human headed review still pending —
  Phase C requires both before the smoothness gate can flip to PASS.
- Thai IME real-OS matrix remains a separate manual gate.

---

### WYSIWYG Parity Phase B — Whitespace Verification Matrix

Goal: Codify the whitespace contract for the WYSIWYG text engine, decide and
implement the Tab character behavior, and lock the rules with automated
coverage.

Completed:

- Audited the whitespace path end-to-end:
  - `packages/core/src/layout/word-breaker.ts:12-26` confirms space runs are
    preserved as their own segments by both the `Intl.Segmenter` and the
    `/\s+|\S+/g` fallback.
  - `src/app/editor/_components/wysiwygTextCommit.ts:56` passes input text
    straight to `updateParagraphText` with no trim/collapse.
  - `src/app/editor/_components/useWysiwygTextSession.ts:181-183` is the
    single normalization choke point on input.
- Owner decision: Tab characters convert to 3 spaces on input. Rationale,
  alternatives, and revisit path are recorded in
  `docs/WYSIWYG_WHITESPACE_MATRIX.md` under "Decision Record".
- Added `WYSIWYG_TAB_REPLACEMENT = "   "` (3 spaces) to
  `useWysiwygTextSession.ts` and extended `normalizeWysiwygPlainTextInput`
  with `.replace(/\t/g, WYSIWYG_TAB_REPLACEMENT)`. The change keeps a single
  normalization point so every text ingress (clipboard paste, beforeinput,
  IME end) applies the same rule.
- Authored `docs/WYSIWYG_WHITESPACE_MATRIX.md`:
  - 12 numbered rows mirroring `docs/WYSIWYG_PARITY_PLAN.md` Phase B
  - explicit "Preserve 1:1 (Word-like)" top-line rule
  - Tab decision record and revisit path
  - out-of-scope notes for whitespace visualization UI, keyboard Tab key,
    and exotic whitespace codepoints
- Added `src/app/editor/_components/__tests__/whitespaceParity.test.ts`:
  - one assertion per matrix row (round-trip through
    `normalizeWysiwygPlainTextInput` and `updateParagraphText`)
  - two composition checks: a complex mixed whitespace pattern, and Tab +
    CRLF normalized together
- Linked the matrix doc from `docs/DOCS_INDEX.md` source-of-truth map.

Files changed:

- `src/app/editor/_components/useWysiwygTextSession.ts` (Tab normalization)
- `src/app/editor/_components/__tests__/whitespaceParity.test.ts` (new)
- `docs/WYSIWYG_WHITESPACE_MATRIX.md` (new)
- `docs/WYSIWYG_PARITY_PLAN.md` (Phase B checklist ticked, header marked
  COMPLETE)
- `docs/DOCS_INDEX.md` (link added)

Verification:

- `npm.cmd run type-check` PASS
- `npm.cmd run review:gate` PASS:
  - core tests: 344/344 (unchanged)
  - app tests: 249/249 (was 235; the 14 new whitespace rows are the delta)
  - `review:build` PASS
- Focused run of `whitespaceParity.test.ts` 14/14 PASS

Notes / follow-ups:

- Keyboard Tab key inside the active edit session still uses the browser
  default (move focus). The decision record documents this as accepted; revisit
  only if user feedback requests in-paragraph Tab insertion via the keyboard.
- Non-breaking space, zero-width space, and other exotic whitespace are
  preserved by default but not separately tested. Add a matrix row if a
  regression is observed.
- Phase B is complete; Phase C (close Stage 4 residual RISK — page-boundary
  smoothness, real Thai IME, table-cell decision) is the next scheduled step.

---

### WYSIWYG Parity Phase A — Browser Fontkit Measurer

Goal: Unify text measurement between editor preview (browser) and server
pagination by porting fontkit to the browser side, matching
`src/app/api/runtimeFont.ts` and `packages/core/src/layout/font-measurer.ts`
exactly.

Completed:

- Added `src/app/editor/_components/browserFontkitMeasurer.ts`:
  - `loadBrowserFontBuffer(url?)` fetches `/fonts/THSarabun.ttf` and returns
    a `Uint8Array`; safe on environments without `fetch`.
  - `createBrowserFontkitMeasurer(buffer)` dynamically imports
    `@pdf-lib/fontkit`, wraps via `Buffer.from(...)` when a polyfill is
    available (else passes the raw `Uint8Array`), and returns a `TextMeasurer`
    that calls `font.layout(text)` exactly like the server.
  - Caches widths per `(fontSize, text)` up to 8000 entries to absorb the
    measurer-per-keystroke load that the layout pipeline issues during draft
    typing.
  - Falls back to `defaultTextMeasurer` when the buffer is missing or the
    fontkit dynamic import throws, so the editor never blocks on font load.
- Wired into `src/app/editor/_components/EditorShell.tsx`:
  - Converted `editorTextMeasurer` from `useMemo` to `useState` so it can be
    swapped after async font load.
  - Initial value is `createBrowserTextMeasurer()` (existing canvas fallback)
    so first paint never waits on `fetch`.
  - A `useEffect` loads the font buffer, builds the fontkit measurer, swaps
    it in, and bumps the pre-existing `fontReadyVersion` to trigger the
    debounced re-pagination path that already keys on that value.
- Added `src/app/editor/_components/__tests__/fontMeasurerParity.test.ts`:
  - Asserts browser and server fontkit measurers return numerically identical
    widths for representative Thai, Latin, mixed, and whitespace strings
    across font sizes 10–18pt.
  - Asserts identical line heights across common font sizes and ratios.
  - Asserts null-buffer fallback returns a finite default measurer width.

Files changed:

- `src/app/editor/_components/browserFontkitMeasurer.ts` (new)
- `src/app/editor/_components/__tests__/fontMeasurerParity.test.ts` (new)
- `src/app/editor/_components/EditorShell.tsx`
- `docs/WYSIWYG_PARITY_PLAN.md` (Phase A checklist ticked)

Verification:

- `npm.cmd run type-check` PASS
- `npm.cmd run review:gate` PASS:
  - core tests: 344/344 (unchanged)
  - app tests: 235/235 (was 232; the three new parity rows are the delta)
  - `review:build` PASS — production build succeeded with the new measurer
    bundled into the editor route
- `fontMeasurerParity.test.ts` 3/3 PASS — widths match the server fontkit
  measurer exactly for every case
- `npm.cmd run smoke:wysiwyg-stage4c` PASS on bundled Chromium:
  - 0 console errors, 0 resource errors (font fetch healthy)
  - performance trace: 0 browser-preview paginations in the immediate input
    lane, 1 draft update — keypress lane stays light with the fontkit
    measurer active
  - clipboard, CRLF normalization, cut, cross-page pointer drag, double-click
    selection, IME composition (`IME4Cทดสอบ`), and row-stack paragraph all
    behave as before
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md` PASS list updated with the new
  measurer evidence

Notes / follow-ups:

- `realFontDrift.test.ts` still covers the legacy canvas-vs-fontkit drift
  (≤0.05pt). It is intentionally not retired in this phase — the new test
  covers the new path; the old test still documents legacy canvas behavior
  that ships as the pre-font-load fallback. Decide whether to retire it
  during Phase D once the default flips.
- `smoke:wysiwyg-stage4c` PASS run in this session (see Verification above).
- Stage 4 review packet PASS list updated with the new measurer evidence.
- Phase A is complete; Phase B (whitespace verification matrix) is the next
  scheduled step per `docs/WYSIWYG_PARITY_PLAN.md`.

---

### WYSIWYG Edit/Show Parity Plan Drafted

Goal: Capture an end-to-end plan for closing edit/show visual parity in the
WYSIWYG path, sized for multi-session and multi-agent handoff.

Completed:

- Reviewed `WYSIWYG_TEXT_ENGINE_PLAN.md`, `WYSIWYG_EDITOR_ROADMAP.md`,
  `EDITOR_UX_CONTRACT.md`, `WYSIWYG_PRODUCTION_GATE.md`, and the Stage 4
  review packet.
- Inspected `src/app/editor/_components/browserTextMeasurer.ts`,
  `src/app/api/runtimeFont.ts`, `wysiwygDraftVisualPreview.ts`, and
  `EditorCanvas.tsx` to confirm the measurer divergence (Canvas vs fontkit)
  is the primary parity gap; line-wrap algorithm is already shared via
  `measureParagraph` in core.
- Confirmed whitespace is preserved 1:1 by design in
  `packages/core/src/layout/types.ts` and not mutated in
  `wysiwygTextCommit.ts` or `useWysiwygTextSession.ts`.
- Drafted `docs/WYSIWYG_PARITY_PLAN.md` covering four phases:
  - Phase A: unify text measurement by porting fontkit to the browser
  - Phase B: whitespace verification matrix (12 rows)
  - Phase C: close Stage 4 residual RISK (page-boundary smoothness, real
    Thai IME, table-cell decision)
  - Phase D: default enablement and rollback plan
- Each phase carries an explicit scope, out-of-scope, design notes, gates,
  risks, and a handoff checklist suited for multi-agent execution.
- Added the plan to `docs/DOCS_INDEX.md` source-of-truth map and the
  WYSIWYG task reading list.

Files changed:

- `docs/WYSIWYG_PARITY_PLAN.md` (new)
- `docs/DOCS_INDEX.md`
- `docs/WORK_LOG.md`

Verification:

- Draft document only; no code changes.
- No tests run; no gates required for a planning artifact.

Notes:

- Plan status is "Draft — pending owner approval". Implementation is
  intentionally not started.
- Whitespace policy confirmed with product owner as "Preserve 1:1
  (Word-like)" prior to drafting; Tab character behavior is flagged as an
  open decision gate inside Phase B.
- Expect Phase A to bundle ~400KB additional editor-route weight from
  lazy-loaded fontkit; rollback path remains the existing canvas measurer.

---

### P0R5 Browser Smoke Carry-Over

Goal: Close the Round 5 carry-over around browser smoke reproducibility and
reviewer/CI clarity before starting P1 report primitives.

Completed:

- Added a shared `scripts/smoke-browser.mjs` launcher used by both browser
  smoke scripts.
- Kept bundled Chromium as the default and preserved `SMOKE_BROWSER_CHANNEL`
  and `SMOKE_EXECUTABLE_PATH` support.
- Wrapped missing bundled Playwright Chromium launch errors with
  FlowDoc-specific guidance:
  `npx playwright install chromium`,
  `SMOKE_EXECUTABLE_PATH=/path/to/chrome npm run review:browser`, or
  `SMOKE_BROWSER_CHANNEL=chrome npm run review:browser`.
- Added `review:browser:install` for CI/review machines that want to install
  bundled Chromium and immediately run the browser gate.
- Added `review:gate:full` so a single non-browser command checks the review
  archive manifest and then runs `review:gate`.
- Updated browser smoke, test strategy, agent workflow, and review packet docs
  to clarify that `review:gate` and `review:browser` are separate gates and
  that `npm ci` does not guarantee Playwright browser binaries.

Files changed:

- `package.json`
- `scripts/smoke-browser.mjs`
- `scripts/editor-smoke.mjs`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `scripts/create-review-archive.mjs`
- `docs/AGENT_WORKFLOW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `node --check scripts/smoke-browser.mjs`
- `node --check scripts/editor-smoke.mjs`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `node --check scripts/create-review-archive.mjs`
- `node --check scripts/review-browser.mjs`
- simulated missing bundled Chromium with `PLAYWRIGHT_BROWSERS_PATH` pointing
  at an empty path; the launcher printed the FlowDoc-specific install/system
  browser guidance.
- `npm.cmd run review:gate:full`
  - archive check passed: 195 files would be included.
  - core tests passed: 28 files / 344 tests.
  - app tests passed: 25 files / 232 tests.
  - `review:build` passed.
- `npm.cmd run review:browser`
  - editor smoke and Stage 4C smoke passed on bundled Chromium.
- `$env:SMOKE_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'; npm.cmd run review:browser`
  - editor smoke and Stage 4C smoke passed on system Chrome executable path.

Notes:

- `review:browser:install` was added for CI/reviewer convenience but was not run
  in this session because bundled Chromium was already available.
- No P1 report primitive work was started in this carry-over patch.

## 2026-05-13

### P0R4 Review Round 4 Exit Hardening

Goal: Close the remaining P0 exit blockers from Round 4 before starting any
P1 or P0-003+ work.

Completed:

- Moved layout-warning collection into shared core pagination code and made
  `/api/export` fail closed with `LAYOUT_WARNINGS_BLOCKED` for server
  pagination warnings such as forced table split overflow.
- Changed editor export readiness to use server layout warnings after the
  current `previewDoc` has reconciled through `/api/paginate`, while keeping
  optimistic preview warnings only as a pre-reconcile signal.
- Added a reproducible `review:build` wrapper and wired `review:gate` to run
  standalone type-check, full tests, and that build path from archived sources.
- Extended review archive checks to require the build/browser smoke scripts.
- Made browser smoke scripts default to bundled Chromium while also supporting
  `SMOKE_BROWSER_CHANNEL` or `SMOKE_EXECUTABLE_PATH` for installed/system
  Chromium-family browsers.
- Updated export/editor/test/browser/archive contracts and coverage snapshots.

Files changed:

- `package.json`
- `next.config.ts`
- `scripts/review-build.mjs`
- `scripts/create-review-archive.mjs`
- `scripts/editor-smoke.mjs`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `packages/core/src/pagination/warnings.ts`
- `packages/core/src/pagination/index.ts`
- `src/app/api/export/route.ts`
- `src/app/api/__tests__/exportPaginate.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/exportReadiness.ts`
- `src/app/editor/_components/__tests__/exportReadiness.test.ts`
- `docs/AGENT_WORKFLOW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `node --check scripts/editor-smoke.mjs`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `node --check scripts/review-build.mjs`
- `node --check scripts/create-review-archive.mjs`
- `npm.cmd run test:app -- src/app/api/__tests__/exportPaginate.test.ts src/app/editor/_components/__tests__/exportReadiness.test.ts`
  - 2 files / 24 tests passed.
- `npm.cmd run type-check`
- `npm.cmd run review:build`
- `npm.cmd run review:gate`
  - core tests passed: 28 files / 344 tests.
  - app tests passed: 25 files / 232 tests.
  - `review:build` passed.
- `npm.cmd run review:browser`
  - editor smoke and Stage 4C smoke passed on bundled Chromium.
- `$env:SMOKE_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'; npm.cmd run review:browser`
  - editor smoke and Stage 4C smoke passed on system Chrome executable path.
- `npm.cmd run review:archive -- --check`
  - 194 files would be included, including `public/fonts/THSarabun.ttf`.

Notes:

- This round intentionally did not start P0-003+ or P1 feature work.
- System Chrome surfaced a favicon-only 404 console message in editor smoke; the
  smoke now ignores only the favicon 404 while keeping unexpected resource and
  console errors blocking.

### P0R3 Review Round 3 Hardening

Goal: Close the Round 3 reproducibility and user-trust gaps before starting
P1 report features.

Completed:

- Hardened `scripts/create-review-archive.mjs` so `--check` validates required
  root/package/config/script/public/source/doc paths and rejects generated/cache
  paths such as `node_modules`, `.next`, `.vite`, and test result caches.
- Made `npm.cmd run review:archive` create `flowdoc-review-archive.zip` and
  verify the ZIP entries after writing.
- Extended `comparePagination` to compare body, header, and footer zones; text
  drift now includes `paragraph` and `toc` fragments, and geometry drift now
  includes `row`, `stack`, `table`, `table-row`, `table-cell`, `toc`, and
  `spacer` fragments with zone metadata.
- Surfaced layout fragment warnings through `collectLayoutFragmentWarnings`,
  toolbar status, and export readiness. `forced-table-split-overflow` now blocks
  final export instead of remaining test-only metadata.
- Added a final forced-slice regression for the last remaining-line edge to
  protect contiguous line accounting after forced slice height adjustment.
- Added a P0 user-report browser smoke path that loads a saved company report
  package, switches to Fill mode, verifies header/footer visibility and safe
  export readiness, downloads PDF, and checks the PDF page count.
- Updated active contracts and coverage snapshots.

Files changed:

- `package.json`
- `scripts/create-review-archive.mjs`
- `scripts/editor-smoke.mjs`
- `src/app/editor/_components/comparePagination.ts`
- `src/app/editor/_components/exportReadiness.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/comparePagination.test.ts`
- `src/app/editor/_components/__tests__/exportReadiness.test.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/AGENT_WORKFLOW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- generated review artifact: `flowdoc-review-archive.zip`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/comparePagination.test.ts src/app/editor/_components/__tests__/exportReadiness.test.ts`
  - 2 files / 32 tests passed.
- `npm.cmd run test:core -- src/pagination/__tests__/tablePagination.test.ts`
  - 1 file / 43 tests passed.
- `npm.cmd run smoke:editor`
  - editor smoke passed, including the user-report package PDF export path.
- `npm.cmd run review:archive`
  - created `flowdoc-review-archive.zip` with 192 files and verified ZIP
    entries after writing.
- `npm.cmd run review:archive -- --check`
  - 192 files would be included, including `public/fonts/THSarabun.ttf`.
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 28 files / 344 tests.
  - app tests passed: 25 files / 227 tests.
  - production build passed.
- `npm.cmd run review:browser`
  - editor smoke passed.
  - WYSIWYG Stage 4C smoke passed on bundled Chromium.

Notes:

- This still does not start P1 report primitives such as lists, images,
  captions, inline style runs, or header/footer authoring UX.
- `/api/export` still accepts a bound document; package-aware final export
  validation remains P1 unless the API product scope requires it sooner.

### P0R2 Review Round 2 Hardening

Goal: Close the second P0 review gaps without starting P1 report features.

Completed:

- Added review archive reproducibility through `npm run review:archive`, with
  `--check` coverage for root package/config files, `scripts/`,
  `public/fonts/THSarabun.ttf`, `src/`, `packages/`, and `docs/`.
- Kept `public/fonts/THSarabun.ttf` as the runtime font source of truth and
  added a guard that any legacy `src/fonts/THSarabun.ttf` copy must be absent or
  byte-identical.
- Made `/api/export` fail closed with code `FONT_FALLBACK_BLOCKED` when the
  default runtime font is missing. `/api/paginate` still exposes fallback state
  because it is a layout-check endpoint, not a final artifact endpoint.
- Tightened export readiness so final export blocks on page-break drift,
  continuation drift, line-count drift, split-boundary drift, tracked geometry
  drift, runtime font fallback, and missing required Fill-mode values.
- Promoted user report fixture assertions to the production measurement stack:
  `fontkit + public/fonts/THSarabun.ttf + thaiWordBreaker`.
- Added `forced-table-split-overflow` fragment warnings and forced-slice height
  adjustment for table no-progress fallback slices.
- Extended browser smoke to verify `/fonts/THSarabun.ttf` is reachable.

Files changed:

- `package.json`
- `scripts/create-review-archive.mjs`
- `scripts/editor-smoke.mjs`
- `src/app/api/export/route.ts`
- `src/app/api/__tests__/exportPaginate.test.ts`
- `src/app/api/__tests__/runtimeFont.test.ts`
- `src/app/editor/_components/exportReadiness.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/exportReadiness.test.ts`
- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `packages/core/src/pagination/__tests__/userReportFixtures.test.ts`
- `docs/AGENT_WORKFLOW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/api/__tests__/runtimeFont.test.ts src/app/api/__tests__/exportPaginate.test.ts src/app/editor/_components/__tests__/exportReadiness.test.ts`
  - 3 files / 18 tests passed.
- `npm.cmd run test:core -- src/pagination/__tests__/userReportFixtures.test.ts src/pagination/__tests__/tablePagination.test.ts`
  - 2 files / 55 tests passed.
- `npm.cmd run test:core -- src/renderer/__tests__/userReportExport.test.ts`
  - 1 file / 4 tests passed.
- `npm.cmd run test:app`
  - 25 files / 221 tests passed.
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 28 files / 343 tests.
  - app tests passed: 25 files / 221 tests.
  - production build passed.
- `npm.cmd run review:browser`
  - editor smoke passed.
  - WYSIWYG Stage 4C smoke passed on bundled Chromium.
- `npm.cmd run review:archive -- --check`
  - 192 files would be included, including `public/fonts/THSarabun.ttf`.
- `git diff --check`
  - no whitespace errors; only Windows CRLF conversion warnings.

Notes:

- This does not add P1 report features such as lists, images, captions, inline
  style runs, or header/footer authoring UX.
- Strict drift blocking may reject more exports, intentionally favoring
  preview/PDF trust for P0.
- Missing required values remain data-snapshot warnings for draft/readiness
  display, but final Fill-mode export now treats them as blockers.

### P0-007 User-Level Report Fixture Suite

Goal: Add representative saved report packages that protect product-facing
company, government, and university report workflows across pagination, PDF
export, and at least one editor import/export path.

Completed:

- Added `USER_REPORT_FIXTURES` as saved `FlowDocPackage v2` fixtures for:
  - `company-report`: cover, scalar fieldRefs, data snapshot, header/footer,
    page numbers, and a multi-page KPI table.
  - `government-report`: cover, TOC, formal Thai body, `keepWithNext` heading,
    bordered table, and restarted footer page numbers.
  - `university-report`: cover, TOC, body page restart, long Thai continuation,
    and footer page numbers.
- Added pagination fixture tests covering package shape, exact section/page
  counts, TOC entries, footer page-number text, long-body continuation, and
  multi-page table row counts.
- Added PDF export tests for every user report fixture using the runtime
  `public/fonts/THSarabun.ttf`; missing font now fails this fixture gate.
- Added an app-level import/data-bind/export path for the company report package
  through `parsePersistedDocument`, `bindDocumentWithSnapshot`, and `/api/export`.
- Updated fixture/product/test strategy docs so the user-level fixtures are
  discoverable.

Files changed:

- `packages/core/src/fixtures/userReportFixtures.ts`
- `packages/core/src/pagination/__tests__/userReportFixtures.test.ts`
- `packages/core/src/renderer/__tests__/userReportExport.test.ts`
- `src/app/api/__tests__/userReportImportExport.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:core -- src/pagination/__tests__/userReportFixtures.test.ts src/renderer/__tests__/userReportExport.test.ts`
  - 2 files / 11 tests passed.
- `npm.cmd run test:app -- src/app/api/__tests__/userReportImportExport.test.ts`
  - 1 file / 1 test passed.
- `npm.cmd run type-check`
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 28 files / 337 tests.
  - app tests passed: 25 files / 214 tests.
  - production build passed.
- `npm.cmd run review:browser`
  - editor smoke passed.
  - WYSIWYG Stage 4C smoke passed on bundled Chromium.

Notes:

- The fixtures avoid claiming unsupported image/list/indent behavior. Those
  remain P1+ report-product work.
- The app path test binds scalar data before export, matching the current
  FlowDocPackage v2 and Fill-mode data contract without changing persistence
  semantics.

### P0-006 WYSIWYG Production Gate

Goal: Keep the FlowDoc-owned WYSIWYG text engine experimental and feature-gated
until manual Thai IME, page-boundary smoothness, and fallback gates pass.

Completed:

- Hardened `resolveWysiwygTextEngineEnabled` so production builds require both
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE` and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE_PRODUCTION_ACK`.
- Kept development/test verification behavior intact: the normal text-engine
  flag still enables the experimental lane for smoke and focused testing.
- Added focused config coverage proving production does not enable the text
  engine with only the rollout flag.
- Added `docs/WYSIWYG_PRODUCTION_GATE.md` with release states, required
  automated/manual gates, the page-boundary smoothness checklist, safe fallback
  switch, and known closed gates.
- Linked the production gate from the docs index, WYSIWYG plan, roadmap, review
  packet, and test strategy.

Files changed:

- `src/app/editor/_components/wysiwygInlineEditConfig.ts`
- `src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts`
- `docs/WYSIWYG_PRODUCTION_GATE.md`
- `docs/DOCS_INDEX.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts`
  - 1 file / 10 tests passed.
- `npm.cmd run type-check`
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 26 files / 326 tests.
  - app tests passed: 24 files / 213 tests.
  - production build passed.
- `npm.cmd run smoke:wysiwyg-stage4c`
  - Passed on bundled Chromium.

Notes:

- This does not enable WYSIWYG by default.
- This does not claim real Thai IME PASS, full screen reader validation, or
  table-cell text-engine readiness; those remain manual/design gates.

### P0-005 Breakable Table-Row No-Progress Guard

Goal: Prevent breakable table-row pagination from consuming continuation slice
height when remaining table-cell content cannot advance because padding,
repeated headers, or tiny page capacity leave no room for a line.

Completed:

- Added split-progress helpers in the table row split loop to compare each
  cell's current split point with the computed end split point before a
  non-final slice is emitted.
- If no remaining cell content advances, pagination now moves to a cleaner
  continuation page when that can increase capacity.
- If a clean continuation page still cannot fit one content unit, pagination
  uses an explicit overflow-progress fallback that forces one spacer/line
  forward instead of emitting an empty body-row slice.
- Added a regression fixture with a repeated 55-line table header and padded
  body cell that previously produced empty body-row slices before any body text
  advanced.
- Documented the no-progress rule in the layout and cross-page contracts.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:core -- src/pagination/__tests__/tablePagination.test.ts`
  - 1 file / 42 tests passed.
- `npm.cmd run type-check`
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 26 files / 326 tests.
  - app tests passed: 24 files / 212 tests.
  - production build passed.

Notes:

- The guard does not change table schema, row/column authoring behavior,
  renderer contracts, or rowspan-linked row policy.
- The overflow fallback is intentionally limited to the no-progress edge where
  the alternative is an empty continuation slice with unchanged cell split
  positions.

### P0-003 Header/Footer Editor Preview Parity

Goal: Make editor preview inspect resolved header/footer content instead of
showing only placeholder rectangles, without opening header/footer authoring or
changing pagination/export semantics.

Completed:

- Replaced header/footer placeholder-only rendering in `EditorCanvas` with
  read-only zone fragments that render paragraph/TOC text from
  `page.headerFragments` and `page.footerFragments`.
- Kept zone fragments non-interactive with `pointer-events: none`, so body
  paragraph selection, inline editing, drag, resize, and table editing remain
  owned by body fragments.
- Preserved the existing pagination/export contract: PDF still consumes
  `headerFragments`, body `fragments`, and `footerFragments` from
  `PaginatedDocument`; no schema or renderer behavior was changed.
- Added focused SSR coverage for editor canvas header/footer text rendering.
- Extended editor browser smoke with a document fixture that includes
  header/footer roots and asserts rendered zone text is visible and read-only.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
  - 2 files / 44 tests passed.
- `node --check scripts/editor-smoke.mjs`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
  - Passed.
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 26 files / 325 tests.
  - app tests passed: 24 files / 212 tests.
  - production build passed.

Notes:

- This intentionally does not add header/footer editing controls, selection, or
  a document model change.
- Header/footer zone layout continues to come from pagination output; the
  editor preview only renders the resolved fragments it receives.

### P0-004 Export Readiness Guard

Goal: Block unsafe PDF/DOCX export when authoritative layout, runtime font,
browser/server drift, or Fill-mode data readiness is not safe.

Completed:

- Added a focused `exportReadiness` helper that checks server layout status,
  whether the checked layout belongs to the current `previewDoc`, layout errors,
  font fallback, page-break drift, paragraph continuation drift, and Fill-mode
  readiness errors.
- Tracked the latest server-checked `previewDoc` in `EditorShell`, so export is
  not treated as safe during the small window after the authored/resolved
  document changes but before `/api/paginate` settles.
- Disabled PDF/DOCX export buttons while export readiness is unsafe and surfaced
  the first blocking reason in the toolbar with the full reason list in the
  control title.
- Kept `/api/export` as the export authority when export is allowed, and now
  also consumes the export response `X-FlowDoc-Font: fallback` header before
  downloading an artifact.
- Extended editor smoke coverage with a Fill-mode readiness-error package that
  blocks PDF export and then re-enables export after the data error is fixed and
  layout settles.
- Updated editor/export/browser contracts for the new export readiness behavior.

Files changed:

- `src/app/editor/_components/exportReadiness.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/exportReadiness.test.ts`
- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/exportReadiness.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts src/app/api/__tests__/exportPaginate.test.ts`
  - 3 files / 12 tests passed.
- `node --check scripts/editor-smoke.mjs`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
  - Passed.
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 26 files / 325 tests.
  - app tests passed: 23 files / 211 tests.
  - production build passed.

Notes:

- This does not implement table split guards, WYSIWYG production release gates,
  or user-level report fixtures.
- Missing required field values currently remain readiness warnings, matching
  the existing data snapshot contract; P0-004 blocks Fill-mode readiness errors.

### Stage 1 P0 Runtime Font And Review Gate Hardening

Goal: Start P0 Stage 1 by normalizing the runtime font contract and adding a
reproducible review gate without starting P0-003 or later work.

Completed:

- Added a shared API runtime font loader for `public/fonts/THSarabun.ttf` and
  routed both `/api/paginate` and `/api/export` through it.
- Added a non-skipped runtime font contract test and strengthened API route
  smoke coverage to assert normal dev/test output does not use
  `X-FlowDoc-Font: fallback`.
- Changed product export golden coverage so missing runtime font fails instead
  of skipping, while keeping real browser/font drift skippable only for missing
  Playwright/Chromium runtime.
- Added root `test:core`, `review:gate`, and `review:browser` scripts. The
  browser review wrapper protects the two smoke scripts from being run while an
  incompatible dev server is already active.
- Updated active contracts and review packet commands to make the Stage 1 gates
  reproducible.

Files changed:

- `src/app/api/runtimeFont.ts`
- `src/app/api/paginate/route.ts`
- `src/app/api/export/route.ts`
- `src/app/api/__tests__/runtimeFont.test.ts`
- `src/app/api/__tests__/exportPaginate.test.ts`
- `packages/core/src/renderer/__tests__/productExportGolden.test.ts`
- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `scripts/review-browser.mjs`
- `package.json`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/api/__tests__/runtimeFont.test.ts src/app/api/__tests__/exportPaginate.test.ts src/app/editor/_components/__tests__/realFontDrift.test.ts`
  - 3 files / 8 tests passed.
- `npm.cmd run test:core -- src/renderer/__tests__/productExportGolden.test.ts`
  - 1 file / 4 tests passed.
- `npm.cmd run review:gate`
  - type-check passed.
  - core tests passed: 26 files / 325 tests.
  - app tests passed: 22 files / 206 tests.
  - production build passed.
- `node --check scripts/review-browser.mjs`
- `npm.cmd run review:browser`
  - editor smoke passed.
  - WYSIWYG Stage 4C smoke passed on bundled Chromium.

Notes:

- P0-003+ was intentionally not started.
- Stopped an existing local Next dev server on `localhost:4000` to verify the
  browser gate against the smoke-owned servers.

### Prepare WYSIWYG Stage 4 Review Baseline

Goal: Freeze the current Option 1 WYSIWYG baseline for a larger review without
adding more editor behavior.

Completed:

- Added a Stage 4 review packet that summarizes scope, out-of-scope items,
  PASS/RISK/UNKNOWN status, verification commands, and reviewer notes.
- Linked the review packet from the active docs index.
- Kept this slice documentation-only so the baseline logic and previous smoke
  evidence stay stable for review.

Files changed:

- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/DOCS_INDEX.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- Documentation-only follow-up. The baseline verification remains the Stage 4E
  focused tests, browser smoke runs, type-check, full test suite, and
  `git diff --check` recorded below.

Notes:

- The review packet explicitly does not claim table-cell text-engine support,
  independent row/column continuation, real OS IME acceptance, or full screen
  reader validation.

### Add Stage 4E Row-Stack Paragraph Coverage

Goal: Continue Option 1 by covering paragraph editing inside row/stack columns
without changing the current atomic row/stack pagination contract or opening
table-cell text-engine editing.

Completed:

- Added a row/stack target to the Stage 3 boundary stress scenario, with a left
  editable stack paragraph and a right sibling stack paragraph for geometry
  comparison.
- Kept row-stack paragraphs eligible for the text-engine lane and added an
  explicit test that they do not fall back to visible textarea editing.
- Guarded row-stack paragraphs out of the body-paragraph live visual split
  preview, so typing in a column cannot create independent continuation
  fragments that bypass the containing row.
- Extended the Stage 4C smoke with a heavy row-stack paragraph edit. The smoke
  inserts `STAGE4_STACK_MARKER`, confirms no textarea mounts, confirms the
  stack target remains one fragment and one pointer fragment, and checks
  row/stack width and height relationships after the edit.
- Preserved the existing body paragraph page-boundary visual preview behavior
  with focused regression coverage.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/wysiwygStage3StressScenarios.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c`
- `npm.cmd test`

Notes:

- This does not change `DocumentNode`, core pagination, export, undo/redo, or
  table-cell text-engine eligibility.
- Row/stack paragraph content remains governed by the current atomic row
  policy: the paragraph does not split independently from its row. Independent
  row/column continuation remains a future design gate.

### Add Stage 4D Cross-Fragment Pointer Selection

Goal: Continue Option 1 in the body/split text-engine lane by making
same-paragraph pointer selection work across active and continuation fragments
without opening the table-cell decision gate.

Completed:

- Added pointer fragment targets for every visible fragment of the active
  text-engine paragraph, using draft visual preview fragments when the current
  draft crosses a page boundary.
- Updated `WysiwygTextLayer` pointer offset resolution so drag selection can
  map client coordinates back to the nearest paragraph fragment across pages.
- Added a document-level transparent drag overlay that appears only after real
  pointer movement, keeping cross-fragment move/up deterministic without
  breaking click or double-click word selection.
- Extended the Stage 4C smoke to drag-select from visible text in the active
  continued fragment back to visible text in the earlier fragment and require
  selection overlays on multiple target pages.
- Updated Stage 4 evidence and browser checklist wording for the new pointer
  drag coverage.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c`
- `npm.cmd test`
- `git diff --check`

Notes:

- This keeps selection state transient in the editor/session. It does not
  change `DocumentNode`, pagination semantics, export, undo/redo, or table-cell
  text-engine eligibility.
- Cross-fragment edit semantics beyond same-paragraph selection remain a later
  Stage 4/5 risk.

### Consolidate Stage 4C+4 Evidence And Browser Gates

Goal: Keep the current body/split text-engine stage auditable before moving to
the next WYSIWYG stage.

Completed:

- Reconciled the Stage 4C+4 evidence file with the current browser smoke gate:
  clipboard, synthetic composition, double-click selection, cross-fragment
  overlays, accessibility status, live continuation overlap protection, and
  perf trace separation.
- Recorded that the latest bundled Chromium, installed Chrome, and installed
  Edge smoke runs used the already-running flagged server at
  `http://localhost:4000/editor` because an isolated Next smoke server was
  blocked by the repo dev-server lock.
- Kept real Thai IME, full screen reader validation, full cross-fragment
  drag/edit semantics, and table-cell text-engine editing marked as risk or
  unknown instead of treating automated smoke as product-complete proof.

Files changed:

- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`
- `docs/WORK_LOG.md`

Verification:

- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This consolidation changes documentation only. It does not change editor
  behavior, document model semantics, pagination output, export, undo/redo, or
  table-cell eligibility.

### Add Text-Engine Performance Trace Guard

Goal: Continue Option 1 by protecting the body/split text-engine critical input
lane before opening any table-cell text-engine work.

Completed:

- Added `inline-edit-draft-update` perf events for text-engine draft changes so
  the existing perf trace covers the FlowDoc-owned input bridge, not only the
  legacy textarea path.
- Extended the Stage 4C smoke with a heavy text insertion perf check that
  resets `window.__flowDocWysiwygPerfEvents`, inserts a long marker through the
  hidden text-engine bridge, and asserts `browser-preview-pagination` is absent
  from the immediate input lane.
- If the same smoke observes a debounced `browser-preview-pagination`, it
  asserts it starts after the draft update instead of in the synchronous input
  path.
- Updated the WYSIWYG plan and browser checklist to record the perf gate.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `git diff --check`

Notes:

- This patch changes instrumentation and smoke coverage only. It does not
  change `DocumentNode`, pagination output, export, undo/redo, or table-cell
  eligibility.
- Starting an isolated smoke server without `SMOKE_BASE_URL` was blocked by
  the existing Next dev-server lock for this repo on `localhost:4000`, so the
  smoke was run against that already-running flagged server.

### Add WYSIWYG Text-Engine Accessibility Status

Goal: Continue Option 1 by improving the body/split text-engine lane without
opening the table-cell text-engine decision gate.

Completed:

- Added an accessibility status helper derived from `WysiwygTextSessionState`
  so caret and selection announcements use the same draft/caret/selection state
  as the text-engine lane.
- Added a visually hidden polite live region in `EditorShell` and connected the
  active text-engine layer and hidden input bridge with `aria-describedby`.
- Extended the Stage 4C smoke to assert the live status updates for caret and
  selection during the heavy cross-page clipboard flow.
- Updated the WYSIWYG plan and browser checklist to distinguish DOM live-status
  coverage from full screen reader product validation.

Files changed:

- `src/app/editor/_components/useWysiwygTextSession.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `scripts/wysiwyg-stage4c-smoke.mjs`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run type-check`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `git diff --check`

Notes:

- This is an editor accessibility-state patch only. It does not change
  `DocumentNode`, pagination, export, undo/redo, or table-cell eligibility.

### Guard Table-Cell Text-Engine Decision Gate

Goal: Continue the WYSIWYG staged work without silently expanding table-cell
editing into the text-engine lane before row/cell reflow semantics are designed.

Completed:

- Rechecked the table editing contract and cross-page behavior contract before
  touching table-related WYSIWYG behavior.
- Kept table-cell paragraphs explicitly outside the text-engine lane for now:
  they still fail closed to the guarded non-text-engine edit path instead of
  using the hidden text-engine input bridge.
- Added regression coverage that a table-cell paragraph with the text-engine
  flag enabled does not render `data-wysiwyg-text-engine-layer` or the hidden
  `data-wysiwyg-input-bridge`.
- Updated the WYSIWYG plan to distinguish the completed passive
  cross-fragment selection overlay from the still-deferred full drag/edit
  semantics and table-cell text-engine editing decision gate.

Files changed:

- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This guard does not change `DocumentNode`, core pagination, table pagination,
  export behavior, undo/redo, or the existing table-cell property-panel flow.
- Enabling text-engine editing inside table cells is the next big decision gate
  because it must define row/cell live reflow and continuation behavior instead
  of treating table-cell paragraphs like normal body paragraphs.

### Stabilize WYSIWYG Active Draft Page-Boundary Preview

Goal: Keep Stage 4C+3 typing feedback visible and stable when the active
paragraph grows across a page boundary, without letting full-document pagination
sit on the critical keypress path.

Completed:

- Added a canvas-owned WYSIWYG draft visual preview that measures only the
  active paragraph and splits draft lines across existing pages for live
  rendering.
- The live preview uses direct line capacity, not widow/orphan adjustment, so
  the current page keeps the lines that still fit and only overflowing draft
  lines move to the next page while typing.
- Updated active paragraph chrome to use the draft visual fragment and shifted
  downstream fragments when a live continuation is inserted, including chrome
  and a small gap so the continuation does not overlap the next paragraph.
- Kept plain body split paragraphs on the text-engine path after exit/re-enter
  by allowing continuation fragments through eligibility while still rejecting
  table-cell paragraphs.
- Removed duplicate React bridge handlers from the text-engine input bridge so
  keydown, beforeinput, input, clipboard, and composition events go through one
  native adapter path for normal and shifted typing.
- Added same-fragment double-click word selection in the text-engine layer,
  resolving the selected word from FlowDoc draft offsets and rendering the
  existing SVG selection overlay without mounting a textarea.
- Added passive SVG selection overlays for non-active continuation fragments of
  the active paragraph, so a full-paragraph selection can visibly span page
  fragments while keeping a single hidden input bridge on the active fragment.
- Kept full browser/server pagination as the settling/export truth and guarded
  aborted or page-transition server pagination fetches from logging false
  console errors.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/wysiwygTextEligibility.ts`
- `src/app/editor/_components/wysiwygDraftVisualPreview.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts`
- `scripts/wysiwyg-stage4c-smoke.mjs`

Verification:

- `node --check scripts/wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c`
- Browser check on `http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary`
  confirmed the target paragraph changed from one fragment to two with the
  first fragment staying at `lineStart=0,lineEnd=9` and the overflow fragment
  starting at `lineStart=9`, one active input bridge, and no inline textarea.
- Bundled Chromium, installed Chrome, and installed Edge Stage 4C smoke runs
  confirmed double-click selection produced a WYSIWYG selection overlay before
  the clipboard/IME flows.
- The Stage 4C smoke also selected from the end of the overflowed paragraph
  back to the start and confirmed WYSIWYG selection overlays on at least two
  target pages before collapsing the selection for the copy/cut flow.
- The same browser check exited edit and re-entered the continuation paragraph;
  settled line ranges stayed `0-8` / `8-10` before and after re-entry.
- A headless browser geometry check confirmed the live continuation bottom was
  below the next downstream paragraph top with no overlap, no inline textarea,
  no layout error badge, and no console errors.
- The automated Stage 4C smoke now waits for WYSIWYG selection and clipboard
  state to settle before copy/cut assertions, and asserts that the live target
  continuation does not overlap downstream paragraph fragments while the
  text-engine bridge is active.

Notes:

- This is an editor-only live visual preview. It does not change
  `DocumentNode`, core pagination, authoritative server/export pagination,
  undo/redo semantics, or renderer output.
- `npm.cmd run smoke:editor` could not be used as a clean broader gate while
  the flagged `localhost:4000` text-engine server was running: the isolated
  server path hit the Next dev-server lock, and the external-server path expects
  the legacy textarea lane. Stage 4C smoke was run against the active
  text-engine lane instead.
- Before the smoke wait hardening, one installed Chrome run had a transient
  selection/clipboard timing failure. After the script waited for selection and
  clipboard state to settle, bundled Chromium, installed Chrome, and installed
  Edge Stage 4C runs passed.

### Add Stage 4C+3 Browser-Channel IME Evidence

Goal: Strengthen Stage 4C clipboard/IME confidence with repeatable installed
Chrome and Edge evidence while keeping real Windows Thai IME rows honest.

Completed:

- Added `SMOKE_BROWSER_CHANNEL` support to `scripts/wysiwyg-stage4c-smoke.mjs`
  so the Stage 4C gate can run on bundled Chromium, installed Chrome, or
  installed Edge through Playwright.
- Kept browser/page/resource failures strict, but ignored only the
  browser-generated `404 /favicon.ico` console message seen in installed
  Chrome and Edge channel runs.
- Added `docs/WYSIWYG_STAGE4C_IME_RESULTS.md` to record the current evidence,
  environment, installed input methods, browser versions, PASS/RISK/UNKNOWN
  result matrix, and minimal next patch.
- Updated the browser smoke checklist, test strategy, docs index, real IME
  matrix, and WYSIWYG text-engine plan to link the evidence and channel command.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DOCS_INDEX.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4C_IME_MATRIX.md`
- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `scripts/wysiwyg-stage4c-smoke.mjs`

Verification:

- `node --check scripts\wysiwyg-stage4c-smoke.mjs`
- `npm.cmd run smoke:wysiwyg-stage4c`
- `$env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c; $code=$LASTEXITCODE; Remove-Item Env:SMOKE_BROWSER_CHANNEL; exit $code`
- `$env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c; $code=$LASTEXITCODE; Remove-Item Env:SMOKE_BROWSER_CHANNEL; exit $code`

Notes:

- `Get-WinUserLanguageList` found Thai `041E:0000041E` and English US
  `0409:00000409` installed.
- Chrome `148.0.7778.97` and Edge `148.0.3967.54` channel runs passed the
  automated Stage 4C workflow.
- Real Windows Thai IME rows remain `UNKNOWN` until a human/unrestricted desktop
  session completes `docs/WYSIWYG_STAGE4C_IME_MATRIX.md`.
- No editor runtime behavior, document model, pagination, undo/redo semantics,
  or export behavior changed in this patch.

### Add Stage 4C Real OS IME Matrix

Goal: Define the real-world IME verification gate that must complement the
automated Stage 4C smoke before raising clipboard/IME confidence to the
9.2-9.5 range.

Completed:

- Added `docs/WYSIWYG_STAGE4C_IME_MATRIX.md` as the source of truth for manual
  Windows Chrome/Edge Thai IME coverage.
- Defined PASS, FAIL / BLOCKER, RISK, and UNKNOWN terms for Stage 4C IME rows.
- Added preflight commands, DevTools probes, required environment rows,
  eight manual case groups, an evidence template, and blocker rules.
- Linked the matrix from the docs index, browser smoke checklist, test strategy,
  and WYSIWYG text-engine plan.
- Recorded that Chrome and Edge are installed on this machine, while the active
  Windows input-method list could not be read reliably from the current
  sandboxed shell session.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DOCS_INDEX.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_STAGE4C_IME_MATRIX.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run smoke:wysiwyg-stage4c`
- `git diff --check`

Notes:

- This closes the documentation and evidence format for Stage 4C+2, but the
  real OS IME rows remain `UNKNOWN` until a human/unrestricted desktop session
  records Windows Chrome and Edge Thai IME results.
- No editor runtime behavior, document model, pagination, export, or test code
  changed in this patch.

### Add Automated Stage 4C WYSIWYG Smoke Gate

Goal: Turn the Stage 4C clipboard/IME browser verification into a repeatable
repo command so future WYSIWYG text-engine changes cannot silently regress
paste, cut, composition, focus, or undo/redo behavior.

Completed:

- Added `scripts/wysiwyg-stage4c-smoke.mjs`, a Playwright smoke that starts the
  flagged editor with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1` and opens the
  `wysiwyg-stage3-boundary` scenario.
- Added `npm.cmd run smoke:wysiwyg-stage4c` / `npm run smoke:wysiwyg-stage4c`.
- The smoke verifies the text-engine bridge mounts with no inline textarea,
  pastes a heavy Thai/English CRLF payload, crosses the target paragraph from
  one fragment to at least two fragments, copies and cuts the selected
  `CUTME4C` marker through the system clipboard, exits with Escape, verifies
  editor focus restoration, and checks keyboard Undo/Redo.
- The same smoke verifies synthetic IME composition commits exactly once,
  suppresses duplicate final input, leaves the hidden bridge empty, and records
  browser console/page errors as failures.
- Hardened script cleanup so spawned Next dev servers are awaited on shutdown,
  and clipboard permissions use the actual scenario origin for `SMOKE_BASE_URL`
  compatibility.
- Updated the browser checklist, test strategy, and text-engine plan to make
  this command the Stage 4C automated gate.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `package.json`
- `scripts/wysiwyg-stage4c-smoke.mjs`

Verification:

- `npm.cmd run smoke:wysiwyg-stage4c`
- `SMOKE_PORT=4017 npm.cmd run smoke:wysiwyg-stage4c`
- `npm.cmd run type-check`

Notes:

- The smoke intentionally remains synthetic for IME composition. Real OS IME
  coverage still belongs to the planned manual matrix.
- The command cannot run while another Next dev server for this same repo is
  already holding the Next dev lock, unless `SMOKE_BASE_URL` points at an
  already-running flagged server.

### Harden WYSIWYG Text Engine Clipboard And IME

Goal: Continue Stage 4C by routing paste, copy, cut, and IME composition
through FlowDoc-owned text draft operations while keeping the hidden
`contentEditable` bridge adapter-only.

Completed:

- Added plain-text clipboard helpers to `useWysiwygTextSession`, including CRLF
  normalization, selected-text extraction from FlowDoc offsets, and selected
  cut as one draft change.
- Wired paste/copy/cut handlers in the text-engine bridge so visible text,
  selection, wrapping, and layout remain owned by SVG/FlowDoc geometry.
- Added Ctrl/Cmd+C/X/V fallback handling through the Clipboard API because the
  SVG selection overlay is not a native browser selection.
- Added IME composition guards so intermediate composition input does not
  mutate the draft, compositionend commits once, and duplicate final input is
  suppressed.
- Restored editor focus after keyboard edit exit and made editor undo/redo
  shortcut matching case-insensitive.
- Updated the text-engine plan, browser smoke checklist, and test strategy for
  the Stage 4C clipboard/IME gate.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/useWysiwygTextSession.ts`
- `src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- Browser Playwright smoke on `http://localhost:4016/editor?flowdocTestScenario=wysiwyg-stage3-boundary` with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`, `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`, and `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1`: pasted heavy Thai/English multiline text through Ctrl+V, crossed the target from one fragment to two, selected and cut `CUTME4C` through Ctrl+X with the system clipboard matching the selected text, committed with Escape, Undo returned the target to one fragment with the pasted marker gone, Redo restored the pasted marker and two-fragment layout without restoring the cut marker, synthetic IME composition committed `IME4Cทดสอบ` exactly once, the hidden bridge was empty after composition, no inline textarea mounted, and no layout error was visible.

Notes:

- The in-app browser plugin was attempted first, but this session blocked local
  `localhost` and `127.0.0.1` navigation with `ERR_BLOCKED_BY_CLIENT`. Browser
  verification used the same local Playwright runtime as the project smoke
  suite.
- A pre-existing Next dev server for this repo did not have the text-engine
  flags enabled, so it was stopped before running the flagged Stage 4C smoke.
- This intentionally does not change `DocumentNode`, server/API pagination,
  export behavior, accessibility announcements, cross-fragment selection, or
  table-cell text-engine editing.

### Add WYSIWYG Text Engine Selection Foundation

Goal: Continue Stage 4B by making the FlowDoc-owned text-engine lane handle
keyboard selection and selected-range deletion from editor/session state, while
keeping document schema, export, undo, and pagination ownership unchanged.

Completed:

- Fixed shifted keyboard navigation in `useWysiwygTextSession` so repeated
  Shift+Arrow preserves the original anchor and moves the focus endpoint by
  grapheme-aware offsets.
- Added same-fragment pointer selection wiring in the SVG text-engine layer,
  using a transparent SVG hit area, FlowDoc point-to-offset mapping, and the
  existing SVG selection overlay geometry.
- Kept the hidden `contentEditable` bridge as input-only; visible text,
  selection, caret, wrapping, and layout remain owned by FlowDoc SVG geometry.
- Added focused tests for forward/backward Shift+Arrow selection, Home/End
  selection extension, unshifted collapse behavior, text-engine overlay
  rendering, and selected deletion in the heavy Stage 3 boundary fixture.
- Updated the text-engine plan, browser smoke checklist, and test strategy with
  the current Stage 4B selection contract and remaining deferred work.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/useWysiwygTextSession.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- Browser Playwright smoke on `http://localhost:4013/editor?flowdocTestScenario=wysiwyg-stage3-boundary` with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`, `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`, and `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1`: target started as one fragment, Shift+Arrow rendered a WYSIWYG selection overlay, unshifted Arrow collapsed it, `Enter Enter S4B` overflowed the target to two fragments, Shift+Arrow selected the marker, Backspace deleted the selected range, further Backspace returned the target to one fragment, no inline textarea mounted, and no layout error was visible.
- Browser Playwright drag smoke on `http://localhost:4014/editor?flowdocTestScenario=wysiwyg-stage3-boundary` with the same flags: dragging inside the text-engine layer produced a WYSIWYG selection overlay, no inline textarea mounted, and no layout error was visible.
- Browser Playwright undo/redo smoke on `http://localhost:4015/editor?flowdocTestScenario=wysiwyg-stage3-boundary` with the same flags: after selected deletion and replacement marker `S4C`, commit removed the input bridge, Undo returned the target to one fragment with the marker gone, Redo restored the marker and two-fragment overflow, and no layout error was visible.
- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `git diff --check`

Notes:

- The in-app browser plugin was attempted first, but local navigation/runtime
  issues made it unreliable in this session. The browser verification above
  used the same local Playwright runtime as the project's automated smoke
  suite.
- This intentionally does not change `DocumentNode`, server/API pagination,
  export behavior, undo transaction policy, clipboard/cut handling, OS IME
  composition hardening, accessibility announcements, cross-fragment selection,
  or table-cell text-engine editing.

### Clean Stage 4A Verification Baseline

Goal: Start the next WYSIWYG text-engine stage by removing verification noise
before adding selection, clipboard, or IME behavior, while keeping the Stage 3
stress fixture in the baseline.

Completed:

- Changed the real-font drift test to load Playwright's Chromium runtime
  optionally, so `npm.cmd run type-check` no longer fails when local
  `node_modules/playwright` is unavailable.
- Kept the real-font drift coverage intact for environments that do have the
  runtime: the test still launches Chromium and compares canvas measurement
  with fontkit when `public/fonts/THSarabun.ttf` and Playwright are available.
- Re-ran the Stage 3 heavy/stress baseline alongside the real-font drift test.
- Restored the declared Playwright package into local `node_modules` with
  `npm.cmd install`, then ran the automated editor smoke successfully.

Files changed:

- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd run test -w packages/core -- src/layout/__tests__/measure.test.ts src/pagination/__tests__/paginator.test.ts src/pagination/__tests__/tablePagination.test.ts src/pagination/__tests__/rowStack.test.ts`
- `npm.cmd test`
- `git diff --check`
- `npm.cmd run smoke:editor`

Notes:

- Before restoring dependencies, `npm.cmd run smoke:editor` failed because
  `node_modules/playwright` was missing. After `npm.cmd install`, Playwright
  resolved as `1.59.1`, the real-font drift test ran and passed locally, and
  the isolated editor smoke passed.
- A smoke run against the already-running `localhost:4000` text-engine dev
  server failed because that server intentionally did not match the smoke
  script's legacy-inline-edit expectations. The successful run let the smoke
  script start its own isolated server.
- This is a verification-baseline patch only. It intentionally does not change
  editor runtime behavior, document schema, pagination semantics, export,
  selection, clipboard, or IME behavior.

---

## 2026-05-12

### Add WYSIWYG Text Engine Draft Pagination

Goal: Continue Stage 3 of the FlowDoc-owned WYSIWYG text engine by letting
page-boundary paragraph drafts render from draft paginated geometry without
making textarea layout authoritative or committing document text on each
keypress.

Completed:

- Added a normalized draft preview document helper for active WYSIWYG text
  drafts.
- Added hard-page-boundary draft pagination scheduling with generation guards,
  draft-version checks, caret page tracking, and optimistic paginated preview
  updates.
- Added a deterministic Stage 3 stress scenario, available in dev/test mode via
  `/editor?flowdocTestScenario=wysiwyg-stage3-boundary`, that seeds a target
  paragraph near a page boundary with dense downstream content.
- Disabled autosave while a dev/test scenario is active so stress runs do not
  persist over the user's normal editor localStorage document.
- Let eligible continuation paragraph fragments render through the
  WYSIWYG text layer when draft pagination is active.
- Kept same-page hard-local edits on the local height patch path, and kept
  table-cell paragraphs on the guarded fallback path.
- Added a hidden `contentEditable` non-textarea input bridge inside the SVG
  text-engine layer, with native keyboard/input listeners, so browser keyboard
  events reach the FlowDoc text draft handler while SVG lines remain the
  visual/layout truth.
- Extended the inline-edit blur guard so remounting from a textarea to the
  text-engine SVG textbox, or between text-engine fragments, does not finalize
  the edit when focus lands on a replacement surface for the same paragraph.
- Updated the active WYSIWYG text engine plan to reflect that
  hard-page-boundary edits now queue debounced draft pagination instead of
  remaining detect-only.

Files changed:

- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/inlineEditBlur.ts`
- `src/app/editor/_components/useInlineEditSession.ts`
- `src/app/editor/_components/wysiwygDraftPreview.ts`
- `src/app/editor/_components/wysiwygStage3StressScenarios.ts`
- `src/app/editor/_components/__tests__/inlineEditBlur.test.ts`
- `src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `npm.cmd run test -w packages/core -- src/layout/__tests__/measure.test.ts src/pagination/__tests__/paginator.test.ts src/pagination/__tests__/tablePagination.test.ts src/pagination/__tests__/rowStack.test.ts`
- `git diff --check`
- Browser smoke on `http://localhost:4000/editor` with
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`,
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`, and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1` confirmed the editor loaded,
  flags were true, no layout error badge appeared, clicking a body paragraph
  opened the text-engine layer, no inline textarea was mounted, and the hidden
  input bridge was present.
- 2026-05-13 browser keypress recheck on the same flagged server confirmed
  short text entry through the bridge (`ZX9`) updated the SVG text-engine layer,
  no inline textarea was mounted, and no layout error appeared. A longer
  keypress sequence wrapped the active paragraph from 3 to 5 SVG text lines,
  kept the bridge active, and still showed no layout error.
- 2026-05-13 Stage 3 stress browser smoke on
  `/editor?flowdocTestScenario=wysiwyg-stage3-boundary` confirmed the target
  paragraph started as one fragment, real bridge keypresses moved it to two
  fragments across the page boundary, Backspace shrank it back to one fragment,
  no inline textarea mounted, no layout error appeared, and commit/Undo/Redo
  restored the typed marker.

Notes:

- `npm.cmd run type-check` is still blocked by the pre-existing
  `realFontDrift.test.ts` missing `playwright` package and implicit-any errors.
  No new type-check error remains from this patch.
- `npm.cmd run smoke:editor` is blocked by the same missing `playwright`
  package. Browser automation also exposed local tooling limits:
  `localhost:4011` was blocked, Chrome extension navigation to localhost was
  blocked, some in-app browser tabs timed out at the CDP layer after reload,
  and `locator.type()` / `locator.fill()` require a virtual clipboard that was
  unavailable in this session. Real browser `press()` key events did work
  against the non-textarea bridge. The successful browser portion used an
  outside-sandbox dev server on `localhost:4000`.
- This intentionally does not change `DocumentNode` schema, server/API
  pagination ownership, export behavior, undo transaction policy, IME/clipboard
  hardening, or table-cell WYSIWYG editing.

---

### Add Slice-Aware WYSIWYG Selection Foundation

Goal: Address the reported WYSIWYG blockers without changing document schema,
paginator/export ownership, or making textarea layout authoritative.

Completed:

- Made inline edit textarea values slice-aware for both first and continuation
  fragments. When a paragraph spans pages, the active textarea now holds only
  the active fragment text slice and reconstructs the full paragraph with stable
  prefix/suffix context.
- Stabilized slice context across active textarea renders so browser pagination
  updates cannot duplicate or garble text during a typing burst.
- Marked edit start as visually fresh for the current draft snapshot, allowing
  document-visual mode on entry when geometry is available.
- Started the active typing visual lock from key interaction before native
  textarea input lands, and lengthened the lock for human-speed typing so the
  editor does not switch to transparent SVG visuals between ordinary
  keystrokes.
- Deferred active textarea page relocation while the typing visual lock is held
  or the document visual is stale, avoiding remounts while keystrokes are still
  being delivered.
- Added same-fragment drag selection support by mapping pointer positions to
  WYSIWYG paragraph offsets and drawing SVG selection overlays from existing
  paginated line geometry.
- Added editor fragment debug data attributes for smoke assertions without
  changing authored document data.
- Extended automated editor smoke coverage for stack paragraph visual parity,
  table-cell visual contract, drag selection overlay, slice-bounded
  continuation textareas, visible marker uniqueness, undo/redo, and continuation
  boundary Backspace.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/useInlineEditSession.ts`
- `src/app/editor/_components/wysiwygTextInteraction.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `scripts/editor-smoke.mjs`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/inlineEditCaret.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts`
- `npm.cmd run type-check`
- `SMOKE_BASE_URL=http://localhost:4000/editor npm.cmd run smoke:editor`
- `npm.cmd test`
- Human-speed Playwright probe on `http://localhost:4000/editor`: typed enough
  text at 130ms per character to wrap to three visible lines; textarea value
  stayed correct and visible during typing, then handed off to document visual
  after the idle window.

Notes:

- This intentionally does not change `DocumentNode`, core pagination policy,
  export behavior, server pagination, clipboard/cut handling, IME hardening, or
  cross-fragment selection. Cross-fragment selection remains deferred.
- The isolated smoke server could not start because another Next dev server was
  already running for this worktree. The same smoke suite was run successfully
  against the existing `http://localhost:4000/editor` server.

---

### Stabilize Inline Edit Input Bridge

Goal: Make the current hybrid inline editor more predictable during typing
while keeping textarea fallback available and avoiding document/schema/layout
rewrite scope.

Completed:

- Routed inline textarea key decisions and full-text/caret snapshots through
  `wysiwygTextInteraction` so paragraph editing has one shared input bridge
  policy.
- Aligned plain Enter classification with the current editor contract: native
  multiline textarea behavior remains the default, and structural paragraph
  split is available only as an explicit future mode.
- Added a short document-visual typing lock to `useInlineEditSession` so fresh
  browser pagination does not immediately reclaim the visible layer during an
  active typing burst.
- Kept the existing stale-visual fallback path: textarea text remains visible
  when paginated visual output is not ready for the active draft.
- Added focused tests for Enter policy, textarea snapshot conversion, and visual
  readiness while the typing lock is active.

Files changed:

- `src/app/editor/_components/wysiwygTextInteraction.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/useInlineEditSession.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `src/app/editor/_components/__tests__/useInlineEditSession.test.ts`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `npm.cmd test`

Notes:

- This intentionally does not enable WYSIWYG by default, change
  `DocumentNode`, replace textarea with hidden-input editing, add selection
  overlays, change pagination/export behavior, or claim full IME/clipboard
  hardening.
- Manual in-app browser probing confirmed the default textarea fallback path can
  enter inline edit, show typed text, exit without a layout error, and clean up
  the active textarea. A manual WYSIWYG-flag browser perception pass was not
  completed; the automated editor smoke script remains the WYSIWYG-flag browser
  coverage for this patch.
- Post-test status: user manual testing found this round is not acceptable as a
  stable WYSIWYG result. Reported blockers are paragraph edit layout drift in
  non-body containers, odd cross-page continuation behavior when typing across a
  page boundary, and unavailable drag text selection. Treat this as
  FAIL/BLOCKER and move to the staged real-WYSIWYG plan rather than continuing
  to polish the hybrid textarea layout as the final path.

---

### Add Agent Operating Model

Goal: Create a detailed role and responsibility model for Codex and other
project agents without changing runtime behavior.

Completed:

- Added `docs/agent/AGENT_OPERATING_MODEL.md` as the detailed operating model
  for lead, reviewer, implementer, regression, test, docs, and multi-agent
  work division.
- Linked the new operating model from `docs/agent/CODEX_ROLES.md` so the
  existing concise role list remains the quick reference.
- Updated `docs/DOCS_INDEX.md` so future sessions can find the detailed agent
  ownership and routing guidance.

Files changed:

- `docs/agent/AGENT_OPERATING_MODEL.md`
- `docs/agent/CODEX_ROLES.md`
- `docs/DOCS_INDEX.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `git diff --check`

Notes:

- This is documentation-only. It intentionally does not change runtime code,
  editor behavior, layout behavior, tests, or product decision authority.

---

## 2026-05-11

### Adopt Document-First FlowDocPackage V1

Goal: Apply the product decision to choose the package/envelope direction while
keeping this implementation focused on the document foundation only.

Completed:

- Added document-first `FlowDocPackage v1` support in editor persistence.
- Kept core editing/layout/export APIs working with `DocumentNode`; the package
  is the persisted/import/export JSON shape, not the layout engine input.
- Changed localStorage save to store a package with `packageVersion: 1`,
  `kind: "document"`, package metadata, and the underlying `DocumentNode`.
- Changed JSON export to emit a package and download as `*.flowdoc.json`.
- Kept legacy raw `DocumentNode v1` import/load support so existing saved JSON
  and smoke fixtures still work.
- Updated the automated editor smoke script so its localStorage assertions can
  read either legacy raw documents or `FlowDocPackage v1` after autosave.
- Added package parser tests for package JSON, legacy raw document JSON,
  unsupported document/package versions, invalid package shape, invalid
  document structure, localStorage behavior, and JSON package serialization.
- Updated architecture, fixture catalog, and test strategy docs to document the
  new document-first package boundary.
- Follow-up Phase 1 package contract work added
  `docs/FLOWDOC_PACKAGE_CONTRACT.md`, linked it from the docs index,
  architecture, engineering principles, and test strategy, and enforced
  `package.id === package.document.document.id` in the package parser.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `scripts/editor-smoke.mjs`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DOCS_INDEX.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`
- Phase 1 focused recheck:
  `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`

Notes:

- This intentionally does not add field registry, data versions, key-based
  history, reviewer workflow, or binding-data persistence yet. Those remain
  higher layers that can be built on top of the package foundation.

### Harden Package Import/Export UX

Goal: Continue the package foundation by making JSON import/export safer and
more understandable without adding form/history layers.

Completed:

- Added concise user-facing import success/failure messages for package and
  legacy raw document JSON.
- Added distinct failure messages for invalid JSON, unsupported document
  versions, unsupported package versions, invalid packages, and invalid
  documents.
- Sanitized document titles before using them as `.flowdoc.json` filenames.
- Updated JSON export to show a short toolbar status after preparing a package
  download.
- Updated JSON import to show a short toolbar status for package imports,
  legacy imports, file-read failure, and parse/validation failure.
- Updated the hidden file input to accept `.flowdoc.json`, `.json`, and
  `application/json`.
- Added focused persistence tests for safe filenames and status message mapping.
- Updated package contract, fixture catalog, test strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is still document-first package UX only. It does not add field registry,
  data versions, key history, reviewer workflow, or template library behavior.

### Add Package Migration Entrypoint

Goal: Continue Phase 3 by routing persisted/editor JSON through one migration
entrypoint before editor state receives a document.

Completed:

- Added `migratePersistedDocumentPackage(...)`.
- Made `parsePersistedDocument(...)` use the migration entrypoint.
- Legacy raw `DocumentNode v1` JSON now migrates into a canonical
  `FlowDocPackage v1`.
- Existing `FlowDocPackage v1` migration is idempotent.
- Kept migration document-first only; no form/history/reviewer data was added.
- Added focused tests for raw document migration and package v1 idempotence.
- Updated the package contract migration section.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This establishes the migration seam needed for future package versions while
  keeping current runtime behavior compatible with raw document imports.

### Harden Table Structural Operations

Goal: Continue Phase 4 by moving table authoring guarantees closer to the core
operations that mutate table rows and columns.

Completed:

- Added operation-level fixtures for inserting a row above the first row,
  deleting a row subtree, preserving last-row safety, inserting a column to the
  left of the first column, deleting a column subtree, preserving table width,
  and preserving last-column safety.
- Fixed row deletion so `headerRowCount` is clamped to the remaining row count
  instead of leaving the table in an invalid authored state.
- Kept the change at the document/table model layer. No span-aware authoring UI,
  column resize UI, or higher-level package/history behavior was added.
- Updated the table editing contract, fixture catalog, and test strategy.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Extend Table Property Panel Browser Smoke

Goal: Continue Phase 5 by checking that the table-cell property panel can drive
row and column operations in the real editor route, not only at the core
operation layer.

Completed:

- Extended `scripts/editor-smoke.mjs` with localStorage table-shape helpers so
  the smoke verifies authored row/column counts after browser interactions.
- Added smoke coverage for selecting a table cell, inserting a column to the
  right, selecting the inserted cell through its paragraph, deleting that
  inserted column, inserting a row below, selecting the inserted row cell, and
  deleting that inserted row.
- Kept the smoke tied to `FlowDocPackage v1` or legacy raw document storage so
  autosave format changes do not make the browser check brittle.
- Updated browser smoke, fixture catalog, and test strategy docs to reflect the
  new row/column property-panel coverage.

Files changed:

- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This remains focused browser coverage. It does not replace future visual
  regression tests, broad editor workflow automation, or manual checks for
  perceived flicker and scroll feel.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FieldRef Operation Fixtures

Goal: Continue Phase 6 by protecting the document-level key/field foundation
without starting the future form, history, or reviewer layers.

Completed:

- Added operation fixtures for inserting a `fieldRef` inline into a normal body
  paragraph.
- Added operation fixtures for inserting a `fieldRef` inline into a paragraph
  scoped inside a table cell.
- Verified that insertion preserves existing text runs instead of flattening the
  paragraph into plain text.
- Updated fixture catalog and test strategy counts.

Files changed:

- `packages/core/src/document/operations.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This intentionally stops at authored `DocumentNode` behavior. It does not add
  field registries, data snapshots, key-based history, or reviewer workflows.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FieldRef Package Roundtrip Fixture

Goal: Continue Phase 7 by making sure the document-first package boundary keeps
structured inline keys intact.

Completed:

- Added a persistence fixture that serializes a document containing an inline
  `fieldRef` to `FlowDocPackage v1`, then parses it back through the normal
  import path.
- Verified the `fieldRef` id, key, label, fallback, and surrounding text run are
  preserved.
- Updated the package contract, fixture catalog, and test strategy counts.

Files changed:

- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This still stops at package/document preservation. It does not add a field
  registry, binding data payload, key history, or reviewer workflow.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Field Registry Contract And Validation Fixtures

Goal: Start Phase A of the document/key foundation by giving `fieldRef.key` a
clear registry contract without making current binding strict or changing
`DocumentNode`.

Completed:

- Added `docs/FIELD_REGISTRY_CONTRACT.md` defining field keys, registry v1
  shape, scalar inline field rules, validation policy, ownership boundaries,
  and future package direction.
- Added `packages/core/src/fieldRegistry/index.ts` with
  `FieldRegistryV1`, `FieldDefinitionV1`, `collectDocumentFieldRefs(...)`,
  `validateFieldRegistryReferences(...)`, and
  `hasFieldRegistryErrors(...)`.
- Added focused registry fixtures for body paragraph refs, table-cell refs,
  registered scalar refs, duplicate keys, missing definitions, and invalid
  inline targets for `image`/`collection`.
- Aligned the sample editor field palette definition type with the core field
  registry shape while keeping palette drag data compatible.
- Updated docs index, architecture, engineering principles, package contract,
  agent workflow, fixture catalog, and test strategy.

Files changed:

- `packages/core/src/fieldRegistry/index.ts`
- `packages/core/src/fieldRegistry/index.test.ts`
- `src/app/_lib/fieldRegistry.ts`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/fieldRegistry/index.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- Binding remains descriptive and non-strict for now. Missing registry
  definitions are warnings in the new validation helper, not binding failures.
- `FlowDocPackage v1` still does not persist the registry; that remains a future
  package migration decision.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FlowDoc Package V2 Proposal

Goal: Continue Phase B by defining the next package direction before changing
runtime storage, import/export behavior, or localStorage format.

Completed:

- Added `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`.
- Proposed `FlowDocPackageV2` with required package-level `fields:
  FieldRegistryV1`.
- Reserved optional/deferred package locations for `data`, `history`, and
  migration records without making them active behavior.
- Defined v2 goals, non-goals, identity rules, ownership boundaries, validation
  levels, migration direction, import/export policy, test expectations, and
  open decisions.
- Linked the proposal from docs index, package contract, field registry
  contract, architecture overview, test strategy, and agent workflow.

Files changed:

- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`

Notes:

- This is proposal-only work. It intentionally does not implement package v2
  parsing, migration, localStorage changes, or JSON export changes.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FlowDoc Package V2 Parser Compatibility

Goal: Continue Phase C by proving the v2 package proposal in the persistence
boundary while keeping default save/export behavior on package v1.

Completed:

- Added `FlowDocPackageV2` and `FlowDocPackage` union types to editor
  persistence.
- Added package v2 parser support with required `fields: FieldRegistryV1`.
- Kept `CURRENT_PACKAGE_VERSION` and `serializeDocumentPackage(...)` on v1 so
  localStorage saves and JSON export behavior do not change yet.
- Added registry validation during v2 parsing: duplicate keys and inline
  `collection`/`image` field targets reject the package, while missing field
  definitions are surfaced as warnings.
- Added focused persistence tests for v2 parse success, missing-definition
  warnings, duplicate registry rejection, collection-target rejection, and
  default export remaining v1.
- Updated package/proposal/test/fixture docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This does not migrate localStorage, switch JSON export to v2, or add data/key
  history storage.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Data Snapshot Contract And Validation Fixtures

Goal: Continue Phase D by defining field values outside `DocumentNode` before
wiring data into binding, packages, or key history.

Completed:

- Added `docs/DATA_SNAPSHOT_CONTRACT.md`.
- Added `packages/core/src/dataSnapshot/index.ts` with
  `DataSnapshotV1`, scalar value types, `validateDataSnapshot(...)`, and
  `hasDataSnapshotErrors(...)`.
- Added focused data snapshot fixtures for valid scalar values, required-field
  readiness warnings, unknown-key warnings, invalid value type errors, invalid
  enum value errors, and unsupported `image`/`collection` snapshot values.
- Linked the data snapshot contract from docs index, agent workflow,
  architecture, field registry contract, package v2 proposal, fixture catalog,
  and test strategy.

Files changed:

- `packages/core/src/dataSnapshot/index.ts`
- `packages/core/src/dataSnapshot/index.test.ts`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/dataSnapshot/index.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This does not persist data snapshots in package JSON and does not wire
  snapshots into binding yet.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Snapshot Binding Preview Foundation

Goal: Continue Phase E by wiring scalar data snapshots into temporary binding
preview without changing package persistence or mutating template documents.

Completed:

- Added `bindDocumentWithSnapshot(...)` to the core binding layer.
- Kept the existing nested `FieldData` binding entrypoint intact for
  compatibility.
- Bound flat `DataSnapshotV1.values` keys such as `customer.name` directly to
  matching inline `fieldRef.key` values.
- Returned data snapshot validation issues alongside the resolved document so
  callers can decide how to handle warnings/errors.
- Made invalid snapshot values fall back instead of rendering invalid data into
  preview/export output.
- Allowed missing values to use inline `fieldRef.fallback`, registry fallback,
  or empty text.
- Updated Fill mode to store values as `DataSnapshotV1` and preview through the
  snapshot binding helper.
- Updated architecture, field registry, package v2 proposal, data snapshot,
  fixture catalog, and test strategy docs.

Files changed:

- `packages/core/src/binding/index.ts`
- `packages/core/src/binding/index.test.ts`
- `src/app/_lib/fieldRegistry.ts`
- `src/app/editor/_components/FillingPanel.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/binding/index.test.ts src/dataSnapshot/index.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This still does not persist data snapshots in package JSON, switch
  localStorage/export to package v2, or implement key history.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Document Data Readiness Feedback

Goal: Continue Phase F by surfacing registry/snapshot readiness without making
readiness warnings block opening, editing, or preview.

Completed:

- Added `packages/core/src/readiness/index.ts` with
  `assessDocumentDataReadiness(...)`.
- Combined field registry reference issues and data snapshot validation issues
  into one readiness report.
- Scoped required snapshot checks to fields actually used by the current
  document so unused required registry fields do not warn in Fill mode.
- Added readiness fixtures for valid data, missing registry definitions,
  missing used required values, unused required fields, and invalid snapshot
  values.
- Updated Fill mode to show compact non-blocking readiness errors/warnings in
  the filling panel.
- Extended the automated editor smoke with a Fill mode readiness warning/clear
  check on an isolated fieldRef document.
- Updated architecture, field registry, package v2 proposal, data snapshot,
  browser smoke, fixture catalog, and test strategy docs.

Files changed:

- `packages/core/src/readiness/index.ts`
- `packages/core/src/readiness/index.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/FillingPanel.tsx`
- `scripts/editor-smoke.mjs`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/readiness/index.test.ts src/binding/index.test.ts src/dataSnapshot/index.test.ts src/fieldRegistry/index.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- Readiness remains informational in the editor. This does not decide publish,
  export, package migration, or review-workflow blocking policy.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Surface Package V2 Registry Import Warnings

Goal: Continue Phase G by making package v2 registry readiness visible during
JSON import without changing the active save/export package format.

Completed:

- Extended `documentImportSuccessMessage(...)` to include registry warning
  counts when a parsed package reports warning-level field registry issues.
- Updated JSON import wiring so package v2 missing-definition warnings appear
  in the toolbar import status.
- Added focused persistence coverage for the warning status message.
- Updated package contract, package v2 proposal, fixture catalog, test
  strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is still non-blocking readiness feedback. It does not migrate
  localStorage/export to package v2.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add In-Memory Package V2 Migration Helper

Goal: Continue the package v2 path by proving explicit migration behavior
without changing current localStorage or JSON export defaults.

Completed:

- Added `migratePersistedDocumentPackageToV2(...)`.
- Added `createDocumentPackageV2(...)` for explicit package v2 construction.
- Migrated package v1 input to package v2 in memory with an empty
  `FieldRegistryV1`.
- Migrated legacy raw `DocumentNode v1` JSON to package v2 in memory with an
  empty `FieldRegistryV1`.
- Surfaced missing field definitions as warning-level registry issues during
  v2 migration.
- Kept existing package v2 input idempotent and preserved optional `data`,
  `history`, and `migrations` members.
- Kept `serializeDocumentPackage(...)`, localStorage save, and JSON export on
  package v1.
- Updated package contract, package v2 proposal, fixture catalog, test
  strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is the last low-risk migration foundation before choosing whether
  package v2 should become the active localStorage and/or JSON export format.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Activate Package V2 For LocalStorage

Goal: Activate package v2 in the lowest-risk runtime boundary while keeping
downloaded JSON export on package v1.

Completed:

- Added `CURRENT_STORAGE_PACKAGE_VERSION = 2`.
- Changed localStorage autosave to write `FlowDocPackage v2`.
- Kept `serializeDocumentPackage(...)` and JSON export writing
  `FlowDocPackage v1`.
- Allowed `saveDocumentToStorage(...)` to receive the active
  `FieldRegistryV1`.
- Preserved package v2 field registries loaded from localStorage or JSON import
  in editor Fill mode, readiness checks, and subsequent autosaves.
- Used the sample editor field registry for new documents and legacy/package
  v1 inputs that do not carry a package-level registry.
- Updated the automated editor smoke to assert autosaved localStorage packages
  are v2.
- Updated package contract, package v2 proposal, browser smoke, fixture catalog,
  test strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/FillingPanel.tsx`
- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- JSON export intentionally remains package v1. The next major decision is
  whether and when downloaded `.flowdoc.json` files should switch to package v2.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Transition Package V2 JSON Export

Goal: Continue the short transition toward package v2 as the canonical file
format without removing the stable package v1 export yet.

Completed:

- Added `serializeDocumentPackageV2(...)`.
- Added an explicit `Save v2` editor toolbar action that downloads package v2
  JSON with the active field registry.
- Kept the existing `Save JSON` action writing package v1.
- Added `.v2.flowdoc.json` filenames for transition package v2 downloads so v1
  and v2 exports are not easy to confuse or overwrite.
- Added focused persistence coverage for package v2 export serialization and
  v2 filename generation.
- Updated package contract, package v2 proposal, browser smoke checklist,
  fixture catalog, test strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is intentionally transitional. The next package decision should make
  package v2 the default JSON export and remove or demote package v1 export.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Automated Editor Browser Smoke

Goal: Start Phase 1 of the stability roadmap by turning the most important
manual editor smoke path into a repeatable browser check.

Completed:

- Added Playwright as a dev dependency and installed the Chromium browser
  runtime for local smoke execution.
- Added `npm.cmd run smoke:editor` / `npm run smoke:editor`.
- Added `scripts/editor-smoke.mjs`, which starts an isolated Next dev server on
  port `4010`, seeds a deterministic editor document in `localStorage`, and
  checks the real `/editor` route through Chromium.
- Covered editor load/status, paragraph multiline inline edit commit,
  undo/redo, and table-cell selection into the property panel.
- Added stable `data-testid` hooks for the editor shell, toolbar, canvas,
  page/fragments, layout error badge, and property-panel title.
- Updated the browser smoke checklist, test strategy, and fixture catalog so
  future sessions know what the automated smoke covers and what still requires
  manual inspection.

Files changed:

- `package.json`
- `package-lock.json`
- `scripts/editor-smoke.mjs`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- The smoke is deliberately focused coverage. It does not replace visual
  regression, PDF/editor parity checks, drag/resize interaction checks, or
  manual review for perceived flicker.
- The script uses `localhost` by default because Next.js 16 dev resources block
  the `127.0.0.1` origin unless it is explicitly allowed in Next config.

### Add Real-Font Thai Drift Fixtures

Goal: Start Phase 2 by checking the actual runtime Thai font path, not only
mock browser/server width differences.

Completed:

- Added `realFontDrift.test.ts` under the app component tests.
- Loaded `public/fonts/THSarabun.ttf` into both Chromium canvas and the
  server-side fontkit measurer from the same font bytes.
- Added representative width parity coverage for Thai, mixed Thai/English,
  digits, long Thai tokens, and long ASCII text.
- Added a browser-canvas pagination helper that fills a synchronous measurement
  cache from Chromium, allowing the existing core paginator to run unchanged.
- Compared browser-canvas pagination and server fontkit pagination through
  `comparePagination`, asserting no line-count, page-break, continuation, or
  geometry drift for a representative Thai document.
- Updated fixture/test strategy/text-engine docs to move real-font Thai drift
  out of the known-gap bucket.

Files changed:

- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- The test skips when either the runtime font file or Playwright Chromium
  runtime is unavailable. When both are present, it exercises the real browser
  canvas and real fontkit paths.
- This is still not visual regression. It locks text measurement and pagination
  drift for the real Thai font before broader PDF/editor parity work.

### Add Product Export Golden Smoke

Goal: Start Phase 3 by checking product fixtures through renderer output
without brittle binary snapshots.

Completed:

- Added `productExportGolden.test.ts` under core renderer tests.
- Rebuilt the customs and report product fixtures in the renderer layer, then
  paginated them with the server-style stack: `public/fonts/THSarabun.ttf`,
  `createFontkitMeasurer`, and `thaiWordBreaker`.
- Rendered customs and report fixtures through `PdfRenderer` with a real Thai
  `FontProvider`, then loaded the generated PDF with `pdf-lib` to verify page
  count parity with authoritative pagination.
- Preserved pre-render customs table invariants in the export smoke: 3 pages,
  repeated header rows, 130 body rows, and fixed column geometry.
- Rendered the customs fixture through `DocxRenderer` and inspected
  `word/document.xml` with `JSZip` to verify generated table-row structure
  matches the paginated table rows.
- Updated fixture catalog, test strategy, and export renderer contract to mark
  product export smoke coverage as present while keeping visual regression
  clearly deferred.

Files changed:

- `packages/core/src/renderer/__tests__/productExportGolden.test.ts`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/productExportGolden.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- The test intentionally avoids binary PDF/DOCX snapshots. It checks stable
  artifact properties: PDF page count and DOCX XML row structure.
- This still does not prove pixel-level PDF/editor visual parity.

### Add API Export/Paginate Contract Smoke

Goal: Start Phase 4 by protecting the actual Next route boundary for
pagination and export, not only the core renderer classes.

Completed:

- Added direct route tests for `src/app/api/paginate/route.ts` and
  `src/app/api/export/route.ts`.
- Covered `/api/paginate` success with asserted `PaginatedDocument` JSON.
- Covered invalid JSON rejection for `/api/paginate`.
- Covered invalid export format rejection for `/api/export`.
- Covered `/api/export` PDF success headers, `%PDF` bytes, and page readability
  through `pdf-lib`.
- Covered `/api/export` DOCX success headers, `PK` ZIP bytes, and editable
  `word/document.xml` readability through `JSZip`.
- Updated fixture catalog, test strategy, and export renderer contract to note
  API route contract smoke coverage.

Files changed:

- `src/app/api/__tests__/exportPaginate.test.ts`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/api/__tests__/exportPaginate.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- These are direct route-function tests. They do not start a Next dev server.
- The tests intentionally stay at the API boundary: status, headers, asserted
  JSON, and readable artifact bytes. Deep product page/table semantics remain
  in core renderer/product golden tests.

### Add Version-1 Document Persistence Guard

Goal: Start Phase 5 conservatively by hardening localStorage and JSON import
without changing the persisted document format.

Completed:

- Added `documentPersistence.ts` for the editor.
- Centralized version-1 document parsing for localStorage and JSON import.
- Kept the existing raw `DocumentNode` storage format and `flowdoc_document`
  key.
- Normalized persisted/imported documents before they enter editor state.
- Validated normalized documents with `assertDocument`, rejecting invalid JSON,
  unsupported versions, and structurally invalid documents.
- Updated `EditorShell` to use the shared persistence helper for save, load, and
  import.
- Added focused app tests for parse/normalize, invalid JSON, unsupported
  version, invalid structure, and localStorage key behavior.
- Updated architecture, fixture catalog, and test strategy docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This was the conservative guard before the package direction was chosen. The
  later `FlowDocPackage v1` entry keeps the same validation guard while moving
  persisted/editor JSON to a document-first package envelope.

### Add Product Pagination Golden Fixtures

Goal: Read the documentation set first, then add fixture coverage that aligns
with the documented product scenarios and test strategy.

Completed:

- Read the docs index, product scenarios, fixture catalog, test strategy,
  cross-page/page-fragmentation/export contracts, table contract, text reflow
  plan, and recent work log themes.
- Added `product fixture — customs-page-count-golden` to lock the customs table
  page count, repeated header count, footer page numbers, and fixed column
  geometry.
- Added `product fixture — report-page-count-golden` to lock cover/TOC/body
  page counts, body footer restart numbers, and long paragraph continuation
  ranges.
- Updated `assertDocument` so authored `toc` blocks are accepted in body/stack
  positions, matching the existing product fixtures and renderer/API contract
  direction.
- Updated fixture/test documentation with the new fixture ownership and current
  test inventory.

Files changed:

- `docs/FIXTURE_CATALOG.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `packages/core/src/document/assert.ts`
- `packages/core/src/document/assert.test.ts`
- `packages/core/src/pagination/__tests__/productGolden.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/productGolden.test.ts`
- `npm.cmd run test -w packages/core -- src/document/assert.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/multiSection.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`

Notes:

- This intentionally does not add pixel-level PDF/editor visual regression.
  The docs still mark that as future work; this change freezes the
  renderer-facing `PaginatedDocument` baseline first.

### Add Internal WYSIWYG Text Interaction Policy

Goal: Continue Stage 6 with pure IME, clipboard, keyboard, accessibility, and
selection-range policy helpers while keeping default textarea UX unchanged.

Completed:

- Added `src/app/editor/_components/wysiwygTextInteraction.ts`.
- Added explicit native fallback reasons for composition, clipboard,
  accessibility, stale visual state, and missing geometry.
- Added pure classification for current inline edit keyboard decisions:
  native, end edit, split paragraph, and merge/boundary backspace.
- Kept copy/cut/paste policy native by default.
- Added selection snapshot helpers that convert textarea local selection into
  full paragraph UTF-16 offsets, including continuation-fragment `preText` and
  backward selection direction.
- Updated the WYSIWYG roadmap with the Stage 6 internal helper contract.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygTextInteraction.ts`
- `src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `npm.cmd run test:app`
- `npm.cmd test`

Notes:

- This does not replace native IME or clipboard behavior. It only gives future
  WYSIWYG stages a tested policy layer to call.

### Add Internal Selection Overlay Geometry

Goal: Continue Stage 5 as an internal geometry contract for selection
highlights without enabling visible selection UI or clipboard behavior.

Completed:

- Added selection overlay rectangle helpers to `wysiwygCaretMapping.ts`.
- Covered single-line, multi-line, and split-fragment paragraph selection
  geometry in focused tests.
- Updated the WYSIWYG roadmap to mark selection overlay geometry as internal
  only, with drag selection and clipboard behavior still deferred.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd test`

Notes:

- This does not render visible selection highlights and does not change native
  textarea selection behavior.

### Activate WYSIWYG Point-To-Offset Hit Testing

Goal: Start Stage 4 by routing paragraph pointer hit testing through the new
WYSIWYG point-to-offset mapping helper while preserving the previous fallback
path.

Completed:

- Updated `EditorCanvas` paragraph click/double-click caret lookup to call
  `resolveCaretOffsetFromPointInFragment(...)`.
- Kept the older line-width ratio fallback for fragments that do not have
  segment geometry.
- Documented the Stage 4 activation in the WYSIWYG roadmap.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor`: clicking paragraph text opens
  inline edit and starts with transparent textarea/SVG visual after the
  point-to-offset helper activation.

Notes:

- This activates the mapping contract for click hit testing only. It does not
  draw a custom caret and does not add drag selection.

### Add Internal Collapsed Caret Overlay Geometry

Goal: Continue Stage 3 safely by deriving collapsed caret overlay geometry from
the new WYSIWYG mapping contract without rendering a custom caret in the editor
yet.

Completed:

- Added collapsed caret overlay geometry helpers to
  `wysiwygCaretMapping.ts`.
- Covered single-fragment and split-fragment overlay coordinates in focused
  tests.
- Updated the WYSIWYG roadmap to note that Stage 3 has internal geometry
  helpers, but default editor rendering is unchanged.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd test`

Notes:

- This deliberately avoids drawing the custom caret in `ParagraphTextSurface`
  until the native textarea interaction/fallback rules are ready.

### Start Internal WYSIWYG Caret Mapping Contract

Goal: Begin Stage 1-2 of the WYSIWYG track with an internal caret mapping
contract that can be tested without changing the default editor UX.

Completed:

- Added `src/app/editor/_components/wysiwygCaretMapping.ts` as an internal
  helper for WYSIWYG caret mapping.
- Defined tested mapping primitives for:
  - grapheme-safe caret candidates from `PaginatedLine` segments
  - paragraph offset to page-local caret position
  - page-local point to paragraph offset
  - split-fragment boundary selection across pages
- Kept the helper segment-driven and page-local; it does not store geometry in
  `DocumentNode` and is not wired into default editor interaction yet.
- Updated the WYSIWYG roadmap with the internal helper location and opt-in note.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd run test:app`
- `npm.cmd test`

Notes:

- This is still not a custom caret implementation. It is the contract layer that
  future collapsed caret and hit testing work can consume.

### Document WYSIWYG Roadmap And Narrow Pointer Lock

Goal: Lock the future WYSIWYG direction in docs while fixing the failed active
edit visual lock trigger where a second caret-placement click exposed textarea
layout drift.

Completed:

- Removed `onPointerDown` as a trigger for locking the active edit session to
  visible textarea text. Pointer events still stop propagation, but a caret
  placement click no longer changes the visual layer by itself.
- Kept visible textarea locking for actual text input, keyboard interaction, and
  composition start.
- Added `docs/WYSIWYG_EDITOR_ROADMAP.md` with the staged WYSIWYG track:
  current hybrid stability, visual truth contract, caret mapping contract,
  collapsed custom caret, hit testing, selection overlay, IME/clipboard/
  accessibility hardening, and hidden input mode.
- Documented WYSIWYG guardrails in the editor UX contract, including no document
  model changes first, no textarea layout truth, composition fallback, deferred
  selection, and `caret candidates != line segments`.
- Updated browser smoke expectations for second-click caret placement and
  keyboard/input/composition locking.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor`: opening inline paragraph edit
  starts with transparent textarea/SVG visual, a second caret-placement click
  keeps the textarea transparent, typing locks the textarea visible, and Escape
  exits back to normal SVG rendering.

Notes:

- This does not start custom caret implementation. The roadmap remains an
  internal future track until the hybrid editor is stable enough.

### Lock Active Inline Edit Visual Mode

Goal: Stop active paragraph editing from snapping after idle by preventing
automatic handoff from textarea text back to SVG text once the user has started
interacting with the textarea.

Completed:

- Replaced the short settle timer with a node-scoped visual lock:
  `inlineEditVisualLockNodeId`.
- Kept SVG visual parity available on edit entry when the paginated visual
  snapshot is already fresh.
- Lock the active edit session to visible textarea text after real user
  interaction (`onInput`, `onKeyDown`, `onPointerDown`, or
  `onCompositionStart`).
- Kept `onSelect` as caret-state only so autofocus/programmatic caret setup
  does not lock textarea mode by itself.
- Reset the visual lock when starting a new edit session, ending edit, or
  replacing the document.
- Updated editor UX and browser smoke docs with the active-session visual lock
  contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` with the current localStorage
  document:
  - reloaded the editor and confirmed no visible `layout error` /
    `Server pagination failed` badge;
  - entered inline edit and confirmed the initial fresh state kept textarea text
    transparent after autofocus/programmatic selection;
  - typed one `x` and confirmed textarea text became visible;
  - waited past the previous idle handoff window and confirmed textarea text
    stayed visible instead of snapping back to SVG;
  - used native textarea undo to restore the smoke character, closed edit with
    Escape, and restored app undo/redo state after the smoke check.

Notes:

- This is a visual-mode decision only. It does not change document truth,
  browser/server pagination, export, schema, or custom caret/selection behavior.

### Hold Textarea Fallback During Active Inline Typing

Goal: Reduce inline edit visual jitter after the guarded overlay change by
avoiding rapid per-keystroke switching between the native textarea text layer
and the SVG paginated text layer.

Completed:

- Added a short inline edit visual settle gate. Each draft text change keeps the
  textarea visible for the current typing burst, then allows the SVG visual
  layer only after the user pauses briefly and browser pagination has caught up.
- Kept the previous freshness guard: stale visual snapshots still cannot hide
  typed text, and fresh SVG lines only become the visual layer after the settle
  delay.
- Documented the intended behavior in the editor UX contract and browser smoke
  checklist.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` with the current localStorage
  document:
  - reloaded the editor and confirmed no visible `layout error` /
    `Server pagination failed` badge;
  - opened a paragraph inline editor and confirmed the settled fresh state keeps
    textarea text transparent;
  - typed one `x` and confirmed textarea text became visible during the typing
    burst;
  - waited for the settle delay and confirmed textarea text became transparent
    again once the SVG visual layer was ready;
  - closed edit with Escape and used Undo to restore the one-character smoke
    change.

Notes:

- This is still not a custom caret/selection implementation. It only smooths
  the handoff between textarea fallback and SVG visual parity.

### Add Guarded Inline Edit Visual Overlay

Goal: Make normal paragraph view and inline edit view share the same visual
text source when safe, without starting a custom caret/selection project.

Completed:

- Added inline edit draft/visual version tracking so the editor knows when the
  current paginated visual lines match the active draft.
- Kept textarea input/caret as the interaction truth, but render active SVG
  paragraph lines during edit when the visual snapshot is fresh.
- Kept textarea text visible as the fallback while visual pagination is stale,
  preventing fast typing from making text disappear.
- Made the textarea geometry intent explicit: foreignObject chrome expands the
  hit/outline box while matching padding keeps the content origin aligned with
  the paragraph fragment.
- Added focused app tests for the guarded overlay helper behavior and updated
  UX/smoke docs with the no-disappear/no-double-text contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` with the current localStorage
  document:
  - reloaded the editor and confirmed the toolbar/pages rendered with no visible
    `layout error` / `Server pagination failed` badge;
  - opened an inline paragraph editor and confirmed exactly one active textarea;
  - confirmed the fresh edit state uses transparent textarea text with visible
    caret color, allowing the SVG paragraph lines to be the visual layer;
  - closed the inline editor with Escape and confirmed the textarea unmounted
    with no visible layout error badge.

Notes:

- This keeps server pagination, export, schema, and the core pagination engine
  unchanged. Custom caret/selection remains a later decision gate.
- The browser console buffer still contained earlier authoritative pagination
  errors from the page session, so the smoke result is based on visible status
  and current editor state rather than a clean console log.

### Fit Oversized Table Columns During Flow

Goal: Clear the server `/api/paginate` layout assertion failure where table
cells could extend slightly past the page content box when authored column
widths exceeded the available table container width.

Completed:

- Added table column width resolution in the flow layer. Authored table column
  widths are preserved in `DocumentNode`, but layout scales them down
  proportionally when their sum exceeds the available parent width.
- Kept the last table column absorbing floating-point remainder so the final
  cell right edge lands on the available width instead of drifting outside the
  content box.
- Added a core pagination test for an oversized 3-column table that now fits the
  available content width and passes `assertPaginatedDocument`.
- Browser recheck on the current editor document confirmed the visible
  `Server pagination failed` / `layout error` badge disappeared after reload.

Files changed:

- `docs/WORK_LOG.md`
- `packages/core/src/layout/flow.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- tablePagination`
- `npm.cmd test`
- Browser reload of `http://localhost:4000/editor`

Notes:

- This is a layout containment fix only. It does not change schema, authored
  table columns, export APIs, or renderer behavior.

### Restore Visible Active Inline Text Feedback

Goal: Fix the live inline pagination UX regression where the native textarea
caret/input layer was transparent while SVG lines waited for debounced browser
pagination, making typed text invisible and line-click caret placement feel
wrong.

Completed:

- Made the active paragraph textarea render visible text again so immediate
  typing feedback and the native caret live in the same browser layout layer.
- Stopped rendering the active fragment SVG text lines while the textarea is
  active, avoiding duplicate text. Continuation fragments still render from the
  paginated snapshot.
- Clamped the active textarea overlay height to the active paginated fragment
  height instead of autosizing to full `scrollHeight`, preventing a long
  transparent hit area from growing past the page while pagination catches up.
- Reduced inline browser pagination cadence from 100ms to 16ms so page splits
  update during sustained typing instead of mostly after typing stops.
- Updated editor UX and smoke docs to describe the hybrid contract: active
  fragment visual feedback belongs to the textarea, page continuation belongs
  to the paginator.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser inspection on `http://localhost:4000/editor` confirmed the active
  inline textarea now uses visible text color instead of `transparent`; the
  existing local document still shows the separate server pagination failed
  badge noted in the previous entry.

Notes:

- This does not add a mini paginator in `ParagraphTextSurface`. The textarea
  only owns immediate active-fragment feedback; cross-page layout still comes
  from browser/server pagination.

### Harden Inline Edit Relocation Blur And Caret Movement

Goal: Close the main UX risks after adding caret-following across live
pagination: accidental edit finalization during textarea relocation and stale
caret state when the user moves the caret without typing.

Completed:

- Added a delayed blur guard for inline edit textareas. Blur from an old
  remounted textarea waits briefly and is ignored when focus lands on another
  inline textarea for the same paragraph.
- Added a focused `shouldFinalizeInlineEditBlur()` helper with tests for same
  node relocation, outside blur, changed active node, and unknown-node fallback.
- Added `onInlineEditCaretChange` through `ParagraphTextSurface` and
  `EditorCanvas` so selection/arrow-key caret movement updates
  `inlineEditCaretIndex` without dispatching `UPDATE_INLINE_TEXT_DRAFT`.
- Marked active inline textareas with `data-inline-edit-node-id` for relocation
  focus checks.
- Updated editor UX and browser smoke docs with the blur/caret hardening
  contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/inlineEditBlur.ts`
- `src/app/editor/_components/__tests__/inlineEditBlur.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` confirmed the editor route,
  toolbar, pages, and outline rendered; the current local document still showed
  `Server pagination failed — editor is showing browser preview only`, with no
  console warnings/errors captured.

Notes:

- This keeps the architecture unchanged: no schema/export/server/pagination
  engine changes, and `ParagraphTextSurface` still does not implement page
  fragmentation.
- The server pagination badge should be investigated separately if it persists
  outside the current localStorage document/dev-server state.

### Polish Live Inline Pagination Performance Phase 4

Goal: Keep live inline pagination responsive as documents grow without changing
the pagination contract or schema.

Completed:

- Split inline edit caret lookup into reusable precomputed fragment ranges.
- Updated `EditorShell` to memoize active paragraph fragment ranges per
  paginated snapshot, so ordinary caret movement does not rescan the full
  document until pagination actually changes.
- Kept the one-shot `findInlineEditPageIndexForCaret()` helper for direct tests
  and callers that do not need cached ranges.
- Added an early generation/edit-node guard before browser pagination computes a
  new optimistic snapshot, avoiding work for callbacks that are already stale.
- Added app tests for precomputed range reuse across caret moves.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/inlineEditCaret.ts`
- `src/app/editor/_components/__tests__/inlineEditCaret.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`

Notes:

- This phase keeps browser pagination whole-document and debounced. More
  invasive affected-section or measurement-cache work remains a future engine
  optimization, not part of the inline edit UX slice.

### Harden Continuation Fragment Inline Editing Phase 3

Goal: Make Enter/Backspace inside split paragraph inline editing use the full
paragraph text offset, even when the active textarea only renders a continuation
slice.

Completed:

- Added inline edit helpers for absolute caret mapping, split text generation,
  and continuation-boundary Backspace behavior.
- Wired paragraph inline `Enter` to split at the absolute paragraph offset,
  deleting any selected local text before splitting.
- Wired `Backspace` at the start of a continuation slice to delete the previous
  grapheme across the continuation boundary instead of incorrectly merging the
  paragraph.
- Kept `Backspace` at the true start of the full paragraph mapped to
  `mergeParagraphWithPrevious()`.
- Preserved inline edit history snapshots across split/merge dispatches so the
  previous edit transaction does not linger after structural paragraph actions.
- Started a fresh inline edit transaction after split/merge focus moves to the
  new or previous paragraph.
- Updated editor UX and browser smoke docs with the continuation key handling
  contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`

Notes:

- Cross-fragment text selection and fully caret-perfect visual editing remain
  deferred polish. This phase focuses on correct full-text offset mapping and
  avoiding wrong paragraph merges from continuation slices.

### Add Inline Edit Caret Page Tracking Phase 2

Goal: Move the active inline edit surface to the paginated fragment containing
the caret once live inline pagination splits a paragraph across pages.

Completed:

- Added `findInlineEditPageIndexForCaret()` to derive the active edit page from
  paginated paragraph fragment segment ranges.
- Updated `EditorShell` to update `inlineEditPageIndex` when the caret crosses
  a live continuation boundary, while leaving the caret index as transient
  editor state rather than document geometry.
- Added app tests for first-page caret placement, continuation-page placement,
  exact split boundaries, moving back before the boundary, and missing segment
  offset fallback.
- Updated editor UX and browser smoke docs to reflect active textarea page
  tracking while keeping cross-fragment selection and fully caret-perfect
  editing deferred.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/inlineEditCaret.ts`
- `src/app/editor/_components/__tests__/inlineEditCaret.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`

Notes:

- This phase intentionally uses paginated segment offsets instead of page
  geometry in authored nodes. Editing from later continuation fragments and
  Enter/Backspace hardening remain Phase 3 work.

### Add Live Inline Pagination Preview Phase 1

Goal: Let long inline paragraph edits use browser pagination for optimistic
page continuation before blur, without turning the text surface into a second
paginator.

Completed:

- Allowed the browser `paginateDocument(previewDoc, editorTextMeasurer)` path to
  run during inline editing with a conservative debounce.
- Added a browser pagination generation guard so stale optimistic pagination
  results cannot overwrite newer draft layouts during fast typing.
- Kept server `/api/paginate` as authoritative status/drift/export truth.
- Stopped inline edit height callbacks from shifting page layout while live
  inline pagination is active, avoiding double movement when the paginator
  settles the same draft.
- Changed the active paragraph edit surface to render visual text from
  `PaginatedDocument` fragment lines instead of measuring and drawing all draft
  lines inside the current fragment.
- Stabilized editor canvas keys for sections, pages, and active inline fragments
  so frequent paginated snapshot updates are less likely to remount the textarea.
- Updated editor/browser smoke docs to describe live inline pagination as
  optimistic visual layout and keep caret-following across pages deferred.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser check on `http://localhost:4000/editor`:
  - confirmed the editor loaded with no console warnings/errors;
  - opened the existing multi-page paragraph inline editor;
  - confirmed the restored text matched the pre-smoke value before committing;
  - committed the inline session and confirmed no textarea/focus residue or
    console warnings/errors remained.

Notes:

- Browser automation could not complete the full shrink/restore smoke because
  the current Browser Use text replacement path required a virtual clipboard
  that was unavailable in this session. The attempted keystroke change was
  repaired and verified against the pre-smoke text before committing.
- Phase 1 intentionally improves visual continuity only. Caret-following across
  pages and full continuation-fragment editing remain deferred.

## 2026-05-10

### Restore Inline Long-Run Wrapping

Goal: Keep the inline paragraph caret/input surface aligned with visible text
when typing long unbroken text runs.

Completed:

- Reproduced the active editor state with a long unbroken Thai probe while a
  paragraph inline editor was open.
- Confirmed the inline canvas textarea was using `overflow-wrap: break-word`
  even though the earlier documented fix expected `overflow-wrap: anywhere`.
- Restored the inline textarea wrapping rule to `overflowWrap: "anywhere"` so
  native textarea wrapping better matches the core grapheme fallback used for
  over-wide segments.
- Removed the temporary probe text after browser verification.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- Browser check on `http://localhost:4000/editor`:
  - inspected the active inline textarea style and confirmed
    `overflow-wrap: anywhere`;
  - typed a long Thai probe into the active inline editor;
  - confirmed the property-panel text length increased by the probe length;
  - restored the paragraph text to its pre-probe value;
  - confirmed no browser console warnings/errors were reported.

### Show Export Failure Feedback

Goal: Make export failures visible to users instead of console-only.

Completed:

- Added `exportError` editor UI state separate from layout/reconciliation status.
- Clear export errors when a PDF/DOCX export starts and after a successful
  export.
- Set a short format-specific message when export fails, such as
  `PDF export failed. Please try again.`
- Display the message near the export controls while keeping `console.error` for
  debugging.
- Kept `/api/export`, PDF/DOCX renderers, core pagination, document model, and
  export gating/reconciling policy unchanged.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `git diff --check`
- Doc reference check: all explicit `docs/*.md` references resolve.
- Browser/code-path smoke on `http://localhost:4000/editor`:
  - initial editor load shows no stale export failure message.
  - export controls remain visible/stable near the new error slot.
  - normal PDF export click does not leave a visible failure message; the Codex
    in-app browser does not support download capture, so file download completion
    was not verified there.
  - failure behavior was confirmed from the `handleExport` code path: start and
    success clear `exportError`; catch sets the format-specific UI message.

Notes:

- Export while reconciling / export gating remains deferred to a separate policy
  slice.

### Disable Template Undo/Redo While Filling

Goal: Make Fill mode undo/redo match the current binding/history contract.

Completed:

- Disabled toolbar Undo/Redo while Fill mode is active, even when template
  history exists.
- Guarded editor-shell Ctrl+Z/Ctrl+Y so Fill mode does not trigger template
  history undo/redo from the editor surface.
- Left field inputs to use native browser input undo behavior.
- Documented the current policy: template history is disabled while filling;
  dedicated submission history is deferred.
- Did not change reducer/history architecture, binding behavior, core
  pagination, or template-mode undo/redo behavior.

Files changed:

- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`

Verification:

- `npm.cmd run type-check`
- `git diff --check`
- Doc reference check: all explicit `docs/*.md` references resolve.
- Browser smoke on `http://localhost:4000/editor`:
  - Template mode Ctrl+Z undoes a template text edit; toolbar Redo restores it.
  - Fill mode disables toolbar Undo/Redo even when template history exists.
  - Fill mode Ctrl+Z does not undo template content.
  - Switching back to Template mode restores template undo/redo behavior.
  - Field input native undo is preserved by the code path because text inputs
    return before editor-shell shortcut handling; no field input was available
    in the active smoke template.

Notes:

- Broader Fill mode lock-surface review, such as non-history keyboard actions,
  is deferred to a separate focused slice.

### Fix Inline Edit Lifecycle Finalization

Goal: Prevent inline edit drafts from entering `state.doc` without a matching
undo transaction when another same-document action closes edit mode.

Completed:

- Added `finalizeInlineEditBeforeAction()` for same-document actions. It reuses
  the existing inline edit commit path, clears inline edit UI state, and clears
  the transaction ref.
- Added `resetInlineEditStateForDocumentReplace()` for New/Open document
  replacement. It discards inline edit UI state and transaction refs without
  committing stale edits across documents.
- Routed same-document actions through finalization, including export, Save JSON,
  undo/redo, background click, resize starts, palette/node pointer starts, and
  template/fill mode switching.
- Routed New/Open document replacement through reset/discard behavior.
- Kept reducer architecture, core pagination, fill-mode undo/redo policy, and
  export error UI unchanged.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `git diff --check`
- Doc reference check: all explicit `docs/*.md` references resolve.
- Browser smoke on `http://localhost:4000/editor`:
  - edit 3-4 lines -> margin resize start -> undo/redo restores expected text.
  - edit -> row/min-height resize start -> undo/redo restores expected text.
  - edit -> switch Fill/Template -> inline textarea closes with no stale editor.
  - edit -> New -> inline session resets and draft text is discarded.

### Add Page Fragmentation Model Contract

Goal: Create a shared language for current page-boundary behavior before
touching more pagination code.

Completed:

- Added `docs/PAGE_FRAGMENTATION_MODEL.md` documenting the current
  natural-flow-first, policy-based fragmentation model.
- Described the flow, pagination, and renderer layers without implying an
  immediate refactor.
- Added the current fragmentation policy matrix by structure, including
  paragraph line fragmentation, atomic blocks, breakable table row slices,
  rowspan groups, and TOC repagination.
- Documented the key table row split accounting risk: the row loop is
  height/slice-driven while each cell tracks child/line continuation state.
- Added agent guardrails against making frontend preview or renderers the layout
  truth, changing cross-page behavior without focused tests, or unifying
  fragmentation policies opportunistically.
- Linked the new contract from the docs index, agent workflow, cross-page
  behavior contract, layout spec, and layout checklist.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/DOCS_INDEX.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PAGE_FRAGMENTATION_MODEL.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to
  existing files.

### Tighten Table Split Metadata Assertions

Goal: Add the final small table split accounting assertion suggested by review
without changing pagination behavior.

Completed:

- Tightened `expectContiguousLineAccounting` in
  `packages/core/src/pagination/__tests__/tablePagination.test.ts`.
- The helper now asserts the first split fragment is not marked as continuing
  from a previous fragment.
- The helper now checks each fragment's `lineStart` / `lineEnd` span matches the
  actual number of rendered lines on that fragment.

Files changed:

- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
  passed: 40 table pagination tests.
- `npm.cmd run type-check`
- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to
  existing files.

### Tighten Export Renderer Dependency Guard

Goal: Keep export/renderers from becoming a second layout engine while reviewing
the renderer/API boundary.

Completed:

- Rechecked `/api/export`, PDF renderer, and DOCX renderer boundaries: export
  still paginates and asserts before rendering, while production renderers accept
  `PaginatedDocument`.
- Added a renderer dependency guard to `docs/EXPORT_RENDERER_CONTRACT.md`:
  production renderer code should not import document schema, document
  operations, `paginateDocument`, text measurers, or word breakers.
- Clarified that DOCX may serialize paginated line text into editable Word
  paragraphs, but this must not become a new FlowDoc line/page breaking policy.
- Added verification guidance for future renderer dependency changes.

Files changed:

- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to
  existing files.

### Add Editor State Race Smoke Contract

Goal: Make editor state/reconciliation race checks explicit before changing more
inline edit, undo/redo, export, or renderer-facing editor behavior.

Completed:

- Added editor state race invariants to `docs/EDITOR_UX_CONTRACT.md` covering
  `state.doc`, `previewDoc`, `state.paginated`, stale server responses, inline
  edit history, undo/redo snapshots, export, and ephemeral interaction state.
- Added a focused browser smoke set for editor state race and reconciliation
  checks in `docs/BROWSER_SMOKE_CHECKLIST.md`.
- Updated `docs/TEST_STRATEGY.md` so editor state race/reconciliation changes
  have an explicit verification row.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to
  existing files.

### Add Binding Scalar Contract Tests

Goal: Lock the current binding layer contract before expanding table/editor
workflow work.

Completed:

- Added focused binding tests for scalar `fieldRef` replacement in normal
  paragraphs.
- Covered missing-field fallback, missing-field empty text, and fieldRef
  replacement inside table-cell paragraphs.
- Added a non-mutation test so binding keeps templates intact while producing a
  resolved temporary document.
- Locked the current registry behavior as descriptive rather than strict
  validation, matching the deferred repeat/nested binding contract.
- Updated coverage snapshots and fixture catalog ownership after adding the new
  core test file.

Files changed:

- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `packages/core/src/binding/index.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- binding/index.test.ts` passed: 6 binding
  tests.
- `npm.cmd test` passed: 20 core test files / 285 core tests, plus 2 app test
  files / 21 app tests.
- `npm.cmd run type-check`

### Clarify Table Cell Flow Semantics

Goal: Reduce confusion around table-cell identity between flow measurement and
pagination output before further table/cross-page work.

Completed:

- Added a code comment in `packages/core/src/layout/flow.ts` explaining that
  table cells use stack-like `FlowBox` semantics during measurement.
- Documented that pagination emits those cells as
  `PageFragment.nodeType="table-cell"` for renderer/debug/editor identity.
- Linked the distinction from table/layout docs so future agents do not treat
  the internal flow node type as public table identity.

Files changed:

- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WORK_LOG.md`
- `packages/core/src/layout/flow.ts`

Verification:

- `npm.cmd run type-check`
- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to
  existing files.

### Add Table Split Accounting Tests

Goal: Add narrow regression coverage for table row split accounting before
changing cross-page table behavior or refactoring the paginator.

Completed:

- Added table row split accounting assertions for uneven multi-cell splits so
  each long cell preserves contiguous `lineStart` / `lineEnd` ranges
  independently.
- Added regression coverage for an empty cell in a split row, ensuring it does
  not disturb progress or duplicate sibling paragraph content.
- Added regression coverage for a spacer before a continued table-cell paragraph
  so the spacer is not duplicated across continuation pages.
- Added regression coverage for padded table cells where padding reduces split
  capacity while paragraph line accounting remains contiguous.
- Added regression coverage for tall repeated table headers that consume most of
  the page height while a breakable body row still makes progress and preserves
  continuation line accounting.
- Updated current suite snapshots and fixture ownership docs after adding the
  table pagination tests.

Files changed:

- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
  passed: 40 table pagination tests.
- `npm.cmd test` passed: 19 core test files / 279 core tests, plus 2 app test
  files / 21 app tests.
- `npm.cmd run type-check`

Notes / follow-ups:

- No production behavior was changed in this slice.
- The next useful table split hardening pass can target proven edge failures
  only, such as too-large padding, repeated-header starvation, or span-specific
  continuation behavior.

### Tighten Agent Precheck And Runtime Guardrails

Goal: Apply follow-up documentation review findings so future agents have less
room to misread orientation, verification, font, alias, binding, or test-count
rules.

Completed:

- Aligned the new-session read order between `docs/DOCS_INDEX.md` and
  `docs/AGENT_WORKFLOW.md`.
- Added an "Agent Precheck Before Editing" section covering task-area
  identification and hard never-rules before editing.
- Added repository-context rules for shell-specific npm commands, repository
  root execution, honest verification reporting when dependencies/config are
  missing, `@/*` path aliases, and the authoritative runtime font location.
- Documented that `public/fonts/THSarabun.ttf` is the runtime font source of
  truth; `src/fonts/THSarabun.ttf` should not be used unless the font loading
  contract changes.
- Documented current binding as scalar `fieldRef` resolution only, with repeat
  behavior intentionally deferred.
- Reduced fragile per-file test-count wording in current checklists so exact
  counts come from the test runner and `docs/FIXTURE_CATALOG.md`.
- Removed leftover count-update wording from the layout checklist addendum so
  agents do not treat historical per-file totals as current truth.
- Removed placeholder-style doc path wording from work log verification notes to
  avoid false positives in simple doc reference scanners.
- Reworded checklist responsibility guidance so agents update coverage snapshots
  only when suite size or coverage ownership meaningfully changes.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to existing
  files.

### Add P1 Verification And Fixture Docs

Goal: Add the next layer of practical documentation so browser checks, export
renderer expectations, and fixture ownership are easy to find before returning
to table/cross-page implementation work.

Completed:

- Added `docs/BROWSER_SMOKE_CHECKLIST.md` with focused manual/browser check
  steps for load/status, paragraph inline edit, split continuation edit, table
  cell selection, table operations, and export/status feedback.
- Added `docs/EXPORT_RENDERER_CONTRACT.md` covering the API export boundary,
  renderer non-responsibilities, PDF authority, DOCX exchange limitations, font
  fallback behavior, required product behaviors, and verification expectations.
- Added `docs/FIXTURE_CATALOG.md` mapping product fixtures and current core/app
  test files to the behaviors they protect, including known coverage gaps.
- Linked the new P1 docs from the docs index, test strategy, agent workflow,
  product direction, architecture overview, editor UX contract, engineering
  principles, product scenarios, layout spec, and layout checklist.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DOCS_INDEX.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck.
- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to existing
  files.

### Add P0 Documentation Map And Editor Architecture Contracts

Goal: Add the highest-priority documentation that makes the repo easier to
orient: a docs map, an architecture overview, and an editor UX contract.

Completed:

- Added `docs/DOCS_INDEX.md` as the documentation entry point with source of
  truth mapping, task-based reading paths, work log policy, and conflict
  resolution order.
- Added `docs/ARCHITECTURE_OVERVIEW.md` describing the current app/core/API/
  pagination/renderer layers, runtime flows, editor state ownership, and
  high-risk boundaries.
- Added `docs/EDITOR_UX_CONTRACT.md` defining editor interaction expectations
  for selection, inline editing, undo/redo, table editing, preview reconciliation,
  status feedback, browser smoke checks, and accepted limitations.
- Linked the new P0 docs from product direction, agent workflow, engineering
  principles, layout spec, layout checklist, and test strategy.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck.
- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to existing
  files.

### Recheck Docs Against Current Repo State

Goal: Make the current documentation match the repository's actual behavior,
test counts, and newly added direction/workflow contracts before adding more
future roadmap content.

Completed:

- Rechecked all files under `docs/` and separated current-status docs from
  historical `WORK_LOG.md` entries so older test counts remain historical rather
  than being rewritten.
- Updated `docs/LAYOUT_ENGINE_SPEC.md` to remove stale open questions for
  decisions already made: paragraph fragment identity, widow/orphan behavior,
  and basic table-cell continuation.
- Updated `docs/LAYOUT_ENGINE_SPEC.md` to describe current paragraph fragment
  metadata (`fragmentIndex`, `lineStart`, `lineEnd`, `continuesFrom`,
  `isContinued`) and current keep-rule status.
- Updated `docs/TEXT_REFLOW_PLAN.md` so UTF-16 offsets and acceptable temporary
  browser/server drift are recorded as resolved instead of open questions.
- Linked text docs to the current product direction and test strategy.
- Updated `docs/TEST_STRATEGY.md` with the current verified suite size:
  19 core test files / 274 core tests and 2 app test files / 21 app tests.
- Reworded the split-paragraph inline editing item in
  `docs/LAYOUT_ENGINE_CHECKLIST.md` from active "IN PROGRESS" to open
  hardening work, with current status focused on continuation-fragment UX.
- Verified all explicit docs markdown references point to existing files.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEST_STRATEGY.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/TEXT_REFLOW_PLAN.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to existing
  files.

### Add Test Strategy And QA Playbook

Goal: Make test expectations explicit so future work can choose the right
verification level instead of guessing between unit tests, fixtures, browser
checks, and product scenarios.

Completed:

- Added `docs/TEST_STRATEGY.md` covering schema/operation tests, pagination
  fixtures, renderer smoke tests, app-level unit tests, browser smoke checks,
  product scenario fixtures, risk-based verification, Definition of Done,
  current coverage strengths/gaps, and command reference.
- Linked the strategy from agent workflow, engineering principles, product
  direction, product scenarios, and layout checklist.
- Made browser smoke checks explicit as the current guard for editor UX qualities
  such as selection, text visibility, undo/redo intent, layout errors, flicker,
  jumps, and unwanted scroll.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck.
- `git diff --check`

### Add Agent Workflow Contract

Goal: Document the collaborator role for Codex-style sessions so future work
knows what to read first, when to update docs, how to verify changes, and when
to write the work log.

Completed:

- Added `docs/AGENT_WORKFLOW.md` covering role, start-of-session orientation,
  during-work habits, documentation responsibilities, verification bar, browser
  checks, work log shape, commit policy, and end-of-task expectations.
- Linked the workflow from work log, engineering principles, product direction,
  and layout checklist.
- Made the rule explicit that meaningful behavior/layout/editor/export/test/doc
  work should leave a work log entry, while tiny mechanical changes may skip it.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck.
- `git diff --check`

### Add Product Direction North Star

Goal: Document that FlowDocEditor is intended to grow from document generation
into a workflow-ready editor, so future implementation choices do not optimize
only for export.

Completed:

- Added `docs/PRODUCT_DIRECTION.md` with the product north star, current product
  shape, accepted limitations, long-term non-goals, decision bias, and links to
  the supporting docs.
- Linked the product direction from product scenarios, engineering principles,
  layout engine spec, and layout checklist.
- Made the editor-quality bar explicit: interaction stability, predictable
  selection, trustworthy undo/redo, stable table operations, documented
  page-break behavior, and authoritative PDF output.

Files changed:

- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck.
- `git diff --check`

### Recheck Table Docs Before Cross-Page Work

Goal: Bring documentation back in sync after table editing work grew beyond the
existing checklist.

Completed:

- Added a dedicated table editing contract covering table ownership, authored
  model rules, editor selection behavior, editable props, row/column operation
  rules, pagination-related props, verification expectations, and deferred work.
- Linked the new contract from the layout engine spec, cross-page behavior
  contract, layout checklist, product scenarios, and engineering principles.
- Updated the layout checklist to include column width preservation after
  insert/delete operations and to reflect the current 35 table pagination tests.
- Updated product scenarios so customs-style fixed tables require stable column
  insert/delete width behavior and direct table-cell editing from the canvas.
- Updated engineering principles to treat table column insert/delete as
  structure-preserving operations, not implicit table resize actions.

Files changed:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck against the current table editor/code changes.
- `git diff --check`

Notes / follow-ups:

- Next cross-page table work should update both
  `docs/CROSS_PAGE_BEHAVIOR.md` and `docs/TABLE_EDITING_CONTRACT.md` whenever
  pagination or authoring behavior changes.

### Make Table Editing Usable From Canvas

Goal: Improve the first table editing slice before starting cross-page table
pagination work.

Completed:

- Made table cells selectable from the canvas even when the click lands on the
  paragraph fragment rendered inside the cell.
- Kept normal body paragraph click-to-edit behavior, while table cell
  paragraphs now select the parent cell on single click.
- Added table-cell double-click support that opens inline edit on the first
  paragraph inside the cell.
- Expanded the table-cell property panel with text editing, padding,
  background, vertical alignment, row insertion, column insertion, column
  deletion, and row deletion controls.
- Added table-level header row count editing and row-level page-break toggling
  to expose pagination-related table settings before implementing page splits.
- Changed column insertion to split the target column width, and column
  deletion to transfer the removed width to a neighbor, so table operations keep
  the overall table width stable.
- Added regression coverage for add/remove column width preservation.

Files changed:

- `docs/WORK_LOG.md`
- `packages/core/src/document/operations.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- Browser verification on `http://localhost:4000/editor`:
  - Selected a table cell directly from the canvas and confirmed the
    `TABLE-CELL` panel appears instead of the paragraph panel.
  - Edited table cell text through the cell panel.
  - Inserted a column to the right and confirmed the table outline updated.
  - Deleted a column and confirmed the table returned to the previous column
    count.
  - Confirmed no layout error appeared during the flow.

Notes / follow-ups:

- Next table work should focus on cross-page behavior: single paragraph cells,
  row break policy, repeated header rows, and split rendering/export parity.

### Make Inline Edit Undo Transactional

Goal: Make undo/redo treat one inline paragraph edit session as a single history
step instead of one step per text update.

Completed:

- Added an inline edit transaction snapshot that captures the document and text
  before edit mode starts.
- Changed inline text typing to update the live document as a draft without
  pushing every keystroke or typed chunk into undo history.
- Committed the transaction when inline edit ends, pushing one history entry only
  if the paragraph text changed.
- Routed root-level Escape through the same inline edit end path so it cannot
  bypass transaction commit.
- Stored the current pagination snapshot with undo/redo history entries so redo
  restores the same canvas layout that was previously visible instead of
  measuring a new transient layout.
- Committed a final after-edit browser-pagination snapshot when inline edit
  ends, including no-text-change exits, so redo restores the normal display
  layout rather than a temporary inline-edit geometry snapshot.
- Kept the editor canvas on browser-preview pagination after authoritative
  `/api/paginate` succeeds; server pagination now feeds status/drift/export
  truth without overwriting the visual layout used by inline editing.
- Reused the currently displayed paragraph fragment lines when entering inline
  edit without text changes, so the first edit frame starts from the exact same
  glyph layout as normal paragraph display.
- Added an explicit "text was edited in this session" flag for inline editing.
  After the first input, edit preview measures from the live textarea value even
  when the document draft has already caught up, preventing newly typed text
  from appearing invisible behind stale fragment lines.
- Removed the old layout-loading live-text overlay that could draw the full
  paragraph on the first displayed line while authoritative pagination was
  reconciling.
- Hydrated preview pagination with the editor's browser measurer on document
  load/new-document actions so the canvas does not briefly render a new document
  through the previous layout.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- Browser verification on `http://localhost:4000/editor`:
  - Reset to a clean document with `New`.
  - Typed a paragraph in three separate chunks during one inline edit session.
  - Confirmed `Undo` stayed disabled during the uncommitted edit.
  - Ended edit with Escape, then confirmed one `Undo` cleared the full paragraph
    and one `Redo` restored the full paragraph.
  - Repeated the redo check with keypress-driven input and confirmed the DOM had
    the full redone paragraph immediately after the redo click and after settle.
  - Re-ran the focused canvas edit path after storing pagination snapshots in
    history, then confirmed the paragraph returned after redo and entering edit
    again did not change the text line layout.
  - Re-ran a soft-wrapped paragraph case after removing the loading overlay and
    confirmed the normal/edit inner text crops kept the same line layout; the
    remaining screenshot byte difference was from edit border/chrome.
  - Typed into the scoped inline textarea while edit mode stayed active and
    confirmed the DOM contained the new text and the canvas showed the typed
    glyphs immediately.
  - Restarted the local dev server after it had stopped, reloaded the browser,
    and confirmed the final DOM had no `layout error`, `preview layout`, or
    `layout...` indicator during the redo check.
  - Earlier browser logs still contained `Failed to fetch` entries from the
    period when the dev server was down; no final visual error badge remained
    after restart.

### Align Inline Edit Visual Text With Core Layout

Goal: Reduce the snap between inline edit mode and normal paragraph display when
typing enough text to create a soft-wrapped line.

Completed:

- Kept the native textarea as the input/caret surface, but made its glyphs
  transparent during edit mode.
- Added a core-measured SVG text overlay during edit mode so the visible text is
  positioned with the same measured-line rules used by normal display.
- Measured the live textarea value locally so soft-wrap changes update the edit
  overlay immediately while typing.
- Included core-measured edit height in the active edit height calculation so
  the editor frame can grow according to the normal text layout, not only the
  browser textarea's native wrapping.
- Preserved continuation-fragment text slicing and full-paragraph reconstruction
  from the continuation edit tests.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser verification on `http://localhost:4000/editor`:
  - Kept the dev server running and reloaded the editor without the
    layout-error state.
  - Opened a soft-wrap paragraph edit case and confirmed edit mode renders the
    visible text through the measured SVG overlay while the textarea remains the
    input surface.
  - Replaced the active paragraph with a long no-newline Thai probe, then typed
    additional text until the paragraph soft-wrapped during edit mode.
  - Exited inline edit and confirmed the normal paragraph display kept the same
    line layout/frame shape as the edit overlay, with no new console errors.

### Add Continuation Inline Edit Tests

Goal: Make the split-paragraph inline edit continuation case reachable by tests
before changing the editor UX further.

Completed:

- Extracted `getContinuationEditState` from `ParagraphTextSurface` so the
  continuation text/caret calculation can be tested without a browser harness.
- Added app tests covering first-fragment editing, continuation-fragment text
  slicing, caret adjustment, caret clamping, full-text reconstruction after a
  continuation edit, and missing segment-offset fallback.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run test:app`
- `npm.cmd test`
- Browser sanity: reloaded `http://localhost:4000/editor`; console warning/error
  logs were empty.

### Default Table Rows To Breakable

Goal: Make normal single-row table groups split across page boundaries by default
while preserving explicit keep-together behavior.

Completed:

- Changed `paginateTable` so omitted `allowBreak` is treated as `true` for
  single-row groups.
- Fixed the split-row path so advancing because the remaining page space is below
  the minimum split height still repeats table headers before placing the row on
  the continuation page.
- Updated the table row schema comment to document `allowBreak` defaulting to
  breakable behavior.
- Added regression coverage for the new default split behavior and for explicit
  `allowBreak=false` whole-row movement.
- Updated cross-page behavior docs, product scenarios, and checklist status.

Files changed:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/schema/table.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- Browser sanity: reloaded `http://localhost:4000/editor`; console warning/error
  logs were empty.

### Add Full Table-Cell Paragraph Metadata

Goal: Keep table-cell paragraph metadata consistent between normal row placement
and breakable row continuation.

Completed:

- Updated `pushTableCellContents` so full table-cell paragraph fragments expose
  `lineStart`, `lineEnd`, `continuesFrom=false`, and `isContinued=false`.
- Added a regression test for full table-cell paragraph line metadata.
- Updated the cross-page behavior contract and checklist counts.

Files changed:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- Browser sanity: reloaded `http://localhost:4000/editor`; console warning/error
  logs were empty.

### Add Table-Cell Continuation Metadata

Goal: Make table-cell paragraph splits easier to inspect and align them with the
cross-page behavior contract.

Completed:

- Updated `pushCellSlice` so paragraph fragments created inside breakable table
  rows expose `lineStart`, `lineEnd`, `continuesFrom`, and `isContinued`.
- Added a table pagination regression test that verifies table-cell paragraph
  continuation metadata is contiguous and reaches the original line count.
- Updated cross-page behavior docs, product coverage notes, and checklist counts.

Files changed:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- Browser sanity: reloaded `http://localhost:4000/editor`; console warning/error
  logs were empty.

### Define Cross-Page Behavior Contract

Goal: Make current page-boundary support explicit before expanding paragraph,
row/column, and table cross-page behavior.

Completed:

- Added `docs/CROSS_PAGE_BEHAVIOR.md` as the shared contract for current
  cross-page behavior, overflow fallbacks, fragment metadata, and deferred work.
- Linked the contract from `LAYOUT_ENGINE_SPEC.md`.
- Updated `LAYOUT_ENGINE_CHECKLIST.md` with the completed contract item and the
  new row/stack coverage count.
- Updated `PRODUCT_SCENARIOS.md` coverage matrix with the current row/column
  atomic behavior.
- Added a row/stack regression test proving that paragraph content inside a
  stack does not split independently from its row.

Files changed:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/rowStack.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/rowStack.test.ts`
- `npm.cmd test`
- Browser sanity: reloaded `http://localhost:4000/editor`; console warning/error
  logs were empty.

### Align Product Scenario Coverage Notes

Goal: Make docs/test coverage read as one picture after completing the product
fixture roadmap.

Completed:

- Updated `PRODUCT_SCENARIOS.md` acceptance sections with current automated
  coverage notes.
- Added a scenario coverage matrix that separates structural pagination, DOCX XML
  structure, smoke coverage, and missing visual/semantic coverage.
- Clarified that product fixtures cover pagination/structure behavior, while
  PDF visual/page-count golden tests remain future visual regression work.
- Clarified that DOCX fixture coverage checks section/page boundaries and
  editable text presence, not semantic Word heading styles.
- Updated `LAYOUT_ENGINE_CHECKLIST.md` multi-section test count and product
  fixture coverage wording.
- Updated current checklist counts for table pagination and keep-with-next tests.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test`

### Add Report DOCX Structure Fixture

Goal: Cover the report scenario where DOCX output should preserve useful
editable structure across cover, TOC, and body sections.

Completed:

- Added `product fixture — report-docx-structure` to `multiSection.test.ts`.
- The fixture builds a cover section, TOC section, and body section with
  `pageNumberStart=1`, renders DOCX, and inspects `word/document.xml`.
- Verifies the DOCX has a ZIP header, emits the expected number of Word section
  properties, and includes cover title, TOC title, body heading, and editable
  body paragraph text.
- Updated `PRODUCT_SCENARIOS.md` to mark the fixture covered.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/renderer/__tests__/multiSection.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- renderer/__tests__/multiSection.test.ts`
- `npm.cmd test`

### Add Report Keep-With-Next Fixture

Goal: Cover the report scenario where a heading near the bottom of a page must
move with its following paragraph.

Completed:

- Added `product fixture — report-keep-with-next` to `keepWithNext.test.ts`.
- The fixture fills most of a page, then places a Thai heading with
  `headingLevel=1` and `keepWithNext=true` before a following body paragraph.
- Verifies the heading moves to the next page instead of being stranded at the
  bottom of the previous page, stays on the same page as the following paragraph,
  and `assertPaginatedDocument` passes.
- Updated `PRODUCT_SCENARIOS.md` to mark the fixture covered.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/keepWithNext.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/keepWithNext.test.ts`
- `npm.cmd test`

### Add Customs Breakable Uneven Row Fixture

Goal: Cover customs rows where one description cell is much taller than short
numeric cells and the row is allowed to break across pages.

Completed:

- Added `product fixture — customs-breakable-row-uneven-cells` to
  `tablePagination.test.ts`.
- The fixture creates a repeated-header table with one `allowBreak=true` body row:
  short number cell, long Thai description cell, and short amount cell.
- Verifies the body row spans multiple pages, description text is preserved
  across split fragments, short number/amount cells render only once, repeated
  headers appear on continuation pages, and `assertPaginatedDocument` passes.
- Updated `PRODUCT_SCENARIOS.md` to mark the fixture covered.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`

### Add Customs Rowspan Boundary Fixture

Goal: Cover the customs scenario where a rowspan-linked group lands near the
bottom of a page.

Completed:

- Added `product fixture — customs-rowspan-boundary` to `tablePagination.test.ts`.
- The fixture fills most of the first page, then places a table with a repeated
  header and a two-row rowspan group.
- Verifies the rowspan group moves to the next page as a unit, both linked rows
  remain on the same page, row order/geometry is contiguous, and
  `assertPaginatedDocument` passes.
- Updated `PRODUCT_SCENARIOS.md` to mark the fixture covered.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`

### Add Customs Basic Table Fixture

Goal: Turn the first customs product scenario fixture into an executable table
pagination regression test.

Completed:

- Added `product fixture — customs-basic-table` to `tablePagination.test.ts`.
- The fixture builds a multi-page customs-style table with `headerRowCount=1`
  and a footer paragraph containing an inline page number.
- Verifies table pagination spans at least two pages, the table header repeats
  on every table page, footer page numbers resolve on every table page, and
  `assertPaginatedDocument` passes.
- Converted `PRODUCT_SCENARIOS.md` fixture roadmap into a checked status list
  and linked covered fixtures to concrete tests.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`

### Add Report Cover TOC Body Fixture

Goal: Turn the report cover/TOC/body product scenario into an executable
multi-section regression test.

Completed:

- Added `product fixture — report-cover-toc-body` to `multiSection.test.ts`.
- The fixture builds a cover section, TOC section, and body section with
  `pageNumberStart=1`.
- Verifies three `PaginatedSection`s, body inline page number text (`หน้า 1`),
  TOC entries using restarted body page numbers, filled TOC lines, and
  `assertPaginatedDocument`.
- Updated `PRODUCT_SCENARIOS.md` so the fixture roadmap points to the concrete
  test coverage.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/renderer/__tests__/multiSection.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- renderer/__tests__/multiSection.test.ts`
- `npm.cmd test`

### Add Report Long Thai Paragraph Fixture

Goal: Turn the first product scenario fixture into an executable regression test.

Completed:

- Added `product fixture — report-long-thai-paragraph` to `paginator.test.ts`.
- The fixture uses a deterministic long Thai grapheme run, verifies it splits
  across multiple pages/fragments, joins all paginated line text back to the
  original source text, and passes `assertPaginatedDocument`.
- Updated `PRODUCT_SCENARIOS.md` so the fixture roadmap points to the concrete
  test coverage.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/paginator.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/paginator.test.ts`
- `npm.cmd test`

### Sync Docs With Current Engine Contracts

Goal: Remove stale doc claims found during a quick docs-vs-implementation recheck.

Completed:

- Updated TOC docs to describe the current two-pass overflow repagination policy.
- Updated text editing docs to reflect the current textarea-owned inline edit path
  with live height/geometry tracking, instead of the older measured-line patch path.
- Added `pageNumber` to the documented `LineSegment.kind` contract.
- Clarified API/export boundary wording so it matches current route behavior.
- Updated stale page-number placeholder comments from `"0"` to `"00"`.
- Relaxed the paragraph fragment metadata type comment so it does not overclaim
  coverage for every paragraph placement path.

Files changed:

- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/TEXT_REFLOW_PLAN.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/schema/inline.ts`

Verification:

- `rg` stale-claim scan for old TOC/reflow/page-number wording.
- `npm.cmd test`

### Make Inline Shrink Move Column Siblings

Goal: Fix two inline-edit regressions: normal/edit wrapping drift after the overflow fix, and row/column preview height not shrinking when text is deleted.

Completed:

- Adjusted inline textarea wrapping from `overflow-wrap: anywhere` to `break-word`.
  - This still prevents long unbroken runs from escaping the edit box.
  - It is less aggressive than `anywhere`, so it stays closer to the core measured display wrapping.
- Fixed textarea height shrinking.
  - The height sync previously used the current fragment height as the minimum, so once a paragraph grew, deleting text could not reduce the reported height.
  - The minimum is now derived from one rendered line plus paragraph spacing.
- Fixed row/stack preview shrink inside columns.
  - When the edited paragraph changes height inside a stack, later sibling fragments in the same stack now shift by the paragraph height delta.
  - Row/stack height recomputation uses those adjusted sibling positions, so deleting lines can reduce the column preview instead of keeping the old content bottom.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Browser-checked the active column paragraph in `http://localhost:4000/editor`.

Notes:

- The current browser document appears to have a large authored row/stack minimum height after prior probing, so a reload can still show a tall empty column even when the paragraph itself is short. That is separate from the live delete/shrink preview path and should be handled as a row min-height UX/reset issue if it persists in normal use.

---

### Prevent Inline Text From Escaping Column Width

Goal: Stop long typed text from visually running outside the paragraph/column frame during inline editing.

Completed:

- Reproduced the active browser state where a long Thai run inside a column textarea could continue past the visible paragraph frame.
- Updated the inline edit textarea wrapping rule from normal overflow wrapping to `overflow-wrap: anywhere`.
  - This keeps long unbroken Thai/Latin runs inside the edit frame.
  - The setting better matches the core layout fallback that breaks overwide words into grapheme segments.
- Ran a multi-line probe in the browser and undid the temporary text afterward.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Browser-checked `http://localhost:4000/editor` at 206% zoom with the active column paragraph.

Notes:

- This fixes the horizontal escape while editing. Extremely tall row/column content is still governed by the current row/stack pagination policy, where rows are atomic and do not split independently yet.

---

### Keep Row/Stack Preview Height In Sync During Inline Edit

Goal: Fix the observed editor state where a paragraph inside a column grew taller than its parent row/stack preview until the page was reloaded.

Completed:

- Browser-inspected the live editor state and reproduced the visual mismatch:
  - The selected paragraph in column 1 had grown downward.
  - Its parent row/stack still displayed at the old shallow height.
- Confirmed a page reload recalculated the row correctly, which points to stale interactive preview geometry rather than core row pagination.
- Updated `resizeFragmentHeightAndShift` so inline edit height changes inside row/stack columns:
  - recompute the natural preview height for every stack in the row,
  - update the row height and all row stack heights together,
  - shift fragments below the row by the row height delta,
  - support both growth and shrink while respecting row `minHeight` and stack minimum height.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- rowStack`
- `npm.cmd test`
- Browser-checked `http://localhost:4000/editor`:
  - Reloaded the saved document and confirmed core pagination renders the row/stack at the tall paragraph height.
  - Typed additional long text into the column paragraph and confirmed the row/stack preview stayed aligned with the paragraph height.

Notes:

- This is still an editor preview guardrail. The long-term direction remains moving interactive layout behavior out of `EditorShell` into a clearer shared contract.

---

### Clarify Inline Edit Pagination Contract

Goal: Make inline edit exit reconcile from the latest document state instead of relying on a potentially stale blur-handler snapshot.

Completed:

- Documented the inline edit contract directly in `EditorShell`:
  - While editing, the textarea owns active paragraph text/caret wrapping.
  - The editor may apply geometry-only height shifts to prevent neighboring fragments from overlapping.
  - After edit mode exits, preview pagination settles from the latest rendered document snapshot.
- Changed `handleInlineEditEnd` to only leave edit mode and clear caret/page edit state.
- Added an effect that detects the transition from editing to not editing, then runs browser preview pagination from the current `previewDoc`.
- Cleared `inlineEditPageIndex` on edit end, Escape, split/merge focus transitions, mode switch, and resize/margin interactions so page-scoped edit state does not leak into later interactions.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Browser-tested inline edit exit:
  - Opened paragraph edit.
  - Added a temporary `settleprobe` marker.
  - Pressed Escape.
  - Confirmed the textarea closed and the marker remained after layout settle.
  - Reopened the paragraph and removed the marker.

Notes:

- This reduces one source of snap-back risk: blur/end edit no longer paginates from a callback closure that may predate the final input event.
- The broader long-term target remains extracting a dedicated interactive-layout contract/module out of the React shell.

---

### Add Pagination API Diagnostics

Goal: Make `/api/paginate` and export pagination failures actionable before continuing deeper core fixes.

Completed:

- Wrapped `paginateDocument(...)` in `/api/paginate` with explicit error handling.
  - Unexpected core pagination throws now return `{ error: "Pagination failed", detail }` instead of an opaque 500.
- Applied the same pagination error handling to `/api/export`.
- Updated the editor's authoritative pagination fetch to include the response body in the thrown error.
  - Console errors now include API detail instead of only `paginate failed: 500`.

Files changed:

- `src/app/api/paginate/route.ts`
- `src/app/api/export/route.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Posted a minimal valid document to `http://localhost:4000/api/paginate`; route returned `200`.

Notes:

- The current browser document no longer showed the earlier `layout error` badge during this pass, so the original failing document was not available to reproduce directly.
- Browser-use blocks `javascript:` URLs, so localStorage extraction from the page was intentionally not pursued further.
- If the badge appears again, the browser console should now include the exact API error body needed to build a focused core regression.

---

### Add Editor Zoom Controls

Goal: Add usable zoom controls to the editor canvas without fighting the existing auto-fit behavior.

Completed:

- Added toolbar zoom controls:
  - `-` zoom out
  - percent button resets to 100%
  - `+` zoom in
  - `Fit` returns to auto-fit page width
- Added keyboard shortcuts outside text inputs:
  - `Ctrl/Cmd + +` zoom in
  - `Ctrl/Cmd + -` zoom out
  - `Ctrl/Cmd + 0` reset to 100%
- Hooked `Ctrl/Cmd + wheel` to document zoom.
  - The editor prevents the browser's default page zoom while the pointer is inside the editor.
  - Text inputs and textareas keep their native wheel behavior.
  - A non-passive native wheel listener is used so `preventDefault()` is honored reliably.
- Split zoom behavior into `fit` and `manual` modes.
  - Auto-fit now only runs while `Fit` mode is active.
  - Manual zoom is not overwritten by `ResizeObserver`.
- Adjusted zoom to feel like document zoom:
  - Increased zoom step for clearer visual feedback.
  - Raised max zoom to 400%.
  - Made the canvas stage size track the scaled page width so larger zoom levels create real canvas scrolling.
  - Kept pages centered while they still fit within the viewport.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Browser-tested zoom on `http://localhost:4000/editor`:
  - Fit scale showed `56%` with page width `334`.
  - First `+` changed page width to `481.95` (`81%`).
  - Second `+` changed page width to `630.7` (`106%`) and made canvas scrolling visible.
  - Percent reset changed page width to `595` (`100%`).
- Added Ctrl/Cmd-wheel hook after the browser test. Automated wheel-modifier simulation did not trigger in the in-app browser tool, so this path is covered by type-check/test plus implementation review.

Notes:

- Zoom range is currently clamped to 30%-400%.
- The controls are intentionally compact to fit the current dense editor toolbar.

---

### Tune Paragraph Edit Chrome Spacing

Goal: Make inline paragraph edit mode feel visually closer to normal paragraph rendering while giving the edit outline a little breathing room.

Completed:

- Anchored edit text to the core fragment text origin.
  - The textarea `foreignObject` now expands 3px left and right.
  - The textarea receives matching 3px horizontal padding, so the text origin remains aligned with the normal paragraph render.
- Added `display: block` to the textarea to avoid inline element baseline quirks inside `foreignObject`.
- Kept paragraph `spacingBefore` and `spacingAfter` as the vertical padding source.
- Prevented edit-mode height from growing on click/focus alone.
  - Focus and selection now only reset textarea scroll.
  - Textarea height sync runs only after input has established an explicit edit height.
  - This avoids the first click into a paragraph adding a blank extra line because native textarea `scrollHeight` is slightly larger than the core fragment height.
- Set the inline edit textarea to `rows={1}`.
  - Native textarea defaults to two rows, which made a one-line paragraph jump to a two-line `scrollHeight` on the first input event.
  - This was the cause of a one-line paragraph gaining a confusing extra line while typing.
- Stopped core/browser pagination from reflowing the active paragraph while inline editing.
  - The active paragraph now treats the textarea as the UX truth until edit ends.
  - The editor no longer patches active paragraph lines/heights with core-measured lines on every input.
  - The debounced full browser pagination now skips while an inline editor is active.
  - On blur/end edit, the document is paginated once to reconcile back to core layout.
- Added vertical editor chrome for paragraph blocks without changing document layout.
  - Normal paragraph background/selection chrome now extends 3px above and below the core fragment.
  - Edit `foreignObject` extends 3px above and below the core fragment with matching textarea vertical padding.
  - Text origin remains anchored to the core layout position; only the editor chrome gets breathing room.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 260 core tests + 16 app tests.
- Browser-use verification on `http://localhost:4000/editor`:
  - Single-clicked a visible Thai paragraph and confirmed inline edit opened.
  - Confirmed textarea style includes `padding: 0px 3px 5.32437px`.
  - Confirmed the edit `foreignObject` width expands beyond the original fragment while the text remains the same active paragraph.
  - Single-clicked a long wrapped paragraph and confirmed initial edit height stayed at the core fragment height (`77.20`) on entry instead of growing immediately.
  - Confirmed edit chrome now reports vertical breathing room (`padding: 3px 3px 8.32437px`) and a taller `foreignObject` while preserving the active paragraph text.
  - Confirmed a one-line Thai paragraph stays at height `23.30` after typing one character and returns to the same height after Backspace.
  - Confirmed typing a long marker in a one-line paragraph grows the textarea from `23.30` to `47`, remains stable after waiting beyond the old 200ms pagination debounce, and returns to `23.30` after Backspace cleanup.

Notes:

- The chosen anchor is the core fragment text origin. The edit outline is allowed to be slightly wider than the render fragment, but the editable text should not shift horizontally.

---

### Single-Click Paragraph Editing

Goal: Make paragraph editing feel more document-like by entering inline edit on a single click, while preserving drag behavior through the existing movement threshold.

Completed:

- Added a pending click action to document-fragment pointer handling.
  - Paragraph pointer down now records the clicked caret position and page index.
  - If the pointer is released without exceeding the drag threshold, the paragraph enters inline edit immediately.
  - If the pointer moves more than the existing 5px threshold, the same pending interaction becomes a drag as before.
- Kept non-paragraph nodes on the existing click-to-select behavior.
- Left double-click edit support in place as a harmless fallback.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 260 core tests + 16 app tests.
- Browser-use verification on `http://localhost:4000/editor`:
  - Single-clicked the visible Thai paragraph `ดกดกดกด`.
  - Confirmed one active `foreignObject textarea` opened immediately with text `ดกดกดกด`.
  - Pressed Escape and confirmed the inline editor closed.

Notes:

- Drag still depends on the existing pointer movement threshold. A later UX pass could add explicit drag handles if single-click editing makes direct paragraph dragging feel too easy to trigger accidentally.

---

### Stabilize Inline Edit Reflow While Typing And Deleting

Goal: Fix inline editing drift where multi-line paragraphs could show duplicated/misplaced lines and deletion did not always reflow immediately when a visual line disappeared.

Completed:

- Removed the editor's partial head/tail paragraph reflow path during inline editing.
  - The previous path reused head lines but called `measureParagraphFrom`, which re-measures from the containing hard line rather than the exact visual line.
  - For wrapped multi-line paragraphs, that could append already-rendered content again and make typed text placement drift.
- Kept immediate local reflow, but now it re-measures the active paragraph as a whole on every text change.
  - This is simpler and matches the current core measurement contract.
  - Hard events still trigger immediate full browser pagination when line count changes, so deleting enough text to remove a line should shift surrounding fragments without waiting for the debounce.
- Preserved the caret tracking and edit-start line-count baseline added for the flicker regression.
- Allowed the active edit fragment height to shrink as well as grow.
  - The editor previously kept the maximum height seen during the edit session, which left empty visual lines after deleting text.
- Reset textarea internal scroll after focus/input/selection.
  - The textarea text is transparent while SVG text is visible; stale textarea scroll can make the caret appear on the wrong visual line even when the stored text/caret index is correct.
- Changed active inline editing to render visible text from the textarea instead of from the SVG line overlay.
  - The previous design mixed two wrapping engines: SVG/core lines for visible text and browser textarea wrapping for caret/selection.
  - Thai word wrapping can differ between those layers, causing the caret to look like it is on the right column but wrong line, and causing typed text to appear to jump between lines.
  - During edit mode, textarea is now the visual source so caret, selection, and text rendering stay in the same browser layout model.
- Let the editing foreignObject grow to the textarea's `scrollHeight` while typing.
  - This prevents the native caret/text layer from clipping when browser wrapping temporarily needs more height than the core preview fragment.
- Fixed textarea content-height measurement so Backspace can shrink the editor again.
  - `syncTextareaHeight` now temporarily sets the textarea height to `auto` before reading `scrollHeight`.
  - Without this, a `height: 100%` textarea could report the old stretched height, leaving empty lines after deletion.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 260 core tests + 16 app tests.
- Browser-use verification on `http://localhost:4000/editor`:
  - Opened the user's current local document and reproduced the editor state with a long Thai paragraph.
  - Confirmed the active editor is now a single `foreignObject textarea` with visible text color instead of transparent text.
  - Typed into the active paragraph and confirmed text stayed in the textarea/editor path; removed the temporary typed text after verification.
  - Ran a Backspace shrink probe:
    - Added a long temporary marker to the active paragraph and confirmed `foreignObject` height grew from `65.22` to `280.86`.
    - Pressed Backspace for the full marker length and confirmed the marker was removed, text returned exactly, and height shrank back to `65.22`.

Notes:

- This is a correctness-first fix. If paragraph-level reflow later needs to be optimized again, it should use a core API that returns a true visual-line tail, not a hard-line tail.
- The user's current local document still reports `/api/paginate` layout assertion failure (`layout error` badge). The browser preview remains usable, but server/authoritative pagination should be investigated separately.
- Follow-up browser observation: editing now keeps caret/text together, but there can still be a perceptible snap between textarea wrapping during edit mode and SVG/core wrapping after blur. That is a remaining layout-model mismatch, not the previous caret-layer corruption.

---

### Prevent Inline Edit Enter From Triggering Reflow

Goal: Reduce flicker when clicking into an existing paragraph for inline editing without changing text.

Completed:

- Updated the editor local reflow effect so it runs on `previewDoc` changes only.
  - Entering edit mode by changing `inlineEditNodeId` no longer re-measures and patches paragraph lines immediately.
  - Text changes still update `previewDoc`, so local reflow still runs while typing.
- Updated the authoritative pagination effect so it also runs on `previewDoc` changes only.
  - Clicking into or out of edit mode no longer schedules a server pagination request by itself.
  - Existing refs still let scheduled pagination see the current edit state when text changes.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 260 core tests + 16 app tests.

Notes:

- This specifically targets the "click paragraph, it flashes/re-renders, then returns" behavior caused by edit-mode state changes triggering layout work without document changes.
- Browser/local reflow remains an approximation while typing; the next larger cleanup is still to extract an explicit interactive layout contract.

---

### Guard Plain-Text Paragraph Operations

Goal: Prevent plain textarea-style operations from corrupting paragraphs that contain structured inline nodes such as `fieldRef` or `pageNumber`.

Completed:

- Added plain-text paragraph safety helpers in `operations.ts`.
  - A paragraph is editable by these operations only when every child is a text run.
  - Plain text updates collapse multiple text runs into a single text run.
  - Mixed inline paragraphs are left unchanged by `updateParagraphText`.
- Guarded `splitParagraphAtIndex`.
  - Splits only plain-text paragraphs.
  - Uses the full concatenated text across text runs.
  - Produces single-text-run paragraph fragments.
  - Mixed inline paragraphs no-op and return `newNodeId: ""`.
- Guarded `mergeParagraphWithPrevious`.
  - Merges only when both current and previous paragraphs are plain text.
  - Uses the full concatenated text of both paragraphs.
  - Produces one text run in the merged paragraph.
  - Mixed inline paragraphs return `null`.
- Preserved table plain-text editing.
  - Plain text paragraphs inside `table.nodes` can still be updated.
  - Mixed inline table paragraphs are protected by the same guard.
- Added operation unit tests covering plain text, multiple text runs, `fieldRef`, `pageNumber`, split, merge, and table paragraph updates.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 260 core tests + 16 app tests.

Notes:

- This is a temporary safety policy, not the final segmented inline editor model.
- Plain textarea editing remains disabled by behavior for mixed inline paragraphs because the underlying operation no-ops. A later UI pass should make that policy visible before edit mode starts.
- Split/merge for table-internal paragraphs still needs a path-aware operation model; this patch only prevents corrupting mixed inline body paragraphs and keeps table plain-text updates safe.

---

### Rewrite Product Scenarios As Fixture-Oriented Specs

Goal: Make `PRODUCT_SCENARIOS.md` sharper and more useful as a product/testing guide, so scenarios can drive fixtures, acceptance checks, and renderer decisions.

Completed:

- Rewrote `PRODUCT_SCENARIOS.md` from broad narrative into fixture-oriented scenario specs.
- Added a scenario quality bar explaining what each product scenario should answer.
- Expanded `ใบขน (Customs Declaration Form)` with:
  - user goal and primary users
  - template shape
  - representative data
  - required engine capabilities
  - pagination expectations
  - export expectations
  - acceptance checks
  - known acceptable limitations
- Expanded `รายงานราชการ (Government Report)` with the same structure, including cover/TOC/body sections, `pageNumberStart=1`, TOC expectations, PDF/DOCX expectations, and DOCX structural checks.
- Added a cross-scenario comparison table.
- Added a fixture roadmap for future regression fixtures.
- Added a decision rule for resolving product/engine trade-offs against the two scenarios.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`

Verification:

- Reviewed the rewritten markdown for structure and consistency.
- No code changed; test suite not run for this documentation-only update.

Notes:

- The fixture roadmap intentionally names future test targets but does not create the fixtures yet.
- This document can now guide the next docs pass, especially `ARCHITECTURE.md`, `RENDERER_CONTRACT.md`, and a future fixture catalog.

---

### Preserve DOCX Multi-Section And Page Boundaries

Goal: Make DOCX export preserve structural section/page boundaries from `PaginatedDocument` instead of flattening all pages into one Word section.

Completed:

- Updated `DocxRenderer` to build one DOCX section per paginated page.
  - Each generated section receives that page's width, height, orientation, and margins.
  - Non-first generated sections use `SectionType.NEXT_PAGE`, preserving page boundaries in Word.
  - Headers and footers are built from each page's resolved header/footer fragments.
  - Empty pages receive a blank paragraph so the generated DOCX section is valid.
- Hardened DOCX grouping for continuation table fragments:
  - When a page contains table-row/table-cell continuation fragments without a table root fragment, the renderer creates a page-local table group from the parent table id.
  - This prevents continuation table rows from being mistaken for layout rows.
- Added DOCX structural tests that inspect `word/document.xml`:
  - Two document sections now emit two Word `<w:sectPr>` entries.
  - A multi-page document emits one Word section per paginated page.

Files changed:

- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/renderer/__tests__/multiSection.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 252 core tests + 16 app tests.

Notes:

- DOCX remains a structural/exchange renderer, not a pixel-perfect renderer. Word/LibreOffice can still reflow text and tables differently from PDF/editor preview.
- The renderer now preserves explicit section/page boundaries structurally; more advanced DOCX fidelity such as native repeated table headers, hard-newline preservation, and empty paragraph semantics can be handled in later focused passes.

---

### Recheck Docs Against Implementation And Fix Integration Bugs

Goal: Recheck the implementation against the layout/text engine docs and fix concrete mismatches that were likely causing editor and pagination bugs.

Completed:

- Fixed table-cell paragraph inline editing:
  - `ParagraphTextSurface` now finds paragraphs inside `table.nodes`, so opening a table-cell editor no longer starts from an empty textarea.
  - `EditorShell` local reflow now finds table-cell paragraphs, so typing in table cells can update the preview without waiting only for server pagination.
- Fixed `normalizeDocument` dropping authored props:
  - Preserves paragraph `headingLevel`.
  - Preserves paragraph `keepWithNext`.
  - Preserves row `minHeight`.
- Fixed breakable table row pagination:
  - Shorter cells that finish on an early slice are advanced to the end, preventing duplicated cell content on continuation pages.
  - Repeating table headers are inserted on continuation pages created inside `allowBreak` row splitting.
- Fixed page-number consistency:
  - Header/footer page-number fields are resolved per page and respect `pageNumberStart`.
  - TOC entries now use section-restarted page numbers instead of raw global page indices.
- Fixed placement integration:
  - Palette `table` sources are no longer treated as row-like by placement law.
  - Row hit geometry now advances stack rects by `gap`, matching layout geometry.
  - Field insertion can resolve table-internal paragraph fragments and insert field refs into them.
- Hardened API/export UX:
  - `/api/paginate` and `/api/export` return `400` for malformed JSON bodies.
  - Export UI checks `res.ok` before downloading, so JSON error responses are no longer saved as `.pdf`/`.docx` files.
- Updated checklist status for table-cell live preview.

Files changed:

- `packages/core/src/document/normalize.ts`
- `packages/core/src/document/operations.ts`
- `packages/core/src/document/normalize.test.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `packages/core/src/pagination/__tests__/sectionPageNumbers.test.ts`
- `packages/core/src/placement/law.ts`
- `packages/core/src/placement/geometry.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/api/paginate/route.ts`
- `src/app/api/export/route.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 250 core tests + 16 app tests.

Notes:

- Vitest still needs to run outside the sandbox in this environment; inside the sandbox it fails during Vite config loading with `spawn EPERM`.
- DOCX still has known structural limitations: it flattens paginated output more than the docs ultimately want. That was left for a separate, focused pass.
- Split paragraph continuation editing is improved from previous work but still needs manual UX testing around caret/Enter/Backspace behavior.

---

### Add Incremental Reflow From Edited Line + Alignment Fix in Editor

Goal: Make the editor's local reflow re-measure only from the caret's line forward instead of the full paragraph, and fix alignment in editor-side line building.

Completed:

- Added `buildParagraphFullText(node)` helper in `measure.ts` — extracts full text, fieldRanges, pageNumberRanges from a ParagraphNode. Shared between `measureParagraph` and `measureParagraphFrom`.
- Added `measureHardLines(fullText, ..., fromOffset)` internal helper — skips hard lines ending before `fromOffset`, measures from the containing hard line onward. Fixed skip condition to `hardLineEnd < fromOffset` (no extra conditions needed).
- Added `export function measureParagraphFrom(node, fromOffset, width, measurer, wb)` — returns `{ tailLines: MeasuredLine[], lineHeight }`. Exported from layout/index.ts via `export * from "./measure"`.
- Refactored `measureParagraph` to use the shared `buildParagraphFullText` + `measureHardLines` helpers (no behavior change).
- Updated `EditorShell.tsx`:
  - Imported `measureParagraphFrom` and `MeasuredLine`.
  - Fixed `buildLocalLines` to apply alignment offset (center/right) matching `buildPaginatedLines` behavior.
  - Added `findCaretLineIndex(lines, caretIndex)` — finds which paginated line contains the caret (via segment offsets).
  - Added `buildTailLines(tailMeasured, headLines, fragmentX, align, fragmentWidth)` — positions tail lines from the Y position after the last head line.
  - Updated local reflow effect: when `caretLineIndex > 0`, reuses existing head lines and calls `measureParagraphFrom` for the tail; falls back to full `measureParagraph` when caret is on the first line.
  - Updated height computation in `replaceFragmentLines` call to use `newTotalHeight = fragment.height - existingLineHeight + newLineHeight` (spacing preserved).
- Cleaned up stale duplicate entry: marked `[ ] Widow/orphan control` in Later Work as `[x]` (done as Stage 2).
- Added 5 tests for `measureParagraphFrom` in `measure.test.ts`.

Files changed:

- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/__tests__/measure.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 244 core + 16 app = 260 tests passed.

Notes:

- `measureParagraphFrom` works at the hard-line granularity, not at the individual wrapped-line level. If the caret is within a long hard line that wraps many times, the entire hard line is re-measured. This is correct (wrapping is sequential within a hard line) and still saves measurement time when earlier hard lines are unchanged.
- The incremental path activates only when `caretLineIndex > 0` (caret is not on the very first line). First-line edits fall back to full measurement — already fast in practice.

---

### Implement Justify Alignment

Goal: Complete the paragraph alignment implementation by supporting `justify` — non-last lines stretch to fill the fragment width by distributing extra space between word segments.

Completed:

- Added `justifySegments(segments, lineWidth, fragmentWidth)` helper in `paginator.ts`. Counts space segments, computes `extra = (fragmentWidth - lineWidth) / spaceCount`, and adjusts each segment's x and width cumulatively. Segments with no spaces (unbreakable lines) are returned unchanged.
- Added `isLastFragment: boolean = true` parameter to `buildPaginatedLines`. For `align === "justify"`, only non-last lines of the last fragment are justified — the very last line of the paragraph is left-aligned (standard typographic rule).
- Updated `paginateParagraph`: fast path passes `isLastFragment = true`; split path passes the computed `isLastFragment` from the while loop.
- Updated PDF renderer (`renderer/pdf/index.ts`): when `align === "justify"` and line has segments, draws each non-space word segment individually at `line.x + seg.x`. Skips space segments (gap comes from x positions).
- Updated SVG `renderLine` in `ParagraphTextSurface.tsx`: when `align === "justify"` and line has segments, renders each non-space segment as a separate `<text>` element at `(line.x + seg.x) * scale`.
- Added 3 justify tests to `textFlow.test.ts`: non-last lines have segments stretched to fill fragmentWidth, last line is not stretched, assertPaginatedDocument passes.
- Imported `LineSegment` type in `paginator.ts` (needed for `justifySegments`).

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/renderer/pdf/index.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `packages/core/src/renderer/__tests__/textFlow.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 239 core + 16 app = 255 tests passed.

Notes:

- Justify works for English (space-separated words). Thai text with no space segments between words will fall back to left-alignment for those lines (correct behavior — Thai spaces are typically between phrases, not words).
- Lines within a split paragraph (non-last fragments) are all justified since they're mid-paragraph lines, not terminal lines.

---

### Fix Paragraph Alignment in Paginated Output

Goal: Bake text alignment offset into PaginatedLine.x so all renderers (PDF, DOCX, editor SVG) consume the correct visual position without recomputing it independently.

Completed:

- Modified `buildPaginatedLines` in `paginator.ts` to accept `align` and `fragmentWidth` params. For center: `x = fragmentX + (fragmentWidth - line.width) / 2`. For right: `x = fragmentX + fragmentWidth - line.width`. For left/justify: `x = fragmentX` (unchanged). Justify is left-aligned at this layer (word-spacing not yet implemented).
- Updated all 6 call sites to pass `node.props.align` and the appropriate fragment width: `paginateParagraph` fast path, split path; `measureParagraphFragment`; `pushStackContents`; `pushTableCellContents`; `pushCellSlice`.
- Simplified `lineVisualLeft` in `EditorCanvas.tsx` to `return line.x` — alignment offset already in line.x.
- Updated `ParagraphTextSurface.tsx`: `lineX(line, align)` uses `line.x` as base (`line.x + width/2` for center, `line.x + width` for right); `lineVisualLeft(line)` simplified to `return line.x`.
- Updated `textFlow.test.ts` alignment tests to assert correct x values: right x = contentX + contentWidth - textWidth, center x = midpoint offset. Added 2 new tests (5 alignment tests total). Updated commentary to document fix.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `packages/core/src/renderer/__tests__/textFlow.test.ts`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 236 core + 16 app = 252 tests passed.

---

---

### Split Paragraph Inline Editing — Partial Fix [IN PROGRESS]

Goal: Fix visual issues when clicking to edit a paragraph that spans multiple pages (flicker, wrong fragment activated, caret at wrong position).

Completed so far:

- Fix 1: Removed `inlineEditNodeId` from full browser pagination `useEffect` deps. Effect now uses `inlineEditNodeIdRef.current` for debounce time only. Entering edit mode no longer triggers browser re-pagination → eliminates the flash caused by browser measurer drift.
- Fix 2: Added `inlineEditPageIndex` state to `EditorShell`. `EditorCanvas` passes `f.pageIndex` through `onInlineEditStart`. `findParagraphFragment` matches by pageIndex. `replaceFragmentLines` patches only the specific-page fragment. `PageView` receives `inlineEditPageIndex` prop.
- Fix 3: `isInlineEditing` in `EditorCanvas` now requires `f.pageIndex === inlineEditPageIndex` so only the clicked fragment enters edit mode — other fragments of the same split paragraph remain in display mode and keep pointer events enabled.
- Fix 4: Local reflow skips split paragraphs (`isSplitParagraph` guard checks if `paginatedRef` has >1 fragment for the nodeId). Prevents all-lines-on-one-page visual corruption.
- Fix 5: `ParagraphTextSurface` detects continuation fragments via `fragment.continuesFrom`. For continuation fragments, textarea uses `fullText.slice(continuationCharStart)` as value (where `continuationCharStart = fragment.lines[0]?.segments?.[0]?.start`). `initialCaretIndex` is adjusted by subtracting `continuationCharStart`. `onChange` prepends `preText` to reconstruct full text. Live text overlay disabled for continuation fragments.

Still open:
- Caret positioning and overall edit UX on continuation fragments needs further testing and may need additional refinement.
- Split/merge paragraph (Enter/Backspace) behavior for continuation fragments not handled.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 244 core + 16 app = 260 tests passed.

---

### Fix Flicker When Editing Split Paragraphs

Goal: Eliminate the visible flicker/blink when clicking to edit a paragraph that spans multiple pages, and ensure the inline editor is positioned over the correct page fragment.

Completed:

- **Root cause**: `inlineEditNodeId` was in the dependency array of the full browser pagination `useEffect`. Entering edit mode changed `inlineEditNodeId`, triggering immediate browser re-pagination. Browser measurer drift caused the split paragraph to briefly appear as one page, then server pagination corrected it → flicker.
- **Fix 1**: Removed `inlineEditNodeId` from the pagination effect deps. The effect now only fires when `previewDoc`, `editorTextMeasurer`, or `fontReadyVersion` changes (i.e., when text actually changes). The existing `inlineEditNodeIdRef.current` is used for debounce time calculation instead.
- **Fix 2**: Added `inlineEditPageIndex: number | null` state to `EditorShell`. `EditorCanvas` now passes `f.pageIndex` as the third argument to `onInlineEditStart`. `handleInlineEditStart` stores this as `inlineEditPageIndex`.
- Updated `findParagraphFragment` to accept optional `pageIndex` — when provided, only returns the fragment on that specific page (not always the first fragment).
- Updated `replaceFragmentLines` to accept optional `pageIndex` — when provided, only patches the fragment on that page (continuation fragments on other pages are left unchanged).
- Threaded `inlineEditPageIndex` through the local reflow effect (`findParagraphFragment` and `replaceFragmentLines` calls).
- Added checklist section "Cross-Page & Table Editing Improvements" to `LAYOUT_ENGINE_CHECKLIST.md` with 3 items. Marked this item as `[x]`.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 244 core + 16 app = 260 tests passed.

Notes:

- The fix correctly handles both the first fragment (page 1) and continuation fragments (page 2+). When a user clicks on page 2, `inlineEditPageIndex=1` is stored, the textarea is positioned over the page 2 fragment, and local reflow patches only that fragment's lines.
- Authoritative server pagination still runs normally when text changes (previewDoc changes). Only the browser re-pagination on edit mode enter/exit is suppressed.

---

## 2026-05-09 (continued)

### Add PDF/DOCX Text Flow Smoke Tests

Goal: Verify that text layout properties (line content, spacing, alignment, column positions) are correctly represented in PaginatedDocument, and that PDF/DOCX renderers consume these correctly.

Completed:

- Ticked parent "Keep server/export pagination authoritative" item — all sub-items were already `[x]`.
- Created `packages/core/src/renderer/__tests__/textFlow.test.ts` with 19 tests:
  - **Line content** (4): short text → 1 line preserved, hard newlines → correct text per line, 120-char text wraps with text preserved, empty paragraph → 1 empty line.
  - **Spacing** (4): spacingBefore adds to fragment height, spacingAfter adds to fragment height, spacingBefore shifts first line y, two-paragraph stacking with spacingAfter is contiguous.
  - **Alignment** (3): left line x = contentX, renderProps.align carries setting to renderer, center/right pass assertPaginatedDocument. Revealed a known limitation: alignment offset is not stored in `line.x` — PDF renderer always renders left-aligned; editor SVG and DOCX apply alignment independently at render time. Documented in checklist. Future fix: bake offset into `buildPaginatedLines`.
  - **Column layout** (2): two equal columns have correct x/width, left-column line x matches column fragment x, assertPaginatedDocument passes.
  - **Renderer smoke** (6): PDF and DOCX render without throwing for spacing+alignment, wrapped text, two-column, and hard-newline documents.

Files changed:

- `packages/core/src/renderer/__tests__/textFlow.test.ts` (new)
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 234 core + 16 app = 250 tests passed.

Notes:

- Alignment limitation is pre-existing: `line.x` = fragment left edge regardless of align setting. EditorCanvas computes visual x via `lineVisualLeft(line, fragment, renderProps.align)`. PDF uses `line.x` directly (left-aligned output). DOCX sets Word paragraph alignment via `renderProps.align`. Fix deferred — requires updating `buildPaginatedLines` and EditorCanvas.

---

## 2026-05-09

### Define and Implement TOC Overflow Policy

Goal: Fix silent TOC overflow where generated TOC entries exceed the placeholder height, causing content overlap with no warning.

Completed:

- Chose two-pass repagination policy: Pass 1 paginates with estimated TOC height; if actual TOC content is taller, Pass 2 repaginates with corrected height so Y positions of all content below the TOC are correct.
- Exported `TOC_TITLE_FS`, `TOC_TITLE_LH`, `TOC_TITLE_AFTER` from `layout/flow.ts` (were previously local constants). Removed duplicate definitions from `fillTocFragments` in `paginator.ts`.
- Added `tocHeightOverrides?: Map<string, number>` parameter to `flowSection`, `flowNode`, `flowVerticalContainer`, and `flowRow` in `flow.ts`. In `case "toc"`: height uses override if present, estimated height otherwise.
- Added `paginateSection` `tocHeightOverrides` parameter, passed through to `flowSection`.
- Added `computeTocActualHeight(entries, node)` — computes actual height from title + filtered TOC entries.
- Added `computeTocOverrides(sections, doc, entries)` — finds all TOC fragments where actual > placeholder and returns nodeId→height map.
- Extracted `runAllSections(doc, measurer, wb, overrides?)` helper to avoid code duplication between the two passes.
- Refactored `paginateDocument` to: (1) run Pass 1, collect entries, compute overrides; (2) if overrides exist, run Pass 2 with corrected heights, collect entries again (correct page numbers), fill TOC; (3) otherwise fill directly from Pass 1.
- Created 6 tests in `tocOverflow.test.ts` covering: no-overflow single-section (estimate correct), overflow grows fragment height, lines don't exceed fragment bottom (0.5pt epsilon), entries have correct page numbers from pass 2, assertPaginatedDocument passes, exact-match single-entry (max(0,1) boundary).

Files changed:

- `packages/core/src/layout/flow.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tocOverflow.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 174 core + 12 app = 186 tests passed.

Notes:

- Only two passes are performed even if Pass 2 shifts page numbers enough that entries spill further. In practice this is extremely unlikely since the second overflow requires the TOC to grow again after repagination. Documented as known limitation.
- The fix also resolves a pre-existing mismatch: `countHeadings` counted only local-section headings while `fillTocFragments` collected from all sections. Two-pass now handles multi-section documents correctly.

---

### Add Paragraph Split Decision Trace

Goal: Allow callers to observe the split decisions made during pagination — useful for debugging layout issues, building editor overlays, and verifying widow/orphan policy behavior in tests.

Completed:

- Added `ParagraphSplitDecision` interface to `pagination/types.ts` with 9 fields: `nodeId`, `pageIndex`, `fragmentIndex`, `lineCount`, `availableHeight` (space available when decision was made), `fragmentHeight`, `isSplit` (false = fast path, whole paragraph fit), `forcedProgress` (true when 1 line was forced), `orphanPrevented` (true when orphan prevention moved to new page before this fragment), `widowPrevented` (true when widow prevention reduced count by 1).
- Added optional `onSplitDecision?: (d: ParagraphSplitDecision) => void` to `paginateDocument`. Threaded through `runAllSections`, `paginateSection`, `paginateFlowBox`, `paginateVerticalContainer`, `paginateParagraph`. When omitted, no allocations occur — zero cost in production.
- Emitted in fast path (one decision per whole-paragraph fragment) and once per placed fragment in the split loop. `orphanPrevented` flag is reset to false after emitting so it only appears on the fragment placed after the advance, not on all subsequent fragments.
- Added import of `ParagraphSplitDecision` to `paginator.ts`.
- Created 9 tests in `splitTrace.test.ts` covering: fast-path fields, split emits per fragment, fragmentIndex ordering, total lineCount preservation, availableHeight/fragmentHeight positivity, orphanPrevented flag, widowPrevented flag with lineCount verification, multi-paragraph emission.

Files changed:

- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/splitTrace.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 214 core + 16 app = 230 tests passed.

---

### Multi-Section Export Smoke Tests

Goal: Verify that multi-section documents (the รายงานราชการ pattern) paginate correctly and render to PDF/DOCX without throwing, covering the new section page numbering and sparse-pages bug fix.

Completed:

- Created `packages/core/src/renderer/__tests__/multiSection.test.ts` with 10 tests:
- **Pagination structure** (5 tests): two-section doc produces 2 PaginatedSections; each section's pages array is dense (no undefined entries after sparse-pages fix); page number restart (pageNumberStart=1 on section 2) resolves inline pageNumber nodes correctly; TOC section + content section fills TOC entries with heading text; 3-section doc passes assertPaginatedDocument.
- **PDF smoke** (3 tests): two-section, TOC + content, page restart — all produce valid `%PDF` header. Use ASCII text since Helvetica fallback (no FontProvider in tests) cannot encode Thai.
- **DOCX smoke** (2 tests): two-section, TOC + content — both produce valid PK ZIP header.
- `makeTocSection` helper accepts an optional `title` param (default "Contents" for ASCII tests; Thai tests in pagination-only tests can pass "สารบัญ").

Files changed:

- `packages/core/src/renderer/__tests__/multiSection.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 205 core + 16 app = 221 tests passed.

---

### Section-Level Page Numbering and Restart Rules

Goal: Allow each document section to restart page numbering independently, enabling รายงานราชการ patterns where a TOC section uses one numbering sequence and the body section starts fresh at page 1.

Completed:

- Added `pageNumberStart?: number` to `PageSettingsSchema` in `schema/document.ts`. When set, the section's `pageNumber` inline nodes resolve to display numbers starting from `pageNumberStart` instead of continuing the global page index.
- Computed `pageNumberOffset = pageNumberStart - startPageIndex - 1` in `paginateSection`. Stored on `PageFlowCursor` as `pageNumberOffset: number` (default 0 = global numbering).
- Added `pageNumberOffset` to `PageFlowCursor` interface in `pagination/types.ts`. `advancePage` now preserves the offset in the returned cursor.
- Threaded `pageNumberOffset` through all five `resolvePageNumbers` call sites: `paginateParagraph` fast path, `paginateParagraph` split path, `pushStackContents` (new optional param, default 0), `pushTableCellContents` (new optional param, default 0), `pushCellSlice` (new optional param, default 0).
- **Bug fixed (sparse pages array)**: `paginateSection` was using global `pageIndex` as the section-local array index, leaving sparse holes at the front for non-first sections. This caused crashes when iterating pages and incorrect first-page header detection (`isFirst = idx === 0` was wrong for non-zero start). Fixed by densifying the array with `pages.filter(p => p != null)` before header/footer assignment and return.
- Created 5 tests in `sectionPageNumbers.test.ts`: global numbering (default, no restart), second section restarts at 1, first section starts at 5, explicit pageNumberStart=1 matches default, assertPaginatedDocument passes for all variants.

Files changed:

- `packages/core/src/schema/document.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/sectionPageNumbers.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 195 core + 16 app = 211 tests passed.

Notes:

- The sparse array bug affected multi-section documents silently before this fix: iterating a non-first section's pages would encounter undefined entries, and first-page header detection was wrong. All existing multi-section tests still pass because they didn't iterate section pages directly.

---

### Extend comparePagination for Continuation Boundaries

Goal: Make split-paragraph drift visible as a first-class concept so callers can distinguish between line-count drift, page movement, and split-boundary drift.

Completed:

- Extended `FragmentSnapshot` (internal) with `fragmentCount` and `splitBoundaries` (the `lineStart` of each continuation fragment, i.e. where the paragraph was cut).
- Added 4 fields to `FragmentDrift`: `browserFragmentCount`, `serverFragmentCount`, `continuationChanged` (true when fragment count differs between browser and server — a split was added or removed), `splitBoundaryMoved` (true when same fragment count but split points differ).
- Added `continuationChangedCount` to `DriftReport` — total number of paragraphs where a split was added or removed.
- Updated `comparePagination` filter: drift entries are now also added when `continuationChanged` or `splitBoundaryMoved` is true, even if `lineDelta === 0` and `pageMovement === false`.
- Added `arraysEqual` helper for comparing split boundary arrays.
- Uses new `lineStart` fragment metadata for accurate boundary tracking; falls back to cumulative `lineCount` for fragments without metadata.
- Updated `makeDoc` test helper to accept optional `lineStart` field on fragments.
- Added 4 new tests in `comparePagination.test.ts`: continuationChanged (browser 1 frag, server 2 frags), splitBoundaryMoved (same count, different split point), no drift when both sides match, continuationChangedCount with multiple paragraphs.

Files changed:

- `src/app/editor/_components/comparePagination.ts`
- `src/app/editor/_components/__tests__/comparePagination.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 190 core + 16 app = 206 tests passed.

---

### Add Paragraph Fragment Metadata

Goal: Make split-paragraph tracking explicit so future selection, annotation, and drift reporting can identify fragments without relying on runtime object order.

Completed:

- Added 5 optional fields to `PageFragment` in `pagination/types.ts`:
  - `fragmentIndex`: 0-based position among fragments of the same `nodeId`
  - `lineStart`: index of the first line in the source paragraph's measured lines
  - `lineEnd`: exclusive end index (`lineStart + fragment line count`)
  - `continuesFrom`: `true` if a previous fragment exists for this paragraph
  - `isContinued`: `true` if a subsequent fragment exists for this paragraph
- Populated in `paginateParagraph` fast path: `fragmentIndex=0, lineStart=0, lineEnd=totalLines, continuesFrom=false, isContinued=false`.
- Populated in `paginateParagraph` split path: `fragmentIndex` and `lineOffset` counters track position across the while loop. `isFirstFragment`/`isLastFragment` drive the boolean flags.
- Identity decision: fragment identity stays implicit (`nodeId + pageIndex`). An explicit `fragmentId` string is deferred until selection or annotation features require a stable reference across document edits.
- Created 7 tests in `fragmentMeta.test.ts` covering: fast-path single fragment, first fragment flags, last fragment flags, middle fragment flags (3-page span), lineStart/lineEnd contiguity, lineEnd-lineStart equals fragment line count, fragmentIndex strictly increasing, assertPaginatedDocument passes.

Files changed:

- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/fragmentMeta.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 190 core + 12 app = 202 tests passed.

---

### Add Widow/Orphan Prevention

Goal: Avoid leaving a single isolated line at the bottom (orphan) or top (widow) of a page when splitting paragraphs across page boundaries.

Completed:

- Added orphan prevention in `paginateParagraph` split loop: if `count === 1` and more lines follow and `cursorY > contentTop + 1`, advance to the next page and retry instead of placing a single stranded line.
- Added widow prevention: if `remainingLines.length - count === 1` and `count >= 2` and `cursorY > contentTop + 1`, reduce `count` by 1 so the next page receives at least 2 lines instead of 1.
- Both guards share the `cursorY > contentTop + 1` condition: when already at contentTop, neither rule fires — content box is too small to improve, and firing would cause an infinite loop. The paragraph falls back to the standard split in impossible cases.
- Widow guard requires `count >= 2` to prevent creating an orphan as a side effect of the adjustment.
- Created 8 tests in `widowOrphan.test.ts`: orphan moves 3-line paragraph to next page, preserves total line count, single-line paragraph unaffected, contentTop guard (no movement), widow splits 4-line paragraph 2+2 instead of 3+1, preserves total line count, 2-line remainder needs no adjustment, assertPaginatedDocument passes for all cases.
- Existing 174 split/pagination tests all pass — the guard at `contentTop` ensures paragraphs starting at the top of a page (the common case in existing tests) are unaffected.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/widowOrphan.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 182 core + 12 app = 194 tests passed.

Notes:

- Widow/orphan policy applies only to body-level paragraphs. Paragraphs inside table cells use `pushCellSlice` which has its own split logic — widow/orphan is not yet applied there.
- The `cursorY > contentTop + 1` guard handles impossible cases (line taller than half the page) gracefully without any special detection.

---

## 2026-05-08

### Make Server Font Loading Observable

Goal: Ensure both API routes surface font fallback state to callers so silent Helvetica fallback doesn't hide Thai layout drift until export time.

Completed:

- `/api/paginate` already had `console.error` logging and `X-FlowDoc-Font: fallback` response header when the default font is missing.
- Added `X-FlowDoc-Font: fallback` response header to `/api/export` to match paginate route behavior. Previously export silently fell back to Helvetica with no observable signal — callers had no way to detect degraded Thai layout at export time.
- Both routes now expose fallback state consistently: server logs for operators, response header for clients.

Files changed:

- `src/app/api/export/route.ts`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.

---

### Add Thai and Near-Boundary Drift Fixtures (Level 1)

Goal: Cover known risky drift cases — Thai mixed with English/numbers and near-boundary line wraps — using mock measurers so tests are deterministic and CI-safe.

Completed:

- Added 4 tests in a new "layout drift — Thai-specific and near-boundary cases" describe block in `drift.test.ts`:
  - Thai + English mixed text (5 Thai + 82 ASCII): browser=1 line, server=2 lines.
  - Long unbroken Thai token (140 chars, grapheme fallback): browser=2 lines, server=3 lines.
  - Thai paragraph after full-page filler: stays on page 0 with browser, drifts to page 1+ with server.
  - Thai + digits mixture (6 Thai + 81 ASCII): browser=1 line, server=2 lines.
- All tests use the existing browser/server mock measurers (Thai chars: 0.62/0.67×fontSize, ASCII: 0.48/0.52×fontSize). No real font required; cases are calculated from first principles.
- Level 2 (real fontkit + `it.skipIf` when font absent) documented as deferred until CI has reliable font access or production Thai regressions surface.

Files changed:

- `packages/core/src/pagination/__tests__/drift.test.ts`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 168 core + 12 app = 180 tests passed.

---

### Separate Preview Drift From Authoritative Failure

Goal: Surface server-side font fallback and layout errors visibly to the editor user, so degraded layout state is not silent.

Completed:

- Added `fontFallback: boolean` state to `EditorShell`. Set to `true` when `/api/paginate` responds with `X-FlowDoc-Font: fallback` header; cleared when server confirms real font. Shows amber "⚠ fallback font" tooltip indicator in toolbar.
- Added `layoutError: boolean` state. Set to `true` when `/api/paginate` returns a non-OK status (e.g. 500 from `assertPaginatedDocument` failure); cleared on next successful response. Shows red "⚠ layout error" tooltip indicator in toolbar.
- Both indicators appear in the toolbar status area alongside the existing "↻ layout…" / "preview layout" indicators.
- Server-side failures (assertPaginatedDocument 500, font fallback header) were already in place from the API hardening work; this change makes them user-visible on the client.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.

---

### Sync Checklist Status With Implementation

Goal: Update stale wording and unchecked items in LAYOUT_ENGINE_CHECKLIST.md to match the current implementation state.

Completed:

- "Add pagination golden fixtures": updated description (paragraphs split by lines, not whole-block); test count 15→23.
- "Add renderer smoke tests": test count 11→16 (renderer contract tests added).
- "Verify fragment relationships": updated table-cell description to `nodeType="table-cell"`.
- "Stage 3: keep-together/keepWithNext": marked `[x]` — keepWithNext done, keepTogether deferred.
- "Stage 5: table-cell text continuation": marked `[x]` — basic continuation done via `pushCellSlice`.
- "Renderer contract tests for split paragraph fragments": marked `[x]`.
- "Keep DOCX limitation documented separately": marked `[x]`.
- "Add golden fixtures for representative continuation cases": marked `[x]` for all 5 items (2-page, 3+-page, after-split, page-number inline, table-cell).
- "Keep checklist status synchronized": marked `[x]`.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

---

### Give Table Cells Stable Fragment Identity

Goal: Replace the implicit `nodeType: "stack"` for table cell fragments with an explicit `nodeType: "table-cell"` so renderers, drift reporting, and debug tools can distinguish cells from regular layout stacks without relying on `cellRenderProps` or `parentNodeId` heuristics.

Completed:

- Added `"table-cell"` to `PageFragment.nodeType` union in `pagination/types.ts`.
- Updated `paginateTableRowFull` and the split loop in `paginateTableRowSplit` to push cell fragments with `nodeType: "table-cell"`.
- Updated PDF renderer (`renderer/pdf/index.ts`): `nodeType === "table-cell"` replaces `nodeType === "stack" && cellRenderProps`.
- Updated DOCX renderer (`renderer/docx/index.ts`): split the `"stack"` branch into a `"table-cell"` branch (for table cells) and a clean `"stack"` branch (for layout stacks only, no parentNodeId lookup).
- Added `"table-cell"` to `TRACKED_LAYOUT_TYPES` in `comparePagination.ts`.
- Updated `placement/geometry.ts` (`DetectTargetInput.hoveredNodeType`) and `placement/types.ts` (`PlacementTarget`) to accept `"table-cell" | "table-row" | "table"` — placement detection returns null for these, as expected.
- Updated `paginator.test.ts`: "table cell fragments" test now asserts `nodeType === "table-cell"`.

Files changed:

- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/renderer/pdf/index.ts`
- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/placement/geometry.ts`
- `packages/core/src/placement/types.ts`
- `src/app/editor/_components/comparePagination.ts`
- `packages/core/src/pagination/__tests__/paginator.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 164 core + 12 app = 176 tests passed.

---

### Expand Drift Comparison Beyond Paragraph Fragments

Goal: Make drift reports visible for row, stack, and table-row fragments — not only paragraph line-count drift — so layout regressions like rows moving pages are detectable.

Completed:

- Added `GeometryDrift` interface and `buildLayoutSnapshotMap` in `comparePagination.ts`. Tracks `row`, `stack`, and `table-row` fragments for page movement and height delta.
- Added `geometryDriftMap: Map<string, GeometryDrift>` to `DriftReport`. Existing `driftMap`, `driftCount`, `totalParagraphs` are unchanged — no breaking changes to EditorCanvas overlay.
- Updated `pageBreakChanged` to also trigger when any tracked layout fragment moves pages (not just paragraphs).
- Updated `EditorShell` console log: shows "layout geometry drift" sub-group when Drift overlay is active and geometry drift is detected.
- Added 4 new tests in `comparePagination.test.ts`: row height drift, table-row page movement, no geometry drift when matching, stack drift independent tracking. Updated "ignores non-paragraph" test name to reflect new behavior.

Files changed:

- `src/app/editor/_components/comparePagination.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/comparePagination.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 164 core + 12 app = 176 tests passed.

---

### Add Renderer Contract Checks Around Fragment Coverage

Goal: Verify that the paginated document passed to PDF/DOCX renderers contains the expected fragment kinds and split fragments, catching dropped or merged fragments at the pagination layer rather than only at renderer output.

Completed:

- Added "renderer input contract — fragment coverage" describe block in `renderer.test.ts` with 5 tests:
  - row/stack/paragraph fragment kinds all present in paginated input for a row document
  - split paragraph (80 hard-newline lines) produces ≥2 fragments on different pages
  - split fragments are ordered by ascending pageIndex in renderer input
  - PDF renderer handles split paragraph fragments without throwing and produces valid %PDF header
  - DOCX renderer handles split paragraph fragments without throwing and produces valid PK header
- Tests assert on paginated document structure before the renderer is called, so they catch pagination regressions independently of renderer behavior.

Files changed:

- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 164 core + 8 app = 172 tests passed.

---

### Extend Table Row Splitting to Multi-Page Loop

Goal: Make breakable table rows (allowBreak=true) split across 3+ pages correctly instead of placing all remaining content on page 2 as a single overflow block.

Completed:

- Replaced `computeSplitPoint` with `computeSplitPointFrom(cellBox, tableNode, availH, measurer, wordBreaker, from)`. Takes a `from: SplitPoint` so split calculation can start from any position, enabling iterative page splitting.
- Replaced `pushCellFirstSlice` + `pushCellSecondSlice` with `pushCellSlice(from, to)`. General function that places cell content from split point `from` to `to` (null = to end). Handles partial paragraphs at both boundaries and spacers correctly.
- Rewrote `paginateTableRowSplit` as a `while` loop: each iteration places one slice (`min(availH, remaining)`) of the row, updates per-cell `fromSplits`, and advances the cursor until `heightPlaced === totalHeight`.
- Fixed `paginateTable` split condition: added `tooTallForOnePage = rowBox.height > contentBottom - contentTop` so rows taller than one content page trigger the split path even when starting at contentTop (previously `shouldMoveBlockToNextPage` returned false at contentTop, skipping split entirely).
- Fixed `pushTableCellContents`: table cell paragraph lines now call `resolvePageNumbers(rawLines, pageIndex + 1)`, matching the fix applied earlier to `pushStackContents`.
- Added 5 tests in `tablePagination.test.ts` under "multi-page row split": 3-page split produces 3+ fragments, total line count preserved, ascending page order, assertPaginatedDocument passes, 2-page regression check.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 159 core + 8 app = 167 tests passed.

Notes:

- Rowspan-linked groups remain conservative (approach B: whole-group move, no intra-group split). This is intentional — split-at-row-boundary within rowspan groups deferred until needed.
- The `tooTallForOnePage` fix is a side effect of the main task but necessary for the feature to work at all.

---

### Harden Page-Number Layout Measurement

Goal: Fix page-number placeholder width so documents with 10+ pages don't overflow the measured layout width, and fix page numbers inside row/stack columns that were never resolved.

Completed:

- Changed `pageNumber` placeholder in `measureParagraph` (`layout/measure.ts`) from `"0"` (1-digit) to `"00"` (2-digit). Covers pages 1–99 without needing a two-pass layout.
- Fixed `pushStackContents` in `paginator.ts`: paragraph lines inside row/stack columns were built with `buildPaginatedLines` but `resolvePageNumbers` was never called — page numbers inside columns stayed as `"00"` permanently. Added `resolvePageNumbers(rawLines, pageIndex + 1)` call to match `paginateParagraph` behavior.
- Added 2 regression tests in `pageNumbers.test.ts`:
  - Page 9→10 boundary: 9 pages of filler push the pageNumber paragraph to page 10 (index 9); text resolves to `"หน้า 10"`.
  - Narrow column: `widthShare=20` stack with a pageNumber paragraph passes `assertPaginatedDocument` and resolves to `"1"`.

Files changed:

- `packages/core/src/layout/measure.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/pageNumbers.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 154 core + 8 app = 162 tests passed.

Notes:

- The `pushStackContents` bug means page numbers inside columns were silently broken before this fix. No other callers are affected — `paginateParagraph` (body-level) and `paginateTable` cell paths were already correct.

---

### Harden API Routes — Assertion and Font Diagnostics

Goal: Catch layout bugs at API boundaries before they reach renderers, and surface font-loading failures instead of silently degrading Thai layout.

Completed:

- Added `assertPaginatedDocument(paginated)` after `paginateDocument(...)` in both `/api/paginate` and `/api/export`. Returns HTTP 500 with violation details on failure; logs to server console. Renderers no longer receive invalid layout output.
- Replaced silent font-load `catch {}` in both routes with `console.error` logging the full font path and error. Missing font is now visible in server logs instead of silently producing Helvetica output for Thai documents.
- `/api/paginate` now sets `X-FlowDoc-Font: fallback` response header when the default font is missing, making the degraded state detectable by the client.
- Fallback to `createFontkitMeasurer(null)` is still allowed for dev/CI environments without the font file, but is now always surfaced.

Files changed:

- `src/app/api/paginate/route.ts`
- `src/app/api/export/route.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.

---

### Add keepWithNext Paragraph Option

Goal: Allow a paragraph (typically a heading) to stay on the same page as the following sibling, preventing orphan headings.

Completed:

- Added `keepWithNext?: boolean` to `ParagraphPropsSchema` in `schema/block.ts`.
- Modified `paginateVerticalContainer` in `paginator.ts`: before placing a paragraph with `keepWithNext=true`, check if `child.height + nextChild.height > remaining page space`. If so and we're not at contentTop, advance page first so both can start on the new page.
- Safety guard: only advances when `cursorY > contentTop + 1` — prevents infinite loops when combined height exceeds one full page height.
- `keepTogether` deferred — produces bad UX for long paragraphs that would overflow rather than split.
- Created 5 tests in `keepWithNext.test.ts`: baseline (no flag), heading moves with next sibling to page 2, heading stays on page 1 when both fit, no-loop guard for oversized combined height, multiple keepWithNext headings in sequence.

Files changed:

- `packages/core/src/schema/block.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/keepWithNext.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 152 core + 8 app = 160 tests passed.

---

### Add Page Numbering (Inline pageNumber Node)

Goal: Allow paragraph children to include a page number that gets resolved to the actual page number during pagination.

Completed:

- Added `PageNumberInlineSchema` and `PageNumberInline` type to `schema/inline.ts`. The `InlineNodeSchema` discriminated union now includes `{ type: "pageNumber" }`.
- Added `"pageNumber"` to `LineSegment.kind` in `layout/types.ts`.
- Modified `measureParagraph` in `layout/measure.ts`: `pageNumber` children append `"0"` (single-digit placeholder) to `fullText` and track `pageNumberRanges`. `getSegmentKind` now accepts `pageNumberRanges` and returns `"pageNumber"` for matching segments. `wrapLines` and `createSourceSegments` thread `pageNumberRanges` through.
- Added `resolvePageNumbers(lines, pageNumber)` helper in `paginator.ts`: replaces segments with `kind: "pageNumber"` with the actual page number string and rebuilds the line's text.
- Applied `resolvePageNumbers` in `paginateParagraph` for both fast path and split path, using `current.pageIndex + 1` (1-based page number).
- Created 5 tests in `pageNumbers.test.ts`: "หน้า 1" on page 1, "หน้า 2" on page 2, multiple pageNumber nodes, prefix text preserved, standalone node.

Files changed:

- `packages/core/src/schema/inline.ts`
- `packages/core/src/layout/types.ts`
- `packages/core/src/layout/measure.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/pageNumbers.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 147 core + 8 app = 155 tests passed.

Notes:

- Layout width is measured using "0" (1 digit). Pages 10+ will have slight overflow at the measurement boundary. Acceptable for typical header/footer use.
- Total page count ("Page X of Y") deferred — requires two pagination passes.

---

### Add Repeating Table Headers

Goal: Make the first N rows of a table repeat at the top of each continuation page, matching standard document behavior for multi-page tables.

Completed:

- Added `headerRowCount?: number` to `TablePropsSchema` in `schema/table.ts`. Specifies how many rows from the top are header rows.
- Modified `paginateTable` in `paginator.ts`:
  - Slices `box.children.slice(0, headerRowCount)` as header boxes and computes `headerHeight`.
  - `placeHeaders(cursor)` helper pushes all header rows using `paginateTableRowFull`.
  - Each group is classified as `isHeaderGroup` (all row indices < headerRowCount) or content. Header groups are placed normally; content groups call `placeHeaders` after any page advance.
  - Single-row group page-fit check accounts for `reservedForHeaders` so content rows are not placed when they won't fit after headers.
- Added 5 tests in `tablePagination.test.ts`: baseline (no headers), header repeats on every page, header at contentTop, content below header, fragment order passes `assertPaginatedDocument`.

Files changed:

- `packages/core/src/schema/table.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 142 core + 8 app = 150 tests passed.

---

### Split Paragraphs Across Pages by Measured Lines

Goal: Make body-level paragraphs split at line boundaries across pages instead of overflowing as a single block.

Completed:

- Rewrote `paginateParagraph` in `paginator.ts`:
  - Fast path: `current.cursorY + totalHeight <= contentBottom` → push whole paragraph as one fragment (unchanged from before for short paragraphs).
  - Split loop: when the paragraph overflows, iterate remaining lines until all are placed. On each iteration, count lines that fit in the available space, push a fragment, advance cursor, and continue with remaining lines on the next page.
  - `spacingBefore` added only to the first fragment; `spacingAfter` added only to the last fragment.
  - If no lines fit and cursor is not at contentTop, advance to the next page and retry. If no lines fit even at contentTop (line taller than page), force 1 line to prevent infinite loops.
- Updated paginator.test.ts: replaced the old "paragraph moves whole to next page" test with a new test verifying split behavior. Added 8 new tests in a dedicated "paragraph split across pages" group.
- Key bug fixed during testing: the original fast-path check used `shouldMoveBlockToNextPage` which returns `false` at contentTop regardless of height. Changed to `cursorY + totalHeight <= contentBottom` to correctly identify when the whole paragraph actually fits.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/paginator.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 137 core + 8 app = 145 tests passed.

Notes:

- Paragraphs inside table cells were already split at line level (existing `pushCellFirstSlice`/`pushCellSecondSlice`). This change brings body-level paragraphs to the same level.
- Stack contents (paragraphs inside row/columns) use `pushStackContents` which does not split — that is acceptable for now since column content is bounded by the row height.

---

### Fix Too-Tall Rowspan Group Edge Case

Goal: Ensure rowspan groups taller than one content page start at contentTop of the next page, consistent with paragraph overflow behavior.

Completed:

- Fixed `paginateTable` in `paginator.ts`: removed the conditional that only advanced the page if the group fit. Now always calls `advancePage` when the group doesn't fit at the current cursor, matching how `paginateParagraph` handles tall blocks.
- Added 1 regression test in `tablePagination.test.ts`: a rowspan group taller than one page, placed after filler content, must start at `contentTop` (72pt) on the next page, not at a mid-page position. Both rows still land on the same page.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 129 core + 8 app = 137 tests passed.

---

### Refine Layout Span Follow-Up Checklist

Goal: Capture the remaining edge cases after reviewing the current rowspan-group pagination implementation.

Completed:

- Clarified that current rowspan behavior is approach B: linked rows stay together, and groups taller than one content page are documented overflow.
- Added a follow-up item for the too-tall rowspan group edge case: when such a group starts after earlier content, it should move to the next page's content top before overflowing.
- Refined the open table span question to distinguish resolved rowspan grouping from still-open split-at-row-boundary, colspan, and `allowBreak=true` interactions.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- The current implementation direction remains aligned with the conservative layout strategy. The added item is a narrow regression target, not a change in the overall table split policy.

---

### Stabilize Table Pagination — Rowspan Groups and Grid Invariants

Goal: Keep rowspan-linked table rows on the same page (approach B) and verify row/column operations preserve grid invariants.

Completed:

- Added `buildRowspanGroups(tableNode, rowBoxes)` to `paginator.ts` using union-find. Groups rows that share rowspan cells into `RowspanGroup[]` with `rowIndices` and `totalHeight`.
- Modified `paginateTable` to iterate over groups instead of rows:
  - Multi-row group: page-break decision based on `totalHeight`. If group doesn't fit, try next page; if still too tall, overflow (documented). Rows within the group are placed with `paginateTableRowFull` without individual page-break decisions.
  - Single-row group: existing behavior preserved (`allowBreak`, split, move-whole).
- Created `packages/core/src/pagination/__tests__/tablePagination.test.ts` with 14 tests:
  - No-rowspan baseline (existing behavior preserved).
  - 2-row rowspan group stays on same page.
  - 2-row rowspan group moves to next page as a unit.
  - 3-row rowspan group stays together.
  - Mixed groups (rowspan + independent rows).
  - `assertPaginatedDocument` passes for all rowspan scenarios.
  - `addTableRow`, `removeTableRow`, `addTableColumn`, `removeTableColumn` all pass `assertDocument` and `assertPaginatedDocument`.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 128 core + 8 app = 136 tests passed.

Notes:

- Upgrade path to approach A (split within groups at row boundary) is easy: group detection is shared; A adds split-at-boundary logic within the multi-row group loop.
- rowspan/colspan in split scenarios (`allowBreak=true` on multi-row groups) deferred until approach A is needed.

---

### Make Editor Resize Preview Converge With Authoritative Pagination

Goal: Ensure resize interactions produce valid documents and converge to authoritative server pagination.

Completed:

- Added `Math.max(0.01, ...)` guard in `EditorShell.tsx` column resize commit to prevent widthShare from becoming 0 or negative due to floating-point rounding at the boundary (drag clamping already prevents this in practice, but the guard is now explicit).
- Created `packages/core/src/pagination/__tests__/resizeConvergence.test.ts` with 15 tests:
  - **Column resize** (6 tests): normal 30/70, 70/30, near-minimum 15/85, 85/15, minimum-clamp 0.01/99.99, and width sum verification.
  - **Row min-height** (5 tests): increase, natural content height, zero fallback, very large, and height = max(minHeight, naturalHeight) verification.
  - **Page margin** (4 tests): standard, large, asymmetric, and x-position after margin change.
- All tests pass `assertPaginatedDocument` with no violations.
- Documented that row min-height preview uses browser canvas measurer (acceptable drift, settles after server pagination).

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `packages/core/src/pagination/__tests__/resizeConvergence.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 115 core + 8 app = 123 tests passed.

---

### Stabilize Row and Stack Pagination Rules

Goal: Lock in row/stack layout semantics with tests and document multi-column overflow decision.

Completed:

- Created `packages/core/src/pagination/__tests__/rowStack.test.ts` with 12 tests covering:
  - **Min-height**: row height = max(minHeight, tallest-stack), all stacks share row height.
  - **Width distribution**: two/three-column stacks sum to contentBox.width, proportional to widthShare, contiguous x positions.
  - **Page-break**: row moves to next page as a whole unit (both stacks land together), very tall row stays at contentTop without crash.
  - `assertPaginatedDocument` passes for all valid row/stack documents.
- Confirmed from `flow.ts`: `rowHeight = max(node.props.minHeight, ...measuredHeights)` and each stack receives `stackRenderHeight = rowHeight` so all stacks grow to the tallest column.
- Multi-column overflow decision documented: whole row moves when possible; overflow without split is the current behavior for rows taller than one page.

Files changed:

- `packages/core/src/pagination/__tests__/rowStack.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 100 core + 8 app = 108 tests passed.

---

### Document DOCX Layout Limitations

Goal: Make DOCX renderer compromises explicit so future contributors know what is intentional and what is not.

Completed:

- Updated `docs/LAYOUT_ENGINE_CHECKLIST.md` with six documented DOCX limitations: pagination non-authoritativeness, font metric dependence on reader system, column layout as invisible-border tables, reader-controlled line breaking, spacing/border rounding, and the accepted exchange-format compromise.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

---

### Add Layout Assertion Helpers

Goal: Add reusable helpers that verify PaginatedDocument layout invariants, so pagination bugs are caught immediately in tests and development.

Completed:

- Created `packages/core/src/pagination/assertPaginated.ts` with `checkPaginatedDocument` and `assertPaginatedDocument`.
- `checkPaginatedDocument` returns `PaginationViolation[]` covering four rules:
  - `negative-height`: fragment.height < 0
  - `outside-content-box`: fragment x or x+width outside page content box (0.5pt epsilon for float rounding)
  - `wrong-y-order`: consecutive fragments on the same page have decreasing Y
  - `split-fragment-order`: fragments of the same nodeId appear on out-of-order pages
- `assertPaginatedDocument` throws a detailed multi-line error listing all violations.
- Exported from `packages/core/src/pagination/index.ts`.
- Created 17 tests in `assertPaginated.test.ts` covering: happy path for real paginated docs, each violation type with both positive and negative cases, epsilon tolerance, and assertPaginatedDocument throw behavior.

Files changed:

- `packages/core/src/pagination/assertPaginated.ts` (new)
- `packages/core/src/pagination/index.ts`
- `packages/core/src/pagination/__tests__/assertPaginated.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 88 core + 8 app = 96 tests passed.

Notes:

- Y overflow below contentBottom is intentionally not checked — whole-block move can overflow when a node is taller than one page (documented behavior).
- These helpers should be used in future pagination tests and can be added to the API route for dev-mode validation.

---

### Document Layout Page-Break Decisions

Goal: Record current page-break behavior and near-term layout split direction before changing the paginator.

Completed:

- Updated `docs/LAYOUT_ENGINE_CHECKLIST.md` to reflect current behavior verified in `packages/core/src/pagination/paginator.ts`.
- Documented spacer behavior as whole-block move with overflow only as an authored edge case.
- Documented row/stack behavior as atomic for now: rows move as a whole when possible; stacks do not split independently.
- Documented table row behavior as `allowBreak=false` whole-row move and `allowBreak=true` split.
- Documented TOC placeholder behavior as temporary fixed-height placement with post-processing and no repagination yet.
- Corrected paragraph behavior: paragraphs currently move as whole blocks and can overflow when taller than a page; line-level paragraph splitting is the next preferred layout split slice.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- The chosen direction is conservative: split paragraphs first because measured lines already exist, and defer row/stack splitting until paragraph pagination is stable.

---

### Add Pagination Golden Fixtures

Goal: Lock in paginator behavior with focused tests before making layout changes, covering geometry, page breaks, fragment relationships, and line metadata.

Completed:

- Created `packages/core/src/pagination/__tests__/paginator.test.ts` with 15 golden fixture tests.
- **Geometry group**: first paragraph at content box origin (x=72, y=72, width=451), height equals one line height, two paragraphs stacked vertically, spacer height/position.
- **Page break group**: single paragraph stays on one page, tall paragraph moves whole to next page (body-level paragraphs are not split line-by-line), spacer moves whole to next page, tall paragraph at page top stays without crash.
- **Fragment relationships group**: row.parentNodeId=bodyId, stack.parentNodeId=rowId, paragraph-in-stack.parentNodeId=stackId, two-column widths sum to contentBox.width.
- **Line metadata group**: hard-newline lines produce correct text per line, line x=fragment x, lines ordered top-to-bottom.
- Marked `Add pagination golden fixtures` complete in `docs/LAYOUT_ENGINE_CHECKLIST.md`.

Files changed:

- `packages/core/src/pagination/__tests__/paginator.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 49 core + 8 app = 57 tests passed.

Notes:

- Body-level paragraphs and spacers are moved whole to the next page when they don't fit — no line-level splitting. Line-level splitting only happens for paragraphs inside table cells.
- All tests use `defaultTextMeasurer` and fixed IDs for stable, deterministic assertions.

---

### Add Layout Engine Checklist

Goal: Create a dedicated checklist for flow layout, pagination, page breaks, renderer layout output, and editor layout interactions.

Completed:

- Added `docs/LAYOUT_ENGINE_CHECKLIST.md`.
- Split layout work into current foundation, near-term checklist, design rules, later work, and open questions.
- Captured follow-up areas for pagination golden fixtures, renderer smoke tests, page-break rules, row/stack pagination, table pagination, paginated output assertions, and resize-preview convergence.
- Kept text caret/segment details in `docs/TEXT_ENGINE_CHECKLIST.md` and made the new checklist focus on shared layout behavior.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- This checklist should become the guide for future changes in `packages/core/src/layout`, `packages/core/src/pagination`, renderer layout consumption, and editor resize/page-preview behavior.

---

### Complete Drift Comparison Follow-Up Items

Goal: Close the four follow-up checklist items added after the initial drift comparison implementation.

Completed:

- **Split-page aggregation** (`comparePagination.ts`): `buildSnapshotMap` now aggregates line counts and heights across all fragments with the same `nodeId` (paragraph spanning multiple pages). `FragmentSnapshot` stores `pages: PageLocation[]` instead of a single `pageIndex`/`sectionIndex`. `pagesMatch` helper compares page lists for page-movement detection.
- **Page-break-only drift overlay** (`EditorCanvas.tsx`): drift overlay now shows purple fill + `"PG"` badge when `pageMovement` is true but `lineDelta === 0`. `FragmentDrift` type gains a `pageMovement: boolean` field.
- **`comparePagination` tests** (`src/app/editor/_components/__tests__/comparePagination.test.ts`): 8 focused tests covering no-drift, positive/negative line delta, page movement, split-page aggregation, non-paragraph ignored, and totalParagraphs count. Added root-level `vitest.config.ts` and `test:app` script.
- **Tracking reset on edit session end** (`EditorShell.tsx`): added `useEffect` that resets `prevLineCountRef` and `prevEditNodeIdRef` to `null` when `inlineEditNodeId` becomes `null`, preventing stale state on re-entry to the same paragraph.

Files changed:

- `src/app/editor/_components/comparePagination.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/comparePagination.test.ts` (new)
- `vitest.config.ts` (new)
- `package.json`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34 core + 8 app = 42 tests passed.

---

### Refine Text Engine Follow-Up Checklist

Goal: Make the checklist capture the implementation gaps found while reviewing the current server-authoritative preview and drift tooling work.

Completed:

- Added follow-up items for split-across-page drift comparison.
- Added a checklist item for page-break-only drift overlay behavior.
- Added a checklist item for focused `comparePagination` tests.
- Added a checklist item to reset soft/hard line-count tracking for every inline edit session, including re-entering the same paragraph.

Files changed:

- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- The existing direction remains valid. These items make the next implementation slices more explicit and easier to verify.

---

### Add Soft/Hard Reflow Rules During Inline Editing

Goal: Eliminate the visual overlap between the active paragraph and surrounding content when a line wrap or unwrap occurs during typing.

Completed:

- Added `prevLineCountRef` and `prevEditNodeIdRef` to `EditorShell` to track the active paragraph's line count across keystrokes.
- Modified the local reflow effect to classify each text change as soft or hard:
  - **Soft** (line count unchanged): patch only the active paragraph's lines in the paginated state, leaving surrounding fragments untouched. Existing behavior, unchanged.
  - **Hard** (line count changed): dispatch a full browser pagination immediately (synchronous, 0ms) so all fragments below the active paragraph shift to their correct positions without waiting for the 200ms debounce.
- `prevLineCountRef` resets to `null` each time a new paragraph enters edit mode, so the first measurement never triggers a spurious hard event.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34/34 passed.

Notes:

- The 200ms debounce full pagination still fires after the hard-event pagination, which confirms the layout. This is harmless — it runs with the same browser measurer and produces the same result.
- Server authoritative pagination (500ms debounce) continues unchanged.

---

### Add Layout Drift Comparison

Goal: Measure how different browser pagination (Canvas measurer) is from server pagination (fontkit), so we can decide whether calibration or fontkit-in-browser is needed.

Completed:

- Created `src/app/editor/_components/comparePagination.ts` with `comparePagination(browser, server)` → `DriftReport`. Compares paragraph fragment line counts and page break positions between two `PaginatedDocument` results.
- Added `FragmentDrift` (per-fragment delta) and `DriftReport` (summary + `driftMap`) types.
- Modified `EditorShell.tsx`: added `showDrift` state, `driftReport` state, and `showDriftRef`. After each authoritative pagination response, runs `comparePagination(paginatedRef.current, paginated)` and stores the report. When drift overlay is active, logs a grouped console summary listing each drifted paragraph with browser/server line counts.
- Added "Drift" toolbar button — toggles the overlay, shows live count (`Drift 2/8`) when drift is detected.
- Modified `EditorCanvas.tsx` and `PageView`: added `showDrift` and `driftMap` props. When active, renders a semi-transparent orange (+lines) or blue (-lines) overlay on drifted paragraph fragments, with a small badge (e.g. "+1L") in the top-right corner.

Files changed:

- `src/app/editor/_components/comparePagination.ts` (new)
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34/34 passed.

Notes:

- Orange overlay = server wraps to more lines (PDF will be longer than preview).
- Blue overlay = server wraps to fewer lines (PDF will be shorter than preview).
- Console log fires only when Drift overlay is active and drift is detected, to avoid noise.
- Next step: observe real drift in practice, then decide between calibration factor or fontkit-in-browser.

---

### Reconcile Editor Preview To Server Pagination

Goal: Keep server/API pagination as the layout truth while preserving responsive browser-side editing.

Completed:

- Added an authoritative pagination path in `EditorShell` that posts the current preview document to `/api/paginate` after debounce.
- Kept browser pagination and paragraph-local reflow as the fast interactive preview path.
- Added version guarding so stale server pagination responses cannot overwrite newer document state.
- Deferred applying server pagination while inline editing is active, then settled the canvas back to the latest authoritative result after editing ends.
- Added a small layout status indicator for optimistic preview vs authoritative layout reconciliation.
- Updated the text engine checklist with the completed reconcile slice and the remaining drift/soft-reflow work.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` passed — 34/34 tests.

Notes:

- The first sandboxed test run failed with Vitest `spawn EPERM`; rerunning with approved escalation passed.
- This is the first implementation slice for the server-authoritative direction. The larger task remains open until browser/server drift is measured and wrap/page-break UX gets soft/hard reflow rules.

---

### Clarify Server Pagination As Layout Truth

Goal: Decide how to interpret "Keep server/export pagination authoritative while browser preview catches up" before changing editor reflow behavior.

Completed:

- Confirmed the intended model: `/api/paginate` and `/api/export` remain the layout truth because they use the server/export measurement path.
- Defined browser pagination, paragraph-local reflow, and future soft/hard reflow behavior as interaction preview only.
- Documented that browser/server differences should be measured as layout drift rather than accepted as a second source of truth.
- Added design rules to avoid letting browser canvas measurement become an independent authoritative layout engine.

Files changed:

- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- This decision leaves room for UX improvements such as freezing surrounding layout near wrap/page-break boundaries, while still reconciling back to server/API pagination after idle, blur, or export.

---

### Change Enter to Newline Within Paragraph

Goal: Enter key inserts `\n` within the same paragraph instead of splitting into a new paragraph node, to avoid excessive inter-paragraph spacing and feel more natural for form/document editing.

Completed:

- Modified `measureParagraph` in `packages/core/src/layout/measure.ts` to split `fullText` on `\n` before word-wrapping. Each hard line is wrapped separately and concatenated. Segment `start`/`end` offsets are adjusted by `globalOffset` so caret hit testing stays correct across hard breaks.
- Added `offsetBase` parameter to `createSourceSegments` and `wrapLines` (defaults to 0, fully backward-compatible).
- Removed Enter and Backspace-at-0 special handling from `ParagraphTextSurface.tsx` keyboard handler. Enter now falls through to default textarea behavior, inserting `\n` naturally.
- Fixed live text overlay comparison to strip `\n` before comparing with paginated text, preventing false overlay triggers on multi-line paragraphs.

Files changed:

- `packages/core/src/layout/measure.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34/34 passed.

Notes:

- `onSplitParagraph` and `onMergeParagraph` remain in the `ParagraphTextSurface` props interface for potential future use (e.g., paragraph link / text frame threading feature).
- Paragraph split/merge operations remain in `packages/core/src/document/operations.ts` for when the paragraph link feature is built.
- Empty hard lines (from `\n\n`) produce a single empty `MeasuredLine` with height = lineHeight, giving visual blank line spacing that respects the paragraph's line height setting.

---

## 2026-05-07

### Merge Paragraph on Backspace at Start

Goal: When the user presses Backspace at position 0 of a paragraph, merge it with the paragraph above — the inverse of the Enter split.

Completed:

- Added `mergeParagraphWithPrevious(doc, nodeId)` to `packages/core/src/document/operations.ts`.
  Returns `{ doc, prevNodeId, caretIndex }` where `caretIndex` is the join point (length of previous paragraph text before merge), or `null` if no previous paragraph exists.
- Added `MERGE_PARAGRAPH` and `CLEAR_MERGE_RESULT` actions to `EditorState` reducer.
- Added `mergeResult: { prevNodeId, caretIndex } | null` field to `EditorState`.
- Added `handleMergeParagraph` callback and a `useEffect` in `EditorShell` that watches `mergeResult`, starts inline editing on the previous paragraph at the join point, then clears the field.
- Threaded `onMergeParagraph` prop down through `EditorCanvas` → `PageView` → `ParagraphTextSurface`.
- Handled `Backspace` at `selectionStart === 0` and `selectionEnd === 0` (no selection, cursor at very start) in `ParagraphTextSurface`: commits current text, then calls `onMergeParagraph`.

Files changed:

- `packages/core/src/document/operations.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34/34 passed.

Notes:

- Merge is only available when a previous paragraph sibling exists in the same parent (body/stack). Backspace at the first paragraph of a section is a no-op.
- Caret is placed at the exact join point so the user sees the cursor between the two merged texts.

### Split Paragraph on Enter Key

Goal: When the user presses Enter while editing a paragraph, split it at the cursor position — text before cursor stays in the current paragraph, text after cursor moves to a new paragraph below.

Completed:

- Added `splitParagraphAtIndex(doc, nodeId, splitIndex)` to `packages/core/src/document/operations.ts`.
  Returns `{ doc: DocumentNode, newNodeId: string }`. The new paragraph inherits all props (font, size, align, spacing) from the current paragraph.
- Added `SPLIT_PARAGRAPH` and `CLEAR_SPLIT_NODE_ID` actions to `EditorState` reducer.
- Added `lastSplitNodeId: string | null` field to `EditorState` to carry the new paragraph's ID out of the reducer.
- Added `handleSplitParagraph` callback and a `useEffect` in `EditorShell` that watches `lastSplitNodeId`, starts inline editing on the new paragraph at caret index 0, then clears the field.
- Threaded `onSplitParagraph` prop down through `EditorCanvas` → `PageView` → `ParagraphTextSurface`.
- Handled `Enter` key in `ParagraphTextSurface`: prevents default textarea newline, reads `selectionStart`, commits current text via `onChange` first, then calls `onSplitParagraph`.

Files changed:

- `packages/core/src/document/operations.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34/34 passed.

Notes:

- `onChange` is called before `onSplitParagraph` so the split operation always sees the latest textarea content, not the last committed document state.
- Split is section-level only; paragraphs inside table cells are not yet split by Enter.

### Add Grapheme Boundary Snapping for Thai Caret

Goal: Prevent caret from landing inside Thai combining sequences like "งุ่" when the user clicks on text.

Completed:

- Added `snapToGraphemeBoundary(text, index)` to `packages/core/src/layout/measure.ts` and exported it.
  The function uses `Intl.Segmenter` with grapheme granularity to find the nearest grapheme cluster boundary to a given UTF-16 index.
- Applied snapping in `caretIndexFromSegments` in `EditorCanvas.tsx` — after computing the ratio-based index within a segment, the result is snapped before being returned.
- Imported `snapToGraphemeBoundary` from `@/layout` in `EditorCanvas.tsx`.
- Added 8 tests for `snapToGraphemeBoundary` covering: boundary edges, already-on-boundary index, inside "องุ่น" cluster, ASCII text, empty string, and "ก้" (consonant + tone mark).
- Decided and documented text offset encoding: segment `start/end` use UTF-16 indices matching the textarea; grapheme-aware navigation is enforced at the caret layer via `snapToGraphemeBoundary`.

Files changed:

- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/__tests__/measure.test.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 34/34 passed.
- `npm.cmd run type-check` passed.

Notes:

- Tie-breaking (distance to start = distance to end) snaps to the cluster start, which is the more natural choice for Thai — the user lands before the combined character rather than after.
- The fallback ratio path in `caretIndexFromPointer` (used when no segments exist) is not yet snapped, but segments are always populated for Thai paragraphs so this path is rarely hit.

### Add Paragraph-Local Reflow During Inline Editing

Goal: Make text line wrapping respond immediately as the user types, without waiting for full document pagination.

Completed:

- Added `measureParagraph` and `MeasuredParagraph` imports to `EditorShell`.
- Added four module-level helper functions:
  - `findParagraphNode` — locates a paragraph node in `previewDoc` by id.
  - `findParagraphFragment` — locates the paragraph's `PageFragment` in the current paginated state.
  - `buildLocalLines` — converts `MeasuredLine[]` to `PaginatedLine[]` using the fragment's existing x/y origin.
  - `replaceFragmentLines` — returns a new `PaginatedDocument` with only the active paragraph's lines and height replaced.
- Added a `paginatedRef` that tracks the latest `paginated` state without being a reactive dependency, so the local reflow effect can read it without creating a loop.
- Split the single pagination `useEffect` into two:
  - **Local reflow effect**: fires immediately on each `previewDoc` change while `inlineEditNodeId` is set; re-measures only the active paragraph and patches just that fragment in the paginated state.
  - **Full pagination effect**: debounced at 16ms when not editing, 200ms during inline editing; corrects page breaks and surrounding layout after the user pauses.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 27/27 passed.

Notes:

- The local reflow updates only the active paragraph's `lines` and `height`. Surrounding fragments do not shift positions until full pagination completes (200ms after the last keystroke). This is acceptable because the active text is always correct and layout settles quickly after typing stops.
- `paginatedRef` is used (not `state.paginated`) inside the local reflow effect to avoid a re-render loop.

### Add measureParagraph Fixtures and Test Runner

Goal: Add the first test infrastructure to the project and lock in measureParagraph behavior with golden fixtures.

Completed:

- Installed Vitest as a root devDependency.
- Added `vitest.config.ts` to `packages/core` with node environment.
- Added `test` and `test:watch` scripts to `packages/core/package.json`.
- Added a root `test` script that delegates to the core workspace.
- Created `packages/core/src/layout/__tests__/measure.test.ts` with 27 fixture tests covering:
  - Empty text (produces a single empty line, correct totalHeight)
  - English: single word, word wrap, trailing space trimming, no leading space on new line
  - Numbers: digit strings, decimal numbers, number sequence wrap
  - Long unbroken text: grapheme fallback splitting, no line exceeds width, kind=grapheme
  - Thai text (mock word breaker): two words on one line, narrow-width break, Thai char widths
  - Mixed Thai/English (mock word breaker): correct wrap order, no line exceeds width
  - Spacing: spacingBefore/After added to totalHeight, mm→pt conversion
  - LineSegment metadata: no source offset gaps, x values non-decreasing, breakableAfter correct
  - fieldRef inline node: segment classified as kind=field
  - defaultWordBreaker integration: structural checks for English, Thai, and mixed text
- Marked the fixture checklist items as complete in `docs/TEXT_ENGINE_CHECKLIST.md`.

Files changed:

- `package.json`
- `packages/core/package.json`
- `packages/core/vitest.config.ts`
- `packages/core/src/layout/__tests__/measure.test.ts`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 27 tests passed (0 failed).
- `npm.cmd run type-check` passed.

Notes:

- Thai and mixed tests use deterministic mock WordBreakers for exact golden checks. The `defaultWordBreaker` integration tests use structural assertions (width ≤ available, text preserved) to stay ICU-version-independent.
- The `spaceBreaker` mock splits on whitespace only and is the default for English/number/grapheme tests.

### Add Text Segment Debug Overlay

Goal: Make the editor show how the text engine sees paragraph line segments.

Completed:

- Added a `Segments` toolbar toggle.
- Passed the text segment debug setting through `EditorShell` and `EditorCanvas`.
- Rendered segment overlays on paragraph SVG text in both display and inline edit states.
- Used distinct colors for segment kinds: word, space, field, and grapheme fallback.
- Added SVG titles with segment kind, source offset range, and measured width.
- Marked the debug visualization checklist item as complete.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- Segment `x` values are interpreted relative to each visual line, so centered and right-aligned paragraphs can still display the overlay in the expected visual position.

### Clear Resize State On Pointer Release

Goal: Fix resize interactions staying active after releasing the pointer.

Completed:

- Cleared column resize state immediately after committing resized stack width shares.
- Cleared row min-height resize state immediately after committing the new minimum height.
- Cleared page margin resize state immediately after committing the new margins.
- Guarded column resize pointer movement so committed resize state cannot continue updating if it ever appears.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- This became more important after editor preview layout moved to immediate browser-side measurement; resize no longer needs to stay in a committed waiting state for server layout.

### Align Paragraph Edit And Display Rendering

Goal: Make paragraph text look the same when displayed normally and when entered for inline editing.

Completed:

- Added a browser canvas-based editor `TextMeasurer` so editor preview line breaking uses the same browser font metrics family as the inline editing surface.
- Switched editor preview pagination from the delayed server API path to immediate browser-side measurement for on-canvas editing.
- Kept the SVG-rendered paragraph lines visible while editing and made the textarea transparent so the visible text uses the same renderer in edit and display states.
- Updated the active edit fragment snapshot so its line data can refresh while preserving the maximum edit height.
- Updated the text engine checklist item for converging inline/display spacing.

Files changed:

- `src/app/editor/_components/browserTextMeasurer.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- Browser automation currently only exposed the Next Dev Tools button in its DOM snapshot, so visual confirmation in the in-app browser could not be completed from automation in this pass.
- Export still uses the server/API path; this change is focused on matching the editor display and inline edit surfaces.

### Populate Line Segments And Caret Hit Testing

Goal: Build the near-term text engine foundation for segment-aware wrapping and caret placement.

Completed:

- Populated `LineSegment` metadata from paragraph measurement.
- Preserved source offsets for measured segments using the current JavaScript/textarea index model.
- Classified measured segments as `word`, `space`, `field`, or `grapheme`.
- Added grapheme fallback for over-wide word segments so long unbroken text can wrap.
- Updated paragraph caret hit testing to prefer segment geometry before falling back to line-width ratios.
- Updated the text engine checklist to mark the completed near-term segment work.

Files changed:

- `packages/core/src/layout/measure.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- Segment `x` values are currently relative to the start of the visual line.
- The next useful step is focused wrapping fixtures/golden checks for Thai, English, mixed text, and long unbroken text.

### Add Text Engine Checklist

Goal: Capture what the text engine already has, what should be built soon, and what belongs to later phases.

Completed:

- Added `docs/TEXT_ENGINE_CHECKLIST.md`.
- Split text engine work into current foundation, near-term checklist, design rules, later work, and open questions.
- Noted that HarfBuzz/WASM should remain a future option after the current fontkit and segment contracts become limiting.

Files changed:

- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- This checklist should be updated when text measurement, line breaking, or editor reflow behavior changes.

### Scaffold Text Segment Reflow Plan

Goal: Establish the foundation for word/segment-aware line layout, caret mapping, and future resize reflow.

Completed:

- Added optional `LineSegment` metadata to measured lines.
- Added optional `segments` metadata to paginated lines.
- Passed measured line segments through pagination when present.
- Added `docs/TEXT_REFLOW_PLAN.md` to capture the three-level reflow model and staged implementation plan.

Files changed:

- `packages/core/src/layout/types.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `docs/TEXT_REFLOW_PLAN.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.

Notes:

- Segment metadata is currently scaffolded but not populated by `measureParagraph` yet.
- Next step: populate segments from the current word breaker and add grapheme fallback for over-wide text segments.

### Align Paragraph Edit Surface Spacing

Goal: Make paragraph text look more consistent between inline editing and the engine-rendered display state.

Completed:

- Investigated why text spacing and word breaking differ between the textarea editing surface and SVG display output.
- Applied engine spacing (`spacingBefore` and `spacingAfter`) to the inline textarea.
- Removed textarea `break-word` behavior so long unbroken text is not split differently from the engine-rendered lines.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.

Notes:

- The editor still uses a native textarea while display uses engine-generated SVG lines, so perfect 1:1 wrapping will require a deeper custom editing surface or engine-driven line overlay.

### Clear Selection On Resize Start

Goal: Prevent selection or inline editing state from staying active when starting a resize interaction.

Completed:

- Updated column resize start to clear the selected node and close inline editing before resize begins.
- Updated row min-height resize start to clear the selected node and close inline editing before resize begins.
- Updated page margin resize start to clear the selected node and close inline editing before resize begins.
- Investigated the apparent early text wrapping / large blank area. The current document snapshot showed text inside multi-column rows, so the text wraps within its column while the rest of the row/page can still appear empty.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- The text wrapping observation should be revisited with a focused browser reproduction after the current in-app browser tab renders the editor normally again.

### Guard Invalid Stack Placement

Goal: Investigate and prevent invalid document states such as `body child must be paragraph, row, spacer, or table — got "stack"`.

Completed:

- Identified that `stack` nodes could be selected and dragged as standalone document sources even though stacks are structural row regions.
- Updated placement law to reject structural `stack` drag sources before creating placement operations.
- Added an editor-side validity guard so document operations that produce invalid documents are ignored instead of entering editor state.
- Fixed the `Columns` palette block to create an actual two-column row instead of falling back to a single-column row.

Files changed:

- `packages/core/src/placement/law.ts`
- `packages/core/src/document/operations.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- Reloaded `http://localhost:4000/editor` in the in-app browser and confirmed the editor renders without new browser errors.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- This does not yet add fixture tests for placement operations; that remains a good next step for the B-track correctness work.

### Verify Node Upgrade And Browser Automation

Goal: Confirm the local Node upgrade works with the Codex in-app browser automation.

Completed:

- Confirmed `node -v` reports `v24.15.0`.
- Confirmed `npm.cmd -v` reports `11.12.1`.
- Restarted the FlowDocEditor dev server after the Node version change.
- Verified the editor route responds successfully.
- Verified Codex browser automation can inspect `http://localhost:4000/editor`.

Files changed:

- `docs/WORK_LOG.md`

Verification:

- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.
- Browser automation returned the editor DOM snapshot, including toolbar buttons, block palette, field palette, canvas, and outline.

Notes:

- Use `npm.cmd` in PowerShell if `npm.ps1` is blocked by execution policy.

### Resolve Dev Server Port Conflict

Goal: Fix `Failed to start server` / `EADDRINUSE` on port `4000`.

Completed:

- Confirmed port `4000` was already occupied by an existing Node/Next dev server for this same repository.
- Stopped the old process that was holding port `4000`.
- Restarted the FlowDocEditor dev server in the background.
- Reverted a temporary package script port change after confirming the real issue was a duplicate running server, not an incorrect port setting.

Files changed:

- `docs/WORK_LOG.md`

Verification:

- `npm run dev` initially reproduced `EADDRINUSE`.
- `netstat` showed port `4000` was occupied.
- `Invoke-WebRequest http://localhost:4000` returned `200 OK` after restart.

Notes:

- The app is currently available at `http://localhost:4000`.
- If this happens again, check for an already-running Next dev server before changing ports.

### Project Documentation Setup

Goal: Create a shared work log for tracking completed changes across future Codex sessions.

Completed:

- Added this work log under `docs/WORK_LOG.md`.
- Established a consistent entry format for future updates.

Files changed:

- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- Future implementation sessions should append a new entry after the work is complete.


---

### Recheck Addendum — Core/App Boundary Review

Goal: Convert implementation review findings into checklist items.

Added to `LAYOUT_ENGINE_CHECKLIST.md`:

- Assert paginated output at API/export boundaries.
- Make font asset resolution deterministic and observable.
- Expand drift comparison beyond paragraph fragments.
- Give table cells clearer fragment identity.
- Harden page-number measurement for page 10+ cases.
- Define TOC overflow policy.
- Add multi-page table-row split regression tests.
- Strengthen renderer contract tests.
- Keep checklist wording synchronized with implementation status.

Added to `TEXT_ENGINE_CHECKLIST.md`:

- Make server font loading observable.
- Add real-font drift fixtures for Thai and exact-boundary cases.
- Separate preview drift warnings from authoritative export failures.

Notes:

- The core direction remains aligned with the engineering principles.
- Most added items are correctness guards at boundaries, not architecture rewrites.

---

### Stabilize Long Inline Edit Height

Goal: Keep paragraph inline editing stable when a textarea grows past roughly 4-6 visual lines.

Completed:

- Added a temporary editor-preview geometry path for active inline edits.
- `ParagraphTextSurface` now reports the live textarea content height while typing.
- `EditorShell` applies that height to the active paragraph fragment and shifts later fragments on the same page by the height delta.
- Kept the active paragraph's text layout owned by the textarea during editing; full pagination still reconciles on edit end.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Browser-tested a paragraph by replacing it with a 5-6+ line probe, confirming lower fragments moved down during editing, then restored the original text.

Notes:

- The current saved browser document still triggers `/api/paginate` 500 and shows the layout-error badge; this appears separate from the inline edit height preview because the API receives only the document model, not the temporary edit geometry.
- Follow-up fix: converted the reported textarea height from screen pixels back into document units before updating the preview fragment. Without this, canvas scales above/below 1 could create a feedback loop where the paragraph grew downward while typing.
- Follow-up browser verification: a short Thai probe stayed at `20.07` before/after waiting, and a longer wrapped probe grew to `49` and stayed stable instead of continuing to expand.

---

### Harden Plain Textarea Inline Editing

Goal: Keep the temporary textarea editor stable while the WYSIWYG track is built in parallel.

Completed:

- Exported and reused a shared `isPlainTextParagraph` guard.
- Blocked textarea/property-panel text rewrites for mixed inline paragraphs.
- Keyed active inline textarea instances by page/fragment slice and continuation offset.
- Snapped split and selection-delete offsets to grapheme boundaries for the structural split helper.
- Let inline paragraph textareas keep native multiline Enter behavior and avoid body-paragraph merge at the true table-cell start.
- UX-smoke follow-up: structural merge now cancels stale blur finalization, refreshes pagination immediately, and keeps textarea text visible instead of reusing stale SVG snapshots.
- Changed textarea emergency wrapping from `anywhere` to `break-word` so long typing uses more natural browser line wrapping while the textarea bridge is active.
- Confirmed long active paragraph editing can move the textarea to a continuation slice on page 2 while keeping caret focus.
- Captured margin-resize-with-table UX risk: the table reflows when margins move, but transparent margin hit areas make the interaction hard to discover/control.

Files changed:

- `packages/core/src/document/operations.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- Isolated Chromium CDP smoke: typed Thai/English paragraph text, verified plain Enter stays in the same paragraph as a newline, verified structural Backspace merge keeps visible edit text aligned with the merged textarea, then checked table-cell multiline Enter and true-start Backspace.
- Isolated Chromium CDP smoke follow-up: typed long text one character at a time until multiple wraps, inserted a newline with Enter, extended the paragraph across page 2, and dragged the left page margin with a table present.

---

### Restore Document-Rendered Inline Typing Visuals

Goal: Make active paragraph typing feel like editing the document text itself, not a detached textarea layout.

Completed:

- Reproduced the user-style long English typing case with isolated Chromium CDP by inserting characters one at a time until the paragraph wrapped.
- Confirmed the active editor was still showing native textarea text during typing while normal SVG/document text appeared only after blur.
- Removed the per-session visual lock that kept textarea glyphs visible after the first keyboard/input interaction.
- Changed inline edit preview pagination to run immediately while typing so fresh SVG lines can become the visible layer as soon as the active draft updates.
- Updated the inline edit contract so `fragment.lines` remains the visual truth during active typing, with textarea text only as a stale-frame or composition fallback.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- Isolated Chromium CDP smoke: typed continuous English characters one at a time until wrapping; active textarea text was transparent, active SVG lines matched the after-blur SVG lines, and Enter inserted a newline in the same paragraph while keeping renderer-visible text.

---

### Add Collapsed WYSIWYG Caret Foundation

Goal: Start the minimum viable WYSIWYG path by making the active caret come from
the same paginated SVG geometry as visible paragraph text.

Completed:

- Accepted the WYSIWYG plan direction: SVG text visual, custom collapsed caret,
  point-to-offset hit testing, textarea input fallback, and conservative
  IME/native fallback rules.
- Passed the browser text measurer into canvas paragraph surfaces so caret
  overlay placement can use the same measurement source as editor preview
  pagination.
- Rendered a custom SVG collapsed caret from
  `resolveCollapsedCaretOverlayInFragment(...)` when the active edit visual is
  fresh, the textarea selection is collapsed, and composition is inactive.
- Hid the native textarea caret only when a custom caret was successfully
  resolved; missing geometry, range selection, and composition fall back to the
  native textarea visual/caret path.
- Kept selection overlay, hidden input mode, and cross-page selection deferred.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- Isolated Chromium CDP smoke: opened a plain paragraph, typed `abcd`, confirmed
  textarea glyphs and native caret were transparent, confirmed one
  `data-wysiwyg-caret` SVG line was present, then typed long continuous English
  text until wrapping and confirmed the custom caret followed the rendered last
  line.

Follow-up hardening:

- Passed the editor browser text measurer into point-to-offset hit testing in
  `EditorCanvas` so initial click-to-caret mapping uses the same measurement
  source as preview rendering and custom caret placement.
- Made missing custom-caret geometry fall back to visible textarea text/native
  caret instead of showing SVG text with no custom caret.
- Updated browser smoke docs to match the WYSIWYG-first direction: fresh drafts
  should return to SVG/custom-caret visuals, while stale geometry, range
  selection, and composition use native textarea fallback.
- Added a focused policy regression that keeps textarea text visible when the
  document visual layer is otherwise eligible but custom caret geometry is
  missing.

Follow-up verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- Isolated Chromium CDP smoke: opened a plain paragraph, typed `abcdef`, and
  confirmed the collapsed edit state used transparent textarea glyphs/native
  caret plus one SVG `data-wysiwyg-caret` line.

---

### Harden WYSIWYG Point-To-Offset Precision

Goal: Make click-to-caret mapping use measured caret candidates instead of
guessing offsets from segment-width ratios.

Completed:

- Changed `resolveCaretOffsetFromPointInFragment(...)` to build grapheme-safe
  caret candidates for the selected visual line, then choose the candidate with
  the nearest measured `x` position to the click point.
- Preserved the existing null fallback when line segment geometry is unavailable.
- Added a variable-width glyph regression where the old ratio approach would
  choose a deeper offset than the nearest measured candidate.
- Added an emoji ZWJ regression that keeps point-to-offset results on valid
  grapheme boundaries.
- Updated the WYSIWYG roadmap to make measured candidate-distance mapping the
  Stage 4 rule.

Files changed:

- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`

---

### Make Package V2 The Default JSON Export

Goal: Finish the short package-v2 transition by making the visible JSON export
path write the same canonical package shape as localStorage.

Completed:

- Changed `CURRENT_PACKAGE_VERSION` to `2` and kept package v1 under an explicit
  legacy package constant/helper.
- Made `migratePersistedDocumentPackage(...)` return package v2 for legacy raw
  documents and package v1 input, while keeping `parsePersistedDocument(...)`
  parse-only so legacy/raw imports can still be identified by the editor.
- Changed the toolbar `Save JSON` action to write package v2 with the active
  field registry and removed the temporary visible `Save v2` action.
- Kept package v1 as import/migration compatibility only.
- Updated package contract, proposal, fixture, smoke, docs-index, and test
  strategy notes to describe package v2 as the current persisted/editor JSON
  format.
- Updated persistence tests so default JSON export, localStorage, migration,
  and field-registry-preserving export coverage all point at package v2.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run test:app`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd run test:app`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check` passed with only LF-to-CRLF working-copy warnings.

---

### Harden Active Registry Field Placement

Goal: Improve the document/field placement foundation without adding publish,
reviewer, history, or registry-management workflows.

Completed:

- Changed the Field palette to read from the active package `FieldRegistryV1`
  instead of the static sample list.
- Kept the sample registry as the fallback for new documents and legacy/package
  v1 inputs.
- Passed the active registry into the property panel.
- Added property-panel fieldRef inspection for selected paragraphs and selected
  table cells, showing key, label, fallback, and registry status.
- Kept fieldRef details read-only so this does not become a registry editor yet.
- Extended editor smoke with a custom package v2 registry fixture to verify the
  Field palette and property-panel fieldRef details use the package registry.
- Updated architecture, field registry, fixture, smoke, package proposal, and
  test-strategy docs around active registry placement.

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check` passed with only LF-to-CRLF working-copy warnings.

---

### Add Document-Safe FieldRef Metadata Editing

Goal: Finish the small field authoring ergonomics slice before returning focus
to the main document editor experience.

Completed:

- Added `updateFieldRefInline(...)` to core document operations so inline
  fieldRef metadata edits pass through the same reducer/history path as other
  document mutations.
- Allowed property-panel edits for inline `fieldRef.label` and
  `fieldRef.fallback` in selected paragraphs and table-cell paragraphs.
- Kept fieldRef key and registry field type read-only to avoid premature key
  rename/type-change workflow decisions.
- Added focused core operation tests for body paragraphs, table-cell
  paragraphs, and clearing optional label/fallback.
- Extended editor smoke to edit fieldRef label/fallback and verify package v2
  autosaves the updated metadata.
- Updated field registry, package proposal, fixture, smoke, and test-strategy
  docs.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check` passed with only LF-to-CRLF working-copy warnings.

Notes:

- The first app-suite run hit a 10-second Chromium launch timeout in
  `realFontDrift.test.ts`; the focused real-font test and the repeated app
  suite both passed.

---

### Persist Document-Bound Data Snapshots In Package V2

Goal: Keep the next layer focused on document creation and data placement by
restoring current Fill mode values without introducing history, reviewer, or
workflow state.

Completed:

- Added typed `data?: DataSnapshotV1` support to `FlowDocPackageV2`.
- Kept scalar snapshot values outside `DocumentNode`; binding still resolves a
  temporary preview/export document only.
- Saved localStorage package v2 with the active field registry and current Fill
  mode data snapshot.
- Exported `Save JSON` package v2 with the active field registry and current
  data snapshot.
- Restored package v2 `data` back into Fill mode when opening JSON or loading
  localStorage.
- Rejected structurally invalid package data snapshots while keeping readiness
  validation separate from package validity.
- Extended editor smoke to confirm filled values are autosaved under
  `data.values`.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check` passed with only LF-to-CRLF working-copy warnings.

---

### Align Package V2 And WYSIWYG Documentation Status

Goal: Remove stale wording that made package v2 look like a future proposal and
made the WYSIWYG default-editor status ambiguous.

Completed:

- Updated architecture docs to describe current editor JSON writes as
  `FlowDocPackage v2`, with legacy package v1/raw document import
  compatibility.
- Reframed the package v2 proposal doc as current v2 evolution notes plus
  deferred layers.
- Updated package/test/fixture wording so package v2 is the current persisted
  format and package v1 is legacy compatibility.
- Clarified the WYSIWYG roadmap: collapsed-caret and hit-testing foundations
  are enabled for default plain paragraph editing, but the track remains
  guarded/experimental until stability gates pass.

Verification:

- `git diff --check`

---

### Add WYSIWYG Stability Gate Smoke Coverage

Goal: Keep WYSIWYG inline editing guarded while expanding real browser evidence
for the fragile default-editor paths.

Completed:

- Added a WYSIWYG inline edit enablement guard that defaults on outside
  production and off by default in production unless explicitly enabled.
- Made new inline edit sessions start with stale visual freshness until browser
  pagination marks the current draft snapshot fresh.
- Kept composition fallback higher priority than stale visual fallback so IME
  states clearly use visible native textarea behavior.
- Extended automated editor smoke for Thai/composition fallback, fieldRef
  paragraph non-editability, table-cell boundary Backspace, continuation
  fragment editing, focus-preserving reflow, undo/redo, and continuation
  boundary Backspace.
- Updated smoke/test/fixture/WYSIWYG docs with the new stability gate coverage
  and current suite counts.

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts`
- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `git diff --check`

---

### Tighten Experimental WYSIWYG Stability Gate

Goal: Treat the current WYSIWYG inline edit path as opt-in experimental and
expand browser/runtime evidence without adding selection, clipboard, hidden
input, or new WYSIWYG stages.

Completed:

- Changed `resolveWysiwygInlineEditEnabled(...)` so the experimental WYSIWYG
  path is disabled by default in every environment unless
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT` is explicitly enabled.
- Updated the automated editor smoke server to set
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`, keeping WYSIWYG coverage
  deliberate instead of ambient dev behavior.
- Extended continuation smoke coverage to require a three-fragment paragraph,
  type from the first fragment until caret/page tracking relocates the active
  textarea to a continuation slice, preserve focus, and verify undo/redo as one
  edit session.
- Kept continuation click/edit and continuation-boundary Backspace as a
  separate browser fixture page so the smoke reports clearer gate failures.
- Added a compatibility comment to `inlineEditCaret.ts` clarifying that
  `wysiwygCaretMapping.ts` is the source of truth.
- Updated WYSIWYG, browser smoke, fixture catalog, and test-strategy docs to
  match the opt-in experimental status and current suite counts.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/inlineEditCaret.test.ts`
- `npm.cmd run smoke:editor`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- A combined browser sequence that performed page-tracking undo/redo and then
  immediately re-entered a continuation fragment was not stable enough to use
  as a single smoke gate. The smoke now separates those checks, and that
  combined runtime scenario remains a follow-up before any production-stable
  WYSIWYG claim.
- Production-stable WYSIWYG remains deferred; selection overlay, clipboard
  model, real OS IME stress, accessibility hardening, and missing-geometry
  browser mutation checks are not implemented in this slice.

---

### Expose Paragraph Box Controls In Property Panel

Goal: Open the first user-facing paragraph box style controls now that the
schema, normalization, pagination, editor preview, PDF renderer, DOCX
best-effort path, and focused tests exist.

Completed:

- Added a `Box` section for selected paragraphs in `PropertyPanel`, with fill
  color, four-sided padding, side-selectable border controls, and reset actions.
- Routed box edits through `updateParagraphBoxStyle(...)` via a dedicated
  `UPDATE_PARAGRAPH_BOX_STYLE` editor action so authored box edits go through
  normal document validation and undo history.
- Kept the UI scope to paragraph box v1: fill, padding, and border only.
  Rounded corners, shadow, opacity, gradient, and canvas resize interactions
  remain deferred.
- Added a focused property-panel render test for the paragraph box controls.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`

Notes:

- The first control surface intentionally favors all-active border editing plus
  side toggles. Fully independent per-side style editing can be added later if
  the real document workflow needs it.

---

### Make Paragraph Box Controls Collapsible

Goal: Reduce visual density in the first paragraph box property-panel controls
without changing document semantics or inner control behavior.

Completed:

- Wrapped the `Fill`, `Padding`, and `Border` paragraph box groups in compact
  collapsible cards.
- Kept all cards expanded by default so newly exposed controls remain visible.
- Added card summaries for quick scanning: fill color, padding values, and
  active border side count.
- Updated the focused property-panel render test to lock the card structure.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`

Notes:

- This is only the outer UX shell. The control layout inside each card remains
  intentionally unchanged for the next tuning pass.

---

### Tune Paragraph Box Padding And Border Layout Controls

Goal: Make the `Padding` and `Border` controls communicate their four-sided
document meaning directly in the property panel.

Completed:

- Replaced the padding 2x2 grid with a positional control layout:
  `Top`, `Left`, `All`, `Right`, and `Bottom`.
- Added a center `All` padding input that applies one value to all four sides.
- Replaced the border side row with a positional border compass:
  `Top`, `Left`, `All`, `Right`, and `Bottom`.
- Added a center `All` border action that applies the current border settings
  to all four sides while keeping explicit `Clear border` as the destructive
  reset path.
- Updated the focused property-panel test to lock the new compass controls.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`

Notes:

- This remains UI-only. The authored paragraph box model and
  `updateParagraphBoxStyle(...)` semantics were not changed.

---

### Replace Border Side Text Buttons With Glyphs

Goal: Make paragraph border side selection communicate visually instead of
requiring users to read `T`, `R`, `B`, and `L` labels.

Completed:

- Replaced border compass text labels with CSS border glyphs that emphasize the
  actual side being toggled.
- Changed border compass buttons to equal-size square controls.
- Kept accessible labels and pressed states on the glyph buttons.
- Updated the focused property-panel render test to cover the glyph markup and
  labels.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`

Notes:

- This is editor-control chrome only. It does not affect authored paragraph
  box data, pagination, PDF, or DOCX rendering.

---

### Make Border All Button Toggle Clear

Goal: Make the paragraph border `All` control behave like a clear toggle when
all four sides are already active.

Completed:

- Changed the border `All` button so it applies all sides when not all borders
  are active and clears all four sides when all four are active.
- Changed the accessible label/title from apply to clear in the all-active
  state.
- Added a small clear mark to the all-sides glyph when pressing it would clear
  all borders.
- Updated the focused property-panel render test for the clear state.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`

Notes:

- This only changes the property-panel interaction. It still routes through
  `updateParagraphBoxStyle(...)`; document schema, pagination, and renderers are
  unchanged.

---

### Add Drafted Color Picker Preview For Paragraph Box

Goal: Make fill and border color picking smoother by avoiding document commits
on every native color-picker tick.

Completed:

- Added local draft state for paragraph box fill color and border color in the
  property panel.
- Changed color input `onChange` to update only the local preview/draft.
- Added mini previews for fill and border color/style/width feedback inside the
  panel.
- Added explicit `Apply` buttons, while also committing drafts on blur or
  Enter.
- Kept swatch and clear actions as immediate discrete commits.
- Updated the focused property-panel render test to cover the preview controls.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`

Notes:

- This is a property-panel interaction change only. It intentionally does not
  add live canvas color preview while dragging; document updates still commit
  through `updateParagraphBoxStyle(...)`.

---

### Polish Paragraph Border Style And Width Controls

Goal: Reduce typing and extra clicks in paragraph box border controls while
keeping document commits discrete.

Completed:

- Replaced the border style dropdown with four icon buttons for none, solid,
  dashed, and dotted.
- Changed border width editing to a `0..5 pt` slider plus numeric input.
- Kept width changes in local draft state while dragging, committing on
  pointer release, blur, or Enter.
- Updated the focused property-panel render test for the new controls.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run test:app`
- `npm.cmd run type-check`
- `git diff --check`
- Headless browser smoke on `http://localhost:4000/editor`: selected a
  paragraph and confirmed the border style group plus width slider render in
  the property panel.

Notes:

- This is property-panel UX only. It does not change paragraph box schema,
  pagination, PDF, or DOCX behavior.

---

### Split Paragraph Property Panel Into Text And Box Tabs

Goal: Keep paragraph text/typography controls separate from authored box
styling so users do not have to scroll through unrelated controls.

Completed:

- Added paragraph-level `Text` and `Box` tabs in the property panel.
- Kept `Text` as the default tab when selecting a paragraph.
- Moved textarea, field references, typography, spacing, alignment, and heading
  controls under `Text`.
- Moved paragraph box fill, padding, border, and reset controls under `Box`.
- Kept `Box` internals as collapsible sections, matching the paragraph box UX
  contract.
- Updated the focused property-panel render test to cover the new tab shell.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run test:app`
- `npm.cmd run type-check`
- `git diff --check`
- Headless browser smoke on `http://localhost:4000/editor`: selected a
  paragraph, confirmed `Text` is selected by default, then switched to `Box`
  and confirmed paragraph box controls become visible.

Notes:

- This is property-panel organization only. It intentionally does not change
  paragraph schema, layout, pagination, undo/redo, PDF, or DOCX behavior.

---

### Split Right Rail Properties And Outline Panes

Goal: Keep the document outline visible without letting long property controls
consume the entire right rail.

Completed:

- Split the editor right rail into a 60% properties pane and a 40% outline
  pane.
- Kept the properties pane and outline pane as independent scroll owners.
- Made `PropertyPanel` fill its assigned pane so its header/delete footer can
  remain stable while the detail area scrolls.
- Made `FillingPanel` use the same pane-filling shell in fill mode.
- Added right-rail test ids for future browser and UI checks.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run test:app`
- `npm.cmd run type-check`
- `git diff --check`
- Headless browser smoke on `http://localhost:4000/editor`: confirmed the right
  rail renders at roughly 60% properties / 40% outline, with property title,
  delete button, and OUTLINE header visible after selecting a paragraph.

Notes:

- This is editor shell layout only. It does not change document schema,
  pagination, undo/redo, PDF, or DOCX behavior.
- Future OUTLINE focus modes such as 40/80/100 remain deferred.

---

### Keep Paragraph Property Tabs Sticky

Goal: Keep the paragraph `Text` / `Box` mode switch visible while scrolling
long property content.

Completed:

- Made the paragraph property tab list sticky inside the property detail scroll
  area.
- Added a solid background and divider so scrolled controls do not visually
  bleed behind the tabs.
- Updated the property-panel render test to lock the sticky tab shell.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run test:app`
- `npm.cmd run type-check`
- `git diff --check`
- Headless browser smoke on `http://localhost:4000/editor`: selected a
  paragraph, switched to `Box`, scrolled the property detail area, and
  confirmed the tab list stayed at the same top position.

Notes:

- This is property-panel chrome only. It does not change document schema,
  layout, pagination, undo/redo, PDF, or DOCX behavior.

---

### Replace Right Rail Split With Icon Sidebar

Goal: Stop Properties and OUTLINE from competing for vertical space by making
the right rail show one panel at a time behind an icon-only sidebar.

Completed:

- Replaced the static 60/40 right-rail split with a vertical icon sidebar.
- Added icon-only controls for collapse, Properties, and OUTLINE.
- Kept `Properties` as the default right-rail mode.
- Made the content area render either `PropertyPanel`/`FillingPanel` or
  `OutlinePanel`, not both at once.
- Selecting an item from OUTLINE in template mode returns the rail to
  Properties so the selected node can be edited immediately.
- Kept paragraph `Text` / `Box` as a horizontal sub-tab inside Properties.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run test:app`
- `npm.cmd run type-check`
- `git diff --check`
- Headless browser smoke on `http://localhost:4000/editor`: confirmed
  Properties is the default mode, OUTLINE swaps into the content area, collapse
  narrows the rail to icon-only, clicking Properties expands it again, and
  clicking an OUTLINE paragraph returns to Properties.

Notes:

- This is editor shell chrome only. It does not change document schema,
  layout, pagination, undo/redo, PDF, or DOCX behavior.

---

### Add Page Room To Right Rail

Goal: Give page-level settings their own right-rail room instead of leaving the
Properties panel empty when no document node is selected.

Completed:

- Added `Page` as a top-level right-rail mode alongside OUTLINE and Properties.
- Reordered the icon sidebar to Collapse, Page, OUTLINE, Properties.
- Added hover titles and aria labels for the right-rail mode controls.
- Added a first `PagePanel` focused on section margin controls only.
- Wired margin edits through the existing `UPDATE_MARGIN` editor action and
  core `updateSectionMargin` operation.
- Kept Page settings read-only when the editor is in Fill mode.
- Kept switching into Fill mode pointed at the existing filling panel, while
  still allowing Page to be opened manually as read-only.

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run test:app`
- `git diff --check`
- In-app browser smoke on `http://localhost:4000/editor`: confirmed Page is
  the default right-rail room, OUTLINE swaps into the content area, clicking an
  existing paragraph switches to Properties, and Page can still be opened
  manually while a paragraph is selected.
- Headless Playwright smoke on `http://localhost:4000/editor`: confirmed the
  Page panel title renders, Fill mode opens the existing filling panel, Page is
  read-only when manually opened in Fill mode, and changing the top margin to
  `80` in Template mode enables undo through the existing history path.

Notes:

- This is editor shell wiring only. It intentionally does not change document
  schema, pagination semantics, export behavior, header/footer editing, or page
  background authoring.

---

### Restyle Page Panel Sections

Goal: Make the new Page room visually follow the property-panel section
language before adding more page-level controls.

Completed:

- Changed the Page room body to use collapsible sections instead of loose
  standalone margin fields.
- Kept the `PAGE` title as the stable top header.
- Added a compact `Page setup` section for size and orientation display.
- Changed `Margins` to a compass layout matching the paragraph-box padding
  control shape: top, left, all, right, bottom.
- Kept margin edits on the existing blur/Enter commit path.

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run test:app`
- `git diff --check`
- Headless Playwright smoke on `http://localhost:4000/editor`: confirmed the
  `PAGE` title, collapsible `Margins` section, and `All` margin input updating
  top/right/bottom/left to `90` while enabling undo.

Notes:

- This is Page panel UX only. It does not change document schema, pagination,
  undo/redo semantics, PDF, or DOCX behavior.

---

### Bump Self-Use Baseline To 0.5.1

Goal: Mark the accepted flow-row/flow-stack hardening and right-rail/page-panel
follow-up work as the next conservative `0.5.x` patch baseline.

Completed:

- Bumped the project version marker from `0.5.0` to `0.5.1`.
- Updated the lockfile root package version to match.
- Updated versioning docs so the current baseline points at `0.5.1`.

Verification:

- `npm.cmd pkg get version`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- This remains a `0.5.x` patch baseline, not a new `0.6.0` milestone and not a
  `v1` readiness claim.

---

### Add DOCX Font Embedding Evidence

Goal: Make runtime font support explicit for DOCX exports before broader rich
text/font work.

Completed:

- Verified that DOCX output with only run font names does not include embedded
  font relationships or `word/fonts/*.odttf` files.
- Added DOCX regular-font embedding when the server export path provides the
  same runtime font provider used by PDF export.
- Marked catalog export support separately for PDF and DOCX.
- Added focused DOCX ZIP assertions for provider-less name-only output,
  provider-backed embedded output, and `/api/export` server DOCX artifacts.

Verification:

- Direct DOCX ZIP probe comparing name-only vs `fonts` option.
- `npm.cmd run test -w packages/core -- font-registry.test.ts renderer.test.ts`
- `npm.cmd run test:app -- src/app/api/__tests__/exportPaginate.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`

Notes:

- DOCX remains an exchange format and can still reflow in Word/LibreOffice.
- Bold, italic, and bold-italic DOCX font embedding was deferred in this slice
  and handled later for paragraph-level styles.
