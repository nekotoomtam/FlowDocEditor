# WYSIWYG Paragraph Interaction Checklist

Status: implementation checklist; Slice 1A.6 draft cadence profiling passed, held Thai burst still RISK
Created: 2026-06-08

Use this checklist before changing paragraph typing, click-to-caret, Enter, or
Backspace behavior in the WYSIWYG text-engine lane. The goal is to make normal
paragraph editing feel natural without weakening document model, pagination,
undo/redo, export, or edit lifecycle guarantees.

Read with:

- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md`
- `docs/TEST_STRATEGY.md`
- `docs/agent/REVIEW_GATE.md`

## Scope

This document is paragraph-first. It covers:

- clicking a body paragraph and placing the caret
- typing printable text and Space
- normal Backspace/Delete inside a paragraph
- Enter as paragraph text input or structural split, depending on the active
  lane
- Backspace at paragraph start as structural merge/delete
- parent draft sync, active paragraph measurement, draft pagination, and commit
  handoff around those actions

Out of scope for the first patch slice:

- document schema changes
- export renderer behavior
- server/API pagination semantics
- broad table-cell editing changes
- cross-fragment selection redesign
- production/default enablement of the text engine

## Evidence Map

| Area | Current owner/path | Evidence |
|---|---|---|
| Click eligibility and caret mapping | `EditorCanvas` decides single-click edit and resolves caret from pointer geometry. | `src/app/editor/_components/EditorCanvas.tsx:128`, `src/app/editor/_components/EditorCanvas.tsx:1372`, `src/app/editor/_components/EditorCanvas.tsx:2805` |
| Click lifecycle | Canvas stores `clickAction`; pointer-up may start edit immediately for simple body paragraphs or defer until after selection paint. | `src/app/editor/_components/shell/useEditorCanvasInteractionActions.ts:429`, `src/app/editor/_components/shell/useEditorCanvasPointerController.ts:540`, `src/app/editor/_components/shell/useEditorInlineEditLifecycleController.ts:331`, `src/app/editor/_components/shell/useEditorInlineEditLifecycleController.ts:365` |
| Parent WYSIWYG draft handler | `EditorShell.handleWysiwygTextDraftChange` separates caret-only movement from text changes and schedules draft pagination only after text changes. | `src/app/editor/_components/EditorShell.tsx:667`, `src/app/editor/_components/EditorShell.tsx:695`, `src/app/editor/_components/EditorShell.tsx:705`, `src/app/editor/_components/EditorShell.tsx:770` |
| Parent draft sync scheduler | `useWysiwygDraftSyncScheduler` keeps only the latest pending payload and delays parent sync by a quiet window unless an immediate flush is requested. | `src/app/editor/_components/useWysiwygDraftSyncScheduler.ts:15`, `src/app/editor/_components/useWysiwygDraftSyncScheduler.ts:38`, `src/app/editor/_components/useWysiwygDraftSyncScheduler.ts:56` |
| Native visible/input layer | `WysiwygNativeEditLayer` handles native input, selection, composition, and boundary structural keys. | `src/app/editor/_components/WysiwygNativeEditLayer.tsx:257`, `src/app/editor/_components/WysiwygNativeEditLayer.tsx:287`, `src/app/editor/_components/WysiwygNativeEditLayer.tsx:314`, `src/app/editor/_components/WysiwygNativeEditLayer.tsx:353` |
| FlowDoc draft-line path | Plain body paragraphs may route through FlowDoc draft lines while the textarea acts as an input bridge. | `src/app/editor/_components/ParagraphTextSurfaceImpl.tsx:243`, `src/app/editor/_components/ParagraphTextSurfaceImpl.tsx:514`, `src/app/editor/_components/useWysiwygFlowdocDraftVisualState.ts:64` |
| Active paragraph measurement | FlowDoc draft-line path measures the active paragraph with `measureParagraph`, emitting profiled `text-engine-draft-measure` sub-costs when tracing is enabled. | `src/app/editor/_components/wysiwygDraftParagraphLayout.ts:98`, `src/app/editor/_components/wysiwygDraftParagraphLayout.ts:321`, `src/app/editor/_components/wysiwygDraftParagraphLayout.ts:326` |
| Draft pagination lane | `useWysiwygDraftPaginationController` builds a draft preview document, paginates it, version-checks it, then applies shell mutations. | `src/app/editor/_components/shell/useWysiwygDraftPaginationController.ts:150`, `src/app/editor/_components/shell/useWysiwygDraftPaginationController.ts:203`, `src/app/editor/_components/shell/useWysiwygDraftPaginationController.ts:219`, `src/app/editor/_components/shell/useWysiwygDraftPaginationController.ts:323` |
| Structural split/merge | Structural Enter/Backspace uses optimistic pagination and a `flushSync` transition to keep focus on the new/merged paragraph. | `src/app/editor/_components/shell/useEditorOptimisticStructuralRefocusController.ts:286`, `src/app/editor/_components/shell/useEditorOptimisticStructuralRefocusController.ts:341`, `src/app/editor/_components/shell/useEditorOptimisticStructuralRefocusController.ts:618`, `src/app/editor/_components/shell/useEditorOptimisticStructuralRefocusController.ts:667` |
| Commit/finalize | Inline edit finalize replaces paragraph text, chooses responsive or settled pagination, commits one edit history entry, and clears draft state. | `src/app/editor/_components/shell/useEditorInlineEditLifecycleController.ts:181`, `src/app/editor/_components/shell/useEditorInlineEditLifecycleController.ts:207`, `src/app/editor/_components/shell/useEditorInlineEditLifecycleController.ts:420` |
| Perf evidence | WYSIWYG perf trace records parent draft updates, draft pagination, native geometry sync, active paragraph measurement, canvas commits, and structural events. | `src/app/editor/_components/wysiwygPerformance.ts:8`, `src/app/editor/_components/shell/useEditorPerfTraceController.ts:61` |

## Current Review Status

PASS:

- [x] Caret-only changes are separated from text-changing draft updates in
  `handleWysiwygTextDraftChange`.
- [x] Parent draft sync has a latest-only quiet-window scheduler.
- [x] Draft pagination is a separate lane from direct native input.
- [x] Structural Enter/Backspace is already separated from normal character
  Backspace/Delete.
- [x] The smoothness probe already tracks the key metrics needed for this work.

RISK:

- [ ] The contract says active text-only typing should use the native edit
  layer as the single visual truth, but current code/tests also support a
  FlowDoc draft-line path for plain body paragraphs.
- [ ] Active paragraph measurement is not full pagination, but it can still be
  on the hot path when FlowDoc draft lines are active.
- [ ] `editor-canvas-react-commit` has been a known longest event in selection
  probe evidence; paragraph typing should verify this does not reappear as the
  dominant cost.
- [ ] Stress fixture `wrap-typing` keeps paint latency acceptable but still
  records over-budget `editor-canvas-react-commit` work. Treat this as the
  first optimization target unless a narrower repro disproves it.
- [ ] Structural split/merge uses `flushSync`; optimize this separately from
  normal typing.
- [ ] Manual retest after Slice 1A reports held Thai typing still stalls near
  the beginning of a burst, live reflow does not keep up during the interruption,
  and pointer drag selection is not smooth enough.

UNKNOWN:

- [x] Current local smoothness baseline has been rerun for this checklist on
  bundled Chromium through `SMOKE_BASE_URL=http://localhost:4000/editor`.
- [x] Current cost distribution was sampled for typing, delete, and
  wrap-typing modes. Active FlowDoc draft measurement and canvas commit are the
  main observed work signals.
- [x] `Mock FlowDoc Stress Thai Document` was sampled with target `p_00114` on
  page index 14.
- [ ] Real Windows Thai IME behavior is not covered by the smoothness probe.

## Browser Probe Evidence - 2026-06-08

Environment:

- Dev server started with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`,
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`, and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1`.
- Probe used `SMOKE_BASE_URL=http://localhost:4000/editor`.
- The direct `npm.cmd run smoke:wysiwyg-smoothness` server-spawn path failed
  once with `Next dev server exited before probe URL was ready`; manual
  `dev:wysiwyg` and direct port 4017 startup both reached Next ready state.
  Current evidence therefore uses the controlled external-server path.

| Mode | Result | Paint | Main perf signals | Notes |
|---|---|---|---|---|
| `typing`, 400 keys at 30ms | PASS (`ok=true`) | p50 19.3ms, p95 30.0ms, p99 33.0ms, max 42.5ms | `browser-preview-pagination=1`, `editor-canvas-react-commit=5`, canvas commit max 58.8ms | Active visual mode was `flowdoc-draft-editor-island`; page boundary crossed 1 to 2 fragments. |
| `delete`, 120 keys at 0ms | RISK (`ok=false`) | p95 29.5-30.3ms, p99 30.8ms, max 40.9ms | `browser-preview-pagination=2`, `text-engine-draft-measure=242`, `editor-canvas-react-commit=13`, longest event 51.8-59.4ms | Visual typing flags were stable, console/page errors were 0. Failure came from pointer/selection/clipboard sub-gates after the delete burst, not from paint latency. |
| `wrap-typing`, 160 keys at 0ms | PASS (`ok=true`) | p50 19.6ms, p95 31.2ms, p99 40.7ms, max 75.2ms | `browser-preview-pagination=1`, `text-engine-draft-measure=358`, `editor-canvas-react-commit=13`, longest event `editor-canvas-react-commit` 50.6ms | Active visual mode was `flowdoc-draft-editor-island`; page boundary crossed. |

Interpretation:

- [x] Normal typing and wrap typing are not currently blocked by paint latency
  in the sampled fixture.
- [x] Current active paragraph visual mode is FlowDoc draft island, not the
  native-visible practical lane.
- [x] Active paragraph measurement is frequent in the FlowDoc draft island lane.
- [x] Full browser preview pagination appears in the overall report after the
  settled debounce window. A follow-up patch should distinguish settled
  pagination from immediate input-lane pagination in reporting.
- [ ] Delete mode needs a follow-up diagnosis for pointer/selection/clipboard
  sub-gates after the delete burst.

## Stress Thai Fixture Probe Evidence - 2026-06-08

Fixture:

- `public/mock/flowdoc-mock-manifest.json` identifies
  `flowdoc-stress-mock.flowdoc.json` as `Mock FlowDoc Stress Thai Document`.
- Manifest size/counts: 4,725,394 bytes, 1,297 body children, 1,442 nodes, Thai
  text present.
- `docs/WYSIWYG_SMOOTHNESS_PROBE.md` names the stress target:
  `FLOWDOC_PROBE_FILE=public/mock/flowdoc-stress-mock.flowdoc.json`,
  `PROBE_TARGET_NODE_ID=p_00114`, `PROBE_TARGET_PAGE_INDEX=14`.

Environment:

- Dev server started per mode with `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`,
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`,
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_RICH_TEXT_DRAFT=1`, and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1`.
- Probe used `SMOKE_BASE_URL=http://localhost:4018/editor`.
- The persistent external-server path cannot be kept across shell commands in
  this sandbox, so each mode used a temporary in-command dev server and then
  stopped it.

| Mode | Result | Paint | Main perf signals | Notes |
|---|---|---|---|---|
| `typing`, 400 keys at 30ms | PASS (`ok=true`) | p50 12.8ms, p95 32.0ms, p99 33.2ms, max 34.2ms | `browser-preview-pagination=0`, `text-engine-draft-measure=542`, `editor-canvas-react-commit=14`, over-frame events 40, jank 0, longest event `editor-canvas-react-commit` 74.1ms | No immediate full preview pagination at the stress target. Page boundary did not cross in this run. |
| `wrap-typing`, 160 keys at 0ms | RISK (`ok=true`) | p50 11.3ms, p95 29.7ms, p99 32.4ms, max 32.9ms | `browser-preview-pagination=0`, `text-engine-draft-measure=354`, `editor-canvas-react-commit=18`, over-frame events 63, jank 2, longest event `editor-canvas-react-commit` 188.8ms | Paint stayed smooth, but the perf trace still shows commit work over the jank threshold. |
| `delete`, 120 keys at 0ms | PASS (`ok=true`) | p50 14.5ms, p95 31.5ms, p99 32.5ms, max 33.5ms | `browser-preview-pagination=0`, `text-engine-draft-measure=274`, `editor-canvas-react-commit=11`, over-frame events 24, jank 0, longest event `flowdoc-island-visible-lines` 45.5ms | Stress delete did not reproduce the default-fixture delete sub-gate failure. |

Interpretation:

- [x] The stress Thai fixture is now the primary baseline for paragraph typing
  smoothness work.
- [x] At `p_00114`, immediate typing, wrap typing, and delete did not trigger
  `browser-preview-pagination`.
- [x] Paint latency stayed below the documented jank threshold for all three
  stress modes.
- [ ] `wrap-typing` still needs optimization or narrower diagnosis because
  `editor-canvas-react-commit` reached 188.8ms even though the next paint stayed
  acceptable.
- [ ] This target did not cross a page boundary. Run a separate stress
  page-boundary target before changing page-split, page-follow, or structural
  Enter behavior.

## Stress Boundary Target Evidence - 2026-06-08

DOM scan:

- Scanner loaded `public/mock/flowdoc-stress-mock.flowdoc.json` in Chromium,
  scrolled pages 12-18, and ranked inline-editable body paragraphs by distance
  from the bottom of their page frame.
- `p_00104`, page index 12: single fragment, first line fragment, bottom is
  about 56.1px from the page frame bottom. Use this as the near-bottom boundary
  handoff target.
- `p_00132`, page index 14: already split across 2 fragments, first fragment
  bottom is about 60.2px from the page frame bottom. Use this as the existing
  continuation edit target.
- Other already-split candidates found in the same scan include `p_00114`,
  `p_00156`, and `p_00191`.

| Target | Mode | Result | Paint | Main perf signals | Boundary notes |
|---|---|---|---|---|---|
| `p_00104`, page 12 | `wrap-typing`, 160 keys at 0ms | PASS (`ok=true`) | p50 14.0ms, p95 28.2ms, p99 31.5ms, max 33.5ms | `browser-preview-pagination=0`, `text-engine-draft-measure=350`, `editor-canvas-react-commit=19`, over-frame events 39, jank 0, longest event `flowdoc-island-visible-lines` 65.4ms | Fragment count stayed 1 -> 1, but `pageBoundaryPreviewDetected`, `hardBoundaryReflowDetected`, and `boundaryHeightHandoffDetected` were true. |
| `p_00104`, page 12 | `typing`, 400 keys at 30ms | PASS (`ok=true`) | p50 13.6ms, p95 23.8ms, p99 31.6ms, max 63.2ms | `browser-preview-pagination=0`, `text-engine-draft-measure=559`, `editor-canvas-react-commit=7`, over-frame events 7, jank 0, longest event `editor-canvas-react-commit` 65.5ms | Fragment count stayed 1 -> 1, but boundary preview, hard reflow, and height handoff were true. |
| `p_00104`, page 12 | `enter`, 30 keys at 0ms | RISK (`ok=true`) | p50 19.6ms, p95 28.7ms, p99 28.8ms, max 31.4ms | `browser-preview-pagination=0`, `text-engine-draft-measure=12`, `editor-canvas-react-commit=18`, over-frame events 102, jank 96, longest event `flowdoc-preview-settle-runtime` 865.0ms | Fragment count stayed 1 -> 1 and boundary flags stayed false. Treat Enter/newline growth as a separate risk from normal typing. |
| `p_00132`, page 14 | `wrap-typing`, 160 keys at 0ms | RISK (`ok=true`) | p50 17.0ms, p95 27.6ms, p99 31.8ms, max 116.1ms | `browser-preview-pagination=0`, `text-engine-draft-measure=354`, `editor-canvas-react-commit=13`, over-frame events 12, jank 0, longest event `editor-canvas-react-commit` 32.2ms | Existing continuation stayed 2 -> 2 fragments, with boundary preview, hard reflow, and height handoff true. |

Interpretation:

- [x] Stress boundary handoff is reproducible without immediate
  `browser-preview-pagination`.
- [x] `p_00104` is the best current near-bottom single-fragment target.
- [x] `p_00132` is the best current existing-continuation target near the
  primary stress page.
- [ ] A true automated 1 -> 2 fragment-count crossing target is still not found
  in the current stress probe runs. Do not claim page-boundary crossing PASS
  until a probe or manual browser run captures it.
- [ ] Enter/newline growth on `p_00104` shows high settle-runtime cost and
  should be handled in a separate patch slice from normal typing/wrap typing.

## Required Model Decision

Before code changes, decide and record which model is being protected for plain
body paragraph active typing. The current minimal patch decision is Model B
only for the next performance slice; this records the current implementation
target, not the final product architecture.

- [ ] Model A: native-visible practical lane.
  - The textarea/native edit layer owns visible text, caret, and selection
    during active typing.
  - FlowDoc measured output catches up after quiet windows, boundary events, or
    commit.
  - This matches the current stability-first wording in
    `EDITOR_UX_CONTRACT.md`.
- [x] Model B: FlowDoc draft-lines visual lane for the next minimal patch.
  - FlowDoc draft lines own visible text while the native textarea is an input
    bridge.
  - Active paragraph measurement is allowed, but must be bounded, cached,
    coalesced, and proven under smoothness probes.
  - This matches the current plain paragraph draft-lines test path.
  - Evidence: current active visual mode in probe evidence was
    `flowdoc-draft-editor-island`; code paths include
    `ParagraphTextSurfaceImpl.tsx`, `useWysiwygFlowdocDraftVisualState.ts`,
    `FlowdocDraftEditorIslandRoot.tsx`, and
    `wysiwygDraftParagraphLayout.ts`.

Do not mix both visual truths for the same active paragraph unless the fallback
rules are explicitly documented and tested.

## Next Patch Gate - Active Draft Measure/Render

Status: Slice 1A first implementation improved measured probes, but manual
held-input retest is still RISK; Slice 1A.2 partial patch is complete and
Slice 1A.3 is the next minimal target.

PASS:

- [x] Full browser preview pagination is not the observed immediate hot path for
  the stress typing/wrap/delete samples because stress runs recorded
  `browser-preview-pagination=0`.
- [x] Stress fixture targets are defined:
  - primary active paragraph: `p_00114`, page index 14
  - near-bottom boundary handoff: `p_00104`, page index 12
  - existing continuation edit: `p_00132`, page index 14
- [x] The patch must stay within the current FlowDoc draft-lines lane and must
  not switch the product to a different visual model.

RISK:

- [ ] `p_00114 wrap-typing` currently records longest
  `editor-canvas-react-commit` at 188.8ms.
- [ ] `p_00114 typing` and `p_00104 typing` record frequent
  `text-engine-draft-measure` work.
- [ ] `p_00132 wrap-typing` is an existing-continuation edit and currently has
  max paint 116.1ms even though p95 stays under threshold.

UNKNOWN:

- [ ] A true stress 1 -> 2 fragment-count crossing target is not captured yet.
- [ ] Real Windows Thai IME behavior remains outside this automated gate.

Minimal next patch:

- [x] Reduce unnecessary active draft measurement and active island render work
  for normal typing/wrap typing.
- [x] Keep local input immediate; do not add full-document draft pagination to
  the immediate input lane.
- [x] Keep document model, undo/redo, export, and server pagination semantics
  unchanged.
- [x] Do not include Enter/newline optimization in this patch; handle Enter as a
  separate slice because `p_00104 enter` showed `flowdoc-preview-settle-runtime`
  at 865.0ms.

Slice pass criteria:

- [x] `p_00114 typing`, `p_00114 wrap-typing`, and `p_00114 delete` all return
  `ok=true`.
- [x] `p_00104 wrap-typing`, `p_00104 typing`, and `p_00132 wrap-typing` all
  return `ok=true`.
- [x] `browser-preview-pagination` remains 0 in the immediate input lane for
  the stress typing/wrap/delete targets above.
- [x] Stress typing/wrap p95 paint stays below 33ms and p99 stays below 100ms.
- [x] `p_00114 wrap-typing` no longer records an
  `editor-canvas-react-commit` over 100ms, or the patch must be marked RISK with
  a narrower follow-up target.
- [x] `text-engine-draft-measure` and `editor-canvas-react-commit` counts do
  not increase versus the recorded baseline for the same target/mode.
- [ ] Held/no-wait Thai burst on `p_00114` and `p_00104` does not show an
  initial input stall over 100ms, keeps visible p95 near one to two frames, and
  keeps live reflow/selection feedback moving during the burst.

Files to inspect before patching:

- [x] `src/app/editor/_components/ParagraphTextSurfaceImpl.tsx`
- [x] `src/app/editor/_components/useWysiwygFlowdocDraftVisualState.ts`
- [x] `src/app/editor/_components/FlowdocDraftEditorIslandRoot.tsx`
- [x] `src/app/editor/_components/wysiwygDraftParagraphLayout.ts`
- [x] `src/app/editor/_components/shell/useEditorPerfTraceController.ts`

### Slice 1A Implementation Evidence - 2026-06-08

Patch:

- `src/app/editor/_components/FlowdocDraftEditorIslandRoot.tsx` now uses
  `buildCachedWysiwygDraftParagraphLayout` with
  `createWysiwygDraftParagraphLayoutCache` for the out-of-canvas draft island.
- This keeps the current FlowDoc draft-lines visual model and reduces repeated
  paragraph layout measurement for identical draft text/fragment/paragraph
  inputs across active island rerenders.
- No document model, undo/redo, export, or server pagination code was changed.

Stress probe result after patch:

| Target | Mode | Result | Paint | Main perf signals | Gate |
|---|---|---|---|---|---|
| `p_00114`, page 14 | `wrap-typing`, 160 keys at 0ms | PASS (`ok=true`) | p50 16.5ms, p95 30.5ms, p99 33.5ms, max 158.2ms | `browser-preview-pagination=0`, `text-engine-draft-measure=161`, `editor-canvas-react-commit=16`, longest `editor-canvas-react-commit` 30.1ms | PASS: prior longest canvas commit 188.8ms is resolved. |
| `p_00114`, page 14 | `typing`, 400 keys at 30ms | PASS (`ok=true`) | p50 15.7ms, p95 27.7ms, p99 32.9ms, max 53.8ms | `browser-preview-pagination=0`, `text-engine-draft-measure=328`, `editor-canvas-react-commit=4`, longest `editor-canvas-react-commit` 54.9ms | PASS |
| `p_00114`, page 14 | `delete`, 120 keys at 0ms | PASS (`ok=true`) | p50 16.0ms, p95 29.8ms, p99 32.5ms, max 33.8ms | `browser-preview-pagination=0`, `text-engine-draft-measure=58`, `editor-canvas-react-commit=5`, longest `editor-canvas-react-commit` 30.5ms | PASS |
| `p_00104`, page 12 | `wrap-typing`, 160 keys at 0ms | PASS (`ok=true`) | p50 16.5ms, p95 30.9ms, p99 32.8ms, max 51.1ms | `browser-preview-pagination=0`, `text-engine-draft-measure=161`, `editor-canvas-react-commit=13`, longest `flowdoc-island-visible-lines` 35.7ms | PASS |
| `p_00104`, page 12 | `typing`, 400 keys at 30ms | PASS (`ok=true`) | p50 15.2ms, p95 25.5ms, p99 30.8ms, max 57.5ms | `browser-preview-pagination=0`, `text-engine-draft-measure=327`, `editor-canvas-react-commit=6`, longest `editor-canvas-react-commit` 65.2ms | PASS |
| `p_00132`, page 14 | `wrap-typing`, 160 keys at 0ms | PASS (`ok=true`) | p50 15.2ms, p95 27.4ms, p99 30.8ms, max 32.2ms | `browser-preview-pagination=0`, `text-engine-draft-measure=161`, `editor-canvas-react-commit=10`, longest `editor-canvas-react-commit` 32.5ms | PASS: prior max paint 116.1ms is resolved. |

Residual risk:

- [ ] Manual retest after this patch reports the interaction is improved but
  still not acceptable under held/repeated Thai characters such as
  `พพพ...หหห...ฟฟฟ...`.
- [ ] `p_00114 wrap-typing` still recorded one max paint sample at 158.2ms,
  while p95/p99 stayed within gate. Keep this as RISK for future tuning, not a
  blocker for Slice 1A.
- [ ] `flowdoc-island-draft-measure` still records high counts because it
  includes cached layout lookup/render-path attribution, not only true
  `measureParagraph` misses. Use `text-engine-draft-measure` for true
  paragraph measurement count.
- [ ] Enter/newline is still out of scope for this slice.

### Slice 1A Manual/No-Wait Follow-Up Evidence - 2026-06-08

Manual retest:

- User reports Slice 1A is better but not passing. Held Thai typing still pauses
  near the start of a long burst before continuing, live reflow does not keep up
  while input is interrupted, and pointer drag selection still feels rough.

No-wait Thai burst probe before Slice 1A.2:

| Target | Mode | Result | Dispatch/visible latency | Frame gaps | Main perf signals | Gate |
|---|---|---|---|---|---|---|
| `p_00114`, page 14 | `no-wait-burst`, 220 Thai keys | PASS (`ok=true`) but RISK | dispatch p95 47.2ms, max 195.0ms; visible p95 47.8ms, max 195.1ms | p95 35.3ms, max 230.1ms; late frames 29, dropped frames 53 | `browser-preview-pagination=0`, `text-engine-draft-measure=221`, `flowdoc-island-draft-measure=474`, `flowdoc-island-react-commit=243`, `editor-canvas-react-commit=9` | RISK: automation `ok=true` is too loose for held input. |
| `p_00104`, page 12 | `no-wait-burst`, 220 Thai keys | PASS (`ok=true`) but RISK | dispatch p95 57.4ms, max 333.3ms; visible p95 59.1ms, max 368.3ms | p95 39.4ms, max 279.1ms; late frames 35, dropped frames 69 | `browser-preview-pagination=0`, `text-engine-draft-measure=221`, `flowdoc-island-draft-measure=472`, `flowdoc-island-react-commit=243`, `editor-canvas-react-commit=9` | RISK: boundary target shows visible stalls over the manual threshold. |

Interpretation:

- [x] The held-input issue is not caused by immediate full
  `browser-preview-pagination`; both no-wait runs recorded
  `browser-preview-pagination=0`.
- [x] `editor-canvas-react-commit` is no longer the dominant repeated hot path
  for these no-wait runs.
- [ ] The draft island still renders/measures too often during held input:
  `flowdoc-island-react-commit` was 243 and draft layout attribution was above
  470 for 220 key events.
- [ ] Direct draft island render coalescing per animation frame is not accepted
  unless visible native input owns immediate feedback. It reduced work but made
  held-input visible feedback slower in this slice.

### Slice 1A.2 Implementation Evidence - 2026-06-08

Patch:

- `src/app/editor/_components/EditorShell.tsx` now wraps
  `SET_INLINE_EDIT_HEIGHT` preview dispatch in `startTransition(...)`.
- This keeps the same preview state and reducer path, but lowers the priority of
  large-canvas height preview renders during active WYSIWYG typing.
- A direct draft-island `requestAnimationFrame` render coalescing attempt was
  tested and rejected in this slice because it made visible text feedback slower
  during held input.
- A draft-layout cache-key shortening attempt was tested and rejected because it
  did not improve the held-input gate enough to keep.

Stress probe result after patch:

| Target | Mode | Result | Paint / held latency | Main perf signals | Gate |
|---|---|---|---|---|---|
| `p_00114`, page 14 | `no-wait-burst`, 220 Thai keys | PASS (`ok=true`) but RISK | held visible p50 36.8ms, p95 58.8ms, p99 66.9ms, max 73.9ms; frame gap p95 37.1ms, max 52.6ms | `browser-preview-pagination=0`, `editorCanvasCommitMaxMs=31.3` | PARTIAL PASS: canvas stall reduced; held visible p95 is still above the desired one-to-two-frame feel. |
| `p_00104`, page 12 | `no-wait-burst`, 220 Thai keys | PASS (`ok=true`) but RISK | held visible p50 33.6ms, p95 60.9ms, p99 82.7ms, max 187.6ms; frame gap p95 35.8ms, max 274.5ms | `browser-preview-pagination=0`, `text-engine-draft-measure=221`, `flowdoc-island-draft-measure=482`, `flowdoc-island-react-commit=247`, `editorCanvasCommitMaxMs=33.4` | PARTIAL PASS: canvas stall reduced; draft island still measures/renders every key and has an outlier. |
| `p_00114`, page 14 | `wrap-typing`, 160 keys at 0ms | PASS (`ok=true`) but RISK | paint p50 12.8ms, p95 28.6ms, p99 33.3ms, max 101.2ms | `browser-preview-pagination=0`, `editorCanvasCommitMaxMs=44.3` | PASS for p95 paint, RISK for max/total key outliers. |
| `p_00132`, page 14 | `wrap-typing`, 160 keys at 0ms | PASS (`ok=true`) but RISK | paint p50 14.0ms, p95 32.1ms, p99 69.7ms, max 378.7ms | `browser-preview-pagination=0`, `editorCanvasCommitMaxMs=40.5` | RISK: continuation target still has outliers outside the canvas-height path. |

Interpretation:

- [x] `SET_INLINE_EDIT_HEIGHT` preview rendering was a real contributor to
  large-document input stalls. After transition scheduling, editor canvas commit
  max stayed around 26-44ms in the sampled stress targets instead of the
  previous 145ms+ large-doc canvas commits.
- [x] No sampled run triggered immediate `browser-preview-pagination`.
- [ ] Held/no-wait Thai typing still does not meet the final smoothness goal.
  The remaining hot path is FlowDoc draft island measurement/render cadence:
  `p_00104 no-wait-burst` still recorded `text-engine-draft-measure=221` and
  `flowdoc-island-react-commit=247` for 220 key events.
- [ ] Slice 1A.3 visual-tail measurement was tested and rejected for the Thai
  stress target. Do not repeat this exact tail-substring approach unless the
  text-width/segmentation cache-miss problem is solved first.

### Slice 1A.3 Dirty-Zone Decision - 2026-06-08

Decision:

- [x] Keep the current FlowDoc draft-lines visual lane for this slice.
- [x] Optimize the scope of active paragraph measurement before changing which
  layer owns visible text.
- [x] Test whether the dirty zone can be treated as the earliest visual line
  touched by the current draft text change, reusing cached head lines before
  that visual line.
- [x] Reject wiring that visual-tail path into runtime for the Thai stress
  document because the measured no-wait gate regressed.
- [ ] A future dirty-zone patch must address text-width/segmentation cache
  behavior, not only reduce the number of measured visual lines.

Tested design:

- Treat the dirty zone as the earliest visual line touched by the current
  draft text change, then reuse cached head lines before that visual line.
- Re-measure only the visual tail from the dirty line through the end of the
  active paragraph when geometry, render props, node style, list body geometry,
  and measurer are unchanged.

PASS:

- [x] The current code has a paragraph-local cache entry point in
  `buildCachedWysiwygDraftParagraphLayout(...)`.
- [x] The current full-measure path is isolated in
  `buildWysiwygDraftParagraphLayout(...)`, which calls
  `measureParagraph(...)`.
- [x] Core already has incremental measurement primitives in
  `measureParagraphFrom(...)`, but that helper is hard-line based and is not
  sufficient by itself for the repeated-Thai visual-line burst.
- [x] Draft-measure profiling now separates `measureText`,
  `measureLineHeight`, `wordBreaker.segment`, and residual wrap/build cost
  without changing layout output or storing paragraph text in the trace.

FAIL / BLOCKER:

- [x] Runtime visual-tail measurement reduced full paragraph measurement
  (`text-engine-draft-measure`) from about 221 events to 1 event on
  `p_00114 no-wait-burst`, but it introduced about 220
  `text-engine-draft-tail-measure` events and worsened held visible latency to
  about p95 71-76ms in the sampled runs.
- [x] A Thai grapheme pre-split attempt also regressed the same target
  (sampled p95 about 81-84ms) because it widened the split behavior beyond the
  actual repeated burst tail.
- [x] Both runtime changes were removed from the retained patch.
- [x] After removing those runtime experiments, `p_00114 no-wait-burst` on the
  existing `localhost:4000` server returned to the full-measure path
  (`text-engine-draft-measure=221`, no `text-engine-draft-tail-measure`,
  `browser-preview-pagination=0`) but still sampled held visible p95 around
  76.2ms. Treat that run as RISK/noise evidence, not a new PASS.

Slice 1A.4 instrumentation evidence:

| Target | Mode | Verdict | Paint latency | Full pagination | Draft measure breakdown | Draft island/render signal | Notes |
|---|---|---|---|---|---|---|---|
| `p_00114`, page 14 | `no-wait-burst`, 220 Thai keys | PASS instrumentation, RISK smoothness | p50 34.1ms, p95 65.4ms, p99 77.4ms, max 81.9ms | `browser-preview-pagination=0` | `text-engine-draft-measure=221`, total 484.9ms; `measureText` 213.9ms, segmentation 72.0ms, residual 198.1ms | `flowdoc-island-visible-lines=235`, total 1631.9ms, p95 13.0ms, max 29.6ms; `editor-canvas-react-commit=8`, max 48.1ms | `draftMeasureBreakdown.profiledCount=221`, console/page errors 0. |
| `p_00104`, page 12 | `no-wait-burst`, 220 Thai keys | PASS instrumentation, FAIL/RISK smoothness | p50 47.3ms, p95 81.5ms, p99 103.2ms, max 130.9ms | `browser-preview-pagination=0` | `text-engine-draft-measure=221`, total 622.4ms; `measureText` 277.0ms, segmentation 94.8ms, residual 249.6ms | `flowdoc-island-visible-lines=232`, total 1983.2ms, p95 17.2ms, max 56.1ms; `editor-canvas-react-commit=12`, max 31.9ms | Longest event was `flowdoc-island-visible-lines` at 56.1ms; console/page errors 0. |

PASS:

- [x] `draftMeasureBreakdown` is present for every
  `text-engine-draft-measure` event in the two no-wait stress runs.
- [x] The profile records scalar counts/durations only; the focused app test
  verifies draft text is not written to `window.__flowDocWysiwygPerfEvents`.

FAIL / BLOCKER:

- [x] `p_00104 no-wait-burst` still exceeds the held-input smoothness target
  (`paintLatencyMs.p95=81.5ms`, `paintLatencyMs.p99=103.2ms`) even with full
  browser pagination absent.

Slice 1A.5 draft scope evidence:

| Target | Mode | Verdict | Paint latency | Fragment/surface scope | Fragment split cost | Notes |
|---|---|---|---|---|---|---|
| `p_00114`, page 14 | `no-wait-burst`, 220 Thai keys | PASS instrumentation, RISK smoothness | p50 29.8ms, p95 63.1ms, p99 68.2ms, max 185.4ms | visible-lines max 2 fragments, 2 pages, 2 surfaces, 0 missing surfaces; page indexes `13,14` | `flowdoc-island-fragment-split=474`, total 4.4ms, p95 0.1ms, max 0.2ms; candidate page array max 227 | Scope is already near caret/visible output; split cost is not the main bottleneck. |
| `p_00104`, page 12 | `no-wait-burst`, 220 Thai keys | PASS instrumentation, FAIL/RISK smoothness | p50 39.8ms, p95 86.8ms, p99 106.4ms, max 562.7ms | visible-lines max 2 fragments, 2 pages, 2 surfaces, 0 missing surfaces; page indexes `12,13` | `flowdoc-island-fragment-split=478`, total 6.4ms, p95 0.1ms, max 0.1ms; candidate page array max 227 | Longest event was `editor-canvas-react-commit` at 86.1ms; visible scope is not exploding. |

PASS:

- [x] The current draft island preview does not expand the active paragraph into
  many visible surfaces for these held Thai targets; it stays at 2 pages /
  2 surfaces.
- [x] `splitWysiwygDraftVisualFragments(...)` receives the full pages array but
  exits after placing the active draft lines; measured split cost is tiny in
  these runs.

FAIL / BLOCKER:

- [x] The held Thai burst remains over the smoothness target even when draft
  visible scope is only 2 pages.

Slice 1A.6 draft cadence/cache evidence:

| Target | Mode | Verdict | Cadence | Draft measure cache | Full measure breakdown | Notes |
|---|---|---|---|---|---|---|
| `p_00114`, page 14 | `no-wait-burst`, 220 Thai keys | PASS cadence attribution, RISK smoothness | input 235, draft measure 474 (2.02/input), split 474 (2.02/input), visible-lines 235 (1.00/input), commits 246 (1.05/input), unique draft versions 235 | cache hits 253 total 28.7ms; cache misses 221 total 971.9ms | `text-engine-draft-measure=221`, total 894.1ms; `measureText` 391.9ms, segmentation 129.6ms, residual 371.6ms | Extra draft-measure/split events are mostly cheap cache-hit render attempts; full measurement still runs roughly once per key. |
| `p_00104`, page 12 | `no-wait-burst`, 220 Thai keys | PASS cadence attribution, FAIL/RISK smoothness | input 229, draft measure 486 (2.12/input), split 486 (2.12/input), visible-lines 230 (1.00/input), commits 246 (1.07/input), unique draft versions 229-230 | cache hits 267 total 16.5ms; cache misses 219 total 632.4ms | `text-engine-draft-measure=219`, total 585.2ms; `measureText` 262.3ms, segmentation 86.5ms, residual 235.4ms | Cache hits explain the doubled island count, but not the held-input stall. |

PASS:

- [x] The doubled `flowdoc-island-draft-measure` /
  `flowdoc-island-fragment-split` counts are now attributed: the extra events
  are mostly cache hits and render attempts, not full paragraph remeasurement.

FAIL / BLOCKER:

- [x] Full draft measurement still runs roughly once per keypress on the held
  Thai target, and p95 paint remains far above the smoothness target.

Slice 1A.7 grapheme width cache evidence:

| Target | Mode | Verdict | Paint latency | Draft measure cache | Full measure breakdown | Draft island/render signal | Notes |
|---|---|---|---|---|---|---|---|
| `p_00114`, page 14 | `no-wait-burst`, held Thai keys | PASS call-count reduction, FAIL/RISK smoothness | p50 71.7ms, p95 245.9ms, p99 644.1ms, max 1039.8ms | cache hits 237 total 32.1ms; cache misses 205 total 1240.9ms | `text-engine-draft-measure=205`; `measureText.callCount=38289`, total 517.9ms; segmentation 160.1ms; residual 457.2ms | `flowdoc-island-visible-lines=220`, total 4153.3ms, p95 42.6ms, max 189.3ms; `editor-canvas-react-commit=33`, max 158.1ms | `browser-preview-pagination=0`; visible scope still max 2 pages / 2 surfaces; console/page errors 0. |
| `p_00104`, page 12 | `no-wait-burst`, held Thai keys | PASS call-count reduction, FAIL/RISK smoothness | p50 63.6ms, p95 133.2ms, p99 355.9ms, max 713.4ms | cache hits 242 total 28.8ms; cache misses 210 total 817.5ms | `text-engine-draft-measure=210`; `measureText.callCount=39214`, total 311.4ms; segmentation 114.3ms; residual 306.9ms | `flowdoc-island-visible-lines=222`, total 2978.0ms, p95 24.0ms, max 163.4ms; `editor-canvas-react-commit=27`, max 242.9ms | `browser-preview-pagination=0`; longest event was `editor-canvas-react-commit`; console/page errors 0. |

PASS:

- [x] `splitSourceSegmentToGraphemes(...)` now reuses a measured width for
  repeated identical graphemes inside one source segment, and the focused core
  test verifies repeated Thai `ห` is measured once while preserving the joined
  line text and grapheme fallback segments.
- [x] The change does not alter document schema, browser/server pagination
  ownership, undo/redo lifecycle, or export behavior.

FAIL / BLOCKER:

- [x] The measured call-count reduction did not make the held Thai burst pass
  the no-wait smoothness gate. In the sampled runs, p95/p99 paint latency
  worsened and long events shifted to visible-line work and React commits.
- [x] Treat this as a retained micro-optimization candidate only, not an
  accepted smoothness fix.

Slice 1A.8 parent-sync and boundary height handoff evidence:

| Target | Mode | Verdict | Paint latency | Input island signal | Parent/canvas signal | Draft measure breakdown | Notes |
|---|---|---|---|---|---|---|---|
| `p_00114`, page 14 | `no-wait-burst`, held Thai keys | PASS hot-path attribution, FAIL/RISK smoothness | p50 42.7ms, p95 62.5ms, p99 80.4ms, max 413.6ms | input 235; draft measure 474; visible-lines p95 9.5ms, max 66.5ms; island React commit p95 0.3ms, max 0.7ms | parent sync 1, scheduled delay 240ms; `editor-canvas-react-commit=11`, p95 50.6ms, max 62.4ms; boundary height handoff count 1 | `text-engine-draft-measure=221`; `measureText.callCount=41021`, total 135.4ms; segmentation 59.5ms; residual 142.5ms | `browser-preview-pagination=0`; visible scope max 2 pages / 2 surfaces; console/page errors 0. |
| `p_00104`, page 12 | `no-wait-burst`, held Thai keys | PASS hot-path attribution, FAIL/RISK smoothness | p50 42.1ms, p95 63.1ms, p99 81.7ms, max 132.2ms | input 232; draft measure 470; visible-lines p95 8.3ms, max 34.4ms; island React commit p95 0.2ms, max 1.0ms | parent sync 1, scheduled delay 240ms; `editor-canvas-react-commit=9`, p95 30.1ms, max 67.8ms; boundary height handoff count 1 | `text-engine-draft-measure=221`; `measureText.callCount=41021`, total 139.4ms; segmentation 58.3ms; residual 148.6ms | `browser-preview-pagination=0`; visible scope max 2 pages / 2 surfaces; console/page errors 0. |

PASS:

- [x] Text-changing draft island input now uses a longer parent-sync debounce
  than caret-only/pointer selection updates. Blur, outside pointerdown,
  keyboard exit, and structural Enter/Backspace still flush through their
  explicit paths.
- [x] Plain paragraph hard-page-boundary height preview handoff is coalesced by
  a short delay before dispatching to the parent canvas lane. The final smoke
  runs kept `pageBreakOverlapDetected=false`.
- [x] The final `p_00104` run reduced the worst sampled paint stall from the
  previous parent-sync-only run's 660.0ms max to 132.2ms max.

FAIL / BLOCKER:

- [x] Both final no-wait held Thai runs still miss the smoothness gate at p95
  (`62.5ms` and `63.1ms`). This is not a PASS for user-perceived typing.
- [x] Full draft measurement still runs once per text version
  (`text-engine-draft-measure=221`) and the island still records roughly two
  draft-measure attempts per input because cached render attempts remain.

RISK:

- [ ] Visual-line tail reuse must fall back to full paragraph measurement when
  the dirty line is the first visual line, when segment offsets are missing, or
  when paragraph alignment/style/geometry compatibility is not proven.
- [ ] Thai dictionary segmentation can depend on context. The patch must compare
  incremental output against full measurement in focused tests before accepting
  it.
- [ ] Reducing measured line scope does not by itself reduce the number of React
  commits in the draft island.
- [ ] Tail substring measurement can create fresh text-width/segmentation work
  on every key even when it avoids full paragraph measurement.
- [ ] The 120ms boundary-height handoff delay is safe only while the island
  remains the visible active paragraph owner and page-break overlap remains
  false in browser smoke.

Minimal next patch:

- [x] Record the visual-tail and grapheme pre-split experiments as rejected for
  the current Thai stress target.
- [x] Add narrower instrumentation for text-width and segmentation cache
  pressure inside active draft measurement before attempting another dirty-zone
  runtime patch.
- [x] Use `perfEvents.draftMeasureBreakdown` on `p_00114` and `p_00104`
  `no-wait-burst` runs to decide whether the next patch should target
  text-width caching, segmentation caching, residual wrap/build cost, or
  draft-island render cadence.
- [ ] Investigate `flowdoc-island-visible-lines` cadence/cost before another
  dirty-zone runtime patch; both no-wait targets show visible-line work totals
  larger than `text-engine-draft-measure` totals.
- [x] Investigate why `flowdoc-island-draft-measure` and
  `flowdoc-island-fragment-split` record about twice as many events as
  visible input events in dev stress runs before treating page scope as the
  primary issue.
- [x] Investigate text-width caching only as a measured sub-patch; the grapheme
  width cache reduced repeated `measureText` calls but did not pass the
  smoothness gate, so it is not sufficient by itself.
- [ ] Consider a segment/glyph-level cache strategy or draft-island render
  cadence reduction before retrying visual-tail layout.
- [ ] Investigate the remaining `editor-canvas-react-commit` events during the
  out-of-canvas island burst; browser pagination and text parent-sync are no
  longer the observed immediate bottleneck in Slice 1A.8.
- [ ] Decide whether the next real smoothness slice should switch the active
  text-only island to the native visible text baseline from
  `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`, or keep FlowDoc-owned SVG draft lines and
  implement a true incremental visual-line layout cache.
- [ ] Keep the retained code patch limited to the already-tested cached draft
  layout and low-priority inline-height dispatch until a new measured approach
  passes the no-wait gate.

Tests run:

- [x] `npm.cmd run test -w packages/core -- src/layout/__tests__/measure.test.ts`
- [x] `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- [x] `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`
- [x] `npm.cmd run type-check`
- [x] `node --check scripts/wysiwyg-smoothness-probe.mjs`
- [x] `git diff --check`
- [x] `p_00114 no-wait-burst`, 220 Thai keys, stress mock via
  `SMOKE_BASE_URL=http://localhost:4000/editor`
- [x] `p_00104 no-wait-burst`, 220 Thai keys, stress mock via
  `SMOKE_BASE_URL=http://localhost:4000/editor`
- [x] `p_00114 no-wait-burst`, 220 Thai keys, stress mock via
  `SMOKE_BASE_URL=http://localhost:4017/editor` with draft scope profiling
- [x] `p_00104 no-wait-burst`, 220 Thai keys, stress mock via
  `SMOKE_BASE_URL=http://localhost:4017/editor` with draft scope profiling
- [x] `p_00114 no-wait-burst`, 220 Thai keys, stress mock via
  `SMOKE_BASE_URL=http://localhost:4017/editor` with draft cadence/cache
  profiling
- [x] `p_00104 no-wait-burst`, 220 Thai keys, stress mock via
  `SMOKE_BASE_URL=http://localhost:4017/editor` with draft cadence/cache
  profiling
- [x] `p_00114 no-wait-burst`, held Thai keys, stress mock via
  `SMOKE_BASE_URL=http://localhost:4017/editor` with grapheme width cache
- [x] `p_00104 no-wait-burst`, held Thai keys, stress mock via
  `SMOKE_BASE_URL=http://localhost:4017/editor` with grapheme width cache
- [x] `p_00114 no-wait-burst`, held Thai keys, stress mock via
  `SMOKE_BASE_URL=http://localhost:4018/editor` with text parent-sync debounce
  and boundary height handoff delay
- [x] `p_00104 no-wait-burst`, held Thai keys, stress mock via
  `SMOKE_BASE_URL=http://localhost:4018/editor` with text parent-sync debounce
  and boundary height handoff delay

## Critical Input Lane Checklist

For normal typing, Space repeat, Backspace/Delete repeat, and composition:

- [ ] Native input appears in the active paragraph before parent draft sync,
  paragraph measurement, or pagination is required.
- [ ] No full document/browser preview pagination runs in the immediate input
  lane.
- [ ] Parent draft sync keeps only the latest text/caret/selection payload.
- [ ] Parent draft sync flushes before blur, Escape, toolbar focus, rich-text
  shortcut handling, history shortcut handling, structural Enter/Backspace, and
  unmount cleanup.
- [ ] Caret-only movements do not dirty document state and do not schedule draft
  pagination.
- [ ] Text-changing updates do not create undo history until the edit session is
  finalized.
- [ ] IME/composition events do not trigger structural split/merge or stale
  parent sync.
- [ ] Native geometry sync reads textarea height after visible input feedback;
  height changes update editor chrome only when height actually changes.
- [ ] Active paragraph measurement, when used, is paragraph-local and traced as
  `text-engine-draft-measure`, not confused with `browser-preview-pagination`.
- [ ] React canvas commits during typing are measured and kept below the
  smoothness budget.

## Click-To-Caret Checklist

- [ ] Pointer hit testing uses measured line/segment geometry, not document
  mutation.
- [ ] Single-click edit start does not trigger unnecessary full repagination.
- [ ] Simple body paragraphs may start edit immediately only when the fragment is
  eligible and not inside table/flow-stack/row-stack containers.
- [ ] Complex paragraphs defer start until selection paint without committing a
  stale inline edit too early.
- [ ] Click-to-caret latency is measured separately from keypress latency.
- [ ] Second click on the same active paragraph moves the caret without remounting
  the edit layer or overwriting a newer local draft.

## Enter Checklist

Classify Enter before patching:

- [ ] Plain text newline inside the active text lane.
- [ ] Structural paragraph split.
- [ ] List item exit/split.
- [ ] Continuation fragment Enter.
- [ ] Table-cell-specific Enter behavior.

For structural Enter:

- [ ] The latest pending draft text is flushed or passed into the structural
  operation.
- [ ] Structural guard blocks repeated Enter while a split is in flight.
- [ ] Split creates one intentional history entry.
- [ ] Optimistic pagination is limited to the structural refocus path.
- [ ] The active edit layer remains focused after split.
- [ ] Full pagination settles later without overwriting newer draft state.

## Backspace Checklist

Classify Backspace before patching:

- [ ] Normal character deletion inside paragraph text.
- [ ] Selection deletion.
- [ ] Backspace at caret 0 in a body paragraph.
- [ ] Backspace at caret 0 in a list item.
- [ ] Backspace at continuation slice start.
- [ ] Table-cell boundary Backspace.

For normal deletion:

- [ ] It stays in the critical input lane.
- [ ] It does not run structural merge/delete.
- [ ] It does not create history while the edit session is active.

For structural Backspace:

- [ ] It runs only when the selection is collapsed at the true paragraph start
  or the specific continuation boundary rule applies.
- [ ] It passes latest draft text into merge/delete.
- [ ] It uses structural guard to avoid repeated merge/delete while in flight.
- [ ] It keeps focus on the resulting paragraph when possible.
- [ ] Table-cell boundary Backspace does not call the body paragraph merge path.

## Pagination And Settle Checklist

- [ ] Browser preview pagination is only a preview lane, not document truth.
- [ ] Draft pagination requests carry the current node and latest draft revision.
- [ ] Stale draft pagination results are ignored or rescheduled.
- [ ] Applying draft pagination writes paginated refs and optimistic layout only
  after generation/revision checks.
- [ ] Server/API pagination remains authoritative for export readiness.
- [ ] Full browser/server pagination reconciles after edit settles or exits.
- [ ] Long documents suppress plain boundary draft pagination when page-count
  limits say it is too costly.

## Undo/Redo Checklist

- [ ] One intentional inline edit session creates at most one undo entry.
- [ ] Exiting edit with no text change creates no meaningless history entry.
- [ ] Draft typing does not flood undo history.
- [ ] Undo/redo restores document data and matching paginated snapshot together.
- [ ] Structural split/merge history is separate from plain typing drafts.

## Measurement And Probe Checklist

Primary baseline for paragraph smoothness work is the stress Thai mock, not the
default small/default scenario. Normal documents are still useful as quick
sanity checks, but they do not cover the large-document cost profile that users
feel in production-like Thai documents.

Run this stress baseline before the first behavior patch and after each
meaningful patch:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"
$env:PROBE_TARGET_NODE_ID="p_00114"
$env:PROBE_TARGET_PAGE_INDEX="14"
$env:PROBE_READY_TIMEOUT_MS="240000"
$env:PROBE_MODE="typing"; $env:PROBE_BURST_LENGTH="400"; $env:PROBE_INTERVAL_MS="30"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_MODE="wrap-typing"; $env:PROBE_BURST_LENGTH="160"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_MODE="delete"; $env:PROBE_BURST_LENGTH="120"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
```

Run stress boundary-handoff targets when changing page-follow, page-split,
active height handoff, or continuation editing:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"
$env:PROBE_READY_TIMEOUT_MS="240000"
$env:PROBE_TARGET_NODE_ID="p_00104"; $env:PROBE_TARGET_PAGE_INDEX="12"; $env:PROBE_MODE="wrap-typing"; $env:PROBE_BURST_LENGTH="160"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_TARGET_NODE_ID="p_00104"; $env:PROBE_TARGET_PAGE_INDEX="12"; $env:PROBE_MODE="typing"; $env:PROBE_BURST_LENGTH="400"; $env:PROBE_INTERVAL_MS="30"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_TARGET_NODE_ID="p_00132"; $env:PROBE_TARGET_PAGE_INDEX="14"; $env:PROBE_MODE="wrap-typing"; $env:PROBE_BURST_LENGTH="160"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
```

Run stress Enter/newline separately when changing Enter behavior:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"
$env:PROBE_TARGET_NODE_ID="p_00104"
$env:PROBE_TARGET_PAGE_INDEX="12"
$env:PROBE_READY_TIMEOUT_MS="240000"
$env:PROBE_MODE="enter"; $env:PROBE_BURST_LENGTH="30"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
```

Run the default scenario only as a quick sanity comparison:

```powershell
Remove-Item Env:\FLOWDOC_PROBE_FILE,Env:\PROBE_TARGET_NODE_ID,Env:\PROBE_TARGET_PAGE_INDEX -ErrorAction SilentlyContinue
npm.cmd run smoke:wysiwyg-smoothness
```

Run structural timing when changing split/merge:

```powershell
$env:PROBE_REPEAT="5"; $env:PROBE_WARMUP="1"; $env:PROBE_MODE="enter-mid-split"; $env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-long-mock.flowdoc.json"; $env:PROBE_TARGET_NODE_ID="cover_note"; $env:PROBE_ENTER_SPLIT_TEXT="pagination"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
```

Expected evidence:

- [ ] `console.errors` and `console.pageErrors` are 0.
- [ ] `paintLatencyMs.p50` stays under one to two frames for the target browser.
- [ ] `paintLatencyMs.p95` stays below the documented smoothness threshold.
- [ ] `paintLatencyMs.p99` stays below the jank threshold.
- [ ] `perfEvents.countByKind.browser-preview-pagination` is 0 in the immediate
  input lane for normal typing/delete.
- [ ] `perfEvents.draftMeasureBreakdown` is present for traced FlowDoc
  draft-line runs and identifies whether `measureText`, segmentation, or
  residual wrap/build work dominates the held Thai burst.
- [ ] Longest event is not repeatedly `editor-canvas-react-commit`,
  `text-engine-draft-measure`, or `browser-preview-pagination` over budget.
- [ ] `native-edit-geometry-sync` stays bounded and does not cause repeated
  height preview dispatch when height is stable.
- [ ] Structural probes report `flushSyncMs`, `firstIslandPaintMs`, and
  `fullPaginationSettledMs` separately.

## Focused Unit/App Test Checklist

Choose the smallest set for the patch risk:

- [ ] `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- [ ] `src/app/editor/_components/__tests__/EditorCanvas.test.ts`
- [ ] `src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts`
- [ ] `src/app/editor/_components/__tests__/wysiwygReflow.test.ts`
- [ ] `src/app/editor/_components/structuralEdit/__tests__/previewSettleBridge.test.ts`
- [ ] `src/app/editor/_components/structuralEdit/__tests__/previewSettleShellAdapter.test.ts`
- [ ] `src/app/editor/_components/__tests__/editorPageFollow.test.ts`
- [ ] `src/app/editor/_components/__tests__/wysiwygPerformance.test.ts`

Required broader checks for behavior changes:

- [ ] `npm.cmd run type-check`
- [ ] `npm.cmd run smoke:editor`
- [ ] relevant `smoke:wysiwyg-*` command from `docs/BROWSER_SMOKE_CHECKLIST.md`

Docs-only updates may use:

- [ ] `git diff --check`

## Minimal Patch Slices

Slice 0: baseline only.

- [ ] Run the smoothness probes and capture the current report.
- [ ] Classify current visual model: native-visible or FlowDoc draft-lines.
- [ ] Decide which RISK rows move to PASS, stay RISK, or become BLOCKER.

Slice 1A: active FlowDoc draft measure/render hot path.

- [x] Selected as the next minimal patch slice for paragraph typing/wrap
  smoothness.
- [ ] Reduce unnecessary active paragraph measurement and island render work.
- [ ] Keep `browser-preview-pagination=0` for stress typing/wrap/delete
  immediate input lanes.
- [ ] Keep Enter/newline work out of scope for this slice.
- [ ] Pass the `Next Patch Gate - Active Draft Measure/Render` criteria above.

Slice 1: model alignment.

- [ ] If native-visible is the target, disable or narrow plain paragraph
  FlowDoc draft-lines on the critical typing lane.
- [ ] If FlowDoc draft-lines is the target, update the contract to explicitly
  allow active paragraph measurement and set hard perf limits.
- [ ] Keep legacy SVG live echo, SVG draft replacement, and custom-caret-only
  active visuals disabled unless a separate design accepts them.

Slice 2: normal typing and Backspace/Delete.

- [ ] Keep local input immediate.
- [ ] Coalesce parent sync to latest payload.
- [ ] Ensure caret-only updates do not schedule draft pagination.
- [ ] Keep active paragraph measurement outside the immediate paint path where
  possible.

Slice 3: click-to-caret.

- [ ] Measure click-to-caret latency.
- [ ] Avoid unnecessary finalize/re-paginate before click action resolves.
- [ ] Keep same-node caret moves from remounting the edit layer.

Slice 4: structural Enter/Backspace.

- [ ] Optimize split/merge only after normal typing lane is stable.
- [ ] Attribute `flushSync` cost to shell, canvas, page render, and island work.
- [ ] Keep optimistic refocus bounded to affected paragraph/page where possible.

Slice 5: production readiness.

- [ ] Re-run smoothness in bundled Chromium.
- [ ] Re-run with installed Chrome and Edge where available.
- [ ] Run Thai IME manual matrix before changing default/production flags.
- [ ] Update `docs/WYSIWYG_PRODUCTION_GATE.md` only when release evidence exists.

## Review Gate

A paragraph interaction patch should FAIL if any of these are true:

- [ ] Native textarea and FlowDoc/SVG text both visibly own the same active
  paragraph without an explicit fallback rule.
- [ ] Normal typing or normal Backspace triggers full browser-preview pagination
  in the immediate input lane.
- [ ] Caret-only movement creates document draft changes, pagination, or history.
- [ ] Pending draft sync can be lost before blur, shortcut, structural edit, or
  unmount.
- [ ] Structural Enter/Backspace can run repeatedly while a prior structural
  operation is in flight.
- [ ] Browser preview can overwrite a newer draft generation.
- [ ] One edit session creates unexpected multiple undo entries.
- [ ] The patch changes document schema, export behavior, or server pagination
  without explicit approval.

Use PASS / FAIL / RISK / UNKNOWN in reviews, with file/function evidence for
each strong claim.
