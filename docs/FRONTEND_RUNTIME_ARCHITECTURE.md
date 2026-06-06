# Frontend Runtime Architecture RFC

Date: 2026-06-04
Status: Task 14 RFC, Tasks 15-18 partial runtime extraction implemented; Task 30 Stage 4C closure completed; Tasks 38-42 preview-settle Shell executors completed

## Scope

This RFC defines a gradual frontend runtime boundary plan for reducing
`EditorShell` responsibility after Task 13. It does not move production code,
change editor behavior, optimize performance, change core pagination, change
the document model, change renderer/export/persistence behavior, change
FlowTable, remove `flushSync`, or weaken validation.

Primary evidence read:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/FlowdocDraftEditorIslandRoot.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/shell/EditorLeftRail.tsx`
- `src/app/editor/_components/editorReducer.ts`
- `src/app/editor/_components/wysiwygPerformance.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`
- Task 13 reports under `reports/`

Path notes:

- `src/app/editor/_components/EditorLeftRail.tsx` was not found in the current
  tree. The current implementation is
  `src/app/editor/_components/shell/EditorLeftRail.tsx`.
- `src/app/editor/_components/wysiwygStructuralRefocus.ts` was not found in the
  current tree. The current optimistic structural helper is
  `src/app/editor/_components/optimisticStructuralRefocus.ts`.

## Current Problem

`EditorShell` is currently too broad. It owns normal editor composition, but it
also coordinates urgent structural edit transactions, WYSIWYG draft state,
preview pagination, panel deferral, render isolation, and diagnostic
attribution.

Evidence:

- Main shell state starts around `EditorShell.tsx:1179`, including document
  reducer state, preview layout state, registry/snapshot state, editor modes,
  rails, and export status.
- Optimistic structural state and panel release state live directly in
  `EditorShell` around `EditorShell.tsx:1271-1527`.
- Pending optimistic split/merge, rollback, settle, inline edit, drag, preview,
  and draft pagination refs live together around `EditorShell.tsx:1692-1823`.
- WYSIWYG plain and rich draft sessions are projected and mediated by Shell
  around `EditorShell.tsx:2029-2160`.
- Structural split/merge handlers and optimistic transaction setup live in
  Shell around `EditorShell.tsx:3192-3927`.
- Full browser preview settle, stale generation guards, worker fallback, and
  layout state commits live in Shell around `EditorShell.tsx:4478-4939`.
- Canvas props for structural islands, WYSIWYG draft props, selection, page
  scope, and edit callbacks are cascaded from Shell around
  `EditorShell.tsx:6480-6578`.
- Left, top, and right panels are frozen through Shell-owned
  `StructuralPaintDeferredSubtree` and release state around
  `EditorShell.tsx:6335-6708`.

The current symptoms are not one isolated bug anymore. Task 13 correctness is
passing, but the remaining issue is runtime orchestration:

- urgent and non-urgent work are mixed in the same Shell callbacks;
- transaction lifecycle is spread across refs, state, effects, and reducer
  dispatch;
- panels derive from document state too synchronously unless Shell snapshots
  them;
- structural edit cleanup and panel release are distributed across the island,
  Shell effects, preview settle effects, and panel render wrappers;
- the Shell-to-Canvas prop cascade makes render isolation fragile because many
  unrelated props still flow through the same component boundary.

Task 13 report evidence supports this separation. The repeated
`task13-enter-mid-split-repeat5-rerun.json` report passed with median first
island paint about `111.6ms`, full pagination settle about `2932.1ms`,
`pagesRenderedDuringStructuralTransition = 1`, `unaffectedPagesRenderedCount =
0`, and `deferredLeftRailReleaseRanInsideUrgentStructuralFlush = false` for all
measured samples. The repeated `task13-enter-backspace-immediate-repeat5.json`
report also passed with split and merge correctness, stale settle superseded,
page isolation preserved, and deferred panel release outside urgent flush.

## Priority Lanes

### A. Urgent Edit Lane

Owns only:

- the minimal document commit required for correctness;
- active island node validity;
- caret and text session continuity;
- affected page preview needed for the current edit;
- boundary-safe visual suppression needed for the current edit.

Must not contain:

- full pagination settle;
- outline or panel rebuild;
- toolbar derived work;
- non-critical metrics aggregation;
- left or right rail refresh.

Current evidence:

- Split and merge optimistic paths use `flushSync` to combine inline edit
  session setup, text session setup, reducer dispatch, and island override setup
  in `EditorShell.tsx:3468-3567` and `EditorShell.tsx:3773-3864`.
- `FlowdocDraftEditorIslandRoot` reports the urgent paint through
  `onStructuralRefocusPainted` around
  `FlowdocDraftEditorIslandRoot.tsx:1893`.

### B. Affected Preview Lane

Owns:

- affected page fragment view;
- page-scoped edit props;
- boundary-safe visual suppression;
- page memoization identity.

Current evidence:

- `EditorCanvas.pageViewScopedEditPropsAffectPage` and
  `pageViewStructuralTransitionAffectsPage` define page-scoped rerender rules
  around `EditorCanvas.tsx:3774-3798`.
- `arePageViewPropsEqual` can ignore structural document/page snapshot changes
  for unrelated pages around `EditorCanvas.tsx:3806-3892`.
- `structuralRenderScope` records affected page indexes around
  `EditorCanvas.tsx:4801-4849`.

### C. Deferred Panel Lane

Owns:

- left rail snapshot/live release;
- right rail freeze/release;
- top toolbar freeze/release;
- stale or non-interactive panel status;
- latest-generation-only release;
- input quiet window;
- release after first paint or idle.

Current evidence:

- Shell creates `DeferredStructuralPanelRelease` and generation refs around
  `EditorShell.tsx:1273-1283`.
- `beginStructuralPanelReleaseDeferral`,
  `scheduleDeferredStructuralPanelRelease`, and input quiet handling live around
  `EditorShell.tsx:1341-1527`.
- Left rail document snapshots are held around `EditorShell.tsx:1840-1885`.
- Panel subtree freeze wrappers are rendered around
  `EditorShell.tsx:6335-6708`.
- `EditorLeftRail` itself already accepts `outlineDoc`, `styleDoc`, and
  `editable` inputs and can render safe/noop selection callbacks when not
  editable around `shell/EditorLeftRail.tsx:13-25` and
  `shell/EditorLeftRail.tsx:157-181`.

### D. Background Settle Lane

Owns:

- full pagination settle;
- stale pagination guard;
- page count finalization;
- non-urgent preview consistency.

Current evidence:

- Shell generation and worker refs live around `EditorShell.tsx:4256-4262`.
- Browser preview pagination schedule, generation checks, inline-edit node
  checks, draft-version checks, worker fallback, partial preview, and final
  `SET_PAGINATED` dispatch live around `EditorShell.tsx:4478-4939`.
- `docs/LAZY_PAGINATION_PLAN.md` defines `placeholder`, `settling`,
  `partial`, and `full` preview status and requires partial preview to remain
  editor-only.

### E. Diagnostic Lane

Owns:

- performance spans;
- render counters;
- probe report fields;
- debug-only markers.

Current evidence:

- `wysiwygPerformance.ts` defines structural event kinds and scalar fields
  around `wysiwygPerformance.ts:1-120`.
- Shell and Canvas each wrap derived values with structural render attribution
  around `EditorShell.tsx:1529-1577` and `EditorCanvas.tsx:4385-4455`.
- `scripts/wysiwyg-smoothness-probe.mjs` builds Task 13 structural performance
  attribution and correctness reports around
  `scripts/wysiwyg-smoothness-probe.mjs:4880-5328`.

## Proposed Runtime Modules

### A. StructuralEditRuntime

Owns:

- structural edit transaction id;
- split/merge/delete-empty kind;
- source node id;
- target node id;
- removed node id;
- phase lifecycle;
- abort cleanup;
- key-repeat guard coordination;
- urgent paint started/completed;
- generation token shared with panel and settle runtimes;
- transition correctness invariants.

Does not own:

- full pagination algorithm;
- panel rendering;
- document schema operations themselves;
- PDF/export;
- persistence.

Suggested phase model:

- `idle`
- `preparing`
- `committing`
- `urgent-painting`
- `urgent-painted`
- `panel-release-pending`
- `settling`
- `complete`
- `aborted`

Initial extraction target:

- Move phase, generation, pending transaction, and abort bookkeeping first.
- Keep `splitParagraphAtIndex`, `mergeParagraphWithPrevious`, reducer dispatch,
  and existing `flushSync` sites in Shell until the transaction object is stable.

### B. WysiwygDraftRuntime

Owns:

- active draft node id;
- draft text;
- caret index;
- selection;
- IME/composition state;
- native textarea/session lifecycle;
- start/commit/cancel draft session.

Does not own:

- document split/merge policy;
- panel release;
- full pagination settle.

Current evidence:

- Plain draft state lives in `useWysiwygTextSession.ts:1-376`.
- Rich draft state lives in `richTextDraftSession.ts:26-307`.
- Shell currently projects both sessions and decides which one is active around
  `EditorShell.tsx:2029-2099`.
- `ParagraphTextSurface` still owns native textarea composition and structural
  key handling for in-canvas editing around `ParagraphTextSurface.tsx:4161-4661`.
- `FlowdocDraftEditorIslandRoot` owns out-of-canvas island draft state, guard,
  parent sync, and structural key callbacks around
  `FlowdocDraftEditorIslandRoot.tsx:551-1366`.

### C. PreviewSettleRuntime

Owns:

- preview settle request id and generation;
- current pending/running request phase;
- generation guard;
- stale settle apply/ignore/supersede/cancel decisions;
- settle metrics;
- latest-doc-only application.

Does not own:

- WYSIWYG caret;
- panel freeze/release;
- document operations.

Initial extraction target:

- Wrap `browserPaginationGenerationRef`, `interactiveDebounceRef`,
  `optimisticStructuralSettleRef`, `optimisticStructuralPreviewSettleGraceUntilRef`,
  `partialPreviewPaginated`, and worker request guards.
- Keep final `dispatch({ type: "SET_PAGINATED" })` in Shell until the runtime
  has a tested latest-doc-only contract.

Task 18 implementation note:

- Added `PreviewSettleRuntime` as a pure lifecycle/decision runtime for request
  id, generation, phase, current request identity, apply/ignore/supersede/cancel
  decisions, and settle counters.
- `EditorShell` now asks the runtime for browser preview generation and stale
  apply decisions before starting or committing full preview pagination.
- `EditorShell` still owns debounce timers, worker request mechanics,
  main-thread pagination calls, partial preview React state, full preview React
  state, `SET_PAGINATED`, `optimisticLayoutRef`, and structural visual metadata
  used by existing probes.
- `optimisticStructuralSettleRef` and
  `optimisticStructuralPreviewSettleGraceUntilRef` remain Shell metadata/timing
  inputs in Task 18; moving them behind a richer runtime scheduler adapter is
  deferred until scheduling side effects are ready to move.

### D. CanvasViewportRuntime

Owns:

- DOM-free page-scoped edit decisions;
- affected page rerender predicates;
- structural render-scope summaries;
- boundary-safe page-break visual suppression decisions;
- CanvasViewport smoke/report metric aliases.

Does not own:

- split/merge transaction;
- full document mutation;
- panels/toolbar.
- React memo/profiler side effects;
- DOM event handling;
- lazy page mounting.

Task 19 implementation:

- `runtime/canvasViewportTypes.ts` defines the DOM-free contract around
  `CanvasViewportStructuralIslandInput`, page-scoped edit input, boundary-safe
  suppression input, render scope, and metrics.
- `runtime/canvasViewportRuntime.ts` owns
  `shouldSuppressBoundarySafePageBreak`,
  `shouldSuppressStalePageBreakForActiveEdit`,
  `getPageScopedEditDecision`,
  `pageViewScopedEditPropsAffectPage`,
  `pageViewStructuralTransitionAffectsPage`,
  `getCanvasViewportStructuralRenderScope`, and
  `createCanvasViewportMetrics`.
- `EditorCanvas.tsx` keeps the old exported helper names as wrappers for test
  compatibility and local React integration, and still owns rendering,
  memo-comparator wiring, profiler events, forced page keys, and SVG/DOM event
  handling.
- `scripts/wysiwyg-smoothness-probe.mjs` keeps legacy counters and adds
  CanvasViewport aliases for affected page count, affected pages, suppressed
  page-break count, and unrelated suppressed page-break count.

### E. PanelDeferralRuntime

Owns:

- snapshot document for panels;
- stale/live panel status;
- non-interactive stale panels;
- deferred release scheduling;
- generation/token safety;
- input quiet window;
- idle release;
- stale release cancellation;
- freeze duration metrics.

Does not own:

- document mutation;
- active WYSIWYG text session;
- pagination computation.

Initial extraction target:

- Move `DeferredStructuralPanelRelease`, scheduled release refs, generation
  refs, input quiet listener, and left rail snapshot state.
- Keep `StructuralPaintDeferredSubtree` use sites in Shell until panel status
  props are explicit.

### F. EditorPerformanceRuntime

Owns:

- span lifecycle;
- counters;
- component render attribution;
- probe event bridge;
- structured report schema;
- quiet-by-default debug mode.

Does not own:

- editor state semantics;
- document mutation;
- UI behavior.

Initial extraction target:

- Keep `wysiwygPerformance.ts` as the event schema boundary.
- Add module-level helpers only when a runtime extraction would otherwise copy
  span/event glue.

Task 20 implementation:

- `runtime/editorPerformanceTypes.ts` defines stable lanes, event kinds,
  sources, samples, normalized report shape, boundary-safe suppression
  observation states, frame-window metadata, and timing-anchor inputs.
- `runtime/editorPerformanceRuntime.ts` owns the Task 20 field inventory,
  report schema version, timing-anchor version, counter/timing/flag/field
  recording helpers, legacy alias creation, runtime metric merging, boundary
  suppression classification, frame-window metadata, timing-anchor normalization,
  and report normalization.
- `wysiwygPerformance.ts` remains the app compatibility facade for event
  recording and now exposes report schema/metric-definition helpers from
  `EditorPerformanceRuntime`.
- `scripts/wysiwyg-smoothness-probe.mjs` still owns browser DOM observation and
  Playwright probe flow, but now emits the normalized report schema version,
  boundary-safe suppression semantic fields, frame-window metadata, and timing
  anchor fields.
- React component behavior, page memo decisions, pagination scheduling, panel
  deferral timing, and preview settle scheduling remain outside this runtime.

## Current Ownership Inventory

| Current symbol / state / ref / callback | Current file / approximate line | Current responsibility | Proposed owner runtime | Migration risk | Notes |
|---|---:|---|---|---|---|
| `optimisticStructuralRefocusPaint` | `EditorShell.tsx:1271` | Marks active structural paint window and node id. | StructuralEditRuntime | Medium | Drives panel deferral and perf attribution. |
| `optimisticStructuralIslandOverride` | `EditorShell.tsx:1272` | Supplies out-of-canvas island paragraph, fragment, page key, suppression, removed node. | StructuralEditRuntime plus CanvasViewportRuntime | High | Must keep active island node valid and avoid ghost fragments. |
| `deferredStructuralPanelRelease` | `EditorShell.tsx:1273` | Tracks pending panel freeze/live release state. | PanelDeferralRuntime | Medium | Needs latest-generation-only release. |
| `deferredStructuralPanelReleaseRef` | `EditorShell.tsx:1274` | Ref mirror for async release callbacks. | PanelDeferralRuntime | Medium | Async stale closure risk. |
| `structuralPanelReleaseGenerationRef` | `EditorShell.tsx:1275` | Latest structural panel generation token. | StructuralEditRuntime shared with PanelDeferralRuntime | High | Should become transaction generation token. |
| `scheduledStructuralPanelReleaseRef` | `EditorShell.tsx:1276` | RAF/timeout/idle release handle. | PanelDeferralRuntime | Medium | Must cancel on unmount/new generation. |
| `structuralPanelReleaseUrgentPaintRef` | `EditorShell.tsx:1277` | Blocks panel release until urgent island paint completes. | StructuralEditRuntime plus PanelDeferralRuntime | High | Current success depends on `onStructuralRefocusPainted`. |
| `structuralPanelReleaseLastInputAtRef` | `EditorShell.tsx:1278` | Input quiet window timestamp. | PanelDeferralRuntime | Medium | Must not block immediate typing. |
| `structuralPanelReleaseApplyingRef` | `EditorShell.tsx:1279` | Measures live doc restore after release. | PanelDeferralRuntime plus EditorPerformanceRuntime | Low | Diagnostic state only if release semantics stay unchanged. |
| `recordStructuralPanelReleaseEvent` | `EditorShell.tsx:1293` | Emits panel release perf events. | EditorPerformanceRuntime | Low | Keep event schema stable for probes. |
| `beginStructuralPanelReleaseDeferral` | `EditorShell.tsx:1341` | Starts panel freeze for split/merge. | PanelDeferralRuntime | High | Called inside structural transaction setup. |
| `scheduleDeferredStructuralPanelRelease` | `EditorShell.tsx:1379` | Schedules release after RAF/min delay/idle/input quiet. | PanelDeferralRuntime | Medium | Must remain outside urgent flush. |
| `pendingOptimisticSplitRefocusRef` | `EditorShell.tsx:1693` | Pending split transaction context. | StructuralEditRuntime | High | Needs rollback and immediate Backspace safety. |
| `pendingOptimisticMergeRefocusRef` | `EditorShell.tsx:1694` | Pending merge transaction context. | StructuralEditRuntime | High | Must preserve merge removed-node cleanup. |
| `optimisticStructuralSettleRef` | `EditorShell.tsx:1698` | Pending structural full-settle marker. | PreviewSettleRuntime | High | Must not let stale settle overwrite newer doc. |
| `optimisticStructuralPreviewSettleGraceUntilRef` | `EditorShell.tsx:1699` | Debounce grace for structural settle. | PreviewSettleRuntime | Medium | Affects first island vs full settle timing. |
| `pendingBoundarySafeInlineEditEndRef` | `EditorShell.tsx:1700` | Delays edit end until boundary-safe settled fragment exists. | StructuralEditRuntime plus CanvasViewportRuntime | Medium | Visual-only suppression must clear. |
| `suppressNextLayoutLoadingOverlayRef` | `EditorShell.tsx:1705` | Prevents loading overlay during responsive/optimistic preview commits. | PreviewSettleRuntime | Medium | Must not hide real stale state indefinitely. |
| `dispatchEditorAction` | `EditorShell.tsx:1706` | Classifies actions, suppresses overlay, dispatches reducer, emits perf. | StructuralEditRuntime plus EditorPerformanceRuntime | Medium | Keep reducer/history unchanged. |
| `docRef`, `paginatedRef` | `EditorShell.tsx:1813-1815` | Latest doc/layout refs used by async callbacks. | Shell composition until runtimes stabilize | High | Moving too early risks stale doc commits. |
| `wysiwygDraftPagination*Ref` | `EditorShell.tsx:1818-1824` | Draft pagination debounce/frame/generation/latest snapshot. | PreviewSettleRuntime or WysiwygDraftRuntime boundary | Medium | Draft pagination is settle work, not urgent typing. |
| `displayPaginated` | `EditorShell.tsx:1833` | Selects authoritative/full/partial preview layout for canvas. | PreviewSettleRuntime | High | Must preserve partial preview editor-only contract. |
| `leftRailDocumentSnapshotRef` | `EditorShell.tsx:1845` | Holds panel snapshot docs while structural paint is active. | PanelDeferralRuntime | Medium | Current left rail receives `outlineDoc` and `styleDoc`. |
| `previousDeferLeftRailForStructuralPaintRef` | `EditorShell.tsx:1846` | Detects restore transition. | PanelDeferralRuntime | Low | Diagnostic restore event depends on it. |
| `useWysiwygTextSession` plain session | `EditorShell.tsx:2029` and `useWysiwygTextSession.ts:332` | Plain draft text/caret/selection. | WysiwygDraftRuntime | Medium | Existing hook can remain as inner implementation. |
| `useWysiwygRichTextDraftSession` | `EditorShell.tsx:2040` and `richTextDraftSession.ts:255` | Rich draft paragraph/selection/style commands. | WysiwygDraftRuntime | Medium | Keep style command semantics unchanged. |
| `wysiwygTextSessionStateRef` | `EditorShell.tsx:2103` | Latest active text session for async callbacks. | WysiwygDraftRuntime | Medium | Critical for finalize and structural handlers. |
| `richTextToolbarSelectionDebounceRef` | `EditorShell.tsx:2127` | Debounces toolbar selection display. | Deferred panel lane or WysiwygDraftRuntime | Low | Toolbar display is non-urgent. |
| `setWysiwygDraftPaginationNodeId` | `EditorShell.tsx:2143` | Tracks draft pagination active node and emits diagnostics. | PreviewSettleRuntime plus EditorPerformanceRuntime | Low | Keep event kind stable. |
| `clearWysiwygDraftPagination` | `EditorShell.tsx:2261` | Cancels draft pagination and increments generation. | PreviewSettleRuntime | Medium | Must run before structural handoff/finalize. |
| `scheduleWysiwygDraftPagination` | `EditorShell.tsx:2284` | Debounced/RAF draft preview pagination and latest-only commit. | PreviewSettleRuntime | High | Must not enter urgent edit lane. |
| `finalizeWysiwygTextSessionBeforeAction` | `EditorShell.tsx:2508` | Commits active draft to document and paginated state. | WysiwygDraftRuntime API, Shell commit adapter | High | History and validation must stay unchanged. |
| `handleWysiwygTextDraftChange` | `EditorShell.tsx:2832` | Updates latest draft snapshot, session draft, pagination scheduling. | WysiwygDraftRuntime plus PreviewSettleRuntime | Medium | Split local draft vs settle scheduling. |
| `handleWysiwygTextReflowDecision` | `EditorShell.tsx:2954` | Receives active reflow decisions from text surfaces/island. | CanvasViewportRuntime plus WysiwygDraftRuntime | Medium | Page-boundary visual state must stay editor-only. |
| `prepareOptimisticSplitRefocus` | `EditorShell.tsx:3192` | Preallocates split refocus context. | StructuralEditRuntime | High | New id/order invariants. |
| `startOptimisticSplitRefocusBeforeDispatch` | `EditorShell.tsx:3342` | Performs split operation, optimistic pagination, panel deferral, `flushSync` dispatch/island setup. | StructuralEditRuntime | High | Most dangerous current coupling. |
| `startOptimisticMergeRefocusBeforeDispatch` | `EditorShell.tsx:3613` | Performs merge operation, optimistic pagination, panel deferral, `flushSync` dispatch/island setup. | StructuralEditRuntime | High | Removed-node and ghost-fragment invariants. |
| `handleSplitParagraph` | `EditorShell.tsx:3927` | Entry point from surfaces/island to split transaction/fallback dispatch. | StructuralEditRuntime public API | High | Must keep fallback behavior. |
| `handleMergeParagraph` | `EditorShell.tsx:3958` | Entry point from surfaces/island to merge transaction/fallback dispatch. | StructuralEditRuntime public API | High | Immediate Backspace after split depends on optimistic source doc. |
| `startOptimisticInlineEditAfterSplit` | `EditorShell.tsx:4087` | Older post-reducer optimistic split refocus path. | StructuralEditRuntime | Medium | Candidate for retirement only after tests prove not used. |
| `startOptimisticInlineEditAfterMerge` | `EditorShell.tsx:4191` | Older post-reducer optimistic merge refocus path. | StructuralEditRuntime | Medium | Keep until reducer result effects are untangled. |
| `browserPaginationGenerationRef` | `EditorShell.tsx:4259` | Latest browser preview generation. | PreviewSettleRuntime | High | Core stale-settle guard. |
| `precomputedBrowserPaginationRef` | `EditorShell.tsx:4262` | Fast lane for precomputed pagination. | PreviewSettleRuntime | Medium | Must not bypass latest-doc guard. |
| `optimisticLayoutRef` | `EditorShell.tsx:4263` | Latest optimistic doc/paginated snapshot. | PreviewSettleRuntime | High | Shared by draft finalize, split/merge, display preview. |
| Browser preview `useEffect` | `EditorShell.tsx:4478` | Full browser pagination scheduling, worker request, stale guards, partial/full layout commit. | PreviewSettleRuntime | High | Must preserve server/export separation. |
| `flowdocDraftEditorIslandConfig` | `EditorShell.tsx:5091` | Derives out-of-canvas island config from session/preview/layout. | CanvasViewportRuntime plus WysiwygDraftRuntime | Medium | Eligibility and fragment lookup must stay exact. |
| `activeOutOfCanvasStructuralIsland` | `EditorShell.tsx:5143` | Passes structural island visual state to Canvas. | CanvasViewportRuntime | Medium | Visual-only boundary-safe suppression. |
| `suppressedCanvasTextNodeIds` | `EditorShell.tsx:5172` | Suppresses active/removed in-canvas text while island owns visual. | CanvasViewportRuntime | High | Prevents duplicate stale text and ghost fragments. |
| `handleOptimisticStructuralRefocusPainted` | `EditorShell.tsx:5197` | Clears urgent paint and schedules panel release. | StructuralEditRuntime plus PanelDeferralRuntime | High | Phase transition should become explicit. |
| `StructuralPaintDeferredSubtree` | `EditorShell.tsx:1139` and render at `6335-6708` | Freezes top/left/right panel render trees. | PanelDeferralRuntime | Medium | Keep memo behavior until status props are tested. |
| `EditorSubtreePerfProfiler` | `EditorShell.tsx:1090` and render at `6339,6421,6708` | Subtree render attribution for panels. | EditorPerformanceRuntime | Low | Diagnostic-only. |
| `pageViewScopedEditPropsAffectPage` | `EditorCanvas.tsx:3766` | Decides if page scoped edit props affect a page. | CanvasViewportRuntime | Medium | Tests already protect page isolation. |
| `pageViewStructuralTransitionAffectsPage` | `EditorCanvas.tsx:3776` | Structural transition page-scope predicate. | CanvasViewportRuntime | Medium | Core page isolation contract. |
| `arePageViewPropsEqual` | `EditorCanvas.tsx:3852` | Page memo comparator and render attribution. | CanvasViewportRuntime plus EditorPerformanceRuntime | Medium | Do not weaken unaffected page skip. |
| `forcedPageKeys` | `EditorCanvas.tsx:4735` | Keeps initial/active/edit/structural pages mounted. | CanvasViewportRuntime | Medium | Structural page must remain rendered even with lazy pages. |
| `structuralRenderScope` | `EditorCanvas.tsx:4786` | Records affected page indexes/counts. | CanvasViewportRuntime plus EditorPerformanceRuntime | Low | Keep probe schema. |
| `engageStructuralEditGuard` | `FlowdocDraftEditorIslandRoot.tsx:607` | Guards repeated structural Enter/Backspace. | StructuralEditRuntime coordination, island local input layer | High | Must still allow normal typing and IME. |
| `clearStructuralEditGuard` | `FlowdocDraftEditorIslandRoot.tsx:586` | Unlocks guard on timeout, props commit, inactive, unmount. | StructuralEditRuntime coordination | Medium | Timeout remains safety net. |
| Island structural handlers | `FlowdocDraftEditorIslandRoot.tsx:1250-1366` | Converts Enter/Backspace to split/merge/delete-empty callbacks. | WysiwygDraftRuntime plus StructuralEditRuntime API | High | Full paragraph text and guard semantics required. |
| In-canvas textarea structural handlers | `ParagraphTextSurface.tsx:4586-4661` | In-canvas Enter/Backspace split/merge for native textarea baseline. | WysiwygDraftRuntime plus StructuralEditRuntime API | Medium | Must preserve composition bypass. |
| Performance event schema | `wysiwygPerformance.ts:1-120` | WYSIWYG and structural event kinds/fields. | EditorPerformanceRuntime | Low | Probe compatibility. |
| Probe attribution builder | `scripts/wysiwyg-smoothness-probe.mjs:4880-5328` | Builds correctness, timings, counters, and attribution report. | EditorPerformanceRuntime | Low | Keep report fields stable across migrations. |

Task 22 cleanup note: the old deferred optimistic dispatch branch was removed
from `EditorShell` after audit found no producer assignment for its split or
merge dispatch refs in the current tree. Immediate split/merge now remains on
the synchronous `flushSync` structural bridge that starts/marks
`StructuralEditRuntime` transactions directly.

## Structural Edit Transaction Contract

The proposed runtime should make the implicit transaction shape explicit.

```ts
type StructuralEditTransaction = {
  id: string
  kind: "split" | "merge" | "delete-empty"
  phase:
    | "idle"
    | "preparing"
    | "committing"
    | "urgent-painting"
    | "urgent-painted"
    | "panel-release-pending"
    | "settling"
    | "complete"
    | "aborted"

  sourceNodeId: string
  targetNodeId?: string
  removedNodeId?: string
  docVersionBefore: number
  docVersionAfter?: number
  affectedPageIds: number[]
  suppressedPageBreakNodeId?: string | null
  startedAt: number
  urgentPaintAt?: number
  panelReleaseAt?: number
  settleStartedAt?: number
  completedAt?: number
  abortReason?: string
}
```

Phase rules:

| Phase | User typing allowed? | Panel release allowed? | Full settle application allowed? | Stale release cancellation? | Repeated structural key behavior |
|---|---|---|---|---|---|
| `idle` | Yes | Yes | Yes | No active release | Normal handling |
| `preparing` | No for same structural source; normal non-structural input should not be routed here | No | No | Cancel older generation | Guard unsafe repeats |
| `committing` | No for same structural source | No | No | Cancel older generation | Guard unsafe repeats |
| `urgent-painting` | Text input to the new active island may be accepted after session exists; repeated structural keys stay guarded | No | No | Cancel older generation | Guard unsafe repeats |
| `urgent-painted` | Yes for active draft text | Yes, schedule only | No | Cancel older generation | Guard until active node/session confirms |
| `panel-release-pending` | Yes | Yes, latest generation only and after input quiet | No | Yes | Normal if active node is valid |
| `settling` | Yes | Yes | Yes, latest doc/generation only | Yes | Normal if active node is valid |
| `complete` | Yes | Yes | Yes | No active release | Normal handling |
| `aborted` | Restore/cleanup first, then yes | Release only after cleanup | No stale application | Yes | Drop stale structural repeats |

Required transaction behavior:

- The transaction id/generation must be shared with panel deferral and preview
  settle so an older release or settle cannot apply after a newer transaction.
- `urgent-painted` is the earliest phase where panel release may be scheduled,
  but release still waits for the panel lane's input quiet window.
- Full settle can apply only in `settling` when document, generation, active
  node, and draft version are still current.
- Abort must cancel pending panel releases, pending draft pagination for stale
  nodes, and stale preview settle.
- Repeated structural keys must be prevented while the active node is missing,
  being replaced, or expected to be removed.

## Invariants

### Structural Invariants

- Active island node must exist in the current document.
- Split order must be source paragraph -> new paragraph -> next sibling.
- Merge must remove the merged node from both the nodes map and the parent
  children list.
- No ghost fragment may remain for a removed node.
- No duplicate stale text may remain visible after split/merge.
- Backspace immediately after a committed split must be accepted.
- Repeated unsafe structural keys must be guarded.
- Reducer prevalidated fast paths must keep equivalent validation guarantees:
  split checks immediate sibling order; merge checks the removed node is absent.
  Evidence: `editorReducer.ts:688-808`.

### Preview Invariants

- The affected page may rerender.
- Unaffected pages should not rerender during structural island transitions.
- Stale pagination settle must not overwrite newer doc state.
- Boundary-safe page-break suppression must be visual-only.
- Boundary-safe suppression must clear after the settled fragment is available.
- Partial preview state remains editor-only and must not become export-ready
  truth.

### Panel Invariants

- Panels may show a snapshot while structural edit is active.
- Stale panels must be non-interactive or otherwise safe.
- An old release cannot apply after a newer structural generation.
- Panels must eventually restore the latest live document.
- Panel freeze duration must be measured.
- Panel freeze should not be tied to full pagination settle unless a later
  design explicitly requires that.
- Panel release must not run inside urgent structural `flushSync`.

### Performance Invariants

- The urgent lane should not include panel render work.
- Full settle must not block first island paint.
- Instrumentation must be quiet by default.
- Unit tests must not hard-fail on timing milliseconds.
- Probe metrics are diagnostic evidence, not product acceptance by themselves.

## Migration Plan

### Task 15 - Extract StructuralEditRuntime Skeleton

Files likely touched:

- `src/app/editor/_components/EditorShell.tsx`
- new `src/app/editor/_components/runtime/StructuralEditRuntime.ts`
- focused tests if helper functions are pure enough to test
- `docs/WORK_LOG_RECENT.md`

Allowed behavior changes:

- None.

Forbidden behavior changes:

- No document operation movement.
- No `flushSync` removal.
- No panel scheduling changes.
- No preview settle changes.

Acceptance criteria:

- A transaction lifecycle object/API exists.
- Shell still calls the existing split/merge implementation.
- Phase, generation, abort, and pending transaction bookkeeping are centralized.
- Existing Task 13 correctness flags remain unchanged.

Tests/probes to run:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerRichText.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- long-mock `enter-mid-split`
- long-mock `enter-backspace-immediate`
- immediate `enter -> type`
- immediate `enter -> backspace -> type`

### Task 16 - Move Structural Guard And Split/Merge Transaction Ownership

Files likely touched:

- `EditorShell.tsx`
- `FlowdocDraftEditorIslandRoot.tsx`
- `ParagraphTextSurface.tsx`
- `runtime/StructuralEditRuntime.ts`
- `editorReducer.ts` tests only if contract typing changes

Allowed behavior changes:

- None, except clearer diagnostics for transaction phases.

Forbidden behavior changes:

- No document schema changes.
- No core pagination changes.
- No table/Flow Stack/row-stack expansion.

Acceptance criteria:

- Begin/commit/abort/complete lifecycle lives in StructuralEditRuntime.
- Island guard and surface handlers call the runtime through a narrow API.
- Existing split/merge document operations may remain where they are if needed.
- Immediate Backspace after Enter still uses the optimistic split document when
  required.

Tests/probes to run:

- Task 15 tests/probes
- `enter-rapid`
- `backspace-rapid`

### Task 17 - Extract PanelDeferralRuntime

Files likely touched:

- `EditorShell.tsx`
- `shell/EditorLeftRail.tsx` only if explicit stale/non-interactive status is
  added
- new `runtime/PanelDeferralRuntime.ts`
- `wysiwygPerformance.ts` only if event helpers move

Allowed behavior changes:

- Diagnostic naming may improve if report fields stay compatible.

Forbidden behavior changes:

- No permanent stale panels.
- No input-blocking panel release.
- No release before urgent paint.

Acceptance criteria:

- Snapshot/live/release/generation/input quiet logic is owned by the runtime.
- Failure cleanup path cancels scheduled release.
- Freeze duration cap or metric is explicit.
- Left/top/right panel stale status is explicit.

Tests/probes to run:

- Task 15 tests/probes
- Check `deferredLeftRailReleaseRanInsideUrgentStructuralFlush = false`
- Check live doc restore observed in immediate and split-only probes

### Task 18 - Extract PreviewSettleRuntime

Files likely touched:

- `EditorShell.tsx`
- `browserPaginationWorker.ts` only if worker request typing moves
- new `runtime/PreviewSettleRuntime.ts`
- `editorPreviewLayoutState` helpers if a public status contract is needed

Allowed behavior changes:

- None.

Forbidden behavior changes:

- No server/export semantic changes.
- No partial preview promotion into history/export.
- No core pagination changes.

Acceptance criteria:

- Preview settle generation checks, request identity, stale ignore/supersede,
  worker fallback/response guards, and latest-only commit decisions are
  runtime-owned.
- Structural settle and browser preview settle use the same runtime stale guard
  language.
- `SET_PAGINATED` remains latest-only and still happens in Shell.
- Timers, worker calls, pagination calls, partial preview state, and React state
  application remain in Shell.

Tests/probes to run:

- Task 15 tests/probes
- `enter -> type immediate`
- `enter -> backspace -> type immediate`
- Verify stale settle superseded safely when Backspace immediately follows
  Enter.

### Task 19 - CanvasViewportRuntime Boundary

Status: implemented as a behavior-preserving decision extraction.

Files touched:

- `EditorCanvas.tsx`
- `runtime/canvasViewportTypes.ts`
- `runtime/canvasViewportRuntime.ts`
- `runtime/__tests__/canvasViewportRuntime.test.ts`
- `wysiwygPerformance.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`
- `EditorCanvas.test.ts` coverage remained passing without behavior changes.

Allowed behavior changes:

- None.

Forbidden behavior changes:

- No page memo weakening.
- No page-break semantic change.
- No layout/pagination movement.

Acceptance criteria:

- Page-scoped props and affected-page rerender contract are named and tested.
- Boundary-safe visual ownership is isolated from Shell transaction state.
- Existing page isolation metrics remain stable.
- CanvasViewport metric aliases are emitted for probe/report continuity.

Tests/probes run:

- `node --check scripts/wysiwyg-smoothness-probe.mjs`
- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/runtime/__tests__/structuralEditRuntime.test.ts src/app/editor/_components/runtime/__tests__/panelDeferralRuntime.test.ts src/app/editor/_components/runtime/__tests__/previewSettleRuntime.test.ts src/app/editor/_components/runtime/__tests__/canvasViewportRuntime.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorReducerRichText.test.ts`
- Long mock smoke modes: `enter-mid-split` with extended frame sample,
  `enter-backspace-immediate`, `enter-type-before-settle`,
  `enter-backspace-type-before-settle`, `enter-rapid`, and `backspace-rapid`.

Completed next task:

- Task 20 implemented `EditorPerformanceRuntime`, limited to performance
  attribution/report helper extraction and probe schema ownership, without
  changing editor behavior or page memo decisions.

### Task 20 - EditorPerformanceRuntime Boundary

Status: implemented as a behavior-preserving schema/report extraction.

Files touched:

- `runtime/editorPerformanceTypes.ts`
- `runtime/editorPerformanceRuntime.ts`
- `runtime/__tests__/editorPerformanceRuntime.test.ts`
- `wysiwygPerformance.ts`
- `scripts/wysiwyg-smoothness-probe.mjs`
- `docs/WORK_LOG_RECENT.md`
- `docs/FRONTEND_RUNTIME_ARCHITECTURE.md`

Allowed behavior changes:

- None.

Forbidden behavior changes:

- No editor rendering changes.
- No pagination or preview scheduling changes.
- No panel deferral timing changes.
- No canvas viewport/page memo decision changes.

Acceptance status:

- Existing probe fields remain available through legacy aliases.
- Reports include `editor-performance-report-v1`.
- Boundary-safe suppression semantics distinguish `suppressed`,
  `not-observed`, `not-applicable`, `not-required`, and `unknown`.
- Frame-window metadata records default vs extended probe windows.
- Timing anchor fields are normalized with
  `editor-performance-timing-anchors-v1`.
- Unit tests cover counter aggregation, aliases, sample reset, timing anchors,
  suppression classification, frame metadata, runtime metrics merging, and
  schema version.

Task 21 implementation:

- `WysiwygDraftRuntime` now owns active draft/session lifecycle metadata:
  session id, generation, node id, draft mode, phase, caret/selection
  metadata, composition metadata, structural transaction metadata,
  stale-session ignored counts, abort/cancel/commit bookkeeping, and draft
  runtime metrics.
- `EditorShell` still owns the commit adapter, reducer dispatches, validation,
  pagination scheduling, and plain/rich draft implementation. Runtime calls are
  metadata-only.
- `FlowdocDraftEditorIslandRoot` still owns DOM input handling and now reports
  composition start/end as plain metadata to Shell.
- `ParagraphTextSurface` fallback was audited and remains legacy/in-canvas
  fallback. It is not active for the current out-of-canvas V2 native island
  flow, but should be guard-routed through `StructuralEditRuntime` before that
  fallback is expanded.

Recommended next task:

- `EditorShell` slimming pass around the Shell-facing draft lifecycle adapter,
  without changing IME, rich text style, structural edit, pagination, panel,
  canvas viewport, render/export, persistence, or document model behavior.

### Task 21 - WysiwygDraftRuntime Boundary

Implementation status:

- Implemented as a skeleton/boundary extraction in Task 21.
- Added `runtime/wysiwygDraftTypes.ts`,
  `runtime/wysiwygDraftRuntime.ts`, and
  `runtime/__tests__/wysiwygDraftRuntime.test.ts`.
- Wired Shell/island metadata only; text editing implementation remains in the
  existing hooks and surfaces.

Files touched:

- `EditorShell.tsx`
- `FlowdocDraftEditorIslandRoot.tsx`
- performance facade/runtime/probe files for draft runtime metrics
- focused WYSIWYG tests

Allowed behavior changes:

- None.

Forbidden behavior changes:

- No IME/composition behavior changes.
- No active typing visual model changes.
- No rich text style semantics changes.

Acceptance criteria:

- Active draft/session/caret/composition ownership is explicit.
- Shell records active draft/session/caret/composition lifecycle through the
  runtime, while plain/rich draft implementation remains in existing hooks.
- Commit/cancel/start session behavior remains unchanged.

Tests/probes to run:

- `runtime/__tests__/wysiwygDraftRuntime.test.ts`
- `ParagraphTextSurface.test.ts`
- structural runtime/probe acceptance suite
- Real IME manual matrix remains recommended before changing composition
  behavior; Task 21 only added metadata callbacks.

### Task 22 - EditorShell Slimming Pass (completed 2026-06-05)

Files touched:

- `EditorShell.tsx`
- docs/work log

Outcome:

- Removed the proven-dead deferred optimistic dispatch branch from
  `EditorShell`: split/merge pending dispatch interfaces, refs, cancel/flush/
  rollback helpers, cleanup effects, and their no-op undo/merge call sites.
- Kept active split/merge refocus bridge state in Shell because it still owns
  synchronous `flushSync` reducer dispatch, island override setup, panel
  deferral handoff, draft session handoff, and optimistic layout refs.
- Extracted no new runtime and no bridge helper in this pass.

Allowed behavior changes:

- None intended.

Forbidden behavior changes:

- No new runtime semantics.
- No unrelated cleanup.
- No reducer, pagination, render/export, persistence, FlowTable, validation,
  panel timing, preview settle, canvas memo, typing, IME, Enter, or Backspace
  behavior changes.

Acceptance criteria:

- `EditorShell.tsx` line count decreased from 7373 to 7231.
- Required runtime/editor tests and long-mock structural smokes passed.
- Unused refs/helpers were removed only after audit showed no assignment
  producer in the current tree.

### Task 23 - Legacy Optimistic Dispatch / Rollback Cleanup (completed 2026-06-05)

Outcome:

- Confirmed the known delayed optimistic split/merge dispatch and rollback
  symbols are absent from current source after Task 22.
- No additional source cleanup was needed; remaining matches are historical
  work-log text or Task 22 cleanup notes.
- Current optimistic split/merge dispatch remains atomic in the Shell
  `flushSync` bridge and runtime transaction lifecycle remains owned by
  `StructuralEditRuntime`.

### Task 24 - Structural Bridge Adapter Follow-up (completed 2026-06-05)

Outcome:

- Added a small editor bridge/controller boundary under
  `src/app/editor/_components/structuralEdit/`.
- Moved structural split/merge transaction plan creation, transaction identity
  creation, panel deferral plan creation, draft-session metadata creation, and
  split/merge runtime commit marking behind the bridge/controller.
- Kept reducer dispatch, `flushSync`, DOM event handling, panel timing,
  preview settle, document model, pagination, render/export, persistence,
  validation, FlowTable behavior, active optimistic refs, and React state
  setters in `EditorShell`.
- Keep `pendingOptimisticSplitRefocusRef`,
  `pendingOptimisticMergeRefocusRef`, optimistic layout refs, and legacy
  post-reducer refocus paths in Shell until tests prove a smaller adapter can
  own the plain data safely.
- Legacy optimistic dispatch naming has already been cleaned from current
  source; do not reintroduce delayed split/merge dispatch wrappers.
- `EditorShell.tsx` line count decreased from 7231 to 7201.

### Task 25 - Structural Preparation Planner Follow-up (completed 2026-06-05)

Outcome:

- Added a narrow structural preparation planner under
  `src/app/editor/_components/structuralEdit/`.
- Moved source/draft text resolution, DOM-free paragraph eligibility,
  operation-result paragraph metadata resolution, and null-safe structural
  optimistic summary input helpers out of `EditorShell`.
- Wired the optimistic split/merge prep paths through the helper while keeping
  `flushSync`, reducer dispatch, React state setters, DOM/session start
  functions, preview settle scheduling, panel timing, structural runtime
  begin/mark calls, document model semantics, renderer/export, persistence,
  validation, and FlowTable behavior in their previous owners.
- `EditorShell.tsx` line count decreased from 7201 to 7173.

### Task 26A - PanelDeferralBridge Follow-up (completed 2026-06-05)

Outcome:

- Added a narrow PanelDeferralBridge under
  `src/app/editor/_components/structuralEdit/`.
- Moved panel release operation mapping, panel deferral runtime payload wiring,
  local release object construction, and release/transaction matching helpers
  out of `EditorShell`.
- Kept scheduling timers, React state setters, refs, event emission, preview
  settle cancellation, structural transaction marking, `flushSync`, reducer
  dispatch, pagination, document model semantics, renderer/export,
  persistence, validation, FlowTable behavior, and DOM/session starts in their
  previous owners.
- `EditorShell.tsx` line count decreased from 7173 to 7080.

### Task 26B - PreviewSettleBridge Follow-up (completed 2026-06-05)

Outcome:

- Added a narrow PreviewSettleBridge under
  `src/app/editor/_components/structuralEdit/`.
- Moved preview settle schedule payload wiring, apply-decision payload wiring,
  lifecycle mark helpers, current request/generation helpers, and structural
  transaction matching helpers out of `EditorShell`.
- Kept runtime construction, runtime event emission, debounce/timers, browser
  pagination worker callbacks, main-thread pagination fallback, paginated
  commit, React state setters, reducer dispatch, optimistic structural settle
  ref clearing, panel deferral, canvas viewport behavior, `flushSync`,
  pagination, document model semantics, renderer/export, persistence,
  validation, FlowTable behavior, and DOM/session starts in their previous
  owners.
- `EditorShell.tsx` line count decreased from 7080 to 7071.

### Task 26C - CanvasViewportBridge Follow-up (completed 2026-06-05)

Outcome:

- Added a narrow CanvasViewportBridge under
  `src/app/editor/_components/`.
- Moved CanvasViewportRuntime input adaptation out of `EditorCanvas` for active
  out-of-canvas structural island payloads, stale page-break suppression,
  page fragment checks, page-scoped edit affect checks, structural transition
  affect checks, lazy page-frame decisions, structural render-scope creation,
  and structural render-scope perf fields.
- Kept existing `EditorCanvas` exported helper names for compatibility with
  existing tests and call sites.
- Kept React state, refs, DOM refs, IntersectionObserver/lazy visibility sets,
  pointer/session handling, render event emission, preview settle, panel
  deferral, reducer dispatch, `flushSync`, pagination, document model
  semantics, renderer/export, persistence, validation, FlowTable behavior,
  typing, and IME/composition behavior in their previous owners.

Verified:

- Focused CanvasViewportBridge suite passed.
- `npm.cmd run type-check` passed.
- Focused runtime/editor matrix passed: 14 files, 306 tests.
- Long-mock structural Enter/Backspace smoke matrix passed across six modes.
- `git diff --check` had no whitespace errors; only existing Windows LF/CRLF
  warnings were printed.

### Task 27 - ParagraphTextSurface Fallback Decision (completed 2026-06-05)

Outcome:

- Chose guard-routing for the legacy/in-canvas ParagraphTextSurface structural
  fallback rather than removal or docs-only test-locking.
- Added a narrow ParagraphTextSurface fallback bridge under
  `src/app/editor/_components/structuralEdit/`.
- Routed legacy/in-canvas ParagraphTextSurface structural Enter/Backspace
  decisions through `StructuralEditRuntime.canStartStructuralEdit` before
  invoking Shell split/merge/list-backspace callbacks.
- The bridge marks guarded repeated structural keys as dropped through
  `StructuralEditRuntime.markKeyRepeatDropped`.
- Kept DOM event handling local to `ParagraphTextSurface`.
- Kept the out-of-canvas WYSIWYG V2 island flow on its existing
  `FlowdocDraftEditorIslandRoot` guard path.
- Kept pagination, document model, reducer semantics, renderer/export,
  persistence, validation, FlowTable behavior, panel deferral, preview settle,
  canvas viewport, `flushSync`, typing, and IME/composition behavior in their
  previous owners.

Verified:

- Focused ParagraphTextSurface fallback bridge suite passed.
- `npm.cmd run type-check` passed.
- Focused runtime/editor matrix passed: 15 files, 310 tests.
- Long-mock structural Enter/Backspace smoke matrix passed across six modes.
- `git diff --check` had no whitespace errors; only existing Windows LF/CRLF
  warnings were printed.

### Task 28 - WysiwygDraftRuntime Shell Adapter Slimming (completed 2026-06-05)

Outcome:

- Added a narrow `wysiwygDraftRuntimeBridge.ts` under
  `src/app/editor/_components/`.
- Moved Shell-facing `WysiwygDraftRuntime` session metadata adaptation into the
  bridge for tracked begin/active sessions, current-session lookup, cancel,
  structural-transaction abort, committing and committed markers, caret/text
  metadata updates, and composition start/end markers.
- Kept `EditorShell` as the owner of the runtime instance, runtime-to-perf
  event mapping, reducer dispatch, rich/plain draft state, document commits,
  history, draft pagination scheduling, DOM/session callbacks, and `flushSync`
  boundaries.
- Verified that `EditorShell` no longer calls `wysiwygDraftRuntime.*` methods
  directly. Its remaining runtime contact is construction plus metrics snapshot
  reads for perf event attribution.
- Kept `WysiwygDraftRuntime` metadata-only. No draft text ownership, DOM event
  handling, pagination, document model, reducer semantics, renderer/export,
  persistence, validation, FlowTable behavior, typing, or IME/composition
  behavior was moved into the runtime.

Verified:

- Focused WysiwygDraftRuntime bridge suite passed: 1 file, 5 tests.
- `npm.cmd run type-check` passed.
- Focused runtime/editor matrix passed: 16 files, 315 tests.
- Long-mock structural Enter/Backspace smoke matrix passed across six modes.

### Task 29 - IME And Adapter Follow-Up (completed with blocker 2026-06-05)

Outcome:

- Rechecked the post-Task-28 composition metadata path:
  `FlowdocDraftEditorIslandRoot` -> `EditorShell.handleWysiwygDraftCompositionChange`
  -> `markCurrentTrackedWysiwygDraftRuntimeCompositionBridge`.
- Added a focused bridge regression test for stale/mismatched composition
  metadata changes.
- Restored out-of-canvas WYSIWYG V2 island double-click word selection through
  the existing word-boundary helper and existing island pointer-selection path.
- Updated the Stage 4C smoke selectors to match the current out-of-canvas island
  DOM: hidden input bridges can be textarea elements, and active hit areas/
  selection overlays live on `data-wysiwyg-text-engine-layer` island surfaces.
- Kept pagination, document model, reducer semantics, renderer/export,
  persistence, validation, FlowTable behavior, `flushSync`, typing, and
  composition semantics in their previous owners.

Verified:

- Type-check passed.
- Focused bridge/runtime/IME guard suites passed.
- Focused Stage 3/editor regression suites passed.
- Bundled Chromium Stage 4C smoke was attempted with a smoke-owned flagged
  server on port 4016.

Blocker:

- Stage 4C bundled Chromium smoke failed in the clipboard page-boundary flow
  because `stage3-boundary-target` overlapped `stage3-downstream-p1` by about
  6 px on page 1.
- Chrome/Edge Stage 4C automation and real Windows Thai IME manual rows remain
  unverified after this blocker.

### Task 30 - Stage 4C Page-Boundary Closure (completed 2026-06-05)

Outcome:

- Isolated the Stage 4C page-boundary overlap between
  `stage3-boundary-target` and `stage3-downstream-p1`.
- Classified the original 6 px failure as a smoke measurement over suppressed
  `EditorCanvas` paragraph chrome, then kept the overlap gate focused on
  visible WYSIWYG island cover/outline and downstream visible text.
- Added a 2 pt continuation-surface cover/outline clearance in
  `FlowdocDraftEditorIslandRoot` without changing core pagination or document
  model semantics.
- Preserved full-height pointer hit areas and fixed cross-page pointer drag
  selection by resolving the island surface under the current pointer
  coordinates.
- Fixed hidden input bridge duplicate echo handling for Playwright insertions
  and synthetic composition, and kept composing `insertCompositionText` from
  committing partial text.
- Excluded row-stack paragraphs from active plain-native paragraph suppression
  so the Stage 4C row-stack path keeps its visible canvas text.

Verified:

- `npm.cmd run type-check` passed.
- Focused app suite passed: 8 files, 250 tests.
- `node -c scripts/wysiwyg-stage4c-smoke.mjs` passed.
- Stage 4C smoke passed on bundled Chromium, installed Chrome, and installed
  Edge using smoke-owned port 4016.

Still out of scope:

- Core pagination rewrites, document model changes, reducer semantics,
  renderer/export, persistence, validation, FlowTable behavior, `flushSync`,
  ParagraphTextSurface DOM handling, and WYSIWYG runtime ownership moves.
- Real Windows Thai IME manual validation remains a separate matrix item.

### Task 31 - PreviewSettleRuntime Schedule Context Bridge (completed 2026-06-05)

Outcome:

- Added DOM-free PreviewSettle bridge helpers for active structural transaction
  filtering, structural preview grace remaining time, browser preview debounce
  selection, and structural cleanup supersede eligibility.
- Updated the browser preview settle effect in `EditorShell` to ask the bridge
  for those schedule-context decisions.
- Kept browser pagination, worker callbacks, main-thread pagination,
  partial/full preview React state, `optimisticLayoutRef`, `SET_PAGINATED`,
  document model semantics, reducer/history behavior, renderer/export,
  persistence, validation, FlowTable behavior, `flushSync`, and WYSIWYG
  DOM/input ownership unchanged.

Verified:

- Focused PreviewSettle bridge/runtime suite passed: 2 files, 15 tests.
- `npm.cmd run type-check` passed.
- Focused runtime/editor suite passed: 7 files, 235 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with
  structural refocus safety `ok=true`.

Still out of scope:

- Moving actual debounce timers, worker request mechanics, pagination output
  application, or reducer dispatch into `PreviewSettleRuntime`.
- Moving draft pagination lifecycle out of `EditorShell`.

### Task 32 - Draft Pagination PreviewSettle Bridge (completed 2026-06-05)

Outcome:

- Added DOM-free PreviewSettle bridge helpers for WYSIWYG draft-pagination
  generation clearing, delay resolution, responsive node eligibility, schedule
  plan creation, run gating, and latest-snapshot revision rescheduling.
- Updated `EditorShell` draft-pagination scheduling to ask the bridge for
  lifecycle/scheduler metadata while Shell still owns timers, RAF, preview
  document building, `paginatePreviewDoc`, `assertDocument`, paginated refs,
  `optimisticLayoutRef`, inline page follow, and `SET_PAGINATED`.
- Kept document model semantics, reducer/history behavior, renderer/export,
  persistence, validation, FlowTable behavior, `flushSync`, DOM event handling,
  normal typing, and IME/composition behavior unchanged.

Verified:

- Focused PreviewSettle bridge/runtime suite passed: 2 files, 19 tests.
- `npm.cmd run type-check` passed.
- Focused runtime/editor suite passed: 8 files, 287 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with
  `ok=true` and structural refocus safety `ok=true`.

Still out of scope:

- Moving actual preview document construction, pagination output application,
  validation, reducer dispatch, optimistic layout writes, inline page
  relocation, or DOM/session ownership into `PreviewSettleRuntime`.

### Task 33 - Draft Pagination Apply Guard Plan (completed 2026-06-05)

Outcome:

- Added a DOM-free `DraftPreviewPaginationApplyPlan` behind the PreviewSettle
  bridge for the draft-pagination output lane.
- The plan explicitly maps post-pagination output state to `ignore`,
  `reschedule`, or `apply` based on generation freshness, current source
  availability, and draft revision freshness.
- Updated `EditorShell` to consume that plan before mutating paginated refs,
  `optimisticLayoutRef`, inline edit page state, draft pagination node state,
  or dispatching `SET_PAGINATED`.
- Kept preview document construction, `paginatePreviewDoc`, `assertDocument`,
  output mutation, reducer dispatch, document model semantics,
  renderer/export, persistence, validation, FlowTable behavior, `flushSync`,
  DOM event handling, normal typing, and IME/composition behavior unchanged.

Verified:

- Focused PreviewSettle bridge/runtime suite passed: 2 files, 20 tests.
- `npm.cmd run type-check` passed.
- Focused runtime/editor suite passed: 8 files, 288 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with
  `ok=true` and structural refocus safety `ok=true`.

Still out of scope:

- Runtime-owned pagination output commits.
- Moving preview document construction, validation, paginated refs,
  optimistic layout writes, inline page relocation, or reducer dispatch out of
  `EditorShell`.

### Task 34 - Browser Preview Apply Plan Discipline (completed 2026-06-05)

Outcome:

- Added a DOM-free `BrowserPreviewSettleApplyPlan` behind the PreviewSettle
  bridge for the browser-preview settle output lane.
- The plan wraps the existing `PreviewSettleRuntime` apply decision without
  adding new semantics: runtime `apply` maps to plan `apply`; runtime
  `ignore-stale`, `supersede`, and `cancel` map to plan `ignore`.
- Updated `EditorShell` so precomputed browser pagination, visual-only fast
  lane, debounce start, worker fallback, worker response, and final
  `commitPagination` consume the browser apply plan before mutating preview
  output.
- Kept preview document construction, browser/main-thread pagination, worker
  requests, validation, paginated refs, `optimisticLayoutRef`, inline page
  follow, browser preview layout state, reducer dispatch, document model
  semantics, renderer/export, persistence, validation, FlowTable behavior,
  `flushSync`, DOM event handling, normal typing, and IME/composition behavior
  unchanged.

Verified:

- Focused PreviewSettle bridge/runtime suite passed: 2 files, 21 tests.
- `npm.cmd run type-check` passed.
- Focused runtime/editor suite passed: 8 files, 289 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with
  `ok=true` and structural refocus safety `ok=true`.

Still out of scope:

- Runtime-owned pagination output commits.
- Moving preview document construction, validation, paginated refs,
  optimistic layout writes, inline page relocation, browser preview layout
  state, or reducer dispatch out of `EditorShell`.

### Task 35 - PreviewSettle Shell Mutation Adapter (completed 2026-06-05)

Outcome:

- Added `previewSettleShellAdapter.ts` as a pure Shell adapter layer over the
  draft/browser apply plans.
- The adapter centralizes Shell-owned mutation metadata for draft ignore,
  reschedule, and apply flows, including inline page relocation/follow,
  draft-pagination node id, visual-fresh version, and ordered Shell mutation
  steps.
- The adapter centralizes browser-preview mutation metadata for precomputed,
  visual-only, partial-worker, and final paginated-output flows, including
  optimistic layout writes, paginated ref writes, partial preview set/clear,
  browser preview layout mode, dispatch, preview-settle lifecycle marking,
  inline visual freshness, and structural settle completion flags.
- Updated `EditorShell` to consume the adapter plans before executing the same
  Shell-owned refs, setters, dispatches, and runtime lifecycle markers.
- Kept preview document construction, browser/main-thread pagination, worker
  requests, validation, paginated refs, `optimisticLayoutRef`, inline page
  relocation, browser preview layout state, reducer dispatch, document model
  semantics, renderer/export, persistence, validation, FlowTable behavior,
  `flushSync`, DOM event handling, normal typing, and IME/composition behavior
  in `EditorShell`.

Verified:

- Focused adapter/PreviewSettle runtime suite passed: 3 files, 28 tests.
- `npm.cmd run type-check` passed.
- Focused runtime/editor suite passed: 9 files, 296 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with
  `ok=true` and structural refocus safety `ok=true` after increasing readiness
  timeout to 30000ms. The first 15000ms readiness attempt timed out before
  behavior assertions ran.

Still out of scope:

- Runtime-owned pagination output commits.
- Moving preview document construction, validation, paginated refs,
  optimistic layout writes, inline page relocation, browser preview layout
  state, or reducer dispatch out of `EditorShell`.

### Task 36 - PreviewSettle Shell Adapter Contract Stabilization (completed 2026-06-05)

Outcome:

- Added `PREVIEW_SETTLE_SHELL_ADAPTER_CONTRACT_VERSION` and a serializable
  `summarizePreviewSettleShellMutationPlan` diagnostic contract.
- The summary records stable lane/action/step/source/mode/reason/generation/
  layout and mutation-flag metadata for draft/browser Shell mutation plans.
- Updated `EditorShell` to emit trace-gated
  `preview-settle:shell-mutation-plan` diagnostics after draft and browser
  Shell mutation plans are created.
- Added focused coverage for the summary contract and step ordering without
  moving document or paginated mutation into the runtime/bridge/adapter.
- Kept preview document construction, browser/main-thread pagination, worker
  requests, validation, paginated refs, `optimisticLayoutRef`, inline page
  relocation, browser preview layout state, reducer dispatch, document model
  semantics, renderer/export, persistence, validation, FlowTable behavior,
  `flushSync`, DOM event handling, normal typing, and IME/composition behavior
  in `EditorShell`.

Verified:

- Focused adapter/PreviewSettle runtime suite passed: 3 files, 29 tests.
- `npm.cmd run type-check` passed.
- Focused runtime/editor suite passed: 9 files, 297 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with
  `ok=true` and structural refocus safety `ok=true` using
  `PROBE_READY_TIMEOUT_MS=30000`.

Still out of scope:

- Runtime-owned pagination output commits.
- Moving preview document construction, validation, paginated refs,
  optimistic layout writes, inline page relocation, browser preview layout
  state, or reducer dispatch out of `EditorShell`.

### Task 37 - PreviewSettle First Movement Design Gate (completed 2026-06-06)

Outcome:

- Selected precomputed browser preview as the first safe output lane to move
  behind a Shell executor.
- Kept the first movement intentionally smaller than visual-only and final
  paginated-output commits because precomputed browser preview:
  - already has a `BrowserPreviewSettleApplyPlan`.
  - already has a `BrowserPreviewShellMutationPlan`.
  - does not write `paginatedRef`.
  - does not dispatch `SET_PAGINATED`.
  - does not run pagination.
  - does not build or validate preview documents.
  - does not touch reducer/history, renderer/export, persistence, FlowTable, or
    document model semantics.
- Confirmed the current guard chain remains:
  `PreviewSettleRuntime.getApplyDecision` -> `createBrowserPreviewSettleApplyPlan`
  -> `createBrowserPreviewShellMutationPlan` -> Shell-owned mutation execution.
- Decided the first executor should consume an already-created `apply`
  `BrowserPreviewShellMutationPlan`; it must not create guard decisions, call
  runtime lifecycle APIs by itself, or hide ignore handling.

Lane movement order:

| Task | Lane | Why this order |
|---|---|---|
| 38 | Precomputed browser preview Shell executor | Smallest browser lane; no `paginatedRef` write and no reducer dispatch. |
| 39 | Partial worker preview Shell executor | Still partial/temporary output only; no final document output commit. |
| 40 | Visual-only browser preview Shell executor | Writes paginated refs and dispatches, but avoids full pagination work. |
| 41 | Final paginated output Shell executor | Owns the largest browser output block, including visual freshness and structural settle completion. |
| 42 | Draft pagination Shell executor | Touches Enter/Backspace-sensitive inline page relocation and draft visual freshness. |
| 43+ | Larger coordinator design | Only after executor lanes are stable and smoke-verified. |

Task 38 approved scope:

- Add a small precomputed browser preview executor in the Shell adapter layer or
  an adjacent Shell-side helper.
- The executor may receive:
  - an `apply` `BrowserPreviewShellMutationPlan`.
  - the precomputed optimistic layout object.
  - the generation.
  - callbacks for `optimisticLayoutRef`, `setPartialPreviewPaginated`,
    `setBrowserPreviewLayout`, and preview-settle lifecycle marking.
- The executor may perform only the mutations represented by the existing plan
  flags:
  - `shouldWriteOptimisticLayout`.
  - `shouldClearPartialPreview`.
  - `browserPreviewLayout === "full"`.
  - `shouldMarkPreviewSettleLifecycle`.

Task 38 out of scope:

- Do not move ignore handling out of `EditorShell`.
- Do not move apply-plan creation out of `EditorShell`.
- Do not move runtime guard decisions out of `EditorShell`/bridge calls.
- Do not move `markPreviewSettleIgnoredBridge`.
- Do not move preview document construction, validation, pagination,
  browser worker request/response handling, `paginatedRef`, reducer dispatch,
  inline edit page relocation, renderer/export, persistence, FlowTable,
  document model semantics, `flushSync`, typing, or IME/composition behavior.
- Do not change `PreviewSettleRuntime` semantics.
- Do not weaken validation.

Task 38 acceptance:

- Precomputed browser preview still asks the runtime/bridge for an apply plan
  before any Shell mutation happens.
- An ignored precomputed settle still follows the same ignore path and emits the
  same stale-settle diagnostics.
- An applied precomputed settle mutates only:
  `optimisticLayoutRef`, partial preview clearing, browser preview layout state,
  and preview-settle lifecycle marks.
- The executor is covered with focused unit tests for:
  - optimistic layout write.
  - partial preview clear.
  - full-layout update.
  - lifecycle marking.
  - disabled flags not calling callbacks.
- No production behavior changes beyond moving the execution boundary.

Task 38 verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/structuralEdit/__tests__/previewSettleShellAdapter.test.ts src/app/editor/_components/structuralEdit/__tests__/previewSettleBridge.test.ts src/app/editor/_components/runtime/__tests__/previewSettleRuntime.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/runtime/__tests__/structuralEditRuntime.test.ts src/app/editor/_components/runtime/__tests__/panelDeferralRuntime.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- Long mock `enter-backspace-immediate` smoothness smoke after the code move.

### Task 38 - Precomputed Browser Preview Shell Executor (completed 2026-06-06)

Outcome:

- Added `applyPrecomputedBrowserPreviewShellMutation` as a callback-only Shell
  executor for the precomputed browser preview apply lane.
- The executor consumes an already-created `apply`
  `BrowserPreviewShellMutationPlan`; it does not create guard decisions, ask
  the runtime for apply decisions, handle ignored plans, or call bridge
  lifecycle APIs directly.
- `EditorShell` still owns:
  - runtime apply decision and apply-plan creation.
  - ignore handling and stale-settle diagnostics.
  - runtime lifecycle bridge calls, passed to the executor as a Shell callback.
  - preview document construction, browser/main-thread pagination, worker
    request/response mechanics, validation, `paginatedRef`, reducer dispatch,
    inline page relocation, renderer/export, persistence, FlowTable, document
    model semantics, `flushSync`, typing, and IME/composition behavior.
- Added focused coverage for:
  - optimistic layout write.
  - partial preview clear.
  - full-layout update.
  - lifecycle marking.
  - disabled flags.
  - non-precomputed plan rejection.

Verified:

- Focused adapter suite passed: 1 file, 12 tests.
- `npm.cmd run type-check` passed.
- PreviewSettle adapter/bridge/runtime suite passed: 3 files, 33 tests.
- Runtime/editor regression suite passed: 5 files, 220 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with `ok=true`
  and structural refocus safety `ok=true` using `PROBE_READY_TIMEOUT_MS=30000`.

Still out of scope:

- Runtime-owned pagination output commits.
- Moving ignore handling, apply-plan creation, runtime guard decisions,
  preview document construction, validation, pagination, browser worker
  request/response handling, `paginatedRef`, reducer dispatch, inline edit page
  relocation, renderer/export, persistence, FlowTable, document model
  semantics, `flushSync`, typing, or IME/composition behavior.

### Task 39 - Partial Worker Preview Shell Executor (completed 2026-06-06)

Outcome:

- Added `applyPartialWorkerBrowserPreviewShellMutation` as a callback-only Shell
  executor for the partial worker preview apply lane.
- The executor consumes an already-created `apply`
  `BrowserPreviewShellMutationPlan` with `mode === "partial-worker"`.
- The executor may call only Shell callbacks for:
  - `setPartialPreviewPaginated`.
  - `setBrowserPreviewLayout(markEditorPreviewLayoutPartial(generation))`.
- `EditorShell` still owns:
  - worker request/response mechanics.
  - response id matching and stale response ignores.
  - fallback to main-thread pagination.
  - runtime apply decisions and ignored plan handling.
  - final paginated output commits.
  - `paginatedRef`, reducer dispatch, validation, renderer/export,
    persistence, FlowTable, document model semantics, `flushSync`, typing, and
    IME/composition behavior.
- Added focused coverage for partial preview set, partial layout update,
  disabled flags, and non-partial plan rejection.

Verified:

- Focused adapter suite passed: 1 file, 15 tests.
- `npm.cmd run type-check` passed.
- PreviewSettle adapter/bridge/runtime suite passed: 3 files, 36 tests.
- Runtime/editor regression suite passed: 5 files, 220 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with `ok=true`
  and structural refocus safety `ok=true` using `PROBE_READY_TIMEOUT_MS=30000`.

Still out of scope:

- Runtime-owned pagination output commits.
- Moving worker request/response ownership, response id matching, fallback to
  main-thread pagination, runtime apply decisions, ignore handling,
  final paginated output commits, `paginatedRef`, reducer dispatch, validation,
  renderer/export, persistence, FlowTable, document model semantics,
  `flushSync`, typing, or IME/composition behavior.

### Task 40 - Visual-Only Browser Preview Shell Executor (completed 2026-06-06)

Outcome:

- Added `applyVisualOnlyBrowserPreviewShellMutation` as a callback-only Shell
  executor for the visual-only browser preview fast lane.
- The executor consumes an already-created `apply`
  `BrowserPreviewShellMutationPlan` with `mode === "visual-only"`.
- The executor may call only Shell callbacks for:
  - `optimisticLayoutRef`.
  - `paginatedRef`.
  - `setPartialPreviewPaginated(null)`.
  - `setBrowserPreviewLayout(markEditorPreviewLayoutFull(generation))`.
  - reducer dispatch with the already-computed visual-only paginated output.
  - preview-settle lifecycle marking.
- `EditorShell` still owns:
  - runtime apply decisions and ignored plan handling.
  - visual-only output derivation through `tryApplyVisualOnlyPaginatedUpdate`.
  - `finishWysiwygPerfSpan` and visual-only perf metadata recording.
  - validation, renderer/export, persistence, FlowTable, document model
    semantics, `flushSync`, typing, and IME/composition behavior.
- Added focused coverage for each visual-only callback flag, disabled flags,
  and non-visual-only plan rejection.

Verified:

- Focused adapter suite passed: 1 file, 18 tests.
- `npm.cmd run type-check` passed.
- PreviewSettle adapter/bridge/runtime suite passed: 3 files, 39 tests.
- Runtime/editor regression suite passed: 5 files, 220 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with `ok=true`
  and structural refocus safety `ok=true` using `PROBE_READY_TIMEOUT_MS=30000`.

Still out of scope:

- Runtime-owned pagination output commits.
- Moving runtime apply decisions, ignored plan handling, visual-only output
  derivation, perf span recording, validation, renderer/export, persistence,
  FlowTable, document model semantics, `flushSync`, typing, or
  IME/composition behavior.

### Task 41 - Final Paginated Output Shell Executor (completed 2026-06-06)

Outcome:

- Added `applyPaginatedOutputBrowserPreviewShellMutation` as a callback-only
  Shell executor for the final paginated-output browser preview lane inside
  `commitPagination`.
- The executor consumes an already-created `apply`
  `BrowserPreviewShellMutationPlan` with `mode === "paginated-output"`.
- The executor may call only Shell callbacks for:
  - `optimisticLayoutRef`.
  - `paginatedRef`.
  - `setPartialPreviewPaginated(null)`.
  - `setBrowserPreviewLayout(markEditorPreviewLayoutFull/Settling(...))`.
  - reducer dispatch with the already-computed paginated output.
  - preview-settle applied marking.
  - inline visual freshness marking.
  - structural settle completion bookkeeping and diagnostics.
- `EditorShell` still owns:
  - runtime apply decisions and ignored plan handling.
  - `finishWysiwygPerfSpan`.
  - `markPreviewSettleCompletedBridge` before the apply decision.
  - full pagination/worker/main-thread output production.
  - structural settle diagnostic payload construction.
  - validation, renderer/export, persistence, FlowTable, document model
    semantics, `flushSync`, typing, and IME/composition behavior.
- Added focused coverage for final output callbacks, full and
  settling-blocking layout branches, inline visual freshness, structural settle
  completion, disabled flags, and non-paginated-output plan rejection.

Verified:

- Focused adapter suite passed: 1 file, 22 tests.
- `npm.cmd run type-check` passed.
- PreviewSettle adapter/bridge/runtime suite passed: 3 files, 43 tests.
- Runtime/editor regression suite passed: 5 files, 220 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with `ok=true`
  and structural refocus safety `ok=true` using `PROBE_READY_TIMEOUT_MS=30000`.

Still out of scope:

- Runtime-owned pagination output commits.
- Moving runtime apply decisions, ignored plan handling,
  `finishWysiwygPerfSpan`, full pagination/worker/main-thread output
  production, structural settle diagnostic payload construction, validation,
  renderer/export, persistence, FlowTable, document model semantics,
  `flushSync`, typing, or IME/composition behavior.

### Task 42 - Draft Pagination Shell Executor (completed 2026-06-06)

Outcome:

- Added `applyDraftPreviewShellMutation` as a callback-only Shell executor for
  the draft-pagination output lane inside `runDraftPagination`.
- The executor consumes an already-created `DraftPreviewShellMutationPlan`.
- The executor handles:
  - `ignore` plans as no-op accepted plans.
  - `reschedule` plans through a Shell-provided draft scheduler callback.
  - `apply` plans through Shell callbacks for paginated ref writes, optimistic
    layout writes, inline page relocation/follow, draft pagination node state,
    reducer dispatch with the already-computed draft paginated output, and
    inline visual freshness marking.
- `EditorShell` still owns:
  - draft preview document construction.
  - `paginatePreviewDoc`.
  - validation.
  - source resolution and source revision apply/reschedule/ignore decisions.
  - inline page relocation/follow input derivation.
  - reducer dispatch timing.
  - `flushSync`, document model, renderer/export, persistence, FlowTable,
    typing, and IME/composition behavior.
- Added focused coverage for apply, reschedule, ignore, relocation/follow
  flags, fallback visual freshness, and disabled optional callbacks.

Verified:

- Focused adapter suite passed: 1 file, 25 tests.
- `npm.cmd run type-check` passed.
- PreviewSettle adapter/bridge/runtime suite passed: 3 files, 46 tests.
- Runtime/editor regression suite passed: 5 files, 220 tests.
- Long mock `enter-backspace-immediate` smoothness smoke passed with `ok=true`
  and structural refocus safety `ok=true` using
  `SMOKE_BASE_URL=http://localhost:4000/editor` and
  `PROBE_READY_TIMEOUT_MS=30000`.

Still out of scope:

- Runtime-owned draft pagination output commits.
- Moving draft preview document construction, `paginatePreviewDoc`,
  validation, source resolution, source revision apply/reschedule/ignore
  decisions, inline page relocation/follow input derivation, reducer dispatch
  timing, `flushSync`, document model, renderer/export, persistence, FlowTable,
  typing, or IME/composition behavior.

### Task 43 - Recommended PreviewSettle Ownership Design Closure

Recommended next scope:

- Audit the executor coverage added in Tasks 38-42:
  - precomputed browser preview.
  - partial-worker browser preview.
  - visual-only browser preview.
  - final paginated browser output.
  - draft pagination output.
- Define the next PreviewSettle coordinator/runtime boundary before moving more
  ownership out of `EditorShell`.
- Identify the minimal state and callbacks that can move next without changing
  document model, core pagination, reducer semantics, renderers/export,
  persistence, FlowTable, validation, `flushSync`, typing, or
  IME/composition behavior.
- Leave production behavior unchanged unless the audit finds an active bypass
  or ordering bug.

## What Not To Do

Non-goals:

- No big rewrite.
- No replacing `EditorShell` in one pass.
- No moving core pagination.
- No incremental pagination in this RFC.
- No changing document model.
- No renderer/export/persistence changes.
- No FlowTable changes.
- No disabling validation for performance.
- No removing `flushSync` unless an equivalent atomic invariant mechanism
  exists.
- No making panels permanently stale or permanently non-interactive.
- No treating browser partial preview as export-ready or history-ready state.
- No turning editor runtime state into persisted package/document state.

## Testing And Probe Matrix

Every extraction task should require:

- `npm.cmd run type-check`
- app tests relevant to touched files
- `editorReducerRichText`
- `ParagraphTextSurface`
- `EditorCanvas`
- `wysiwygPerformance`
- enter-mid-split long mock smoke
- enter-backspace-immediate long mock smoke
- enter-rapid smoke
- backspace-rapid smoke
- enter -> type immediate smoke
- enter -> backspace -> type immediate smoke

Correctness flags to keep:

- `activeNodeMissingFromDocument = false`
- `ghostFragmentDetected = false`
- `duplicateTextDetected = false`
- `invalidDocumentDetected = false`
- `consoleNodeNotFoundErrorCount = 0`
- page isolation preserved
- panel release not inside urgent flush
- stale settle superseded safely

Known Task 13 report names to re-use:

- `reports/task13-enter-mid-split-repeat5-rerun.json`
- `reports/task13-enter-backspace-immediate-repeat5.json`
- `reports/task13-sanity-enter-type-immediate-v2.json`
- `reports/task13-sanity-enter-backspace-type-immediate.json`
- `reports/task13-sanity-enter-backspace-immediate-v2.json`

## Recommended Task 15 Prompt Outline

Continue from Task 14.

Goal: Extract a `StructuralEditRuntime` skeleton without changing behavior.

Scope:

- Create a transaction lifecycle object/API for structural edit phase,
  generation, abort, and pending transaction bookkeeping.
- Keep existing split/merge document operations, reducer dispatch, preview
  settle, panel release, and `flushSync` call sites behavior-equivalent.
- Do not move core pagination, document model, renderer/export/persistence,
  FlowTable, or validation.

Acceptance:

- Existing Task 13 structural probes still pass.
- Runtime owns transaction id/kind/phase/generation metadata.
- Shell still orchestrates the existing implementation through the runtime API.
- No behavior changes.

Required checks:

- `npm.cmd run type-check`
- focused app tests for `editorReducerRichText`, `ParagraphTextSurface`,
  `EditorCanvas`, and `wysiwygPerformance`
- long-mock structural smokes for `enter-mid-split`,
  `enter-backspace-immediate`, `enter-rapid`, `backspace-rapid`,
  `enter -> type immediate`, and `enter -> backspace -> type immediate`
