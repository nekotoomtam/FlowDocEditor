# FlowDoc Performance Baseline

Date: 2026-05-28
Status: Measurement-only baseline harness

This harness exists to measure large-document editor cost before choosing any
optimization. It must not change document schema, pagination semantics,
undo/redo behavior, data binding, export output, or editor architecture.

## Scope

The baseline command loads a FlowDoc fixture into the editor, waits for the
editor to become ready, records document statistics and timing stages, performs
the minimum real interaction path, captures console/page errors, and writes a
JSON report.

Default fixture:

```txt
public/mock/flowdoc-stress-mock.flowdoc.json
```

## Commands

Default run:

```powershell
npm.cmd run perf:baseline
```

Use an explicit fixture:

```powershell
$env:BASELINE_FLOWDOC_FILE=".\public\mock\flowdoc-stress-mock.flowdoc.json"; npm.cmd run perf:baseline
```

Use an existing app server instead of letting the runner start one:

```powershell
$env:BASELINE_APP_URL="http://localhost:4000"; npm.cmd run perf:baseline
```

Include PDF and DOCX export timing:

```powershell
$env:BASELINE_INCLUDE_EXPORT="1"; $env:BASELINE_FLOWDOC_FILE=".\public\mock\flowdoc-stress-mock.flowdoc.json"; npm.cmd run perf:baseline
```

Include pagination stage profiling:

```powershell
$env:BASELINE_PROFILE_PAGINATION="1"; npm.cmd run perf:baseline
```

Install the bundled Playwright Chromium browser explicitly:

```powershell
npm.cmd run perf:install-browser
```

If Chromium is missing, the runner fails with:

```txt
Playwright Chromium is not installed. Run: npx playwright install chromium
```

## Environment Variables

- `BASELINE_FLOWDOC_FILE`: FlowDoc fixture path. If set and invalid, the runner
  fails; it does not fall back to a smaller document.
- `BASELINE_APP_URL`: existing app URL. If omitted, the runner uses
  `http://localhost:3000` when available, or the next available port when
  another process already owns `3000`, and starts a FlowDoc dev server there.
- `BASELINE_OUTPUT_DIR`: report directory. Default:
  `reports/perf-baseline`.
- `BASELINE_INCLUDE_EXPORT`: `1` measures both PDF and DOCX export timing.
- `BASELINE_PROFILE_PAGINATION`: `1` adds pagination stage profiles to the
  report. The editor/profile path remains opt-in and measurement-only.
- `BASELINE_ALLOW_CONSOLE_ERRORS`: `1` records console errors without failing.
- `BASELINE_TIMEOUT_MS`: timeout for readiness and interaction stages. Default
  is `180000`, or `300000` when export timing is enabled.
- `BASELINE_HEADFUL`: `1` opens a visible Chromium window.
- `BASELINE_SLOW_MO`: Playwright slow motion in milliseconds.
- `BASELINE_COMPARE_REPORT`: optional prior baseline JSON path. When set,
  `latest-summary.txt` includes a before/after comparison for editor
  readiness, pre-pagination wait, ignored worker responses, and layout counts.

## Output

Each run writes:

```txt
reports/perf-baseline/latest.json
reports/perf-baseline/perf-baseline-YYYYMMDD-HHmmss.json
reports/perf-baseline/latest-summary.txt
```

The JSON report contains:

- `fixture`: path, byte size, document id, and title when available.
- `environment`: Node, platform, browser, app URL, and CI flag.
- `documentStats`: structural counts for sections, body children, total nodes,
  paragraphs, headings, TOC nodes, flow-row/stack/table nodes, field refs, and
  text characters.
- `timings`: navigation, fixture load, editor readiness, first pagination when
  available, visible-page render, interaction, scroll, and optional export
  timings.
- `perfEvents`: browser/editor perf events plus runner stage events.
- `paginationProfiles`: optional stage profiles for browser pagination and,
  when export timing is enabled, PDF/DOCX export pagination.
- `documentImportBreakdown`: storage/package parse and initial editor-state
  creation counts, durations, samples, and invocation ids.
- `renderBreakdown`: React commit summaries for the editor canvas and profiled
  editor subtrees, including work before the first committed pagination
  request.
- `interactionBreakdown`: scroll, click, target lookup, long task, React
  commit, and inline-edit event timings for the baseline interaction scenario.
- `readinessBreakdown`: browser-clock readiness marks showing when first
  pagination starts/ends and how long remains until editor-ready/full-ready.
- `prePaginationBreakdown`: browser-clock lifecycle markers from navigation and
  document import through the first committed browser pagination request,
  including fontkit readiness, effect/debounce timing, first worker request
  post time, stale worker responses, server pagination request timing,
  worker receive-to-compute boundaries, and Long Task API summaries when
  available.
- `react`: React commit summaries when the editor perf trace exposes them.
- `console` and `pageErrors`: captured browser errors and warnings.
- `result` and optional `failure`: pass/fail with stage context.

To compare a scheduling change against a previous run:

```powershell
$env:BASELINE_PROFILE_PAGINATION="1"; $env:BASELINE_COMPARE_REPORT=".\reports\perf-baseline-before\latest.json"; npm.cmd run perf:baseline
```

## Failure Policy

The run fails when:

- the fixture is missing, unreadable, invalid JSON, or not a FlowDoc document or
  package
- the app cannot be reached or started
- the editor shell does not render
- the loaded editor document id does not match the fixture
- the editor never reaches a ready/full pagination state
- visible paragraph targets cannot be found
- first click edit or edit switching cannot enter inline edit
- the page crashes or emits uncaught page errors
- `console.error` occurs, unless `BASELINE_ALLOW_CONSOLE_ERRORS=1`
- the report cannot be written

Fixture failures include the fixture path, stage, and original error message,
for example:

```txt
Failed to load baseline fixture:
path: C:\repo\fixtures\flowdoc-stress-mock.flowdoc.json
stage: parse-json
error: Unexpected token ...
```

## Boundaries

This baseline does not optimize anything. Slowness found here should be
reported as a candidate bottleneck, such as fixture import, normalization, TOC,
browser pagination, server pagination, visible-page render, paragraph surface
mount, inline edit entry, edit switching, flow-table measurement, or export.

`worker-overhead` in a browser pagination profile is derived from the browser
pagination roundtrip minus the profiled worker compute time. It includes
structured-clone/postMessage request/response cost, worker queue/wait and setup
outside profiled pagination, partial-response work when present, onmessage
dispatch, and main-thread event summarization before state commit. It excludes
React apply/render commits, export rendering, and report writing.

`prePaginationBreakdown` is intentionally separate from `paginationProfiles`.
It answers why the first committed browser pagination event starts late. The
first worker request can be posted earlier than the committed pagination event;
if later fontkit/editor state updates supersede the request, stale worker
responses are recorded under `ignoredWorkerResponses` instead of being counted
as a successful pagination event.

The editor now avoids initial scheduling waste by waiting for the browser text
measurer to settle before posting full browser pagination to the worker, and by
waiting for browser preview pagination to reach `full` before starting the
server/API pagination check. This preserves browser/server layout comparison
while keeping server pagination out of the initial editor-ready critical path.

`documentImportBreakdown` is diagnostic only. In the current editor shell there
are separate initial storage/parse paths for document editor state, data
snapshot, and field registry. In dev baselines those lazy initializers can be
observed more than once; the report keeps invocation ids so the repeated work
can be counted without changing import behavior.

`interactionBreakdown` correlates the baseline scenario with browser long tasks
and React commits. This is meant to explain whether slow click/scroll timings
come from target lookup, browser scroll work, inline-edit entry/finalize,
property/canvas render commits, or other main-thread blocks. It does not
change selection, inline-edit, pagination, or layout behavior.
