# vNext Workspace Phase Ledger

Parent goal:

- Build an extractable FlowDoc vNext core that can move to a new repository.

| Phase | Goal | Status | Evidence |
|---|---|---|---|
| 1 | Node vocabulary and model direction | done | parent repo docs |
| 2 | Relationship graph contract | done | parent repo docs |
| 3 | Package/schema boundary | done | parent repo docs |
| 4 | Prototype adapter plan | done | parent repo docs |
| 5 | First schema/graph slice | done | parent repo core slice |
| 5.5 | Extractable workspace | done | this folder |
| 6 | vNext product fixture | done | `fixtures/product-report-vnext.flowdoc.json`; `tests/packageFixture.test.ts` |
| 7 | Legacy cutoff and canonical-only boundary | done | `README.md`; `docs/WORKSPACE_BOUNDARY.md` |
| 8 | Canonical package parser/serializer | done | `src/persistence/package.ts`; `tests/packageFixture.test.ts` |
| 9 | vNext operations | done | `src/operations/documentOperations.ts`; `tests/operations.test.ts` |
| 10 | Pagination/export integration | done | `docs/PHASE_10_CLOSE_AUDIT.md`; `docs/TABLE_PAGINATION_VNEXT_PLAN.md`; `src/pagination/paginationPlan.ts`; `src/pagination/textMeasurement.ts`; `src/pagination/measuredPagination.ts`; `src/pagination/rendererConsumption.ts`; `src/pagination/exportReadiness.ts`; `tests/paginationPlan.test.ts`; `tests/textMeasurement.test.ts`; `tests/measuredPagination.test.ts`; `tests/rendererConsumption.test.ts`; `tests/exportReadiness.test.ts` |
| 11 | Editor runtime bridge | done | `../docs/EDITOR_VNEXT_RUNTIME_BRIDGE_PLAN.md`; `../docs/EDITOR_VNEXT_IMPORT_BOUNDARY_DECISION.md`; `../docs/EDITOR_GENERATION_BOUNDARY_MAP.md`; `../docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md`; `src/editorBridge/runtime.ts`; `tests/editorBridgeRuntime.test.ts`; `../src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts`; `../src/app/editor/_components/vnextBridge/__tests__/editorVNextBridgeHost.test.ts`; `../src/app/editor/_components/vnextBridge/editorGenerationReadiness.ts`; `../src/app/editor/_components/vnextBridge/__tests__/editorGenerationReadiness.test.ts`; `../src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationPilot.test.ts` |
| 12 | Move to new repository | pending | repository extraction checklist |

## Current Rule

This workspace should prefer isolated vNext implementation over reuse.
Current/prototype structures are reference evidence only and are not accepted
inputs for exported core. The canonical persisted input is
`FlowDocPackage.packageVersion = 2` with `document.version = 3`. Any future
one-off converter must live outside exported core and outside required vNext
checks.

## Phase 10 Close

Phase 10 is closed for the vNext core pagination/export boundary. The close
audit is `docs/PHASE_10_CLOSE_AUDIT.md`. Current pagination/export work is
vNext-only and now has both a planning boundary and measured skeleton output:

- `buildVNextPaginationPlan(...)` produces page boxes, zone source order,
  source item split-policy hints, and measurement status.
- `paginateVNextDocument(...)` consumes the vNext plan and emits measured page
  fragments for body/static zones, forced page breaks, text-block line
  fragmentation, and basic page-number inline resolution.
- `measureVNextText(...)` defines the vNext text measurement boundary with
  stable cache keys, line boxes, measurement profiles, cache hit/miss metadata,
  and operation-driven cache invalidation.
- `columns` nodes now produce `widthShare`/gap-based container and child
  fragments instead of one opaque atomic fragment.
- `table` nodes now produce page-segment, row, cell, and measured text
  fragments with row-level page breaks and repeated header rows.
- over-tall breakable table rows whose cell children are text blocks now split
  by measured line ranges while `allowBreak=false` rows stay atomic and warn.
- table cell child policy is explicit for measured text, atomic spacer/divider,
  generated TOC, and ignored page-break nodes.
- `buildVNextMeasuredRendererConsumption(...)` converts measured fragments into
  renderer commands without accepting authored document input, and blocks when
  table fragments lack geometry, hierarchy, line-range, or table metadata.
- `assessVNextMeasuredPaginationExportReadiness(...)` reports ready,
  ready-with-warnings, or blocked from measured pagination warnings and
  renderer-consumption issues while preserving the no-relayout renderer
  contract.
- `docs/TABLE_PAGINATION_VNEXT_PLAN.md` locks the selected table direction as
  row-level pagination plus splittable cell text, with full table-engine work
  deferred until the B path is stable.
- `createApproximateVNextTextMeasurer(...)` provides deterministic measurement
  for tests and early local integration without importing the parent runtime.
- `buildVNextExportPlan(...)` declares that PDF and DOCX consume measured
  pagination output and must not relayout.
- `resolveVNextPaginationInvalidation(...)` maps operation results to stale or
  unchanged pagination/export readiness.

This phase intentionally does not import the parent layout engine, provide a
renderer-backed measurement profile implementation, split non-text table cell
content across pages, balance columns across multiple pages, finalize TOC page
references, or render PDF/DOCX beyond the measured-fragment consumption
contract.

## Phase 11 Next Boundary

Phase 11 starts with `../docs/EDITOR_VNEXT_RUNTIME_BRIDGE_PLAN.md`. It must
connect the current editor runtime to the vNext core through an explicit bridge
without making legacy/current runtime structures the vNext source of truth. The
first implementation target should be a read-only vNext bridge runtime inside
`vnext-workspace`, not a parent editor runtime flip.

Current Phase 11 progress:

- `createVNextEditorBridgeRuntime(...)` and
  `safeCreateVNextEditorBridgeRuntime(...)` build a read-only bridge runtime
  from canonical vNext package input only.
- The bridge runtime includes relationship graph, measured pagination,
  renderer-consumption audit, export readiness, and supported operation kinds.
- Raw/current runtime document input is rejected by the bridge parser.
- Import boundary is locked: do not move repo yet, do not add this folder to
  root workspaces yet, and allow parent editor imports only through the Phase
  11.3 bridge host.
- Parent editor bridge host is implemented as a read-only bounded snapshot API.
- Editor/generation boundary mapping is documented in
  `../docs/EDITOR_GENERATION_BOUNDARY_MAP.md`: editor-authored template truth,
  generation request truth, bound runtime view, measured pagination,
  renderer-consumption, and output artifacts are separate.
- Current `/api/paginate` and `/api/export` remain current-runtime-shaped
  endpoints; the vNext bridge remains canonical-package-only.
- First read-only generation diagnostic consumer is implemented in the parent
  app. It calls the bridge host, records request data as not consumed, and
  reports no editor state/history/selection/pagination/canvas/API side effects.
- First mutating operation pilot is implemented through the parent bridge host.
  It runs `text-block.text.replace`, returns validation/history-ready/scope and
  render-invalidation metadata, and reports no current editor state/history/
  selection/pagination/canvas/API side effects.
- Runtime flip review gate is documented in
  `../docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md`. It passes Phase 11 as a
  bridge-readiness baseline and blocks visible editor runtime flip until a
  separate post-Phase-11 plan resolves reducer state, history, canvas,
  selection, WYSIWYG, pagination, and export/API dependencies.

## Phase 9 Baseline

Current operation commands are graph-backed and canonical-only:

- `node.delete`
- `node.duplicate`
- `node.reorder`
- `columns.insert`
- `columns.layout.patch`
- `text-block.insert`
- `text-block.text.replace`
- `table.row.insert`
- `table.row.delete`
- `table.column.insert`
- `table.column.delete`

They return validation policy, history policy, render invalidation, and graph
scope metadata. `createVNextOperationHistoryRecord(...)` converts committed and
rejected operation results into JSON-serializable history-ready records.
`appendVNextOperationHistoryRecord(...)` and
`replayVNextOperationHistory(...)` provide an in-memory replay contract. This
does not persist durable operation history or integrate with the current editor
runtime yet.
