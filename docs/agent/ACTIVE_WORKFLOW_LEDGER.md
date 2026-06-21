# Active Workflow Ledger

Use this ledger when Codex is executing a delegated, multi-step goal and the
owner needs to see exactly where the work is, what remains, and why Codex is
continuing.

This document is the active execution queue. It is not an architecture phase
ledger. Phases, milestones, and lanes may appear here, but they are only
tracking labels. The job items decide what Codex does next.

Use with:

- `JOB_OPERATING_MODEL.md` for the job-level loop and stop conditions.
- `JOB_INTAKE_TEMPLATE.md` for initial intake, owner checkpoints, or
  review-only setup.
- `REVIEW_GATE.md` when accepting or blocking work.

## When To Create One

Create or update an active workflow ledger when:

- the user delegates a broad goal and expects Codex to continue through
  multiple steps;
- the plan has multiple job items, lanes, phases, or decision gates;
- the owner asks "where are we?", "what remains?", or "what will you do
  next?";
- the job needs to survive context loss, a branch switch, or a later session.

Do not create one for a single bounded patch unless the user asks for a durable
plan.

## Ledger Contract

The ledger must answer these questions without reconstructing the whole chat:

1. What goal is this job trying to finish?
2. What counts as done?
3. What job item is active right now?
4. Why is that item current?
5. What evidence proves completed items are done?
6. What remains executable?
7. What requires owner approval before continuing?

## Template

Copy this section into the active plan document or task-specific doc.

```text
# Active Workflow Ledger: [job name]

Status: [in_progress | blocked | complete | accepted]

## Goal

- [the final outcome this delegated job must make true]

## Definition Of Done

- [acceptance condition]
- [acceptance condition]
- [verification condition]

## Scope

In scope:

- [files/systems/behavior Codex may inspect or change]

Out of scope:

- [decisions or systems Codex must not change]

## Current Position

- Request:
- Plan:
- Work lane:
- Phase or milestone: [optional tracking label]
- Job item:
- Status:
- Why this item is current:
- Next transition:

## Work Lanes

| Lane | Purpose | Status | Evidence |
|---|---|---|---|
| [lane name] | [why this lane exists] | pending | |

## Job Queue

| Job | Lane | Goal | Scope | Verification | Status | Evidence | Next action |
|---|---|---|---|---|---|---|---|
| J1 | [lane] | [job goal] | [files/systems] | [checks] | pending | | [what Codex does next] |

## Decision Gates

Codex must pause before:

- [owner decision gate]

## Evidence Ledger

| Evidence | Supports | Status |
|---|---|---|
| [file/test/doc] | [claim or completed job] | verified |

## Verification Ledger

| Check | Scope | Result | Notes |
|---|---|---|---|
| [command/manual check] | [what it protects] | not-run | [why] |

## Risks And Unknowns

| Item | Type | Impact | Required next evidence |
|---|---|---|---|
| [risk] | RISK | [impact] | [test/doc/code evidence] |

## Completion Handoff

- Files changed:
- Behavior changed:
- Tests run:
- Risks left:
- Intentionally not changed:
- Job items completed:
- Job items blocked:
- Job items deferred:
- Next job item:
- Minimal next patch: [only if blocked or handing off]
```

## Status Rules

Use these job statuses:

- `pending`: known but not started.
- `in_progress`: currently being investigated, designed, edited, or verified.
- `done`: implemented and verified for the job-item scope.
- `blocked`: cannot proceed without owner input, missing evidence, or external
  state.
- `deferred`: intentionally left out of this job with rationale.
- `accepted`: integrated into the completed job or explicitly accepted by the
  owner.

Use `Next job item` when Codex can keep executing inside the delegated plan.
Use `Minimal next patch` only when stopping, handing off, or waiting for an
owner decision.

## Phase And Lane Rules

`Work lane` describes the type of work, such as runtime truth, operation
commit, generation/API, editor integration, extraction, docs, or verification.

`Phase` or `milestone` describes a project checkpoint. It can help orientation,
but it must not become the execution driver.

Bad:

```text
Phase 11 is done. Next is Phase 12.
```

Good:

```text
J4 is done because the operation pilot returns validation and history-ready
metadata with focused tests. The next executable item is J5, a review gate that
decides whether visible runtime integration is allowed.
```

## Continuation Rule

When the job queue still has executable required items and no stop condition is
hit, Codex should continue to the next job item without asking for per-item
approval.

When a phase is complete but the job is not complete, update the current
position and continue.

When the next item would change product direction, schema, persistence,
pagination, undo/redo, export/API contracts, or visible editor runtime source
of truth without accepted design, stop at a decision gate.

## Review Rule

Before marking the whole ledger `complete`, run a final review:

- required job items are `done`, `accepted`, or intentionally `deferred`;
- blockers are either resolved or owned by a decision gate;
- verification matches the risk;
- remaining risks are named;
- the final handoff includes files changed, behavior changed, tests run,
  risks left, and intentionally unchanged behavior.
