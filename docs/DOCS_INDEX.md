# Docs Index

This is the entry point for FlowDocEditor documentation. Use it to find the
right source of truth before changing code, tests, or product behavior.

## Fast Read Order

For a new session or agent:

1. `docs/DOCS_INDEX.md`
2. `docs/AGENT_WORKFLOW.md`
3. `docs/PRODUCT_DIRECTION.md`
4. `docs/ENGINEERING_PRINCIPLES.md`
5. `docs/ARCHITECTURE_OVERVIEW.md`
6. `docs/WORK_LOG.md` recent entries
7. `docs/TEST_STRATEGY.md`
8. The task-specific contract or checklist below

For a quick bug fix, read only enough to avoid contradicting the relevant
contract, then inspect the code and tests near the change.

## Source Of Truth Map

| Need | Read |
|---|---|
| Product north star and long-term direction | `docs/PRODUCT_DIRECTION.md` |
| How an agent/session should work | `docs/AGENT_WORKFLOW.md` |
| System/layer overview | `docs/ARCHITECTURE_OVERVIEW.md` |
| Engineering boundaries and principles | `docs/ENGINEERING_PRINCIPLES.md` |
| Test levels and Definition of Done | `docs/TEST_STRATEGY.md` |
| Persisted/editor JSON package contract | `docs/FLOWDOC_PACKAGE_CONTRACT.md` |
| Browser/manual editor smoke checks | `docs/BROWSER_SMOKE_CHECKLIST.md` |
| Export/API/PDF/DOCX renderer contract | `docs/EXPORT_RENDERER_CONTRACT.md` |
| Fixture and test coverage catalog | `docs/FIXTURE_CATALOG.md` |
| Completed work and historical context | `docs/WORK_LOG.md` |
| Layout/pagination engine rules | `docs/LAYOUT_ENGINE_SPEC.md` |
| Layout implementation checklist/status | `docs/LAYOUT_ENGINE_CHECKLIST.md` |
| Page-boundary behavior | `docs/CROSS_PAGE_BEHAVIOR.md` |
| Page fragmentation model | `docs/PAGE_FRAGMENTATION_MODEL.md` |
| Editor interaction and UX behavior | `docs/EDITOR_UX_CONTRACT.md` |
| Table authoring and table operations | `docs/TABLE_EDITING_CONTRACT.md` |
| Product scenarios and fixture coverage | `docs/PRODUCT_SCENARIOS.md` |
| Text engine status | `docs/TEXT_ENGINE_CHECKLIST.md` |
| Text reflow direction | `docs/TEXT_REFLOW_PLAN.md` |

## Task-Based Reading

### Table Work

Start with:

- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_SCENARIOS.md`

Use `docs/EDITOR_UX_CONTRACT.md` if the change touches table selection, cell
editing, property panels, or browser interaction feel.

### Cross-Page Or Pagination Work

Start with:

- `docs/PAGE_FRAGMENTATION_MODEL.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`

Any page-boundary behavior change should update the cross-page contract and add
or adjust a focused fixture.

### Editor UX Work

Start with:

- `docs/EDITOR_UX_CONTRACT.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/TEST_STRATEGY.md`
- recent `docs/WORK_LOG.md` entries touching inline edit, undo/redo, or tables

Browser smoke checks are expected for meaningful editor interaction changes.

### Text Measurement Or Inline Editing Work

Start with:

- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/TEXT_REFLOW_PLAN.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/LAYOUT_ENGINE_SPEC.md`

### Export Or Renderer Work

Start with:

- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TEST_STRATEGY.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`

PDF is the authoritative output target. DOCX is an exchange format and may
reflow in Word/LibreOffice.

### Package, Persistence, Or JSON Import Work

Start with:

- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/TEST_STRATEGY.md`

Persisted/editor JSON should use `FlowDocPackage v1`. Core layout, pagination,
API export, and renderers should continue to consume `DocumentNode` /
`PaginatedDocument`.

### Test Or Fixture Work

Start with:

- `docs/TEST_STRATEGY.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/PRODUCT_SCENARIOS.md`
- the focused test file near the behavior

## Work Log Policy

`docs/WORK_LOG.md` is historical. Do not rewrite old entries just because later
test counts or implementation details changed.

For current truth, use the current contract/checklist/spec docs. For what
happened in a past session, use the work log.

## When Docs Disagree

Use this priority order:

1. Product direction
2. Current contracts/specs/checklists
3. Current tests and code
4. Historical work log entries

If current docs disagree with current code/tests, fix the docs or code in the
same change and record the recheck in `docs/WORK_LOG.md`.
