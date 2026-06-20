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
6. `docs/agent/JOB_OPERATING_MODEL.md` when the user delegates a broad goal,
   image, or problem for Codex to break down and iterate on
7. `docs/agent/JOB_INTAKE_TEMPLATE.md` when a delegated job needs a durable
   plan, ledger, or owner checkpoint
8. The smallest task-specific contract below
9. `docs/WORK_LOG_RECENT.md` only when recent implementation context is needed

## Source Of Truth Map

| Need | Read |
|---|---|
| Agent operating rules | `AGENTS.md` |
| Agent roles | `docs/agent/CODEX_ROLES.md` |
| Detailed agent workflow | `docs/agent/AGENT_OPERATING_MODEL.md` |
| Goal-oriented job workflow | `docs/agent/JOB_OPERATING_MODEL.md` |
| Job intake and ledger template | `docs/agent/JOB_INTAKE_TEMPLATE.md` |
| Handoff template | `docs/agent/TASK_HANDOFF.md` |
| Review gate | `docs/agent/REVIEW_GATE.md` |
| Product direction | `docs/PRODUCT_DIRECTION.md` |
| Version/readiness semantics | `docs/VERSIONING.md` |
| Engineering boundaries | `docs/ENGINEERING_PRINCIPLES.md` |
| System overview | `docs/ARCHITECTURE_OVERVIEW.md` |
| Document model v2 direction | `docs/DOCUMENT_MODEL_V2_PLAN.md` |
| Document model v2 contract | `docs/DOCUMENT_MODEL_V2_CONTRACT.md` |
| Node model vNext contract | `docs/NODE_MODEL_VNEXT_CONTRACT.md` |
| Node relationship graph vNext | `docs/NODE_RELATIONSHIP_GRAPH_VNEXT_PLAN.md` |
| Node model vNext package/schema boundary | `docs/NODE_MODEL_VNEXT_PACKAGE_SCHEMA_BOUNDARY_PLAN.md` |
| Node model vNext prototype adapter evidence | `docs/NODE_MODEL_VNEXT_PROTOTYPE_ADAPTER_PLAN.md` |
| vNext extractable workspace | `vnext-workspace/README.md`, `vnext-workspace/docs/WORKSPACE_BOUNDARY.md`, `vnext-workspace/docs/PHASE_LEDGER.md`, `vnext-workspace/docs/PHASE_10_CLOSE_AUDIT.md` |
| Editor runtime Document Model v2 | `docs/EDITOR_RUNTIME_DOCUMENT_MODEL_V2_PLAN.md` |
| Editor vNext runtime bridge | `docs/EDITOR_VNEXT_RUNTIME_BRIDGE_PLAN.md` |
| Editor vNext import boundary | `docs/EDITOR_VNEXT_IMPORT_BOUNDARY_DECISION.md` |
| Test strategy | `docs/TEST_STRATEGY.md` |
| Browser smoke checks | `docs/BROWSER_SMOKE_CHECKLIST.md` |
| Editor UX | `docs/EDITOR_UX_CONTRACT.md` |
| Editor architecture evolution | `docs/EDITOR_ARCHITECTURE_EVOLUTION_PLAN.md` |
| Editor critique response plan | `docs/EDITOR_CRITIQUE_RESPONSE_PLAN.md` |
| Editor operation architecture | `docs/EDITOR_OPERATION_ARCHITECTURE.md` |
| Editor operation command architecture | `docs/EDITOR_OPERATION_COMMAND_ARCHITECTURE_PLAN.md` |
| Editor operation source-of-truth plan | `docs/EDITOR_OPERATION_SOURCE_OF_TRUTH_PLAN.md` |
| Editor reducer responsibility audit | `docs/EDITOR_REDUCER_RESPONSIBILITY_AUDIT.md` |
| Editor mutation path equality | `docs/EDITOR_MUTATION_PATH_EQUALITY_PLAN.md` |
| Editor render/action ownership | `docs/EDITOR_RENDER_ACTION_OWNERSHIP.md` |
| Editor pagination ownership | `docs/EDITOR_PAGINATION_OWNERSHIP_CONTRACT.md` |
| Editor long-document v2 stress harness | `docs/EDITOR_LONG_DOCUMENT_V2_STRESS_HARNESS_PLAN.md` |
| Editor long-document stability gates | `docs/EDITOR_STABILITY_GATES.md` |
| Product report v2 scenario anchor | `docs/PRODUCT_REPORT_V2_SCENARIO_CONTRACT.md` |
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
- `docs/agent/JOB_OPERATING_MODEL.md` when the user delegates a broad goal,
  image, or problem for Codex to break down and iterate on
- `docs/agent/JOB_INTAKE_TEMPLATE.md` when the delegated job needs a durable
  plan, ledger, or owner checkpoint
- `docs/agent/TASK_HANDOFF.md`
- `docs/agent/REVIEW_GATE.md`

WYSIWYG or inline editing:

- `docs/EDITOR_UX_CONTRACT.md`
- `docs/EDITOR_ARCHITECTURE_EVOLUTION_PLAN.md` when choosing the next broad
  editor architecture lane
- `docs/EDITOR_OPERATION_ARCHITECTURE.md` when mutation, history, or operation
  ownership is in scope
- `docs/EDITOR_OPERATION_COMMAND_ARCHITECTURE_PLAN.md` when separating
  operation command, legacy UI action, runtime context, operation plan, or
  future AI/external caller semantics
- `docs/EDITOR_OPERATION_SOURCE_OF_TRUTH_PLAN.md` when Operation Architecture
  is being moved from bridge metadata to runtime source of truth
- `docs/EDITOR_REDUCER_RESPONSIBILITY_AUDIT.md` when reducer extraction or
  operation migration is in scope
- `docs/EDITOR_MUTATION_PATH_EQUALITY_PLAN.md` when remaining direct
  `pushDoc(...)` mutation branches are in scope
- `docs/EDITOR_RENDER_ACTION_OWNERSHIP.md` when render invalidation,
  operation ownership, or page render scope is in scope
- `docs/EDITOR_STABILITY_GATES.md` when long-document responsiveness,
  stress-fixture coverage, or operation acceptance is in scope
- `docs/EDITOR_LONG_DOCUMENT_V2_STRESS_HARNESS_PLAN.md` when building or
  accepting Phase 4 v2 long-document fixture/probe coverage
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

- `docs/NODE_MODEL_VNEXT_CONTRACT.md` when redesigning authored node
  relationships, text-block roles, zones, columns, table boundaries, or
  operation/pagination/export ownership from the model up
- `docs/NODE_RELATIONSHIP_GRAPH_VNEXT_PLAN.md` when designing the runtime graph
  that operation planning, selection, drop, history, validation, pagination, or
  export should query
- `docs/NODE_MODEL_VNEXT_PACKAGE_SCHEMA_BOUNDARY_PLAN.md` when deciding whether
  vNext changes require a document schema version, package envelope version,
  migration API, or adapter boundary
- `docs/NODE_MODEL_VNEXT_PROTOTYPE_ADAPTER_PLAN.md` when mapping current v1/v2
  prototype nodes, placement targets, operation names, or graph facts into
  vNext concepts
- `vnext-workspace/README.md` and
  `vnext-workspace/docs/WORKSPACE_BOUNDARY.md` when working in the temporary
  vNext home that will later move to a new repository
- `vnext-workspace/docs/PHASE_LEDGER.md` and
  `vnext-workspace/docs/PHASE_10_CLOSE_AUDIT.md` when moving from vNext core
  pagination/export work into editor runtime bridge work
- `docs/EDITOR_ARCHITECTURE_EVOLUTION_PLAN.md` when choosing the next broad
  editor architecture lane
- `docs/EDITOR_RUNTIME_DOCUMENT_MODEL_V2_PLAN.md` when moving editor runtime
  planning toward DocumentNode v2 graph identity
- `docs/EDITOR_VNEXT_RUNTIME_BRIDGE_PLAN.md` when connecting the current editor
  runtime to the extractable vNext core after Phase 10
- `docs/EDITOR_VNEXT_IMPORT_BOUNDARY_DECISION.md` before adding parent editor
  imports of the vNext workspace
- `docs/EDITOR_OPERATION_ARCHITECTURE.md` when editor mutation routing or
  operation migration is in scope
- `docs/EDITOR_OPERATION_COMMAND_ARCHITECTURE_PLAN.md` when operation command,
  action snapshot, runtime context, or AI/external caller semantics are in
  scope
- `docs/EDITOR_OPERATION_SOURCE_OF_TRUTH_PLAN.md` when operation-first dispatch
  or operation-plan ownership is in scope
- `docs/EDITOR_REDUCER_RESPONSIBILITY_AUDIT.md` when reducer extraction,
  history policy, validation policy, or commit-adapter work is in scope
- `docs/EDITOR_MUTATION_PATH_EQUALITY_PLAN.md` when remaining direct reducer
  mutation branches are in scope
- `docs/EDITOR_RENDER_ACTION_OWNERSHIP.md` when editor action invalidation or
  render ownership is in scope
- `docs/EDITOR_PAGINATION_OWNERSHIP_CONTRACT.md` when display pagination,
  server reconciliation, WYSIWYG draft pagination, or export readiness is in
  scope
- `docs/EDITOR_STABILITY_GATES.md` when browser preview, stress fixture, or
  long-document responsiveness is in scope
- `docs/EDITOR_LONG_DOCUMENT_V2_STRESS_HARNESS_PLAN.md` when the stress
  fixture/probe work must be v2-first
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAZY_PAGINATION_PLAN.md` when checkpointing or partial preview is in
  scope
- `docs/LIST_NUMBERING_CONTRACT.md` when list marker continuation is in scope
- `docs/TEST_STRATEGY.md`

Table work:

- `docs/NODE_MODEL_VNEXT_CONTRACT.md` when table nodes are being reconsidered
  as part of the next authored model or relationship graph
- `docs/NODE_RELATIONSHIP_GRAPH_VNEXT_PLAN.md` when table ownership,
  table-cell selection, table drop targets, or table validation scope must come
  from the shared relationship graph
- `docs/NODE_MODEL_VNEXT_PROTOTYPE_ADAPTER_PLAN.md` when translating
  `flow-table`, `flow-table-row`, or `flow-table-cell` prototype behavior into
  vNext table concepts
- `docs/DOCUMENT_MODEL_V2_CONTRACT.md` when implementing v2 table storage,
  table flattening, graph parentage, or v2 table fixtures
- `docs/DOCUMENT_MODEL_V2_PLAN.md` when table storage, node graph parentage, or
  v2 fixture shape is in scope
- `docs/EDITOR_RUNTIME_DOCUMENT_MODEL_V2_PLAN.md` when table or flow-row
  planning needs runtime v2 graph identity
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/FLOW_TABLE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/EDITOR_UX_CONTRACT.md` when table selection or property panels are in
  scope

Export, renderer, package, field, or data work:

- `docs/DOCUMENT_MODEL_V2_CONTRACT.md` when changing document schema versioning
  inside the package envelope
- `docs/NODE_MODEL_VNEXT_PACKAGE_SCHEMA_BOUNDARY_PLAN.md` when vNext document
  schema, package envelope, migration, field/data, or adapter boundaries are in
  scope
- `docs/NODE_MODEL_VNEXT_PROTOTYPE_ADAPTER_PLAN.md` only as historical
  prototype evidence, or if the owner explicitly requests a separate external
  converter. Canonical vNext core work should use `vnext-workspace/docs/WORKSPACE_BOUNDARY.md`.
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/TEST_STRATEGY.md`

Test or fixture work:

- `docs/DOCUMENT_MODEL_V2_CONTRACT.md` when adding v2 fixtures or semantic
  fixture target aliases
- `docs/DOCUMENT_MODEL_V2_PLAN.md` when replacing old JSON mocks or designing
  fixtures for the v2 node graph
- `docs/TEST_STRATEGY.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_STABILITY_GATES.md` when editor long-document behavior is in
  scope
- `docs/EDITOR_LONG_DOCUMENT_V2_STRESS_HARNESS_PLAN.md` when adding v2 stress
  fixtures, target aliases, or browser probe gates
- `docs/PRODUCT_REPORT_V2_SCENARIO_CONTRACT.md` when turning v2 stress
  coverage into a product-shaped report fixture or using a product workflow as
  the acceptance anchor for operation/stability work
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
