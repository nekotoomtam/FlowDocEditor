# Fixture Catalog

This catalog maps current test fixtures to the product and engine behaviors they
protect. Use it before adding a new fixture so related coverage stays named and
discoverable.

Use this document together with `docs/PRODUCT_SCENARIOS.md` and
`docs/TEST_STRATEGY.md`.

## Current Suite Snapshot

Last verified full-suite size:

- 26 core test files / 321 core tests
- 9 app test files / 106 app tests

Historical counts in `docs/WORK_LOG.md` may be older. Treat this catalog and
`docs/TEST_STRATEGY.md` as the current coverage snapshot until the suite changes.

## Product Fixture Map

| Fixture | Test file | Protects |
|---|---|---|
| `customs-basic-table` | `packages/core/src/pagination/__tests__/tablePagination.test.ts` | multi-page customs table, repeated headers, footer page number |
| `customs-page-count-golden` | `packages/core/src/pagination/__tests__/productGolden.test.ts` | exact customs page count baseline, repeated header count, footer page numbers, table column geometry |
| `customs-export-golden` | `packages/core/src/renderer/__tests__/productExportGolden.test.ts` | PDF page count parity with pagination, repeated table row/header geometry before render, DOCX table row structure |
| `customs-rowspan-boundary` | `packages/core/src/pagination/__tests__/tablePagination.test.ts` | rowspan-linked rows near a page boundary |
| `customs-breakable-row-uneven-cells` | `packages/core/src/pagination/__tests__/tablePagination.test.ts` | breakable row with long and short cells, no duplicated short-cell content |
| `report-cover-toc-body` | `packages/core/src/renderer/__tests__/multiSection.test.ts` | cover, TOC, body section restart, display page numbers |
| `report-page-count-golden` | `packages/core/src/pagination/__tests__/productGolden.test.ts` | exact cover/TOC/body page counts, body footer restart numbers, long paragraph continuation ranges |
| `report-export-golden` | `packages/core/src/renderer/__tests__/productExportGolden.test.ts` | PDF page count parity for cover/TOC/body output with embedded Thai runtime font |
| `report-long-thai-paragraph` | `packages/core/src/pagination/__tests__/paginator.test.ts` | Thai paragraph continuation across pages |
| `report-keep-with-next` | `packages/core/src/pagination/__tests__/keepWithNext.test.ts` | heading kept with following paragraph |
| `report-docx-structure` | `packages/core/src/renderer/__tests__/multiSection.test.ts` | DOCX section boundaries and editable document XML |

Product fixture names should stay visible in test descriptions, such as
`product fixture - customs-basic-table`.

## Core Test Files

### Document Model And Operations

- `packages/core/src/binding/index.test.ts`
- `packages/core/src/dataSnapshot/index.test.ts`
- `packages/core/src/document/normalize.test.ts`
- `packages/core/src/document/operations.test.ts`
- `packages/core/src/fieldRegistry/index.test.ts`
- `packages/core/src/readiness/index.test.ts`

Protects scalar field binding, authored document validity, normalization
defaults, table grid operations, and operation-level invariants. Operation
coverage includes table row/column insertion, deletion cleanup, width
preservation, header-row clamping, last-row/last-column guards, and inline
`fieldRef` insertion in body and table-cell paragraphs. Field registry coverage
collects body/table fieldRef usages and validates duplicate keys, missing
definitions, and non-inline field targets. Data snapshot coverage validates
scalar values, readiness warnings, invalid value types, enum options, and
unsupported image/collection values. Binding coverage locks scalar `fieldRef`
replacement from legacy nested data and from flat `DataSnapshotV1` values,
including snapshot fallback and invalid-value fallback behavior. Readiness
coverage combines registry issues and document-scoped snapshot issues for
non-blocking editor feedback; repeat and nested binding remain deferred.

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
- `packages/core/src/pagination/__tests__/productGolden.test.ts`

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
- `packages/core/src/renderer/__tests__/productExportGolden.test.ts`

Protects PDF/DOCX smoke behavior, renderer input contract, text flow, multiple
sections, page-number restarts, TOC output, DOCX structural XML checks, product
PDF page-count parity, and product DOCX table row structure.

## App Test Files

- `src/app/api/__tests__/exportPaginate.test.ts`
- `src/app/editor/_components/__tests__/comparePagination.test.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/__tests__/inlineEditBlur.test.ts`
- `src/app/editor/_components/__tests__/inlineEditCaret.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`

Protects API route validation/render contracts, document package persistence,
drift comparison, inline edit lifecycle and continuation helpers, paragraph
text surface policy, WYSIWYG caret mapping, and internal text interaction
policy. API smoke coverage checks `/api/paginate` asserted JSON output plus
`/api/export` PDF/DOCX headers and artifact readability. Persistence coverage
checks document-first `FlowDocPackage v1`, proposal-aligned
`FlowDocPackage v2`, legacy raw `DocumentNode v1` import, normalize/validate
behavior, invalid JSON, unsupported versions, invalid package structure,
package/document id agreement, current `localStorage` key behavior,
localStorage package v2 save/load, v2 field registry preservation, default
JSON package serialization as v2, field-registry-preserving package v2 export,
package v2 data snapshot preservation for localStorage/export/import, invalid
package data snapshot rejection, safe package filenames, and import status
messages. It also covers inline `fieldRef` package round-tripping, legacy raw
document migration into the current `FlowDocPackage v2`, legacy package v1
migration to package v2, package v2 migration idempotence, v2 registry warning
propagation, v2 registry warning import status, and v2 registry hard-error
rejection.
Real-font drift coverage loads
`public/fonts/THSarabun.ttf` into Chromium canvas and fontkit, then checks
representative Thai width parity and no `comparePagination` drift for a Thai
document. Editor feel still needs focused browser smoke checks for selection,
typing, undo/redo, flicker, and table panel workflows.

## Browser Smoke Scripts

- `scripts/editor-smoke.mjs`

Protects the default `/editor` load path with a real browser, deterministic
localStorage document fixtures, paragraph inline edit commit, undo/redo, table
cell selection, the property-panel title, table-cell row/column insert/delete
controls, localStorage package v2 autosave, Fill mode readiness warning/clear
behavior for a required used field, package v2 data snapshot autosave for
filled values, active package-registry field palette loading, and property-panel
fieldRef inspection for selected document fields. It starts its own Next dev
server on port `4010` unless
`SMOKE_BASE_URL` is provided.

This is intentionally a focused workflow smoke, not a fixture catalog for every
editor scenario.

## Coverage Gaps

Known gaps:

- visual regression tests for PDF/editor parity
- broad automated browser workflow regression suite beyond the first editor
  smoke
- DOCX semantic heading/style assertions
- broader automated table-cell property-panel regression coverage beyond the
  row/column smoke path
- broader real-font visual parity checks beyond width/pagination drift

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
