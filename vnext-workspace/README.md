# FlowDoc vNext Workspace

This is the temporary extractable home for the FlowDoc vNext document model.
It lives inside the current repository only while the model, fixture, parser,
and operation boundaries are still being proven.

The target is to move this folder to a new repository once the vNext core can
stand on its own.

## Boundary

- This workspace must not import current editor runtime code.
- Current/prototype code is reference evidence only. It must not enter the
  exported vNext source path as an accepted input model.
- Tests must run from this folder without depending on the app runtime.
- Fixtures in this folder should use vNext shape and sanitized data.
- Package envelope compatibility stays explicit: the canonical vNext persisted
  input is package v2 containing document v3.
- Old document versions and prototype node names are rejected by the canonical
  vNext parser. Any future one-off conversion tool must live outside exported
  core and outside required vNext checks.

## Local Commands

From this folder after dependencies are available:

```sh
npm run type-check
npm run test
npm run check
```

From the current parent repository without installing this folder separately:

```sh
../node_modules/.bin/tsc --noEmit -p tsconfig.json
../node_modules/.bin/vitest run --config vitest.config.ts
```

## Current Slice

- Document schema version: `3`
- Package envelope target: `FlowDocPackage.packageVersion = 2`
- Implemented baseline nodes: `zone`, `text-block`, `columns`, `column`,
  `table`, `table-row`, `table-cell`, `toc`, `page-break`, `divider`,
  `spacer`
- Implemented graph baseline: parent refs, child indexes, nearest context,
  capabilities, and relationship diagnostics
- Product-shaped fixture: `fixtures/product-report-vnext.flowdoc.json`
- Canonical package boundary: parse, safe-parse, and serialize package v2 with
  document v3
- Operation baseline: graph-backed `node.delete`, `node.duplicate`,
  `node.reorder`, `columns.insert`, `columns.layout.patch`,
  `text-block.insert`, `text-block.text.replace`, `table.row.insert`, and
  `table.row.delete`, `table.column.insert`, and `table.column.delete`
  commands with validation, history policy, render invalidation, and scope
  metadata
- Durable history-ready operation record helper for committed and rejected
  operation results, plus append/replay helpers for operation history records
- Pagination/export planning boundary: page boxes, source item order,
  renderer contract, and operation invalidation from canonical vNext documents
- Measured pagination skeleton: page fragments, forced page breaks, text-block
  line fragmentation, static header/footer fragments, and page-number inline
  resolution from canonical vNext documents
- Text measurement contract: stable cache keys, line boxes, reusable
  measurement cache, operation invalidation, and pagination fragment metadata
- Columns pagination skeleton: `widthShare`/gap-based column geometry with
  measured child fragments and column metadata
- Table pagination skeleton: row-level page breaks, repeated header row
  fragments, cell geometry, measured cell text metadata, and over-tall
  breakable text-cell row splits
- Table cell block policy: measured text, atomic spacer/divider, generated TOC,
  and ignored page-break behavior is explicit in fragment metadata/warnings
- Export readiness gate: measured pagination reports ready, ready-with-warnings,
  or blocked without letting renderers relayout; renderer-consumption audit
  blocks export when measured fragments lack geometry or table metadata needed
  by a fragment-only renderer
- Table direction plan: `docs/TABLE_PAGINATION_VNEXT_PLAN.md` selects
  row-level pagination plus splittable cell text before the deferred full table
  engine path
- Phase 10 close audit: `docs/PHASE_10_CLOSE_AUDIT.md` marks the vNext core
  pagination/export boundary complete for bridge work while deferring concrete
  PDF/DOCX renderers and product smokes
- Phase 11 bridge plan: `../docs/EDITOR_VNEXT_RUNTIME_BRIDGE_PLAN.md` starts
  the editor bridge lane with a read-only vNext bridge runtime target before
  parent editor runtime integration
- Phase 11 import boundary: `../docs/EDITOR_VNEXT_IMPORT_BOUNDARY_DECISION.md`
  keeps this folder in-repo for now and allows parent editor imports only
  through the future bridge host
- Read-only editor bridge runtime: `src/editorBridge/runtime.ts` composes
  canonical package parsing, relationship graph, measured pagination,
  renderer-consumption audit, export readiness, and supported operation kinds
  without accepting current runtime document input

Not implemented yet:

- editor runtime integration;
- renderer-backed text measurement profile implementation, non-text table-cell
  content splitting, multi-page column balancing, and final
  pagination-aware TOC page resolution;
- PDF/DOCX renderer implementation beyond the measured-fragment consumption
  contract;
- durable operation history persistence outside the in-memory replay helper;
- product-level editor acceptance smokes.
