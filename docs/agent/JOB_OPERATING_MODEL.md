# Job Operating Model

This document defines how Codex should run a goal-oriented job when the user
hands over a broad problem, image, rough idea, or large outcome and asks Codex
to break down the work, iterate, and continue until the goal is reached.

Use this document when:

- the user delegates an outcome instead of a single patch
- the task starts from an image, vague bug, product goal, or broad problem
- Codex needs to discover the workflow before implementing
- the session may require multiple inspect, design, implement, verify, and
  replan loops
- the stop condition is goal completion, not merely answering a question

Do not use this document to override `AGENTS.md`, accepted product decisions,
active contracts, or code/test evidence. This model extends
`AGENT_OPERATING_MODEL.md`; it does not replace the existing review, design,
implementation, or verification roles.

## Job Contract

Before running a job, establish the smallest useful contract:

1. Goal
   - What outcome should exist when the job is done?
   - If the goal is visual, name the expected user-visible behavior.
   - If the goal is technical, name the owning layer and expected invariant.

2. Inputs
   - User prompt, image, file, error, reproduction, or observed problem.
   - Any explicit constraints from the user.
   - Any required docs from `DOCS_INDEX.md`.

3. Definition of done
   - The result is implemented, reviewed, and verified enough for the risk.
   - Remaining risks are named.
   - Any blocked or deferred work is explicit.

4. Autonomy limit
   - What Codex may decide without asking.
   - What requires owner approval.
   - What is intentionally out of scope.

If the contract is incomplete but the next step is low-risk exploration, Codex
may start with evidence gathering and mark missing decisions as `UNKNOWN`.

Use `JOB_INTAKE_TEMPLATE.md` when the job needs a durable plan, ledger, owner
checkpoint, or handoff across sessions.

## Delegated Job Execution

When the user delegates a broad goal or process, Codex should treat approval as
plan-level approval unless the user explicitly requests per-item approval.

Codex should not stop at `Minimal next patch` as the final answer while useful,
in-scope job items remain executable. In delegated job mode, a minimal next
patch is the next internal step in the loop, not the default stopping point for
the whole job.

Use `Next job item` for the next step Codex will execute autonomously inside an
active delegated plan. Reserve `Minimal next patch` for a blocked handoff,
review-only answer, required owner decision, or explicit user request for the
smallest next patch.

Codex may create the job plan and execute approved or low-risk job items without
asking the user to confirm each item, while continuing to report progress. Codex
must pause only at a stop condition, owner-decision gate, scope expansion, risk
gate, or missing input that cannot be recovered from code, docs, tests, or
reproduction.

The expected shape is:

1. Requirement or broad goal
2. Job plan
3. Job items
4. Execution loops for each item
5. Integration review
6. Final handoff or owner acceptance checkpoint

## Autonomy Rules

Codex may decide:

- the initial reading set from `DOCS_INDEX.md`
- the smallest useful workflow breakdown
- which existing role should own each step
- focused tests or checks that match the risk
- small reversible docs or code patches inside the named scope
- when to replan based on evidence

Codex must ask or stop when:

- the job needs a product decision not delegated by the user
- a proposed patch changes schema, persistence, export, pagination semantics,
  undo/redo semantics, or editor lifecycle contracts without accepted design
- the next step requires broad refactoring or cross-layer ownership changes
- the evidence contradicts the requested direction
- the cost or risk has grown beyond the original job contract

## Planning Gate

For broad delegated jobs, Codex must plan before implementation unless the next
step is read-only evidence gathering. The plan can be compact, but it must name:

- the job items
- dependencies or ordering constraints
- the expected verification for each item
- the definition of done for the whole job
- the known stop conditions or owner-decision gates

The plan is a working tool. It may be revised as evidence changes, but changes
that expand scope or cross a risk gate must be reported before execution.

## Request To Plan Traceability

For broad delegated work, Codex must keep the hierarchy visible:

```text
User request
  -> Plan
    -> Phase
      -> Job item
        -> Execution step
```

Definitions:

- `User request`: the original goal, problem, image, or requirement from the
  owner.
- `Plan`: Codex's breakdown of how to satisfy that request.
- `Phase`: an ordered section inside the plan. Use phases only when they make
  progress easier to track.
- `Job item`: the currently executable unit of work inside a phase.
- `Execution step`: the immediate inspect, edit, verify, or review action.

Codex must maintain a current-position pointer whenever the plan has phases or
multiple job items:

```text
Current position:
- Request:
- Plan:
- Phase:
- Job item:
- Status:
- Why this item is current:
- Next transition:
```

The current-position pointer should be updated when:

- a new request starts
- a plan is created or revised
- a phase becomes `done`, `blocked`, `deferred`, or `next`
- Codex moves from one job item to another
- verification changes the status of the current item

Do not report progress only as "I changed files" or "Phase 4 is next" when the
user needs to track a larger request. Always tie the work back to the request,
plan, phase, and job item.

## Phase Visibility

When Codex uses phases, milestones, tracks, waves, or any named multi-step plan,
the phase map must be visible to the user. Do not let phase names exist only in
Codex's internal context.

A phase map must name:

- parent goal
- current job lane or sub-goal
- each phase, in order
- phase goal
- scope
- done criteria
- status
- evidence
- why the current `Next job item` moved to the next phase

Use simple statuses:

- `pending`
- `in_progress`
- `done`
- `next`
- `blocked`
- `deferred`

When a phase status changes, update the phase map or summarize the changed
status in the handoff. If the next phase changes, add a short
`Why The Next Phase Changed` note so the owner can see the reasoning without
reconstructing it from code diffs.

Do not write "Phase 4 is next" without also showing what Phases 1-3 were, why
they are considered done, and what evidence supports that status.

## Job Ledger

During delegated work, Codex should track job item state:

- `pending`: identified but not started
- `in_progress`: currently being investigated or patched
- `done`: implemented and locally verified for its item scope
- `blocked`: cannot proceed without owner input or external state
- `accepted`: integrated into the final result or explicitly accepted by the
  owner

The ledger may be maintained in the conversation, a task plan, or a durable doc
when the job is long-running. Codex should not treat the whole job as done while
required job items remain `pending`, `in_progress`, or `blocked`.

## Job Loop

Run the job as an evidence-driven loop:

1. Intake
   - Restate the goal.
   - Classify the job type: design, implementation, regression, docs, review,
     visual/image intake, or mixed.
   - Name scope and out-of-scope.

2. Evidence pass
   - Read the smallest relevant docs.
   - Inspect code, tests, screenshots, images, logs, or fixtures near the
     problem.
   - Mark unsupported claims as `UNKNOWN`.

3. Breakdown
   - Split the job into reversible steps.
   - Assign each step to an existing role from `AGENT_OPERATING_MODEL.md`.
   - Identify the lead lane and secondary lanes.
   - Decide whether design is required before implementation.
   - Create or update the job ledger.

4. Plan
   - Choose the next job item or investigation step.
   - State the verification expected for that step.
   - Keep unrelated cleanup out of scope.
   - Treat this step as internal progress, not the final answer, while the job
     can continue safely.

5. Execute
   - Implement or investigate only the current step.
   - Preserve document model, pagination, undo/redo, export behavior, and edit
     lifecycle contracts.
   - Update docs only when an active contract or operating rule changes.

6. Verify
   - Run focused checks first.
   - Escalate to broader tests or browser smoke only when the risk requires it.
   - Record checks that could not run.

7. Review
   - Apply `REVIEW_GATE.md`.
   - Use `PASS`, `FAIL / BLOCKER`, `RISK`, and `UNKNOWN`.
   - Cite evidence for accepted behavior.

8. Replan or finish
   - If the goal is not done, choose the next smallest step.
   - Continue execution without per-item approval when the item is inside the
     delegated plan and no stop condition is hit.
   - Name that continuing step as `Next job item`, not `Minimal next patch`.
   - If blocked, name the blocker and the owner decision needed.
   - If done, produce the final handoff.

## Image Or Broad Problem Intake

When a job starts from an image, screenshot, visual report, or broad symptom:

- describe only observable evidence first
- identify likely owning layers as hypotheses, not facts
- map the observation to code/docs before changing behavior
- avoid visual-only fixes that weaken document state, pagination, undo/redo,
  export behavior, or edit lifecycle
- use browser or visual verification when the accepted goal is visual

If the image or symptom does not provide enough evidence to select a safe patch,
the first job step should be reproduction or focused exploration.

## Replan Triggers

Replan before continuing when:

- a failing check reveals a different owning layer
- the current patch would touch files outside the job scope
- a design assumption becomes unsupported by code or docs
- the job crosses a risk gate from `AGENT_OPERATING_MODEL.md`
- verification shows a regression or insufficient coverage
- user feedback changes the goal or acceptance criteria

Replanning should produce a smaller next action, not a broad rewrite.

## Stop Conditions

A job may finish as `PASS` when:

- the definition of done is met
- all required job items are `done` or intentionally deferred with rationale
- required verification has passed or unrun checks are explicitly justified
- risks left are named
- intentionally unchanged behavior is named

A job must stop as `FAIL / BLOCKER` when:

- the next required step needs owner approval
- evidence shows the requested direction would violate project contracts
- the job cannot proceed without missing input, credentials, files, or a
  reproducible scenario
- verification finds a blocker that cannot be safely fixed inside scope

A job may continue with `RISK` only when:

- the risk is known and bounded
- the next step is still reversible
- the risk does not violate a review gate

Codex must not finish only because one patch or one job item passed if the
delegated job plan still has executable required work.

## Output Contract

During a job, Codex should keep the user updated with:

- current step
- evidence found
- next action
- blockers or scope changes

Final job output must include:

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

## Relationship To Existing Agent Docs

- `AGENTS.md` remains the project working agreement.
- `DOCS_INDEX.md` remains the entry point for choosing reading sets.
- `CODEX_ROLES.md` remains the concise role reference.
- `AGENT_OPERATING_MODEL.md` remains the detailed role and ownership model.
- `REVIEW_GATE.md` remains the pass/fail standard.
- `TASK_HANDOFF.md` remains the handoff template for bounded sub-tasks.
- `JOB_INTAKE_TEMPLATE.md` remains the template for delegated job plans,
  ledgers, and owner checkpoints.

This document owns only the job-level loop: goal contract, autonomy boundaries,
iteration, replanning, stop conditions, and final handoff.
