# Test Strategy

This document defines how FlowDocEditor should use tests, fixtures, and browser
checks to protect the product direction. The goal is not maximum test volume; it
is choosing the right verification level for the risk of each change.

## Testing Goal

FlowDocEditor should feel stable as an editor and produce authoritative document
output. Tests should protect both:

- engine correctness: valid document model, deterministic layout, pagination,
  renderer contracts
- editor trust: expected selection, stable editing, intuitive undo/redo, no
  distracting flicker or layout errors in core workflows

## Review Gate Commands

Use `npm.cmd run review:gate` as the default reproducible non-browser review
gate from the repository root or from an extracted review archive. It runs
standalone type-check, core tests, app tests, and `npm.cmd run review:build`.
`review:build` invokes the local Next binary with `next build --webpack` and
sets `FLOWDOC_REVIEW_BUILD_SKIP_NEXT_TYPECHECK=1` only for that child build,
because `review:gate` has already run `tsc --noEmit`.
Use `npm.cmd run review:gate:full` when a reviewer or CI job also needs to
prove that the archive manifest is complete before running the non-browser
gate. It runs `review:archive -- --check` and then `review:gate`.

Use `npm.cmd run review:browser` as the separate browser smoke gate. It runs
the focused Playwright smoke scripts sequentially so each script can start the
dev server with its required feature flags. Close any already-running Next dev
server for this repo first, or run an individual smoke command with
`SMOKE_BASE_URL` when intentionally targeting an existing server. The smoke
scripts use bundled Chromium by default; reviewers without the bundled browser
can set either `SMOKE_BROWSER_CHANNEL=chrome` / `msedge` or
`SMOKE_EXECUTABLE_PATH=<path>` for a system Chromium-family executable.
`npm ci` installs Playwright's npm package, but it does not guarantee browser
binaries. CI/review machines that use bundled Chromium should run
`npx playwright install chromium` before `review:browser`, or use the
convenience command `npm.cmd run review:browser:install`.

Use `npm.cmd run review:archive -- --check` before preparing external review
archives. The check verifies that the review package would include the root
package/config files, `scripts/`, `public/fonts/THSarabun.ttf`, `src/`,
`packages/`, and `docs/`, and that generated/cache paths such as
`node_modules`, `.next`, `.vite`, and test result caches are excluded. Running
`npm.cmd run review:archive` creates the actual `flowdoc-review-archive.zip`
and verifies the ZIP entries after writing. A reviewer should be able to extract
that archive, install dependencies, and run `review:gate` plus
`review:browser` without relying on untracked workspace files.

Missing `public/fonts/THSarabun.ttf` is not an allowed skip. The runtime font
contract test and product export golden smoke must fail when the default runtime
font asset is absent. Browser-based real-font drift coverage may still skip only
when the local Playwright/Chromium runtime is unavailable.

## Test Levels

### Level 0: API Route Contract Smoke

Use for export or pagination route boundary changes.

Protects:

- invalid JSON and invalid format responses
- authored document validation before pagination
- asserted paginated JSON from `/api/paginate`
- PDF/DOCX response headers and readable artifact bytes from `/api/export`
- fail-closed `/api/export` behavior when the default runtime font is missing

Typical command:

- focused app API route test
- full app test command when route behavior changes

### Level 1: Schema, Normalize, And Operation Tests

Use for document model and core operation changes.

Protects:

- valid tree structure
- table grid invariants
- paragraph split/merge behavior
- authored prop normalization
- no invalid documents from operations
- document-first package persistence/import paths normalize before entering
  editor state

Typical commands:

- focused core test file
- full test command for meaningful behavior risk

### Level 1A: Package And Persistence Tests

Use for `FlowDocPackage`, localStorage, JSON import, or JSON export changes.
Detailed package rules live in `docs/FLOWDOC_PACKAGE_CONTRACT.md`.

Protects:

- package parse/serialize behavior
- legacy raw document import compatibility
- package/document version separation
- normalize and assert before editor state receives a document
- no runtime editor state or computed layout in persisted packages

Typical commands:

- focused persistence test file
- type-check
- browser smoke when editor load/import/export behavior changed

### Level 2: Layout And Pagination Fixtures

Use for flow layout, page breaks, text continuation, table splitting, page
numbers, TOC, row/stack, and cross-page behavior.

Protects:

- page count and page placement
- fragment order and parent/child relationships
- line split boundaries
- table header repetition
- rowspan and breakable-row policies
- `assertPaginatedDocument` invariants
- user-level report fixtures under both default measurement and the production
  `fontkit + THSarabun + thaiWordBreaker` stack

Typical commands:

- focused pagination test file
- full test command

### Level 3: Renderer Contract And Smoke Tests

Use for PDF, DOCX, or renderer-facing `PaginatedDocument` changes.
Detailed export/API/renderer expectations live in
`docs/EXPORT_RENDERER_CONTRACT.md`.

Protects:

- renderers accept the expected fragment types
- PDF generation does not throw and emits a PDF header
- product PDF page count matches the authoritative paginated output
- DOCX generation does not throw and emits a ZIP header
- multi-section structure remains serializable
- product DOCX table structure is present in generated XML

Renderer smoke tests do not prove pixel-perfect output. PDF/editor visual parity
and DOCX semantic style checks are separate future coverage.

### Level 4: App-Level Unit Tests

Use for app logic that can be tested without a browser.

Protects:

- drift comparison
- editor helper functions
- paragraph text surface logic
- transaction or state transition helpers

Typical command:

- app test command
- full test command when the change also touches core

### Level 5: Browser Smoke Checks

Use for editor UX changes.

Detailed editor interaction expectations live in `docs/EDITOR_UX_CONTRACT.md`.
Focused manual/browser steps live in `docs/BROWSER_SMOKE_CHECKLIST.md`.
The first automated browser smoke lives in `scripts/editor-smoke.mjs` and runs
with `npm.cmd run smoke:editor` on Windows PowerShell.

Protects what automated unit tests often miss:

- click target feels correct
- inline text remains visible while editing
- undo/redo behaves like the user's mental model
- table selection opens the expected panel
- controls update visible document structure
- Fill mode readiness appears and clears for required used fields
- no layout error badge appears
- no obvious flicker, jump, or unwanted scroll is introduced

Browser checks should be short and focused. They verify the main human-facing
risk of the change, not every possible path.

### Level 6: Product Scenario Fixtures

Use when behavior maps to a real workflow in `docs/PRODUCT_SCENARIOS.md`.
Current fixture-to-test mapping lives in `docs/FIXTURE_CATALOG.md`.

Protects:

- customs-style dense tables
- repeated headers
- breakable uneven table rows
- rowspan boundary behavior
- government report sections, TOC, page numbering, and keep-with-next
- representative Thai text behavior

Product fixtures should stay named and discoverable, such as
`product fixture — customs-basic-table`.

## Risk-Based Verification Matrix

Command examples use Windows PowerShell spelling. On non-Windows shells, replace
`npm.cmd` with `npm`. Run commands from the repository root unless a task
explicitly targets `packages/core`. If dependencies, config, or workspace setup
are unavailable, report that verification could not run instead of claiming a
pass.

| Change type | Required verification |
|---|---|
| Docs only | `git diff --check` |
| UI copy or minor panel wiring | type-check; browser check if interaction changed |
| Editor interaction behavior | type-check; focused app tests if available; `npm.cmd run smoke:editor`; manual browser smoke for interaction not covered by the script |
| WYSIWYG text-engine clipboard, IME, or production eligibility | type-check; focused app tests for draft operations/config; `npm.cmd run smoke:wysiwyg-stage4c`; use `SMOKE_BROWSER_CHANNEL=chrome` / `SMOKE_BROWSER_CHANNEL=msedge` or `SMOKE_EXECUTABLE_PATH=<path>` when installed/system-browser evidence matters; complete `docs/WYSIWYG_STAGE4C_IME_MATRIX.md` and `docs/WYSIWYG_PRODUCTION_GATE.md` before changing production/default eligibility; update `docs/WYSIWYG_STAGE4C_IME_RESULTS.md` with what actually ran |
| Editor state race or reconciliation | type-check; focused app tests if available; `npm.cmd run smoke:editor`; manual browser smoke using the editor state race set |
| Persistence or JSON import | focused persistence tests; type-check; browser smoke if editor load/import/export behavior changed |
| Package proposal docs | `git diff --check`; no runtime tests unless code or active behavior changes |
| Core document operation | focused core test; full test command for meaningful behavior risk |
| Text measurement or line breaking | focused text/layout tests; full test command; update text docs |
| Pagination/page-break behavior | focused pagination test; full test command; update cross-page/checklist docs |
| Table editing or table pagination | focused table pagination/operation tests; full test command; browser check for editor UX; update table contract/checklist |
| Renderer/export behavior | focused renderer tests; API route contract smoke if route behavior changed; document accepted fidelity limits |
| Product scenario change | update `docs/PRODUCT_SCENARIOS.md`; add or update fixture coverage |

## Definition Of Done

For meaningful work, the session should answer:

- What user/product behavior changed?
- Which layer owns the behavior: core, editor, API, renderer, or docs?
- Which tests or browser checks protect it?
- Which docs/checklists/contracts were updated?
- Was `docs/WORK_LOG.md` updated?
- What remains intentionally deferred?
- Was anything not verified, and why?

## Current Coverage Snapshot

Current strengths:

- Core pagination has broad regression coverage. Current full suite:
  28 core test files / 344 core tests, plus 25 app test files / 232 app tests.
- Product scenarios have executable fixtures for the main customs/report cases,
  including pagination-level page-count golden baselines.
- Fixture ownership is cataloged in `docs/FIXTURE_CATALOG.md`.
- Binding has focused scalar `fieldRef` contract coverage for missing values,
  fallbacks, table-cell paragraphs, non-mutation, non-strict registry behavior,
  and flat `DataSnapshotV1` preview binding.
- Field registry coverage collects body/table fieldRef usages and validates
  duplicate keys, missing definitions, and non-inline field targets without
  changing current binding behavior.
- Data snapshot coverage validates scalar field values outside `DocumentNode`,
  including readiness warnings, invalid value types, enum options, and
  unsupported image/collection values.
- Readiness coverage combines registry issues with document-scoped snapshot
  issues so unused required fields do not warn in the current document.
- Operation coverage protects inline `fieldRef` insertion in body paragraphs
  and table-cell paragraphs without flattening existing text runs.
- Table row split accounting has focused coverage for uneven cells, empty cells,
  spacer-containing cells, padded cells, tall repeated headers, low-capacity
  no-progress guards, and continuation line ranges.
- Table operation coverage protects row/column structural edits, subtree
  cleanup, total-width preservation, header-row clamping, and last-row/column
  deletion guards.
- Renderer smoke tests protect PDF/DOCX from obvious breakage.
- Product export golden smoke protects PDF page-count parity for customs/report
  fixtures and DOCX table row structure for the customs fixture.
- User-level report fixture coverage protects saved FlowDoc package v2 fixtures
  for company, government, and university reports, including pagination
  assertions, PDF page-count export assertions, runtime-font failure behavior,
  and one app import/data-bind/export path.
- API route contract smoke protects `/api/paginate` and `/api/export` status,
  headers, and artifact readability.
- Document package persistence coverage protects current `FlowDocPackage v2`
  writes, legacy `FlowDocPackage v1` import, legacy raw `DocumentNode v1`
  import, localStorage package v2 save/load, default JSON package v2 serialization,
  package/document identity agreement, normalize, and validation behavior, safe
  filename generation, import status messages, raw-document migration, package
  v1 idempotent migration, and inline `fieldRef` round-tripping. It also covers
  localStorage field registry preservation, package v2 JSON export
  serialization with field registry preservation, package v2 data snapshot
  preservation for localStorage/export/import, invalid package data snapshot
  rejection, legacy/package v1 migration to package v2, package v2 migration
  idempotence, v2 registry warning propagation, v2 registry warning import
  status, and v2 registry hard-error rejection.
- App-level tests cover drift and editor helper behavior, including
  continuation-slice text reconstruction and WYSIWYG visual-mode selection
  decisions.
- FlowDoc-owned text-engine tests cover grapheme-aware keyboard selection
  anchor/focus behavior, SVG selection overlay rendering, and selected-range
  deletion against the heavy Stage 3 page-boundary stress fixture.
- Real-font Thai drift coverage compares Chromium canvas measurement and
  fontkit measurement using the runtime `public/fonts/THSarabun.ttf` when the
  Playwright runtime is installed locally; otherwise the focused drift test
  skips while preserving type-check coverage. Missing runtime font is covered by
  a non-skipped API contract test and product export golden smoke.
- Automated browser smoke now protects default editor load, paragraph inline
  edit commit, undo/redo, same-fragment WYSIWYG drag selection overlay,
  stack-paragraph visual parity, Thai/composition fallback, table-cell
  selection, the property-panel title, table-cell visual contract,
  table-cell row/column insert/delete controls, table-cell boundary Backspace,
  fieldRef paragraph non-editability, and opt-in WYSIWYG
  continuation-fragment editing with three-fragment pagination, slice-bounded
  textarea values, page-tracking textarea relocation after typing settles,
  focus, undo/redo, and boundary Backspace, plus Fill mode package v2 data
  snapshot autosave, active package-registry field palette loading, and
  property-panel fieldRef inspection/editing.
- Manual browser checks are still used for editor feel where automation
  coverage is light.

Known gaps:

- No visual regression suite for PDF/editor parity yet.
- No broad automated browser regression suite for every key editor workflow yet.
- DOCX semantic style coverage is still limited.
- Some editor UX qualities, such as flicker or perceived smoothness, still rely
  on manual/browser smoke checks.

## Adding New Tests

Prefer focused regression tests over broad brittle tests.

Good test additions:

- reproduce one behavior risk clearly
- use stable document ids where useful
- assert structural invariants before visual details
- call `assertDocument` or `assertPaginatedDocument` for layout-related cases
- update product scenarios or checklists when the test covers a named scenario

Avoid:

- snapshotting large unstable objects without a clear reason
- testing implementation details that are likely to change
- adding browser-heavy checks for behavior that a core fixture can protect
- accepting a behavior change without deciding whether docs should change

## Command Reference

- Non-browser review gate:
  - Windows PowerShell: `npm.cmd run review:gate`
  - Non-Windows: `npm run review:gate`
- Non-browser review gate with archive manifest check:
  - Windows PowerShell: `npm.cmd run review:gate:full`
  - Non-Windows: `npm run review:gate:full`
- Browser smoke review gate:
  - Windows PowerShell: `npm.cmd run review:browser`
  - Non-Windows: `npm run review:browser`
- Browser smoke with bundled Chromium install:
  - Windows PowerShell: `npm.cmd run review:browser:install`
  - Non-Windows: `npm run review:browser:install`
- Browser smoke with a system browser:
  - Windows PowerShell: `$env:SMOKE_EXECUTABLE_PATH='C:\Path\To\chrome.exe'; npm.cmd run review:browser`
  - Non-Windows: `SMOKE_EXECUTABLE_PATH=/path/to/chrome npm run review:browser`
- Full verification:
  - Windows PowerShell: `npm.cmd test`
  - Non-Windows: `npm test`
- Type check:
  - Windows PowerShell: `npm.cmd run type-check`
  - Non-Windows: `npm run type-check`
- App tests only:
  - Windows PowerShell: `npm.cmd run test:app`
  - Non-Windows: `npm run test:app`
- Automated editor smoke:
  - Windows PowerShell: `npm.cmd run smoke:editor`
  - Non-Windows: `npm run smoke:editor`
- Core tests only:
  - Windows PowerShell: `npm.cmd run test:core`
  - Non-Windows: `npm run test:core`
- Focused core test:
  - Windows PowerShell: `npm.cmd run test -w packages/core -- <test-file-or-filter>`
  - Non-Windows: `npm run test -w packages/core -- <test-file-or-filter>`
- Diff hygiene: `git diff --check`
