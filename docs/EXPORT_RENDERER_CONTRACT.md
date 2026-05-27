# Export Renderer Contract

This contract defines how FlowDocEditor should turn an authored document into
PDF and DOCX output. It keeps export behavior aligned with the core layout
engine instead of letting each renderer become its own layout system.

Use this document together with `docs/LAYOUT_ENGINE_SPEC.md`,
`docs/ARCHITECTURE_OVERVIEW.md`, and `docs/TEST_STRATEGY.md`.

## Ownership

The export pipeline is:

```txt
DocumentNode
  -> assertDocument
  -> paginateDocument(...)
  -> assertPaginatedDocument
  -> renderer consumes PaginatedDocument
  -> binary output
```

API routes own validation, server measurement setup, pagination, assertion, and
format selection.

Renderers own target-format drawing/serialization. They do not own layout
decisions.

## API Boundary

`src/app/api/export/route.ts` should:

- validate the incoming authored document with `assertDocument`
- paginate with the server measurement stack, currently fontkit plus
  `thaiWordBreaker`
- call `assertPaginatedDocument` before rendering
- fail closed with a non-200 JSON response and code `FONT_FALLBACK_BLOCKED`
  when the default runtime font is unavailable
- fail closed with a non-200 JSON response and code `LAYOUT_WARNINGS_BLOCKED`
  when authoritative server pagination emits blocking layout warnings such as
  forced table split overflow
- allow non-blocking layout warnings, including header/footer reserved overflow
  where PDF clips the overflow and DOCX may reflow or show extra content
- return a visible failure instead of silently producing invalid output when
  layout assertions fail

`src/app/api/paginate/route.ts` is the sibling authoritative pagination path for
editor status and drift comparison. Export should stay aligned with it.

The editor should block or clearly warn before calling `/api/export` when the
current preview document has not completed server pagination, when font fallback
is active, when browser/server drift changes page breaks, paragraph
continuations, line wrapping, split boundaries, or tracked geometry across
body, header, footer, or TOC fragments, when layout fragment warnings such as
forced table split overflow are present, or when Fill mode has blocking
data-readiness errors or missing required values.
Header/footer reserved overflow should be visible as a warning but should not
block export by itself: PDF clips to the reserved zone, while DOCX preserves the
header/footer structure and may reflow in Word.
After `/api/paginate` reconciles the current preview document, editor export
readiness should use the server-returned layout warnings as authoritative
instead of stale or optimistic browser-preview warnings.

## Renderer Rules

Renderers must consume `PaginatedDocument` as the layout source of truth.
DOCX may additionally receive the already-validated authored `DocumentNode`
from the export API for source text serialization only; it must not use that
document input to recompute layout, page breaks, or row splits.

Renderers must not decide:

- page breaks
- line breaks
- paragraph continuation boundaries
- table row split boundaries
- repeated table header placement
- page-number context

Renderers may:

- convert units for the target format
- map FlowDoc fragments into PDF drawing commands or DOCX XML structures
- adapt unsupported target features with documented limitations
- surface target-specific errors clearly

If a renderer needs layout information that is missing from
`PaginatedDocument`, the fix should usually be to enrich pagination output or
shared renderer metadata, not to recompute layout inside the renderer.

Renderer implementation modules should not import document operations,
`paginateDocument`, text measurers, or word breakers. A renderer may import
document schema types only for explicitly documented source-serialization paths
such as DOCX source paragraph text. Tests may build authored fixtures and
paginate them before rendering.

## PDF Contract

PDF is the authoritative final output target.

PDF should:

- follow server/export pagination closely
- preserve page count, page order, fragment order, and page-number text
- draw resolved header/footer text from `page.headerFragments` and
  `page.footerFragments` in the same pagination output the editor preview shows
- draw paragraph, row, stack, table, table-row, and table-cell fragments from
  paginated geometry
- draw authored divider fragments from `dividerRenderProps`
- skip authored page-break marker chrome while preserving the page count and
  fragment order produced by pagination
- draw authored paragraph box fill, padding, and border from paginated paragraph
  metadata when paragraph box style is enabled
- draw authored Flow Table cell box fill and border from paginated
  `flow-table-cell` metadata
- preserve repeated headers and table split slices produced by pagination
- treat renderer smoke failures as product-blocking for export work

PDF may still have target-specific drawing limitations, but visual drift from
authoritative pagination should be treated as a bug unless explicitly accepted.

PDF rendering may process already-paginated pages in fixed-size batches for
responsiveness, profiling, and future progress reporting. The batch boundary
must be a render execution detail only: it must not change page order, page
count, fragment geometry, font selection, layout warnings, export response
shape, or the requirement that export receives a complete asserted
`PaginatedDocument`. The current default PDF render batch size is 20 pages.
Because the current renderer uses `pdf-lib`, final `save()` still produces a
whole PDF buffer at the end; batched rendering is not true streaming.

Successful `/api/export` responses may include an
`X-FlowDoc-Export-Profile` header with compact timing and size metadata for the
completed export. This header is observability metadata only: clients must not
use it as a layout source of truth, and its presence must not change the binary
PDF/DOCX body or content-disposition behavior.

Large-export classification is also observability only. Fewer than 100 pages is
standard, 100 to 299 pages is large, and 300 or more pages is very-large. These
tiers may guide whether to investigate page batching, chunked PDF merge,
background export jobs, true streaming, or a renderer/library change, but they
must not by themselves change pagination semantics or block a successful export.

### Future Follow-Up: Real-Data Export Performance

Current long-document export timing is a useful stress baseline, but it should
not be treated as final performance architecture until real field/data binding
and image-heavy documents exist. When those inputs are available, revisit export
performance using the API export profile fields (`pageCount`, `fragmentCount`,
`paginateMs`, `renderMs`, `pdfPageRenderMs`, `pdfFinalizeMs`, and `totalMs`) to
identify whether the bottleneck is data binding, pagination, PDF page drawing,
PDF finalization, or download preparation.

Likely follow-up options are:

- surface or persist export profiles for real customer-like documents
- add server-originated progress reporting through a job, polling, or streaming
  design instead of client-only staged feedback
- evaluate reusing authoritative `/api/paginate` output by document hash when
  the preview document has already been checked
- make PDF page batch size configurable for benchmarking before changing the
  default
- investigate `pdf-lib` finalization and zero-width glyph patching only if
  `pdfFinalizeMs` is a measured bottleneck

## DOCX Contract

DOCX is an exchange format, not a pixel-perfect layout target.

DOCX should:

- preserve document order and section boundaries
- build Word sections from authored FlowDoc sections, not from computed
  paginated pages; computed page boundaries are for preview/PDF and should not
  become DOCX page or section breaks
- merge computed paragraph fragments back toward one editable Word paragraph
  per logical paragraph where renderer metadata is sufficient, and avoid
  serializing FlowDoc soft-wrap boundaries as DOCX line breaks or extra spaces
- prefer authored paragraph text and inline text-run style from the validated
  source document when the export API provides it, preserving hard newlines as
  Word line breaks while keeping page-number paragraphs on the paginated
  fallback path until Word fields are implemented
- preserve editable paragraphs, headings, simple tables, headers, footers, and
  TOC text where possible
- preserve paragraph box fill and border where possible, and approximate
  paragraph padding only through documented Word-compatible formatting
- preserve the overall layout of `flow-row` / `flow-stack` slices where
  possible by projecting them to fixed-layout Word tables from paginated
  geometry, including stack widths and inter-stack gaps
- `flow-row` and `flow-table` rows may relax Word row pagination controls,
  avoiding `cantSplit` and using at-least row heights instead of exact row
  heights, so Word/LibreOffice can use remaining page space after its own text
  reflow instead of moving a large editable row wholesale to the next page
- preserve the overall layout of `flow-table` slices where possible by
  projecting paginated row/cell fragments to fixed-layout Word tables, including
  repeated header fragments, minimum row heights, cell widths, fills, borders,
  and padding metadata
- preserve authored Flow Table block alignment and top/bottom margins in DOCX
  when the renderer receives the source document alongside paginated geometry
- map repeated Flow Table headers to Word table header rows only when authored
  header repetition is enabled; when `repeatHeaderRows=false`, DOCX must not
  emit `w:tblHeader` for those authored header rows
- preserve Flow Table span semantics where possible from renderer-facing
  pagination metadata, mapping `colspan` to Word `gridSpan` and `rowspan` to
  Word vertical merge metadata
- preserve authored divider nodes as Word paragraph borders with compatible
  before/after spacing
- preserve authored page-break nodes as hard Word page breaks, while continuing
  to ignore computed pagination breaks
- emit valid DOCX ZIP output
- keep page/section structure useful for review workflows
- document where Word/LibreOffice may reflow content after opening
- embed catalog font files through the DOCX font table when the server export
  API provides a renderer `fontProvider`, including bold, italic, and
  bold-italic variants when the catalog provides those files and the document
  uses those paragraph or text-run styles; ad-hoc/browser DOCX rendering without
  a provider remains name-only

DOCX may differ from PDF/editor preview because the reader application owns
final text reflow, font metrics, and page layout after the file is opened.
The DOCX renderer may serialize paginated line text back into editable Word
paragraphs where useful, but it must not treat that serialization step as a new
FlowDoc line-breaking or page-breaking policy.

DOCX correctness is structural usefulness. PDF correctness is final visual
authority.

## Font Fallback

Server/export pagination should prefer project-controlled fonts. If the expected
font cannot be loaded, the API may fall back to Helvetica/dev metrics, but that
state must be visible.

Current behavior:

- authoritative runtime fonts live under `public/fonts/` and are resolved by
  `packages/core/src/font-registry.ts`
- the default font key resolves to `public/fonts/Sarabun/Sarabun-Regular.ttf`
- the first selectable catalog contains `Sarabun` and `Noto Sans Thai`
- legacy or unknown font keys are normalized by the registry fallback to
  `Sarabun`; old TH Sarabun font files are no longer part of the active runtime
  font contract
- catalog font entries mark export support separately: PDF is embedded, while
  DOCX is `embedded-variants` for server exports that receive a font provider
- API routes load fonts from `process.cwd()/public/fonts/...` through the shared
  API runtime font loader and measure text with the requested paragraph
  `fontFamilyKey` when that catalog font is available
- `/api/export` passes the same runtime `fontProvider` to PDF and DOCX renderers;
  DOCX exports therefore include `word/fonts/*.odttf` for regular and requested
  style-variant catalog fonts used by paginated paragraph/header/footer
  fragments
- browser font CSS and browser fontkit measurement load from `/fonts/...` using
  the same registry
- paragraph-level bold and italic styles use catalog font variants for
  browser/server measurement and PDF rendering when those variant files exist;
  underline, strikethrough, and text color are renderer decoration/paint metadata
  rather than separate font variants
- DOCX exports serialize paragraph-level and text-run-level bold, italic,
  underline, strikethrough, text color, font family, and font size run
  properties, and embed matching catalog font variants where the selected font
  family provides them; missing variants fall back to regular embedding plus
  Word/LibreOffice style synthesis
- the API logs the missing font path/error server-side
- `/api/paginate` exposes `X-FlowDoc-Font: fallback` when it must use fallback
  metrics
- `/api/export` returns a non-200 JSON response with code
  `FONT_FALLBACK_BLOCKED` when the default runtime font is missing
- editor status should make fallback understandable to the user

Thai measurement/rendering under fallback can be wrong. Do not treat fallback
output as proof of Thai layout fidelity.

## Required Behaviors

The export path should preserve the behaviors protected by product fixtures:

- section-local page numbers and restarts
- cover/TOC/body section boundaries
- TOC entries with display page numbers
- long Thai paragraph continuation
- keep-with-next headings
- multi-page tables with repeated headers
- breakable table rows without duplicated short-cell content
- rowspan-linked groups staying together under the current policy
- table-cell paragraph page-number resolution

## Verification

Choose the smallest verification that protects the changed layer.

- Renderer implementation change:
  - focused renderer tests
  - full test command for meaningful behavior risk
- API export/pagination boundary change:
  - route-focused check or export smoke
  - renderer tests if `PaginatedDocument` shape changes
  - browser status check if editor-visible warnings changed
- Product scenario export change:
  - update `docs/PRODUCT_SCENARIOS.md`
  - update `docs/FIXTURE_CATALOG.md`
  - add or adjust focused fixtures
- Renderer dependency change:
  - confirm production renderer code still accepts only `PaginatedDocument`
  - move any layout measurement, pagination, or schema interpretation back to
    core pagination/API before merging

Current automated coverage includes API route contract smoke, PDF/DOCX smoke,
source, paginated, multi-page body, Flow Table cell, header, and footer DOCX
rich text run property checks, server DOCX font variant embedding checks,
authored divider/page-break PDF and DOCX checks,
product PDF page-count parity smoke, product DOCX table-row structure smoke,
multi-section DOCX structure tests, focused paragraph box PDF drawing primitive
tests, and an opt-in PDF raster visual regression gate for paragraph box fill,
solid/dashed/dotted border pixels, split paragraph box edge pixels, and
flow-row/flow-stack fill, border, and gap pixels when a local PDF rasterizer is
available. Missing coverage includes broad pixel-level PDF/editor parity and
broader DOCX semantic style checks outside the representative rich-run fixtures.

## Deferred Work

- Broader visual regression tests for representative PDF fixtures.
- Automated browser-to-export parity checks.
- DOCX semantic heading/style assertions beyond current structural checks.
- Clearer per-run font fallback reporting for mixed-font documents.
- Richer export artifact inspection for table geometry and page count parity.
- Broader DOCX semantic style inspection for more complex table mixed-run
  fixtures.
