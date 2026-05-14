# WYSIWYG Smoothness Probe

Date: 2026-05-14
Status: Phase C — measurement probe; thresholds tentative until baseline lands

This doc explains the automated typing-smoothness probe at
`scripts/wysiwyg-smoothness-probe.mjs`, what its numbers mean, and which
classes of user-perceived symptoms it does **not** cover.

Read with `docs/WYSIWYG_PARITY_PLAN.md` Phase C and
`docs/WYSIWYG_PRODUCTION_GATE.md`.

## How To Run

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

The probe starts a Next dev server with the WYSIWYG text engine flag,
opens the Stage 3 boundary scenario, clicks into the target paragraph, and
types a controlled burst. It writes a JSON report to stdout.

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
| `perfEvents.overFrameBudget` | events whose `durationMs` exceeded 16ms | low single-digits OK; many = work over frame budget |
| `perfEvents.jankCount` | events whose `durationMs` exceeded 100ms | should be 0 |
| `perfEvents.longestEvent` | slowest event recorded | review the `kind` if `durationMs` > 100 |
| `pageBoundary.crossed` | true when fragment count increased | confirms the burst crossed a page break |
| `console.errors` / `console.pageErrors` | runtime errors during the burst | must be 0 |

`ok: true` requires zero console errors and zero page errors. Threshold
breaches do not fail the probe; they surface as numbers for human review.

## Symptom Categories — What The Probe Covers vs Does Not

This is the key cross-reference. If you experience a symptom while typing,
find it in the table to know whether the probe will catch it or whether it
needs a different gate.

### Covered (probe will surface these objectively)

| Symptom | Where it shows in the report |
|---|---|
| Typing feels laggy / late paint | `paintLatencyMs.p95`, `paintLatencyMs.p99` |
| Big stutter / freeze | `paintLatencyMs.max`, `perfEvents.jankCount` |
| Editor re-paginates the whole doc while typing | `perfEvents.countByKind.browser-preview-pagination` |
| Some keystrokes take much longer than others | `paintLatencyMs.p99` vs `p50` |
| Page-boundary crossing doesn't happen as expected | `pageBoundary.crossed`, `endFragmentCount` |
| Errors / warnings during typing | `console.errors`, `console.pageErrors` |
| A specific perf path is unexpectedly slow | `perfEvents.longestEvent.kind` |

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
| Backspace at boundary feels different from forward delete | Probe only types forward | Add a backspace burst variant |
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
- `perfEvents.total` is capped at 200 by the existing perf trace ring buffer
  (`MAX_WYSIWYG_PERF_EVENTS` in `src/app/editor/_components/wysiwygPerformance.ts`),
  which is why a 400-char burst reports 200 events.
- `keystrokeTotalMs` includes the 30ms inter-keystroke sleep and Playwright
  round-trip cost; it is not a paint metric. The paint metric is
  `paintLatencyMs`.
