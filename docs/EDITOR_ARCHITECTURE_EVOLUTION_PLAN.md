# Editor Architecture Evolution Plan

Status: Active north-star plan. Phase 1, Phase 2, and Phase 3 are complete;
the next recommended lane is Phase 4, Long-document v2 stress harness.

Use this document when choosing the next broad editor architecture job. It is
intentionally higher-level than the per-lane implementation plans. Each phase
below should be split into its own delegated job plan before code changes.

## Goal

Make FlowDocEditor stable and scalable for long documents while preserving:

- document model correctness
- pagination and export consistency
- undo/redo history integrity
- responsive typing, node insertion, node deletion, and structural editing
- clear ownership between model, operation, pagination, render, and diagnostics

The target is not a large rewrite. The target is a sequence of architecture
lanes that remove ambiguity before the system grows around it.

## Current Position

- Phase 1, Runtime Document Model v2 primary path: complete.
- Phase 2, Operation command architecture: complete.
- Phase 3, Pagination snapshot identity: complete.
- Next lane: Phase 4, Long-document v2 stress harness.

## Current Baseline

Completed foundations:

- Document Model v2 direction and contract exist.
- Operation Architecture routes non-legacy operation kinds before reducer
  fallback.
- Operation commands now own semantic planning across node, field, text,
  flow-row, table, document settings, style, paragraph, list, and drag groups;
  payload remains a deprecated compatibility fallback.
- Text lifecycle and structural lifecycle data are separated into runtime
  context where they are not command fields.
- Pagination display ownership is explicit for authoritative state vs partial
  browser preview.
- Pagination snapshots now have typed source, freshness, and adoption metadata
  for authoritative display, partial browser preview, and server readiness
  checks.
- Structural operation handlers no longer import React scheduler APIs directly.
- `/api/paginate` runtime measurer/fallback cache is isolated and resettable.

Remaining structural risks:

- Runtime editor state still uses compatibility v1/current document structures
  in many paths.
- `EditorOperationEnvelope.action` remains for reducer fallback, dispatch
  compatibility, and compatibility action snapshots, but it is no longer the
  semantic source for non-legacy operation planning.
- Scoped validation still falls back to full validation.
- `EditorShell` and `EditorCanvas` remain large coordination/render files.
- Diagnostics and performance telemetry still live inside business/runtime
  logic in several areas.
- Long-document stability needs a new v2-first stress fixture and browser probe
  lane.

## Direction Principles

- Prefer source-of-truth migration before file splitting.
- Prefer explicit contracts over implicit ref/state coupling.
- Keep compatibility adapters while migrating callers, then remove them after
  tests prove no runtime dependency remains.
- Do not let browser preview, server pagination, WYSIWYG draft pagination, or
  export become competing layout truths.
- Every broad phase needs a durable plan, ledger, focused tests, and a clear
  stop condition before implementation.
- Browser smoke/stress evidence is required before claiming long-document
  responsiveness improvements.

## Phase Map

| Phase | Lane | Purpose | Done criteria | Primary evidence |
|---|---|---|---|---|
| 0 | Completed critique response baseline | Preserve the current completed architecture hardening work. | Phase 2-7 critique response ledger is complete and verified. | `docs/EDITOR_CRITIQUE_RESPONSE_PLAN.md` |
| 1 | Runtime Document Model v2 primary path | Move editor/runtime planning toward v2 graph as the normal model instead of compatibility side data. | Runtime mutation/planning paths can consume v2 graph identity without adapting nested table state in hot paths. | `docs/DOCUMENT_MODEL_V2_PLAN.md`, `docs/DOCUMENT_MODEL_V2_CONTRACT.md` |
| 2 | Operation command architecture | Define operation commands as the semantic owner for editor, future AI, and durable history paths while keeping `EditorAction` as UI/legacy compatibility where needed. | Remaining `operation.action` reads are either migrated to command/runtime context or documented as explicit UI lifecycle, state-only, or legacy bridges. | `docs/EDITOR_OPERATION_COMMAND_ARCHITECTURE_PLAN.md`, `docs/EDITOR_OPERATION_SOURCE_OF_TRUTH_PLAN.md` |
| 3 | Pagination snapshot identity | Add a shared identity/freshness contract for authoritative, partial, WYSIWYG draft, optimistic, and server-checked pagination snapshots. | Stale layout outputs cannot overwrite newer display/readiness/history state by construction. | `docs/EDITOR_PAGINATION_OWNERSHIP_CONTRACT.md` |
| 4 | Long-document v2 stress harness | Replace old stress assumptions with v2-first fixtures and repeatable probes. | Typing, add/delete/duplicate, split/merge, and table/flow-row cases run against a long v2 fixture with measurable gates. | `docs/EDITOR_LONG_DOCUMENT_V2_STRESS_HARNESS_PLAN.md`, `docs/EDITOR_STABILITY_GATES.md`, `docs/BROWSER_SMOKE_CHECKLIST.md` |
| 5 | Scoped validation and history symmetry | Replace full-validation fallback for scoped operation commits where safe. | Operation commits have symmetric validation/history/paginated snapshot rules without two-tier trust ambiguity. | `docs/EDITOR_REDUCER_RESPONSIBILITY_AUDIT.md` |
| 6 | Shell and canvas decomposition by ownership | Extract tested controllers/helpers from `EditorShell` and renderer helpers from `EditorCanvas`. | Large files shrink only through ownership boundaries that already have tests. | `docs/EDITOR_RENDER_ACTION_OWNERSHIP.md` |
| 7 | Diagnostics boundary | Move telemetry/perf attribution behind stable event surfaces. | Business logic emits domain events or receives diagnostics ports instead of embedding telemetry decisions inline. | WYSIWYG/perf docs and focused diagnostics tests |
| 8 | Production stability gate | Define what must pass before architecture work is considered product-ready. | Type-check, app/core suites, API route smoke, browser smoke, and long-document probe gates are documented and repeatable. | `docs/TEST_STRATEGY.md`, `docs/WYSIWYG_PRODUCTION_GATE.md` |

## Recommended Execution Order

Recommended order:

1. Runtime Document Model v2 primary path.
2. Operation semantics without action dependency.
3. Pagination snapshot identity.
4. Long-document v2 stress harness.
5. Scoped validation and history symmetry.
6. Shell and canvas decomposition by ownership.
7. Diagnostics boundary.
8. Production stability gate.

Why this order:

- v2 runtime identity gives operation, pagination, and fixture work one graph
  vocabulary.
- Operation semantics should be stable before broad shell/canvas decomposition.
- Pagination identity should land before claiming responsiveness or export
  readiness improvements.
- The stress harness should be created before large UI decomposition so
  regressions are measurable.

## Phase 1: Runtime Document Model v2 Primary Path

Goal:

- Treat the v2 document graph as the normal runtime planning identity.

Candidate jobs:

- Audit current runtime adapters that convert between current document shape and
  v2 graph diagnostics.
- Define which editor state fields remain current-shape compatibility and which
  become v2-first.
- Move table/flow-row parentage, sibling, and capability checks to v2 graph
  helpers where hot mutation paths need them.
- Keep persistence/import compatibility explicit.

Done criteria:

- The editor can plan major node/table/flow-row mutations through one graph
  identity contract.
- No behavior change is claimed until current reducer and export tests pass.

## Phase 2: Operation Command Architecture

Goal:

- Make operation commands and operation plans own mutation semantics without
  misusing UI action snapshots as the stable automation surface.

Candidate jobs:

- Define `EditorOperationCommand`, compatibility action snapshots, runtime
  context, and operation plans as separate contracts.
- Add command-first construction so future AI/external callers do not need to
  dispatch reducer actions.
- Audit remaining `operation.action` reads and classify them as legacy fallback,
  UI lifecycle bridge, state-only action, or removable semantic dependency.
- Migrate paragraph/list/drag/table/text lifecycle leftovers that still unpack
  action snapshots for semantic planning.
- Add tests that mutate the compatibility action snapshot and prove commands
  still drive operation planning.

Done criteria:

- Non-legacy operation kinds do not need action snapshots for semantic command
  planning.
- Runtime/session fields such as paginated snapshots, history entries,
  precomputed docs, graph indexes, and optimistic flags are not treated as
  command fields.
- Compatibility fallback is explicit and bounded.

## Phase 3: Pagination Snapshot Identity

Goal:

- Prevent stale or partial pagination outputs from silently becoming the wrong
  display, readiness, history, or export basis.

Candidate jobs:

- Introduce a typed pagination snapshot identity with source, generation,
  document version/hash, freshness, and adoption purpose.
- Route display resolver, partial preview guards, server readiness, and WYSIWYG
  draft adoption through the same identity vocabulary.
- Keep server `/api/paginate` as readiness/drift/export evidence, not a direct
  display override.

Done criteria:

- Tests cover stale partial preview, stale server response, draft pagination
  supersession, and undo/redo snapshot pairing.

## Phase 4: Long-Document v2 Stress Harness

Goal:

- Create future-proof evidence for the user goal: typing and node operations
  should feel normal even in very long documents.

Candidate jobs:

- Design a v2-first long fixture with flow-row, flow-table, field refs, styles,
  page numbers, and repeated sections.
- Add deterministic target aliases for smoke/probe scripts.
- Add operation loops for add/delete/duplicate/split/merge and typing bursts.
- Track first visual response, full pagination settle, stale output rejection,
  and history consistency.

Done criteria:

- The old stress mock is no longer the main design reference.
- Browser smoke/probe gates can be rerun without manual fixture surgery.

## Phase 5: Scoped Validation And History Symmetry

Goal:

- Remove ambiguity between full commit validation, prevalidated fast paths, and
  operation-scoped validation.

Candidate jobs:

- Define scoped validation units around v2 graph parentage and affected node
  sets.
- Implement scoped validators only where they are equivalent to full validation
  for the operation surface.
- Ensure undo/redo always stores the matching document and paginated snapshot.

Done criteria:

- Scoped validation is either implemented with proof or explicitly falls back
  with no misleading policy name.

## Phase 6: Shell And Canvas Decomposition By Ownership

Goal:

- Reduce `EditorShell` and `EditorCanvas` size by extracting stable ownership
  boundaries, not by moving code around blindly.

Candidate jobs:

- Extract shell state machines that already have helper contracts: preview
  lifecycle, export readiness, edit session, pagination display, selection.
- Extract canvas render helpers around fragment grouping, hit testing, chrome,
  and draft visual surfaces.
- Keep render-only helpers pure where possible.

Done criteria:

- Extracted modules have focused tests or are covered by existing render tests.
- No broad component split lands without behavior evidence.

## Phase 7: Diagnostics Boundary

Goal:

- Make telemetry and performance attribution observable without embedding it
  deeply in business logic.

Candidate jobs:

- Identify high-noise telemetry blocks in editor shell, canvas, structural
  handlers, and WYSIWYG runtime.
- Introduce diagnostics ports/event helpers for operation, pagination, render,
  and edit lifecycle events.
- Keep event names stable for probes.

Done criteria:

- Runtime code can perform core decisions without directly owning telemetry
  formatting.

## Phase 8: Production Stability Gate

Goal:

- Define the minimum evidence required before claiming architecture work is
  ready for normal product development.

Candidate jobs:

- Consolidate type-check, core/app/API, browser smoke, export, and long-document
  probes into a repeatable acceptance matrix.
- Record thresholds for typing responsiveness and pagination settle.
- Document which warnings are acceptable and which block release.

Done criteria:

- A future agent can run the gate and know whether the editor is safer than
  before.

## Owner Checkpoints

Ask for owner review before:

- changing persisted document shape
- flipping runtime state to v2-primary
- removing `EditorAction` compatibility paths
- changing export or server pagination semantics
- replacing old stress fixtures as the official reference
- broad `EditorShell` or `EditorCanvas` decomposition

Do not ask for per-patch approval when:

- the current delegated phase has an accepted plan
- the next step is small, reversible, and inside the phase scope
- tests can prove behavior preservation

## Next Recommended Job

Phase 1, Phase 2, and Phase 3 are complete. Start with the dedicated Phase 4
long-document v2 stress harness lane:

```text
Goal: Long-document v2 stress harness
Output: v2-first long fixture plus repeatable operation/browser probes for
typing, add/delete/duplicate, split/merge, and table/flow-row cases
First question: which fixture shape and probe metrics prove that long-document
editing still feels normal without tying the design to the old stress mock?
```

The first Phase 4 job should be a design gate plus fixture/probe contract, not
a broad UI performance rewrite.
