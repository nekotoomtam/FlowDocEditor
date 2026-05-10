# Fixture Catalog

This catalog maps current test fixtures to the product and engine behaviors they
protect. Use it before adding a new fixture so related coverage stays named and
discoverable.

Use this document together with `docs/PRODUCT_SCENARIOS.md` and
`docs/TEST_STRATEGY.md`.

## Current Suite Snapshot

Last verified full-suite size:

- 19 core test files / 279 core tests
- 2 app test files / 21 app tests

Historical counts in `docs/WORK_LOG.md` may be older. Treat this catalog and
`docs/TEST_STRATEGY.md` as the current coverage snapshot until the suite changes.

## Product Fixture Map

| Fixture | Test file | Protects |
|---|---|---|
| `customs-basic-table` | `packages/core/src/pagination/__tests__/tablePagination.test.ts` | multi-page customs table, repeated headers, footer page number |
| `customs-rowspan-boundary` | `packages/core/src/pagination/__tests__/tablePagination.test.ts` | rowspan-linked rows near a page boundary |
| `customs-breakable-row-uneven-cells` | `packages/core/src/pagination/__tests__/tablePagination.test.ts` | breakable row with long and short cells, no duplicated short-cell content |
| `report-cover-toc-body` | `packages/core/src/renderer/__tests__/multiSection.test.ts` | cover, TOC, body section restart, display page numbers |
| `report-long-thai-paragraph` | `packages/core/src/pagination/__tests__/paginator.test.ts` | Thai paragraph continuation across pages |
| `report-keep-with-next` | `packages/core/src/pagination/__tests__/keepWithNext.test.ts` | heading kept with following paragraph |
| `report-docx-structure` | `packages/core/src/renderer/__tests__/multiSection.test.ts` | DOCX section boundaries and editable document XML |

Product fixture names should stay visible in test descriptions, such as
`product fixture - customs-basic-table`.

## Core Test Files

### Document Model And Operations

- `packages/core/src/document/normalize.test.ts`
- `packages/core/src/document/operations.test.ts`

Protects authored document validity, normalization defaults, table grid
operations, and operation-level invariants.

### Text Measurement

- `packages/core/src/layout/__tests__/measure.test.ts`

Protects paragraph measurement, line segments, Thai/mixed text behavior, field
segments, spacing, and grapheme fallback.

### Pagination And Layout

- `packages/core/src/pagination/__tests__/paginator.test.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `packages/core/src/pagination/__tests__/rowStack.test.ts`
- `packages/core/src/pagination/__tests__/fragmentMeta.test.ts`
- `packages/core/src/pagination/__tests__/widowOrphan.test.ts`
- `packages/core/src/pagination/__tests__/keepWithNext.test.ts`
- `packages/core/src/pagination/__tests__/pageNumbers.test.ts`
- `packages/core/src/pagination/__tests__/sectionPageNumbers.test.ts`
- `packages/core/src/pagination/__tests__/tocOverflow.test.ts`
- `packages/core/src/pagination/__tests__/splitTrace.test.ts`
- `packages/core/src/pagination/__tests__/drift.test.ts`
- `packages/core/src/pagination/__tests__/resizeConvergence.test.ts`
- `packages/core/src/pagination/__tests__/assertPaginated.test.ts`

Protects page placement, line continuation, metadata, keep rules, page numbers,
TOC overflow, drift reporting, table split behavior, row/stack behavior, resize
convergence, and paginated-output invariants.

`tablePagination.test.ts` also owns table row split accounting coverage for
uneven multi-cell splits, empty cells, spacer-before-paragraph cells, padded
cells, tall repeated headers, and line-range contiguity across continuation
fragments.

### Renderers

- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `packages/core/src/renderer/__tests__/textFlow.test.ts`
- `packages/core/src/renderer/__tests__/multiSection.test.ts`

Protects PDF/DOCX smoke behavior, renderer input contract, text flow, multiple
sections, page-number restarts, TOC output, and DOCX structural XML checks.

## App Test Files

- `src/app/editor/_components/__tests__/comparePagination.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Protects drift comparison and paragraph inline edit helper behavior. Editor
feel still needs focused browser smoke checks for selection, typing, undo/redo,
flicker, and table panel workflows.

## Coverage Gaps

Known gaps:

- visual regression tests for PDF/editor parity
- automated browser workflow regression suite
- product-fixture export golden checks for PDF page count and table geometry
- DOCX semantic heading/style assertions
- browser-to-server Thai font drift fixtures using real project fonts
- automated table-cell property panel regression coverage

These gaps are not permission to accept regressions. They identify where manual
browser smoke checks or focused artifact inspection may still be needed.

## Updating This Catalog

Update this file when:

- a new product fixture is added
- a fixture moves to another test file
- the full-suite test count changes
- a new test file becomes a named part of the verification strategy
- a known coverage gap is closed or intentionally deferred

Also update `docs/PRODUCT_SCENARIOS.md` when product acceptance expectations
change, and update `docs/WORK_LOG.md` for meaningful documentation/test work.
