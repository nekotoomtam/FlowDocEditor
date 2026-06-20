# WYSIWYG Smoothness Probe

Date: 2026-05-14
Status: Phase C — measurement probe; thresholds tentative until baseline lands

This doc explains the automated typing-smoothness probe at
`scripts/wysiwyg-smoothness-probe.mjs`, what its numbers mean, and which
classes of user-perceived symptoms it does **not** cover.

Read with `docs/WYSIWYG_PARITY_PLAN.md` Phase C and
`docs/WYSIWYG_PRODUCTION_GATE.md`.

## How To Run

For paragraph typing/click/Enter/Backspace smoothness work, treat
`Mock FlowDoc Stress Thai Document` as the primary baseline. The default command
below is a quick sanity run only; ordinary documents usually do not expose the
large-document costs this work is trying to reduce.

Quick sanity run:

```powershell
npm.cmd run smoke:wysiwyg-smoothness
```

Run headed (so you can also watch by eye):

```powershell
$env:HEADED="1"; npm.cmd run smoke:wysiwyg-smoothness
```

Adjust burst:

```powershell
$env:PROBE_BURST_LENGTH="200"; $env:PROBE_INTERVAL_MS="20"; npm.cmd run smoke:wysiwyg-smoothness
```

Primary paragraph smoothness baseline. This runs against the stress Thai mock
and scrolls the lazy canvas to page 15 before clicking the target paragraph:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"; $env:PROBE_TARGET_NODE_ID="p_00114"; $env:PROBE_TARGET_PAGE_INDEX="14"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
```

Document Model v2 fixtures can use semantic target aliases from
`mockData.targets` instead of hardcoded node ids:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/stress-node-mutations-v2.flowdoc.json"; $env:PROBE_TARGET_ALIAS="typing.primary"; $env:PROBE_BURST_LENGTH="1"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
```

Long Document Model v2 stress runs:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:PROBE_TARGET_ALIAS="typing.primary"; $env:PROBE_MODE="typing"; $env:PROBE_BURST_LENGTH="400"; $env:PROBE_INTERVAL_MS="30"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
$env:FLOWDOC_PROBE_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:PROBE_TARGET_ALIAS="typing.primary"; $env:PROBE_MODE="typing"; $env:PROBE_BURST_LENGTH="400"; $env:PROBE_INTERVAL_MS="30"; $env:PROBE_READY_TIMEOUT_MS="240000"; $env:PROBE_REPEAT="3"; npm.cmd run smoke:wysiwyg-smoothness
$env:FLOWDOC_PROBE_FILE="public/mock/stress-long-v2.flowdoc.json"; $env:PROBE_TARGET_ALIAS="node.split"; $env:PROBE_MODE="enter-backspace-after-dispatch"; $env:PROBE_ENTER_SPLIT_TEXT="Browser probes"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
```

The long-v2 split/merge run verifies structural Enter split, Backspace merge,
refocus to the previous node, no full pagination before the active island, and
zero console/page errors. The merge refocus check accepts the current
`optimistic-prestarted` telemetry when the event node shape matches merge
semantics, while remaining compatible with the older
`optimistic-merge-prestarted` source.

Run the focused stress baseline modes:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"; $env:PROBE_TARGET_NODE_ID="p_00114"; $env:PROBE_TARGET_PAGE_INDEX="14"; $env:PROBE_READY_TIMEOUT_MS="240000"
$env:PROBE_MODE="typing"; $env:PROBE_BURST_LENGTH="400"; $env:PROBE_INTERVAL_MS="30"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_MODE="wrap-typing"; $env:PROBE_BURST_LENGTH="160"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_MODE="delete"; $env:PROBE_BURST_LENGTH="120"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
```

Run stress boundary-handoff and existing-continuation targets:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"; $env:PROBE_READY_TIMEOUT_MS="240000"
$env:PROBE_TARGET_NODE_ID="p_00104"; $env:PROBE_TARGET_PAGE_INDEX="12"; $env:PROBE_MODE="wrap-typing"; $env:PROBE_BURST_LENGTH="160"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_TARGET_NODE_ID="p_00104"; $env:PROBE_TARGET_PAGE_INDEX="12"; $env:PROBE_MODE="typing"; $env:PROBE_BURST_LENGTH="400"; $env:PROBE_INTERVAL_MS="30"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_TARGET_NODE_ID="p_00132"; $env:PROBE_TARGET_PAGE_INDEX="14"; $env:PROBE_MODE="wrap-typing"; $env:PROBE_BURST_LENGTH="160"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
```

Run stress Enter/newline separately:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"; $env:PROBE_TARGET_NODE_ID="p_00104"; $env:PROBE_TARGET_PAGE_INDEX="12"; $env:PROBE_READY_TIMEOUT_MS="240000"
$env:PROBE_MODE="enter"; $env:PROBE_BURST_LENGTH="30"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
```

Run the range-selection drag probe:

```powershell
$env:PROBE_MODE="selection"; npm.cmd run smoke:wysiwyg-smoothness
```

Run focused key-input probes:

```powershell
$env:PROBE_MODE="space-repeat"; $env:PROBE_BURST_LENGTH="120"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_MODE="delete"; $env:PROBE_BURST_LENGTH="120"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_MODE="enter"; $env:PROBE_BURST_LENGTH="30"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
$env:PROBE_MODE="wrap-typing"; $env:PROBE_BURST_LENGTH="160"; $env:PROBE_INTERVAL_MS="0"; npm.cmd run smoke:wysiwyg-smoothness
```

Run repeated structural timing calibration with one warmup sample and five
measured samples:

```powershell
$env:PROBE_REPEAT="5"; $env:PROBE_WARMUP="1"; $env:PROBE_MODE="enter-mid-split"; $env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-long-mock.flowdoc.json"; $env:PROBE_TARGET_NODE_ID="cover_note"; $env:PROBE_ENTER_SPLIT_TEXT="pagination"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
```

The probe starts a Next dev server with the WYSIWYG text engine flag, opens the
Stage 3 boundary scenario, clicks into the target paragraph, and runs the
selected mode (`typing` by default, plus `space-repeat`, `delete`, `enter`,
`wrap-typing`, `selection`, or `resize`). It writes a JSON report to stdout.

## What The Probe Measures

| Metric | What it shows | Threshold |
|---|---|---|
| `paintLatencyMs.p50` | typical keypress → next animation frame in ms | should stay below 16 (one 60Hz frame) |
| `paintLatencyMs.p95` | tail latency users feel as "stutter" | should stay below 33 (two frames) |
| `paintLatencyMs.p99` | worst-case hitches | should stay below 100 (jank threshold) |
| `paintLatencyMs.max` | absolute worst frame in the burst | any value > 250 is a visible freeze |
| `keystrokeTotalMs.*` | total time per keystroke including network/idle | bounded by `PROBE_INTERVAL_MS` |
| `perfEvents.countByKind.browser-preview-pagination` | full repagination triggered during typing | must be 0 in the immediate input lane |
| `perfEvents.countByKind.active-paragraph-measure` | active-paragraph re-measure events | proportional to burst length; not bounded |
| `perfEvents.draftMeasureBreakdown.measureText` | per-event text-width measurement calls, time, character count, and unique key count inside `text-engine-draft-measure` | use to decide whether a text-width cache patch is justified |
| `perfEvents.draftMeasureBreakdown.wordSegment` | per-event `wordBreaker.segment` calls, time, character count, and unique text count inside `text-engine-draft-measure` | use to decide whether segmentation caching is justified |
| `perfEvents.draftMeasureBreakdown.residual` | remaining draft measurement time after text-width, line-height, and segmentation timing are subtracted | use to decide whether wrap/build/render cadence is the better target |
| `perfEvents.flowdocIsland.fragmentSplit` | time and scope for splitting active draft lines into page fragments | use to decide whether draft preview is preparing more pages/fragments than the visible/caret scope needs |
| `perfEvents.flowdocIsland.visibleLines.scope` | fragment, page, and surface counts attached to input-to-visible draft island timing | use to decide whether visible-line latency correlates with draft preview scope |
| `perfEvents.flowdocIsland.cadence` | ratio of draft measure, fragment split, visible-lines, and React commit events to island input events | use to separate true per-key work from extra render attempts |
| `perfEvents.flowdocIsland.draftMeasure.cache` | cache hit/miss split for out-of-canvas draft layout measurement | use to confirm whether extra draft-measure events are cheap cache hits or expensive full measurements |
| `perfEvents.countByKind.text-engine-pointer-frame` | selection drag move coalescing frame cost | should stay below one frame in `longestEvent` |
| `perfEvents.countByKind.text-engine-pointer-hit-test` | pointer point-to-text-offset mapping cost | should stay below one frame |
| `perfEvents.countByKind.text-engine-selection-overlay` | selection highlight rectangle geometry cost | should stay below one frame |
| `perfEvents.countByKind.editor-canvas-react-commit` | React commit cost for the editor canvas subtree while tracing is enabled | investigate when it appears in `longestEvent` or exceeds one frame |
| `probe.releaseMissingOverlayCount` | selection-release frames where the highlight vanished after mouseup | should be 0 in selection mode |
| `perfEvents.overFrameBudget` | events whose `durationMs` exceeded 16ms | low single-digits OK; many = work over frame budget |
| `perfEvents.jankCount` | events whose `durationMs` exceeded 100ms | should be 0 |
| `perfEvents.longestEvent` | slowest event recorded | review the `kind` if `durationMs` > 100 |
| `pageBoundary.crossed` | true when fragment count increased | confirms the burst crossed a page break |
| `console.errors` / `console.pageErrors` | runtime errors during the burst | must be 0 |

Repeated probe reports include a `keyInputMetrics` summary for key-input modes.
Use it to read sample-to-sample p50/p95/p99/max values without opening every
sample object. The summary also counts browser preview pagination, console/page
errors, node-not-found errors, and typing-layer failures across samples.

`ok: true` requires zero console errors and zero page errors. Threshold
breaches do not fail the probe; they surface as numbers for human review.

## Structural Timing Anchors

Structural Enter/Backspace modes add `structuralTimingTrace` and
`performanceAttribution.attribution.timingTrace` so timing values can be
compared inside one browser clock domain.

| Metric | Anchor |
|---|---|
| `enterHandlerMs` | App-recorded structural split keydown handler/transaction duration. |
| `flushSyncMs` | App-recorded React `flushSync` structural transition duration. |
| `flushSyncWindowTotalMs` | Total structural `flushSync` window duration included in Task 11A render attribution. In Enter->Backspace probes this can include both split and merge windows while `flushSyncMs` remains the first Enter split metric. |
| `firstRafMs` | Browser-observed `keydownStart` to the first `requestAnimationFrame` callback scheduled by the probe keydown listener. |
| `firstIslandPaintMs` | Browser-observed `keydownStart` to the draft island DOM-visible layout-effect event. It is not full pagination settle. |
| `fullPaginationSettledMs` | Browser-observed `keydownStart` to the structural-refocus settled pagination completion event. |

`firstIslandPaintMs` may be lower than `enterHandlerMs` because the island
DOM-visible event is recorded during the synchronous keydown/`flushSync` commit,
before Playwright's key press call returns. Use `firstRafMs` as the first
post-keydown paint opportunity and `fullPaginationSettledMs` as the later full
pagination settle gate.

Task 11A structural render attribution adds
`performanceAttribution.attribution.flushSyncRenderBreakdown` and
`flushSyncRenderSummary`. The breakdown separates shell derived work,
EditorCanvas derived work, PageView/PageSlot memo comparator work, React
Profiler actual duration, layout-effect timing, attributed render time, and any
remaining unattributed `flushSync` window time. Existing page isolation signals
remain under `pagesRenderedDuringStructuralTransition` and
`unaffectedPagesRenderedCount`; the flush-window-specific values are
`pagesRenderedInFlushSyncWindow` and
`unaffectedPagesRenderedInFlushSyncWindow`.

## Symptom Categories — What The Probe Covers vs Does Not

This is the key cross-reference. If you experience a symptom while typing,
find it in the table to know whether the probe will catch it or whether it
needs a different gate.

### Covered (probe will surface these objectively)

| Symptom | Where it shows in the report |
|---|---|
| Typing feels laggy / late paint | `paintLatencyMs.p95`, `paintLatencyMs.p99` |
| Holding Space feels laggy or loops | `PROBE_MODE=space-repeat` with `paintLatencyMs.*`, console/page errors, and `perfEvents.jankCount` |
| Holding Backspace/Delete feels laggy | `PROBE_MODE=delete` with `paintLatencyMs.*`, console/page errors, and `perfEvents.jankCount` |
| Enter/newline growth feels laggy | `PROBE_MODE=enter` with `typingLayer.*`, page-boundary data, and latency metrics |
| Word wrapping while typing feels laggy | `PROBE_MODE=wrap-typing` with `typingLayer.*`, page-boundary data, and latency metrics |
| Range selection drag feels laggy / late paint | `PROBE_MODE=selection` with `paintLatencyMs.*` |
| Selection briefly disappears on mouse release | `PROBE_MODE=selection` with `probe.releaseMissingOverlayCount` |
| Big stutter / freeze | `paintLatencyMs.max`, `perfEvents.jankCount` |
| Editor re-paginates the whole doc while typing | `perfEvents.countByKind.browser-preview-pagination` |
| Some keystrokes take much longer than others | `paintLatencyMs.p99` vs `p50` |
| Page-boundary crossing doesn't happen as expected | `pageBoundary.crossed`, `endFragmentCount` |
| Errors / warnings during typing | `console.errors`, `console.pageErrors` |
| A specific perf path is unexpectedly slow | `perfEvents.longestEvent.kind` |
| Selection hit-test or overlay geometry is slow | selection probe `perfEvents.longestEvent.kind` |

### Not Covered (probe stays silent; needs a different gate)

| Symptom | Why the probe misses it | Where to capture it |
|---|---|---|
| Text visually flickers (briefly missing then back) | Probe measures latency, not visual content | Headed mode + screen recording, or a dedicated DOM mutation check |
| Caret jumps to wrong offset after wrap | Probe types blindly, doesn't read back caret position | Add a per-keystroke caret-offset assertion (separate test) |
| Wrap point shifts incorrectly mid-typing | Probe records totals, not per-keystroke line geometry | Per-keystroke line-segment snapshot (separate test) |
| Specific Thai cluster splits wrong on backspace | Probe types Latin only by design | Thai IME matrix manual gate |
| Smoothness depends on real Chrome vs bundled Chromium | Probe uses bundled by default | Run with `SMOKE_BROWSER_CHANNEL=chrome` |
| Focus moves unexpectedly to another element | Probe captures keys at page level; focus path is implicit | Add a focus-change listener (separate test) |
| Real IME composition behaviour (Thai keyboard) | Probe uses raw `keyboard.press`, not composition | `WYSIWYG_STAGE4C_IME_MATRIX.md` manual |
| True structural Backspace-at-boundary behavior feels wrong | Delete burst covers repeat latency, not structural merge semantics | Dedicated boundary edit smoke/manual check |
| Slow only on first run after fresh app load (font load) | Probe ignores the warmup before its burst start | Capture in a separate cold-start probe |
| Layout shifts between first and second edit session on the same paragraph (wrap point moves on re-enter) | Probe types one burst; it does not exit + re-enter + diff snapshots | Covered by the separate `smoke:wysiwyg-reenter` diagnostic probe; see `docs/WYSIWYG_REENTER_DRIFT_PROBE.md` |

If you encountered a symptom that fits the **Not Covered** column, that's a
useful data point — it means we need a separate test class for that symptom,
not a probe threshold change.

## Reporting User Feedback Against The Probe

When you observe a feel-issue, capture it as:

```
What you felt:        (1-2 sentences)
When it happens:      (every burst / sometimes / only when X)
Where in this matrix: (covered row / not-covered row / unknown)
Probe report at the same moment: (paste the JSON)
```

If "covered" row matches the probe numbers, we have a confirmed objective
signal and can target it in code. If the probe numbers look fine but the
symptom is real, the symptom belongs in the **Not Covered** column and we
add a new gate.

## Known Open Symptom — Edit-Reenter Layout Drift (2026-05-14)

User-reported reproduction:

1. Click into a body paragraph to enter the WYSIWYG text engine.
2. Type ~2–3 visible lines of text, then click outside / blur to exit.
3. Click back into the same paragraph to re-enter the edit session.
4. Continue typing. The line wrap point during the second session does not
   match what was visible during the first session.

Triage:

- Not a font-load race. Reproduces after a long idle period when the font
  buffer is definitely loaded and `editorTextMeasurer` is the fontkit
  measurer.
- Not a smoothness issue (paint p99 stays good in the burst probe and
  `browser-preview-pagination` count is 0).
- Symptom is **state consistency / snapshot drift**: the `fragment.lines`
  source feeding the editor canvas differs between the first edit session
  and the second edit session on the same paragraph, even though both
  sessions use the same fontkit measurer.

Likely candidates (not yet verified):

- The first edit session uses canvas-owned draft visual preview lines built
  by `buildWysiwygDraftVisualPreview(...)` in
  `src/app/editor/_components/EditorCanvas.tsx`, while the second session
  starts from a different `paginated.fragments[].lines` source (server
  settled vs local debounce settled).
- The `inlineEditVisualFresh` flag and the `optimisticLayoutRef` snapshot
  path inside `EditorShell` may select different snapshots for first-enter
  vs re-enter, producing different line geometry even though the underlying
  text and measurer are identical.

Follow-up probe:

- `scripts/wysiwyg-reenter-drift-probe.mjs` now records line snapshots across
  show, first edit, first exit, second edit, and second exit states. See
  `docs/WYSIWYG_REENTER_DRIFT_PROBE.md`.
- Baseline on 2026-05-14 passed on the standard Stage 3 page-boundary fixture,
  including a forced two-fragment split. This means the standard fixture does
  not reproduce the reported drift; it does not close the symptom for every
  real document.
- If a user document still drifts, reuse the probe harness with a scenario that
  matches that document's paragraph width, font size, Thai/Latin mix,
  whitespace, and page position.

## Decision Gate (Phase C)

Phase C page-boundary smoothness can move from RISK to PASS when:

- The probe runs at least once on bundled Chromium with all paint-latency
  thresholds met and `browser-preview-pagination` = 0 during the burst.
- The probe runs once on `SMOKE_BROWSER_CHANNEL=chrome` and once on
  `SMOKE_BROWSER_CHANNEL=msedge` with the same thresholds.
- A human reviewer has run headed mode once and visually agreed with the
  numbers.
- Any "Not Covered" symptom raised during this gate has either been routed
  to its own follow-up task or recorded as an accepted limitation.

## Baseline Capture Process

1. Run `npm.cmd run smoke:wysiwyg-smoothness` once.
2. Save the JSON output verbatim into
   `docs/WYSIWYG_STAGE4C_IME_RESULTS.md` (or a dedicated baseline section)
   together with the date, browser channel, and headed flag.
3. Treat that JSON as the regression baseline for the next change.

## Current Baseline — 2026-05-14

Bundled Chromium, headless, burst 400 chars @ 30ms interval, Phase A and B
landed (browser fontkit measurer + Tab → 3 spaces normalization active).

```json
{
  "ok": true,
  "paintLatencyMs":   { "p50": 24.5, "p95": 32.5, "p99": 33.5, "max": 36.5 },
  "keystrokeTotalMs": { "p50": 71.2, "p95": 158, "p99": 206.4, "max": 222.7 },
  "perfEvents": {
    "total": 200,
    "countByKind": { "inline-edit-draft-update": 200 },
    "overFrameBudget": 0,
    "jankCount": 0,
    "longestEvent": { "kind": "inline-edit-draft-update", "durationMs": 0.2 }
  },
  "pageBoundary": { "startFragmentCount": 1, "endFragmentCount": 2, "crossed": true },
  "console": { "errors": 0, "pageErrors": 0 }
}
```

Reading:

- Page-boundary crossing occurred during the burst (1 → 2 fragments).
- Paint p50 is slightly above one 60Hz frame but well within two frames; p99
  stays at ~33ms — no perceptible jank.
- The browser-preview pagination event count is 0 during the typing burst,
  confirming the immediate-input lane stays light through a page-boundary
  crossing.
- `perfEvents.total` is capped at 2000 by the existing perf trace ring buffer
  (`MAX_WYSIWYG_PERF_EVENTS` in `src/app/editor/_components/wysiwygPerformance.ts`),
  which is why very large probes can report fewer raw events than the number
  emitted internally.
- `keystrokeTotalMs` includes the 30ms inter-keystroke sleep and Playwright
  round-trip cost; it is not a paint metric. The paint metric is
  `paintLatencyMs`.

## Current Selection Baseline — 2026-05-23

Bundled Chromium, headless, `SMOKE_BASE_URL=http://localhost:4000/editor`,
50 drag moves against the Stage 3 boundary fixture with the rich draft editor
server already running.

```json
{
  "ok": true,
  "probe": { "mode": "selection", "moveCount": 50, "overlayVisibleCount": 50 },
  "paintLatencyMs": { "p50": 25.1, "p95": 28.8, "p99": 29.2, "max": 34.2 },
  "perfEvents": {
    "total": 200,
    "countByKind": {
      "text-engine-pointer-frame": 39,
      "text-engine-selection-overlay": 54,
      "editor-canvas-react-commit": 28,
      "text-engine-pointer-hit-test": 39,
      "text-engine-pointer-selection-apply": 39,
      "inline-edit-selection-update": 1
    },
    "overFrameBudget": 2,
    "jankCount": 0,
    "longestEvent": { "kind": "editor-canvas-react-commit", "durationMs": 42.6 }
  }
}
```

Reading:

- Selection overlay rendered for every sampled move.
- Hit-testing, selection application, and overlay geometry stayed far below one
  frame in this fixture.
- Local pointer-selection preview reduced authoritative
  `inline-edit-selection-update` events during the drag to 1 final sync event,
  and reduced over-frame-budget events from 10 to 2 in the standard fixture.
- `editor-canvas-react-commit` remains the longest measured FlowDoc-side event,
  now at about 42.6ms. If selection still feels heavy, the next investigation
  should focus on shrinking the active text-layer commit itself or moving the
  overlay update even closer to an imperative/local paint path.
- Deferred follow-up: this is not a blocker while manual UX feels smooth. Reopen
  only if manual selection drag regresses or the selection probe shows repeated
  over-frame-budget canvas commits again.
