# Product Scenarios

FlowDocEditor is designed for two primary document types used in Thai government
and commercial contexts. All layout, pagination, and feature decisions should be
evaluated against these scenarios.

---

## Scenario 1: ใบขน (Customs Declaration Form)

### Description

A multi-page customs declaration form used in Thai import/export processes.
The document is primarily a structured table where the user fills in field values.
Layout is fixed — the form structure does not reflow based on content length.

### Document Structure

- **Single large table** spanning multiple pages
- Fixed column widths and row heights (authored by the template designer)
- Table contains **rowspan and colspan** — cells merge across rows and columns
- **Repeating table header rows** on every continuation page
- No TOC, no heading hierarchy — the table is the document

### Field and Content Model

- Most cells contain **field references** (`fieldRef`) resolved from submission data
- Some cells contain static label text (Thai, printed as-is)
- A small number of cells may contain multi-line text that requires line wrapping
- Numeric values: quantities, weights, customs rates, total amounts

### Layout Characteristics

- Page size: A4, portrait
- Content is dense — many small cells, thin borders
- Row heights may be fixed (minHeight) or content-driven
- Some rows must stay together (rowspan groups must not split across pages)
- Breakable rows (`allowBreak=true`) for long item lists

### Export Requirements

- **PDF** is the primary output — pixel-perfect layout required
- The printed form must match the on-screen preview exactly
- DOCX export is not required for this scenario

### Header/Footer

- Standard page header with form title and document number on every page
- Footer with page number (`หน้า X`)
- First page may have a different header (cover information block)

### Key Layout Features Exercised

- Repeating table headers
- Rowspan/colspan grid invariants
- Multi-page table row splitting (`allowBreak=true`)
- Page numbering in footer
- Font rendering accuracy (Thai characters, Leelawadee)

---

## Scenario 2: รายงานราชการ (Government Report)

### Description

A full-format Thai government report: structured document with cover, table of
contents, numbered sections, body text, tables, and formal header/footer on
every page. The document reflows as content is edited.

### Document Structure

- **Cover page** (หน้าปก): title, organization name, date — no header/footer
- **Table of Contents** (สารบัญ): auto-generated from heading nodes, with page numbers
- **Body sections**: heading levels 1–3, body paragraphs, optional tables
- Multi-page — typically 10–100+ pages

### Heading Hierarchy

- **Level 1**: chapter title (e.g. "บทที่ 1 บทนำ") — large, bold
- **Level 2**: section heading — medium, bold
- **Level 3**: sub-section heading — regular, may be italic or underlined
- Headings use `keepWithNext=true` to avoid orphan headings at page bottom

### Field and Content Model

- Paragraphs contain authored text; may include `fieldRef` for organization name,
  date, or reference numbers
- Tables appear within sections for data presentation
- No complex cell spans required (simple grids)

### Layout Characteristics

- Page size: A4, portrait
- Standard Thai government margins (top/bottom ~25mm, left ~30mm, right ~20mm)
- Body font: Leelawadee (or TH Sarabun New equivalent)
- Line spacing: 1.5× or double spacing typical in government style
- Paragraphs reflow as text is edited

### Export Requirements

- **PDF** is the primary output — must be pixel-perfect, fonts embedded
- **DOCX** is secondary — for submitting editable drafts to reviewers;
  exact visual fidelity is not required (Word/LibreOffice may reflow)

### Header/Footer

- **First page**: no header, or a special header with organization logo/seal
- **Pages 2+**: repeating header with document title and section name;
  footer with `หน้า X` page number

### Key Layout Features Exercised

- TOC generation (headingLevel 1–3, auto fill with page numbers)
- `keepWithNext` for headings
- Paragraph splitting across pages (long body text)
- Header/footer with different first page
- Page numbering (body starts at page 1 or after TOC)
- PDF + DOCX dual export
- Thai text line breaking (Intl.Segmenter / wordcut)

---

## Design Implications

| Concern | ใบขน | รายงาน |
|---|---|---|
| Primary output | PDF only | PDF + DOCX |
| Layout model | Fixed table grid | Reflow paragraphs + sections |
| Text volume | Low (field values) | High (body paragraphs) |
| Thai line breaking | Rarely needed | Always needed |
| TOC | No | Yes |
| rowspan/colspan | Yes (complex) | No (or simple) |
| Repeating table header | Yes | Optional (data tables) |
| Page numbering | Footer only | Footer, TOC references |
| First-page header | Different | Different (or none) |
| Multi-page splitting | Table rows | Paragraphs + headings |

Both scenarios require pixel-perfect PDF output with Leelawadee font metrics.
DOCX is an exchange format for รายงาน only — visual fidelity is intentionally
not a guarantee.
