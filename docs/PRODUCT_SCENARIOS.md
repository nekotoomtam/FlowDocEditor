# Product Scenarios

FlowDocEditor is designed around real Thai document workflows where layout
correctness matters more than free-form page design. These scenarios are the
product north star: engine behavior, editor UX, test fixtures, and renderer
trade-offs should be evaluated against them.

This document is intentionally fixture-oriented. A good scenario should be
specific enough that a future developer can build a sample `DocumentNode`, write
pagination/export tests, and know what "correct" means without rereading the
whole codebase.

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
- `rowspan` groups must stay together across page boundaries.
- Repeating table headers must appear on continuation pages.
- Breakable rows must split without duplicating shorter cell content.
- Table-cell paragraph fragments must preserve text and page-number fields.
- Header/footer fragments must use resolved page numbers.
- PDF output must consume authoritative pagination, not browser/CSS flow.

### Pagination Expectations

- Table starts at the authored position inside the content box.
- Header rows repeat on every page where table body rows continue.
- Rows with `allowBreak=false` move as a unit to the next page.
- Rows with `allowBreak=true` may split by cell paragraph line boundaries.
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
- PDF export succeeds and keeps the same page count as authoritative
  pagination.
- Header/footer page-number fields show the correct page number on every page.

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

These are suggested future fixtures derived from the scenarios:

- `customs-basic-table`: 2-page table, repeated header, page footer.
- `customs-rowspan-boundary`: rowspan group near page bottom.
- `customs-breakable-row-uneven-cells`: long description cell plus short numeric
  cells.
- `report-cover-toc-body`: cover, TOC, body restart at page 1.
- `report-long-thai-paragraph`: Thai paragraph split across pages.
- `report-keep-with-next`: heading near page bottom with following paragraph.
- `report-docx-structure`: DOCX XML section boundary assertion.

## Decision Rule

When a feature request, bug fix, or refactor conflicts with these scenarios,
prefer the behavior that protects:

1. authoritative pagination,
2. valid authored document structure,
3. PDF fidelity for both scenarios,
4. DOCX structural usefulness for reports,
5. editor UX that reconciles back to core output.
