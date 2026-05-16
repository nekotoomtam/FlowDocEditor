# Product Scenarios

FlowDocEditor is designed around real Thai document workflows where layout
correctness matters more than free-form page design. These scenarios are the
product north star: engine behavior, editor UX, test fixtures, and renderer
trade-offs should be evaluated against them.

For the broader product direction, including why FlowDocEditor should become a
workflow-ready editor rather than remain only a document generator, see
`docs/PRODUCT_DIRECTION.md`.

This document is intentionally fixture-oriented. A good scenario should be
specific enough that a future developer can build a sample `DocumentNode`, write
pagination/export tests, and know what "correct" means without rereading the
whole codebase.

Reusable table authoring and editor operation rules live in
`docs/TABLE_EDITING_CONTRACT.md`.

Project-wide test levels and QA expectations live in `docs/TEST_STRATEGY.md`.

Current fixture-to-test ownership lives in `docs/FIXTURE_CATALOG.md`.

## Scenario Quality Bar

Each product scenario should answer:

- Who uses this document, and what outcome do they need?
- Which document structures must the template support?
- Which data shapes must filling/binding support?
- Which layout and pagination behaviors are required?
- Which renderer outputs are authoritative?
- Which edge cases must have regression tests?
- Which limitations are acceptable and should not be treated as bugs?

## Scenario 1: ใบขน (Customs Declaration Form)

### User Goal

A template designer builds a dense customs declaration form once. Operators then
fill shipment data into stable fields and export a print-ready PDF that matches
the official layout.

The form behaves more like a fixed regulatory form than a word-processing
document. Reflow is limited and controlled; table grid correctness is the
priority.

### Primary Users

- Template designer: defines the fixed table structure, cell spans, headers,
  borders, and field positions.
- Data-entry operator: fills shipment values and exports a PDF.
- Reviewer/customs officer: inspects the printed or PDF form.

### Template Shape

- One document section, usually A4 portrait.
- A small static header area with:
  - form title
  - declaration/reference number
  - optional importer/exporter summary fields
- One large table that may span many pages.
- Table rows include:
  - static label cells
  - field value cells
  - item-list rows
  - summary/totals rows
- Table uses:
  - fixed column widths
  - cell borders
  - `rowspan` and `colspan`
  - repeating header rows
  - breakable long item rows only when explicitly allowed
- Footer contains page number such as `หน้า X`.

### Representative Data

Minimum useful fixture data:

- `declarationNo`: `A-2026-000123`
- `importer.name`: Thai company name
- `importer.taxId`: 13-digit number
- `invoiceNo`: mixed Latin/numeric identifier
- `items[]`: 40-120 line items
- each item:
  - `description`: Thai or mixed Thai/English text
  - `hsCode`: numeric string
  - `quantity`: number
  - `weight`: number
  - `value`: currency amount
- `totals`: quantity, weight, amount

### Required Engine Capabilities

- Table grid invariants must hold after edit operations.
- Template designers must be able to select table cells from the canvas and edit
  cell-level props without accidentally editing only the internal paragraph.
- Adding or removing table columns must preserve the total table width unless a
  future explicit resize action is used.
- `rowspan` groups must stay together across page boundaries.
- Repeating table headers must appear on continuation pages.
- Breakable rows must split without duplicating shorter cell content. Single-row
  item rows are breakable by default unless explicitly marked `allowBreak=false`.
- Table-cell paragraph fragments must preserve text and page-number fields.
- Header/footer fragments must use resolved page numbers.
- PDF output must consume authoritative pagination, not browser/CSS flow.

### Pagination Expectations

- Table starts at the authored position inside the content box.
- Header rows repeat on every page where table body rows continue.
- Rows with omitted `allowBreak` or `allowBreak=true` may split by cell paragraph
  line boundaries.
- Rows with `allowBreak=false` move as a unit to the next page.
- Short cells in a split row appear only once; they do not repeat on every
  continuation slice unless they are header cells.
- Rowspan groups are atomic even if a single logical row would otherwise split.
- Footer page numbers increment by physical page.

### Export Expectations

- PDF is the authoritative output for this scenario.
- PDF should match editor/server pagination and preserve table geometry as
  closely as possible.
- DOCX is not a primary output for customs forms. If generated, it is an
  exchange approximation and may reflow.

### Acceptance Checks

- A 3-page item table repeats its header row on pages 2 and 3.
- A breakable row with one short cell and one long cell does not duplicate the
  short cell text on continuation pages.
- A `rowspan=2` group near the bottom of a page moves together or is handled by
  the documented too-tall overflow policy.
- Adding/removing rows and columns keeps `assertDocument` and
  `assertPaginatedDocument` green.
- Adding/removing columns preserves total table width so a fixed form does not
  silently grow beyond the page content box.
- A selected cell exposes cell-level authoring controls: text, padding,
  background, vertical alignment, row operations, and column operations.
- PDF export succeeds and keeps the same page count as authoritative
  pagination.
- Header/footer page-number fields show the correct page number on every page.

Current automated coverage:

- Pagination and structural behavior are covered by the product fixtures in the
  roadmap below.
- Table operation width preservation is covered in `tablePagination.test.ts`.
- Current editor table-cell selection and property-panel flow is browser-checked;
  it does not yet have an automated UI regression test.
- PDF export is currently covered by renderer smoke tests, not by customs-specific
  visual/page-count golden tests.
- Pixel-level PDF/editor visual comparison remains future visual regression work.

### Known Acceptable Limitations

- DOCX visual fidelity is not required.
- Browser preview may temporarily drift during editing, but must reconcile back
  to server/API pagination.
- Thai shaping is limited by the current text measurement/rendering stack; use
  project fonts and document any fallback behavior.

## Scenario 2: รายงานราชการ (Government Report)

### User Goal

An author creates a formal Thai government report with a cover, table of
contents, headings, body paragraphs, simple tables, and page numbering. The
document must export to a print-ready PDF and an editable DOCX draft for review.

This scenario behaves like a structured word-processing document. Paragraph
reflow, section page numbering, TOC correctness, and export structure are the
priority.

### Primary Users

- Author: writes and edits report content.
- Template designer: defines cover, margins, header/footer style, and heading
  styles.
- Reviewer: receives DOCX drafts and may edit in Word/LibreOffice.
- Publisher/admin: exports final PDF for submission or printing.

### Template Shape

- Section 1: cover page
  - title
  - organization name
  - date or reporting period
  - no normal header/footer
- Section 2: table of contents
  - `toc` node generated from heading paragraphs
  - may use roman/independent numbering in future
- Section 3: body
  - `pageNumberStart=1`
  - heading levels 1-3
  - paragraphs with Thai and mixed Thai/English text
  - simple data tables
  - optional appendix sections
- Header/footer:
  - first body page may differ from later pages
  - repeating header may include document title or organization name
  - footer contains `หน้า X`

### Representative Data

Minimum useful fixture data:

- `organization.name`: Thai organization name
- `report.title`: report title
- `report.period`: date range
- `documentNo`: reference number
- 8-20 headings across levels 1-3
- body paragraphs with:
  - Thai text
  - mixed Thai/English product or project names
  - numbers and dates
  - long paragraphs that split across pages
- 1-3 simple tables with header rows

### Required Engine Capabilities

- Section-level page numbering and restart rules.
- TOC generation from `headingLevel`.
- TOC page numbers that respect section restarts.
- `keepWithNext` for headings.
- Widow/orphan control for paragraph splitting.
- Paragraph continuation across pages by measured line boundaries.
- Header/footer page-number resolution.
- PDF and DOCX renderers consuming `PaginatedDocument`.
- DOCX preserving structural section/page boundaries even though Word may
  reflow content.

### Pagination Expectations

- Cover page is isolated from normal body header/footer rules.
- TOC entries point to the display page numbers, not raw global indices.
- Body section can restart page numbering at 1.
- Headings with `keepWithNext=true` should not be stranded at the bottom of a
  page when the following paragraph moves.
- Long paragraphs split by measured lines while preserving source `nodeId` and
  fragment order.
- Header/footer page numbers use the section-local displayed page number.
- Simple tables may split according to table rules; complex spans are not the
  main report requirement.

### Export Expectations

- PDF is the final authoritative output.
  - Must preserve server/export pagination.
  - Must preserve page count, TOC page numbers, and header/footer text.
- DOCX is an editable exchange output.
  - Must preserve document order and section/page boundary structure.
  - Must preserve headings, paragraphs, simple tables, and TOC text as normal
    editable Word content where possible.
  - May reflow text when opened in Word/LibreOffice.
  - Does not guarantee pixel-perfect parity with PDF/editor preview.

### Acceptance Checks

- A cover + TOC + body fixture produces separate `PaginatedSection`s.
- Body section with `pageNumberStart=1` displays `หน้า 1` on its first page.
- TOC entries for body headings show restarted body page numbers.
- Header/footer page-number fields resolve correctly in body pages.
- A long Thai paragraph splits across at least two pages without losing lines.
- A heading with `keepWithNext=true` moves with the following paragraph when
  needed.
- PDF export succeeds and reflects authoritative pagination.
- DOCX export is a valid ZIP and `word/document.xml` contains section
  properties matching the expected section/page boundaries.

Current automated coverage:

- Pagination, TOC, long Thai paragraph, keep-with-next, and DOCX XML structure
  are covered by the product fixtures in the roadmap below.
- PDF export is currently covered by multi-section renderer smoke tests, not by
  report-specific PDF visual/page-count golden tests.
- DOCX semantic heading styles are not asserted yet; current DOCX coverage checks
  document order, section/page boundaries, and editable text presence.

### Known Acceptable Limitations

- DOCX may reflow text, table widths, and page breaks after opening in
  Word/LibreOffice.
- DOCX is not expected to preserve exact PDF coordinates.
- Browser preview may temporarily show optimistic pagination during editing, but
  must reconcile to server/API pagination.
- Advanced typography such as shaped text runs, glyph-level caret positions, and
  per-run fallback fonts are future text-engine work.

## Cross-Scenario Comparison

| Concern | ใบขน | รายงานราชการ |
|---|---|---|
| Primary output | PDF | PDF |
| Secondary output | None or approximate DOCX | Editable DOCX draft |
| Layout model | Fixed dense table | Reflowing structured document |
| Main structure | Multi-page table | Cover, TOC, body sections |
| Text volume | Mostly field values | Long paragraphs |
| Thai line breaking | Some cell text | Core requirement |
| TOC | No | Yes |
| Page-number restart | Usually no | Yes, body starts at 1 |
| Header/footer | Form header + page footer | First/default variants |
| Table complexity | High, spans and repeated headers | Simple grids |
| Main page-break risk | Table rows and rowspan groups | Paragraphs and headings |
| DOCX fidelity | Not required | Structural, not pixel-perfect |

## Fixture Roadmap

These fixtures are derived from the scenarios and should be kept in sync with
the executable test suite.
Use `docs/FIXTURE_CATALOG.md` for the wider test-file map and known coverage
gaps.

- [x] `customs-basic-table`: 2-page table, repeated header, page footer.
  - Covered by `product fixture — customs-basic-table` in
    `packages/core/src/pagination/__tests__/tablePagination.test.ts`.
- [x] `customs-page-count-golden`: exact customs table page count, repeated
  header count, footer page numbers, and fixed column geometry.
  - Covered by `product fixture — customs-page-count-golden` in
    `packages/core/src/pagination/__tests__/productGolden.test.ts`.
- [x] `customs-rowspan-boundary`: rowspan group near page bottom.
  - Covered by `product fixture — customs-rowspan-boundary` in
    `packages/core/src/pagination/__tests__/tablePagination.test.ts`.
- [x] `customs-breakable-row-uneven-cells`: long description cell plus short numeric
  cells.
  - Covered by `product fixture — customs-breakable-row-uneven-cells` in
    `packages/core/src/pagination/__tests__/tablePagination.test.ts`.
- [x] `report-cover-toc-body`: cover, TOC, body restart at page 1.
  - Covered by `product fixture — report-cover-toc-body` in
    `packages/core/src/renderer/__tests__/multiSection.test.ts`.
- [x] `report-page-count-golden`: exact cover/TOC/body page counts, restarted
  body footer page numbers, and long paragraph continuation ranges.
  - Covered by `product fixture — report-page-count-golden` in
    `packages/core/src/pagination/__tests__/productGolden.test.ts`.
- [x] `report-long-thai-paragraph`: Thai paragraph split across pages.
  - Covered by `product fixture — report-long-thai-paragraph` in
    `packages/core/src/pagination/__tests__/paginator.test.ts`.
- [x] `report-keep-with-next`: heading near page bottom with following paragraph.
  - Covered by `product fixture — report-keep-with-next` in
    `packages/core/src/pagination/__tests__/keepWithNext.test.ts`.
- [x] `report-docx-structure`: DOCX XML section boundary assertion.
  - Covered by `product fixture — report-docx-structure` in
    `packages/core/src/renderer/__tests__/multiSection.test.ts`.
- [x] `company-report`: saved FlowDoc package v2 with cover, scalar fieldRefs,
  filled data snapshot, header/footer, page numbers, and a multi-page KPI table.
  - Covered by `USER_REPORT_FIXTURES`, `userReportFixtures.test.ts`,
    `userReportExport.test.ts`, and the app import/export path test.
- [x] `government-report`: saved FlowDoc package v2 with cover, TOC, formal Thai
  body, `keepWithNext` heading, bordered table, and restarted footer page
  numbers.
  - Covered by `USER_REPORT_FIXTURES`, `userReportFixtures.test.ts`, and
    `userReportExport.test.ts`.
- [x] `university-report`: saved FlowDoc package v2 with cover, TOC, restarted
  body section, long Thai body continuation, and footer page numbers.
  - Covered by `USER_REPORT_FIXTURES`, `userReportFixtures.test.ts`, and
    `userReportExport.test.ts`.
- [x] `flow-row-export-golden`: multi-column `flow-row` with gap, styled
  `flow-stack` boxes, and content continuing across pages.
  - Covered by `product fixture — flow-row export preserves PDF page count and
    DOCX layout projection` in
    `packages/core/src/renderer/__tests__/productExportGolden.test.ts`.

## Coverage Matrix

| Requirement | Fixture/Test | Coverage Level |
|---|---|---|
| Customs multi-page table, repeated header, footer page number | `customs-basic-table` / `tablePagination.test.ts` | Structural pagination |
| Customs exact page count, repeated header count, footer page numbers, fixed column geometry | `customs-page-count-golden` / `productGolden.test.ts` | Product pagination golden |
| Customs rowspan group near page boundary | `customs-rowspan-boundary` / `tablePagination.test.ts` | Structural pagination |
| Customs breakable uneven row without duplicated short cells and with line-slice metadata | `customs-breakable-row-uneven-cells` + table-cell metadata tests / `tablePagination.test.ts` | Structural pagination |
| Customs table column insert/delete preserves total table width | table operation width tests / `tablePagination.test.ts` | Structural operation |
| Customs table cell can be selected and edited from the canvas | browser table-cell property-panel check | Manual editor UX |
| Report cover + TOC + body restart numbering | `report-cover-toc-body` / `multiSection.test.ts` | Structural pagination |
| Report exact cover/TOC/body page counts, restarted footer page numbers, long paragraph continuation ranges | `report-page-count-golden` / `productGolden.test.ts` | Product pagination golden |
| Report long Thai paragraph split | `report-long-thai-paragraph` / `paginator.test.ts` | Structural pagination |
| Report heading stays with next paragraph | `report-keep-with-next` / `keepWithNext.test.ts` | Structural pagination |
| Row/column paragraph currently remains atomic with the row | `rowStack.test.ts` | Structural pagination |
| Report DOCX section boundaries and editable text | `report-docx-structure` / `multiSection.test.ts` | DOCX XML structural |
| User-level company report package with data binding, pagination, PDF export, and app import/export path | `company-report` / `USER_REPORT_FIXTURES` + `userReportImportExport.test.ts` | Product package fixture |
| User-level government report package with Thai body, TOC, bordered table, and footer restarts | `government-report` / `USER_REPORT_FIXTURES` | Product package fixture |
| User-level university report package with cover/TOC/body restart and long Thai continuation | `university-report` / `USER_REPORT_FIXTURES` | Product package fixture |
| Flow-row/flow-stack multi-column export with gaps and styled stack boxes | `flow-row-export-golden` / `productExportGolden.test.ts` | Product export smoke |
| Flow-row/flow-stack PDF fill, border, and gap pixels | `pdfVisualRegression.test.ts` with `FLOWDOC_PDF_VISUAL_REGRESSION=1` | Opt-in PDF raster |
| PDF export does not throw for representative multi-section documents | renderer smoke tests | Smoke |
| PDF/editor pixel or page-count parity for product fixtures | future visual regression tests | Missing |
| DOCX semantic Word heading styles | future DOCX structure tests | Missing |

## Decision Rule

When a feature request, bug fix, or refactor conflicts with these scenarios,
prefer the behavior that protects:

1. authoritative pagination,
2. valid authored document structure,
3. PDF fidelity for both scenarios,
4. DOCX structural usefulness for reports,
5. editor UX that reconciles back to core output.
