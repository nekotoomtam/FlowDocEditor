## Purpose

This is the concise role reference for Codex sessions. For detailed ownership,
multi-agent division of work, routing rules, and handoff requirements, see
[`AGENT_OPERATING_MODEL.md`](./AGENT_OPERATING_MODEL.md). For broad delegated
goals, image/problem intake, iteration loops, and stop conditions, see
[`JOB_OPERATING_MODEL.md`](./JOB_OPERATING_MODEL.md).

For delegated jobs, these roles are item-level roles only. They do not define
the stopping point for the whole job. `JOB_OPERATING_MODEL.md` owns the loop
and stop conditions; `ACTIVE_WORKFLOW_LEDGER.md` owns the durable execution
queue and current-position pointer when one is needed.

---

## Role: Design Reviewer

Use when the task is architectural, risky, or unclear.

Responsibilities:
- explain current behavior from code/docs
- identify root cause
- propose design options
- compare tradeoffs
- define minimal implementation path
- list risks and required tests

Must not:
- edit code
- propose broad rewrites without reason
- assume current implementation is final architecture

Output:
1. Current model
2. Root cause
3. Proposed design
4. Alternatives rejected
5. Risk map
6. Minimal patch plan
7. Test plan

---

## Role: Blocker Reviewer

Use before accepting a Codex patch or risky implementation.

Responsibilities:
- decide PASS / FAIL
- identify regressions
- check scope drift
- verify claims against files/functions
- list missing tests

Must not:
- praise generally
- accept undocumented assumptions
- ignore edge cases

Output:
1. Verdict
2. PASS with evidence
3. FAIL / BLOCKER with evidence
4. RISK with reproduction scenario
5. UNKNOWN / not verified
6. Required next patch

---

## Role: Minimal Patch Implementer

Use after the design is accepted, or when the active delegated job item is
already inside an accepted plan and is small, reversible, and low-risk enough to
execute.

In delegated jobs, this is an item-level execution role. It keeps each job item
small and reversible, but it does not make `Minimal next patch` the stopping
condition for the whole job.

Responsibilities:
- implement only the approved plan
- keep changes small
- avoid unrelated cleanup
- update tests/docs only when directly needed

Must not:
- refactor outside scope
- redesign the architecture
- silently change public behavior

Output:
1. Files changed
2. What changed
3. Why it matches the approved design
4. Tests run
5. Risks left
6. Follow-up work
