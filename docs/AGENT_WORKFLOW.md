# Agent Workflow

This document defines how a Codex-style coding agent should work in this
repository. It exists because the technical docs explain the engine, but they do
not fully explain the collaborator role: what to read first, what to update, how
to verify work, and when to write the work log.

## Role

The agent is a product-aware engineering collaborator, not only a code editor.

The agent should:

- preserve the product direction in `docs/PRODUCT_DIRECTION.md`
- follow the engineering boundaries in `docs/ENGINEERING_PRINCIPLES.md`
- choose verification using `docs/TEST_STRATEGY.md`
- keep implementation, tests, and docs synchronized
- protect the user's uncommitted work
- leave a useful trail for future sessions

The agent should not:

- treat the app as only a document generator when the product direction requires
  a workflow-ready editor
- make silent behavior changes without updating the relevant contract or
  checklist
- commit changes unless the user asks
- revert unrelated user changes
- leave meaningful work undocumented

## Start Of Session

Before changing code, orient from the repository rather than guessing.

Recommended read order:

1. `docs/DOCS_INDEX.md`
2. `docs/PRODUCT_DIRECTION.md`
3. `docs/ENGINEERING_PRINCIPLES.md`
4. `docs/ARCHITECTURE_OVERVIEW.md` when the task touches system flow
5. `docs/WORK_LOG.md` recent entries
6. `docs/TEST_STRATEGY.md` when the task touches behavior or verification
7. The relevant contract/checklist for the task:
   - layout: `docs/LAYOUT_ENGINE_SPEC.md`,
     `docs/LAYOUT_ENGINE_CHECKLIST.md`
   - cross-page behavior: `docs/CROSS_PAGE_BEHAVIOR.md`
   - editor UX: `docs/EDITOR_UX_CONTRACT.md`
   - table editing: `docs/TABLE_EDITING_CONTRACT.md`
   - text engine: `docs/TEXT_ENGINE_CHECKLIST.md`
   - product fixtures: `docs/PRODUCT_SCENARIOS.md`
   - browser checks: `docs/BROWSER_SMOKE_CHECKLIST.md`
   - export/renderers: `docs/EXPORT_RENDERER_CONTRACT.md`
   - fixture catalog: `docs/FIXTURE_CATALOG.md`
8. `git status --short`
9. The code and tests near the requested change

The agent does not need to read every doc for every small task, but it should
read enough to avoid contradicting the product direction or engine contracts.

## During Work

Use the smallest stable slice that genuinely advances the task.

Required habits:

- inspect existing patterns before editing
- prefer core operations and shared contracts over UI-only patches
- keep authored document data separate from measured/paginated output
- add focused tests for core, layout, pagination, table, or renderer changes
- use the browser for meaningful editor interaction checks
- update docs in the same change when behavior or expectations change
- keep the user informed when work becomes multi-step or risky

## Documentation Responsibilities

Update docs when the work changes the project's shared understanding.

- Update `docs/WORK_LOG.md` for meaningful implementation, debugging, or
  documentation sessions.
- Update checklists when status, test counts, or deferred work changes.
- Update specs/contracts when behavior rules change.
- Update `docs/PRODUCT_SCENARIOS.md` when product acceptance expectations or
  fixture coverage change.
- Update `docs/PRODUCT_DIRECTION.md` only when the product north star changes,
  not for routine implementation details.

If the work is tiny and purely mechanical, a work log entry may be skipped. If
the change affects behavior, layout, editor UX, export, tests, or docs, write the
work log.

## Verification Bar

Choose verification by risk. `docs/TEST_STRATEGY.md` is the detailed source of
truth; the quick guide is:

- Docs only:
  - review the rendered/linked docs mentally
  - run `git diff --check`
- Editor-only TypeScript change:
  - run `npm.cmd run type-check`
  - browser-check the affected interaction when practical
- Core document operation change:
  - run the focused core test file
  - run `npm.cmd test` when behavior risk is meaningful
- Pagination/layout/table change:
  - run the focused pagination tests
  - run `npm.cmd test`
  - update the relevant checklist/contract
- Export/renderer change:
  - run renderer tests or a focused export smoke test
  - document any accepted output limitation
  - use `docs/EXPORT_RENDERER_CONTRACT.md` for the expected contract

If a verification step cannot run, record why in the final response and, when
appropriate, in `docs/WORK_LOG.md`.

## Browser Checks

For editor UX changes, automated tests are not enough.
Use `docs/BROWSER_SMOKE_CHECKLIST.md` for focused check steps and evidence
expectations.

Browser checks should verify the human-facing behavior that motivated the work,
such as:

- selection targets the expected structure
- text does not disappear during editing
- undo/redo maps to the user's intent
- table controls change the expected table structure
- no layout error badge appears
- no obvious flicker, jump, or unwanted scroll is introduced

The browser check does not need to be exhaustive every time. It should cover the
main risk of the change.

## Work Log Entry Shape

Use the format already defined in `docs/WORK_LOG.md`:

- Date/time or date section
- Goal
- Completed work
- Files changed
- Verification performed
- Notes or follow-ups

Good work log entries are specific enough that a future session can understand
what changed without replaying the whole diff.

## Commit Policy

Do not commit by default.

Commit only when the user asks, or when the session has explicitly agreed to do
so. Before committing:

- check `git status --short`
- ensure unrelated user changes are not accidentally staged
- run the appropriate verification
- use a behavior-focused commit message

After committing, report the commit hash and the verification performed.

## End Of Task

Before the final response, the agent should know:

- what changed
- which files changed
- what was verified
- what was intentionally not done
- whether a commit was made
- what remains as the next useful step

The final response should be concise but concrete. It should not force the user
to inspect raw command output to understand the result.
