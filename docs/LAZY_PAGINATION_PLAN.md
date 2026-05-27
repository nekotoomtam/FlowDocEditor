# Lazy Pagination Plan

This document records the design direction for true lazy/incremental pagination.
It is a design note, not an implementation contract yet. The first goal is to
reduce long-document editor wait time without changing authoritative layout
semantics, export behavior, document history, or persisted document shape.

## Current Model

- Core owns document semantics and pagination decisions. Evidence:
  `docs/LAYOUT_ENGINE_SPEC.md` section 1.1 and
  `packages/core/src/pagination/paginator.ts` `paginateDocument`.
- Authored document data must remain layout-free. Evidence:
  `docs/LAYOUT_ENGINE_SPEC.md` section 1.2.
- Renderers consume `PaginatedDocument` and must not recompute page breaks.
  Evidence: `docs/LAYOUT_ENGINE_SPEC.md` section 5.1 and
  `docs/CROSS_PAGE_BEHAVIOR.md` Ownership.
- Editor state currently keeps authored document state and paginated output
  together. Evidence: `src/app/editor/_components/editorReducer.ts`
  `EditorState`, `pushDoc`, `SET_PAGINATED`, and `LOAD_DOCUMENT`.
- Browser preview now has a lightweight initial shell plus optional background
  worker pagination for long documents. Evidence:
  `src/app/editor/_components/editorInitialPagination.ts`
  `createEditorPlaceholderPaginatedDocument`,
  `src/app/editor/_components/browserPaginationStrategy.ts`
  `shouldUseBackgroundBrowserPagination`, and
  `src/app/editor/_components/EditorShell.tsx`
  `createBrowserPaginationWorker`.
- Full pagination currently paginates every section, then collects and fills TOC
  entries, and may repaginate with corrected TOC height. Evidence:
  `packages/core/src/pagination/paginator.ts` `paginateDocument`,
  `paginateSections`, and the pass 1 / pass 2 TOC block.
- Flow measurement currently builds a section flow tree before pagination.
  Evidence: `packages/core/src/layout/flow.ts` `flowSection`,
  `flowVerticalContainer`, and `flowNode`.

## Problem

The worker-based preview prevents the main editor thread from freezing during
large document pagination, but it still computes the whole document before the
preview is complete. For 100+ page documents, that can leave the editor in a
"preparing layout" state for too long even if the UI remains responsive.

True lazy pagination must make part of the document useful earlier while still
protecting these invariants:

- no stale pagination may overwrite newer draft state;
- partial preview must not be treated as export-ready authoritative output;
- TOC page numbers must not be finalized from incomplete downstream layout;
- list numbering must follow authored document order;
- undo/redo history must not mix authored edits with disposable preview cache;
- server/export pagination remains authoritative until explicitly changed.

## Decision

Prefer a block-checkpoint incremental pagination model.

The editor should eventually be able to paginate from a known checkpoint near a
visible page, produce a clearly marked partial preview for that window, and then
settle the full `PaginatedDocument` in the background. Partial output must carry
explicit status and generation metadata so the UI can display it without
promoting it to authoritative layout state.

The first supported checkpoints should be body child boundaries inside a
section. The initial implementation should not checkpoint in the middle of a
paragraph, table row, Flow Table row, TOC, or other split structure.

## Alternatives Considered

### Keep Full Worker Pagination Only

This is already the first safe slice. It improves responsiveness by moving heavy
work off the UI thread, but it does not reduce total pagination work or make a
specific page become accurate earlier.

Verdict: keep it, but it is not enough for true lazy pagination.

### Section-Level Incremental Pagination

Paginating one section at a time is simple and low risk, but it helps only when
long documents are split into many sections. A 100-page document can still be
one body section.

Verdict: useful as a small optimization, not the main architecture.

### Page-Window-Only Pagination

Rendering only the pages near the viewport is attractive for UX, but raw
page-window pagination is unsafe when earlier content can affect later page
numbers, TOC entries, list counters, keep rules, table continuations, and
fragment identity.

Verdict: defer until checkpoints make the page window reproducible.

### Block-Checkpoint Incremental Pagination

Checkpointing at safe body-block boundaries gives the editor a way to resume
pagination without starting from page 1 every time. It is more work than worker
pagination, but it can reduce the actual work needed for scrolling and localized
edits while preserving core ownership.

Verdict: chosen direction.

## Proposed Phases

### Phase 0: Keep The Existing Safe Slice

Keep the current placeholder shell and background worker behavior. It is a
responsive fallback while incremental pagination is designed.

Done when:

- long documents load with a lightweight editor shell;
- worker results are latest-only and cannot overwrite newer document state;
- full browser pagination still settles to a valid `PaginatedDocument`.

### Phase 1: Add Pagination Trace

Add a trace-only output path around full pagination. The trace should be
derived from full pagination and must not change layout behavior.

First slice status: `paginateDocumentWithTrace` wraps the existing full
`paginateDocument` result and `buildPaginationTrace` derives section spans,
fragment spans, direct body-child spans, and TOC entries from the completed
`PaginatedDocument`. This slice intentionally does not change pagination order
or editor runtime behavior.

Useful trace fields:

- document generation id;
- section id and section page span;
- source node id, node type, and parent container;
- first page and last page touched by each source node;
- fragment line ranges for split paragraphs;
- forced-progress or overflow warnings;
- TOC nodes and whether pass 2 was needed;
- timing per section or major pagination stage.

Done when:

- trace generation does not alter `PaginatedDocument`;
- tests cover split body paragraphs, lists, TOC, and Flow Table fragments;
- trace can answer "which body child starts near page N?"

### Phase 2: Define Checkpoint Contract

Define a cache entry that can resume pagination from a safe body child boundary.
The checkpoint must be derived state, not authored document state.

First slice status: `buildPaginationCheckpointCandidates` derives checkpoint
candidates from pagination trace direct body-child spans. `buildPaginationCheckpointStates`
then records a resume anchor from the first rendered fragment of each supported
candidate, plus source generation, measurement version, section page-number
context, and TOC dependency status. This is still a contract/helper layer: it
does not change pagination execution order, and list-numbering cursor capture is
explicitly marked `not-captured` until the streaming core proof exposes a real
resume cursor.

Minimum checkpoint fields:

- source document generation id;
- section id;
- body child index and node id;
- physical page index before that child;
- content cursor state before that child;
- active list numbering state;
- section page-number context;
- TOC dependency status;
- measurement/font cache version.

Unsupported first-slice checkpoints:

- inside split paragraphs;
- inside legacy table rows;
- inside Flow Table rows;
- inside `flow-row` / `flow-stack` nested content;
- immediately before or inside a TOC that can change downstream page numbers.

Unsupported zones should fall back to full pagination from an earlier safe
checkpoint or from the section start.

Done when:

- checkpoint invalidation is deterministic;
- stale checkpoints are ignored by generation/version checks;
- unsupported structures fall back without changing output.

Second slice status: `getPaginationCheckpointInvalidationReasons` defines
deterministic invalidation rules for content edits before a checkpoint, body
structure edits at or before a checkpoint, section/document layout changes,
measurement changes, and source generation / measurement version mismatches.

### Phase 3: Separate Preview Status From Authoritative Output

Introduce explicit preview layout status instead of storing a partial layout as
if it were complete.

Candidate statuses:

- `placeholder`: minimal shell only;
- `partial`: visible-window preview from checkpoints;
- `settling`: full pagination is running;
- `full`: complete `PaginatedDocument` is current for the active document.

Export, save, API, and server-owned flows should continue to use full
pagination only. Partial preview must be editor-only disposable state.

Done when:

- editor UI can show partial pages without claiming full readiness;
- export readiness is blocked or settled when full pagination is stale;
- undo/redo snapshots continue to store authored document and full paginated
  output only.

First slice status: the editor now tracks browser preview layout state as
`placeholder`, `settling`, `partial`, or `full`. Only `full` is treated as
preview-layout-ready by the export gate. `partial` is a reserved status for the
future visible-window pagination slice and is not emitted by the editor runtime
yet. The current slice does not change undo/redo history, export/server
ownership, or pagination execution order.

### Phase 4: Streaming Core Proof

Refactor core pagination internally so it can paginate a sequence of body
children and return both fragments and resume state. The full `paginateDocument`
API should stay available and should use the same underlying logic.

The first proof should support direct body paragraphs, spacers, dividers,
authored page breaks, and simple TOC-safe fallback behavior. Tables, Flow
Tables, and nested flow containers can remain atomic or fallback in the first
slice.

Done when:

- full pagination output remains byte/shape-equivalent for supported fixtures;
- `assertPaginatedDocument` still passes;
- existing focused pagination tests stay green;
- unsupported structures have explicit fallback paths.

First slice status: `tryPaginateDocumentBodyBasicsIncrementally` proves a
direct-body streaming path for `paragraph`, `spacer`, `divider`, and
`page-break` nodes. For supported documents, focused tests assert that its full
`PaginatedDocument` output equals the existing `paginateDocument` output,
including split paragraphs, keep-with-next, generated list markers from section
start, section-local page numbers, and heading-derived `tocEntries`. Direct body
`toc`, `row`, and `flow-table` nodes return explicit `unsupported` results
instead of guessing. This helper is not wired into editor runtime yet and does
not implement mid-document resume or visible-window pagination.

### Phase 5: Visible-Window Pagination

Use checkpoints to satisfy viewport requests:

- find the nearest safe checkpoint before the requested page;
- paginate forward until the visible window plus margin is covered;
- mark those pages as partial;
- continue full settling in the worker;
- replace partial output only if document generation and request id still match.

Done when:

- scrolling to a late page no longer requires full document pagination first;
- editing near a body child repaginates from the nearest valid checkpoint;
- full settled output converges to the same output as `paginateDocument`.

First slice status: the editor now has a disposable partial display lane.
`resolveEditorDisplayPaginated` lets canvas/navigation read a generation-matched
partial `PaginatedDocument` while reducer history, undo/redo, export readiness,
and server-owned layout continue to use the full `state.paginated` output. The
browser worker message contract now has a `partial` response and optional
visible-window request metadata, but the worker still emits only full pagination
until the next slice implements visible-window computation.

Second slice status: the core now exposes
`tryPaginateDocumentBodyBasicsVisibleWindow`, a safe visible-window prefix path
for direct body `paragraph`, `spacer`, `divider`, and `page-break` nodes. The
browser worker sends that partial result before the full `paginateDocument`
result when the requested window does not complete the document. Unsupported
body children such as `toc`, `row`, and `flow-table` do not emit partial output
and continue through the full-pagination fallback. The current slice starts from
the document/section beginning rather than resuming from a cached checkpoint, so
late-page jumps can become visible before full pagination completes but still
pay the prefix pagination cost.

### Phase 6: Export Render Batching

Keep authoritative export pagination full-document. Export must still run
`paginateDocument`, assert the complete `PaginatedDocument`, and render from
that complete layout so TOC entries, page numbers, list markers, keep rules, and
table splits remain deterministic.

PDF rendering may process the completed `PaginatedDocument` in page batches to
avoid one long render loop and to expose progress/profile hooks. The default
batch size is 20 pages. This is not true streaming: `pdf-lib` still saves the
final PDF buffer at the end, so memory and finalization cost remain whole-file
concerns. DOCX is intentionally out of scope because it is built from Word
sections and should not be divided by computed page boundaries.

Done when:

- PDF page order and page count match non-batched rendering;
- PDF render progress reports pages rendered, total pages, and batch count;
- `/api/export` uses the default PDF page batch size without changing response
  shape;
- export profiling can distinguish pagination time from render/finalize time.

Second slice status: `/api/export` now returns a compact
`X-FlowDoc-Export-Profile` response header after successful exports. The header
keeps the binary response body unchanged while exposing page count, fragment
count, pagination time, assertion time, render time, total time, and PDF batch
timing fields where available. The editor reads that header after download
preparation and shows a short status summary; it still cannot stream live
server progress from the current request/response shape.

### Phase 6C: Large Export Strategy Gate

Keep large-export decisions profile-driven. The current single-response export
path remains valid after success, but successful profiles should be classified
so the next strategy is chosen from actual page count and timing evidence.

Initial thresholds:

- standard: fewer than 100 paginated pages;
- large: 100 to 299 paginated pages;
- very-large: 300 or more paginated pages.

For large and very-large PDFs, the useful timings are total export time,
page-render time, and PDF finalization time. If page-render dominates, page
batching or chunked render/merge is the likely next experiment. If finalization
dominates, the bottleneck is the whole-file `pdf-lib` save step, so true
streaming or a renderer/library change becomes the relevant follow-up. If
pagination dominates, export chunking will not address the main cost because
authoritative export still requires full-document pagination before rendering.

This phase must not:

- split DOCX by computed page boundaries;
- promote partial editor previews to export-ready output;
- block successful exports only because they are large;
- change the binary response body or download behavior.

## Risk Map

### PASS

- The current safe slice keeps full pagination as the final browser preview
  output. Evidence: `EditorShell.tsx` dispatches `SET_PAGINATED` only after
  browser pagination returns a complete `PaginatedDocument`.
- The current document model remains layout-free. Evidence:
  `editorInitialPagination.ts` creates disposable `PaginatedDocument` output
  from authored sections without writing layout into `DocumentNode`.

### FAIL / BLOCKER

- Treating a partial visible-window layout as a complete `PaginatedDocument`
  would violate renderer/export ownership and make TOC/list/page-number output
  ambiguous.
- Letting an older pagination request commit after a newer edit would violate
  the review gate rule for browser pagination overwrite.

### RISK

- TOC is two-pass today; a partial downstream layout cannot safely finalize TOC
  page numbers.
- List counters are derived by authored traversal order; checkpoints must carry
  or recompute list state.
- Keep rules, widow/orphan, and table split loops can make a local edit affect
  following pages.
- Flow Table rowspans and repeated headers can consume page height in ways that
  are not safe to resume in the middle.
- Browser and server font metrics can drift, so partial preview must remain
  preview state until authoritative pagination settles.

### UNKNOWN

- The smallest checkpoint state that can exactly resume every supported table
  and Flow Table case is not proven in the current code/docs.
- The performance gain of block checkpoints is not measured yet for real
  100-page user documents.

## Minimal Next Patch

1. Add trace-only instrumentation around current full pagination.
2. Add tests proving the trace does not change full pagination output.
3. Use the trace in the editor only for diagnostics and page-to-node lookup.
4. Measure long mock documents with and without trace.
5. Design checkpoint cache from observed trace data before changing pagination
   execution order.

## Test Plan

- Focused core pagination tests for trace output on:
  body paragraphs, split paragraphs, headings/TOC, lists, page breaks, Flow
  Table splits, and section page numbers.
- Full core tests after any pagination implementation change.
- App tests for preview status and stale generation rejection.
- Browser smoke for:
  long Thai documents, late-page scrolling, edit-while-pagination-pending,
  undo/redo after pending pagination, and export readiness while partial preview
  is visible.

## Intentionally Deferred

- No authored schema change.
- No export/server ownership change.
- No partial layout persistence.
- No table/Flow Table mid-row checkpointing in the first checkpoint slice.
- No TOC finalization from incomplete document pagination.
