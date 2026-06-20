# Product Report v2 Scenario Contract

Status: Active product anchor. Fixture implemented; product workflow browser
checks pending.

Use this document when product-shaped v2 fixture work, operation source-of-truth
work, long-document editor stability, history behavior, field/data readiness,
or export readiness needs one shared acceptance target.

This document is intentionally not a replacement for the current stress
fixtures. It defines the product-shaped anchor that stress fixtures should
serve. Stress fixtures answer "can the editor survive pressure"; this scenario
answers "can the product workflow still feel normal and stay correct."

## Request

The owner wants to stop drifting between isolated patches and use one durable
product anchor before continuing deeper operation architecture work.

Current request-to-plan trace:

```text
User request
  -> Product Scenario v2 Anchor Plan
    -> Phase 1: scenario contract
      -> Job item: define product-report-v2 as the shared target
        -> Execution step: write and link this contract
```

Current position:

- Request: create a stable product-shaped target before continuing operation
  source-of-truth work.
- Plan: Product Scenario v2 Anchor Plan.
- Phase: Phase 4, product workflow checks.
- Job item: add focused browser/workflow gates for `product-report-v2`.
- Status: in progress with node mutation RISK.
- Why this item is current: the fixture now exists and validates as v2, but the
  product workflow gates are only partially verified.
- Next transition: investigate the remaining strict product node mutation
  latency risk before using node mutation workflow evidence as stability PASS.

## Evidence Baseline

- `docs/PRODUCT_SCENARIOS.md` defines real Thai document workflows as the
  product north star and maps existing product fixtures for customs and report
  workflows.
- `docs/FIXTURE_CATALOG.md` lists current product fixtures and the v2 stress
  fixture set, including `stress-long-v2`.
- `docs/DOCUMENT_MODEL_V2_CONTRACT.md` defines the accepted v2 authored shape:
  `DocumentNode.version = 2`, flattened `section.nodes`, no legacy `row` or
  `stack`, and no persisted `flow-table.nodes`.
- `docs/EDITOR_LONG_DOCUMENT_V2_STRESS_HARNESS_PLAN.md` records that v2 stress
  coverage now protects typing, node mutation, table, and flow-row browser
  workflows, while strict typing responsiveness still has known risk.
- `docs/EDITOR_OPERATION_SOURCE_OF_TRUTH_PLAN.md` is the operation migration
  ledger. The product anchor here gives later source-of-truth phases a user
  workflow to cite, not only stress mechanics.

## Goal

Create `product-report-v2` as the canonical product-shaped v2 fixture and
acceptance target.

The anchor must prove that a medium-long report can be opened, edited, mutated,
undone/redone, filled, paginated, and exported without weakening document model,
history, pagination, or export ownership.

## Non-Goals

- Do not redesign `DocumentNode v2`.
- Do not introduce `FlowDocPackage v3`.
- Do not rename `flow-row`, `flow-stack`, or `flow-table`.
- Do not replace the legacy stress fixture yet.
- Do not claim full long-document performance stability from this contract
  alone.
- Do not tune current runtime behavior only to make this planned fixture pass.

## Scenario Summary

Fixture id:

```text
product-report-v2
```

Suggested package path:

```text
public/mock/product-report-v2.flowdoc.json
```

The document is a medium-long business/government-style report that combines
the report scenario, data binding, table editing, flow-row layout, section
page numbering, and long-document edit targets.

Representative shape:

- Cover section with report title, owner, date, and scalar fields.
- TOC section.
- Executive summary with a two-column `flow-row` / `flow-stack` KPI summary.
- Body section with headings, formal Thai/mixed paragraphs, and page numbering
  restarted for the body.
- KPI/detail `flow-table` with header rows, body rows, numeric columns, and at
  least one longer text cell.
- Deep body paragraphs placed after enough content to create realistic scroll
  and pagination pressure.
- Signature or approval area near the end.
- Header/footer/page-number behavior representative of report export.

## Required v2 Model Shape

The fixture must satisfy the active v2 contract:

- `packageVersion = 2`.
- `document.version = 2`.
- one authored graph per section via `section.nodes`.
- section roots point to body nodes.
- no legacy `row` or `stack` authored nodes.
- no persisted `flow-table.nodes`.
- table rows, table cells, and table-cell content live in `section.nodes`.
- flow-row children are flow-stack nodes.
- flow-stack children remain paragraph, spacer, or divider nodes.
- no persisted browser pagination, server pagination, editor selection, or
  runtime layout cache.

## Required Semantic Targets

The fixture must expose stable aliases in `mockData.targets`. Browser scripts
and operation tests should use these aliases instead of generated node ids.

Required aliases:

```text
typing.primary
typing.boundary
typing.pageBoundary
typing.deepDocument
node.addAfter
node.delete
node.duplicate
node.reorderSource
node.reorderTarget
node.split
node.merge
flowRow.summaryRow
flowRow.resizeTarget
flowRow.addColumnTarget
flowRow.leftStack
flowRow.rightStack
table.primaryTable
table.headerRow
table.primaryRow
table.primaryCell
table.bodyCell
table.longTextCell
table.resizeTarget
field.reportTitle
field.reportDate
field.ownerName
field.totalAmount
field.riskLevel
history.primaryEdit
export.readinessTarget
```

Optional aliases may be added for focused probes, but the required set above is
the product contract.

## Acceptance Workflows

### Import And Open

PASS when:

- the package imports as `FlowDocPackage.packageVersion = 2`;
- the document is asserted as `DocumentNode.version = 2`;
- every required alias resolves to an existing authored node or field key;
- the current editor runtime adapter can open the package without layout errors.

### Typing And Text Mutation

PASS when:

- `typing.primary` can be edited without browser preview pagination during the
  immediate input lane;
- `typing.deepDocument` can be edited after scrolling deep into the report;
- `typing.pageBoundary` and `typing.boundary` do not create stale, duplicated,
  missing, or out-of-order visible content;
- undo and redo restore document data and the matching paginated snapshot.

### Node Mutation

PASS when:

- add-after, delete, duplicate, reorder, split, and merge use semantic aliases;
- each user-visible mutation creates the intended history entry;
- undo/redo restores the matching document and display state;
- selection/focus does not jump to an unrelated node.

### Table Mutation

PASS when:

- adding a table row preserves table grid validity;
- adding a table column preserves total table width unless an explicit resize
  operation is used;
- resizing the table target settles without layout error;
- undo/redo restores table structure and display state.

### Flow Row Mutation

PASS when:

- resizing the summary flow-row preserves valid width shares;
- adding a column creates a valid flow-stack child and keeps total width share
  at 100;
- undo/redo restores the flow-row structure and visual layout.

### Field/Data Readiness

PASS when:

- field registry entries are present for the required field aliases;
- fixture data contains representative scalar values;
- readiness warnings identify missing required data without corrupting history;
- filling data updates preview/export state without becoming authored document
  history unless a field definition or authored node actually changes.

### Export Readiness

PASS when:

- export uses the current checked `previewDoc`;
- PDF export does not consume partial browser preview output;
- page numbering and footer behavior remain representative of report workflows;
- DOCX output remains structurally useful for report editing, even if not
  pixel-perfect.

## Operation Source-Of-Truth Use

Later operation work should cite this scenario when choosing what to migrate.

Rules:

- Every operation source-of-truth slice must name which `product-report-v2`
  workflow it protects.
- An operation change is not complete if it passes a mechanical stress fixture
  but weakens import/open, history, pagination, field readiness, or export
  behavior for this scenario.
- Operation payloads may reference scenario aliases during tests, but operation
  metadata must not be persisted into `DocumentNode`, PDF, or DOCX output.
- If the scenario reveals that a runtime path is only a compatibility bridge,
  prefer making the ownership explicit over tuning the bridge silently.

## Phase Map

Parent goal:

- Establish one product-shaped v2 anchor before continuing operation
  source-of-truth and stability work.

Current job lane:

- Product Report v2 anchor.

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Scenario contract | Docs | `product-report-v2` workflow, targets, acceptance, and stop conditions are explicit | done | this document; `docs/DOCS_INDEX.md`; `docs/PRODUCT_SCENARIOS.md`; `docs/FIXTURE_CATALOG.md` |
| 2 | Fixture design | generator/package/test design | exact package structure, field set, aliases, and test entry points are planned | done | `generate-flowdoc-v2-fixtures.mjs`, v2 contract |
| 3 | Fixture implementation | `public/mock`, generator, manifest, fixture tests | package exists, validates as v2, aliases resolve | done | `public/mock/product-report-v2.flowdoc.json`; `public/mock/flowdoc-v2-mock-manifest.json`; `documentV2StressFixture.test.ts` |
| 4 | Product workflow checks | browser smoke/test docs/scripts | import, typing, node, table, flow-row, history, readiness, and export gates are runnable | in_progress | typing/import PASS; structure mutation PASS; node mutation correctness PASS with latency RISK |
| 5 | Operation audit against anchor | operation plans/docs/tests | source-of-truth gaps are ranked by product workflow impact | pending | operation architecture evidence |
| 6 | Architecture slices | editor operation/runtime code | selected source-of-truth gaps are migrated with focused verification | pending | focused tests and smoke evidence |

## Implementation Evidence

Implemented fixture path:

- `scripts/generate-flowdoc-v2-fixtures.mjs` generates
  `product-report-v2.flowdoc.json` and the manifest entry.
- `public/mock/product-report-v2.flowdoc.json` is a package v2 document with
  `DocumentNode.version = 2`.
- `public/mock/flowdoc-v2-mock-manifest.json` includes `product-report-v2`.
- `src/app/editor/_components/__tests__/documentV2StressFixture.test.ts`
  validates the product report fixture, field aliases, node aliases, v2 graph
  shape, and current runtime adapter import.

Verified:

```text
node --check scripts/generate-flowdoc-v2-fixtures.mjs
npm.cmd run test:app -- src/app/editor/_components/__tests__/documentV2StressFixture.test.ts scripts/flowdoc-fixture-targets.test.mjs
```

Phase 4 browser evidence:

```text
FLOWDOC_PROBE_FILE=public/mock/product-report-v2.flowdoc.json
PROBE_TARGET_ALIAS=typing.primary
PROBE_BURST_LENGTH=1
npm.cmd run smoke:wysiwyg-smoothness
```

Result: PASS. `ok=true`, paint p95 about 4.1ms, browser preview pagination
count 0, console errors 0, and page errors 0.

```text
FLOWDOC_STRUCTURE_FILE=public/mock/product-report-v2.flowdoc.json
npm.cmd run smoke:wysiwyg-structure-mutation
```

Result: PASS. Table add row, table add column, table column resize,
flow-stack add column, flow-row resize, preview settle, and undo restore passed
against product aliases. Console errors and page errors were 0.

```text
FLOWDOC_MUTATION_FILE=public/mock/product-report-v2.flowdoc.json
npm.cmd run smoke:wysiwyg-node-mutation
```

Result: RISK. The strict run failed because add paragraph took 5772ms against a
5000ms gate. A diagnostic run with `MUTATION_MAX_MS=8000` and
`MUTATION_COPY_DROP_ALIAS=node.reorderTarget` reached drag-copy, but failed to
enable undo after drop. A second diagnostic run with
`MUTATION_COPY_DROP_ALIAS=node.addAfter` passed correctness: add paragraph,
drag-copy, preview settle, undo restore, console errors 0, and page errors 0.
Do not mark product node mutation stability PASS until the strict latency risk
is investigated.

## Next Job Item

Phase 4 should investigate the product node mutation latency RISK before
claiming the product workflow gate is complete.

Known workflow entry points:

- `scripts/flowdoc-fixture-targets.mjs` already resolves dotted target aliases
  for browser probes.
- `scripts/wysiwyg-smoothness-probe.mjs` can target typing aliases.
- `scripts/wysiwyg-node-mutation-smoke.mjs` can target node mutation aliases.
- `scripts/wysiwyg-structure-mutation-smoke.mjs` can target table/flow-row
  aliases after it accepts the product fixture path.
- Existing readiness/export tests can be extended to use the package fixture if
  browser coverage is not the first safe slice.

Phase 4 decision to make explicit:

- why product add paragraph currently exceeds the strict 5000ms node mutation
  gate even though correctness, preview settle, and undo restore pass under the
  diagnostic 8000ms budget;
- whether `node.reorderTarget` should remain a generic reorder-only target and
  `node.addAfter` should be the product fixture's preferred canvas copy-drop
  target;
- which workflow remains next after node mutation: deep edit, readiness, or
  export;
- whether to reuse existing stress smoke scripts by only changing fixture paths
  and aliases, or add a product-specific smoke wrapper;
- which thresholds are acceptance gates and which are recorded as risk.

## Stop Conditions

Stop for owner review before:

- changing persisted document/package schema;
- changing pagination, export, undo/redo, or editor lifecycle semantics;
- replacing the current official legacy stress baseline;
- lowering stability thresholds to make a result pass;
- removing existing stress/browser coverage;
- making `product-report-v2` the only acceptance gate.

Continue autonomously when:

- adding or refining this scenario documentation;
- designing the fixture structure;
- adding generated package content that follows the accepted v2 contract;
- adding semantic aliases and tests that only assert current behavior;
- updating catalogs/checklists to keep the anchor discoverable.

## Verification Plan

Phase 1 docs-only verification:

- `git diff --check`

Phase 2 design verification:

- target alias design reviewed against `docs/DOCUMENT_MODEL_V2_CONTRACT.md`
- fixture location and generator strategy named

Phase 3 implementation verification:

- v2 fixture validity tests
- alias resolution tests
- package import/open tests

Phase 4 workflow verification:

- focused browser smoke for typing and deep edit
- node mutation smoke
- table/flow-row structure mutation smoke
- readiness/export smoke or focused tests

## Decision Rule

When an implementation detail conflicts with this scenario, protect in this
order:

1. valid authored `DocumentNode v2`;
2. clear history ownership;
3. authoritative pagination and stale-result rejection;
4. export readiness from checked preview state;
5. responsive editor behavior on representative long content;
6. compatibility with future AI/external operation callers.
