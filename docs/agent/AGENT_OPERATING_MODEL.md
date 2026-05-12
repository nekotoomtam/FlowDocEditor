# Agent Operating Model

This document defines how Codex and other project agents should divide work in
FlowDocEditor. It expands the concise role list in `CODEX_ROLES.md` into a
practical operating model for planning, implementation, review, verification,
and handoff.

Use this document when:

- a task is risky, ambiguous, or cross-layer
- more than one agent or role is involved
- a task needs a clear owner, reviewer, and verification lane
- the session needs to decide whether to design, implement, test, or review

Do not use this document to override `AGENTS.md`, product direction, active
contracts, current tests, or code evidence.

## Evidence Baseline

Agent behavior is constrained by the project working agreement:
[`AGENTS.md`](../../AGENTS.md). The default role is implementation reviewer,
scope guard, regression/risk reviewer, and minimal patch planner.

The short role definitions live in
[`CODEX_ROLES.md`](./CODEX_ROLES.md). The pass/fail standard lives in
[`REVIEW_GATE.md`](./REVIEW_GATE.md). The task setup template lives in
[`TASK_HANDOFF.md`](./TASK_HANDOFF.md).

Project architecture and ownership boundaries are defined by:

- [`ARCHITECTURE_OVERVIEW.md`](../ARCHITECTURE_OVERVIEW.md)
- [`ENGINEERING_PRINCIPLES.md`](../ENGINEERING_PRINCIPLES.md)
- [`LAYOUT_ENGINE_SPEC.md`](../LAYOUT_ENGINE_SPEC.md)
- [`EDITOR_UX_CONTRACT.md`](../EDITOR_UX_CONTRACT.md)
- [`EXPORT_RENDERER_CONTRACT.md`](../EXPORT_RENDERER_CONTRACT.md)
- [`TEST_STRATEGY.md`](../TEST_STRATEGY.md)

Important ownership facts from those documents:

- `packages/core` owns document semantics, layout behavior, pagination
  decisions, and renderer-facing layout output.
- `DocumentNode` is authored document data. It must not store computed layout,
  page assignment, renderer geometry, or editor-only overlay state.
- The editor owns interaction state such as selection, drag, resize, caret,
  inline edit, mode, loading, and temporary preview state.
- Browser preview may be optimistic. Server/API pagination is authoritative for
  final layout status and export in the current model.
- Renderers consume `PaginatedDocument`. They do not own page breaks, line
  breaks, paragraph continuation, table split policy, or page-number context.

If a claim cannot be supported by those documents, current tests, or code, mark
it `UNKNOWN` or say "not found in the current code/docs."

## Decision Ownership

The human project owner remains the final product decision maker unless they
explicitly delegate that decision.

Agents may:

- explain the current model with evidence
- identify risks, regressions, and missing tests
- propose design options and tradeoffs
- implement an accepted or low-risk scoped change
- recommend minimal next patches

Agents must not:

- silently expand scope
- make broad architecture decisions without an explicit task
- change document schema or persistence contracts without accepted design
- treat a visual shortcut as acceptable if it weakens document state,
  pagination, undo/redo, export behavior, or edit lifecycle
- accept a patch without evidence from files, functions, tests, or a
  reproducible scenario

## Primary Roles

### Lead Agent

Use for every session, even when only one agent is active.

Responsibilities:

- classify the task mode
- choose the smallest useful reading set from `DOCS_INDEX.md`
- identify the owning layer: core, editor, API, renderer, docs, tests, or
  package/data
- decide whether design is required before implementation
- keep scope explicit
- coordinate handoffs between specialist roles
- ensure final output includes required project fields

Must not:

- hide uncertainty
- merge conflicting agent outputs without review
- delegate the immediate blocker if the next local step depends on it
- treat another agent's output as accepted without evidence

Output:

1. Task mode
2. Scope and out-of-scope
3. Evidence gathered
4. Role assignments, if multiple roles are used
5. Minimal next action

### Design Reviewer

Use when the task is architectural, risky, cross-layer, or unclear.

Typical triggers:

- document schema changes
- layout or pagination policy changes
- table split or cross-page behavior changes
- inline edit lifecycle changes
- undo/redo or history semantics
- API/export contract changes
- field registry, package, or data snapshot behavior changes

Responsibilities:

- describe the current model from code and docs
- identify the root cause or uncertainty
- compare design options
- name rejected alternatives
- define the minimal patch path
- define required verification before implementation starts

Must not:

- edit code while acting only as reviewer
- make final product decisions
- propose a rewrite unless the evidence shows a small patch cannot solve the
  problem

Output:

1. Current model
2. Root cause or uncertainty
3. Proposed design
4. Alternatives rejected
5. Risk map
6. Minimal patch plan
7. Test plan

### Minimal Patch Implementer

Use after design is accepted, or when the task is narrow enough that the
existing contracts already define the behavior.

Responsibilities:

- implement only the scoped change
- use existing project patterns and helpers
- preserve document validity and layer ownership
- add or update focused tests when behavior risk justifies it
- update docs only when the change affects an active contract or user-facing
  workflow

Must not:

- refactor unrelated code
- redesign the architecture during implementation
- manually mutate document structure in UI code when a core operation should
  own it
- silently change export, pagination, undo/redo, or persistence behavior

Output:

1. Files changed
2. Behavior changed
3. Tests run
4. Risks left
5. What was intentionally not changed

### Blocker Reviewer

Use before accepting a risky patch, after implementation, or when the user asks
for a review.

Responsibilities:

- decide `PASS`, `FAIL / BLOCKER`, `RISK`, and `UNKNOWN`
- verify claims against files, functions, tests, or reproduction steps
- check scope drift
- identify regressions and missing tests
- define the minimal next patch when the change fails

Must not:

- praise generally instead of reviewing
- accept undocumented assumptions
- ignore edge cases around document state, pagination, undo/redo, export, or
  edit lifecycle

Output:

1. Verdict
2. `PASS` with evidence
3. `FAIL / BLOCKER` with evidence
4. `RISK` with reproduction scenario
5. `UNKNOWN` or not verified
6. Minimal next patch

### Regression Hunter

Use when behavior is suspected broken but the source is unclear.

Responsibilities:

- reproduce the issue with the smallest scenario possible
- locate the owning layer
- identify the first known-good or expected behavior from docs/tests
- create or recommend focused regression coverage
- stop at evidence if the fix requires design approval

Must not:

- broaden the fix while investigating
- rewrite the area under investigation
- treat a symptom-only UI adjustment as a fix for a document/layout invariant

Output:

1. Reproduction
2. Expected behavior
3. Actual behavior
4. Owning layer
5. Evidence
6. Minimal regression test or next patch

### Test Planner

Use when a task needs verification planning, especially before layout, table,
editor lifecycle, API/export, or persistence changes.

Responsibilities:

- map the change to the risk matrix in `TEST_STRATEGY.md`
- choose focused tests before full-suite tests
- decide whether browser smoke is required
- identify missing fixture coverage
- explain what each test protects

Must not:

- require broad tests that do not match the risk
- claim behavior is verified by tests that do not exercise it
- replace browser/editor checks with core tests when the risk is interaction
  feel

Output:

1. Risk level
2. Focused tests
3. Full checks, if needed
4. Browser/manual checks, if needed
5. Known gaps

### Docs Steward

Use when a change affects contracts, operating rules, handoff docs, or active
project direction.

Responsibilities:

- update the smallest active document that owns the changed behavior
- keep `DOCS_INDEX.md` discoverable
- avoid duplicating contract text across many files
- record accepted limitations and deferred work
- keep archived docs historical unless the task explicitly asks otherwise

Must not:

- use docs to hide code/test mismatch
- update only the work log when an active contract changed
- turn an implementation preference into a product decision without approval

Output:

1. Docs changed
2. Contract or guidance changed
3. Evidence source
4. Verification
5. Remaining documentation gaps

## Domain Lanes

These lanes are not separate authority levels. They are ownership boundaries for
assigning focused work.

| Lane | Owns | Typical files | Primary risks |
|---|---|---|---|
| Core model | authored document schema, assertions, normalization, operations | `packages/core/src/schema/*`, `packages/core/src/document/*` | invalid documents, silent repair, broken operations |
| Binding and data | template/data separation, field registry, snapshots, readiness | `packages/core/src/binding/*`, `fieldRegistry/*`, `dataSnapshot/*`, `readiness/*` | mutating templates during fill, strictness drift, missing required data |
| Measurement | text measurement, word breaking, font measurement contracts | `packages/core/src/layout/measure.ts`, `font-measurer.ts`, `word-breaker.ts` | Thai line breaks, font drift, caret/segment mismatch |
| Pagination | page placement, splits, repeated headers, page numbers, TOC fragments | `packages/core/src/pagination/*` | page count drift, duplicate fragments, stale split metadata |
| Editor lifecycle | selection, inline edit, history, drag/resize, reconciliation | `src/app/editor/_components/*` | stale previews, lost focus, undo flooding, draft/history mismatch |
| API/export | request validation, authoritative pagination, PDF/DOCX output | `src/app/api/*`, `packages/core/src/renderer/*` | renderer reflow policy leaks, invalid output, hidden font fallback |
| Package/persistence | import/export JSON, localStorage, package contracts | `documentPersistence.ts`, `docs/FLOWDOC_PACKAGE_CONTRACT.md` | persisted runtime state, legacy import breakage |
| Tests/fixtures | focused regression coverage and smoke coverage | `*.test.ts`, `scripts/editor-smoke.mjs`, fixture docs | brittle tests, missing scenario coverage |
| Docs | active contracts, role docs, task handoff, work logs | `docs/*`, `docs/agent/*` | stale guidance, duplicate source of truth |

When a task crosses lanes, assign one lead lane and name the secondary lanes.
The lead lane owns the final shape of the patch; secondary lanes provide
constraints and verification.

## Multi-Agent Division Of Work

Use multiple agents only when the user or session explicitly calls for
multi-agent work and the task benefits from independent parallel work or clearly
separated ownership. A single lead agent should always own the final
integration.

Recommended split:

- Lead Agent: owns scope, sequencing, integration, and final answer.
- Explorer Agent: answers a narrow code/docs question with evidence. Default is
  read-only.
- Worker Agent: implements a bounded patch in an assigned file set.
- Reviewer Agent: reviews the integrated patch with the review gate.
- Test Planner or Test Runner: chooses or runs verification that does not
  overlap with implementation.

Rules:

- Give each worker a disjoint write set.
- Tell every worker that other agents may be editing the repo.
- Do not assign two agents to rewrite the same file unless there is an explicit
  integration plan.
- Do not delegate urgent blocking context if the lead needs that answer before
  the next step.
- Do not let an implementation worker also be the only reviewer of its own
  patch for risky behavior.
- Prefer read-only exploration for unclear ownership; prefer worker patches only
  after scope is known.

Handoff requirements for worker agents:

1. Assigned role
2. Goal
3. Files or lane owned
4. Out-of-scope files or behavior
5. Required docs/contracts
6. Required tests or checks
7. Expected final output

## Task Routing Matrix

| Task type | First role | Support roles | Required reading | Verification default |
|---|---|---|---|---|
| Docs-only operating guidance | Docs Steward | Blocker Reviewer | `AGENTS.md`, `DOCS_INDEX.md`, agent docs | `git diff --check` |
| Small UI copy/panel wiring | Minimal Patch Implementer | Test Planner | relevant editor component and `EDITOR_UX_CONTRACT.md` if interaction changes | type-check; focused app tests if logic changed |
| Inline edit or WYSIWYG behavior | Design Reviewer | Regression Hunter, Test Planner, Blocker Reviewer | `EDITOR_UX_CONTRACT.md`, `WYSIWYG_EDITOR_ROADMAP.md`, `BROWSER_SMOKE_CHECKLIST.md`, `TEST_STRATEGY.md` | type-check, focused app tests, editor smoke/browser check |
| Undo/redo or editor state race | Design Reviewer | Regression Hunter, Blocker Reviewer | `EDITOR_UX_CONTRACT.md`, `ARCHITECTURE_OVERVIEW.md`, `TEST_STRATEGY.md` | focused app tests, type-check, editor smoke |
| Core document operation | Design Reviewer for risky changes; otherwise Minimal Patch Implementer | Test Planner, Blocker Reviewer | `ENGINEERING_PRINCIPLES.md`, `LAYOUT_ENGINE_SPEC.md`, focused core files | focused core tests; full tests for meaningful risk |
| Layout or pagination behavior | Design Reviewer | Regression Hunter, Test Planner, Blocker Reviewer | `LAYOUT_ENGINE_SPEC.md`, `CROSS_PAGE_BEHAVIOR.md`, `TEST_STRATEGY.md` | focused pagination tests; full tests |
| Table authoring or pagination | Design Reviewer | Regression Hunter, Test Planner, Blocker Reviewer | `TABLE_EDITING_CONTRACT.md`, `CROSS_PAGE_BEHAVIOR.md`, `LAYOUT_ENGINE_SPEC.md` | table/core tests; browser check if editor UX changed |
| API/export/renderers | Design Reviewer for contract changes; otherwise Minimal Patch Implementer | Test Planner, Blocker Reviewer | `EXPORT_RENDERER_CONTRACT.md`, `LAYOUT_ENGINE_SPEC.md`, `TEST_STRATEGY.md` | renderer tests; API route smoke when boundary changed |
| Package, field, or data snapshot | Design Reviewer | Test Planner, Docs Steward, Blocker Reviewer | `FLOWDOC_PACKAGE_CONTRACT.md`, `FIELD_REGISTRY_CONTRACT.md`, `DATA_SNAPSHOT_CONTRACT.md` | focused persistence/binding tests; type-check |
| CI/test failure | Regression Hunter | Minimal Patch Implementer, Test Planner | failing test/log and owning contract | reproduce failure; focused fix; rerun failing test |

## Risk Gates

Require design before implementation when a change can affect:

- document schema or persisted package format
- `DocumentNode` validity
- pagination semantics or page-break policy
- table grid, row/column, rowspan/colspan, or split behavior
- undo/redo history
- inline edit commit/reset/focus lifecycle
- browser preview vs server pagination ownership
- export API contract or renderer responsibility
- field binding strictness, registry meaning, or data snapshot ownership

Require blocker review before accepting when a change touches:

- cross-page behavior
- WYSIWYG/inline editing
- stale pagination or reconciliation
- PDF/DOCX export behavior
- package import/export compatibility
- table structural operations
- broad refactors or multi-file behavior changes

## Standard Workflow

1. Intake
   - Restate the task.
   - Identify whether it is review, design, implementation, regression, test,
     or docs work.
   - Name scope and out-of-scope.

2. Evidence pass
   - Read the smallest relevant docs.
   - Inspect code/tests near the target.
   - Mark missing evidence as `UNKNOWN`.

3. Design gate
   - For risky work, produce a design before implementation.
   - Keep the design reversible and minimal.

4. Implementation
   - Change only the assigned files.
   - Preserve layer ownership.
   - Add tests only where risk justifies them.

5. Verification
   - Run the focused checks from `TEST_STRATEGY.md`.
   - Use full tests or browser smoke when the risk matrix calls for them.
   - Report any check that could not run.

6. Review gate
   - Use `PASS`, `FAIL / BLOCKER`, `RISK`, and `UNKNOWN`.
   - Cite evidence.
   - Define the minimal next patch if needed.

7. Handoff
   - Summarize files changed, behavior changed, tests run, risks left, and what
     was intentionally not changed.

## Output Contracts

Review output must use:

- `PASS`
- `FAIL / BLOCKER`
- `RISK`
- `UNKNOWN`
- `Minimal next patch`

Implementation output must include:

- files changed
- behavior changed
- tests run
- risks left
- what was intentionally not changed

Design output should include:

- current model
- root cause or uncertainty
- proposed design
- alternatives rejected
- risk map
- minimal patch plan
- test plan

Regression output should include:

- reproduction
- expected behavior
- actual behavior
- owning layer
- evidence
- minimal regression test or next patch

## Examples

### Inline Edit Bug

Lead Agent classifies as editor lifecycle risk. Design Reviewer reads
`EDITOR_UX_CONTRACT.md`, `WYSIWYG_EDITOR_ROADMAP.md`, and focused editor code.
Regression Hunter reproduces the stale edit or focus issue. Minimal Patch
Implementer changes the smallest editor helper/component set. Test Planner
selects focused app tests plus editor smoke. Blocker Reviewer checks undo/redo,
focus/remount, stale pagination, and document mutation boundaries.

### Table Pagination Bug

Lead Agent classifies as table plus pagination risk. Design Reviewer reads
`TABLE_EDITING_CONTRACT.md`, `CROSS_PAGE_BEHAVIOR.md`, and
`LAYOUT_ENGINE_SPEC.md`. Regression Hunter creates or locates a fixture.
Minimal Patch Implementer changes pagination/table logic only. Test Planner
selects focused table pagination tests and full tests if page-break behavior
changed. Blocker Reviewer checks duplicate content, header repetition, row split
metadata, and renderer-facing fragments.

### Export Header Or Route Bug

Lead Agent classifies as API/export boundary work. Minimal Patch Implementer may
patch route validation if the contract already defines behavior. Design
Reviewer is required if renderer responsibility or `PaginatedDocument` shape
changes. Test Planner selects API route smoke and renderer tests as needed.
Blocker Reviewer checks that renderers still consume `PaginatedDocument` rather
than recomputing layout.

### Docs-Only Role Update

Lead Agent classifies as Docs Steward work. Docs Steward reads `AGENTS.md`,
`DOCS_INDEX.md`, and existing agent docs. The patch updates only the owning
agent docs and discoverability links. Verification is `git diff --check`.
Runtime tests are intentionally not run because behavior did not change.

## Maintenance

Update this document when:

- a new durable agent role is introduced
- task routing changes
- a new active contract changes layer ownership
- review gates gain or lose project-specific failure modes
- multi-agent handoff rules change

Prefer updating this document over copying long role guidance into task-specific
contracts. Keep `CODEX_ROLES.md` as the concise quick reference and this file as
the detailed operating model.
