# Work Log Recent

This file is the current handoff context. Keep it short enough to read before a
new session starts. Do not paste full task transcripts here.

## Latest Accepted Baseline

Release/readiness marker `0.6.34` was accepted on 2026-06-13.

Accepted facts:

- Outline/list reorder has a core list hierarchy guard, blocked invalid-list
  drop feedback, active-draft finalize preservation through blocked and valid
  reorder paths, reducer no-op history coverage, and valid/invalid repeat
  browser smokes.
- Post-`0.6.34`, Outline list reorder design has moved to segment-aware
  subtree moves: dragging a list item moves its contiguous deeper same-instance
  children; self-subtree drops stay blocked and automatic level repair remains
  out of scope. The Outline drag ghost now reports the source subtree child
  count for these moves as editor-only feedback.
- Editor render/action separation now has ownership/invalidation contracts,
  structural handler extraction, page render churn guards, and WYSIWYG draft
  island trace coverage.
- The detached WYSIWYG island live layer defaults on for active text-engine
  development/test lanes and remains off by default in production.
- WYSIWYG DevTools traces separate measured typing `appPerf` from
  `postTraceSafetyAppPerf`, and safety gates cover keyboard selection,
  composition probing, and page-boundary multi-surface selection.
- The accessibility live-region reads caret/selection status from
  `wysiwygDraftStore` without waking the Shell/canvas render path.
- No persisted document schema, FlowDoc package/storage version, pagination
  semantics, undo/redo behavior, export contract, renderer ownership, or
  production text-engine gate changed.

Verification anchor:

- `npm.cmd run type-check`
- focused app tests for WYSIWYG config/session status
- `npm.cmd run smoke:wysiwyg-stage4c`
- detached live-layer safety trace
- `npm.cmd run test:app -- src/app/__tests__/projectVersion.test.ts`

## Current Runtime Context

Tasks for Editor Operation Architecture Phase 1 to 3B have been completed:
- Phase 1: Established `OperationEnvelope`, `Adapter`, and `Dispatcher` for lossless operation wrapping.
- Phase 2: Extracted `createParagraphSplitOperationPlan` and `createParagraphMergeOperationPlan` from the controller into pure `editorStructuralOperationPlans.ts` without behavior changes.
- Phase 3A: Defined `StructuralExecutionContext` and extracted `executeParagraphSplitOperationPlan` as a side-effect handler into `editorStructuralHandlers.ts`, delegating from the controller with identical `flushSync` timing.
- Phase 3B: `executeParagraphMergeOperationPlan` is delegated through `StructuralExecutionContext`, with direct tests for success and rollback when text session setup fails.
- Phase 3C started: `resolveOptimisticMergeSourceDocument` now owns the pure source-document decision for immediate optimistic merge after split, with focused tests.
- Phase 3C continued: `executeModelStructuralRefocus` now owns model-commit fallback refocus, paginated-ref update, eligibility guard, and draft-session cleanup with focused tests.
- Phase 3C post-commit fallback delegated: `executePostCommitOptimisticSplitRefocus` and `executePostCommitOptimisticMergeRefocus` now own post-commit optimistic split/merge refocus state changes, island setup, caret move, and fallback paths with focused tests.
- Render churn boundary established: page memoization now separates structural equality from paint equality so visual-only changes repaint affected pages while unrelated pages keep stable page object identity.
- Render invalidation now feeds page memoization: when preview/paginated output is applied with an affected-page scope, the Shell exposes the plan to `EditorCanvas` for one render so unaffected pages can skip paint comparison while affected/unknown pages still compare normally.
- Autosave status chrome is separated from Shell render state: `useEditorAutosave` still owns debounced persistence and pagehide/visibilitychange flushes, while the bottom bar reads Saving/Saved from `editorAutosaveStatusStore` so status flips do not require `EditorShell` save-status state.
- Canvas-owned WYSIWYG draft visual preview now reuses `WysiwygDraftParagraphLayoutCache`, matching the draft island/surface measurement cache path and avoiding repeated same-input preview measurement without changing pagination truth.
- Fresh WYSIWYG smoothness probes showed draft island measurement cadence near two measure events per input in dev; `flowdoc-island-draft-measure` now reports `draftLayoutCacheHit` so the next trace can separate cache hits from true measurement misses.
- Full automated editor smoke was rechecked with `SMOKE_VERBOSE=1` and passed
  in about 126s, so the earlier timeout is no longer treated as the current
  blocker for this render/action separation pass.
- Render/action separation verification: `npm.cmd run type-check`, focused editor operation/render suites, and full `npm.cmd test` pass after the ownership, invalidation, low-risk lane, structural, and page churn changes.
- Added `scripts/wysiwyg-devtools-trace.mjs` for Chrome DevTools timeline traces
  around the Stage 3 WYSIWYG typing burst. Latest compact bundled-Chromium run
  on 2026-06-11 used 80 keys at 10ms intervals and passed with no console/page
  errors. App trace showed `editor-canvas-react-commit` count 164, p95 12.7ms,
  max 46.9ms; `flowdoc-island-draft-measure` count 176, p95 3.7ms, max 6.9ms,
  with 96 cache hits and 80 misses. DevTools long tasks were dominated by
  tracing startup overhead and React dev scheduler frames, so no additional
  editor runtime patch is accepted from this trace alone.
- Commit attribution telemetry now adds `renderReason` and
  `commitAttribution*` metadata to `editor-canvas-react-commit` without adding
  editor state. Latest compact bundled-Chromium run showed 169 canvas commits:
  163 visual commits attributed to `flowdoc-island-fragment-split`, 4
  parent-sync commits attributed to `editor-shell-draft-change-exit`, and 2
  unattributed commits. This points the next runtime investigation at visual
  draft fragment split churn rather than parent-sync or selection.
- Page-slot attribution telemetry now records WYSIWYG page slot memo hit/miss
  scope when active draft props reach `EditorCanvasPageSlotMemo`. Latest compact
  bundled-Chromium run still showed 169 canvas commits, but
  `pageSlotAttribution.count` was 0, so the measured visual churn did not reach
  page slot memo comparison during the Stage 3 typing burst. The remaining churn
  is isolated to the canvas profiler subtree around the draft island/visual
  split path, not page slot render churn.
- DevTools trace summary now correlates visual canvas commits with draft island
  commit times and fragment split events. Latest compact bundled-Chromium run
  showed 163 visual canvas commits: 163 matched `flowdoc-island-fragment-split`,
  84 matched `flowdoc-island-react-commit` within the 2ms commit-time window,
  and 79 were fragment-split-only. This means the remaining churn has two
  groups: nested island React commits plus visual split work that is still
  inside the canvas profiler window without a matching island profiler commit.
- Fragment split telemetry now records whether split input and output
  signatures changed. Latest compact bundled-Chromium run showed 174
  `flowdoc-island-fragment-split` events: 87 input-changed and 87 input-same,
  but only 1 output-changed and 173 output-same, with max same-output repeat 89.
  The current Stage 3 typing churn is therefore dominated by repeated
  fragment-split work/telemetry around unchanged visual output, not page-slot
  render churn and not meaningful visual fragment changes on every input.
- Canvas commit attribution now separates unchanged-output fragment split events
  as `visual-unchanged` instead of `visual`. Latest compact bundled-Chromium run
  showed 166 canvas commits with 162 `visual-unchanged`, 0 `visual`, 1
  parent-sync, and 3 unattributed. This keeps render-churn traces from
  overstating meaningful visual output changes while preserving attribution for
  repeated split work.
- Fragment split perf telemetry now samples repeated unchanged-output split
  events while preserving hidden attribution hints for canvas commit
  classification. Latest compact bundled-Chromium run showed 11 emitted
  `flowdoc-island-fragment-split` events plus 177 attribution hints, for 188
  observed split events; 187 observed events had unchanged output, while canvas
  commit attribution still reported 163 `visual-unchanged`, 0 `visual`, and
  `pageSlotAttribution.count` 0. This reduces main perf-buffer noise without
  changing document layout, pagination truth, undo/redo, export, or page-slot
  render behavior.
- Draft island surface React commit telemetry now distinguishes root island
  commits from portal/surface commits. Latest compact bundled-Chromium run
  showed 162 `visual-unchanged` canvas commits: 84 matched
  `island+surface+fragmentSplit`, while 78 matched `fragmentSplit` only.
  `flowdoc-island-react-commit` and `flowdoc-island-surface-react-commit` both
  counted 85, `pageSlotAttribution.count` remained 0, and `visual` remained 0.
  The next reducer patch should therefore target the unchanged-output split
  path with surface memo/identity evidence, not page slot memoization or
  pagination truth.
- Fragment/surface identity telemetry now reports whether repeated split output
  reused the fragment array and whether surface keys changed. Latest compact
  bundled-Chromium run showed 174 observed split events: 174 `array-new`, 0
  `array-reused`, 173 `surface-keys-same`, and 1 `surface-keys-changed`, with
  max same-surface-key repeat 89. This identifies reference churn around stable
  surface geometry/keys, but it is not yet safe to memoize by surface keys alone
  because line text/style can change while geometry and keys stay stable.
- Fragment split visual-signature telemetry now distinguishes stable geometry
  from stable rendered line content without emitting raw paragraph text. Latest
  compact bundled-Chromium run showed 190 observed split events: 73
  `output-same/visual-changed`, 116 `output-same/visual-same`, and 1
  `output-changed/visual-changed`. Fragment arrays were still always new
  (`arrayNewCount` 190), while surface keys stayed the same 189 times. This
  means the remaining churn has two different classes: typing updates where
  visual content genuinely changes despite stable geometry, and repeated split
  work where both geometry and visual line signature stay unchanged.
- Fragment split attribution now uses `draftFragmentVisualChanged` before
  falling back to the older geometry/output flag, and visual-changed split
  events are emitted to the main perf buffer instead of hidden attribution
  hints. Latest compact bundled-Chromium run showed 76 emitted split events and
  104 attribution hints across 180 observed split events; visual signature still
  split into 73 `output-same/visual-changed`, 106 `output-same/visual-same`,
  and 1 `output-changed/visual-changed`. Canvas commit attribution still showed
  163 `visual-unchanged` and 0 `visual`, because the matched commit windows
  were still closest to visual-same split events. This means visual-changed
  split work exists in the typing path, but the measured canvas commit churn is
  still dominated by repeated visual-same split attribution.
- Draft fragment split result reuse is now guarded by the content-safe visual
  signature plus stable surface keys. Latest compact bundled-Chromium run showed
  180 observed split events, with 106 `candidate/reused` and 74
  `not-candidate/not-reused`; the reused set matches the 106
  `output-same/visual-same` events, while 73 `output-same/visual-changed` and 1
  `output-changed/visual-changed` were not reused. Canvas commit counts were
  still high (`editor-canvas-react-commit` 161, `visual-unchanged` 159,
  `flowdoc-island-react-commit` 85, `flowdoc-island-surface-react-commit` 85,
  `pageSlotAttribution.count` 0), so this guard confirms a safe reuse boundary
  but does not by itself remove the remaining canvas/island render churn.
- Draft island visual-line rendering is now isolated behind a memoized
  visual-lines component whose comparator accepts only the guarded reused
  `surfaceFragment` and `renderProps` identities; caret, selection, input, and
  pointer handling remain in the surface wrapper. Latest compact
  bundled-Chromium run showed no console/page errors, 180 observed split events,
  106 guarded reused split results, 74 visual-changed split events,
  `flowdoc-island-visual-lines-react-commit` 74, `editor-canvas-react-commit`
  163, `visual-unchanged` 157, `flowdoc-island-react-commit` 87,
  `flowdoc-island-surface-react-commit` 87, and
  `pageSlotAttribution.count` 0. This confirms the line subtree no longer
  commits for every visual-same repeat, but the remaining measured churn is
  still the island/surface/root commit path rather than page slot pagination
  scope.
- Draft island surface rendering is now isolated behind a memoized surface view
  with a strict comparator that includes surface identity, source fragment,
  render props, caret offset, selection offsets, draft revision/text length,
  text measurer, and all event handler references. Latest compact
  bundled-Chromium run showed no console/page errors, `editor-canvas-react-commit`
  158, `visual-unchanged` 156, `flowdoc-island-react-commit` 83,
  `flowdoc-island-surface-react-commit` 83,
  `flowdoc-island-visual-lines-react-commit` 74, 182 observed split events,
  108 guarded reused split results, 74 visual-changed split events, and
  `pageSlotAttribution.count` 0. This trims repeated surface commits without
  weakening caret/selection updates, but the remaining root commits still track
  the active local draft/input lane.
- Draft island root commit telemetry now classifies each root commit by draft,
  layout, surface, and anchor signature changes without storing raw text.
  Latest compact bundled-Chromium run showed no console/page errors,
  `flowdoc-island-react-commit` 87, `islandRootCommit.draftChangedCount` 80,
  `layoutChangedCount` 1, `surfaceChangedCount` 1, `anchorChangedCount` 0, and
  `inputToVisibleActiveCount` 80. `islandRootCommit.byCommitReason` was 79
  `draft`, 7 `stable`, and 1 initial `draft+layout+surface`, confirming that
  the remaining island root churn is almost entirely the active local draft
  input lane rather than surface geometry, anchors, page slots, or pagination.
- Option 1A of the root/local-draft boundary is now in place: the exported
  `FlowdocDraftEditorIslandRoot` is a thin memoized wrapper around
  `FlowdocDraftEditorIslandRuntime`, with a prop comparator that keeps active
  draft props, fragment/page inputs, measurer, and lifecycle callbacks explicit.
  No draft store ownership moved yet. Latest compact bundled-Chromium run
  showed no console/page errors, `editor-canvas-react-commit` 160,
  `flowdoc-island-react-commit` 85, `flowdoc-island-surface-react-commit` 85,
  `flowdoc-island-visual-lines-react-commit` 74, and
  `islandRootCommit.draftChangedCount` / `inputToVisibleActiveCount` still 80.
  This confirms Option 1A is a structural boundary for the next store/subscriber
  patch, not a completed render-churn fix by itself.
- Option 2A started with a conservative local draft store/subscriber contract:
  `wysiwygDraftStore` now exposes versioned node snapshots with stable inactive
  identity and no-op same-payload updates, the out-of-canvas island reads the
  active store snapshot before falling back to props, and `EditorShell` no
  longer passes parent `draftText` / caret / selection props into the island
  path. The island still keeps immediate per-input draft state locally and only
  flushes parent/session updates through the existing debounce/flush paths.
  Latest compact bundled-Chromium run showed no console/page errors,
  `editor-canvas-react-commit` 165, `flowdoc-island-react-commit` 88,
  `flowdoc-island-surface-react-commit` 88,
  `flowdoc-island-visual-lines-react-commit` 74,
  `pageSlotAttribution.count` 0, and
  `islandRootCommit.draftChangedCount` / `inputToVisibleActiveCount` still 80.
  A tested but rejected variant published every local input into the global
  draft store; it raised `editor-canvas-react-commit` to 242 and island/surface
  commits to 162 by waking canvas subscribers, so per-key global publication is
  not accepted until the subscribers are narrowed or split.
- Option 2A continued by splitting `wysiwygDraftStore` into draft and session
  subscriber lanes, gating canvas paragraph surfaces behind an explicit
  `useWysiwygDraftStoreSnapshot` prop, and changing the rich-text toolbar
  selection hook to subscribe/debounce draft selection outside
  `useSyncExternalStore`. The island still renders from local draft state during
  typing, but publishes per-input snapshots to the draft store for explicit
  live consumers; session snapshots stay stable until the edited node/session
  changes. Latest compact bundled-Chromium run on 2026-06-11 passed with no
  console/page errors: `editor-canvas-react-commit` 87,
  `flowdoc-island-react-commit` 85,
  `flowdoc-island-surface-react-commit` 85,
  `flowdoc-island-visual-lines-react-commit` 74,
  `pageSlotAttribution.count` 0, and
  `islandRootCommit.byCommitReason.stable` 5. A store-driven island-render
  variant was re-tested and rejected because it kept island/surface commits at
  162 even after anchor state guards; the accepted boundary is per-input store
  publication without making the island or shell render from the draft lane on
  every key.
- Draft island measure telemetry now keeps cache-hit layout resolves out of the
  main perf event buffer and records them as attribution hints instead. This
  does not change layout, cache cloning, pagination truth, or active typing
  behavior; it makes the main `flowdoc-island-draft-measure` count represent
  true cache misses/measurement work while `draftIslandMeasure.observedCount`
  still includes cache-hit render resolves. Latest compact bundled-Chromium run
  on 2026-06-12 passed with no console/page errors:
  `flowdoc-island-draft-measure` 80,
  `text-engine-draft-measure` 80,
  `draftIslandMeasure.emittedCount` 80,
  `draftIslandMeasure.attributionHintCount` 98,
  `draftIslandMeasure.observedCount` 178,
  `draftIslandMeasure.cacheMissCount` 80,
  `draftIslandMeasure.cacheHitCount` 98,
  `editor-canvas-react-commit` 84,
  `flowdoc-island-react-commit` 84,
  `flowdoc-island-surface-react-commit` 84, and
  `pageSlotAttribution.count` 0.
- Fragment split identity telemetry now reports final fragment-array reuse
  after the guarded split-result reuse step, instead of reporting only the
  freshly generated pre-reuse array. This keeps visual output unchanged while
  making `arrayReusedCount` align with the fragment array that downstream
  island surfaces actually receive. Latest compact bundled-Chromium run on
  2026-06-12 passed with no console/page errors:
  `fragmentSplit.observedCount` 179,
  `fragmentSplit.identity.arrayReusedCount` 105,
  `arrayNewCount` 74,
  `resultReusedCount` 105,
  `resultNewCount` 74,
  `visualSignature.visualChangedCount` 74,
  `visualSignature.visualSameCount` 105,
  `editor-canvas-react-commit` 85,
  `flowdoc-island-react-commit` 83,
  `flowdoc-island-surface-react-commit` 83,
  and `pageSlotAttribution.count` 0.
- Draft island split work now reuses the prior draft layout identity and split
  result when the layout cache key and page capacity signature are unchanged.
  This keeps the existing cache-clone contract intact outside the island while
  avoiding repeated same-layout split resolves inside the active draft lane.
  Latest compact bundled-Chromium run on 2026-06-12 passed with no
  console/page errors:
  `fragmentSplit.observedCount` 80,
  `fragmentSplit.emittedCount` 74,
  `fragmentSplit.attributionHintCount` 6,
  `fragmentSplit.identity.arrayReusedCount` 6,
  `fragmentSplit.identity.arrayNewCount` 74,
  `draftIslandMeasure.observedCount` 182,
  `draftIslandMeasure.emittedCount` 80,
  `draftIslandMeasure.cacheMissCount` 80,
  `draftIslandMeasure.cacheHitCount` 102,
  `draftIslandMeasure.identityReusedCount` 102,
  `editor-canvas-react-commit` 86,
  `flowdoc-island-react-commit` 84,
  `flowdoc-island-surface-react-commit` 84,
  `flowdoc-island-visual-lines-react-commit` 74,
  and `pageSlotAttribution.count` 0.
- Draft island surface commit telemetry now classifies surface commits by
  revision, text length, caret, active selection, layout, surface, and anchor
  signatures without recording raw text. Latest compact bundled-Chromium run on
  2026-06-12 passed with no console/page errors:
  `editor-canvas-react-commit` 86,
  `flowdoc-island-react-commit` 85,
  `flowdoc-island-surface-react-commit` 85,
  `islandSurfaceCommit.revisionChangedCount` 80,
  `textLengthChangedCount` 80,
  `caretChangedCount` 80,
  `selectionChangedCount` 1,
  `layoutChangedCount` 1,
  `surfaceChangedCount` 1,
  `anchorChangedCount` 1,
  `islandSurfaceCommit.byCommitReason.revision+text-length+caret.count` 79,
  `flowdoc-island-visual-lines-react-commit` 74,
  `fragmentSplit.observedCount` 80,
  `draftIslandMeasure.identityReusedCount` 94,
  and `pageSlotAttribution.count` 0. This confirms the remaining surface churn
  is dominated by collapsed typing caret/text metadata, not active selection
  overlay changes.
- Draft island static surface chrome is now isolated behind a memoized chrome
  child that compares geometry instead of fragment object identity. The
  hit-area, cover, and outline SVG rects stay under the same island surface
  element with the same data attributes, so pointer/focus probes and existing
  smoke selectors keep their current contract. Latest compact bundled-Chromium
  run on 2026-06-12 passed with no console/page errors:
  `flowdoc-island-surface-chrome-react-commit` 1,
  `islandSurfaceChromeCommit.bySource.mount.count` 1,
  `flowdoc-island-surface-react-commit` 86,
  `islandSurfaceCommit.byCommitReason.revision+text-length+caret.count` 79,
  `flowdoc-island-visual-lines-react-commit` 74,
  `fragmentSplit.observedCount` 80,
  `draftIslandMeasure.identityReusedCount` 104,
  `editor-canvas-react-commit` 87,
  and `pageSlotAttribution.count` 0. This reduces repeated static-chrome work
  but intentionally leaves the live surface wrapper on the caret/text metadata
  path.
- Draft island caret rendering is now isolated behind a memoized caret child
  whose comparator uses rendered caret geometry rather than caret object
  identity. The caret line remains the same `data-wysiwyg-caret="true"` SVG
  element under the same island surface, and surface-level live draft data
  attributes are intentionally unchanged. Latest compact bundled-Chromium run
  on 2026-06-12 passed with no console/page errors:
  `flowdoc-island-caret-react-commit` 74,
  `islandCaretCommit.activeCount` 74,
  `islandCaretCommit.totalMs` 0.6,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `flowdoc-island-surface-react-commit` 86,
  `islandSurfaceCommit.byCommitReason.revision+text-length+caret.count` 79,
  `flowdoc-island-visual-lines-react-commit` 74,
  `fragmentSplit.observedCount` 80,
  `draftIslandMeasure.identityReusedCount` 100,
  `editor-canvas-react-commit` 87,
  and `pageSlotAttribution.count` 0. This confirms the visible caret subtree is
  cheap and now separately attributable; the remaining wrapper churn is still
  the surface SVG live-attribute contract.
- Draft island surface live data attributes now flow through
  `resolveDraftIslandSurfaceLiveAttributes`, a pure helper that keeps the
  existing island SVG attr contract explicit before any imperative/ref-based
  attr-sync experiment. Tests cover collapsed typing and active range selection
  attr outputs, including text length, caret offset, selection range, overlay
  counts, custom-caret visibility, line counts, and island revision. Latest
  compact bundled-Chromium run on 2026-06-12 passed with no console/page
  errors:
  `editor-canvas-react-commit` 85,
  `flowdoc-island-react-commit` 83,
  `flowdoc-island-surface-react-commit` 83,
  `islandSurfaceCommit.byCommitReason.revision+text-length+caret.count` 79,
  `flowdoc-island-caret-react-commit` 74,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `fragmentSplit.observedCount` 80,
  `draftIslandMeasure.identityReusedCount` 90,
  and `pageSlotAttribution.count` 0.
- Draft island surface live data attributes now also have a guarded ref-sync
  path through `syncDraftIslandSurfaceLiveAttributes`. React still renders the
  same live attributes for initial/SSR markup and fallback parity, while the
  layout effect applies the same helper output directly to the island SVG and
  removes absent values such as hidden caret attrs. This is an intentional
  bridge patch, not yet a surface-commit reducer. Latest compact
  bundled-Chromium run on 2026-06-12 passed with no console/page errors:
  `editor-canvas-react-commit` 84,
  `flowdoc-island-react-commit` 83,
  `flowdoc-island-surface-react-commit` 83,
  `islandSurfaceCommit.byCommitReason.revision+text-length+caret.count` 79,
  `flowdoc-island-caret-react-commit` 74,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `fragmentSplit.observedCount` 80,
  `draftIslandMeasure.identityReusedCount` 92,
  and `pageSlotAttribution.count` 0.
- Draft island live SVG attrs now have an explicit React-diff fallback flag:
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_REACT_LIVE_ATTRS`. The default remains
  enabled so SSR/initial markup keeps the previous attributes, but trace runs
  can set the flag to `0` and rely on the ref-sync path for live attr updates.
  `scripts/wysiwyg-devtools-trace.mjs` now records final island SVG attrs after
  the typing burst so the contract can be checked directly. Latest compact
  bundled-Chromium experiment on 2026-06-12 used
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_REACT_LIVE_ATTRS=0` and passed with no
  console/page errors. Final SVG attrs were `textLength` 595, `caretOffset`
  595, `selectionCollapsed` `true`, `customCaretVisible` `true`, `revision`
  81, and `lineCount` 9. App perf remained in the same shape:
  `editor-canvas-react-commit` 85,
  `flowdoc-island-react-commit` 84,
  `flowdoc-island-surface-react-commit` 84,
  `islandSurfaceCommit.byCommitReason.revision+text-length+caret.count` 79,
  `flowdoc-island-caret-react-commit` 74,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `fragmentSplit.observedCount` 80,
  `draftIslandMeasure.identityReusedCount` 90,
  and `pageSlotAttribution.count` 0. This proves the ref-sync attr contract is
  viable, but it is not enough to lower surface commits while live caret/visual
  children still render through the surface subtree.
- Next patch split the island SVG live subtree behind an opt-in detached live
  layer flag, `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_SURFACE_LIVE_LAYER`. Default
  behavior remains inline: a compact bundled-Chromium default trace on
  2026-06-12 passed with no console/page errors, final SVG attrs still current
  (`textLength` 595, `caretOffset` 595, `revision` 81, `lineCount` 9), and
  `flowdoc-island-surface-react-commit` 82. With
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_REACT_LIVE_ATTRS=0` and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_SURFACE_LIVE_LAYER=1`, the detached
  experiment also passed with no console/page errors and the same final SVG
  attrs. The surface shell no longer reported live typing commits:
  `flowdoc-island-surface-react-commit` 0,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `flowdoc-island-surface-live-layer-react-commit` 84,
  `flowdoc-island-visual-lines-react-commit` 74,
  `flowdoc-island-caret-react-commit` 74,
  `editor-canvas-react-commit` 85,
  `flowdoc-island-react-commit` 84,
  `fragmentSplit.observedCount` 80, and `pageSlotAttribution.count` 0. This is
  the first trace where surface shell ownership is cleanly separated from live
  typing work without increasing canvas commit count. The remaining cost is now
  explicit in the live-layer/root/layout path, not hidden inside the surface
  shell wrapper.
- Detached live-layer safety gate added to
  `scripts/wysiwyg-devtools-trace.mjs` behind
  `TRACE_DETACHED_LIVE_LAYER_SAFETY=1`. The gate runs after the measured typing
  burst so the typing trace remains comparable, then checks keyboard range
  selection, pointer collapse, and outside-click blur against the same island
  SVG attr contract. Latest compact bundled-Chromium run on 2026-06-12 used
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_REACT_LIVE_ATTRS=0`,
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_SURFACE_LIVE_LAYER=1`, and
  `TRACE_DETACHED_LIVE_LAYER_SAFETY=1`; it passed with no console/page errors
  and `detachedLiveLayerSafety.ok` true. Keyboard selection kept
  `bridgeCount` 1, `nonBridgeTextareaCount` 0, `selectedTextLength` 4,
  `selectionCollapsed` `false`, and overlay count 1. Pointer collapse returned
  `selectedTextLength` 0 and `selectionCollapsed` `true` with bridge-only
  editing. Blur removed the active island/bridge with no native textarea
  fallback. App perf stayed in the expected detached shape:
  `flowdoc-island-surface-react-commit` 0,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `flowdoc-island-surface-live-layer-react-commit` 90,
  `flowdoc-island-react-commit` 90,
  `editor-canvas-react-commit` 96,
  `pageSlotAttribution.count` 0. The higher canvas/root/live-layer counts are
  expected for the added safety interactions after the typing burst; the
  surface shell still stayed out of live typing and interaction commits.
- Detached live-layer promotion started in the trace path only:
  `scripts/wysiwyg-devtools-trace.mjs` now defaults its managed dev server to
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_SURFACE_LIVE_LAYER=1` and reports the
  effective value in `action.islandSurfaceLiveLayer`. The app config resolver
  still defaults the feature off outside the trace runner, so this is a
  measurement-lane promotion rather than a product/runtime default change. Use
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_SURFACE_LIVE_LAYER=0` when a legacy inline
  surface baseline is needed.
  Latest default compact trace on 2026-06-12 passed without explicitly setting
  the surface-live-layer env; `action.islandSurfaceLiveLayer` reported `1`,
  `action.islandReactLiveAttrs` reported `1`, final SVG attrs were current
  (`textLength` 595, `caretOffset` 595, `revision` 81, `lineCount` 9),
  `flowdoc-island-surface-react-commit` 0,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `flowdoc-island-surface-live-layer-react-commit` 84,
  `editor-canvas-react-commit` 85, and `pageSlotAttribution.count` 0.
  A second default run with only `TRACE_DETACHED_LIVE_LAYER_SAFETY=1` also
  passed: keyboard selection reported `selectedTextLength` 4 and overlay count
  1, pointer collapse restored `selectionCollapsed` `true`, and blur removed
  the island/bridge with no native textarea fallback. That confirms the trace
  runner promotion no longer requires manual surface-live-layer env setup.
- Detached live-layer safety now includes a long keyboard-selection span after
  the short selection check. `readTargetEditSurfaceState` aggregates per-surface
  island attrs so future multi-surface traces can verify overlay ownership
  across all active island SVGs, while still keeping the first active surface
  attrs for backward-compatible checks. Latest default detached safety trace on
  2026-06-12 passed with `ok` true and no console/page errors:
  short keyboard selection selected 4 chars with overlay count 1; long
  `Shift+Home` selection selected 595 chars from offset 595 to 0 across 9
  lines, with `surfaceSelectionOverlayCount` 9; pointer collapse returned
  `selectedTextLength` 0 and `selectionCollapsed` `true`; blur removed all
  island/bridge/native-textarea edit surfaces. Perf shape stayed aligned with
  the detached contract: `flowdoc-island-surface-react-commit` 0,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `flowdoc-island-surface-live-layer-react-commit` 93,
  `editor-canvas-react-commit` 100, and `pageSlotAttribution.count` 0. The
  extra live-layer/canvas counts are from the additional post-trace safety
  interactions, not the measured typing burst.
- Detached live-layer safety now includes a synthetic IME/composition probe on
  the hidden input bridge after pointer collapse and before blur. The probe
  dispatches `compositionstart`, composing `beforeinput`/`input`, and
  `compositionend`, then verifies the bridge echo text is cleared, no native
  textarea fallback mounted, the island remains active, text length stays
  unchanged, and the collapsed selection remains collapsed. Latest default
  detached safety trace on 2026-06-12 passed with `ok` true and no console/page
  errors. Composition before/after both reported `textLength` 595,
  `caretOffset` 323, `selectedTextLength` 0, `selectionCollapsed` `true`,
  `bridgeCount` 1, `nonBridgeTextareaCount` 0, and empty bridge value/text
  content. Perf shape remained detached: `flowdoc-island-surface-react-commit`
  0, `flowdoc-island-surface-chrome-react-commit` 1,
  `flowdoc-island-surface-live-layer-react-commit` 91,
  `editor-canvas-react-commit` 98, and `pageSlotAttribution.count` 0.
- Detached live-layer safety now also forces a page-boundary/multi-surface
  selection check after the composition probe. `readTargetEditSurfaceState`
  records each active island surface's page index, line range, fragment count,
  pointer-fragment count, and selected surface/page aggregates. The safety gate
  uses a synthetic plain-text paste payload after the measured trace is stopped
  to expand the target from one surface/page to at least two surfaces/two pages,
  then runs `Shift+Home` and requires selected overlays on at least two
  surfaces/pages while keeping bridge-only editing. Latest default detached
  safety trace on 2026-06-12 passed with `ok` true and no console/page errors:
  page-boundary expansion handled one paste payload of 2744 chars, moved from
  `islandCount` 1 / page `0` / text length 595 to `islandCount` 2 / pages
  `0,1` / text length 3339, and reported `maxPointerFragmentCount` 2.
  Page-boundary selection then reported selected pages `0,1`,
  `selectedSurfaceCount` 2, `surfaceSelectionOverlayCount` 45,
  `selectionOverlayElementCount` 2, `selectedTextLength` 3339, `bridgeCount` 1,
  and `nonBridgeTextareaCount` 0; blur removed the island/bridge/native
  surfaces. App perf still stayed in detached shape for the safety run:
  `flowdoc-island-surface-react-commit` 0,
  `flowdoc-island-surface-chrome-react-commit` 3,
  `flowdoc-island-surface-live-layer-react-commit` 98,
  `editor-canvas-react-commit` 100, and `pageSlotAttribution.count` 0. The
  chrome/live-layer counts include the post-trace safety interactions and the
  extra boundary surfaces, not only the measured typing burst.
- WYSIWYG DevTools trace summaries now split the measured typing window from
  post-trace safety interactions. `appPerf` is the typing-only baseline,
  `postTraceSafetyAppPerf` contains the safety interaction tail, `totalAppPerf`
  keeps the combined view for debugging, and `perfWindows` reports the raw event
  counts behind the split. Latest default detached safety trace on 2026-06-12
  passed with `ok` true and no console/page errors: `perfWindows.measuredTyping`
  had 1012 perf events plus 100 attribution events, `postTraceSafety` had 168
  plus 17, and total had 1180 plus 117. Measured typing `appPerf` reported
  `flowdoc-island-surface-react-commit` 0,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `flowdoc-island-surface-live-layer-react-commit` 86,
  `editor-canvas-react-commit` 87,
  `fragmentSplit.observedCount` 80, and `pageSlotAttribution.count` 0. The
  safety-only tail reported surface 0, chrome 2, live-layer 15, canvas 15,
  `fragmentSplit.observedCount` 1, and `pageSlotAttribution.count` 0. The same
  run still passed the page-boundary gate with two island surfaces on pages
  `0,1`, selected pages `0,1`, `selectedSurfaceCount` 2,
  `surfaceSelectionOverlayCount` 45, `bridgeCount` 1, and no native textarea.
- Detached live-layer promotion moved from trace-only evidence into the
  development/test app config path. `resolveWysiwygIslandSurfaceLiveLayerEnabled`
  now defaults on only when the WYSIWYG text engine is already enabled and
  `NODE_ENV` is not `production`; explicit `0/off` still forces the legacy
  inline surface baseline and explicit `1/enabled` still forces the detached
  layer. Production default remains off, and the text engine production
  acknowledgement gate is unchanged. Focused config coverage now verifies:
  inactive text engine stays off, active dev/test text engine defaults on,
  production default stays off, unknown values stay off, and explicit overrides
  win. Latest default detached safety trace after the config change passed with
  `ok` true and no console/page errors: measured typing `appPerf` reported
  `flowdoc-island-surface-react-commit` 0,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `flowdoc-island-surface-live-layer-react-commit` 85,
  `editor-canvas-react-commit` 86,
  `fragmentSplit.observedCount` 80, and `pageSlotAttribution.count` 0. The
  safety-only tail reported surface 0, chrome 2, live-layer 17, canvas 16, and
  `pageSlotAttribution.count` 0. The page-boundary gate still expanded to two
  surfaces on pages `0,1` and selected both pages with `selectedSurfaceCount` 2,
  `surfaceSelectionOverlayCount` 45, `bridgeCount` 1, and no native textarea.
  `npm.cmd run smoke:wysiwyg-stage4c` was attempted without a live-layer env and
  failed at the existing clipboard-flow accessibility-status assertion after
  cross-fragment drag selection; forcing
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_SURFACE_LIVE_LAYER=0` failed at the same
  assertion, so this is recorded as an unresolved Stage 4C smoke risk rather
  than evidence that the dev/test live-layer default changed selection behavior.
- The Stage 4C accessibility-status smoke risk above is now resolved. The
  failure was diagnosed as a status ownership issue: cross-fragment pointer drag
  selection produced real SVG selection overlays on two island surfaces/pages,
  but `EditorShellOverlayChrome` still rendered the stale Shell session status
  because the WYSIWYG text session stores caret/selection changes in a ref to
  avoid Shell render churn. The accessibility live-region now has a small child
  subscriber that reads `wysiwygDraftStore` directly and computes the same
  caret/selection status without waking the Shell/canvas tree. The Stage 4C
  smoke now passes with default dev/test detached live layer enabled, including
  double-click selection, clipboard/paste/cut, cross-fragment pointer drag
  selection, composition, and stack paragraph checks. Latest detached safety
  trace after this patch passed with `ok` true and no console/page errors:
  measured typing stayed in the expected shape with
  `flowdoc-island-surface-react-commit` 0,
  `flowdoc-island-surface-chrome-react-commit` 1,
  `flowdoc-island-surface-live-layer-react-commit` 86,
  `editor-canvas-react-commit` 87, `fragmentSplit.observedCount` 80, and
  `pageSlotAttribution.count` 0; the safety-only tail reported surface 0,
  chrome 2, live-layer 15, canvas 15, and pageSlot 0. The page-boundary gate
  still selected pages `0,1` with `selectedSurfaceCount` 2,
  `surfaceSelectionOverlayCount` 45, `bridgeCount` 1, and no native textarea.

The accepted constraint is zero behavior change during this refactoring phase:
- No changes to `flushSync` boundaries.
- No changes to dispatch order/timing or telemetry.
- Operation Plans must remain synchronous and side-effect free.
- Structural Handlers use explicit dependency injection via `StructuralExecutionContext`.

Primary architecture references:
- `docs/EDITOR_OPERATION_ARCHITECTURE.md`
- `docs/FRONTEND_RUNTIME_ARCHITECTURE.md`

## WYSIWYG Performance Refactor Polish

- Completed Stages A-E of the WYSIWYG data-flow refactor to decouple the typing path from the global React tree.
- Added `useDeferredValue` in `FlowdocDraftEditorIslandRoot` for heavy visual layout/fragment splitting to keep typing latency <16ms.
- Refactored `onRichTextShortcut` to apply formatting commands locally without forcing global re-renders.
- Implemented `flushAllWysiwygDrafts` on global boundaries (save, export, undo, split/merge).
- Added `nodeTextVersion` to `PageFragment` and implemented strict `arePageFragmentsStructurallyEqual` comparison in `EditorCanvas.tsx` to eliminate the 700-slot re-render pattern during active typing.
- Regression tests added to verify identical page slot fragments do not trigger React re-renders.

## Next Useful Work

1. Expand render invalidation routing beyond visual-only when a future patch needs table, document-wide, or structural affected-page scheduling.
2. Keep structural operation handler, source-doc, model-refocus, and post-commit refocus tests green when controller responsibilities move.
3. Investigate why visual draft fragment split commits still pass through the
   editor canvas profiler so often during active typing; current page-slot
   telemetry says those commits do not reach page slot memo comparison, and
   surface telemetry says about half match island/surface commits while the rest
   are fragment-split-only attribution. Identity telemetry now shows stable
   surface keys with new fragment arrays, and visual-signature telemetry shows
   both genuine visual-content changes and truly unchanged visual repeats.
   Reclassification, guarded split-result reuse, visual-line memoization, a
   strict memoized surface shell, root commit reason telemetry, Option 1A
   runtime extraction, and the first Option 2A store/subscriber contract are now
   in place. The next patch should split the draft-store subscribers so local
   per-input publication can reach only the active island/runtime child, not
   canvas paragraph surfaces or page render scope.

## Handoff Rules

- Put durable milestone summaries in `docs/WORK_LOG.md`.
- Put behavior contracts in the active spec/contract that owns them.
- Put task-local evidence in the final response or focused reports.
- Use git history for older detailed work-log entries.
