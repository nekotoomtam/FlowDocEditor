# Phase 10 Close Audit

Status: PASS for the vNext core pagination/export boundary.

This audit closes Phase 10 only for the extractable vNext core boundary. It
does not claim that concrete PDF/DOCX rendering, editor runtime integration, or
product-level smoke behavior is complete.

## Request To Plan Trace

```text
User request
  -> Node Model vNext Plan
    -> Phase 10: pagination/export integration
      -> Job item: prove measured pagination is the renderer/export truth
        -> Execution step: close audit before entering editor runtime bridge
```

Current position:

- Request: step back from the prototype and build a cleaner vNext document
  core that can move to a new repository.
- Plan: Node Model vNext Plan.
- Phase: Phase 10, pagination/export integration.
- Job item: close the vNext core pagination/export boundary.
- Status: PASS for core boundary; deferred renderer/product work is explicit.
- Why this item is current: Phase 10 now has planning, measurement,
  pagination fragments, table fragments, renderer-consumption audit, and export
  readiness gates. The next work should not keep adding Phase 10 scope without
  an acceptance boundary.
- Next transition: Phase 11 editor runtime bridge design and integration plan.

## Verdict

PASS:

- vNext has an isolated pagination/export boundary that does not import the
  parent editor runtime.
- Pagination output is measured fragments, not an implicit renderer relayout
  contract.
- Text wrap, table row placement, repeated headers, table cell text slices,
  and export readiness now have executable tests.
- Renderer-consumption audit can block export when measured fragments are not
  sufficient for a fragment-only renderer.

RISK:

- Measurement is still approximate unless a renderer-backed measurement profile
  is deliberately designed and added.
- Concrete PDF/DOCX rendering is not implemented.
- Editor runtime integration is still pending, so user typing/selection
  latency is not proven by this phase.

UNKNOWN:

- Product-level browser/editor behavior for the vNext core is not verified in
  this phase.
- Exact target renderer differences are not verified because no concrete
  renderer implementation exists yet.

## Acceptance Matrix

| Requirement | Status | Evidence |
|---|---|---|
| Page box, zone order, source item order, split policy, and export plan exist | PASS | `src/pagination/paginationPlan.ts`; `tests/paginationPlan.test.ts` |
| Operation results can invalidate pagination/export readiness | PASS | `resolveVNextPaginationInvalidation(...)`; `tests/paginationPlan.test.ts` |
| Text measurement has cache keys, line boxes, profiles, and invalidation | PASS | `src/pagination/textMeasurement.ts`; `tests/textMeasurement.test.ts` |
| Measured pagination emits page fragments and forced page breaks | PASS | `src/pagination/measuredPagination.ts`; `tests/measuredPagination.test.ts` |
| Page-number inline output is resolved from measured pagination | PASS | `tests/measuredPagination.test.ts` |
| Static header/footer zones are represented as measured fragments | PASS | `tests/measuredPagination.test.ts` |
| Columns emit child fragments using column geometry | PASS | `tests/measuredPagination.test.ts` |
| Table emits table segment, row, cell, and text fragments | PASS | `tests/measuredPagination.test.ts` |
| Table headers repeat as measured fragments without authored nodes | PASS | `tests/measuredPagination.test.ts` |
| Breakable over-tall text-cell rows split by measured line ranges | PASS | `tests/measuredPagination.test.ts` |
| `allowBreak=false` over-tall rows stay atomic and block export readiness | PASS | `tests/measuredPagination.test.ts`; `tests/exportReadiness.test.ts` |
| Table cell child policies are explicit for text, spacer, divider, TOC, and page-break | PASS | `tests/measuredPagination.test.ts` |
| Renderer consumption uses measured fragments, not authored document input | PASS | `src/pagination/rendererConsumption.ts`; `tests/rendererConsumption.test.ts` |
| Export readiness blocks on pagination and renderer-consumption blockers | PASS | `src/pagination/exportReadiness.ts`; `tests/exportReadiness.test.ts` |
| vNext pagination source stays isolated from parent runtime and old node names | PASS | `tests/measuredPagination.test.ts`; source guard checks |

## Deferred Work

The following items are intentionally deferred and should not prevent Phase 11
from starting:

- renderer-backed text measurement profile implementation;
- concrete PDF/DOCX renderer implementation;
- final TOC page-reference resolution;
- multi-page column balancing;
- non-text table-cell content splitting;
- `colspan` and `rowspan` grid pagination;
- schema rename from `table-row.props.height` to `minHeight`;
- product-level browser/editor acceptance smokes.

## Owner Decision Gates

Stop for owner review before:

- changing persisted schema fields such as `height` to `minHeight`;
- adding a renderer-backed measurement profile;
- declaring PDF/DOCX export production-ready;
- enabling `colspan` or `rowspan`;
- changing `allowBreak` default semantics;
- making editor runtime bridge code mutate current runtime paths.

## Phase 10 Close Criteria

Phase 10 is closed for the vNext core boundary when all of these stay true:

- `npm.cmd --prefix vnext-workspace run check` passes.
- `npm.cmd run type-check` passes from the parent repository.
- vNext source does not import parent editor runtime code.
- Canonical parser rejects old document versions and prototype node names.
- Export readiness cannot become `ready` when measured fragments require
  renderer-side layout inference.

## Next Phase

Move to Phase 11: Editor runtime bridge.

Initial Phase 11 objective:

```text
Connect the current editor runtime to the vNext core through an explicit bridge
without making legacy/current runtime structures the vNext source of truth.
```

The first Phase 11 job should be a bridge design plan, not direct reducer or
runtime edits.
