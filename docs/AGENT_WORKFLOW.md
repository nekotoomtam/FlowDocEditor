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
2. `docs/AGENT_WORKFLOW.md`
3. `docs/PRODUCT_DIRECTION.md`
4. `docs/ENGINEERING_PRINCIPLES.md`
5. `docs/ARCHITECTURE_OVERVIEW.md` when the task touches system flow
6. `docs/WORK_LOG.md` recent entries
7. `docs/TEST_STRATEGY.md` when the task touches behavior or verification
8. The relevant contract/checklist for the task:
   - layout: `docs/LAYOUT_ENGINE_SPEC.md`,
     `docs/LAYOUT_ENGINE_CHECKLIST.md`
   - cross-page behavior: `docs/PAGE_FRAGMENTATION_MODEL.md`,
     `docs/CROSS_PAGE_BEHAVIOR.md`
   - editor UX: `docs/EDITOR_UX_CONTRACT.md`
   - table editing: `docs/TABLE_EDITING_CONTRACT.md`
   - text engine: `docs/TEXT_ENGINE_CHECKLIST.md`
   - product fixtures: `docs/PRODUCT_SCENARIOS.md`
   - browser checks: `docs/BROWSER_SMOKE_CHECKLIST.md`
   - export/renderers: `docs/EXPORT_RENDERER_CONTRACT.md`
   - fields/registry: `docs/FIELD_REGISTRY_CONTRACT.md`
   - field data snapshots: `docs/DATA_SNAPSHOT_CONTRACT.md`
   - future package shape: `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
   - fixture catalog: `docs/FIXTURE_CATALOG.md`
9. `git status --short`
10. The code and tests near the requested change

The agent does not need to read every doc for every small task, but it should
read enough to avoid contradicting the product direction or engine contracts.

## Agent Precheck Before Editing

Before editing, identify the task area and read only the matching docs/tests
needed for that area:

- document schema, normalize, or operations
- layout measurement
- pagination and page-boundary behavior
- renderer or export
- editor interaction
- table editing
- binding and fields
- font or Thai measurement
- documentation/test strategy

Never:

- store layout geometry or runtime editor state in `DocumentNode`
- make frontend/browser preview the source of layout truth
- change renderer behavior without checking pagination output
- add repeat binding behavior unless the task explicitly asks for it
- claim tests passed if dependencies, config, or the current workspace cannot
  run them
- update `docs/WORK_LOG.md` without deciding whether the change is meaningful
  enough to need a historical entry

## Repository Context

Run commands from the repository root unless a task explicitly targets a
workspace such as `packages/core`.

Command examples often use Windows PowerShell spelling:

- Windows PowerShell: `npm.cmd run type-check`, `npm.cmd test`
- Non-Windows shells: `npm run type-check`, `npm test`

If dependencies, config files, or workspace setup are unavailable, report that
verification could not run. Do not pretend a command passed.

The root `tsconfig.json` defines `@/*` path aliases that resolve to
`packages/core/src/*` and `src/*`. Do not rewrite aliased imports to long
relative imports unless the alias config is intentionally changed.

The authoritative runtime font location is `public/fonts/THSarabun.ttf`.
Server/API code loads it through `process.cwd()/public/fonts/...`; browser code
loads it through `/fonts/...`. Do not import or depend on
`src/fonts/THSarabun.ttf` unless the font loading contract is intentionally
changed.

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
- Update checklists when status or deferred work changes.
- Update coverage snapshots or fixture catalogs when suite size or coverage
  ownership meaningfully changes.
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
  - run type-check using the shell-appropriate npm command
  - browser-check the affected interaction when practical
- Core document operation change:
  - run the focused core test file
  - run the full test command when behavior risk is meaningful
- Pagination/layout/table change:
  - run the focused pagination tests
  - run the full test command
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
