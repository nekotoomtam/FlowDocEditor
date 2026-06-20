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
| 10 | Pagination/export integration | in_progress | `src/pagination/paginationPlan.ts`; `src/pagination/measuredPagination.ts`; `tests/paginationPlan.test.ts`; `tests/measuredPagination.test.ts` |
| 11 | Editor runtime bridge | pending | editor tests and smokes |
| 12 | Move to new repository | pending | repository extraction checklist |

## Current Rule

This workspace should prefer isolated vNext implementation over reuse.
Current/prototype structures are reference evidence only and are not accepted
inputs for exported core. The canonical persisted input is
`FlowDocPackage.packageVersion = 2` with `document.version = 3`. Any future
one-off converter must live outside exported core and outside required vNext
checks.

## Phase 10 Boundary

Current pagination/export work is vNext-only and now has both a planning
boundary and measured skeleton output:

- `buildVNextPaginationPlan(...)` produces page boxes, zone source order,
  source item split-policy hints, and measurement status.
- `paginateVNextDocument(...)` consumes the vNext plan and emits measured page
  fragments for body/static zones, forced page breaks, text-block line
  fragmentation, and basic page-number inline resolution.
- `createApproximateVNextTextMeasurer(...)` provides deterministic measurement
  for tests and early local integration without importing the parent runtime.
- `buildVNextExportPlan(...)` declares that PDF and DOCX consume measured
  pagination output and must not relayout.
- `resolveVNextPaginationInvalidation(...)` maps operation results to stale or
  unchanged pagination/export readiness.

This phase does not import the parent layout engine, provide production text
measurement, split tables/columns across pages, finalize TOC page references,
or render PDF/DOCX yet.

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
