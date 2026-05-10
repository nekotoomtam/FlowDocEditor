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

## Test Levels

### Level 1: Schema, Normalize, And Operation Tests

Use for document model and core operation changes.

Protects:

- valid tree structure
- table grid invariants
- paragraph split/merge behavior
- authored prop normalization
- no invalid documents from operations

Typical commands:

- focused core test file
- full test command for meaningful behavior risk

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
- DOCX generation does not throw and emits a ZIP header
- multi-section structure remains serializable

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

Protects what automated unit tests often miss:

- click target feels correct
- inline text remains visible while editing
- undo/redo behaves like the user's mental model
- table selection opens the expected panel
- controls update visible document structure
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
| Editor interaction behavior | type-check; focused app tests if available; browser smoke |
| Core document operation | focused core test; full test command for meaningful behavior risk |
| Text measurement or line breaking | focused text/layout tests; full test command; update text docs |
| Pagination/page-break behavior | focused pagination test; full test command; update cross-page/checklist docs |
| Table editing or table pagination | focused table pagination/operation tests; full test command; browser check for editor UX; update table contract/checklist |
| Renderer/export behavior | focused renderer tests; export smoke; document accepted fidelity limits |
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
  20 core test files / 285 core tests, plus 2 app test files / 21 app tests.
- Product scenarios have executable fixtures for the main customs/report cases.
- Fixture ownership is cataloged in `docs/FIXTURE_CATALOG.md`.
- Binding has focused scalar `fieldRef` contract coverage for missing values,
  fallbacks, table-cell paragraphs, non-mutation, and non-strict registry
  behavior.
- Table row split accounting has focused coverage for uneven cells, empty cells,
  spacer-containing cells, padded cells, tall repeated headers, and continuation
  line ranges.
- Renderer smoke tests protect PDF/DOCX from obvious breakage.
- App-level tests cover drift and editor helper behavior.
- Browser checks are being used for editor feel where automation coverage is
  still light.

Known gaps:

- No visual regression suite for PDF/editor parity yet.
- No automated browser regression suite for key editor workflows yet.
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

- Full verification:
  - Windows PowerShell: `npm.cmd test`
  - Non-Windows: `npm test`
- Type check:
  - Windows PowerShell: `npm.cmd run type-check`
  - Non-Windows: `npm run type-check`
- App tests only:
  - Windows PowerShell: `npm.cmd run test:app`
  - Non-Windows: `npm run test:app`
- Core tests only:
  - Windows PowerShell: `npm.cmd run test -w packages/core`
  - Non-Windows: `npm run test -w packages/core`
- Focused core test:
  - Windows PowerShell: `npm.cmd run test -w packages/core -- <test-file-or-filter>`
  - Non-Windows: `npm run test -w packages/core -- <test-file-or-filter>`
- Diff hygiene: `git diff --check`
