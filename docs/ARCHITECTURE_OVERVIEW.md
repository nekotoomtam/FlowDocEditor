# Architecture Overview

This document gives a high-level map of how FlowDocEditor is wired today. Use
it to orient before changing layout, editor behavior, API routes, or export.

## Product Shape

FlowDocEditor is moving from document generation toward a workflow-ready editor.
The system should let users author structured documents, preview/edit them
smoothly, and export authoritative output.

The main architectural rule is:

```txt
Authored document data -> core layout/pagination -> renderer-facing fragments
```

The editor can preview and interact, but it should not become a second document
layout engine.

## Main Layers

### App / Editor

Location:

- `src/app/editor/page.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/comparePagination.ts`
- `src/app/editor/_components/browserTextMeasurer.ts`
- `src/app/editor/_components/documentPersistence.ts`

Responsibilities:

- own editor interaction state: selection, drag, resize, inline edit, mode,
  history, local storage, loading/status UI
- render from `PaginatedDocument`
- provide fast browser-measured preview during interaction
- reconcile to server/API pagination for authoritative layout status
- expose document operations through UI controls
- persist/import/export editor JSON as document-first `FlowDocPackage v1`
- parse, normalize, and validate package documents before they enter editor
  state, while still accepting legacy raw `DocumentNode v1` imports

Non-responsibilities:

- defining core document semantics
- deciding export page breaks independently
- storing computed layout in `DocumentNode`

### API Routes

Locations:

- `src/app/api/paginate/route.ts`
- `src/app/api/export/route.ts`

Responsibilities:

- validate incoming documents with `assertDocument`
- paginate with fontkit measurement and `thaiWordBreaker`
- assert paginated output with `assertPaginatedDocument`
- expose font fallback state through `X-FlowDoc-Font: fallback`
- return layout JSON (`/api/paginate`) or rendered binary output
  (`/api/export`)

Font loading contract:

- authoritative runtime font file: `public/fonts/THSarabun.ttf`
- server/API path: `process.cwd()/public/fonts/THSarabun.ttf`
- browser path: `/fonts/THSarabun.ttf`
- `src/fonts/THSarabun.ttf` is not the runtime source of truth unless the font
  loading contract is intentionally changed

### Core Document Model

Locations:

- `packages/core/src/schema/*`
- `packages/core/src/document/assert.ts`
- `packages/core/src/document/normalize.ts`
- `packages/core/src/document/operations.ts`
- `packages/core/src/document/defaults.ts`

Responsibilities:

- define authored document structure
- validate tree and table invariants
- normalize safe defaults
- provide operations that preserve document validity

### Core Layout And Measurement

Locations:

- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/flow.ts`
- `packages/core/src/layout/font-measurer.ts`
- `packages/core/src/layout/word-breaker.ts`
- `packages/core/src/layout/types.ts`

Responsibilities:

- measure text and line segments
- build flow boxes from authored document structure
- compute natural layout sizes before pagination
- keep measurement injectable so browser/server can use different runtime
  services through the same contracts

Measurement does not decide page breaks.

### Core Pagination

Locations:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/assertPaginated.ts`
- `packages/core/src/pagination/metrics.ts`

Responsibilities:

- decide page placement and split boundaries
- produce `PaginatedDocument`
- resolve page-number fields where page context is known
- repeat table headers
- enforce page-boundary contracts
- expose debug/trace metadata for split decisions

Pagination owns layout truth for renderers.

### Renderers

Locations:

- `packages/core/src/renderer/pdf/index.ts`
- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/renderer/shared.ts`

Responsibilities:

- consume `PaginatedDocument`
- draw/serialize fragments in the order pagination provides
- adapt units and target-format structures
- make target limitations explicit

PDF should track authoritative pagination closely. DOCX is an exchange format
and may reflow when opened in Word/LibreOffice.

Detailed export/API/renderer rules live in
`docs/EXPORT_RENDERER_CONTRACT.md`.

Detailed persisted/editor JSON package rules live in
`docs/FLOWDOC_PACKAGE_CONTRACT.md`.

Detailed field-key and registry rules live in
`docs/FIELD_REGISTRY_CONTRACT.md`.

### Binding

Location:

- `packages/core/src/binding/index.ts`
- `packages/core/src/fieldRegistry/index.ts`

Current role:

- early foundation for template/filling separation
- should keep template field references and submitted field values separate
- currently supports scalar `fieldRef` resolution into temporary preview/export
  documents
- field registry helpers collect `fieldRef` usages and validate them against a
  registry without making binding strict
- repeat regions remain draft/deferred; do not add repeat behavior
  opportunistically while fixing unrelated editor, layout, or export bugs

## Runtime Flow

### Editor Preview Flow

```txt
DocumentNode
  -> browser TextMeasurer
  -> paginateDocument(...)
  -> PaginatedDocument
  -> EditorCanvas / ParagraphTextSurface
```

The editor uses this path for fast interaction. It is allowed to be temporary
preview state, but it must reconcile predictably.

### Authoritative Pagination Flow

```txt
Editor document
  -> POST /api/paginate
  -> assertDocument
  -> fontkit TextMeasurer + thaiWordBreaker
  -> paginateDocument(...)
  -> assertPaginatedDocument
  -> PaginatedDocument JSON
  -> editor status / drift / export truth
```

Server/API pagination is the authoritative layout truth for final settling and
export.

### Export Flow

```txt
Editor document + format
  -> POST /api/export
  -> assertDocument
  -> paginateDocument(...)
  -> assertPaginatedDocument
  -> PdfRenderer or DocxRenderer
  -> binary response
```

## Editor State Flow

`EditorShell` owns the main editor state:

- `doc`: authored document
- `paginated`: current preview layout
- `past` / `future`: undo/redo history with document and pagination snapshots
- `selectedNodeId`: selected authored node
- `drag`, resize, and margin interaction state
- inline edit state and transaction snapshot

Persistent editor JSON is now document-first `FlowDocPackage v1`:

```txt
FlowDocPackage v1
  -> package metadata
  -> document: DocumentNode v1
```

The editor unwraps the package before editing. Core layout, pagination, API
export, and renderers continue to consume `DocumentNode` / `PaginatedDocument`.
This foundation intentionally does not include field history, reviewer
workflow, or binding data yet; those are higher layers that can be added around
the package later.

The field registry contract is defined now, but `FlowDocPackage v1` still does
not persist registry/data/history. Those belong to a future package migration,
not to `DocumentNode`.

Meaningful edits should pass through reducer actions and core operations. UI
components should not manually mutate document structure.

## Data Ownership Rules

| Data | Owner |
|---|---|
| Authored structure and props | `DocumentNode` / core schema |
| Validity rules | `assertDocument` |
| Document edits | core operations plus editor reducer |
| Text measurement | layout measurement contracts |
| Page placement and split boundaries | pagination |
| Rendered geometry | `PaginatedDocument` |
| Selection, caret, drag, resize preview | editor state |
| PDF/DOCX serialization | renderers |

## High-Risk Boundaries

- Browser preview vs server/export pagination
- Inline edit geometry vs authored document data
- Table internals vs section-level document tree
- DOCX structural export vs visual PDF/editor parity
- Font fallback and Thai text measurement
- Undo/redo history vs transient edit drafts

When changing any of these areas, read the relevant contract and use
`docs/TEST_STRATEGY.md` to choose verification.

## Related Docs

- `docs/DOCS_INDEX.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
