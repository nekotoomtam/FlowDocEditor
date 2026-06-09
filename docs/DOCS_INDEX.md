# Docs Index

This is the active entry point for FlowDocEditor documentation. Use it to pick
the smallest useful reading set before changing code, tests, or product
behavior.

## Fast Read Order

For a new session:

1. `AGENTS.md`
2. `docs/DOCS_INDEX.md`
3. `docs/agent/CODEX_ROLES.md`
4. `docs/agent/REVIEW_GATE.md` when reviewing or accepting work
5. `docs/agent/AGENT_OPERATING_MODEL.md` when ownership, scope, or handoff is
   unclear
6. The smallest task-specific contract below
7. `docs/WORK_LOG_RECENT.md` only when recent implementation context is needed

## Source Of Truth Map

| Need | Read |
|---|---|
| Agent operating rules | `AGENTS.md` |
| Agent roles | `docs/agent/CODEX_ROLES.md` |
| Detailed agent workflow | `docs/agent/AGENT_OPERATING_MODEL.md` |
| Handoff template | `docs/agent/TASK_HANDOFF.md` |
| Review gate | `docs/agent/REVIEW_GATE.md` |
| Product direction | `docs/PRODUCT_DIRECTION.md` |
| Version/readiness semantics | `docs/VERSIONING.md` |
| Engineering boundaries | `docs/ENGINEERING_PRINCIPLES.md` |
| System overview | `docs/ARCHITECTURE_OVERVIEW.md` |
| Test strategy | `docs/TEST_STRATEGY.md` |
| Browser smoke checks | `docs/BROWSER_SMOKE_CHECKLIST.md` |
| Editor UX | `docs/EDITOR_UX_CONTRACT.md` |
| Paragraph box styling | `docs/PARAGRAPH_BOX_STYLE_CONTRACT.md` |
| Paragraph/text style presets | `docs/PARAGRAPH_STYLE_CONTRACT.md` |
| Style manager | `docs/STYLE_MANAGER_CONTRACT.md` |
| WYSIWYG roadmap | `docs/WYSIWYG_EDITOR_ROADMAP.md` |
| WYSIWYG text engine | `docs/WYSIWYG_TEXT_ENGINE_PLAN.md` |
| WYSIWYG paragraph interactions | `docs/WYSIWYG_PARAGRAPH_INTERACTION_CHECKLIST.md` |
| WYSIWYG edit/show parity | `docs/WYSIWYG_PARITY_PLAN.md` |
| Rich text draft lane | `docs/RICH_TEXT_DRAFT_DECISION.md` |
| List numbering | `docs/LIST_NUMBERING_CONTRACT.md` |
| List style manager | `docs/LIST_STYLE_MANAGER_CONTRACT.md` |
| Layout/pagination rules | `docs/LAYOUT_ENGINE_SPEC.md` |
| Lazy pagination | `docs/LAZY_PAGINATION_PLAN.md` |
| Cross-page behavior | `docs/CROSS_PAGE_BEHAVIOR.md` |
| Flow row/stack | `docs/FLOW_ROW_STACK_SPEC.md`, `docs/FLOW_ROW_STACK_ROADMAP.md`, `docs/FLOW_ROW_STACK_ACCEPTANCE_REVIEW.md` |
| Table authoring | `docs/TABLE_EDITING_CONTRACT.md`, `docs/FLOW_TABLE_SPEC.md` |
| Export/API/renderers | `docs/EXPORT_RENDERER_CONTRACT.md` |
| Package and persistence | `docs/FLOWDOC_PACKAGE_CONTRACT.md`, `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md` |
| Field registry and data | `docs/FIELD_REGISTRY_CONTRACT.md`, `docs/DATA_SNAPSHOT_CONTRACT.md` |
| Fixtures and product scenarios | `docs/FIXTURE_CATALOG.md`, `docs/PRODUCT_SCENARIOS.md` |
| Current handoff context | `docs/WORK_LOG_RECENT.md` |

## Task Reading Sets

Agent or review work:

- `AGENTS.md`
- `docs/agent/CODEX_ROLES.md`
- `docs/agent/AGENT_OPERATING_MODEL.md`
- `docs/agent/TASK_HANDOFF.md`
- `docs/agent/REVIEW_GATE.md`

WYSIWYG or inline editing:

- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WYSIWYG_PARAGRAPH_INTERACTION_CHECKLIST.md` when paragraph typing,
  click-to-caret, Enter, or Backspace smoothness is in scope
- `docs/WYSIWYG_PARITY_PLAN.md`
- `docs/RICH_TEXT_DRAFT_DECISION.md` when rich draft state is in scope
- `docs/WYSIWYG_PRODUCTION_GATE.md` before changing default/production
  eligibility
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`

Layout, pagination, or cross-page behavior:

- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAZY_PAGINATION_PLAN.md` when checkpointing or partial preview is in
  scope
- `docs/LIST_NUMBERING_CONTRACT.md` when list marker continuation is in scope
- `docs/TEST_STRATEGY.md`

Table work:

- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/EDITOR_UX_CONTRACT.md` when table selection or property panels are in
  scope

Export, renderer, package, field, or data work:

- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/TEST_STRATEGY.md`

Test or fixture work:

- `docs/TEST_STRATEGY.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- the focused test file near the behavior

## History Policy

Detailed historical work logs and superseded drafts are not kept as default
reading material. Use git history when older task transcripts or archived draft
text are needed.

## When Docs Disagree

Use this priority order:

1. `AGENTS.md` for agent behavior
2. Product direction
3. Current contracts/specs
4. Current tests and code
5. Recent work context

If docs disagree with current code/tests, fix the docs or code in the same
change and record the recheck in `docs/WORK_LOG_RECENT.md` or the active
contract that owns the behavior.
