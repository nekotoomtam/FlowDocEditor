# Work Log Recent

This file keeps only the most recent active work-log section for agent context. The full historical log is archived at `docs/archive/WORK_LOG_FULL.md`.

﻿# Work Log

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

## 2026-05-22

### Bump Canvas Structure UX Baseline To 0.6.3

Goal: Mark the selected-node canvas path/action rail, clone/delete actions, and
flow-stack subtree movement work as the next self-use patch baseline.

Completed:

- Bumped the root project version marker from `0.6.2` to `0.6.3`.
- Updated the lockfile root package version to match.
- Updated the project version marker test to assert the accepted `0.6.3`
  baseline.
- Updated versioning docs so the current baseline points at `0.6.3`.
- Kept persisted document/package schema versions unchanged.

Verification:

- `npm.cmd pkg get version`
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`
- `npm.cmd run type-check`

Notes:

- This is a project release-readiness marker only. It does not change
  `DocumentNode.version`, FlowDoc package version, or storage package version.

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

---

### Bump Flow Table Layout Controls Baseline To 0.6.2

Goal: Mark the Flow Table layout-control patch after fit-to-width, alignment,
and table-block margin support landed.

Completed:

- Bumped the root project version marker from `0.6.1` to `0.6.2`.
- Updated the lockfile root package version to match.
- Updated the project version marker test to assert the accepted `0.6.2`
  baseline.
- Updated versioning docs so the current baseline points at `0.6.2`.
- Kept persisted document/package schema versions unchanged.

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

### Inline Edit Enter And Cross-Page Stability Cleanup

Goal: Clean up follow-on WYSIWYG/editing issues seen after making Flow Table
rowspan content split paragraph-like: Enter-created blank lines losing the
caret, same paragraph continuations looking like separate paragraphs, and
cross-page typing feeling jumpy.

Completed:

- Reused the WYSIWYG fragment text-range helper in `EditorCanvas` so active
  inline edit slice selection honors empty lines created by Enter.
- Added a page-relocation guard so draft pagination waits while the inline edit
  typing visual lock is held before moving the active edit page.
- Hid duplicate paragraph type labels for continued paragraph fragments in the
  editor chrome, so one logical split paragraph is not presented as two separate
  paragraphs.
- Added focused EditorCanvas and page-follow tests for continuation label
  suppression, single active slice behavior, and visual-lock page relocation.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/editorPageFollow.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `src/app/editor/_components/__tests__/editorPageFollow.test.ts`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/editorPageFollow.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`

Notes:

- This is editor lifecycle/rendering behavior only. It does not change
  `DocumentNode`, Flow Table pagination semantics, undo/redo history, or export
  output.

### Inline Edit Fragment Identity For Split Paragraphs

Goal: Remove the React duplicate-key warning that appears when inline editing
paragraph content has multiple same-node fragments, such as Flow Table rowspan
continuation slices.

Completed:

- Changed editor fragment React keys so active inline-edit fragments use
  slice identity (`nodeType`, `nodeId`, page, fragment/line start, parent, and
  render index) instead of only `nodeId`.
- Limited active inline editing to one same-page paragraph slice by resolving
  the active render fragment from the caret/text segment range, with first-slice
  fallback when range metadata is unavailable.
- Added slice-specific SVG clipPath ids and passed them into
  `ParagraphTextSurface` so same-node paragraph fragments do not share a text
  or caret clip target.
- Added focused EditorCanvas coverage for same-page inline paragraph slices and
  unique clipPath ids.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`

Verification:

- `npm.cmd test -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This is editor-render identity only. It does not change `DocumentNode`,
  pagination output, undo/redo semantics, or export behavior.

### Flow Table Rowspan Paragraph-Like Remaining-Page Split

Goal: Restore the product requirement that breakable Flow Table `rowspan`
content should cross pages like a normal paragraph, using the remaining page
space before advancing instead of moving the whole merged group when it would
fit only on a clean page.

Completed:

- Removed the atomic-when-fits gate from `paginateFlowTable` for breakable
  multi-row Flow Table rowspan groups. `allowBreak=false` rows remain atomic.
- Removed the early clean-page advance inside
  `paginateFlowTableRowspanGroupSplit` so a single visible row slice can enter
  the line-level rowspan slice path when it does not fit the current remaining
  page space.
- Restored focused pagination expectations for split rowspan groups,
  mixed `rowspan`/`colspan` continuation geometry, repeated headers before
  rowspan continuations, and the "fits clean page but not remaining space"
  regression.
- Updated Flow Table, cross-page, and layout specs to describe the paragraph-like
  remaining-page policy instead of the atomic-when-fits policy.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This intentionally reverses the 0.5.14 atomic-when-fits pivot for breakable
  Flow Table rowspan groups because the desired behavior is paragraph-like
  continuation. Legacy `table` rowspan behavior remains unchanged.

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

### Flow Table Mixed Span Browser And Boundary Guards

Goal: Cover follow-up items 2-5 after the Flow Table rowspan smoke by adding
broader rowspan/colspan browser evidence, checking continuation re-entry UX,
rerunning PDF/DOCX renderer parity, and locking the legacy-table boundary.

Completed:

- Added a dev/test-only Stage 3 Flow Table target with both `rowspan=3` and
  `colspan=2`, including top/middle/bottom sibling cells.
- Added app coverage for mixed-span overflow and shrink-back draft pagination,
  preserving span metadata, wide cell geometry, sibling paragraph uniqueness,
  and marker text continuity.
- Added `npm run smoke:wysiwyg-flow-table-mixed-span-boundary`; the smoke
  checks settled browser pagination, wide cell chrome, multi-row parent
  continuation, sibling non-duplication, no textarea fallback, and single-click
  continuation re-entry on the text-engine path.
- Added `npm run smoke:wysiwyg-flow-table-colspan-overcase` for a
  customer-data-like Flow Table payload that crosses 3-4 pages, checking
  pointer fragments, continuation re-entry, no textarea fallback, and
  performance trace budgets.
- Added a small visual-preview-to-settled-pagination handoff so table-cell
  visual preview can trigger browser preview pagination even when the active
  rendered preview fragment reports a soft reflow decision.
- Added a legacy `table` rowspan guard proving current legacy rowspan-linked
  rows remain atomic and do not emit row-boundary continuation cells.
- Re-ran PDF/DOCX renderer and opt-in PDF raster checks against the existing
  mixed Flow Table rowspan/colspan renderer fixtures.
- Bumped the project release marker to `0.5.11` after verification.

Files changed:

- `src/app/editor/_components/wysiwygStage3StressScenarios.ts`
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/__tests__/projectVersion.test.ts`
- `scripts/wysiwyg-table-cell-boundary-smoke.mjs`
- `package.json`
- `package-lock.json`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__/tablePagination.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run test:pdf-visual`
- `npm.cmd run smoke:wysiwyg-flow-table-mixed-span-boundary`
- `npm.cmd run smoke:wysiwyg-flow-table-colspan-overcase`
- `npm.cmd run smoke:wysiwyg-flow-table-rowspan-boundary`
- `npm.cmd run smoke:wysiwyg-flow-table-colspan-boundary`
- `npm.cmd run smoke:wysiwyg-table-cell-boundary`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- The first sandboxed `npm.cmd run test:pdf-visual` run could not execute
  WinGet Poppler from AppData. The successful run used the same command outside
  the sandbox so `pdftoppm.exe` could execute.
- Legacy `table` rowspan splitting is intentionally still not implemented.
  The new guard documents the current atomic behavior while Flow Table remains
  the active rowspan-continuation path.
- An exploratory mixed rowspan/colspan over-case payload still produced only
  two active target fragments because current Flow Table rowspan continuation
  follows the authored row-boundary slices. Longer-than-rowspan-group behavior
  remains a separate design question, not a passing smoke gate.
- This does not add broad DOCX semantic style assertions or full PDF/editor
  visual parity. It verifies the focused mixed-span renderer fixtures and the
  browser live-edit path.

### Flow Table Rowspan Live Typing Browser Smoke

Goal: Add focused browser evidence that WYSIWYG live typing can drive a Flow
Table `rowspan` continuation without duplicating sibling cell content.

Completed:

- Added a dev/test-only Stage 3 Flow Table `rowspan=2` target fixture after the
  existing table-cell/colspan fixtures so existing smoke geometry stays stable.
- Added unit coverage for initial, overflow, and shrink-back draft pagination of
  the rowspan Flow Table cell.
- Extended the shared table-cell boundary smoke script with a
  `flow-table-rowspan` target.
- Added `npm run smoke:wysiwyg-flow-table-rowspan-boundary` and documented the
  command in the browser smoke checklist.

Files changed:

- `src/app/editor/_components/wysiwygStage3StressScenarios.ts`
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `scripts/wysiwyg-table-cell-boundary-smoke.mjs`
- `package.json`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `npm.cmd run smoke:wysiwyg-flow-table-rowspan-boundary`
- `npm.cmd run smoke:wysiwyg-flow-table-colspan-boundary`
- `npm.cmd run smoke:wysiwyg-table-cell-boundary`
- `npm.cmd run type-check`

Notes:

- The new smoke verifies live typing and settled browser preview pagination for
  a simple `rowspan=2` Flow Table cell. It does not claim arbitrary complex
  mixed rowspan/colspan browser editing or legacy `table` rowspan behavior.

### Flow Table Rowspan R3B/R3C Mixed Span And Forced Warning Coverage

Goal: Close the next core pagination risks after R3A by proving mixed
`rowspan`/`colspan` continuation geometry and adding an explicit warning path
for low-capacity rowspan slices.

Completed:

- Added planner coverage for a cell with both `rowspan` and `colspan`, including
  covered-slot metadata.
- Added pagination coverage for a `rowspan=3` / `colspan=2` Flow Table cell
  split across pages, checking continued cell geometry, grid/span metadata,
  sibling column positions, and spanning paragraph line continuity.
- Added forced one-content-unit fallback for non-final rowspan row-boundary
  slices that cannot fit normal spanning-cell content progress.
- Attached `forced-flow-table-split-overflow` warnings to the visible row and
  spanning cell fragments for the affected slice.
- Added renderer smoke coverage proving PDF can render split Flow Table rowspan
  continuations and DOCX can project their paginated fixed-table fragments
  without duplicating marker text.
- Added an EditorCanvas static markup guard for rowspan continuation cells whose
  render parent is the visible continuation row, keeping row chrome
  pointer-transparent so the cell owns the hit area.
- Added opt-in PDF raster coverage for Flow Table rowspan continuation cell
  fill and borders on continuation pages.
- Updated Flow Table and cross-page contracts to reflect the covered mixed span
  and forced-warning behavior.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `packages/core/src/renderer/__tests__/pdfVisualRegression.test.ts`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `packages/core/src/pagination/__tests__/flowTableRowspanPlan.test.ts`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTableRowspanPlan.test.ts src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/pdfVisualRegression.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run test:pdf-visual`

Notes:

- Editor live-preview typing behavior and legacy `table` rowspan splitting
  remain separate follow-up work.

### Flow Table Rowspan R3A Spanning-Cell Content Split

Goal: Let content inside a spanning Flow Table cell flow across the row-boundary
continuation slices introduced by R2A without changing authored table schema.

Completed:

- Added per-spanning-cell split cursors while paginating a breakable rowspan
  group.
- Reused the existing Flow Table cell split-point helpers for spanning-cell
  paragraph content instead of adding a separate slicer.
- Emitted paragraph continuation fragments across rowspan row-boundary slices,
  keeping paragraph fragments parented to the authored spanning cell.
- Preserved visible-row parentage for continuation `flow-table-cell` chrome.
- Added regression coverage for line-contiguous paragraph fragments inside a
  `rowspan=3` spanning cell split across pages.
- Updated Flow Table and cross-page contracts to mark R3A content flow as
  implemented for the row-boundary split path.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTableRowspanPlan.test.ts src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This remains a row-boundary split policy. It does not add editor live-preview,
  PDF visual tuning, or legacy `table` rowspan splitting.
- Mixed rowspan/colspan continuation edge cases and forced-progress warnings
  inside rowspan slices remain follow-up risk areas.

### Flow Table Rowspan R2A Row-Boundary Split

Goal: Add the first visible rowspan pagination behavior by splitting Flow Table
rowspan-linked groups at row boundaries while keeping split-inside-rowspan text
flow deferred.

Completed:

- Wired the R1 rowspan planner into Flow Table pagination.
- Added row-boundary pagination for breakable rowspan-linked Flow Table groups.
- Emitted continuation `flow-table-cell` fragments for spanning cells, keeping
  the authored cell `nodeId`, original grid/span metadata, and continuation
  flags.
- Used the visible row fragment as the continuation cell `parentNodeId` so
  render containment follows the page slice being drawn.
- Preserved atomic behavior when any row in the rowspan-linked group has
  `allowBreak=false`.
- Repeated Flow Table headers before body-row rowspan continuations.
- Updated table/page-boundary specs to document R2A and keep spanning-cell
  content flow as deferred R3 work.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/flowTableRowspanPlan.ts`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `packages/core/src/pagination/__tests__/flowTableRowspanPlan.test.ts`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTableRowspanPlan.test.ts src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- R2A does not split paragraph content inside the spanning cell. The origin cell
  fragment still owns spanning-cell content in this slice; R3 must define line
  accounting, padding, and border continuation for split-inside-rowspan content.

### Flow Table Rowspan R1 Planner Foundation

Goal: Start the rowspan roadmap with metadata-only planning so future
row-boundary splitting can be implemented without changing document schema or
current pagination output in the first step.

Completed:

- Added a Flow Table rowspan pagination planner that resolves rowspan-linked
  row groups from the existing Flow Table grid metadata.
- Added row-boundary slice planning for a rowspan group, including carried cell
  ids for cells that continue from a previous slice or continue to a later
  slice.
- Kept the planner separate from `paginateFlowTable(...)`; current visible
  rowspan pagination behavior remains atomic.
- Added focused tests for grouped covered-slot metadata, row-boundary slice
  packing, too-tall single-row progress, and invalid slice-height guarding.
- Updated the Flow Table spec to mark R1 as a planner foundation and keep R2
  row-boundary output changes as the next explicit gate.

Files changed:

- `packages/core/src/pagination/flowTableRowspanPlan.ts`
- `packages/core/src/pagination/__tests__/flowTableRowspanPlan.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTableRowspanPlan.test.ts`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTableRowspanPlan.test.ts src/pagination/__tests__/flowTablePagination.test.ts`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- R1 intentionally does not alter `PaginatedDocument` fragments. R2 still needs
  a separate implementation patch for actual row-boundary rowspan continuation
  fragments.

## 2026-05-18

### Phase A/B Table-Cell Draft Pagination Baseline

Goal: Start the table-cell cross-page roadmap with a deterministic Phase A
baseline for real draft pagination responsiveness, then add the smallest Phase
B visual-only table chrome preview before settled draft pagination exists.

Completed:

- Added a stable Stage 3 table-cell target paragraph and marker inside the
  existing `wysiwyg-stage3-boundary` stress scenario.
- Added unit coverage that appends heavy text to the target table-cell
  paragraph, verifies it splits across multiple fragments/pages, and verifies
  shrink-back returns to one fragment.
- Added an automated browser smoke that edits the target table cell through the
  WYSIWYG text engine, requires browser-preview pagination, and checks the
  first pagination starts within the responsive threshold.
- Added a conservative visual-only table/row/cell chrome preview around active
  table-cell continuation fragments while waiting for settled draft pagination.
  The chrome is non-interactive and clears once real draft pagination owns the
  split.
- Extended that preview back to the source page slice so the active row/cell
  chrome grows to the split height and downstream source-page fragments shift
  out of the active row instead of covering the draft text.
- Adjusted table-cell draft visual splitting to preserve usable boundary lines
  instead of applying body-paragraph widow/orphan prevention, and kept exact
  fragment-boundary carets on the source page for table-cell edits.
- Enabled single-click inline editing for editable paragraphs inside table
  cells while preserving parent-cell selection for the property panel.
- Kept table/row structure scaffolds invisible on the canvas while preserving
  visible cell chrome, so active table-cell splits do not show a large grouping
  background as editable space.
- Hid the native caret on the offscreen WYSIWYG input bridge so the bridge does
  not show as a fixed left-edge caret on the first line of a continuation page.
- Added colspan-only split regression coverage for legacy tables, Flow Tables,
  and canvas visual chrome so `colspan>1,rowspan=1` stays in the cross-page
  table-cell lane before the later rowspan split-group design.
- Added a deterministic Stage 3 Flow Table colspan-only target and smoke command
  so browser coverage exercises WYSIWYG typing in a `flow-table-cell` with
  `colspan>1,rowspan=1`.
- Added a Flow Table rowspan pagination roadmap that records the current atomic
  group evidence and keeps future split work behind explicit row-boundary and
  content-splitting phases.
- Documented the new smoke command and the current Phase A/B scope boundary.

Files changed:

- `package.json`
- `scripts/wysiwyg-table-cell-boundary-smoke.mjs`
- `packages/core/src/pagination/__tests__/flowTablePagination.test.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `src/app/editor/_components/wysiwygStage3StressScenarios.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts src/pagination/__tests__/tablePagination.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run smoke:wysiwyg-table-cell-boundary`
- `npm.cmd run smoke:wysiwyg-flow-table-colspan-boundary`
- `git diff --check`

Notes:

- The browser smoke reported two active target fragments across pages 1 and 2,
  two pointer fragments, no textarea fallback, and first table-cell
  browser-preview pagination after 215 ms on the latest run.
- The Flow Table colspan smoke is the browser gate for the colspan-only lane;
  the latest run reported two active target fragments across pages 1 and 2,
  one shorter sibling paragraph, no textarea fallback, and first browser-preview
  pagination after 294 ms. It does not change the deferred `rowspan` split
  policy.
- This is intentionally still Phase B only. It adds active-cell visual chrome
  before settled pagination, but does not add full multi-cell live table preview
  or rowspan split behavior.
- An already-running local dev server without perf tracing was stopped before
  the isolated smoke run, after approval.

### C4 Export And WYSIWYG Verification Pass

Goal: Run the C4 verification pass after the table-cell text-engine and
continuation-preview work, with PDF as the main export/parity signal.

Completed:

- Fixed the PDF visual regression launcher so WinGet Poppler is passed to the
  renderer tests as `FLOWDOC_PDFTOPPM_PATH` when the installed `pdftoppm.exe`
  is found. This avoids shell/path differences between the wrapper script and
  the Vitest child process.
- Re-ran the opt-in PDF raster visual regression gate with Poppler.
- Re-ran the Stage 4C WYSIWYG smoke for text-engine selection, clipboard, IME,
  and immediate-input performance behavior.
- Re-ran the editor smoke for broader editor/export readiness behavior.
- Re-ran the full core and app test suites.

Files changed:

- `scripts/run-pdf-visual-regression.mjs`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:pdf-visual`
- `npm.cmd run smoke:wysiwyg-stage4c`
- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `git diff --check`

Notes:

- The first sandboxed PDF visual run could not execute WinGet Poppler and
  failed before raster assertions. The successful run used the same test command
  outside the sandbox so `pdftoppm.exe` could execute.
- No renderer, document schema, pagination, or export API behavior changed in
  this slice.

### Verify Settled Table Cell Continuation Editing

Goal: Close C2.5B by proving active editing can re-enter a settled split
table-cell continuation without using the temporary continuation preview.

Completed:

- Added a focused split table-cell paginated fixture with real first-page and
  continuation-page paragraph fragments.
- Verified the continuation page uses the flagged text-engine layer when draft
  pagination is active.
- Verified the temporary table-cell preview candidate is absent and the
  textarea fallback does not mount for the settled continuation edit.

Files changed:

- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`

Notes:

- Runtime behavior did not require a code change in this slice.
- This keeps row/cell chrome generation out of the temporary preview path.

### Keep Table Cell Draft Preview Behind Settled Pagination

Goal: Tighten C2.5A so the conservative table-cell continuation preview only
acts as a bridge before responsive draft pagination becomes active.

Completed:

- Added the draft-pagination marker and existing-split marker to the editor
  canvas memo dependencies for the table-cell preview builder.
- Added focused canvas coverage proving that once draft pagination is active,
  the temporary continuation preview no longer renders the extra draft page
  text.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `npm.cmd run type-check`

Notes:

- This does not change table pagination, export, row/cell chrome, or document
  schema.

### Render Conservative Table Cell Draft Continuation Preview

Goal: Continue C by showing active table-cell and flow-table-cell page-boundary
draft text before settled draft pagination arrives, without changing table
pagination truth.

Completed:

- Extended the WYSIWYG draft visual preview builder with a guarded table-cell
  branch.
- Reused the C1 eligibility gate so only table-cell page-boundary drafts before
  settled draft pagination can render a preview.
- Returned `null` for same-page cell edits, already split cell paragraphs, and
  active settled draft-pagination markers so paginator-owned fragments win.
- Rendered conservative paragraph-only continuation fragments through the editor
  canvas and text-engine layer.
- Added focused coverage for legacy table cells, Flow Table cells, same-page
  rejection, settled-pagination rejection, and canvas rendering.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`

Notes:

- The preview is paragraph-only and does not synthesize row/cell chrome on the
  continuation page.
- PDF/DOCX export and core pagination remain unchanged.

### Add Table Cell Draft Visual Preview Gate

Goal: Start the C path for table-cell cross-page typing without reusing the
body-paragraph live preview or bypassing table pagination.

Completed:

- Added a pure eligibility helper for the future table-aware visual preview
  lane.
- Surfaced the gate on the active flagged text-engine layer as diagnostic
  state only.
- Limited the candidate case to table-cell and flow-table-cell page-boundary
  edits before settled responsive draft pagination is active.
- Kept same-page cell edits, body paragraphs, flow-stack paragraphs, and
  already responsive draft-pagination edits on their existing paths.
- Added focused decision coverage for the new gate.

Files changed:

- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Notes:

- This does not render a table-aware continuation preview yet.
- The next patch can wire this gate into a preview builder that draws only
  geometry the table pagination path can reproduce.

### Keep Split Table Cell Draft Pagination Responsive

Goal: Keep table-cell and flow-table-cell typing responsive after draft
pagination has already split the active paragraph across pages.

Completed:

- Added a shared responsive-container draft-pagination decision helper for
  flow-stack and table-cell paragraphs.
- Reused the same decision when scheduling from active draft changes and when a
  draft-pagination result settles.
- Preserved the responsive marker for split table-cell and flow-table-cell
  paragraphs so follow-up typing and shrink-back do not fall back to the normal
  body-paragraph delay.
- Added focused reflow coverage for the combined responsive container decision.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd run test:app`
- `npm.cmd test`
- `npm.cmd run review:gate`
- Browser smoke on `http://localhost:4000/editor`: entered an existing Flow
  Table cell paragraph, typed a line break through the WYSIWYG input bridge,
  confirmed the paragraph stayed on the text-engine layer with no textarea
  fallback, and observed hard-local responsive behavior after the combined
  scheduling decision changed.

Notes:

- This does not add table-aware visual continuation preview.
- The continuation layout still comes from responsive draft pagination.

### Guard Table Cell Local Draft Preview

Goal: Make the B1 active cell preview rule explicit so same-page cell edits can
render draft lines immediately without pretending to split table cells across
pages.

Completed:

- Added a pure decision helper for local WYSIWYG draft-line rendering.
- Allowed same-page table-cell and flow-table-cell hard-local edits to render
  draft lines in the active text-engine layer.
- Kept table-cell and flow-table-cell hard-page-boundary edits on the settled
  pagination visual path instead of reusing body-paragraph cross-page preview.
- Added focused surface and reflow coverage for table-cell hard-local and
  page-boundary behavior.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd run test:app`
- `npm.cmd test`
- `npm.cmd run review:gate`
- Browser smoke on `http://localhost:4000/editor`: entered a Flow Table cell
  paragraph, typed a same-page line break through the WYSIWYG input bridge,
  confirmed no textarea fallback mounted, and observed the active cell text stay
  on the text-engine layer while geometry settled quickly through responsive
  draft pagination.

Notes:

- This does not add a table-aware cross-page visual preview.
- Page-boundary table-cell edits still rely on responsive draft pagination from
  the prior patch.

### Add Responsive Table Cell Draft Pagination

Goal: Reduce visible delay when typing or pressing Enter inside table-cell and
flow-table-cell paragraphs without bypassing table pagination constraints.

Completed:

- Added an exported editor helper to detect paragraphs owned by legacy table
  cells and Flow Table cells.
- Kept table-cell and flow-table-cell text-engine edits off same-page local
  height patching.
- Scheduled responsive draft pagination for table-cell and flow-table-cell
  hard-local and page-boundary reflow decisions.
- Kept already split active table-cell paragraphs on the responsive pagination
  path while the draft-pagination marker is active.
- Added focused reflow and eligibility coverage for the responsive table-cell
  path.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/wysiwygReflow.ts`
- `src/app/editor/_components/wysiwygTextEligibility.ts`
- `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd run test:app`
- `npm.cmd test`
- `npm.cmd run review:gate`
- Browser smoke on `http://localhost:4000/editor`: entered a Flow Table cell
  paragraph through the flagged text-engine layer, pressed Enter and typed
  additional text, confirmed the paragraph stayed on the WYSIWYG text-engine
  layer with no textarea fallback, and observed the active paragraph/cell
  geometry settle on the responsive path.

Notes:

- This does not add a table-aware live preview equivalent to body paragraphs.
- Table row/cell geometry still comes from draft pagination, keeping the
  preview aligned with current table pagination semantics.

### Hide Flow Table Row Chrome And Enable Cell Text Engine Path

Goal: Fix Flow Table merged-cell editing so lower row fragments do not visually
cover merged cells, and cell paragraphs use the same flagged text-engine edit
path as normal paragraphs.

Completed:

- Kept `flow-table-row` fragments in the canvas as geometry/debug fragments but
  removed their visible chrome, labels, and selection outline.
- Preserved `flow-table-cell` fragments as the visible and hit-testable merged
  cell surface.
- Allowed plain `table-cell` and `flow-table-cell` paragraphs to enter the
  flagged WYSIWYG text-engine lane.
- Kept the existing table-cell boundary Backspace guard separate from the text
  engine eligibility change.
- Updated focused editor text-surface and eligibility coverage.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/wysiwygTextEligibility.ts`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd run test:app`
- `npm.cmd test`
- `npm.cmd run review:gate`
- Browser smoke on `http://localhost:4000/editor`: verified Flow Table row
  fragments render with transparent fill/stroke, zero opacity, no row label, no
  row selection outline, and `pointer-events: none`; double-clicked a Flow Table
  cell paragraph, typed through the flagged WYSIWYG text-engine layer, and
  confirmed no textarea fallback was mounted.

Notes:

- This does not add a Flow Table row handle/gutter.
- Same-page row/cell height patching remains guarded; table layout still
  settles through existing preview and authoritative pagination.

### Make Flow Table Row Chrome Pointer-Transparent

Goal: Prevent Flow Table row fragments from stealing canvas clicks from merged
or row-spanning cells that visually overlap later row chrome.

Completed:

- Made `flow-table-row` fragments visual-only for pointer hit testing in the
  editor canvas.
- Kept `flow-table-cell` fragments as the primary canvas hit target for merged
  and row-spanning cell areas.
- Added focused `EditorCanvas` coverage that asserts row fragments are
  pointer-transparent while merged cell fragments remain hit-testable.
- Updated editor UX and table editing contracts for the Flow Table row-chrome
  policy.

Files changed:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `git diff --check`
- `npm.cmd test`
- `npm.cmd run review:gate`
- Browser smoke on `http://localhost:4000/editor`: inserted a Flow table from
  the palette, merged the first cell right/down, verified row fragments were
  pointer-transparent, and clicked the lower-row-overlap area inside the merged
  cell; the PropertyPanel remained on `FLOW TABLE CELL`.

Notes:

- This does not add a dedicated row handle/gutter.
- Flow Table row model data and property-panel path inspection remain intact.

### Add Flow Table C2.8D Merge Map Row/Column Maintenance

Goal: Keep Flow Table merge-map metadata valid and useful when row/column
operations edit spans that already contain mapped merged content.

Completed:

- Added operation helpers to normalize shifted/pruned `mergeMap` entries after
  row/column structural edits.
- Shifted mapped row offsets forward when inserting a row through a mapped span.
- Shifted mapped column offsets forward when inserting a column through a
  mapped span.
- Shifted offsets back when deleting an inserted empty row through a mapped
  span.
- Pruned mappings for deleted source slots while keeping their child blocks on
  the origin cell to avoid data loss.
- Added focused operation coverage for insert-row, insert-column, remove
  inserted-row, and mapped-column deletion fallback behavior.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `src/app/__tests__/projectVersion.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/assert.test.ts src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- This does not add true arbitrary span-origin movement.
- Deleting a source slot intentionally preserves child content on the origin
  cell instead of trying to restore a deleted slot.
- The project version marker test was aligned to the already-accepted `0.5.6`
  root package marker so the app suite can pass after the prior release bump.

### Add Flow Table C2.8C Merge Map Restoration

Goal: Use Flow Table merge-map metadata to restore merged content during
span shrink and unmerge without adding new UI controls.

Completed:

- Added shrink/unmerge content splitting for `flow-table-cell.props.mergeMap`.
- Kept mapped child blocks whose source slots remain inside the new span on the
  surviving origin cell.
- Reused mapped child blocks from released slots when creating replacement
  cells.
- Kept unmapped child blocks on the origin cell to avoid data loss.
- Cleared `mergeMap` metadata from restored cells in this slice.
- Added focused operation coverage for full unmerge restoration and partial
  shrink restoration.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/assert.test.ts src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- This does not add true arbitrary span-origin movement.
- Restored replacement cells do not receive nested merge maps yet.

### Add Flow Table C2.8B Merge Map Writing

Goal: Start recording source-slot metadata during Flow Table cell merge without
turning on unmerge restoration yet.

Completed:

- Updated `updateFlowTableCellSpan(...)` to write `mergeMap` during span
  expansion when merge appends non-empty content or carries existing mapped
  content.
- Composed merge maps across chained merges by shifting consumed cell offsets
  relative to the surviving origin cell.
- Kept empty-only merge free of unnecessary metadata.
- Cleared stale `mergeMap` metadata on shrink/unmerge because restoration is
  still deferred in this slice.
- Added focused operation coverage for 2x2 non-empty merge mapping,
  neighbor-origin left/up mapping, chained merge offset preservation, empty-only
  merge, and current no-restore unmerge behavior.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/assert.test.ts src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- Unmerge content restoration from `mergeMap` remains deferred to C2.8C.
- True arbitrary span-origin movement remains deferred.

### Add Flow Table C2.8A Merge Map Schema Foundation

Goal: Add a document-owned metadata foundation for future Flow Table content
restoration without changing current merge/unmerge behavior.

Completed:

- Added optional `flow-table-cell.props.mergeMap` schema with versioned entries
  that map child ids to relative row/column offsets inside the current span.
- Added assert-layer validation that merge-map offsets stay inside the current
  `rowspan`/`colspan`, mapped child ids belong to the owning cell, and a child
  id is not mapped more than once.
- Added normalization for stale merge-map entries, pruning invalid offsets,
  missing child ids, and duplicate child mappings.
- Added focused assert and normalize coverage for valid metadata, invalid
  child references, out-of-span offsets, and stale-entry pruning.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `packages/core/src/schema/table.ts`
- `packages/core/src/document/assert.ts`
- `packages/core/src/document/assert.test.ts`
- `packages/core/src/document/normalize.ts`
- `packages/core/src/document/normalize.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/assert.test.ts src/document/normalize.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- Merge/unmerge operations do not yet write or consume `mergeMap`.
- Content restoration remains deferred to the next C2.8 slice.

### Add Flow Table C2.7A Merged Cell Multi-Paragraph Text Editing

Goal: Keep content appended by non-empty Flow Table merge visible and editable
from the PropertyPanel without changing schema, pagination, export, or merge
metadata.

Completed:

- Updated the selected Flow Table cell PropertyPanel to render every paragraph
  child as its own text area instead of only the first child paragraph.
- Kept mixed-inline paragraphs read-only through the existing
  `isPlainTextParagraph(...)` guard.
- Kept text updates on the existing `updateParagraphText(...)` operation, which
  already supports paragraphs nested inside `flow-table` nodes.
- Added PropertyPanel coverage for a merged cell containing multiple paragraph
  children.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`
- `$env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:editor`

Notes:

- This patch does not add paragraph add/delete/reorder controls.
- Canvas-level selection ergonomics for multiple paragraph children remain
  deferred.

## 2026-05-17

### Add Flow Table C2.6 Neighbor-Origin Merge Left/Up

Goal: Add practical `Merge left` and `Merge up` controls without introducing
true span-origin movement or source-cell content mapping metadata.

Completed:

- Added a core `resolveFlowTableCellMergeTarget(...)` helper that resolves
  directional merge intent into the existing span operation target.
- Kept `Merge right`/`Merge down` as selected-cell expansion and added
  `Merge left`/`Merge up` as neighbor-origin actions when an aligned left/upper
  origin can consume the selected cell.
- Reused `updateFlowTableCellSpan(...)` for all content append and grid-law
  preservation.
- Moved editor selection to the surviving neighbor after left/up merge.
- Added focused operation coverage for merge left, merge up, and misaligned
  left-neighbor blocking.
- Updated PropertyPanel coverage for the new left/up affordances.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`
- `$env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:editor`

Notes:

- Default bundled-Chromium `npm.cmd run smoke:editor` timed out after 240s
  before emitting pass/fail detail. The same smoke passed with system Chrome.
- True arbitrary span-origin movement remains deferred.
- Source-cell content mapping restoration remains deferred.

### Add Flow Table C2.5A Non-Empty Merge Append

Goal: Allow practical Flow Table merge through non-empty cells without adding
source-cell content metadata or span-origin movement.

Completed:

- Updated the shared Flow Table span operation so selected-cell expansion may
  consume non-empty cells that are wholly inside the requested span rectangle.
- Appended consumed cell child blocks to the selected cell in row-major order.
- Discarded empty placeholder paragraphs from consumed cells so empty merge
  does not create extra blank content.
- Kept unmerge behavior intentionally one-way for content: combined content
  stays in the selected cell and vacated slots receive empty replacement cells.
- Updated PropertyPanel copy for `Merge right`, `Merge down`, and `Unmerge` to
  reflect content append behavior.
- Added focused operation coverage for row-major content append and unmerge
  after content merge.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`
- `npm.cmd run smoke:editor`

Notes:

- Source-cell content mapping restoration remains deferred.
- Span-origin movement remains deferred.

### Add Flow Table C2.3B/C2.4 Empty Merge And Unmerge Controls

Goal: Make the safe span operation easier to use from the PropertyPanel without
adding non-empty content merge or span-origin movement.

Completed:

- Added Flow Table cell `Merge right`, `Merge down`, and `Unmerge` controls.
- Wired the buttons through `canUpdateFlowTableCellSpan(...)` and
  `updateFlowTableCellSpan(...)` so the editor never patches span props
  directly.
- Kept merge limited to empty cells wholly consumed by the requested span
  rectangle.
- Kept unmerge limited to collapsing the selected span to `1x1` and creating
  empty replacement cells.
- Added focused operation coverage for one-step right/down empty-cell merge.
- Extended PropertyPanel coverage for merge/unmerge affordances and blocked
  merge titles.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`
- `npm.cmd run smoke:editor`

Notes:

- Non-empty content merge remains a design gate.
- Span-origin movement remains deferred.

### Add Flow Table C2.3A Safe Cell Span Controls

Goal: Let the PropertyPanel author Flow Table cell `rowspan`/`colspan` through
a core operation without enabling content merge, span-origin movement, or
direct panel-side table patching.

Completed:

- Added `updateFlowTableCellSpan(...)` and
  `canUpdateFlowTableCellSpan(...)` to the document operations layer.
- Expansion now succeeds only when every consumed cell is empty and wholly
  inside the requested span rectangle.
- Shrinking a selected span creates empty replacement cells in the vacated grid
  slots so the Flow Table remains valid.
- Kept non-empty content merge and span-origin movement out of scope; blocked
  attempts no-op.
- Wired Flow Table cell PropertyPanel span controls through the new core
  operation.
- Added focused core and app coverage for empty-cell expansion, non-empty-cell
  blocking, shrink replacement cells, and rendered span controls.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- This is not general merge/unmerge. Cells with authored content are not merged
  or moved.
- Cross-page WYSIWYG editing inside Flow Table remains deferred.

### Add Flow Table C2.2 Conservative Span-Aware Delete

Goal: Let Flow Table delete rows/columns through spans only when the operation
can preserve grid law without moving a span origin or deciding where content
should move.

Completed:

- Added exported `canRemoveFlowTableRow(...)` and
  `canRemoveFlowTableColumn(...)` helpers backed by the shared Flow Table grid
  resolver.
- Updated `removeFlowTableRow(...)` so deleting a row covered by a `rowspan`
  from above shrinks the covering cell, deletes only origin cells that live
  fully in the removed row, and still blocks deletion when the removed row owns
  a continuing span.
- Updated `removeFlowTableColumn(...)` with the same conservative policy for
  `colspan`, including width transfer preservation.
- Rewired PropertyPanel delete buttons to use the same core safe-delete helpers
  that document mutations use.
- Added focused tests for safe row deletion through `rowspan`, blocked row
  origin deletion, safe column deletion through `colspan`, blocked column origin
  deletion, and property-panel enablement/locking.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`

Notes:

- Span-origin movement and merge/unmerge remain intentionally deferred.
- Browser smoke was not run for this entry yet.

### Add Flow Table C2.1 Span-Aware Insert Operations

Goal: Let Flow Table add-row and add-column operations work on valid spanned
tables without enabling span-aware deletion or merge/unmerge yet.

Completed:

- Updated `addFlowTableRow(...)` to use the Flow Table grid resolver for
  insert-boundary decisions.
- When a new row cuts through an existing `rowspan`, the covering origin cell
  now expands its `rowspan`; the inserted row creates empty cells only in
  columns not covered by that span.
- Updated `addFlowTableColumn(...)` with the same resolver-backed policy for
  `colspan`, including width splitting and total table width preservation.
- Kept spanned row/column deletion conservative: delete still no-ops until C2
  defines origin/content movement rules.
- Opened PropertyPanel add-row/add-column controls for valid spanned Flow
  Tables while keeping delete controls disabled for spanned grids.
- Added focused core tests for row insertion through `rowspan` and column
  insertion through `colspan`, plus app markup coverage for add-only spanned
  controls.
- Updated Flow Table spec, table editing contract, and test strategy notes.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/document/flowTableGrid.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/PropertyPanel.test.ts`

Notes:

- Span-aware deletion and merge/unmerge remain intentionally deferred.
- Browser smoke was not run for this entry yet.

### Add Flow Table C2.0 Grid Mutation Metadata

Goal: Start C2 span-aware Flow Table work with a resolver-only foundation that
does not change editor operations yet.

Completed:

- Extended `resolveFlowTableGrid(...)` with mutation-oriented metadata while
  preserving the existing `slots` and `placements` surfaces used by layout and
  pagination.
- Added per-slot origin metadata so future operations can distinguish physical
  row/column slots from the originating cell row/column.
- Added placement end bounds, covered slot lists, and placement lookup by cell
  id for later span-aware row/column operations.
- Added `tryResolveFlowTableGrid(...)` for callers that need typed invalid
  results rather than exceptions.
- Hardened resolver validation for duplicate cell references and invalid
  non-positive spans when the resolver is called outside document assertion.
- Updated Flow Table spec, table editing contract, and test strategy notes for
  the C2.0 boundary.

Verification:

- `npm.cmd run test -w packages/core -- src/document/flowTableGrid.test.ts`

Notes:

- Span-aware add/remove row/column behavior remains intentionally unchanged.
- Merge/unmerge remains a later C2 product/operation decision.

### Add Flow Table Editor Entry

Goal: Start Flow Table editor usability with a small, reversible A1 slice:
explicit 3x3 insertion plus enough selection/text support to inspect and edit
the inserted primitive.

Completed:

- Added `createDefaultFlowTable()` and mapped the `flow-table` palette source
  to a schema-valid 3x3 Flow Table with paragraph children in every cell.
- Added `flow-table` to placement palette typing and protected body insertion
  while keeping Flow Table insertion rejected inside `flow-stack`.
- Added the Flow Table palette item without replacing the legacy `table`
  palette item.
- Extended editor selection helpers, breadcrumb context, outline, and property
  lookup to recognize `flow-table`, `flow-table-row`, and `flow-table-cell`.
- Reused conservative table-cell text paths for Flow Table cell text editing,
  field references, filling, and snapshot binding.
- Documented the current editor-entry status in the Flow Table spec and test
  strategy.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts src/placement/law.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/EditorPalette.test.ts src/app/editor/_components/__tests__/selectionContext.test.ts`
- `npm.cmd run test -w packages/core -- src/fieldRegistry/index.test.ts src/binding/index.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- Legacy `table` insertion is intentionally still present.
- Flow Table row/column/span editing operations remain later slices.
- Live cross-page WYSIWYG editing inside Flow Table remains deferred.

### Add Flow Table DOCX Span Metadata

Goal: Carry Flow Table span semantics through pagination into DOCX without
making the DOCX renderer read authored schema or recompute table layout.

Completed:

- Added renderer-facing Flow Table grid metadata to paginated table and row
  fragments.
- Added renderer-facing Flow Table cell span metadata with column index,
  `colspan`, and `rowspan`.
- Updated DOCX Flow Table projection to use paginated base column widths,
  Word `gridSpan`, and Word vertical merge metadata.
- Added pagination assertions for Flow Table grid/span metadata.
- Added DOCX XML coverage for Flow Table base grid columns, `gridSpan`, and
  `vMerge` output.
- Hardened split/repeated-header DOCX coverage so continuation pages without a
  parent table fragment still preserve base column widths.
- Updated Flow Table, renderer contract, and test strategy docs.

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/flowTablePagination.test.ts src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd test`
- `npm.cmd run review:gate`

Notes:

- DOCX still consumes only `PaginatedDocument`; it does not import schema,
  layout, measurers, or word breakers.
- Split-inside-rowspan remains intentionally deferred under the current Flow
  Table pagination policy.

### Add Flow Table DOCX Fragment Projection

Goal: Add the first best-effort DOCX support slice for Flow Table by projecting
paginated fragments to editable fixed-layout Word tables without adding
semantic span metadata yet.

Completed:

- Extended DOCX fragment grouping to recognize `flow-table`,
  `flow-table-row`, and `flow-table-cell` fragments.
- Added synthetic Flow Table grouping for continuation pages that contain
  repeated header/body row fragments without a parent table fragment.
- Projected Flow Table rows/cells to fixed-layout DOCX tables using paginated
  table width, row heights, cell widths, cell box fill/border/padding metadata,
  and editable paragraph children.
- Added focused DOCX renderer tests for static Flow Table geometry/styling and
  split Flow Table output with repeated headers.
- Updated renderer contract, Flow Table spec, and test strategy notes for the
  Phase A DOCX projection scope.

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/renderer.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- `npm.cmd test`

Notes:

- Semantic DOCX span metadata such as `gridSpan` and `vMerge` was intentionally
  deferred from this Phase A slice and is covered by the later DOCX span
  metadata entry above.
- DOCX remains an exchange format; PDF/editor pagination remains the visual
  authority.

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
  the same paginated metadata.
- Rendered flow-stack fill/borders in editor preview and PDF, and mapped them to
  DOCX layout-table cell shading, borders, and margins.
- Moved flow-row and flow-stack `Min height` controls into their `Layout` tabs.
- Updated the flow-row/flow-stack roadmap/spec to record the focused
  flow-stack box decision while keeping flow-row box styling deferred.

Verification:

- `npm.cmd test -- packages/core/src/document/normalize.test.ts packages/core/src/document/operations.test.ts packages/core/src/layout/__tests__/flowRowStack.test.ts packages/core/src/pagination/__tests__/flowRowStack.test.ts packages/core/src/renderer/__tests__/renderer.test.ts src/app/editor/_components/__tests__/PropertyPanel.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- Flow-row Box styling is intentionally not implemented in this slice.
- DOCX remains best-effort and uses table-cell formatting for flow-stack box
  output; PDF/editor continue to be the visual authority.

## 2026-05-14

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

---

### Add Paragraph-Level Text Style Controls

Goal: Add the basic document text styles before rich text, without introducing
range-level inline formatting.

Completed:

- Added paragraph-level `fontWeight`, `fontStyle`, and `textDecoration` props
  with normalization defaults.
- Routed bold/italic measurement through available catalog font variants for
  browser/server pagination and PDF rendering.
- Added paragraph property-panel `B`, `I`, and `U` controls; italic is blocked
  from being newly enabled when the selected font has no italic variant.
- Serialized DOCX bold, italic, and underline run properties; DOCX embedded
  font files were still regular-only in that initial style slice.

Verification:

- Focused core/app tests and type-check for the style slice.

Notes:

- This is paragraph-level styling only. Range-level rich text was deferred;
  text color and strikethrough were handled in a later paragraph-level slice.

---

### Embed DOCX Paragraph Font Variants

Goal: Finish the export follow-up for paragraph-level font styles by making
DOCX server exports embed the same catalog variants used by measurement and PDF
rendering.

Completed:

- Replaced DOCX regular-only font embedding with a focused font-table ZIP
  injection path for `embedRegular`, `embedBold`, `embedItalic`, and
  `embedBoldItalic`.
- Kept provider-less DOCX rendering name-only.
- Added renderer and API route coverage for styled DOCX runs and matching
  embedded font variant files.
- Updated the font export support marker from `embedded-regular` to
  `embedded-variants`.

Notes:

- This remained paragraph-level only. Range-level rich text was out of scope;
  text color and strikethrough were handled in the next paragraph-level slice.

---

### Add Paragraph Text Color And Strikethrough

Goal: Fill the next basic paragraph-style gap without introducing range-level
rich text.

Completed:

- Added paragraph-level `textColor` and `strikethrough` props with defaults and
  normalization.
- Carried the props through pagination render metadata.
- Rendered text color and combined underline/line-through decoration in the
  editor SVG text layer.
- Rendered PDF text, underline, and strikethrough using the paragraph text
  color.
- Serialized DOCX text color and strike run properties.
- Added property-panel controls for text color swatches and strikethrough.

Notes:

- This is still paragraph-level styling. Range-level rich text and highlight
  color remain out of scope.

---

### Bump Paragraph Style Export Baseline To 0.6.1

Goal: Mark the font/export milestone patch after paragraph-level style controls
and export coverage landed.

Completed:

- Bumped the root project version marker from `0.6.0` to `0.6.1`.
- Updated the lockfile root package version to match.
- Updated the project version marker test to assert the accepted `0.6.1`
  baseline.
- Updated versioning docs so the current baseline points at `0.6.1`.
- Kept persisted document/package schema versions unchanged.

Notes:

- This is a project release-readiness marker only. It does not change
  `DocumentNode.version`, FlowDoc package version, or storage package version.
