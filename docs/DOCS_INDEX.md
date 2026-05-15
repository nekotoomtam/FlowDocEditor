# Docs Index

This is the active entry point for FlowDocEditor documentation. Use it to choose the smallest useful reading set before changing code, tests, or product behavior.

## Fast Read Order

For a new Codex/agent session:

1. `AGENTS.md`
2. `docs/DOCS_INDEX.md`
3. `docs/agent/CODEX_ROLES.md`
4. `docs/agent/AGENT_OPERATING_MODEL.md` when task ownership, role routing, or multi-agent work is unclear
5. `docs/agent/REVIEW_GATE.md` when reviewing or accepting work
6. The task-specific contract below
7. `docs/WORK_LOG_RECENT.md` only when recent implementation context is needed

For a quick bug fix, read only enough to avoid contradicting the relevant contract, then inspect the code and tests near the change.

## Active Source Of Truth Map

| Need | Read |
|---|---|
| Agent operating rules | `AGENTS.md` |
| Agent roles/modes | `docs/agent/CODEX_ROLES.md` |
| Detailed agent ownership and work division | `docs/agent/AGENT_OPERATING_MODEL.md` |
| Per-task handoff template | `docs/agent/TASK_HANDOFF.md` |
| Pass/fail review standard | `docs/agent/REVIEW_GATE.md` |
| Product north star and long-term direction | `docs/PRODUCT_DIRECTION.md` |
| Project versioning and v1 readiness semantics | `docs/VERSIONING.md` |
| Engineering boundaries and principles | `docs/ENGINEERING_PRINCIPLES.md` |
| System/layer overview | `docs/ARCHITECTURE_OVERVIEW.md` |
| Test levels and Definition of Done | `docs/TEST_STRATEGY.md` |
| Browser/manual editor smoke checks | `docs/BROWSER_SMOKE_CHECKLIST.md` |
| Editor interaction and UX behavior | `docs/EDITOR_UX_CONTRACT.md` |
| WYSIWYG/inline edit roadmap | `docs/WYSIWYG_EDITOR_ROADMAP.md` |
| FlowDoc-owned WYSIWYG text engine plan | `docs/WYSIWYG_TEXT_ENGINE_PLAN.md` |
| End-to-end WYSIWYG edit/show parity plan | `docs/WYSIWYG_PARITY_PLAN.md` |
| WYSIWYG whitespace contract and Tab decision | `docs/WYSIWYG_WHITESPACE_MATRIX.md` |
| WYSIWYG typing smoothness probe and thresholds | `docs/WYSIWYG_SMOOTHNESS_PROBE.md` |
| WYSIWYG edit re-entry line-geometry drift probe | `docs/WYSIWYG_REENTER_DRIFT_PROBE.md` |
| WYSIWYG production enablement gate | `docs/WYSIWYG_PRODUCTION_GATE.md` |
| Current WYSIWYG Stage 4 review packet | `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md` |
| Real OS WYSIWYG IME verification | `docs/WYSIWYG_STAGE4C_IME_MATRIX.md` |
| Stage 4C WYSIWYG IME evidence log | `docs/WYSIWYG_STAGE4C_IME_RESULTS.md` |
| Layout/pagination engine rules | `docs/LAYOUT_ENGINE_SPEC.md` |
| Page-boundary behavior | `docs/CROSS_PAGE_BEHAVIOR.md` |
| Planned flow-row/flow-stack cross-page primitive | `docs/FLOW_ROW_STACK_SPEC.md` |
| Flow-row/flow-stack 0.5.0 implementation roadmap | `docs/FLOW_ROW_STACK_ROADMAP.md` |
| Flow-row/flow-stack 0.5.0 acceptance review | `docs/FLOW_ROW_STACK_ACCEPTANCE_REVIEW.md` |
| Table authoring and table operations | `docs/TABLE_EDITING_CONTRACT.md` |
| Export/API/PDF/DOCX renderer contract | `docs/EXPORT_RENDERER_CONTRACT.md` |
| Persisted/editor JSON package contract | `docs/FLOWDOC_PACKAGE_CONTRACT.md` |
| Field registry and key rules | `docs/FIELD_REGISTRY_CONTRACT.md` |
| Field value data snapshots | `docs/DATA_SNAPSHOT_CONTRACT.md` |
| Recent active work context | `docs/WORK_LOG_RECENT.md` |

## Task-Based Reading

### Agent / Codex Work

Start with:

- `AGENTS.md`
- `docs/agent/CODEX_ROLES.md`
- `docs/agent/AGENT_OPERATING_MODEL.md`
- `docs/agent/TASK_HANDOFF.md`
- `docs/agent/REVIEW_GATE.md`

Use the handoff template to define the task mode, scope, out-of-scope items, expected output, and definition of done.
Use the operating model when assigning responsibilities across lead, reviewer,
implementer, regression, test, docs, or multi-agent lanes.

### WYSIWYG / Inline Editing Work

Start with:

- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WYSIWYG_PARITY_PLAN.md` for the cross-phase edit/show parity plan
- `docs/WYSIWYG_REENTER_DRIFT_PROBE.md` when investigating edit/show or
  edit-reenter line-geometry drift
- `docs/WYSIWYG_PRODUCTION_GATE.md` before changing default/production eligibility
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md` when preparing or reviewing the current Stage 4 baseline
- `docs/WYSIWYG_STAGE4C_IME_MATRIX.md` when clipboard or OS IME behavior is in scope
- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md` when checking the latest Stage 4C evidence
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG_RECENT.md` when checking the latest implementation notes

### Table Work

Start with:

- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEST_STRATEGY.md`

Use `docs/EDITOR_UX_CONTRACT.md` if the change touches table selection, cell editing, property panels, or browser interaction feel.

### Cross-Page Or Pagination Work

Start with:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEST_STRATEGY.md`

Any page-boundary behavior change should update the relevant contract and add or adjust focused tests.

### Export Or Renderer Work

Start with:

- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEST_STRATEGY.md`

PDF is the authoritative output target. DOCX is an exchange format and may reflow in Word/LibreOffice.

### Package, Persistence, Field, Or Data Work

Start with:

- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/TEST_STRATEGY.md`

Field registry/data/history work should stay outside `DocumentNode` unless an explicit design accepts schema changes.

### Test Or Fixture Work

Start with:

- `docs/TEST_STRATEGY.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- the focused test file near the behavior

Historical fixture catalogs are archived and should be consulted only when needed.

## Archived / Non-Default Reading

These files are preserved for history or deeper reference, but they should not be part of the default agent read path:

- `docs/archive/AGENT_WORKFLOW.md`
- `docs/archive/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/archive/PAGE_FRAGMENTATION_MODEL.md`
- `docs/archive/FIXTURE_CATALOG.md`
- `docs/archive/PRODUCT_SCENARIOS.md`
- `docs/archive/TEXT_ENGINE_CHECKLIST.md`
- `docs/archive/TEXT_REFLOW_PLAN.md`
- `docs/archive/WORK_LOG_FULL.md`
- `docs/proposals/FLOWDOC_PACKAGE_V2_PROPOSAL.md`

## When Docs Disagree

Use this priority order:

1. `AGENTS.md` for agent behavior
2. Product direction
3. Current contracts/specs
4. Current tests and code
5. Recent work log
6. Archived historical notes

If current docs disagree with current code/tests, fix the docs or code in the same change and record the recheck in `docs/WORK_LOG_RECENT.md` or the appropriate active contract.
