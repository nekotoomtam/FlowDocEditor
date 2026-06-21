# Job Intake Template

Use this template when the user delegates a broad goal, image, problem, or
multi-step outcome and expects Codex to break down the work, execute job items,
verify, review, and continue until the process is complete.

This is a job-level intake. For bounded sub-task handoff, use
`TASK_HANDOFF.md`.

For a long-running delegated job, create or update
`ACTIVE_WORKFLOW_LEDGER.md` after intake. The active workflow ledger is the
execution queue; this file is the intake and checkpoint template.

## Job Title

[short name]

## Goal

What outcome should be true when the whole job is done?

- [describe the completed outcome]

## Input

What did the user provide?

- prompt:
- image/screenshot:
- files:
- reproduction:
- logs/errors:
- constraints:

## Delegation

Choose one:

- Delegated execution: Codex may create the plan and execute in-scope job items
  without per-item approval until a stop condition is hit.
- Plan-first checkpoint: Codex should create the job plan, then wait for owner
  approval before execution.
- Review-only: Codex should inspect and report, without editing.

Default for broad goals: delegated execution, unless the user requests a
checkpoint or the work crosses a risk gate.

In delegated execution, `Next job item` means Codex continues automatically.
`Minimal next patch` is used only for blocked handoff, review-only output, or a
required owner decision.

## Scope

Files, systems, behavior, or docs Codex may inspect or change:

- [allowed scope]

## Out Of Scope

Files, systems, behavior, or decisions Codex must not change:

- [out-of-scope boundary]

## Definition Of Done

The job is done when:

- [acceptance condition]

## Job Plan

This table is enough for short delegated jobs. For long-running work, move the
queue into `ACTIVE_WORKFLOW_LEDGER.md` so the current job item, evidence, and
next transition stay visible across sessions.

Request to plan trace:

```text
User request
  -> Plan
    -> Phase
      -> Job item
        -> Execution step
```

Current position:

- Request:
- Plan:
- Phase: [optional tracking label, not the stop condition]
- Job item:
- Status:
- Why this item is current:
- Next transition:

| Item | Status | Owner role | Purpose | Verification | Notes |
|---|---|---|---|---|---|
| 1 | pending | Lead Agent | Establish evidence and scope | Docs/code evidence cited | |

Allowed statuses:

- `pending`
- `in_progress`
- `done`
- `blocked`
- `accepted`

## Phase Map

Use this section whenever the job uses phases, milestones, tracks, waves, or
any named multi-step plan.

Phases are tracking labels. They do not replace the job item ledger and they do
not cause Codex to stop by themselves.

Parent goal:

- [what the whole job is trying to make true]

Current job lane:

- [which slice of the parent goal this plan is executing]

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 1 | [phase goal] | [files/systems/behavior] | [how this phase is done] | pending | [tests/docs/code refs] |

Allowed phase statuses:

- `pending`
- `in_progress`
- `done`
- `next`
- `blocked`
- `deferred`

## Why The Next Phase Changed

Use this section whenever a phase becomes done, blocked, deferred, or when the
next job item moves to a later phase.

- Previous next phase:
- New next phase:
- Reason:
- Evidence:
- Work still open:
- Next job item that Codex will execute or the stop condition that prevents
  continuing:

## Stop Conditions

Codex must pause when:

- owner product decision is required
- scope needs to expand beyond the plan
- schema, persistence, export, pagination, undo/redo, or editor lifecycle
  contracts would change without accepted design
- evidence contradicts the requested direction
- required input, files, credentials, or reproduction are missing
- verification finds a blocker that cannot be safely fixed inside scope

## Verification Plan

Focused checks first:

- [focused check]

Broader checks if risk requires:

- [broader check]

Browser/manual checks if visual or interaction behavior is in scope:

- [browser or manual check]

## Final Output

Return:

1. `PASS`, `FAIL / BLOCKER`, `RISK`, or `UNKNOWN`
2. files changed
3. behavior changed
4. tests run
5. risks left
6. what was intentionally not changed
7. job items completed, blocked, or intentionally deferred
8. next job item, only when Codex is continuing autonomously inside the same
   delegated run
9. minimal next patch, only when the job is incomplete and cannot safely
   continue in the current run
