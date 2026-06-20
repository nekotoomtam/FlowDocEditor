# Editor Long-Document v2 Stress Harness Plan

Status: Active Architecture Evolution Phase 4 plan.

Use this document when building or accepting long-document editor stability
fixtures, browser probes, smoothness gates, or stress evidence for Document
Model v2 editor workflows.

## Parent Workflow

Architecture evolution Phase 4:

```text
Long-document v2 stress harness
```

The goal is to prove the user-facing target: typing, adding nodes, deleting
nodes, duplicate, split/merge, table edits, and flow-row edits should still feel
normal on long documents.

Phase 4 is not a UI optimization pass by default. It first builds the evidence
surface that lets later optimization work be judged without guessing.

## Current Position

- Parent plan: `docs/EDITOR_ARCHITECTURE_EVOLUTION_PLAN.md`.
- Previous lane: Phase 3, Pagination snapshot identity, complete.
- Current lane: Phase 5, stability gate handoff.
- Current job item: record the completed long-v2 mutation/browser evidence and
  preserve the remaining strict typing p95 RISK.
- Status: done, with strict responsiveness RISK retained.
- Next transition: accept Phase 4 as mutation/browser PASS with Phase 3 strict
  responsiveness RISK, then use the recorded gates for the next optimization
  lane.

## Goal

Create a v2-first stress harness that can answer:

- Did the document remain valid?
- Did display avoid stale or partial output overwrites?
- Did typing feel responsive during immediate input?
- Did add/delete/duplicate/split/merge preserve selection, history, and
  pagination?
- Did table and flow-row workflows settle without layout errors?
- Can the same evidence be rerun without manual fixture surgery?

## Current Evidence

Current v2 fixtures already exist:

| Fixture | Document version | Node count | Body children | Notes |
|---|---:|---:|---:|---|
| `public/mock/stress-typing-v2.flowdoc.json` | 2 | 213 | 145 | v2 graph, typing aliases, one flow-row, one flow-table |
| `public/mock/stress-node-mutations-v2.flowdoc.json` | 2 | 153 | 85 | v2 graph, delete/duplicate/reorder/split/merge aliases |
| `public/mock/stress-flow-row-v2.flowdoc.json` | 2 | 177 | 109 | v2 graph, flow-row aliases |
| `public/mock/stress-table-v2.flowdoc.json` | 2 | 226 | 109 | v2 graph, table aliases |
| `public/mock/stress-long-v2.flowdoc.json` | 2 | 1474 | 1301 | long v2 graph, legacy-scale body pressure, typing/node/flow-row/table aliases |
| `public/mock/flowdoc-stress-mock.flowdoc.json` | 1 | 1442 | 1297 | broader legacy long-document baseline |

The focused v2 fixtures are valid contract fixtures. `stress-long-v2` now gives
Phase 4 a legacy-scale v2 fixture seed. Browser evidence covers typing,
delete/undo lifecycle, add/copy, split/merge, table structure, and flow-row
structure. Full long-document stability remains RISK, not PASS, because primary
typing repeat and deep delete burst p95 are slightly above the strict 33ms gate.

Existing probe support:

- `scripts/flowdoc-fixture-targets.mjs` resolves semantic target aliases from
  `mockData.targets`.
- `scripts/wysiwyg-smoothness-probe.mjs` accepts `FLOWDOC_PROBE_FILE` and
  `PROBE_TARGET_ALIAS`.
- `scripts/wysiwyg-stress-lifecycle-smoke.mjs` accepts `FLOWDOC_STRESS_FILE`,
  `STRESS_FIRST_TARGET_ALIAS`, and `STRESS_SECOND_TARGET_ALIAS`.
- `scripts/wysiwyg-node-mutation-smoke.mjs` accepts `FLOWDOC_MUTATION_FILE`
  and semantic mutation aliases for palette add and canvas drag-copy browser
  coverage.
- `scripts/wysiwyg-structure-mutation-smoke.mjs` accepts
  `FLOWDOC_STRUCTURE_FILE` and semantic table/flow-row aliases for browser
  structure mutation coverage.
- `src/app/editor/_components/__tests__/documentV2StressFixture.test.ts`
  validates the current v2 fixture set and import adapter path.

## Harness Requirements

### Fixture Requirements

A Phase 4 long v2 fixture must:

- use `DocumentNode.version = 2`
- use flattened `section.nodes` graph storage
- use `flow-row` and `flow-stack`, not legacy `row` or `stack`
- use flattened `flow-table`, `flow-table-row`, and `flow-table-cell` nodes
- include repeated sections or enough repeated content to create meaningful
  pagination pressure
- include Thai/mixed text, styled paragraphs, field refs, page numbers,
  flow-row, flow-stack, table, and boundary paragraphs
- expose semantic target aliases in `mockData.targets`
- avoid persisting paginated output or runtime layout state

### Target Alias Requirements

Required aliases:

```text
typing.primary
typing.boundary
typing.pageBoundary
typing.deepDocument
node.delete
node.duplicate
node.reorderSource
node.reorderTarget
node.split
node.merge
flowRow.resizeTarget
flowRow.addColumnTarget
flowRow.leftStack
flowRow.rightStack
table.primaryTable
table.primaryRow
table.primaryCell
table.bodyCell
table.spanCell
```

Aliases are the contract between fixtures and browser probes. Browser scripts
should target aliases rather than generated ids.

### Probe Requirements

The harness must measure or assert:

- first visual response after input
- paint latency p95 and p99 during typing
- immediate-input lane does not trigger browser preview pagination
- preview layout settles back to `full`
- stale output rejection remains intact
- console/page errors remain zero
- add/delete/duplicate/split/merge create the intended history entry
- undo/redo restore matching document and paginated state
- table and flow-row mutations settle without layout error
- fixture target aliases resolve before browser interaction starts

## Phase Map

| Phase | Goal | Scope | Done criteria | Status |
|---|---|---|---|---|
| 0 | Design and audit | Docs, fixture catalog, scripts, current v2 fixtures | Existing evidence and gaps are explicit | done |
| 1 | Fixture contract | Generator, manifest, fixture tests | Long v2 fixture shape and aliases are validated in app tests | done |
| 2 | True long v2 fixture | `public/mock`, generator, manifest | v2 fixture reaches long-document breadth without legacy shape | done |
| 3 | Smoothness probe matrix | Smoothness probe docs/scripts | Typing aliases run with measurable thresholds on v2 fixture | RISK |
| 4 | Mutation/browser probes | Lifecycle or new focused scripts | add/delete/duplicate/split/merge, table, and flow-row workflows have browser evidence | done |
| 5 | Stability gate handoff | Stability docs and verification | `EDITOR_STABILITY_GATES` and browser checklist name the new v2 gate | done |

## Stop Conditions

Stop for owner review before:

- replacing `public/mock/flowdoc-stress-mock.flowdoc.json` as the official
  legacy baseline
- changing persisted document/package shape
- changing `PaginatedDocument` schema
- lowering responsiveness thresholds to make a failing probe pass
- removing old browser smoke coverage before v2 coverage reaches equivalent
  breadth
- claiming long-document stability without browser/probe evidence

Continue autonomously when:

- adding or extending generated v2 fixtures
- adding semantic aliases
- adding tests that assert fixture validity and alias resolution
- adding browser probe modes or commands that only observe current behavior
- updating docs to reflect measured evidence and known gaps

## Verification Plan

Docs-only or planning changes:

- `git diff --check`

Fixture/generator changes:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentV2StressFixture.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`

Browser evidence before Phase 4 completion:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/<long-v2-fixture>.flowdoc.json"; $env:PROBE_TARGET_ALIAS="typing.primary"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
$env:FLOWDOC_STRESS_FILE="public/mock/<long-v2-fixture>.flowdoc.json"; $env:STRESS_FIRST_TARGET_ALIAS="typing.primary"; $env:STRESS_SECOND_TARGET_ALIAS="typing.boundary"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-stress-lifecycle
$env:FLOWDOC_MUTATION_FILE="public/mock/<long-v2-fixture>.flowdoc.json"; $env:MUTATION_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-node-mutation
$env:FLOWDOC_PROBE_FILE="public/mock/<long-v2-fixture>.flowdoc.json"; $env:PROBE_TARGET_ALIAS="node.split"; $env:PROBE_MODE="enter-backspace-after-dispatch"; $env:PROBE_ENTER_SPLIT_TEXT="Browser probes"; $env:PROBE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-smoothness
$env:FLOWDOC_STRUCTURE_FILE="public/mock/<long-v2-fixture>.flowdoc.json"; $env:STRUCTURE_READY_TIMEOUT_MS="240000"; npm.cmd run smoke:wysiwyg-structure-mutation
```

Do not mark the full long-document lane as PASS while strict responsiveness
RISK remains. Phase 4 mutation/browser coverage can be PASS independently when
the concrete browser commands are recorded with real results.

## Browser Evidence Log

| Fixture | Command | Result | Interpretation |
|---|---|---|---|
| `stress-long-v2` | `FLOWDOC_PROBE_FILE=public/mock/stress-long-v2.flowdoc.json PROBE_TARGET_ALIAS=typing.primary PROBE_BURST_LENGTH=1 PROBE_READY_TIMEOUT_MS=60000 npm.cmd run smoke:wysiwyg-smoothness` | `ok=true`, `console.errors=0`, `console.pageErrors=0`, `browserPreviewPagination.count=0`, `paintLatencyMs.p95=25.3`. | Primary long-v2 target passes the one-keystroke alias smoke. |
| `stress-long-v2` | `FLOWDOC_PROBE_FILE=public/mock/stress-long-v2.flowdoc.json PROBE_TARGET_ALIAS=typing.pageBoundary PROBE_BURST_LENGTH=1 PROBE_READY_TIMEOUT_MS=60000 npm.cmd run smoke:wysiwyg-smoothness` | `ok=true`, `console.errors=0`, `console.pageErrors=0`, `browserPreviewPagination.count=0`, `paintLatencyMs.p95=29.6`. | Page-boundary long-v2 target passes after the probe learned to reveal offscreen alias targets by scrolling page frames. |
| `stress-long-v2` | `FLOWDOC_PROBE_FILE=public/mock/stress-long-v2.flowdoc.json PROBE_TARGET_ALIAS=typing.deepDocument PROBE_BURST_LENGTH=1 PROBE_READY_TIMEOUT_MS=60000 npm.cmd run smoke:wysiwyg-smoothness` | `ok=true`, `console.errors=0`, `console.pageErrors=0`, `browserPreviewPagination.count=0`, `paintLatencyMs.p95=31.5`. | Deep-document long-v2 target passes the one-keystroke alias smoke. This replaces the earlier timeout, which was a probe reveal gap rather than a fixture validity failure. |
| `stress-long-v2` | `FLOWDOC_PROBE_FILE=public/mock/stress-long-v2.flowdoc.json PROBE_TARGET_ALIAS=typing.primary PROBE_MODE=typing PROBE_BURST_LENGTH=400 PROBE_INTERVAL_MS=30 PROBE_READY_TIMEOUT_MS=240000 npm.cmd run smoke:wysiwyg-smoothness` | `ok=true`, `paintLatencyMs.p50=23.8`, `p95=33.3`, `p99=51.9`, `max=60.7`, `browserPreviewPagination.count=0`, console/page errors `0`. | Correctness and immediate-input isolation pass, but strict 33ms p95 gate is RISK by 0.3ms. |
| `stress-long-v2` | Same as above with `PROBE_TARGET_ALIAS=typing.pageBoundary`. | `ok=true`, `paintLatencyMs.p95=32.7`, `p99=60.5`, `max=75.2`, `browserPreviewPagination.count=0`, console/page errors `0`. | Page-boundary full burst passes the strict p95 gate. |
| `stress-long-v2` | Same as above with `PROBE_TARGET_ALIAS=typing.deepDocument`. | `ok=true`, `paintLatencyMs.p95=32.4`, `p99=46.3`, `max=78`, `browserPreviewPagination.count=0`, console/page errors `0`. | Deep-document full burst passes the strict p95 gate. |
| `stress-long-v2` | `FLOWDOC_PROBE_FILE=public/mock/stress-long-v2.flowdoc.json PROBE_TARGET_ALIAS=typing.primary PROBE_MODE=typing PROBE_BURST_LENGTH=400 PROBE_INTERVAL_MS=30 PROBE_READY_TIMEOUT_MS=240000 PROBE_REPEAT=3 npm.cmd run smoke:wysiwyg-smoothness` | `ok=true`; `keyInputMetrics.paintLatencyMs.p95.values=[31.9,31.9,34.3]`, median `31.9`, max sample p95 `34.3`; browser preview pagination, console errors, page errors, and typing-layer failures all `0`. | Repeated primary typing is user-visible stable, but remains RISK against the strict 33ms p95 threshold. |
| `stress-long-v2` | `FLOWDOC_PROBE_FILE=public/mock/stress-long-v2.flowdoc.json PROBE_TARGET_ALIAS=typing.pageBoundary PROBE_MODE=wrap-typing PROBE_BURST_LENGTH=160 PROBE_INTERVAL_MS=0 PROBE_READY_TIMEOUT_MS=240000 npm.cmd run smoke:wysiwyg-smoothness` | `ok=true`, `paintLatencyMs.p95=32.2`, `p99=33.0`, `max=81.8`, `browserPreviewPagination.count=0`, console/page errors `0`. | Page-boundary wrap typing passes. One deferred `outline-panel-react-commit` happened after the burst and did not block the immediate input lane. |
| `stress-long-v2` | `FLOWDOC_PROBE_FILE=public/mock/stress-long-v2.flowdoc.json PROBE_TARGET_ALIAS=typing.deepDocument PROBE_MODE=delete PROBE_BURST_LENGTH=120 PROBE_INTERVAL_MS=0 PROBE_READY_TIMEOUT_MS=240000 npm.cmd run smoke:wysiwyg-smoothness` | `ok=true`, `paintLatencyMs.p95=34.6`, `p99=44`, `max=58.6`, `browserPreviewPagination.count=0`, console/page errors `0`. | Delete burst is correctness PASS but strict responsiveness RISK. The longest attribution anchor was `flowdoc-island-visible-lines`; canvas commit p95 stayed around `9ms`. |
| `stress-long-v2` | `FLOWDOC_STRESS_FILE=public/mock/stress-long-v2.flowdoc.json STRESS_FIRST_TARGET_ALIAS=typing.primary STRESS_SECOND_TARGET_ALIAS=typing.deepDocument PROBE_READY_TIMEOUT_MS=240000 npm.cmd run smoke:wysiwyg-stress-lifecycle` | `ok=true`, `targetRevealMs.first=161`, `targetRevealMs.second=4195`, `clickSwitchMs=221`, `exitMs=123`, `undoRestoreMs=437`, `undoFullWaitMs=314`, console/page errors `0`. | Corrected lifecycle measurement passes. The earlier 4-5s value measured probe navigation/reveal to page 62, not click-to-edit runtime. |
| `stress-long-v2` | `FLOWDOC_MUTATION_FILE=public/mock/stress-long-v2.flowdoc.json MUTATION_READY_TIMEOUT_MS=240000 npm.cmd run smoke:wysiwyg-node-mutation` | `ok=true`; palette add `mutationMs=2028`, `fullWaitMs=312`, undo `1328`; drag-copy `mutationMs=2201`, `fullWaitMs=271`, undo `1565`; console/page errors `0`. | Browser-level add and duplicate/copy mutation coverage passes on the long v2 fixture. |
| `stress-long-v2` | `FLOWDOC_PROBE_FILE=public/mock/stress-long-v2.flowdoc.json PROBE_TARGET_ALIAS=node.split PROBE_MODE=enter-backspace-after-dispatch PROBE_ENTER_SPLIT_TEXT="Browser probes" PROBE_READY_TIMEOUT_MS=240000 npm.cmd run smoke:wysiwyg-smoothness` | `ok=true`; split dispatch observed, new node removed, returned to previous node, `mergeEventCount=1`, `optimisticMergeRefocusCount=1`, `mergeDispatchCount=1`, `usedFullPaginationBeforeIsland=false`, `browserPreviewPagination.count=0`, console/page errors `0`. Latest measured run: `enterToObservedIslandMs=1105.7`, `backspaceToMergedFragmentGoneMs=1116.2`. | Split/merge structural correctness and immediate-lane isolation pass on the long v2 fixture. The probe counts current merge refocus telemetry by node shape instead of the obsolete merge-only source string. |
| `stress-long-v2` | `FLOWDOC_STRUCTURE_FILE=public/mock/stress-long-v2.flowdoc.json STRUCTURE_READY_TIMEOUT_MS=240000 npm.cmd run smoke:wysiwyg-structure-mutation` | `ok=true`; table add row `2128ms`, table add column `1951ms`, table resize `3517ms`, flow-stack add column `4848ms`, flow-row resize `5004ms`; preview full waits `458-1029ms`; undo restore `1922-4863ms`; console/page errors `0`. | Browser-level table and flow-row structure mutation coverage passes on the long v2 fixture, including undo restore and preview layout returning to `full`. |
| `stress-typing-v2` | `FLOWDOC_PROBE_FILE=public/mock/stress-typing-v2.flowdoc.json PROBE_TARGET_ALIAS=typing.primary PROBE_BURST_LENGTH=1 PROBE_READY_TIMEOUT_MS=240000 npm.cmd run smoke:wysiwyg-smoothness` | `ok=true`, `console.errors=0`, `console.pageErrors=0`, `browserPreviewPagination.count=0`, `paintLatencyMs.p95=59.2`. | Browser environment and v2 alias targeting work. This is not a responsiveness PASS because the single-sample paint p95 is above the 33ms typing gate. |

## Job Ledger

| Item | Status | Purpose | Verification | Notes |
|---|---|---|---|---|
| 0.1 | done | Audit existing v2 fixture/probe evidence and write the Phase 4 contract. | Docs and local fixture/script evidence. | Current v2 fixtures are valid seeds but not long enough to replace the legacy stress baseline. |
| 1.1 | done | Add fixture aliases required by the Phase 4 contract. | `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentV2StressFixture.test.ts`; `npm.cmd run type-check`. | Added page-boundary, deep-document, split, and merge aliases through the generator. |
| 2.1 | done | Add a generated legacy-scale long v2 stress fixture. | `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentV2StressFixture.test.ts`; `npm.cmd run type-check`. | `stress-long-v2` has 1474 nodes and 1301 body children; legacy stress remains the broader baseline until browser evidence is recorded. |
| 3.1 | done | Teach the smoothness probe to reveal offscreen alias targets in virtualized long documents. | `stress-long-v2` `typing.pageBoundary` and `typing.deepDocument` alias smokes passed after the helper change. | The earlier deep-target timeout was caused by waiting for an unmounted DOM fragment before scrolling to its page. |
| 3.2 | done | Establish initial one-keystroke smoothness evidence for the long v2 fixture. | `stress-long-v2` `typing.primary`, `typing.pageBoundary`, and `typing.deepDocument` alias smokes passed. | This proves alias reachability and immediate-input behavior for three document depths; full burst/repeat gates still remain. |
| 3.3 | RISK | Run the full typing burst/repeat matrix on `stress-long-v2`. | Primary, page-boundary, deep-document, wrap, and delete burst runs recorded in the browser evidence log. | Page-boundary/deep/wrap pass strict p95; primary repeat and delete burst are correctness PASS but strict responsiveness RISK just above 33ms. |
| 4.1 | done | Establish long-v2 lifecycle evidence. | Corrected default lifecycle run passed with `clickSwitchMs=221`, `exitMs=123`, and `undoRestoreMs=437`. | Earlier 4-5s click-switch readings included alias target reveal/scroll to page 62; the script now reports `targetRevealMs` separately. |
| 4.2 | done | Add browser-level node add and duplicate/copy mutation smoke. | `npm.cmd run smoke:wysiwyg-node-mutation` passed on `stress-long-v2`. | Palette add and canvas drag-copy both created one node, enabled undo, returned preview layout to `full`, and restored original node counts after undo. |
| 4.3 | done | Add split/merge browser evidence on `stress-long-v2`. | `PROBE_MODE=enter-backspace-after-dispatch` passed with split dispatch, merge dispatch, node removal, refocus, no full pagination before island, and console/page errors `0`. | The script now accepts the current `optimistic-prestarted` merge refocus telemetry when the event node shape matches merge semantics. |
| 4.4 | done | Add table and flow-row browser workflow evidence on `stress-long-v2`. | `npm.cmd run smoke:wysiwyg-structure-mutation` passed on `stress-long-v2`. | Covers table add row, table add column, table column resize, flow-stack add column, flow-row resize, preview settle, undo restore, and zero console/page errors. |
| 5.1 | done | Update stability docs and browser checklist with the long v2 gate. | `EDITOR_STABILITY_GATES`, browser checklist, fixture catalog, and this plan name the new v2 gates. | Gate wording preserves the typing RISK rather than converting it to PASS. |

## Out Of Scope

- Optimizing editor runtime performance before a probe identifies a failing
  lane.
- Rewriting `EditorShell` or `EditorCanvas`.
- Replacing browser or server pagination implementations.
- Changing export output.
- Persisting measured pagination output in fixture JSON.
