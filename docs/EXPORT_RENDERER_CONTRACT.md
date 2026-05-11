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
- expose font fallback through `X-FlowDoc-Font: fallback`
- return a visible failure instead of silently producing invalid output when
  layout assertions fail

`src/app/api/paginate/route.ts` is the sibling authoritative pagination path for
editor status and drift comparison. Export should stay aligned with it.

## Renderer Rules

Renderers must consume `PaginatedDocument` as the layout source of truth.

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

If a renderer needs information that is missing from `PaginatedDocument`, the
fix should usually be to enrich pagination output or shared renderer metadata,
not to recompute layout inside the renderer.

Renderer implementation modules should not import document schema, document
operations, `paginateDocument`, text measurers, or word breakers. Those
dependencies are a sign that layout policy is leaking into the renderer. Tests
may build authored fixtures and paginate them before rendering, but renderer
production code should remain `PaginatedDocument`-only.

## PDF Contract

PDF is the authoritative final output target.

PDF should:

- follow server/export pagination closely
- preserve page count, page order, fragment order, and page-number text
- draw paragraph, row, stack, table, table-row, and table-cell fragments from
  paginated geometry
- preserve repeated headers and table split slices produced by pagination
- treat renderer smoke failures as product-blocking for export work

PDF may still have target-specific drawing limitations, but visual drift from
authoritative pagination should be treated as a bug unless explicitly accepted.

## DOCX Contract

DOCX is an exchange format, not a pixel-perfect layout target.

DOCX should:

- preserve document order and section boundaries
- preserve editable paragraphs, headings, simple tables, headers, footers, and
  TOC text where possible
- emit valid DOCX ZIP output
- keep page/section structure useful for review workflows
- document where Word/LibreOffice may reflow content after opening

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

- authoritative runtime font file is `public/fonts/THSarabun.ttf`
- API routes load fonts from `process.cwd()/public/fonts/...`
- browser font CSS loads from `/fonts/...`
- `src/fonts/THSarabun.ttf` is not the runtime font source unless the project
  intentionally changes the font loading contract
- the API logs the missing font path/error server-side
- `/api/paginate` exposes `X-FlowDoc-Font: fallback`
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
product PDF page-count parity smoke, product DOCX table-row structure smoke,
and multi-section DOCX structure tests. Missing coverage includes pixel-level
PDF/editor parity and deeper DOCX semantic style checks.

## Deferred Work

- Visual regression tests for representative PDF fixtures.
- Automated browser-to-export parity checks.
- DOCX semantic heading/style assertions beyond current structural checks.
- Clearer per-run font fallback reporting for mixed-font documents.
- Richer export artifact inspection for table geometry and page count parity.
