# Work Log

This document tracks completed work on FlowDocEditor so future sessions can quickly see what changed, what was verified, and what remains open.

For the expected collaborator/session workflow, including when to update this
file, see `docs/AGENT_WORKFLOW.md`.

## Log Format

Each entry should include:

- Date/time
- Goal
- Summary of completed work
- Files changed
- Verification performed
- Notes or follow-ups

---

## 2026-05-13

### Clean Stage 4A Verification Baseline

Goal: Start the next WYSIWYG text-engine stage by removing verification noise
before adding selection, clipboard, or IME behavior, while keeping the Stage 3
stress fixture in the baseline.

Completed:

- Changed the real-font drift test to load Playwright's Chromium runtime
  optionally, so `npm.cmd run type-check` no longer fails when local
  `node_modules/playwright` is unavailable.
- Kept the real-font drift coverage intact for environments that do have the
  runtime: the test still launches Chromium and compares canvas measurement
  with fontkit when `public/fonts/THSarabun.ttf` and Playwright are available.
- Re-ran the Stage 3 heavy/stress baseline alongside the real-font drift test.
- Restored the declared Playwright package into local `node_modules` with
  `npm.cmd install`, then ran the automated editor smoke successfully.

Files changed:

- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd run test -w packages/core -- src/layout/__tests__/measure.test.ts src/pagination/__tests__/paginator.test.ts src/pagination/__tests__/tablePagination.test.ts src/pagination/__tests__/rowStack.test.ts`
- `npm.cmd test`
- `git diff --check`
- `npm.cmd run smoke:editor`

Notes:

- Before restoring dependencies, `npm.cmd run smoke:editor` failed because
  `node_modules/playwright` was missing. After `npm.cmd install`, Playwright
  resolved as `1.59.1`, the real-font drift test ran and passed locally, and
  the isolated editor smoke passed.
- A smoke run against the already-running `localhost:4000` text-engine dev
  server failed because that server intentionally did not match the smoke
  script's legacy-inline-edit expectations. The successful run let the smoke
  script start its own isolated server.
- This is a verification-baseline patch only. It intentionally does not change
  editor runtime behavior, document schema, pagination semantics, export,
  selection, clipboard, or IME behavior.

---

## 2026-05-12

### Add WYSIWYG Text Engine Draft Pagination

Goal: Continue Stage 3 of the FlowDoc-owned WYSIWYG text engine by letting
page-boundary paragraph drafts render from draft paginated geometry without
making textarea layout authoritative or committing document text on each
keypress.

Completed:

- Added a normalized draft preview document helper for active WYSIWYG text
  drafts.
- Added hard-page-boundary draft pagination scheduling with generation guards,
  draft-version checks, caret page tracking, and optimistic paginated preview
  updates.
- Added a deterministic Stage 3 stress scenario, available in dev/test mode via
  `/editor?flowdocTestScenario=wysiwyg-stage3-boundary`, that seeds a target
  paragraph near a page boundary with dense downstream content.
- Disabled autosave while a dev/test scenario is active so stress runs do not
  persist over the user's normal editor localStorage document.
- Let eligible continuation paragraph fragments render through the
  WYSIWYG text layer when draft pagination is active.
- Kept same-page hard-local edits on the local height patch path, and kept
  table-cell paragraphs on the guarded fallback path.
- Added a hidden `contentEditable` non-textarea input bridge inside the SVG
  text-engine layer, with native keyboard/input listeners, so browser keyboard
  events reach the FlowDoc text draft handler while SVG lines remain the
  visual/layout truth.
- Extended the inline-edit blur guard so remounting from a textarea to the
  text-engine SVG textbox, or between text-engine fragments, does not finalize
  the edit when focus lands on a replacement surface for the same paragraph.
- Updated the active WYSIWYG text engine plan to reflect that
  hard-page-boundary edits now queue debounced draft pagination instead of
  remaining detect-only.

Files changed:

- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/inlineEditBlur.ts`
- `src/app/editor/_components/useInlineEditSession.ts`
- `src/app/editor/_components/wysiwygDraftPreview.ts`
- `src/app/editor/_components/wysiwygStage3StressScenarios.ts`
- `src/app/editor/_components/__tests__/inlineEditBlur.test.ts`
- `src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/inlineEditHeightPreview.test.ts src/app/editor/_components/__tests__/wysiwygDraftPreview.test.ts src/app/editor/_components/__tests__/wysiwygReflow.test.ts src/app/editor/_components/__tests__/wysiwygTextEligibility.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/wysiwygPerformance.test.ts src/app/editor/_components/__tests__/useWysiwygTextSession.test.ts src/app/editor/_components/__tests__/wysiwygTextCommit.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/layoutReconciliation.test.ts src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts`
- `npm.cmd run test -w packages/core -- src/layout/__tests__/measure.test.ts src/pagination/__tests__/paginator.test.ts src/pagination/__tests__/tablePagination.test.ts src/pagination/__tests__/rowStack.test.ts`
- `git diff --check`
- Browser smoke on `http://localhost:4000/editor` with
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`,
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE=1`, and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE=1` confirmed the editor loaded,
  flags were true, no layout error badge appeared, clicking a body paragraph
  opened the text-engine layer, no inline textarea was mounted, and the hidden
  input bridge was present.
- 2026-05-13 browser keypress recheck on the same flagged server confirmed
  short text entry through the bridge (`ZX9`) updated the SVG text-engine layer,
  no inline textarea was mounted, and no layout error appeared. A longer
  keypress sequence wrapped the active paragraph from 3 to 5 SVG text lines,
  kept the bridge active, and still showed no layout error.
- 2026-05-13 Stage 3 stress browser smoke on
  `/editor?flowdocTestScenario=wysiwyg-stage3-boundary` confirmed the target
  paragraph started as one fragment, real bridge keypresses moved it to two
  fragments across the page boundary, Backspace shrank it back to one fragment,
  no inline textarea mounted, no layout error appeared, and commit/Undo/Redo
  restored the typed marker.

Notes:

- `npm.cmd run type-check` is still blocked by the pre-existing
  `realFontDrift.test.ts` missing `playwright` package and implicit-any errors.
  No new type-check error remains from this patch.
- `npm.cmd run smoke:editor` is blocked by the same missing `playwright`
  package. Browser automation also exposed local tooling limits:
  `localhost:4011` was blocked, Chrome extension navigation to localhost was
  blocked, some in-app browser tabs timed out at the CDP layer after reload,
  and `locator.type()` / `locator.fill()` require a virtual clipboard that was
  unavailable in this session. Real browser `press()` key events did work
  against the non-textarea bridge. The successful browser portion used an
  outside-sandbox dev server on `localhost:4000`.
- This intentionally does not change `DocumentNode` schema, server/API
  pagination ownership, export behavior, undo transaction policy, IME/clipboard
  hardening, or table-cell WYSIWYG editing.

---

### Add Slice-Aware WYSIWYG Selection Foundation

Goal: Address the reported WYSIWYG blockers without changing document schema,
paginator/export ownership, or making textarea layout authoritative.

Completed:

- Made inline edit textarea values slice-aware for both first and continuation
  fragments. When a paragraph spans pages, the active textarea now holds only
  the active fragment text slice and reconstructs the full paragraph with stable
  prefix/suffix context.
- Stabilized slice context across active textarea renders so browser pagination
  updates cannot duplicate or garble text during a typing burst.
- Marked edit start as visually fresh for the current draft snapshot, allowing
  document-visual mode on entry when geometry is available.
- Started the active typing visual lock from key interaction before native
  textarea input lands, and lengthened the lock for human-speed typing so the
  editor does not switch to transparent SVG visuals between ordinary
  keystrokes.
- Deferred active textarea page relocation while the typing visual lock is held
  or the document visual is stale, avoiding remounts while keystrokes are still
  being delivered.
- Added same-fragment drag selection support by mapping pointer positions to
  WYSIWYG paragraph offsets and drawing SVG selection overlays from existing
  paginated line geometry.
- Added editor fragment debug data attributes for smoke assertions without
  changing authored document data.
- Extended automated editor smoke coverage for stack paragraph visual parity,
  table-cell visual contract, drag selection overlay, slice-bounded
  continuation textareas, visible marker uniqueness, undo/redo, and continuation
  boundary Backspace.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/useInlineEditSession.ts`
- `src/app/editor/_components/wysiwygTextInteraction.ts`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `scripts/editor-smoke.mjs`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/inlineEditCaret.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts`
- `npm.cmd run type-check`
- `SMOKE_BASE_URL=http://localhost:4000/editor npm.cmd run smoke:editor`
- `npm.cmd test`
- Human-speed Playwright probe on `http://localhost:4000/editor`: typed enough
  text at 130ms per character to wrap to three visible lines; textarea value
  stayed correct and visible during typing, then handed off to document visual
  after the idle window.

Notes:

- This intentionally does not change `DocumentNode`, core pagination policy,
  export behavior, server pagination, clipboard/cut handling, IME hardening, or
  cross-fragment selection. Cross-fragment selection remains deferred.
- The isolated smoke server could not start because another Next dev server was
  already running for this worktree. The same smoke suite was run successfully
  against the existing `http://localhost:4000/editor` server.

---

### Stabilize Inline Edit Input Bridge

Goal: Make the current hybrid inline editor more predictable during typing
while keeping textarea fallback available and avoiding document/schema/layout
rewrite scope.

Completed:

- Routed inline textarea key decisions and full-text/caret snapshots through
  `wysiwygTextInteraction` so paragraph editing has one shared input bridge
  policy.
- Aligned plain Enter classification with the current editor contract: native
  multiline textarea behavior remains the default, and structural paragraph
  split is available only as an explicit future mode.
- Added a short document-visual typing lock to `useInlineEditSession` so fresh
  browser pagination does not immediately reclaim the visible layer during an
  active typing burst.
- Kept the existing stale-visual fallback path: textarea text remains visible
  when paginated visual output is not ready for the active draft.
- Added focused tests for Enter policy, textarea snapshot conversion, and visual
  readiness while the typing lock is active.

Files changed:

- `src/app/editor/_components/wysiwygTextInteraction.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/useInlineEditSession.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `src/app/editor/_components/__tests__/useInlineEditSession.test.ts`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/inlineEditBlur.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `npm.cmd test`

Notes:

- This intentionally does not enable WYSIWYG by default, change
  `DocumentNode`, replace textarea with hidden-input editing, add selection
  overlays, change pagination/export behavior, or claim full IME/clipboard
  hardening.
- Manual in-app browser probing confirmed the default textarea fallback path can
  enter inline edit, show typed text, exit without a layout error, and clean up
  the active textarea. A manual WYSIWYG-flag browser perception pass was not
  completed; the automated editor smoke script remains the WYSIWYG-flag browser
  coverage for this patch.
- Post-test status: user manual testing found this round is not acceptable as a
  stable WYSIWYG result. Reported blockers are paragraph edit layout drift in
  non-body containers, odd cross-page continuation behavior when typing across a
  page boundary, and unavailable drag text selection. Treat this as
  FAIL/BLOCKER and move to the staged real-WYSIWYG plan rather than continuing
  to polish the hybrid textarea layout as the final path.

---

### Add Agent Operating Model

Goal: Create a detailed role and responsibility model for Codex and other
project agents without changing runtime behavior.

Completed:

- Added `docs/agent/AGENT_OPERATING_MODEL.md` as the detailed operating model
  for lead, reviewer, implementer, regression, test, docs, and multi-agent
  work division.
- Linked the new operating model from `docs/agent/CODEX_ROLES.md` so the
  existing concise role list remains the quick reference.
- Updated `docs/DOCS_INDEX.md` so future sessions can find the detailed agent
  ownership and routing guidance.

Files changed:

- `docs/agent/AGENT_OPERATING_MODEL.md`
- `docs/agent/CODEX_ROLES.md`
- `docs/DOCS_INDEX.md`
- `docs/WORK_LOG.md`
- `docs/WORK_LOG_RECENT.md`

Verification:

- `git diff --check`

Notes:

- This is documentation-only. It intentionally does not change runtime code,
  editor behavior, layout behavior, tests, or product decision authority.

---

## 2026-05-11

### Adopt Document-First FlowDocPackage V1

Goal: Apply the product decision to choose the package/envelope direction while
keeping this implementation focused on the document foundation only.

Completed:

- Added document-first `FlowDocPackage v1` support in editor persistence.
- Kept core editing/layout/export APIs working with `DocumentNode`; the package
  is the persisted/import/export JSON shape, not the layout engine input.
- Changed localStorage save to store a package with `packageVersion: 1`,
  `kind: "document"`, package metadata, and the underlying `DocumentNode`.
- Changed JSON export to emit a package and download as `*.flowdoc.json`.
- Kept legacy raw `DocumentNode v1` import/load support so existing saved JSON
  and smoke fixtures still work.
- Updated the automated editor smoke script so its localStorage assertions can
  read either legacy raw documents or `FlowDocPackage v1` after autosave.
- Added package parser tests for package JSON, legacy raw document JSON,
  unsupported document/package versions, invalid package shape, invalid
  document structure, localStorage behavior, and JSON package serialization.
- Updated architecture, fixture catalog, and test strategy docs to document the
  new document-first package boundary.
- Follow-up Phase 1 package contract work added
  `docs/FLOWDOC_PACKAGE_CONTRACT.md`, linked it from the docs index,
  architecture, engineering principles, and test strategy, and enforced
  `package.id === package.document.document.id` in the package parser.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `scripts/editor-smoke.mjs`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DOCS_INDEX.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`
- Phase 1 focused recheck:
  `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`

Notes:

- This intentionally does not add field registry, data versions, key-based
  history, reviewer workflow, or binding-data persistence yet. Those remain
  higher layers that can be built on top of the package foundation.

### Harden Package Import/Export UX

Goal: Continue the package foundation by making JSON import/export safer and
more understandable without adding form/history layers.

Completed:

- Added concise user-facing import success/failure messages for package and
  legacy raw document JSON.
- Added distinct failure messages for invalid JSON, unsupported document
  versions, unsupported package versions, invalid packages, and invalid
  documents.
- Sanitized document titles before using them as `.flowdoc.json` filenames.
- Updated JSON export to show a short toolbar status after preparing a package
  download.
- Updated JSON import to show a short toolbar status for package imports,
  legacy imports, file-read failure, and parse/validation failure.
- Updated the hidden file input to accept `.flowdoc.json`, `.json`, and
  `application/json`.
- Added focused persistence tests for safe filenames and status message mapping.
- Updated package contract, fixture catalog, test strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is still document-first package UX only. It does not add field registry,
  data versions, key history, reviewer workflow, or template library behavior.

### Add Package Migration Entrypoint

Goal: Continue Phase 3 by routing persisted/editor JSON through one migration
entrypoint before editor state receives a document.

Completed:

- Added `migratePersistedDocumentPackage(...)`.
- Made `parsePersistedDocument(...)` use the migration entrypoint.
- Legacy raw `DocumentNode v1` JSON now migrates into a canonical
  `FlowDocPackage v1`.
- Existing `FlowDocPackage v1` migration is idempotent.
- Kept migration document-first only; no form/history/reviewer data was added.
- Added focused tests for raw document migration and package v1 idempotence.
- Updated the package contract migration section.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This establishes the migration seam needed for future package versions while
  keeping current runtime behavior compatible with raw document imports.

### Harden Table Structural Operations

Goal: Continue Phase 4 by moving table authoring guarantees closer to the core
operations that mutate table rows and columns.

Completed:

- Added operation-level fixtures for inserting a row above the first row,
  deleting a row subtree, preserving last-row safety, inserting a column to the
  left of the first column, deleting a column subtree, preserving table width,
  and preserving last-column safety.
- Fixed row deletion so `headerRowCount` is clamped to the remaining row count
  instead of leaving the table in an invalid authored state.
- Kept the change at the document/table model layer. No span-aware authoring UI,
  column resize UI, or higher-level package/history behavior was added.
- Updated the table editing contract, fixture catalog, and test strategy.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run test -w packages/core -- src/pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Extend Table Property Panel Browser Smoke

Goal: Continue Phase 5 by checking that the table-cell property panel can drive
row and column operations in the real editor route, not only at the core
operation layer.

Completed:

- Extended `scripts/editor-smoke.mjs` with localStorage table-shape helpers so
  the smoke verifies authored row/column counts after browser interactions.
- Added smoke coverage for selecting a table cell, inserting a column to the
  right, selecting the inserted cell through its paragraph, deleting that
  inserted column, inserting a row below, selecting the inserted row cell, and
  deleting that inserted row.
- Kept the smoke tied to `FlowDocPackage v1` or legacy raw document storage so
  autosave format changes do not make the browser check brittle.
- Updated browser smoke, fixture catalog, and test strategy docs to reflect the
  new row/column property-panel coverage.

Files changed:

- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- This remains focused browser coverage. It does not replace future visual
  regression tests, broad editor workflow automation, or manual checks for
  perceived flicker and scroll feel.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FieldRef Operation Fixtures

Goal: Continue Phase 6 by protecting the document-level key/field foundation
without starting the future form, history, or reviewer layers.

Completed:

- Added operation fixtures for inserting a `fieldRef` inline into a normal body
  paragraph.
- Added operation fixtures for inserting a `fieldRef` inline into a paragraph
  scoped inside a table cell.
- Verified that insertion preserves existing text runs instead of flattening the
  paragraph into plain text.
- Updated fixture catalog and test strategy counts.

Files changed:

- `packages/core/src/document/operations.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This intentionally stops at authored `DocumentNode` behavior. It does not add
  field registries, data snapshots, key-based history, or reviewer workflows.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FieldRef Package Roundtrip Fixture

Goal: Continue Phase 7 by making sure the document-first package boundary keeps
structured inline keys intact.

Completed:

- Added a persistence fixture that serializes a document containing an inline
  `fieldRef` to `FlowDocPackage v1`, then parses it back through the normal
  import path.
- Verified the `fieldRef` id, key, label, fallback, and surrounding text run are
  preserved.
- Updated the package contract, fixture catalog, and test strategy counts.

Files changed:

- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This still stops at package/document preservation. It does not add a field
  registry, binding data payload, key history, or reviewer workflow.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Field Registry Contract And Validation Fixtures

Goal: Start Phase A of the document/key foundation by giving `fieldRef.key` a
clear registry contract without making current binding strict or changing
`DocumentNode`.

Completed:

- Added `docs/FIELD_REGISTRY_CONTRACT.md` defining field keys, registry v1
  shape, scalar inline field rules, validation policy, ownership boundaries,
  and future package direction.
- Added `packages/core/src/fieldRegistry/index.ts` with
  `FieldRegistryV1`, `FieldDefinitionV1`, `collectDocumentFieldRefs(...)`,
  `validateFieldRegistryReferences(...)`, and
  `hasFieldRegistryErrors(...)`.
- Added focused registry fixtures for body paragraph refs, table-cell refs,
  registered scalar refs, duplicate keys, missing definitions, and invalid
  inline targets for `image`/`collection`.
- Aligned the sample editor field palette definition type with the core field
  registry shape while keeping palette drag data compatible.
- Updated docs index, architecture, engineering principles, package contract,
  agent workflow, fixture catalog, and test strategy.

Files changed:

- `packages/core/src/fieldRegistry/index.ts`
- `packages/core/src/fieldRegistry/index.test.ts`
- `src/app/_lib/fieldRegistry.ts`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/fieldRegistry/index.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- Binding remains descriptive and non-strict for now. Missing registry
  definitions are warnings in the new validation helper, not binding failures.
- `FlowDocPackage v1` still does not persist the registry; that remains a future
  package migration decision.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FlowDoc Package V2 Proposal

Goal: Continue Phase B by defining the next package direction before changing
runtime storage, import/export behavior, or localStorage format.

Completed:

- Added `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`.
- Proposed `FlowDocPackageV2` with required package-level `fields:
  FieldRegistryV1`.
- Reserved optional/deferred package locations for `data`, `history`, and
  migration records without making them active behavior.
- Defined v2 goals, non-goals, identity rules, ownership boundaries, validation
  levels, migration direction, import/export policy, test expectations, and
  open decisions.
- Linked the proposal from docs index, package contract, field registry
  contract, architecture overview, test strategy, and agent workflow.

Files changed:

- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`

Notes:

- This is proposal-only work. It intentionally does not implement package v2
  parsing, migration, localStorage changes, or JSON export changes.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add FlowDoc Package V2 Parser Compatibility

Goal: Continue Phase C by proving the v2 package proposal in the persistence
boundary while keeping default save/export behavior on package v1.

Completed:

- Added `FlowDocPackageV2` and `FlowDocPackage` union types to editor
  persistence.
- Added package v2 parser support with required `fields: FieldRegistryV1`.
- Kept `CURRENT_PACKAGE_VERSION` and `serializeDocumentPackage(...)` on v1 so
  localStorage saves and JSON export behavior do not change yet.
- Added registry validation during v2 parsing: duplicate keys and inline
  `collection`/`image` field targets reject the package, while missing field
  definitions are surfaced as warnings.
- Added focused persistence tests for v2 parse success, missing-definition
  warnings, duplicate registry rejection, collection-target rejection, and
  default export remaining v1.
- Updated package/proposal/test/fixture docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This does not migrate localStorage, switch JSON export to v2, or add data/key
  history storage.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Data Snapshot Contract And Validation Fixtures

Goal: Continue Phase D by defining field values outside `DocumentNode` before
wiring data into binding, packages, or key history.

Completed:

- Added `docs/DATA_SNAPSHOT_CONTRACT.md`.
- Added `packages/core/src/dataSnapshot/index.ts` with
  `DataSnapshotV1`, scalar value types, `validateDataSnapshot(...)`, and
  `hasDataSnapshotErrors(...)`.
- Added focused data snapshot fixtures for valid scalar values, required-field
  readiness warnings, unknown-key warnings, invalid value type errors, invalid
  enum value errors, and unsupported `image`/`collection` snapshot values.
- Linked the data snapshot contract from docs index, agent workflow,
  architecture, field registry contract, package v2 proposal, fixture catalog,
  and test strategy.

Files changed:

- `packages/core/src/dataSnapshot/index.ts`
- `packages/core/src/dataSnapshot/index.test.ts`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/dataSnapshot/index.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This does not persist data snapshots in package JSON and does not wire
  snapshots into binding yet.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Snapshot Binding Preview Foundation

Goal: Continue Phase E by wiring scalar data snapshots into temporary binding
preview without changing package persistence or mutating template documents.

Completed:

- Added `bindDocumentWithSnapshot(...)` to the core binding layer.
- Kept the existing nested `FieldData` binding entrypoint intact for
  compatibility.
- Bound flat `DataSnapshotV1.values` keys such as `customer.name` directly to
  matching inline `fieldRef.key` values.
- Returned data snapshot validation issues alongside the resolved document so
  callers can decide how to handle warnings/errors.
- Made invalid snapshot values fall back instead of rendering invalid data into
  preview/export output.
- Allowed missing values to use inline `fieldRef.fallback`, registry fallback,
  or empty text.
- Updated Fill mode to store values as `DataSnapshotV1` and preview through the
  snapshot binding helper.
- Updated architecture, field registry, package v2 proposal, data snapshot,
  fixture catalog, and test strategy docs.

Files changed:

- `packages/core/src/binding/index.ts`
- `packages/core/src/binding/index.test.ts`
- `src/app/_lib/fieldRegistry.ts`
- `src/app/editor/_components/FillingPanel.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/binding/index.test.ts src/dataSnapshot/index.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This still does not persist data snapshots in package JSON, switch
  localStorage/export to package v2, or implement key history.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Document Data Readiness Feedback

Goal: Continue Phase F by surfacing registry/snapshot readiness without making
readiness warnings block opening, editing, or preview.

Completed:

- Added `packages/core/src/readiness/index.ts` with
  `assessDocumentDataReadiness(...)`.
- Combined field registry reference issues and data snapshot validation issues
  into one readiness report.
- Scoped required snapshot checks to fields actually used by the current
  document so unused required registry fields do not warn in Fill mode.
- Added readiness fixtures for valid data, missing registry definitions,
  missing used required values, unused required fields, and invalid snapshot
  values.
- Updated Fill mode to show compact non-blocking readiness errors/warnings in
  the filling panel.
- Extended the automated editor smoke with a Fill mode readiness warning/clear
  check on an isolated fieldRef document.
- Updated architecture, field registry, package v2 proposal, data snapshot,
  browser smoke, fixture catalog, and test strategy docs.

Files changed:

- `packages/core/src/readiness/index.ts`
- `packages/core/src/readiness/index.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/FillingPanel.tsx`
- `scripts/editor-smoke.mjs`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DATA_SNAPSHOT_CONTRACT.md`
- `docs/FIELD_REGISTRY_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/readiness/index.test.ts src/binding/index.test.ts src/dataSnapshot/index.test.ts src/fieldRegistry/index.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- Readiness remains informational in the editor. This does not decide publish,
  export, package migration, or review-workflow blocking policy.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Surface Package V2 Registry Import Warnings

Goal: Continue Phase G by making package v2 registry readiness visible during
JSON import without changing the active save/export package format.

Completed:

- Extended `documentImportSuccessMessage(...)` to include registry warning
  counts when a parsed package reports warning-level field registry issues.
- Updated JSON import wiring so package v2 missing-definition warnings appear
  in the toolbar import status.
- Added focused persistence coverage for the warning status message.
- Updated package contract, package v2 proposal, fixture catalog, test
  strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is still non-blocking readiness feedback. It does not migrate
  localStorage/export to package v2.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add In-Memory Package V2 Migration Helper

Goal: Continue the package v2 path by proving explicit migration behavior
without changing current localStorage or JSON export defaults.

Completed:

- Added `migratePersistedDocumentPackageToV2(...)`.
- Added `createDocumentPackageV2(...)` for explicit package v2 construction.
- Migrated package v1 input to package v2 in memory with an empty
  `FieldRegistryV1`.
- Migrated legacy raw `DocumentNode v1` JSON to package v2 in memory with an
  empty `FieldRegistryV1`.
- Surfaced missing field definitions as warning-level registry issues during
  v2 migration.
- Kept existing package v2 input idempotent and preserved optional `data`,
  `history`, and `migrations` members.
- Kept `serializeDocumentPackage(...)`, localStorage save, and JSON export on
  package v1.
- Updated package contract, package v2 proposal, fixture catalog, test
  strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is the last low-risk migration foundation before choosing whether
  package v2 should become the active localStorage and/or JSON export format.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Activate Package V2 For LocalStorage

Goal: Activate package v2 in the lowest-risk runtime boundary while keeping
downloaded JSON export on package v1.

Completed:

- Added `CURRENT_STORAGE_PACKAGE_VERSION = 2`.
- Changed localStorage autosave to write `FlowDocPackage v2`.
- Kept `serializeDocumentPackage(...)` and JSON export writing
  `FlowDocPackage v1`.
- Allowed `saveDocumentToStorage(...)` to receive the active
  `FieldRegistryV1`.
- Preserved package v2 field registries loaded from localStorage or JSON import
  in editor Fill mode, readiness checks, and subsequent autosaves.
- Used the sample editor field registry for new documents and legacy/package
  v1 inputs that do not carry a package-level registry.
- Updated the automated editor smoke to assert autosaved localStorage packages
  are v2.
- Updated package contract, package v2 proposal, browser smoke, fixture catalog,
  test strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/FillingPanel.tsx`
- `scripts/editor-smoke.mjs`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- JSON export intentionally remains package v1. The next major decision is
  whether and when downloaded `.flowdoc.json` files should switch to package v2.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Transition Package V2 JSON Export

Goal: Continue the short transition toward package v2 as the canonical file
format without removing the stable package v1 export yet.

Completed:

- Added `serializeDocumentPackageV2(...)`.
- Added an explicit `Save v2` editor toolbar action that downloads package v2
  JSON with the active field registry.
- Kept the existing `Save JSON` action writing package v1.
- Added `.v2.flowdoc.json` filenames for transition package v2 downloads so v1
  and v2 exports are not easy to confuse or overwrite.
- Added focused persistence coverage for package v2 export serialization and
  v2 filename generation.
- Updated package contract, package v2 proposal, browser smoke checklist,
  fixture catalog, test strategy, and work log docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/FLOWDOC_PACKAGE_CONTRACT.md`
- `docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This is intentionally transitional. The next package decision should make
  package v2 the default JSON export and remove or demote package v1 export.
- `git diff --check` reported only the repository's existing LF-to-CRLF working
  copy warnings.

### Add Automated Editor Browser Smoke

Goal: Start Phase 1 of the stability roadmap by turning the most important
manual editor smoke path into a repeatable browser check.

Completed:

- Added Playwright as a dev dependency and installed the Chromium browser
  runtime for local smoke execution.
- Added `npm.cmd run smoke:editor` / `npm run smoke:editor`.
- Added `scripts/editor-smoke.mjs`, which starts an isolated Next dev server on
  port `4010`, seeds a deterministic editor document in `localStorage`, and
  checks the real `/editor` route through Chromium.
- Covered editor load/status, paragraph multiline inline edit commit,
  undo/redo, and table-cell selection into the property panel.
- Added stable `data-testid` hooks for the editor shell, toolbar, canvas,
  page/fragments, layout error badge, and property-panel title.
- Updated the browser smoke checklist, test strategy, and fixture catalog so
  future sessions know what the automated smoke covers and what still requires
  manual inspection.

Files changed:

- `package.json`
- `package-lock.json`
- `scripts/editor-smoke.mjs`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `npm.cmd run type-check`
- `git diff --check`

Notes:

- The smoke is deliberately focused coverage. It does not replace visual
  regression, PDF/editor parity checks, drag/resize interaction checks, or
  manual review for perceived flicker.
- The script uses `localhost` by default because Next.js 16 dev resources block
  the `127.0.0.1` origin unless it is explicitly allowed in Next config.

### Add Real-Font Thai Drift Fixtures

Goal: Start Phase 2 by checking the actual runtime Thai font path, not only
mock browser/server width differences.

Completed:

- Added `realFontDrift.test.ts` under the app component tests.
- Loaded `public/fonts/THSarabun.ttf` into both Chromium canvas and the
  server-side fontkit measurer from the same font bytes.
- Added representative width parity coverage for Thai, mixed Thai/English,
  digits, long Thai tokens, and long ASCII text.
- Added a browser-canvas pagination helper that fills a synchronous measurement
  cache from Chromium, allowing the existing core paginator to run unchanged.
- Compared browser-canvas pagination and server fontkit pagination through
  `comparePagination`, asserting no line-count, page-break, continuation, or
  geometry drift for a representative Thai document.
- Updated fixture/test strategy/text-engine docs to move real-font Thai drift
  out of the known-gap bucket.

Files changed:

- `src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- The test skips when either the runtime font file or Playwright Chromium
  runtime is unavailable. When both are present, it exercises the real browser
  canvas and real fontkit paths.
- This is still not visual regression. It locks text measurement and pagination
  drift for the real Thai font before broader PDF/editor parity work.

### Add Product Export Golden Smoke

Goal: Start Phase 3 by checking product fixtures through renderer output
without brittle binary snapshots.

Completed:

- Added `productExportGolden.test.ts` under core renderer tests.
- Rebuilt the customs and report product fixtures in the renderer layer, then
  paginated them with the server-style stack: `public/fonts/THSarabun.ttf`,
  `createFontkitMeasurer`, and `thaiWordBreaker`.
- Rendered customs and report fixtures through `PdfRenderer` with a real Thai
  `FontProvider`, then loaded the generated PDF with `pdf-lib` to verify page
  count parity with authoritative pagination.
- Preserved pre-render customs table invariants in the export smoke: 3 pages,
  repeated header rows, 130 body rows, and fixed column geometry.
- Rendered the customs fixture through `DocxRenderer` and inspected
  `word/document.xml` with `JSZip` to verify generated table-row structure
  matches the paginated table rows.
- Updated fixture catalog, test strategy, and export renderer contract to mark
  product export smoke coverage as present while keeping visual regression
  clearly deferred.

Files changed:

- `packages/core/src/renderer/__tests__/productExportGolden.test.ts`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test -w packages/core -- src/renderer/__tests__/productExportGolden.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- The test intentionally avoids binary PDF/DOCX snapshots. It checks stable
  artifact properties: PDF page count and DOCX XML row structure.
- This still does not prove pixel-level PDF/editor visual parity.

### Add API Export/Paginate Contract Smoke

Goal: Start Phase 4 by protecting the actual Next route boundary for
pagination and export, not only the core renderer classes.

Completed:

- Added direct route tests for `src/app/api/paginate/route.ts` and
  `src/app/api/export/route.ts`.
- Covered `/api/paginate` success with asserted `PaginatedDocument` JSON.
- Covered invalid JSON rejection for `/api/paginate`.
- Covered invalid export format rejection for `/api/export`.
- Covered `/api/export` PDF success headers, `%PDF` bytes, and page readability
  through `pdf-lib`.
- Covered `/api/export` DOCX success headers, `PK` ZIP bytes, and editable
  `word/document.xml` readability through `JSZip`.
- Updated fixture catalog, test strategy, and export renderer contract to note
  API route contract smoke coverage.

Files changed:

- `src/app/api/__tests__/exportPaginate.test.ts`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/api/__tests__/exportPaginate.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- These are direct route-function tests. They do not start a Next dev server.
- The tests intentionally stay at the API boundary: status, headers, asserted
  JSON, and readable artifact bytes. Deep product page/table semantics remain
  in core renderer/product golden tests.

### Add Version-1 Document Persistence Guard

Goal: Start Phase 5 conservatively by hardening localStorage and JSON import
without changing the persisted document format.

Completed:

- Added `documentPersistence.ts` for the editor.
- Centralized version-1 document parsing for localStorage and JSON import.
- Kept the existing raw `DocumentNode` storage format and `flowdoc_document`
  key.
- Normalized persisted/imported documents before they enter editor state.
- Validated normalized documents with `assertDocument`, rejecting invalid JSON,
  unsupported versions, and structurally invalid documents.
- Updated `EditorShell` to use the shared persistence helper for save, load, and
  import.
- Added focused app tests for parse/normalize, invalid JSON, unsupported
  version, invalid structure, and localStorage key behavior.
- Updated architecture, fixture catalog, and test strategy docs.

Files changed:

- `src/app/editor/_components/documentPersistence.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`
- `npm.cmd run smoke:editor`
- `git diff --check`

Notes:

- This was the conservative guard before the package direction was chosen. The
  later `FlowDocPackage v1` entry keeps the same validation guard while moving
  persisted/editor JSON to a document-first package envelope.

### Add Product Pagination Golden Fixtures

Goal: Read the documentation set first, then add fixture coverage that aligns
with the documented product scenarios and test strategy.

Completed:

- Read the docs index, product scenarios, fixture catalog, test strategy,
  cross-page/page-fragmentation/export contracts, table contract, text reflow
  plan, and recent work log themes.
- Added `product fixture — customs-page-count-golden` to lock the customs table
  page count, repeated header count, footer page numbers, and fixed column
  geometry.
- Added `product fixture — report-page-count-golden` to lock cover/TOC/body
  page counts, body footer restart numbers, and long paragraph continuation
  ranges.
- Updated `assertDocument` so authored `toc` blocks are accepted in body/stack
  positions, matching the existing product fixtures and renderer/API contract
  direction.
- Updated fixture/test documentation with the new fixture ownership and current
  test inventory.

Files changed:

- `docs/FIXTURE_CATALOG.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `packages/core/src/document/assert.ts`
- `packages/core/src/document/assert.test.ts`
- `packages/core/src/pagination/__tests__/productGolden.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- src/pagination/__tests__/productGolden.test.ts`
- `npm.cmd run test -w packages/core -- src/document/assert.test.ts`
- `npm.cmd run test -w packages/core -- src/renderer/__tests__/multiSection.test.ts`
- `npm.cmd test`
- `npm.cmd run type-check`

Notes:

- This intentionally does not add pixel-level PDF/editor visual regression.
  The docs still mark that as future work; this change freezes the
  renderer-facing `PaginatedDocument` baseline first.

### Add Internal WYSIWYG Text Interaction Policy

Goal: Continue Stage 6 with pure IME, clipboard, keyboard, accessibility, and
selection-range policy helpers while keeping default textarea UX unchanged.

Completed:

- Added `src/app/editor/_components/wysiwygTextInteraction.ts`.
- Added explicit native fallback reasons for composition, clipboard,
  accessibility, stale visual state, and missing geometry.
- Added pure classification for current inline edit keyboard decisions:
  native, end edit, split paragraph, and merge/boundary backspace.
- Kept copy/cut/paste policy native by default.
- Added selection snapshot helpers that convert textarea local selection into
  full paragraph UTF-16 offsets, including continuation-fragment `preText` and
  backward selection direction.
- Updated the WYSIWYG roadmap with the Stage 6 internal helper contract.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygTextInteraction.ts`
- `src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `npm.cmd run test:app`
- `npm.cmd test`

Notes:

- This does not replace native IME or clipboard behavior. It only gives future
  WYSIWYG stages a tested policy layer to call.

### Add Internal Selection Overlay Geometry

Goal: Continue Stage 5 as an internal geometry contract for selection
highlights without enabling visible selection UI or clipboard behavior.

Completed:

- Added selection overlay rectangle helpers to `wysiwygCaretMapping.ts`.
- Covered single-line, multi-line, and split-fragment paragraph selection
  geometry in focused tests.
- Updated the WYSIWYG roadmap to mark selection overlay geometry as internal
  only, with drag selection and clipboard behavior still deferred.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd test`

Notes:

- This does not render visible selection highlights and does not change native
  textarea selection behavior.

### Activate WYSIWYG Point-To-Offset Hit Testing

Goal: Start Stage 4 by routing paragraph pointer hit testing through the new
WYSIWYG point-to-offset mapping helper while preserving the previous fallback
path.

Completed:

- Updated `EditorCanvas` paragraph click/double-click caret lookup to call
  `resolveCaretOffsetFromPointInFragment(...)`.
- Kept the older line-width ratio fallback for fragments that do not have
  segment geometry.
- Documented the Stage 4 activation in the WYSIWYG roadmap.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor`: clicking paragraph text opens
  inline edit and starts with transparent textarea/SVG visual after the
  point-to-offset helper activation.

Notes:

- This activates the mapping contract for click hit testing only. It does not
  draw a custom caret and does not add drag selection.

### Add Internal Collapsed Caret Overlay Geometry

Goal: Continue Stage 3 safely by deriving collapsed caret overlay geometry from
the new WYSIWYG mapping contract without rendering a custom caret in the editor
yet.

Completed:

- Added collapsed caret overlay geometry helpers to
  `wysiwygCaretMapping.ts`.
- Covered single-fragment and split-fragment overlay coordinates in focused
  tests.
- Updated the WYSIWYG roadmap to note that Stage 3 has internal geometry
  helpers, but default editor rendering is unchanged.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd test`

Notes:

- This deliberately avoids drawing the custom caret in `ParagraphTextSurface`
  until the native textarea interaction/fallback rules are ready.

### Start Internal WYSIWYG Caret Mapping Contract

Goal: Begin Stage 1-2 of the WYSIWYG track with an internal caret mapping
contract that can be tested without changing the default editor UX.

Completed:

- Added `src/app/editor/_components/wysiwygCaretMapping.ts` as an internal
  helper for WYSIWYG caret mapping.
- Defined tested mapping primitives for:
  - grapheme-safe caret candidates from `PaginatedLine` segments
  - paragraph offset to page-local caret position
  - page-local point to paragraph offset
  - split-fragment boundary selection across pages
- Kept the helper segment-driven and page-local; it does not store geometry in
  `DocumentNode` and is not wired into default editor interaction yet.
- Updated the WYSIWYG roadmap with the internal helper location and opt-in note.

Files changed:

- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd run test:app`
- `npm.cmd test`

Notes:

- This is still not a custom caret implementation. It is the contract layer that
  future collapsed caret and hit testing work can consume.

### Document WYSIWYG Roadmap And Narrow Pointer Lock

Goal: Lock the future WYSIWYG direction in docs while fixing the failed active
edit visual lock trigger where a second caret-placement click exposed textarea
layout drift.

Completed:

- Removed `onPointerDown` as a trigger for locking the active edit session to
  visible textarea text. Pointer events still stop propagation, but a caret
  placement click no longer changes the visual layer by itself.
- Kept visible textarea locking for actual text input, keyboard interaction, and
  composition start.
- Added `docs/WYSIWYG_EDITOR_ROADMAP.md` with the staged WYSIWYG track:
  current hybrid stability, visual truth contract, caret mapping contract,
  collapsed custom caret, hit testing, selection overlay, IME/clipboard/
  accessibility hardening, and hidden input mode.
- Documented WYSIWYG guardrails in the editor UX contract, including no document
  model changes first, no textarea layout truth, composition fallback, deferred
  selection, and `caret candidates != line segments`.
- Updated browser smoke expectations for second-click caret placement and
  keyboard/input/composition locking.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor`: opening inline paragraph edit
  starts with transparent textarea/SVG visual, a second caret-placement click
  keeps the textarea transparent, typing locks the textarea visible, and Escape
  exits back to normal SVG rendering.

Notes:

- This does not start custom caret implementation. The roadmap remains an
  internal future track until the hybrid editor is stable enough.

### Lock Active Inline Edit Visual Mode

Goal: Stop active paragraph editing from snapping after idle by preventing
automatic handoff from textarea text back to SVG text once the user has started
interacting with the textarea.

Completed:

- Replaced the short settle timer with a node-scoped visual lock:
  `inlineEditVisualLockNodeId`.
- Kept SVG visual parity available on edit entry when the paginated visual
  snapshot is already fresh.
- Lock the active edit session to visible textarea text after real user
  interaction (`onInput`, `onKeyDown`, `onPointerDown`, or
  `onCompositionStart`).
- Kept `onSelect` as caret-state only so autofocus/programmatic caret setup
  does not lock textarea mode by itself.
- Reset the visual lock when starting a new edit session, ending edit, or
  replacing the document.
- Updated editor UX and browser smoke docs with the active-session visual lock
  contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` with the current localStorage
  document:
  - reloaded the editor and confirmed no visible `layout error` /
    `Server pagination failed` badge;
  - entered inline edit and confirmed the initial fresh state kept textarea text
    transparent after autofocus/programmatic selection;
  - typed one `x` and confirmed textarea text became visible;
  - waited past the previous idle handoff window and confirmed textarea text
    stayed visible instead of snapping back to SVG;
  - used native textarea undo to restore the smoke character, closed edit with
    Escape, and restored app undo/redo state after the smoke check.

Notes:

- This is a visual-mode decision only. It does not change document truth,
  browser/server pagination, export, schema, or custom caret/selection behavior.

### Hold Textarea Fallback During Active Inline Typing

Goal: Reduce inline edit visual jitter after the guarded overlay change by
avoiding rapid per-keystroke switching between the native textarea text layer
and the SVG paginated text layer.

Completed:

- Added a short inline edit visual settle gate. Each draft text change keeps the
  textarea visible for the current typing burst, then allows the SVG visual
  layer only after the user pauses briefly and browser pagination has caught up.
- Kept the previous freshness guard: stale visual snapshots still cannot hide
  typed text, and fresh SVG lines only become the visual layer after the settle
  delay.
- Documented the intended behavior in the editor UX contract and browser smoke
  checklist.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` with the current localStorage
  document:
  - reloaded the editor and confirmed no visible `layout error` /
    `Server pagination failed` badge;
  - opened a paragraph inline editor and confirmed the settled fresh state keeps
    textarea text transparent;
  - typed one `x` and confirmed textarea text became visible during the typing
    burst;
  - waited for the settle delay and confirmed textarea text became transparent
    again once the SVG visual layer was ready;
  - closed edit with Escape and used Undo to restore the one-character smoke
    change.

Notes:

- This is still not a custom caret/selection implementation. It only smooths
  the handoff between textarea fallback and SVG visual parity.

### Add Guarded Inline Edit Visual Overlay

Goal: Make normal paragraph view and inline edit view share the same visual
text source when safe, without starting a custom caret/selection project.

Completed:

- Added inline edit draft/visual version tracking so the editor knows when the
  current paginated visual lines match the active draft.
- Kept textarea input/caret as the interaction truth, but render active SVG
  paragraph lines during edit when the visual snapshot is fresh.
- Kept textarea text visible as the fallback while visual pagination is stale,
  preventing fast typing from making text disappear.
- Made the textarea geometry intent explicit: foreignObject chrome expands the
  hit/outline box while matching padding keeps the content origin aligned with
  the paragraph fragment.
- Added focused app tests for the guarded overlay helper behavior and updated
  UX/smoke docs with the no-disappear/no-double-text contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` with the current localStorage
  document:
  - reloaded the editor and confirmed the toolbar/pages rendered with no visible
    `layout error` / `Server pagination failed` badge;
  - opened an inline paragraph editor and confirmed exactly one active textarea;
  - confirmed the fresh edit state uses transparent textarea text with visible
    caret color, allowing the SVG paragraph lines to be the visual layer;
  - closed the inline editor with Escape and confirmed the textarea unmounted
    with no visible layout error badge.

Notes:

- This keeps server pagination, export, schema, and the core pagination engine
  unchanged. Custom caret/selection remains a later decision gate.
- The browser console buffer still contained earlier authoritative pagination
  errors from the page session, so the smoke result is based on visible status
  and current editor state rather than a clean console log.

### Fit Oversized Table Columns During Flow

Goal: Clear the server `/api/paginate` layout assertion failure where table
cells could extend slightly past the page content box when authored column
widths exceeded the available table container width.

Completed:

- Added table column width resolution in the flow layer. Authored table column
  widths are preserved in `DocumentNode`, but layout scales them down
  proportionally when their sum exceeds the available parent width.
- Kept the last table column absorbing floating-point remainder so the final
  cell right edge lands on the available width instead of drifting outside the
  content box.
- Added a core pagination test for an oversized 3-column table that now fits the
  available content width and passes `assertPaginatedDocument`.
- Browser recheck on the current editor document confirmed the visible
  `Server pagination failed` / `layout error` badge disappeared after reload.

Files changed:

- `docs/WORK_LOG.md`
- `packages/core/src/layout/flow.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- tablePagination`
- `npm.cmd test`
- Browser reload of `http://localhost:4000/editor`

Notes:

- This is a layout containment fix only. It does not change schema, authored
  table columns, export APIs, or renderer behavior.

### Restore Visible Active Inline Text Feedback

Goal: Fix the live inline pagination UX regression where the native textarea
caret/input layer was transparent while SVG lines waited for debounced browser
pagination, making typed text invisible and line-click caret placement feel
wrong.

Completed:

- Made the active paragraph textarea render visible text again so immediate
  typing feedback and the native caret live in the same browser layout layer.
- Stopped rendering the active fragment SVG text lines while the textarea is
  active, avoiding duplicate text. Continuation fragments still render from the
  paginated snapshot.
- Clamped the active textarea overlay height to the active paginated fragment
  height instead of autosizing to full `scrollHeight`, preventing a long
  transparent hit area from growing past the page while pagination catches up.
- Reduced inline browser pagination cadence from 100ms to 16ms so page splits
  update during sustained typing instead of mostly after typing stops.
- Updated editor UX and smoke docs to describe the hybrid contract: active
  fragment visual feedback belongs to the textarea, page continuation belongs
  to the paginator.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser inspection on `http://localhost:4000/editor` confirmed the active
  inline textarea now uses visible text color instead of `transparent`; the
  existing local document still shows the separate server pagination failed
  badge noted in the previous entry.

Notes:

- This does not add a mini paginator in `ParagraphTextSurface`. The textarea
  only owns immediate active-fragment feedback; cross-page layout still comes
  from browser/server pagination.

### Harden Inline Edit Relocation Blur And Caret Movement

Goal: Close the main UX risks after adding caret-following across live
pagination: accidental edit finalization during textarea relocation and stale
caret state when the user moves the caret without typing.

Completed:

- Added a delayed blur guard for inline edit textareas. Blur from an old
  remounted textarea waits briefly and is ignored when focus lands on another
  inline textarea for the same paragraph.
- Added a focused `shouldFinalizeInlineEditBlur()` helper with tests for same
  node relocation, outside blur, changed active node, and unknown-node fallback.
- Added `onInlineEditCaretChange` through `ParagraphTextSurface` and
  `EditorCanvas` so selection/arrow-key caret movement updates
  `inlineEditCaretIndex` without dispatching `UPDATE_INLINE_TEXT_DRAFT`.
- Marked active inline textareas with `data-inline-edit-node-id` for relocation
  focus checks.
- Updated editor UX and browser smoke docs with the blur/caret hardening
  contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/inlineEditBlur.ts`
- `src/app/editor/_components/__tests__/inlineEditBlur.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser smoke on `http://localhost:4000/editor` confirmed the editor route,
  toolbar, pages, and outline rendered; the current local document still showed
  `Server pagination failed — editor is showing browser preview only`, with no
  console warnings/errors captured.

Notes:

- This keeps the architecture unchanged: no schema/export/server/pagination
  engine changes, and `ParagraphTextSurface` still does not implement page
  fragmentation.
- The server pagination badge should be investigated separately if it persists
  outside the current localStorage document/dev-server state.

### Polish Live Inline Pagination Performance Phase 4

Goal: Keep live inline pagination responsive as documents grow without changing
the pagination contract or schema.

Completed:

- Split inline edit caret lookup into reusable precomputed fragment ranges.
- Updated `EditorShell` to memoize active paragraph fragment ranges per
  paginated snapshot, so ordinary caret movement does not rescan the full
  document until pagination actually changes.
- Kept the one-shot `findInlineEditPageIndexForCaret()` helper for direct tests
  and callers that do not need cached ranges.
- Added an early generation/edit-node guard before browser pagination computes a
  new optimistic snapshot, avoiding work for callbacks that are already stale.
- Added app tests for precomputed range reuse across caret moves.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/inlineEditCaret.ts`
- `src/app/editor/_components/__tests__/inlineEditCaret.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`

Notes:

- This phase keeps browser pagination whole-document and debounced. More
  invasive affected-section or measurement-cache work remains a future engine
  optimization, not part of the inline edit UX slice.

### Harden Continuation Fragment Inline Editing Phase 3

Goal: Make Enter/Backspace inside split paragraph inline editing use the full
paragraph text offset, even when the active textarea only renders a continuation
slice.

Completed:

- Added inline edit helpers for absolute caret mapping, split text generation,
  and continuation-boundary Backspace behavior.
- Wired paragraph inline `Enter` to split at the absolute paragraph offset,
  deleting any selected local text before splitting.
- Wired `Backspace` at the start of a continuation slice to delete the previous
  grapheme across the continuation boundary instead of incorrectly merging the
  paragraph.
- Kept `Backspace` at the true start of the full paragraph mapped to
  `mergeParagraphWithPrevious()`.
- Preserved inline edit history snapshots across split/merge dispatches so the
  previous edit transaction does not linger after structural paragraph actions.
- Started a fresh inline edit transaction after split/merge focus moves to the
  new or previous paragraph.
- Updated editor UX and browser smoke docs with the continuation key handling
  contract.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`

Notes:

- Cross-fragment text selection and fully caret-perfect visual editing remain
  deferred polish. This phase focuses on correct full-text offset mapping and
  avoiding wrong paragraph merges from continuation slices.

### Add Inline Edit Caret Page Tracking Phase 2

Goal: Move the active inline edit surface to the paginated fragment containing
the caret once live inline pagination splits a paragraph across pages.

Completed:

- Added `findInlineEditPageIndexForCaret()` to derive the active edit page from
  paginated paragraph fragment segment ranges.
- Updated `EditorShell` to update `inlineEditPageIndex` when the caret crosses
  a live continuation boundary, while leaving the caret index as transient
  editor state rather than document geometry.
- Added app tests for first-page caret placement, continuation-page placement,
  exact split boundaries, moving back before the boundary, and missing segment
  offset fallback.
- Updated editor UX and browser smoke docs to reflect active textarea page
  tracking while keeping cross-fragment selection and fully caret-perfect
  editing deferred.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/inlineEditCaret.ts`
- `src/app/editor/_components/__tests__/inlineEditCaret.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`

Notes:

- This phase intentionally uses paginated segment offsets instead of page
  geometry in authored nodes. Editing from later continuation fragments and
  Enter/Backspace hardening remain Phase 3 work.

### Add Live Inline Pagination Preview Phase 1

Goal: Let long inline paragraph edits use browser pagination for optimistic
page continuation before blur, without turning the text surface into a second
paginator.

Completed:

- Allowed the browser `paginateDocument(previewDoc, editorTextMeasurer)` path to
  run during inline editing with a conservative debounce.
- Added a browser pagination generation guard so stale optimistic pagination
  results cannot overwrite newer draft layouts during fast typing.
- Kept server `/api/paginate` as authoritative status/drift/export truth.
- Stopped inline edit height callbacks from shifting page layout while live
  inline pagination is active, avoiding double movement when the paginator
  settles the same draft.
- Changed the active paragraph edit surface to render visual text from
  `PaginatedDocument` fragment lines instead of measuring and drawing all draft
  lines inside the current fragment.
- Stabilized editor canvas keys for sections, pages, and active inline fragments
  so frequent paginated snapshot updates are less likely to remount the textarea.
- Updated editor/browser smoke docs to describe live inline pagination as
  optimistic visual layout and keep caret-following across pages deferred.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser check on `http://localhost:4000/editor`:
  - confirmed the editor loaded with no console warnings/errors;
  - opened the existing multi-page paragraph inline editor;
  - confirmed the restored text matched the pre-smoke value before committing;
  - committed the inline session and confirmed no textarea/focus residue or
    console warnings/errors remained.

Notes:

- Browser automation could not complete the full shrink/restore smoke because
  the current Browser Use text replacement path required a virtual clipboard
  that was unavailable in this session. The attempted keystroke change was
  repaired and verified against the pre-smoke text before committing.
- Phase 1 intentionally improves visual continuity only. Caret-following across
  pages and full continuation-fragment editing remain deferred.

## 2026-05-10

### Restore Inline Long-Run Wrapping

Goal: Keep the inline paragraph caret/input surface aligned with visible text
when typing long unbroken text runs.

Completed:

- Reproduced the active editor state with a long unbroken Thai probe while a
  paragraph inline editor was open.
- Confirmed the inline canvas textarea was using `overflow-wrap: break-word`
  even though the earlier documented fix expected `overflow-wrap: anywhere`.
- Restored the inline textarea wrapping rule to `overflowWrap: "anywhere"` so
  native textarea wrapping better matches the core grapheme fallback used for
  over-wide segments.
- Removed the temporary probe text after browser verification.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- Browser check on `http://localhost:4000/editor`:
  - inspected the active inline textarea style and confirmed
    `overflow-wrap: anywhere`;
  - typed a long Thai probe into the active inline editor;
  - confirmed the property-panel text length increased by the probe length;
  - restored the paragraph text to its pre-probe value;
  - confirmed no browser console warnings/errors were reported.

### Show Export Failure Feedback

Goal: Make export failures visible to users instead of console-only.

Completed:

- Added `exportError` editor UI state separate from layout/reconciliation status.
- Clear export errors when a PDF/DOCX export starts and after a successful
  export.
- Set a short format-specific message when export fails, such as
  `PDF export failed. Please try again.`
- Display the message near the export controls while keeping `console.error` for
  debugging.
- Kept `/api/export`, PDF/DOCX renderers, core pagination, document model, and
  export gating/reconciling policy unchanged.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `git diff --check`
- Doc reference check: all explicit `docs/*.md` references resolve.
- Browser/code-path smoke on `http://localhost:4000/editor`:
  - initial editor load shows no stale export failure message.
  - export controls remain visible/stable near the new error slot.
  - normal PDF export click does not leave a visible failure message; the Codex
    in-app browser does not support download capture, so file download completion
    was not verified there.
  - failure behavior was confirmed from the `handleExport` code path: start and
    success clear `exportError`; catch sets the format-specific UI message.

Notes:

- Export while reconciling / export gating remains deferred to a separate policy
  slice.

### Disable Template Undo/Redo While Filling

Goal: Make Fill mode undo/redo match the current binding/history contract.

Completed:

- Disabled toolbar Undo/Redo while Fill mode is active, even when template
  history exists.
- Guarded editor-shell Ctrl+Z/Ctrl+Y so Fill mode does not trigger template
  history undo/redo from the editor surface.
- Left field inputs to use native browser input undo behavior.
- Documented the current policy: template history is disabled while filling;
  dedicated submission history is deferred.
- Did not change reducer/history architecture, binding behavior, core
  pagination, or template-mode undo/redo behavior.

Files changed:

- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`

Verification:

- `npm.cmd run type-check`
- `git diff --check`
- Doc reference check: all explicit `docs/*.md` references resolve.
- Browser smoke on `http://localhost:4000/editor`:
  - Template mode Ctrl+Z undoes a template text edit; toolbar Redo restores it.
  - Fill mode disables toolbar Undo/Redo even when template history exists.
  - Fill mode Ctrl+Z does not undo template content.
  - Switching back to Template mode restores template undo/redo behavior.
  - Field input native undo is preserved by the code path because text inputs
    return before editor-shell shortcut handling; no field input was available
    in the active smoke template.

Notes:

- Broader Fill mode lock-surface review, such as non-history keyboard actions,
  is deferred to a separate focused slice.

### Fix Inline Edit Lifecycle Finalization

Goal: Prevent inline edit drafts from entering `state.doc` without a matching
undo transaction when another same-document action closes edit mode.

Completed:

- Added `finalizeInlineEditBeforeAction()` for same-document actions. It reuses
  the existing inline edit commit path, clears inline edit UI state, and clears
  the transaction ref.
- Added `resetInlineEditStateForDocumentReplace()` for New/Open document
  replacement. It discards inline edit UI state and transaction refs without
  committing stale edits across documents.
- Routed same-document actions through finalization, including export, Save JSON,
  undo/redo, background click, resize starts, palette/node pointer starts, and
  template/fill mode switching.
- Routed New/Open document replacement through reset/discard behavior.
- Kept reducer architecture, core pagination, fill-mode undo/redo policy, and
  export error UI unchanged.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorShell.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `git diff --check`
- Doc reference check: all explicit `docs/*.md` references resolve.
- Browser smoke on `http://localhost:4000/editor`:
  - edit 3-4 lines -> margin resize start -> undo/redo restores expected text.
  - edit -> row/min-height resize start -> undo/redo restores expected text.
  - edit -> switch Fill/Template -> inline textarea closes with no stale editor.
  - edit -> New -> inline session resets and draft text is discarded.

### Add Page Fragmentation Model Contract

Goal: Create a shared language for current page-boundary behavior before
touching more pagination code.

Completed:

- Added `docs/PAGE_FRAGMENTATION_MODEL.md` documenting the current
  natural-flow-first, policy-based fragmentation model.
- Described the flow, pagination, and renderer layers without implying an
  immediate refactor.
- Added the current fragmentation policy matrix by structure, including
  paragraph line fragmentation, atomic blocks, breakable table row slices,
  rowspan groups, and TOC repagination.
- Documented the key table row split accounting risk: the row loop is
  height/slice-driven while each cell tracks child/line continuation state.
- Added agent guardrails against making frontend preview or renderers the layout
  truth, changing cross-page behavior without focused tests, or unifying
  fragmentation policies opportunistically.
- Linked the new contract from the docs index, agent workflow, cross-page
  behavior contract, layout spec, and layout checklist.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/DOCS_INDEX.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PAGE_FRAGMENTATION_MODEL.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to
  existing files.

### Tighten Table Split Metadata Assertions

Goal: Add the final small table split accounting assertion suggested by review
without changing pagination behavior.

Completed:

- Tightened `expectContiguousLineAccounting` in
  `packages/core/src/pagination/__tests__/tablePagination.test.ts`.
- The helper now asserts the first split fragment is not marked as continuing
  from a previous fragment.
- The helper now checks each fragment's `lineStart` / `lineEnd` span matches the
  actual number of rendered lines on that fragment.

Files changed:

- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
  passed: 40 table pagination tests.
- `npm.cmd run type-check`
- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to
  existing files.

### Tighten Export Renderer Dependency Guard

Goal: Keep export/renderers from becoming a second layout engine while reviewing
the renderer/API boundary.

Completed:

- Rechecked `/api/export`, PDF renderer, and DOCX renderer boundaries: export
  still paginates and asserts before rendering, while production renderers accept
  `PaginatedDocument`.
- Added a renderer dependency guard to `docs/EXPORT_RENDERER_CONTRACT.md`:
  production renderer code should not import document schema, document
  operations, `paginateDocument`, text measurers, or word breakers.
- Clarified that DOCX may serialize paginated line text into editable Word
  paragraphs, but this must not become a new FlowDoc line/page breaking policy.
- Added verification guidance for future renderer dependency changes.

Files changed:

- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to
  existing files.

### Add Editor State Race Smoke Contract

Goal: Make editor state/reconciliation race checks explicit before changing more
inline edit, undo/redo, export, or renderer-facing editor behavior.

Completed:

- Added editor state race invariants to `docs/EDITOR_UX_CONTRACT.md` covering
  `state.doc`, `previewDoc`, `state.paginated`, stale server responses, inline
  edit history, undo/redo snapshots, export, and ephemeral interaction state.
- Added a focused browser smoke set for editor state race and reconciliation
  checks in `docs/BROWSER_SMOKE_CHECKLIST.md`.
- Updated `docs/TEST_STRATEGY.md` so editor state race/reconciliation changes
  have an explicit verification row.

Files changed:

- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to
  existing files.

### Add Binding Scalar Contract Tests

Goal: Lock the current binding layer contract before expanding table/editor
workflow work.

Completed:

- Added focused binding tests for scalar `fieldRef` replacement in normal
  paragraphs.
- Covered missing-field fallback, missing-field empty text, and fieldRef
  replacement inside table-cell paragraphs.
- Added a non-mutation test so binding keeps templates intact while producing a
  resolved temporary document.
- Locked the current registry behavior as descriptive rather than strict
  validation, matching the deferred repeat/nested binding contract.
- Updated coverage snapshots and fixture catalog ownership after adding the new
  core test file.

Files changed:

- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `packages/core/src/binding/index.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- binding/index.test.ts` passed: 6 binding
  tests.
- `npm.cmd test` passed: 20 core test files / 285 core tests, plus 2 app test
  files / 21 app tests.
- `npm.cmd run type-check`

### Clarify Table Cell Flow Semantics

Goal: Reduce confusion around table-cell identity between flow measurement and
pagination output before further table/cross-page work.

Completed:

- Added a code comment in `packages/core/src/layout/flow.ts` explaining that
  table cells use stack-like `FlowBox` semantics during measurement.
- Documented that pagination emits those cells as
  `PageFragment.nodeType="table-cell"` for renderer/debug/editor identity.
- Linked the distinction from table/layout docs so future agents do not treat
  the internal flow node type as public table identity.

Files changed:

- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WORK_LOG.md`
- `packages/core/src/layout/flow.ts`

Verification:

- `npm.cmd run type-check`
- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to
  existing files.

### Add Table Split Accounting Tests

Goal: Add narrow regression coverage for table row split accounting before
changing cross-page table behavior or refactoring the paginator.

Completed:

- Added table row split accounting assertions for uneven multi-cell splits so
  each long cell preserves contiguous `lineStart` / `lineEnd` ranges
  independently.
- Added regression coverage for an empty cell in a split row, ensuring it does
  not disturb progress or duplicate sibling paragraph content.
- Added regression coverage for a spacer before a continued table-cell paragraph
  so the spacer is not duplicated across continuation pages.
- Added regression coverage for padded table cells where padding reduces split
  capacity while paragraph line accounting remains contiguous.
- Added regression coverage for tall repeated table headers that consume most of
  the page height while a breakable body row still makes progress and preserves
  continuation line accounting.
- Updated current suite snapshots and fixture ownership docs after adding the
  table pagination tests.

Files changed:

- `docs/FIXTURE_CATALOG.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
  passed: 40 table pagination tests.
- `npm.cmd test` passed: 19 core test files / 279 core tests, plus 2 app test
  files / 21 app tests.
- `npm.cmd run type-check`

Notes / follow-ups:

- No production behavior was changed in this slice.
- The next useful table split hardening pass can target proven edge failures
  only, such as too-large padding, repeated-header starvation, or span-specific
  continuation behavior.

### Tighten Agent Precheck And Runtime Guardrails

Goal: Apply follow-up documentation review findings so future agents have less
room to misread orientation, verification, font, alias, binding, or test-count
rules.

Completed:

- Aligned the new-session read order between `docs/DOCS_INDEX.md` and
  `docs/AGENT_WORKFLOW.md`.
- Added an "Agent Precheck Before Editing" section covering task-area
  identification and hard never-rules before editing.
- Added repository-context rules for shell-specific npm commands, repository
  root execution, honest verification reporting when dependencies/config are
  missing, `@/*` path aliases, and the authoritative runtime font location.
- Documented that `public/fonts/THSarabun.ttf` is the runtime font source of
  truth; `src/fonts/THSarabun.ttf` should not be used unless the font loading
  contract changes.
- Documented current binding as scalar `fieldRef` resolution only, with repeat
  behavior intentionally deferred.
- Reduced fragile per-file test-count wording in current checklists so exact
  counts come from the test runner and `docs/FIXTURE_CATALOG.md`.
- Removed leftover count-update wording from the layout checklist addendum so
  agents do not treat historical per-file totals as current truth.
- Removed placeholder-style doc path wording from work log verification notes to
  avoid false positives in simple doc reference scanners.
- Reworded checklist responsibility guidance so agents update coverage snapshots
  only when suite size or coverage ownership meaningfully changes.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to existing
  files.

### Add P1 Verification And Fixture Docs

Goal: Add the next layer of practical documentation so browser checks, export
renderer expectations, and fixture ownership are easy to find before returning
to table/cross-page implementation work.

Completed:

- Added `docs/BROWSER_SMOKE_CHECKLIST.md` with focused manual/browser check
  steps for load/status, paragraph inline edit, split continuation edit, table
  cell selection, table operations, and export/status feedback.
- Added `docs/EXPORT_RENDERER_CONTRACT.md` covering the API export boundary,
  renderer non-responsibilities, PDF authority, DOCX exchange limitations, font
  fallback behavior, required product behaviors, and verification expectations.
- Added `docs/FIXTURE_CATALOG.md` mapping product fixtures and current core/app
  test files to the behaviors they protect, including known coverage gaps.
- Linked the new P1 docs from the docs index, test strategy, agent workflow,
  product direction, architecture overview, editor UX contract, engineering
  principles, product scenarios, layout spec, and layout checklist.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
- `docs/DOCS_INDEX.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck.
- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to existing
  files.

### Add P0 Documentation Map And Editor Architecture Contracts

Goal: Add the highest-priority documentation that makes the repo easier to
orient: a docs map, an architecture overview, and an editor UX contract.

Completed:

- Added `docs/DOCS_INDEX.md` as the documentation entry point with source of
  truth mapping, task-based reading paths, work log policy, and conflict
  resolution order.
- Added `docs/ARCHITECTURE_OVERVIEW.md` describing the current app/core/API/
  pagination/renderer layers, runtime flows, editor state ownership, and
  high-risk boundaries.
- Added `docs/EDITOR_UX_CONTRACT.md` defining editor interaction expectations
  for selection, inline editing, undo/redo, table editing, preview reconciliation,
  status feedback, browser smoke checks, and accepted limitations.
- Linked the new P0 docs from product direction, agent workflow, engineering
  principles, layout spec, layout checklist, and test strategy.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/DOCS_INDEX.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck.
- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to existing
  files.

### Recheck Docs Against Current Repo State

Goal: Make the current documentation match the repository's actual behavior,
test counts, and newly added direction/workflow contracts before adding more
future roadmap content.

Completed:

- Rechecked all files under `docs/` and separated current-status docs from
  historical `WORK_LOG.md` entries so older test counts remain historical rather
  than being rewritten.
- Updated `docs/LAYOUT_ENGINE_SPEC.md` to remove stale open questions for
  decisions already made: paragraph fragment identity, widow/orphan behavior,
  and basic table-cell continuation.
- Updated `docs/LAYOUT_ENGINE_SPEC.md` to describe current paragraph fragment
  metadata (`fragmentIndex`, `lineStart`, `lineEnd`, `continuesFrom`,
  `isContinued`) and current keep-rule status.
- Updated `docs/TEXT_REFLOW_PLAN.md` so UTF-16 offsets and acceptable temporary
  browser/server drift are recorded as resolved instead of open questions.
- Linked text docs to the current product direction and test strategy.
- Updated `docs/TEST_STRATEGY.md` with the current verified suite size:
  19 core test files / 274 core tests and 2 app test files / 21 app tests.
- Reworded the split-paragraph inline editing item in
  `docs/LAYOUT_ENGINE_CHECKLIST.md` from active "IN PROGRESS" to open
  hardening work, with current status focused on continuation-fragment UX.
- Verified all explicit docs markdown references point to existing files.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEST_STRATEGY.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/TEXT_REFLOW_PLAN.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`
- Doc reference check: all explicit docs markdown references resolve to existing
  files.

### Add Test Strategy And QA Playbook

Goal: Make test expectations explicit so future work can choose the right
verification level instead of guessing between unit tests, fixtures, browser
checks, and product scenarios.

Completed:

- Added `docs/TEST_STRATEGY.md` covering schema/operation tests, pagination
  fixtures, renderer smoke tests, app-level unit tests, browser smoke checks,
  product scenario fixtures, risk-based verification, Definition of Done,
  current coverage strengths/gaps, and command reference.
- Linked the strategy from agent workflow, engineering principles, product
  direction, product scenarios, and layout checklist.
- Made browser smoke checks explicit as the current guard for editor UX qualities
  such as selection, text visibility, undo/redo intent, layout errors, flicker,
  jumps, and unwanted scroll.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TEST_STRATEGY.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck.
- `git diff --check`

### Add Agent Workflow Contract

Goal: Document the collaborator role for Codex-style sessions so future work
knows what to read first, when to update docs, how to verify changes, and when
to write the work log.

Completed:

- Added `docs/AGENT_WORKFLOW.md` covering role, start-of-session orientation,
  during-work habits, documentation responsibilities, verification bar, browser
  checks, work log shape, commit policy, and end-of-task expectations.
- Linked the workflow from work log, engineering principles, product direction,
  and layout checklist.
- Made the rule explicit that meaningful behavior/layout/editor/export/test/doc
  work should leave a work log entry, while tiny mechanical changes may skip it.

Files changed:

- `docs/AGENT_WORKFLOW.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck.
- `git diff --check`

### Add Product Direction North Star

Goal: Document that FlowDocEditor is intended to grow from document generation
into a workflow-ready editor, so future implementation choices do not optimize
only for export.

Completed:

- Added `docs/PRODUCT_DIRECTION.md` with the product north star, current product
  shape, accepted limitations, long-term non-goals, decision bias, and links to
  the supporting docs.
- Linked the product direction from product scenarios, engineering principles,
  layout engine spec, and layout checklist.
- Made the editor-quality bar explicit: interaction stability, predictable
  selection, trustworthy undo/redo, stable table operations, documented
  page-break behavior, and authoritative PDF output.

Files changed:

- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck.
- `git diff --check`

### Recheck Table Docs Before Cross-Page Work

Goal: Bring documentation back in sync after table editing work grew beyond the
existing checklist.

Completed:

- Added a dedicated table editing contract covering table ownership, authored
  model rules, editor selection behavior, editable props, row/column operation
  rules, pagination-related props, verification expectations, and deferred work.
- Linked the new contract from the layout engine spec, cross-page behavior
  contract, layout checklist, product scenarios, and engineering principles.
- Updated the layout checklist to include column width preservation after
  insert/delete operations and to reflect the current 35 table pagination tests.
- Updated product scenarios so customs-style fixed tables require stable column
  insert/delete width behavior and direct table-cell editing from the canvas.
- Updated engineering principles to treat table column insert/delete as
  structure-preserving operations, not implicit table resize actions.

Files changed:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation recheck against the current table editor/code changes.
- `git diff --check`

Notes / follow-ups:

- Next cross-page table work should update both
  `docs/CROSS_PAGE_BEHAVIOR.md` and `docs/TABLE_EDITING_CONTRACT.md` whenever
  pagination or authoring behavior changes.

### Make Table Editing Usable From Canvas

Goal: Improve the first table editing slice before starting cross-page table
pagination work.

Completed:

- Made table cells selectable from the canvas even when the click lands on the
  paragraph fragment rendered inside the cell.
- Kept normal body paragraph click-to-edit behavior, while table cell
  paragraphs now select the parent cell on single click.
- Added table-cell double-click support that opens inline edit on the first
  paragraph inside the cell.
- Expanded the table-cell property panel with text editing, padding,
  background, vertical alignment, row insertion, column insertion, column
  deletion, and row deletion controls.
- Added table-level header row count editing and row-level page-break toggling
  to expose pagination-related table settings before implementing page splits.
- Changed column insertion to split the target column width, and column
  deletion to transfer the removed width to a neighbor, so table operations keep
  the overall table width stable.
- Added regression coverage for add/remove column width preservation.

Files changed:

- `docs/WORK_LOG.md`
- `packages/core/src/document/operations.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- Browser verification on `http://localhost:4000/editor`:
  - Selected a table cell directly from the canvas and confirmed the
    `TABLE-CELL` panel appears instead of the paragraph panel.
  - Edited table cell text through the cell panel.
  - Inserted a column to the right and confirmed the table outline updated.
  - Deleted a column and confirmed the table returned to the previous column
    count.
  - Confirmed no layout error appeared during the flow.

Notes / follow-ups:

- Next table work should focus on cross-page behavior: single paragraph cells,
  row break policy, repeated header rows, and split rendering/export parity.

### Make Inline Edit Undo Transactional

Goal: Make undo/redo treat one inline paragraph edit session as a single history
step instead of one step per text update.

Completed:

- Added an inline edit transaction snapshot that captures the document and text
  before edit mode starts.
- Changed inline text typing to update the live document as a draft without
  pushing every keystroke or typed chunk into undo history.
- Committed the transaction when inline edit ends, pushing one history entry only
  if the paragraph text changed.
- Routed root-level Escape through the same inline edit end path so it cannot
  bypass transaction commit.
- Stored the current pagination snapshot with undo/redo history entries so redo
  restores the same canvas layout that was previously visible instead of
  measuring a new transient layout.
- Committed a final after-edit browser-pagination snapshot when inline edit
  ends, including no-text-change exits, so redo restores the normal display
  layout rather than a temporary inline-edit geometry snapshot.
- Kept the editor canvas on browser-preview pagination after authoritative
  `/api/paginate` succeeds; server pagination now feeds status/drift/export
  truth without overwriting the visual layout used by inline editing.
- Reused the currently displayed paragraph fragment lines when entering inline
  edit without text changes, so the first edit frame starts from the exact same
  glyph layout as normal paragraph display.
- Added an explicit "text was edited in this session" flag for inline editing.
  After the first input, edit preview measures from the live textarea value even
  when the document draft has already caught up, preventing newly typed text
  from appearing invisible behind stale fragment lines.
- Removed the old layout-loading live-text overlay that could draw the full
  paragraph on the first displayed line while authoritative pagination was
  reconciling.
- Hydrated preview pagination with the editor's browser measurer on document
  load/new-document actions so the canvas does not briefly render a new document
  through the previous layout.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`

Verification:

- `npm.cmd run type-check`
- Browser verification on `http://localhost:4000/editor`:
  - Reset to a clean document with `New`.
  - Typed a paragraph in three separate chunks during one inline edit session.
  - Confirmed `Undo` stayed disabled during the uncommitted edit.
  - Ended edit with Escape, then confirmed one `Undo` cleared the full paragraph
    and one `Redo` restored the full paragraph.
  - Repeated the redo check with keypress-driven input and confirmed the DOM had
    the full redone paragraph immediately after the redo click and after settle.
  - Re-ran the focused canvas edit path after storing pagination snapshots in
    history, then confirmed the paragraph returned after redo and entering edit
    again did not change the text line layout.
  - Re-ran a soft-wrapped paragraph case after removing the loading overlay and
    confirmed the normal/edit inner text crops kept the same line layout; the
    remaining screenshot byte difference was from edit border/chrome.
  - Typed into the scoped inline textarea while edit mode stayed active and
    confirmed the DOM contained the new text and the canvas showed the typed
    glyphs immediately.
  - Restarted the local dev server after it had stopped, reloaded the browser,
    and confirmed the final DOM had no `layout error`, `preview layout`, or
    `layout...` indicator during the redo check.
  - Earlier browser logs still contained `Failed to fetch` entries from the
    period when the dev server was down; no final visual error badge remained
    after restart.

### Align Inline Edit Visual Text With Core Layout

Goal: Reduce the snap between inline edit mode and normal paragraph display when
typing enough text to create a soft-wrapped line.

Completed:

- Kept the native textarea as the input/caret surface, but made its glyphs
  transparent during edit mode.
- Added a core-measured SVG text overlay during edit mode so the visible text is
  positioned with the same measured-line rules used by normal display.
- Measured the live textarea value locally so soft-wrap changes update the edit
  overlay immediately while typing.
- Included core-measured edit height in the active edit height calculation so
  the editor frame can grow according to the normal text layout, not only the
  browser textarea's native wrapping.
- Preserved continuation-fragment text slicing and full-paragraph reconstruction
  from the continuation edit tests.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- Browser verification on `http://localhost:4000/editor`:
  - Kept the dev server running and reloaded the editor without the
    layout-error state.
  - Opened a soft-wrap paragraph edit case and confirmed edit mode renders the
    visible text through the measured SVG overlay while the textarea remains the
    input surface.
  - Replaced the active paragraph with a long no-newline Thai probe, then typed
    additional text until the paragraph soft-wrapped during edit mode.
  - Exited inline edit and confirmed the normal paragraph display kept the same
    line layout/frame shape as the edit overlay, with no new console errors.

### Add Continuation Inline Edit Tests

Goal: Make the split-paragraph inline edit continuation case reachable by tests
before changing the editor UX further.

Completed:

- Extracted `getContinuationEditState` from `ParagraphTextSurface` so the
  continuation text/caret calculation can be tested without a browser harness.
- Added app tests covering first-fragment editing, continuation-fragment text
  slicing, caret adjustment, caret clamping, full-text reconstruction after a
  continuation edit, and missing segment-offset fallback.

Files changed:

- `docs/WORK_LOG.md`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`

Verification:

- `npm.cmd run test:app`
- `npm.cmd test`
- Browser sanity: reloaded `http://localhost:4000/editor`; console warning/error
  logs were empty.

### Default Table Rows To Breakable

Goal: Make normal single-row table groups split across page boundaries by default
while preserving explicit keep-together behavior.

Completed:

- Changed `paginateTable` so omitted `allowBreak` is treated as `true` for
  single-row groups.
- Fixed the split-row path so advancing because the remaining page space is below
  the minimum split height still repeats table headers before placing the row on
  the continuation page.
- Updated the table row schema comment to document `allowBreak` defaulting to
  breakable behavior.
- Added regression coverage for the new default split behavior and for explicit
  `allowBreak=false` whole-row movement.
- Updated cross-page behavior docs, product scenarios, and checklist status.

Files changed:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/schema/table.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- Browser sanity: reloaded `http://localhost:4000/editor`; console warning/error
  logs were empty.

### Add Full Table-Cell Paragraph Metadata

Goal: Keep table-cell paragraph metadata consistent between normal row placement
and breakable row continuation.

Completed:

- Updated `pushTableCellContents` so full table-cell paragraph fragments expose
  `lineStart`, `lineEnd`, `continuesFrom=false`, and `isContinued=false`.
- Added a regression test for full table-cell paragraph line metadata.
- Updated the cross-page behavior contract and checklist counts.

Files changed:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- Browser sanity: reloaded `http://localhost:4000/editor`; console warning/error
  logs were empty.

### Add Table-Cell Continuation Metadata

Goal: Make table-cell paragraph splits easier to inspect and align them with the
cross-page behavior contract.

Completed:

- Updated `pushCellSlice` so paragraph fragments created inside breakable table
  rows expose `lineStart`, `lineEnd`, `continuesFrom`, and `isContinued`.
- Added a table pagination regression test that verifies table-cell paragraph
  continuation metadata is contiguous and reaches the original line count.
- Updated cross-page behavior docs, product coverage notes, and checklist counts.

Files changed:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`
- Browser sanity: reloaded `http://localhost:4000/editor`; console warning/error
  logs were empty.

### Define Cross-Page Behavior Contract

Goal: Make current page-boundary support explicit before expanding paragraph,
row/column, and table cross-page behavior.

Completed:

- Added `docs/CROSS_PAGE_BEHAVIOR.md` as the shared contract for current
  cross-page behavior, overflow fallbacks, fragment metadata, and deferred work.
- Linked the contract from `LAYOUT_ENGINE_SPEC.md`.
- Updated `LAYOUT_ENGINE_CHECKLIST.md` with the completed contract item and the
  new row/stack coverage count.
- Updated `PRODUCT_SCENARIOS.md` coverage matrix with the current row/column
  atomic behavior.
- Added a row/stack regression test proving that paragraph content inside a
  stack does not split independently from its row.

Files changed:

- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/rowStack.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/rowStack.test.ts`
- `npm.cmd test`
- Browser sanity: reloaded `http://localhost:4000/editor`; console warning/error
  logs were empty.

### Align Product Scenario Coverage Notes

Goal: Make docs/test coverage read as one picture after completing the product
fixture roadmap.

Completed:

- Updated `PRODUCT_SCENARIOS.md` acceptance sections with current automated
  coverage notes.
- Added a scenario coverage matrix that separates structural pagination, DOCX XML
  structure, smoke coverage, and missing visual/semantic coverage.
- Clarified that product fixtures cover pagination/structure behavior, while
  PDF visual/page-count golden tests remain future visual regression work.
- Clarified that DOCX fixture coverage checks section/page boundaries and
  editable text presence, not semantic Word heading styles.
- Updated `LAYOUT_ENGINE_CHECKLIST.md` multi-section test count and product
  fixture coverage wording.
- Updated current checklist counts for table pagination and keep-with-next tests.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd test`

### Add Report DOCX Structure Fixture

Goal: Cover the report scenario where DOCX output should preserve useful
editable structure across cover, TOC, and body sections.

Completed:

- Added `product fixture — report-docx-structure` to `multiSection.test.ts`.
- The fixture builds a cover section, TOC section, and body section with
  `pageNumberStart=1`, renders DOCX, and inspects `word/document.xml`.
- Verifies the DOCX has a ZIP header, emits the expected number of Word section
  properties, and includes cover title, TOC title, body heading, and editable
  body paragraph text.
- Updated `PRODUCT_SCENARIOS.md` to mark the fixture covered.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/renderer/__tests__/multiSection.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- renderer/__tests__/multiSection.test.ts`
- `npm.cmd test`

### Add Report Keep-With-Next Fixture

Goal: Cover the report scenario where a heading near the bottom of a page must
move with its following paragraph.

Completed:

- Added `product fixture — report-keep-with-next` to `keepWithNext.test.ts`.
- The fixture fills most of a page, then places a Thai heading with
  `headingLevel=1` and `keepWithNext=true` before a following body paragraph.
- Verifies the heading moves to the next page instead of being stranded at the
  bottom of the previous page, stays on the same page as the following paragraph,
  and `assertPaginatedDocument` passes.
- Updated `PRODUCT_SCENARIOS.md` to mark the fixture covered.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/keepWithNext.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/keepWithNext.test.ts`
- `npm.cmd test`

### Add Customs Breakable Uneven Row Fixture

Goal: Cover customs rows where one description cell is much taller than short
numeric cells and the row is allowed to break across pages.

Completed:

- Added `product fixture — customs-breakable-row-uneven-cells` to
  `tablePagination.test.ts`.
- The fixture creates a repeated-header table with one `allowBreak=true` body row:
  short number cell, long Thai description cell, and short amount cell.
- Verifies the body row spans multiple pages, description text is preserved
  across split fragments, short number/amount cells render only once, repeated
  headers appear on continuation pages, and `assertPaginatedDocument` passes.
- Updated `PRODUCT_SCENARIOS.md` to mark the fixture covered.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`

### Add Customs Rowspan Boundary Fixture

Goal: Cover the customs scenario where a rowspan-linked group lands near the
bottom of a page.

Completed:

- Added `product fixture — customs-rowspan-boundary` to `tablePagination.test.ts`.
- The fixture fills most of the first page, then places a table with a repeated
  header and a two-row rowspan group.
- Verifies the rowspan group moves to the next page as a unit, both linked rows
  remain on the same page, row order/geometry is contiguous, and
  `assertPaginatedDocument` passes.
- Updated `PRODUCT_SCENARIOS.md` to mark the fixture covered.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`

### Add Customs Basic Table Fixture

Goal: Turn the first customs product scenario fixture into an executable table
pagination regression test.

Completed:

- Added `product fixture — customs-basic-table` to `tablePagination.test.ts`.
- The fixture builds a multi-page customs-style table with `headerRowCount=1`
  and a footer paragraph containing an inline page number.
- Verifies table pagination spans at least two pages, the table header repeats
  on every table page, footer page numbers resolve on every table page, and
  `assertPaginatedDocument` passes.
- Converted `PRODUCT_SCENARIOS.md` fixture roadmap into a checked status list
  and linked covered fixtures to concrete tests.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/tablePagination.test.ts`
- `npm.cmd test`

### Add Report Cover TOC Body Fixture

Goal: Turn the report cover/TOC/body product scenario into an executable
multi-section regression test.

Completed:

- Added `product fixture — report-cover-toc-body` to `multiSection.test.ts`.
- The fixture builds a cover section, TOC section, and body section with
  `pageNumberStart=1`.
- Verifies three `PaginatedSection`s, body inline page number text (`หน้า 1`),
  TOC entries using restarted body page numbers, filled TOC lines, and
  `assertPaginatedDocument`.
- Updated `PRODUCT_SCENARIOS.md` so the fixture roadmap points to the concrete
  test coverage.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/renderer/__tests__/multiSection.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- renderer/__tests__/multiSection.test.ts`
- `npm.cmd test`

### Add Report Long Thai Paragraph Fixture

Goal: Turn the first product scenario fixture into an executable regression test.

Completed:

- Added `product fixture — report-long-thai-paragraph` to `paginator.test.ts`.
- The fixture uses a deterministic long Thai grapheme run, verifies it splits
  across multiple pages/fragments, joins all paginated line text back to the
  original source text, and passes `assertPaginatedDocument`.
- Updated `PRODUCT_SCENARIOS.md` so the fixture roadmap points to the concrete
  test coverage.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/__tests__/paginator.test.ts`

Verification:

- `npm.cmd run test -w packages/core -- pagination/__tests__/paginator.test.ts`
- `npm.cmd test`

### Sync Docs With Current Engine Contracts

Goal: Remove stale doc claims found during a quick docs-vs-implementation recheck.

Completed:

- Updated TOC docs to describe the current two-pass overflow repagination policy.
- Updated text editing docs to reflect the current textarea-owned inline edit path
  with live height/geometry tracking, instead of the older measured-line patch path.
- Added `pageNumber` to the documented `LineSegment.kind` contract.
- Clarified API/export boundary wording so it matches current route behavior.
- Updated stale page-number placeholder comments from `"0"` to `"00"`.
- Relaxed the paragraph fragment metadata type comment so it does not overclaim
  coverage for every paragraph placement path.

Files changed:

- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/TEXT_REFLOW_PLAN.md`
- `docs/WORK_LOG.md`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/schema/inline.ts`

Verification:

- `rg` stale-claim scan for old TOC/reflow/page-number wording.
- `npm.cmd test`

### Make Inline Shrink Move Column Siblings

Goal: Fix two inline-edit regressions: normal/edit wrapping drift after the overflow fix, and row/column preview height not shrinking when text is deleted.

Completed:

- Adjusted inline textarea wrapping from `overflow-wrap: anywhere` to `break-word`.
  - This still prevents long unbroken runs from escaping the edit box.
  - It is less aggressive than `anywhere`, so it stays closer to the core measured display wrapping.
- Fixed textarea height shrinking.
  - The height sync previously used the current fragment height as the minimum, so once a paragraph grew, deleting text could not reduce the reported height.
  - The minimum is now derived from one rendered line plus paragraph spacing.
- Fixed row/stack preview shrink inside columns.
  - When the edited paragraph changes height inside a stack, later sibling fragments in the same stack now shift by the paragraph height delta.
  - Row/stack height recomputation uses those adjusted sibling positions, so deleting lines can reduce the column preview instead of keeping the old content bottom.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Browser-checked the active column paragraph in `http://localhost:4000/editor`.

Notes:

- The current browser document appears to have a large authored row/stack minimum height after prior probing, so a reload can still show a tall empty column even when the paragraph itself is short. That is separate from the live delete/shrink preview path and should be handled as a row min-height UX/reset issue if it persists in normal use.

---

### Prevent Inline Text From Escaping Column Width

Goal: Stop long typed text from visually running outside the paragraph/column frame during inline editing.

Completed:

- Reproduced the active browser state where a long Thai run inside a column textarea could continue past the visible paragraph frame.
- Updated the inline edit textarea wrapping rule from normal overflow wrapping to `overflow-wrap: anywhere`.
  - This keeps long unbroken Thai/Latin runs inside the edit frame.
  - The setting better matches the core layout fallback that breaks overwide words into grapheme segments.
- Ran a multi-line probe in the browser and undid the temporary text afterward.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Browser-checked `http://localhost:4000/editor` at 206% zoom with the active column paragraph.

Notes:

- This fixes the horizontal escape while editing. Extremely tall row/column content is still governed by the current row/stack pagination policy, where rows are atomic and do not split independently yet.

---

### Keep Row/Stack Preview Height In Sync During Inline Edit

Goal: Fix the observed editor state where a paragraph inside a column grew taller than its parent row/stack preview until the page was reloaded.

Completed:

- Browser-inspected the live editor state and reproduced the visual mismatch:
  - The selected paragraph in column 1 had grown downward.
  - Its parent row/stack still displayed at the old shallow height.
- Confirmed a page reload recalculated the row correctly, which points to stale interactive preview geometry rather than core row pagination.
- Updated `resizeFragmentHeightAndShift` so inline edit height changes inside row/stack columns:
  - recompute the natural preview height for every stack in the row,
  - update the row height and all row stack heights together,
  - shift fragments below the row by the row height delta,
  - support both growth and shrink while respecting row `minHeight` and stack minimum height.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test -w packages/core -- rowStack`
- `npm.cmd test`
- Browser-checked `http://localhost:4000/editor`:
  - Reloaded the saved document and confirmed core pagination renders the row/stack at the tall paragraph height.
  - Typed additional long text into the column paragraph and confirmed the row/stack preview stayed aligned with the paragraph height.

Notes:

- This is still an editor preview guardrail. The long-term direction remains moving interactive layout behavior out of `EditorShell` into a clearer shared contract.

---

### Clarify Inline Edit Pagination Contract

Goal: Make inline edit exit reconcile from the latest document state instead of relying on a potentially stale blur-handler snapshot.

Completed:

- Documented the inline edit contract directly in `EditorShell`:
  - While editing, the textarea owns active paragraph text/caret wrapping.
  - The editor may apply geometry-only height shifts to prevent neighboring fragments from overlapping.
  - After edit mode exits, preview pagination settles from the latest rendered document snapshot.
- Changed `handleInlineEditEnd` to only leave edit mode and clear caret/page edit state.
- Added an effect that detects the transition from editing to not editing, then runs browser preview pagination from the current `previewDoc`.
- Cleared `inlineEditPageIndex` on edit end, Escape, split/merge focus transitions, mode switch, and resize/margin interactions so page-scoped edit state does not leak into later interactions.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Browser-tested inline edit exit:
  - Opened paragraph edit.
  - Added a temporary `settleprobe` marker.
  - Pressed Escape.
  - Confirmed the textarea closed and the marker remained after layout settle.
  - Reopened the paragraph and removed the marker.

Notes:

- This reduces one source of snap-back risk: blur/end edit no longer paginates from a callback closure that may predate the final input event.
- The broader long-term target remains extracting a dedicated interactive-layout contract/module out of the React shell.

---

### Add Pagination API Diagnostics

Goal: Make `/api/paginate` and export pagination failures actionable before continuing deeper core fixes.

Completed:

- Wrapped `paginateDocument(...)` in `/api/paginate` with explicit error handling.
  - Unexpected core pagination throws now return `{ error: "Pagination failed", detail }` instead of an opaque 500.
- Applied the same pagination error handling to `/api/export`.
- Updated the editor's authoritative pagination fetch to include the response body in the thrown error.
  - Console errors now include API detail instead of only `paginate failed: 500`.

Files changed:

- `src/app/api/paginate/route.ts`
- `src/app/api/export/route.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Posted a minimal valid document to `http://localhost:4000/api/paginate`; route returned `200`.

Notes:

- The current browser document no longer showed the earlier `layout error` badge during this pass, so the original failing document was not available to reproduce directly.
- Browser-use blocks `javascript:` URLs, so localStorage extraction from the page was intentionally not pursued further.
- If the badge appears again, the browser console should now include the exact API error body needed to build a focused core regression.

---

### Add Editor Zoom Controls

Goal: Add usable zoom controls to the editor canvas without fighting the existing auto-fit behavior.

Completed:

- Added toolbar zoom controls:
  - `-` zoom out
  - percent button resets to 100%
  - `+` zoom in
  - `Fit` returns to auto-fit page width
- Added keyboard shortcuts outside text inputs:
  - `Ctrl/Cmd + +` zoom in
  - `Ctrl/Cmd + -` zoom out
  - `Ctrl/Cmd + 0` reset to 100%
- Hooked `Ctrl/Cmd + wheel` to document zoom.
  - The editor prevents the browser's default page zoom while the pointer is inside the editor.
  - Text inputs and textareas keep their native wheel behavior.
  - A non-passive native wheel listener is used so `preventDefault()` is honored reliably.
- Split zoom behavior into `fit` and `manual` modes.
  - Auto-fit now only runs while `Fit` mode is active.
  - Manual zoom is not overwritten by `ResizeObserver`.
- Adjusted zoom to feel like document zoom:
  - Increased zoom step for clearer visual feedback.
  - Raised max zoom to 400%.
  - Made the canvas stage size track the scaled page width so larger zoom levels create real canvas scrolling.
  - Kept pages centered while they still fit within the viewport.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Browser-tested zoom on `http://localhost:4000/editor`:
  - Fit scale showed `56%` with page width `334`.
  - First `+` changed page width to `481.95` (`81%`).
  - Second `+` changed page width to `630.7` (`106%`) and made canvas scrolling visible.
  - Percent reset changed page width to `595` (`100%`).
- Added Ctrl/Cmd-wheel hook after the browser test. Automated wheel-modifier simulation did not trigger in the in-app browser tool, so this path is covered by type-check/test plus implementation review.

Notes:

- Zoom range is currently clamped to 30%-400%.
- The controls are intentionally compact to fit the current dense editor toolbar.

---

### Tune Paragraph Edit Chrome Spacing

Goal: Make inline paragraph edit mode feel visually closer to normal paragraph rendering while giving the edit outline a little breathing room.

Completed:

- Anchored edit text to the core fragment text origin.
  - The textarea `foreignObject` now expands 3px left and right.
  - The textarea receives matching 3px horizontal padding, so the text origin remains aligned with the normal paragraph render.
- Added `display: block` to the textarea to avoid inline element baseline quirks inside `foreignObject`.
- Kept paragraph `spacingBefore` and `spacingAfter` as the vertical padding source.
- Prevented edit-mode height from growing on click/focus alone.
  - Focus and selection now only reset textarea scroll.
  - Textarea height sync runs only after input has established an explicit edit height.
  - This avoids the first click into a paragraph adding a blank extra line because native textarea `scrollHeight` is slightly larger than the core fragment height.
- Set the inline edit textarea to `rows={1}`.
  - Native textarea defaults to two rows, which made a one-line paragraph jump to a two-line `scrollHeight` on the first input event.
  - This was the cause of a one-line paragraph gaining a confusing extra line while typing.
- Stopped core/browser pagination from reflowing the active paragraph while inline editing.
  - The active paragraph now treats the textarea as the UX truth until edit ends.
  - The editor no longer patches active paragraph lines/heights with core-measured lines on every input.
  - The debounced full browser pagination now skips while an inline editor is active.
  - On blur/end edit, the document is paginated once to reconcile back to core layout.
- Added vertical editor chrome for paragraph blocks without changing document layout.
  - Normal paragraph background/selection chrome now extends 3px above and below the core fragment.
  - Edit `foreignObject` extends 3px above and below the core fragment with matching textarea vertical padding.
  - Text origin remains anchored to the core layout position; only the editor chrome gets breathing room.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 260 core tests + 16 app tests.
- Browser-use verification on `http://localhost:4000/editor`:
  - Single-clicked a visible Thai paragraph and confirmed inline edit opened.
  - Confirmed textarea style includes `padding: 0px 3px 5.32437px`.
  - Confirmed the edit `foreignObject` width expands beyond the original fragment while the text remains the same active paragraph.
  - Single-clicked a long wrapped paragraph and confirmed initial edit height stayed at the core fragment height (`77.20`) on entry instead of growing immediately.
  - Confirmed edit chrome now reports vertical breathing room (`padding: 3px 3px 8.32437px`) and a taller `foreignObject` while preserving the active paragraph text.
  - Confirmed a one-line Thai paragraph stays at height `23.30` after typing one character and returns to the same height after Backspace.
  - Confirmed typing a long marker in a one-line paragraph grows the textarea from `23.30` to `47`, remains stable after waiting beyond the old 200ms pagination debounce, and returns to `23.30` after Backspace cleanup.

Notes:

- The chosen anchor is the core fragment text origin. The edit outline is allowed to be slightly wider than the render fragment, but the editable text should not shift horizontally.

---

### Single-Click Paragraph Editing

Goal: Make paragraph editing feel more document-like by entering inline edit on a single click, while preserving drag behavior through the existing movement threshold.

Completed:

- Added a pending click action to document-fragment pointer handling.
  - Paragraph pointer down now records the clicked caret position and page index.
  - If the pointer is released without exceeding the drag threshold, the paragraph enters inline edit immediately.
  - If the pointer moves more than the existing 5px threshold, the same pending interaction becomes a drag as before.
- Kept non-paragraph nodes on the existing click-to-select behavior.
- Left double-click edit support in place as a harmless fallback.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 260 core tests + 16 app tests.
- Browser-use verification on `http://localhost:4000/editor`:
  - Single-clicked the visible Thai paragraph `ดกดกดกด`.
  - Confirmed one active `foreignObject textarea` opened immediately with text `ดกดกดกด`.
  - Pressed Escape and confirmed the inline editor closed.

Notes:

- Drag still depends on the existing pointer movement threshold. A later UX pass could add explicit drag handles if single-click editing makes direct paragraph dragging feel too easy to trigger accidentally.

---

### Stabilize Inline Edit Reflow While Typing And Deleting

Goal: Fix inline editing drift where multi-line paragraphs could show duplicated/misplaced lines and deletion did not always reflow immediately when a visual line disappeared.

Completed:

- Removed the editor's partial head/tail paragraph reflow path during inline editing.
  - The previous path reused head lines but called `measureParagraphFrom`, which re-measures from the containing hard line rather than the exact visual line.
  - For wrapped multi-line paragraphs, that could append already-rendered content again and make typed text placement drift.
- Kept immediate local reflow, but now it re-measures the active paragraph as a whole on every text change.
  - This is simpler and matches the current core measurement contract.
  - Hard events still trigger immediate full browser pagination when line count changes, so deleting enough text to remove a line should shift surrounding fragments without waiting for the debounce.
- Preserved the caret tracking and edit-start line-count baseline added for the flicker regression.
- Allowed the active edit fragment height to shrink as well as grow.
  - The editor previously kept the maximum height seen during the edit session, which left empty visual lines after deleting text.
- Reset textarea internal scroll after focus/input/selection.
  - The textarea text is transparent while SVG text is visible; stale textarea scroll can make the caret appear on the wrong visual line even when the stored text/caret index is correct.
- Changed active inline editing to render visible text from the textarea instead of from the SVG line overlay.
  - The previous design mixed two wrapping engines: SVG/core lines for visible text and browser textarea wrapping for caret/selection.
  - Thai word wrapping can differ between those layers, causing the caret to look like it is on the right column but wrong line, and causing typed text to appear to jump between lines.
  - During edit mode, textarea is now the visual source so caret, selection, and text rendering stay in the same browser layout model.
- Let the editing foreignObject grow to the textarea's `scrollHeight` while typing.
  - This prevents the native caret/text layer from clipping when browser wrapping temporarily needs more height than the core preview fragment.
- Fixed textarea content-height measurement so Backspace can shrink the editor again.
  - `syncTextareaHeight` now temporarily sets the textarea height to `auto` before reading `scrollHeight`.
  - Without this, a `height: 100%` textarea could report the old stretched height, leaving empty lines after deletion.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 260 core tests + 16 app tests.
- Browser-use verification on `http://localhost:4000/editor`:
  - Opened the user's current local document and reproduced the editor state with a long Thai paragraph.
  - Confirmed the active editor is now a single `foreignObject textarea` with visible text color instead of transparent text.
  - Typed into the active paragraph and confirmed text stayed in the textarea/editor path; removed the temporary typed text after verification.
  - Ran a Backspace shrink probe:
    - Added a long temporary marker to the active paragraph and confirmed `foreignObject` height grew from `65.22` to `280.86`.
    - Pressed Backspace for the full marker length and confirmed the marker was removed, text returned exactly, and height shrank back to `65.22`.

Notes:

- This is a correctness-first fix. If paragraph-level reflow later needs to be optimized again, it should use a core API that returns a true visual-line tail, not a hard-line tail.
- The user's current local document still reports `/api/paginate` layout assertion failure (`layout error` badge). The browser preview remains usable, but server/authoritative pagination should be investigated separately.
- Follow-up browser observation: editing now keeps caret/text together, but there can still be a perceptible snap between textarea wrapping during edit mode and SVG/core wrapping after blur. That is a remaining layout-model mismatch, not the previous caret-layer corruption.

---

### Prevent Inline Edit Enter From Triggering Reflow

Goal: Reduce flicker when clicking into an existing paragraph for inline editing without changing text.

Completed:

- Updated the editor local reflow effect so it runs on `previewDoc` changes only.
  - Entering edit mode by changing `inlineEditNodeId` no longer re-measures and patches paragraph lines immediately.
  - Text changes still update `previewDoc`, so local reflow still runs while typing.
- Updated the authoritative pagination effect so it also runs on `previewDoc` changes only.
  - Clicking into or out of edit mode no longer schedules a server pagination request by itself.
  - Existing refs still let scheduled pagination see the current edit state when text changes.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 260 core tests + 16 app tests.

Notes:

- This specifically targets the "click paragraph, it flashes/re-renders, then returns" behavior caused by edit-mode state changes triggering layout work without document changes.
- Browser/local reflow remains an approximation while typing; the next larger cleanup is still to extract an explicit interactive layout contract.

---

### Guard Plain-Text Paragraph Operations

Goal: Prevent plain textarea-style operations from corrupting paragraphs that contain structured inline nodes such as `fieldRef` or `pageNumber`.

Completed:

- Added plain-text paragraph safety helpers in `operations.ts`.
  - A paragraph is editable by these operations only when every child is a text run.
  - Plain text updates collapse multiple text runs into a single text run.
  - Mixed inline paragraphs are left unchanged by `updateParagraphText`.
- Guarded `splitParagraphAtIndex`.
  - Splits only plain-text paragraphs.
  - Uses the full concatenated text across text runs.
  - Produces single-text-run paragraph fragments.
  - Mixed inline paragraphs no-op and return `newNodeId: ""`.
- Guarded `mergeParagraphWithPrevious`.
  - Merges only when both current and previous paragraphs are plain text.
  - Uses the full concatenated text of both paragraphs.
  - Produces one text run in the merged paragraph.
  - Mixed inline paragraphs return `null`.
- Preserved table plain-text editing.
  - Plain text paragraphs inside `table.nodes` can still be updated.
  - Mixed inline table paragraphs are protected by the same guard.
- Added operation unit tests covering plain text, multiple text runs, `fieldRef`, `pageNumber`, split, merge, and table paragraph updates.

Files changed:

- `packages/core/src/document/operations.ts`
- `packages/core/src/document/operations.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 260 core tests + 16 app tests.

Notes:

- This is a temporary safety policy, not the final segmented inline editor model.
- Plain textarea editing remains disabled by behavior for mixed inline paragraphs because the underlying operation no-ops. A later UI pass should make that policy visible before edit mode starts.
- Split/merge for table-internal paragraphs still needs a path-aware operation model; this patch only prevents corrupting mixed inline body paragraphs and keeps table plain-text updates safe.

---

### Rewrite Product Scenarios As Fixture-Oriented Specs

Goal: Make `PRODUCT_SCENARIOS.md` sharper and more useful as a product/testing guide, so scenarios can drive fixtures, acceptance checks, and renderer decisions.

Completed:

- Rewrote `PRODUCT_SCENARIOS.md` from broad narrative into fixture-oriented scenario specs.
- Added a scenario quality bar explaining what each product scenario should answer.
- Expanded `ใบขน (Customs Declaration Form)` with:
  - user goal and primary users
  - template shape
  - representative data
  - required engine capabilities
  - pagination expectations
  - export expectations
  - acceptance checks
  - known acceptable limitations
- Expanded `รายงานราชการ (Government Report)` with the same structure, including cover/TOC/body sections, `pageNumberStart=1`, TOC expectations, PDF/DOCX expectations, and DOCX structural checks.
- Added a cross-scenario comparison table.
- Added a fixture roadmap for future regression fixtures.
- Added a decision rule for resolving product/engine trade-offs against the two scenarios.

Files changed:

- `docs/PRODUCT_SCENARIOS.md`
- `docs/WORK_LOG.md`

Verification:

- Reviewed the rewritten markdown for structure and consistency.
- No code changed; test suite not run for this documentation-only update.

Notes:

- The fixture roadmap intentionally names future test targets but does not create the fixtures yet.
- This document can now guide the next docs pass, especially `ARCHITECTURE.md`, `RENDERER_CONTRACT.md`, and a future fixture catalog.

---

### Preserve DOCX Multi-Section And Page Boundaries

Goal: Make DOCX export preserve structural section/page boundaries from `PaginatedDocument` instead of flattening all pages into one Word section.

Completed:

- Updated `DocxRenderer` to build one DOCX section per paginated page.
  - Each generated section receives that page's width, height, orientation, and margins.
  - Non-first generated sections use `SectionType.NEXT_PAGE`, preserving page boundaries in Word.
  - Headers and footers are built from each page's resolved header/footer fragments.
  - Empty pages receive a blank paragraph so the generated DOCX section is valid.
- Hardened DOCX grouping for continuation table fragments:
  - When a page contains table-row/table-cell continuation fragments without a table root fragment, the renderer creates a page-local table group from the parent table id.
  - This prevents continuation table rows from being mistaken for layout rows.
- Added DOCX structural tests that inspect `word/document.xml`:
  - Two document sections now emit two Word `<w:sectPr>` entries.
  - A multi-page document emits one Word section per paginated page.

Files changed:

- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/renderer/__tests__/multiSection.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 252 core tests + 16 app tests.

Notes:

- DOCX remains a structural/exchange renderer, not a pixel-perfect renderer. Word/LibreOffice can still reflow text and tables differently from PDF/editor preview.
- The renderer now preserves explicit section/page boundaries structurally; more advanced DOCX fidelity such as native repeated table headers, hard-newline preservation, and empty paragraph semantics can be handled in later focused passes.

---

### Recheck Docs Against Implementation And Fix Integration Bugs

Goal: Recheck the implementation against the layout/text engine docs and fix concrete mismatches that were likely causing editor and pagination bugs.

Completed:

- Fixed table-cell paragraph inline editing:
  - `ParagraphTextSurface` now finds paragraphs inside `table.nodes`, so opening a table-cell editor no longer starts from an empty textarea.
  - `EditorShell` local reflow now finds table-cell paragraphs, so typing in table cells can update the preview without waiting only for server pagination.
- Fixed `normalizeDocument` dropping authored props:
  - Preserves paragraph `headingLevel`.
  - Preserves paragraph `keepWithNext`.
  - Preserves row `minHeight`.
- Fixed breakable table row pagination:
  - Shorter cells that finish on an early slice are advanced to the end, preventing duplicated cell content on continuation pages.
  - Repeating table headers are inserted on continuation pages created inside `allowBreak` row splitting.
- Fixed page-number consistency:
  - Header/footer page-number fields are resolved per page and respect `pageNumberStart`.
  - TOC entries now use section-restarted page numbers instead of raw global page indices.
- Fixed placement integration:
  - Palette `table` sources are no longer treated as row-like by placement law.
  - Row hit geometry now advances stack rects by `gap`, matching layout geometry.
  - Field insertion can resolve table-internal paragraph fragments and insert field refs into them.
- Hardened API/export UX:
  - `/api/paginate` and `/api/export` return `400` for malformed JSON bodies.
  - Export UI checks `res.ok` before downloading, so JSON error responses are no longer saved as `.pdf`/`.docx` files.
- Updated checklist status for table-cell live preview.

Files changed:

- `packages/core/src/document/normalize.ts`
- `packages/core/src/document/operations.ts`
- `packages/core/src/document/normalize.test.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `packages/core/src/pagination/__tests__/sectionPageNumbers.test.ts`
- `packages/core/src/placement/law.ts`
- `packages/core/src/placement/geometry.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/api/paginate/route.ts`
- `src/app/api/export/route.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd test` passed — 250 core tests + 16 app tests.

Notes:

- Vitest still needs to run outside the sandbox in this environment; inside the sandbox it fails during Vite config loading with `spawn EPERM`.
- DOCX still has known structural limitations: it flattens paginated output more than the docs ultimately want. That was left for a separate, focused pass.
- Split paragraph continuation editing is improved from previous work but still needs manual UX testing around caret/Enter/Backspace behavior.

---

### Add Incremental Reflow From Edited Line + Alignment Fix in Editor

Goal: Make the editor's local reflow re-measure only from the caret's line forward instead of the full paragraph, and fix alignment in editor-side line building.

Completed:

- Added `buildParagraphFullText(node)` helper in `measure.ts` — extracts full text, fieldRanges, pageNumberRanges from a ParagraphNode. Shared between `measureParagraph` and `measureParagraphFrom`.
- Added `measureHardLines(fullText, ..., fromOffset)` internal helper — skips hard lines ending before `fromOffset`, measures from the containing hard line onward. Fixed skip condition to `hardLineEnd < fromOffset` (no extra conditions needed).
- Added `export function measureParagraphFrom(node, fromOffset, width, measurer, wb)` — returns `{ tailLines: MeasuredLine[], lineHeight }`. Exported from layout/index.ts via `export * from "./measure"`.
- Refactored `measureParagraph` to use the shared `buildParagraphFullText` + `measureHardLines` helpers (no behavior change).
- Updated `EditorShell.tsx`:
  - Imported `measureParagraphFrom` and `MeasuredLine`.
  - Fixed `buildLocalLines` to apply alignment offset (center/right) matching `buildPaginatedLines` behavior.
  - Added `findCaretLineIndex(lines, caretIndex)` — finds which paginated line contains the caret (via segment offsets).
  - Added `buildTailLines(tailMeasured, headLines, fragmentX, align, fragmentWidth)` — positions tail lines from the Y position after the last head line.
  - Updated local reflow effect: when `caretLineIndex > 0`, reuses existing head lines and calls `measureParagraphFrom` for the tail; falls back to full `measureParagraph` when caret is on the first line.
  - Updated height computation in `replaceFragmentLines` call to use `newTotalHeight = fragment.height - existingLineHeight + newLineHeight` (spacing preserved).
- Cleaned up stale duplicate entry: marked `[ ] Widow/orphan control` in Later Work as `[x]` (done as Stage 2).
- Added 5 tests for `measureParagraphFrom` in `measure.test.ts`.

Files changed:

- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/__tests__/measure.test.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 244 core + 16 app = 260 tests passed.

Notes:

- `measureParagraphFrom` works at the hard-line granularity, not at the individual wrapped-line level. If the caret is within a long hard line that wraps many times, the entire hard line is re-measured. This is correct (wrapping is sequential within a hard line) and still saves measurement time when earlier hard lines are unchanged.
- The incremental path activates only when `caretLineIndex > 0` (caret is not on the very first line). First-line edits fall back to full measurement — already fast in practice.

---

### Implement Justify Alignment

Goal: Complete the paragraph alignment implementation by supporting `justify` — non-last lines stretch to fill the fragment width by distributing extra space between word segments.

Completed:

- Added `justifySegments(segments, lineWidth, fragmentWidth)` helper in `paginator.ts`. Counts space segments, computes `extra = (fragmentWidth - lineWidth) / spaceCount`, and adjusts each segment's x and width cumulatively. Segments with no spaces (unbreakable lines) are returned unchanged.
- Added `isLastFragment: boolean = true` parameter to `buildPaginatedLines`. For `align === "justify"`, only non-last lines of the last fragment are justified — the very last line of the paragraph is left-aligned (standard typographic rule).
- Updated `paginateParagraph`: fast path passes `isLastFragment = true`; split path passes the computed `isLastFragment` from the while loop.
- Updated PDF renderer (`renderer/pdf/index.ts`): when `align === "justify"` and line has segments, draws each non-space word segment individually at `line.x + seg.x`. Skips space segments (gap comes from x positions).
- Updated SVG `renderLine` in `ParagraphTextSurface.tsx`: when `align === "justify"` and line has segments, renders each non-space segment as a separate `<text>` element at `(line.x + seg.x) * scale`.
- Added 3 justify tests to `textFlow.test.ts`: non-last lines have segments stretched to fill fragmentWidth, last line is not stretched, assertPaginatedDocument passes.
- Imported `LineSegment` type in `paginator.ts` (needed for `justifySegments`).

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/renderer/pdf/index.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `packages/core/src/renderer/__tests__/textFlow.test.ts`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 239 core + 16 app = 255 tests passed.

Notes:

- Justify works for English (space-separated words). Thai text with no space segments between words will fall back to left-alignment for those lines (correct behavior — Thai spaces are typically between phrases, not words).
- Lines within a split paragraph (non-last fragments) are all justified since they're mid-paragraph lines, not terminal lines.

---

### Fix Paragraph Alignment in Paginated Output

Goal: Bake text alignment offset into PaginatedLine.x so all renderers (PDF, DOCX, editor SVG) consume the correct visual position without recomputing it independently.

Completed:

- Modified `buildPaginatedLines` in `paginator.ts` to accept `align` and `fragmentWidth` params. For center: `x = fragmentX + (fragmentWidth - line.width) / 2`. For right: `x = fragmentX + fragmentWidth - line.width`. For left/justify: `x = fragmentX` (unchanged). Justify is left-aligned at this layer (word-spacing not yet implemented).
- Updated all 6 call sites to pass `node.props.align` and the appropriate fragment width: `paginateParagraph` fast path, split path; `measureParagraphFragment`; `pushStackContents`; `pushTableCellContents`; `pushCellSlice`.
- Simplified `lineVisualLeft` in `EditorCanvas.tsx` to `return line.x` — alignment offset already in line.x.
- Updated `ParagraphTextSurface.tsx`: `lineX(line, align)` uses `line.x` as base (`line.x + width/2` for center, `line.x + width` for right); `lineVisualLeft(line)` simplified to `return line.x`.
- Updated `textFlow.test.ts` alignment tests to assert correct x values: right x = contentX + contentWidth - textWidth, center x = midpoint offset. Added 2 new tests (5 alignment tests total). Updated commentary to document fix.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `packages/core/src/renderer/__tests__/textFlow.test.ts`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 236 core + 16 app = 252 tests passed.

---

---

### Split Paragraph Inline Editing — Partial Fix [IN PROGRESS]

Goal: Fix visual issues when clicking to edit a paragraph that spans multiple pages (flicker, wrong fragment activated, caret at wrong position).

Completed so far:

- Fix 1: Removed `inlineEditNodeId` from full browser pagination `useEffect` deps. Effect now uses `inlineEditNodeIdRef.current` for debounce time only. Entering edit mode no longer triggers browser re-pagination → eliminates the flash caused by browser measurer drift.
- Fix 2: Added `inlineEditPageIndex` state to `EditorShell`. `EditorCanvas` passes `f.pageIndex` through `onInlineEditStart`. `findParagraphFragment` matches by pageIndex. `replaceFragmentLines` patches only the specific-page fragment. `PageView` receives `inlineEditPageIndex` prop.
- Fix 3: `isInlineEditing` in `EditorCanvas` now requires `f.pageIndex === inlineEditPageIndex` so only the clicked fragment enters edit mode — other fragments of the same split paragraph remain in display mode and keep pointer events enabled.
- Fix 4: Local reflow skips split paragraphs (`isSplitParagraph` guard checks if `paginatedRef` has >1 fragment for the nodeId). Prevents all-lines-on-one-page visual corruption.
- Fix 5: `ParagraphTextSurface` detects continuation fragments via `fragment.continuesFrom`. For continuation fragments, textarea uses `fullText.slice(continuationCharStart)` as value (where `continuationCharStart = fragment.lines[0]?.segments?.[0]?.start`). `initialCaretIndex` is adjusted by subtracting `continuationCharStart`. `onChange` prepends `preText` to reconstruct full text. Live text overlay disabled for continuation fragments.

Still open:
- Caret positioning and overall edit UX on continuation fragments needs further testing and may need additional refinement.
- Split/merge paragraph (Enter/Backspace) behavior for continuation fragments not handled.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 244 core + 16 app = 260 tests passed.

---

### Fix Flicker When Editing Split Paragraphs

Goal: Eliminate the visible flicker/blink when clicking to edit a paragraph that spans multiple pages, and ensure the inline editor is positioned over the correct page fragment.

Completed:

- **Root cause**: `inlineEditNodeId` was in the dependency array of the full browser pagination `useEffect`. Entering edit mode changed `inlineEditNodeId`, triggering immediate browser re-pagination. Browser measurer drift caused the split paragraph to briefly appear as one page, then server pagination corrected it → flicker.
- **Fix 1**: Removed `inlineEditNodeId` from the pagination effect deps. The effect now only fires when `previewDoc`, `editorTextMeasurer`, or `fontReadyVersion` changes (i.e., when text actually changes). The existing `inlineEditNodeIdRef.current` is used for debounce time calculation instead.
- **Fix 2**: Added `inlineEditPageIndex: number | null` state to `EditorShell`. `EditorCanvas` now passes `f.pageIndex` as the third argument to `onInlineEditStart`. `handleInlineEditStart` stores this as `inlineEditPageIndex`.
- Updated `findParagraphFragment` to accept optional `pageIndex` — when provided, only returns the fragment on that specific page (not always the first fragment).
- Updated `replaceFragmentLines` to accept optional `pageIndex` — when provided, only patches the fragment on that page (continuation fragments on other pages are left unchanged).
- Threaded `inlineEditPageIndex` through the local reflow effect (`findParagraphFragment` and `replaceFragmentLines` calls).
- Added checklist section "Cross-Page & Table Editing Improvements" to `LAYOUT_ENGINE_CHECKLIST.md` with 3 items. Marked this item as `[x]`.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 244 core + 16 app = 260 tests passed.

Notes:

- The fix correctly handles both the first fragment (page 1) and continuation fragments (page 2+). When a user clicks on page 2, `inlineEditPageIndex=1` is stored, the textarea is positioned over the page 2 fragment, and local reflow patches only that fragment's lines.
- Authoritative server pagination still runs normally when text changes (previewDoc changes). Only the browser re-pagination on edit mode enter/exit is suppressed.

---

## 2026-05-09 (continued)

### Add PDF/DOCX Text Flow Smoke Tests

Goal: Verify that text layout properties (line content, spacing, alignment, column positions) are correctly represented in PaginatedDocument, and that PDF/DOCX renderers consume these correctly.

Completed:

- Ticked parent "Keep server/export pagination authoritative" item — all sub-items were already `[x]`.
- Created `packages/core/src/renderer/__tests__/textFlow.test.ts` with 19 tests:
  - **Line content** (4): short text → 1 line preserved, hard newlines → correct text per line, 120-char text wraps with text preserved, empty paragraph → 1 empty line.
  - **Spacing** (4): spacingBefore adds to fragment height, spacingAfter adds to fragment height, spacingBefore shifts first line y, two-paragraph stacking with spacingAfter is contiguous.
  - **Alignment** (3): left line x = contentX, renderProps.align carries setting to renderer, center/right pass assertPaginatedDocument. Revealed a known limitation: alignment offset is not stored in `line.x` — PDF renderer always renders left-aligned; editor SVG and DOCX apply alignment independently at render time. Documented in checklist. Future fix: bake offset into `buildPaginatedLines`.
  - **Column layout** (2): two equal columns have correct x/width, left-column line x matches column fragment x, assertPaginatedDocument passes.
  - **Renderer smoke** (6): PDF and DOCX render without throwing for spacing+alignment, wrapped text, two-column, and hard-newline documents.

Files changed:

- `packages/core/src/renderer/__tests__/textFlow.test.ts` (new)
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 234 core + 16 app = 250 tests passed.

Notes:

- Alignment limitation is pre-existing: `line.x` = fragment left edge regardless of align setting. EditorCanvas computes visual x via `lineVisualLeft(line, fragment, renderProps.align)`. PDF uses `line.x` directly (left-aligned output). DOCX sets Word paragraph alignment via `renderProps.align`. Fix deferred — requires updating `buildPaginatedLines` and EditorCanvas.

---

## 2026-05-09

### Define and Implement TOC Overflow Policy

Goal: Fix silent TOC overflow where generated TOC entries exceed the placeholder height, causing content overlap with no warning.

Completed:

- Chose two-pass repagination policy: Pass 1 paginates with estimated TOC height; if actual TOC content is taller, Pass 2 repaginates with corrected height so Y positions of all content below the TOC are correct.
- Exported `TOC_TITLE_FS`, `TOC_TITLE_LH`, `TOC_TITLE_AFTER` from `layout/flow.ts` (were previously local constants). Removed duplicate definitions from `fillTocFragments` in `paginator.ts`.
- Added `tocHeightOverrides?: Map<string, number>` parameter to `flowSection`, `flowNode`, `flowVerticalContainer`, and `flowRow` in `flow.ts`. In `case "toc"`: height uses override if present, estimated height otherwise.
- Added `paginateSection` `tocHeightOverrides` parameter, passed through to `flowSection`.
- Added `computeTocActualHeight(entries, node)` — computes actual height from title + filtered TOC entries.
- Added `computeTocOverrides(sections, doc, entries)` — finds all TOC fragments where actual > placeholder and returns nodeId→height map.
- Extracted `runAllSections(doc, measurer, wb, overrides?)` helper to avoid code duplication between the two passes.
- Refactored `paginateDocument` to: (1) run Pass 1, collect entries, compute overrides; (2) if overrides exist, run Pass 2 with corrected heights, collect entries again (correct page numbers), fill TOC; (3) otherwise fill directly from Pass 1.
- Created 6 tests in `tocOverflow.test.ts` covering: no-overflow single-section (estimate correct), overflow grows fragment height, lines don't exceed fragment bottom (0.5pt epsilon), entries have correct page numbers from pass 2, assertPaginatedDocument passes, exact-match single-entry (max(0,1) boundary).

Files changed:

- `packages/core/src/layout/flow.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tocOverflow.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 174 core + 12 app = 186 tests passed.

Notes:

- Only two passes are performed even if Pass 2 shifts page numbers enough that entries spill further. In practice this is extremely unlikely since the second overflow requires the TOC to grow again after repagination. Documented as known limitation.
- The fix also resolves a pre-existing mismatch: `countHeadings` counted only local-section headings while `fillTocFragments` collected from all sections. Two-pass now handles multi-section documents correctly.

---

### Add Paragraph Split Decision Trace

Goal: Allow callers to observe the split decisions made during pagination — useful for debugging layout issues, building editor overlays, and verifying widow/orphan policy behavior in tests.

Completed:

- Added `ParagraphSplitDecision` interface to `pagination/types.ts` with 9 fields: `nodeId`, `pageIndex`, `fragmentIndex`, `lineCount`, `availableHeight` (space available when decision was made), `fragmentHeight`, `isSplit` (false = fast path, whole paragraph fit), `forcedProgress` (true when 1 line was forced), `orphanPrevented` (true when orphan prevention moved to new page before this fragment), `widowPrevented` (true when widow prevention reduced count by 1).
- Added optional `onSplitDecision?: (d: ParagraphSplitDecision) => void` to `paginateDocument`. Threaded through `runAllSections`, `paginateSection`, `paginateFlowBox`, `paginateVerticalContainer`, `paginateParagraph`. When omitted, no allocations occur — zero cost in production.
- Emitted in fast path (one decision per whole-paragraph fragment) and once per placed fragment in the split loop. `orphanPrevented` flag is reset to false after emitting so it only appears on the fragment placed after the advance, not on all subsequent fragments.
- Added import of `ParagraphSplitDecision` to `paginator.ts`.
- Created 9 tests in `splitTrace.test.ts` covering: fast-path fields, split emits per fragment, fragmentIndex ordering, total lineCount preservation, availableHeight/fragmentHeight positivity, orphanPrevented flag, widowPrevented flag with lineCount verification, multi-paragraph emission.

Files changed:

- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/splitTrace.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 214 core + 16 app = 230 tests passed.

---

### Multi-Section Export Smoke Tests

Goal: Verify that multi-section documents (the รายงานราชการ pattern) paginate correctly and render to PDF/DOCX without throwing, covering the new section page numbering and sparse-pages bug fix.

Completed:

- Created `packages/core/src/renderer/__tests__/multiSection.test.ts` with 10 tests:
- **Pagination structure** (5 tests): two-section doc produces 2 PaginatedSections; each section's pages array is dense (no undefined entries after sparse-pages fix); page number restart (pageNumberStart=1 on section 2) resolves inline pageNumber nodes correctly; TOC section + content section fills TOC entries with heading text; 3-section doc passes assertPaginatedDocument.
- **PDF smoke** (3 tests): two-section, TOC + content, page restart — all produce valid `%PDF` header. Use ASCII text since Helvetica fallback (no FontProvider in tests) cannot encode Thai.
- **DOCX smoke** (2 tests): two-section, TOC + content — both produce valid PK ZIP header.
- `makeTocSection` helper accepts an optional `title` param (default "Contents" for ASCII tests; Thai tests in pagination-only tests can pass "สารบัญ").

Files changed:

- `packages/core/src/renderer/__tests__/multiSection.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 205 core + 16 app = 221 tests passed.

---

### Section-Level Page Numbering and Restart Rules

Goal: Allow each document section to restart page numbering independently, enabling รายงานราชการ patterns where a TOC section uses one numbering sequence and the body section starts fresh at page 1.

Completed:

- Added `pageNumberStart?: number` to `PageSettingsSchema` in `schema/document.ts`. When set, the section's `pageNumber` inline nodes resolve to display numbers starting from `pageNumberStart` instead of continuing the global page index.
- Computed `pageNumberOffset = pageNumberStart - startPageIndex - 1` in `paginateSection`. Stored on `PageFlowCursor` as `pageNumberOffset: number` (default 0 = global numbering).
- Added `pageNumberOffset` to `PageFlowCursor` interface in `pagination/types.ts`. `advancePage` now preserves the offset in the returned cursor.
- Threaded `pageNumberOffset` through all five `resolvePageNumbers` call sites: `paginateParagraph` fast path, `paginateParagraph` split path, `pushStackContents` (new optional param, default 0), `pushTableCellContents` (new optional param, default 0), `pushCellSlice` (new optional param, default 0).
- **Bug fixed (sparse pages array)**: `paginateSection` was using global `pageIndex` as the section-local array index, leaving sparse holes at the front for non-first sections. This caused crashes when iterating pages and incorrect first-page header detection (`isFirst = idx === 0` was wrong for non-zero start). Fixed by densifying the array with `pages.filter(p => p != null)` before header/footer assignment and return.
- Created 5 tests in `sectionPageNumbers.test.ts`: global numbering (default, no restart), second section restarts at 1, first section starts at 5, explicit pageNumberStart=1 matches default, assertPaginatedDocument passes for all variants.

Files changed:

- `packages/core/src/schema/document.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/sectionPageNumbers.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 195 core + 16 app = 211 tests passed.

Notes:

- The sparse array bug affected multi-section documents silently before this fix: iterating a non-first section's pages would encounter undefined entries, and first-page header detection was wrong. All existing multi-section tests still pass because they didn't iterate section pages directly.

---

### Extend comparePagination for Continuation Boundaries

Goal: Make split-paragraph drift visible as a first-class concept so callers can distinguish between line-count drift, page movement, and split-boundary drift.

Completed:

- Extended `FragmentSnapshot` (internal) with `fragmentCount` and `splitBoundaries` (the `lineStart` of each continuation fragment, i.e. where the paragraph was cut).
- Added 4 fields to `FragmentDrift`: `browserFragmentCount`, `serverFragmentCount`, `continuationChanged` (true when fragment count differs between browser and server — a split was added or removed), `splitBoundaryMoved` (true when same fragment count but split points differ).
- Added `continuationChangedCount` to `DriftReport` — total number of paragraphs where a split was added or removed.
- Updated `comparePagination` filter: drift entries are now also added when `continuationChanged` or `splitBoundaryMoved` is true, even if `lineDelta === 0` and `pageMovement === false`.
- Added `arraysEqual` helper for comparing split boundary arrays.
- Uses new `lineStart` fragment metadata for accurate boundary tracking; falls back to cumulative `lineCount` for fragments without metadata.
- Updated `makeDoc` test helper to accept optional `lineStart` field on fragments.
- Added 4 new tests in `comparePagination.test.ts`: continuationChanged (browser 1 frag, server 2 frags), splitBoundaryMoved (same count, different split point), no drift when both sides match, continuationChangedCount with multiple paragraphs.

Files changed:

- `src/app/editor/_components/comparePagination.ts`
- `src/app/editor/_components/__tests__/comparePagination.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 190 core + 16 app = 206 tests passed.

---

### Add Paragraph Fragment Metadata

Goal: Make split-paragraph tracking explicit so future selection, annotation, and drift reporting can identify fragments without relying on runtime object order.

Completed:

- Added 5 optional fields to `PageFragment` in `pagination/types.ts`:
  - `fragmentIndex`: 0-based position among fragments of the same `nodeId`
  - `lineStart`: index of the first line in the source paragraph's measured lines
  - `lineEnd`: exclusive end index (`lineStart + fragment line count`)
  - `continuesFrom`: `true` if a previous fragment exists for this paragraph
  - `isContinued`: `true` if a subsequent fragment exists for this paragraph
- Populated in `paginateParagraph` fast path: `fragmentIndex=0, lineStart=0, lineEnd=totalLines, continuesFrom=false, isContinued=false`.
- Populated in `paginateParagraph` split path: `fragmentIndex` and `lineOffset` counters track position across the while loop. `isFirstFragment`/`isLastFragment` drive the boolean flags.
- Identity decision: fragment identity stays implicit (`nodeId + pageIndex`). An explicit `fragmentId` string is deferred until selection or annotation features require a stable reference across document edits.
- Created 7 tests in `fragmentMeta.test.ts` covering: fast-path single fragment, first fragment flags, last fragment flags, middle fragment flags (3-page span), lineStart/lineEnd contiguity, lineEnd-lineStart equals fragment line count, fragmentIndex strictly increasing, assertPaginatedDocument passes.

Files changed:

- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/fragmentMeta.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 190 core + 12 app = 202 tests passed.

---

### Add Widow/Orphan Prevention

Goal: Avoid leaving a single isolated line at the bottom (orphan) or top (widow) of a page when splitting paragraphs across page boundaries.

Completed:

- Added orphan prevention in `paginateParagraph` split loop: if `count === 1` and more lines follow and `cursorY > contentTop + 1`, advance to the next page and retry instead of placing a single stranded line.
- Added widow prevention: if `remainingLines.length - count === 1` and `count >= 2` and `cursorY > contentTop + 1`, reduce `count` by 1 so the next page receives at least 2 lines instead of 1.
- Both guards share the `cursorY > contentTop + 1` condition: when already at contentTop, neither rule fires — content box is too small to improve, and firing would cause an infinite loop. The paragraph falls back to the standard split in impossible cases.
- Widow guard requires `count >= 2` to prevent creating an orphan as a side effect of the adjustment.
- Created 8 tests in `widowOrphan.test.ts`: orphan moves 3-line paragraph to next page, preserves total line count, single-line paragraph unaffected, contentTop guard (no movement), widow splits 4-line paragraph 2+2 instead of 3+1, preserves total line count, 2-line remainder needs no adjustment, assertPaginatedDocument passes for all cases.
- Existing 174 split/pagination tests all pass — the guard at `contentTop` ensures paragraphs starting at the top of a page (the common case in existing tests) are unaffected.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/widowOrphan.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 182 core + 12 app = 194 tests passed.

Notes:

- Widow/orphan policy applies only to body-level paragraphs. Paragraphs inside table cells use `pushCellSlice` which has its own split logic — widow/orphan is not yet applied there.
- The `cursorY > contentTop + 1` guard handles impossible cases (line taller than half the page) gracefully without any special detection.

---

## 2026-05-08

### Make Server Font Loading Observable

Goal: Ensure both API routes surface font fallback state to callers so silent Helvetica fallback doesn't hide Thai layout drift until export time.

Completed:

- `/api/paginate` already had `console.error` logging and `X-FlowDoc-Font: fallback` response header when the default font is missing.
- Added `X-FlowDoc-Font: fallback` response header to `/api/export` to match paginate route behavior. Previously export silently fell back to Helvetica with no observable signal — callers had no way to detect degraded Thai layout at export time.
- Both routes now expose fallback state consistently: server logs for operators, response header for clients.

Files changed:

- `src/app/api/export/route.ts`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.

---

### Add Thai and Near-Boundary Drift Fixtures (Level 1)

Goal: Cover known risky drift cases — Thai mixed with English/numbers and near-boundary line wraps — using mock measurers so tests are deterministic and CI-safe.

Completed:

- Added 4 tests in a new "layout drift — Thai-specific and near-boundary cases" describe block in `drift.test.ts`:
  - Thai + English mixed text (5 Thai + 82 ASCII): browser=1 line, server=2 lines.
  - Long unbroken Thai token (140 chars, grapheme fallback): browser=2 lines, server=3 lines.
  - Thai paragraph after full-page filler: stays on page 0 with browser, drifts to page 1+ with server.
  - Thai + digits mixture (6 Thai + 81 ASCII): browser=1 line, server=2 lines.
- All tests use the existing browser/server mock measurers (Thai chars: 0.62/0.67×fontSize, ASCII: 0.48/0.52×fontSize). No real font required; cases are calculated from first principles.
- Level 2 (real fontkit + `it.skipIf` when font absent) documented as deferred until CI has reliable font access or production Thai regressions surface.

Files changed:

- `packages/core/src/pagination/__tests__/drift.test.ts`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 168 core + 12 app = 180 tests passed.

---

### Separate Preview Drift From Authoritative Failure

Goal: Surface server-side font fallback and layout errors visibly to the editor user, so degraded layout state is not silent.

Completed:

- Added `fontFallback: boolean` state to `EditorShell`. Set to `true` when `/api/paginate` responds with `X-FlowDoc-Font: fallback` header; cleared when server confirms real font. Shows amber "⚠ fallback font" tooltip indicator in toolbar.
- Added `layoutError: boolean` state. Set to `true` when `/api/paginate` returns a non-OK status (e.g. 500 from `assertPaginatedDocument` failure); cleared on next successful response. Shows red "⚠ layout error" tooltip indicator in toolbar.
- Both indicators appear in the toolbar status area alongside the existing "↻ layout…" / "preview layout" indicators.
- Server-side failures (assertPaginatedDocument 500, font fallback header) were already in place from the API hardening work; this change makes them user-visible on the client.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.

---

### Sync Checklist Status With Implementation

Goal: Update stale wording and unchecked items in LAYOUT_ENGINE_CHECKLIST.md to match the current implementation state.

Completed:

- "Add pagination golden fixtures": updated description (paragraphs split by lines, not whole-block); test count 15→23.
- "Add renderer smoke tests": test count 11→16 (renderer contract tests added).
- "Verify fragment relationships": updated table-cell description to `nodeType="table-cell"`.
- "Stage 3: keep-together/keepWithNext": marked `[x]` — keepWithNext done, keepTogether deferred.
- "Stage 5: table-cell text continuation": marked `[x]` — basic continuation done via `pushCellSlice`.
- "Renderer contract tests for split paragraph fragments": marked `[x]`.
- "Keep DOCX limitation documented separately": marked `[x]`.
- "Add golden fixtures for representative continuation cases": marked `[x]` for all 5 items (2-page, 3+-page, after-split, page-number inline, table-cell).
- "Keep checklist status synchronized": marked `[x]`.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

---

### Give Table Cells Stable Fragment Identity

Goal: Replace the implicit `nodeType: "stack"` for table cell fragments with an explicit `nodeType: "table-cell"` so renderers, drift reporting, and debug tools can distinguish cells from regular layout stacks without relying on `cellRenderProps` or `parentNodeId` heuristics.

Completed:

- Added `"table-cell"` to `PageFragment.nodeType` union in `pagination/types.ts`.
- Updated `paginateTableRowFull` and the split loop in `paginateTableRowSplit` to push cell fragments with `nodeType: "table-cell"`.
- Updated PDF renderer (`renderer/pdf/index.ts`): `nodeType === "table-cell"` replaces `nodeType === "stack" && cellRenderProps`.
- Updated DOCX renderer (`renderer/docx/index.ts`): split the `"stack"` branch into a `"table-cell"` branch (for table cells) and a clean `"stack"` branch (for layout stacks only, no parentNodeId lookup).
- Added `"table-cell"` to `TRACKED_LAYOUT_TYPES` in `comparePagination.ts`.
- Updated `placement/geometry.ts` (`DetectTargetInput.hoveredNodeType`) and `placement/types.ts` (`PlacementTarget`) to accept `"table-cell" | "table-row" | "table"` — placement detection returns null for these, as expected.
- Updated `paginator.test.ts`: "table cell fragments" test now asserts `nodeType === "table-cell"`.

Files changed:

- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/renderer/pdf/index.ts`
- `packages/core/src/renderer/docx/index.ts`
- `packages/core/src/placement/geometry.ts`
- `packages/core/src/placement/types.ts`
- `src/app/editor/_components/comparePagination.ts`
- `packages/core/src/pagination/__tests__/paginator.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 164 core + 12 app = 176 tests passed.

---

### Expand Drift Comparison Beyond Paragraph Fragments

Goal: Make drift reports visible for row, stack, and table-row fragments — not only paragraph line-count drift — so layout regressions like rows moving pages are detectable.

Completed:

- Added `GeometryDrift` interface and `buildLayoutSnapshotMap` in `comparePagination.ts`. Tracks `row`, `stack`, and `table-row` fragments for page movement and height delta.
- Added `geometryDriftMap: Map<string, GeometryDrift>` to `DriftReport`. Existing `driftMap`, `driftCount`, `totalParagraphs` are unchanged — no breaking changes to EditorCanvas overlay.
- Updated `pageBreakChanged` to also trigger when any tracked layout fragment moves pages (not just paragraphs).
- Updated `EditorShell` console log: shows "layout geometry drift" sub-group when Drift overlay is active and geometry drift is detected.
- Added 4 new tests in `comparePagination.test.ts`: row height drift, table-row page movement, no geometry drift when matching, stack drift independent tracking. Updated "ignores non-paragraph" test name to reflect new behavior.

Files changed:

- `src/app/editor/_components/comparePagination.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/comparePagination.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 164 core + 12 app = 176 tests passed.

---

### Add Renderer Contract Checks Around Fragment Coverage

Goal: Verify that the paginated document passed to PDF/DOCX renderers contains the expected fragment kinds and split fragments, catching dropped or merged fragments at the pagination layer rather than only at renderer output.

Completed:

- Added "renderer input contract — fragment coverage" describe block in `renderer.test.ts` with 5 tests:
  - row/stack/paragraph fragment kinds all present in paginated input for a row document
  - split paragraph (80 hard-newline lines) produces ≥2 fragments on different pages
  - split fragments are ordered by ascending pageIndex in renderer input
  - PDF renderer handles split paragraph fragments without throwing and produces valid %PDF header
  - DOCX renderer handles split paragraph fragments without throwing and produces valid PK header
- Tests assert on paginated document structure before the renderer is called, so they catch pagination regressions independently of renderer behavior.

Files changed:

- `packages/core/src/renderer/__tests__/renderer.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 164 core + 8 app = 172 tests passed.

---

### Extend Table Row Splitting to Multi-Page Loop

Goal: Make breakable table rows (allowBreak=true) split across 3+ pages correctly instead of placing all remaining content on page 2 as a single overflow block.

Completed:

- Replaced `computeSplitPoint` with `computeSplitPointFrom(cellBox, tableNode, availH, measurer, wordBreaker, from)`. Takes a `from: SplitPoint` so split calculation can start from any position, enabling iterative page splitting.
- Replaced `pushCellFirstSlice` + `pushCellSecondSlice` with `pushCellSlice(from, to)`. General function that places cell content from split point `from` to `to` (null = to end). Handles partial paragraphs at both boundaries and spacers correctly.
- Rewrote `paginateTableRowSplit` as a `while` loop: each iteration places one slice (`min(availH, remaining)`) of the row, updates per-cell `fromSplits`, and advances the cursor until `heightPlaced === totalHeight`.
- Fixed `paginateTable` split condition: added `tooTallForOnePage = rowBox.height > contentBottom - contentTop` so rows taller than one content page trigger the split path even when starting at contentTop (previously `shouldMoveBlockToNextPage` returned false at contentTop, skipping split entirely).
- Fixed `pushTableCellContents`: table cell paragraph lines now call `resolvePageNumbers(rawLines, pageIndex + 1)`, matching the fix applied earlier to `pushStackContents`.
- Added 5 tests in `tablePagination.test.ts` under "multi-page row split": 3-page split produces 3+ fragments, total line count preserved, ascending page order, assertPaginatedDocument passes, 2-page regression check.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 159 core + 8 app = 167 tests passed.

Notes:

- Rowspan-linked groups remain conservative (approach B: whole-group move, no intra-group split). This is intentional — split-at-row-boundary within rowspan groups deferred until needed.
- The `tooTallForOnePage` fix is a side effect of the main task but necessary for the feature to work at all.

---

### Harden Page-Number Layout Measurement

Goal: Fix page-number placeholder width so documents with 10+ pages don't overflow the measured layout width, and fix page numbers inside row/stack columns that were never resolved.

Completed:

- Changed `pageNumber` placeholder in `measureParagraph` (`layout/measure.ts`) from `"0"` (1-digit) to `"00"` (2-digit). Covers pages 1–99 without needing a two-pass layout.
- Fixed `pushStackContents` in `paginator.ts`: paragraph lines inside row/stack columns were built with `buildPaginatedLines` but `resolvePageNumbers` was never called — page numbers inside columns stayed as `"00"` permanently. Added `resolvePageNumbers(rawLines, pageIndex + 1)` call to match `paginateParagraph` behavior.
- Added 2 regression tests in `pageNumbers.test.ts`:
  - Page 9→10 boundary: 9 pages of filler push the pageNumber paragraph to page 10 (index 9); text resolves to `"หน้า 10"`.
  - Narrow column: `widthShare=20` stack with a pageNumber paragraph passes `assertPaginatedDocument` and resolves to `"1"`.

Files changed:

- `packages/core/src/layout/measure.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/pageNumbers.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 154 core + 8 app = 162 tests passed.

Notes:

- The `pushStackContents` bug means page numbers inside columns were silently broken before this fix. No other callers are affected — `paginateParagraph` (body-level) and `paginateTable` cell paths were already correct.

---

### Harden API Routes — Assertion and Font Diagnostics

Goal: Catch layout bugs at API boundaries before they reach renderers, and surface font-loading failures instead of silently degrading Thai layout.

Completed:

- Added `assertPaginatedDocument(paginated)` after `paginateDocument(...)` in both `/api/paginate` and `/api/export`. Returns HTTP 500 with violation details on failure; logs to server console. Renderers no longer receive invalid layout output.
- Replaced silent font-load `catch {}` in both routes with `console.error` logging the full font path and error. Missing font is now visible in server logs instead of silently producing Helvetica output for Thai documents.
- `/api/paginate` now sets `X-FlowDoc-Font: fallback` response header when the default font is missing, making the degraded state detectable by the client.
- Fallback to `createFontkitMeasurer(null)` is still allowed for dev/CI environments without the font file, but is now always surfaced.

Files changed:

- `src/app/api/paginate/route.ts`
- `src/app/api/export/route.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.

---

### Add keepWithNext Paragraph Option

Goal: Allow a paragraph (typically a heading) to stay on the same page as the following sibling, preventing orphan headings.

Completed:

- Added `keepWithNext?: boolean` to `ParagraphPropsSchema` in `schema/block.ts`.
- Modified `paginateVerticalContainer` in `paginator.ts`: before placing a paragraph with `keepWithNext=true`, check if `child.height + nextChild.height > remaining page space`. If so and we're not at contentTop, advance page first so both can start on the new page.
- Safety guard: only advances when `cursorY > contentTop + 1` — prevents infinite loops when combined height exceeds one full page height.
- `keepTogether` deferred — produces bad UX for long paragraphs that would overflow rather than split.
- Created 5 tests in `keepWithNext.test.ts`: baseline (no flag), heading moves with next sibling to page 2, heading stays on page 1 when both fit, no-loop guard for oversized combined height, multiple keepWithNext headings in sequence.

Files changed:

- `packages/core/src/schema/block.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/keepWithNext.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 152 core + 8 app = 160 tests passed.

---

### Add Page Numbering (Inline pageNumber Node)

Goal: Allow paragraph children to include a page number that gets resolved to the actual page number during pagination.

Completed:

- Added `PageNumberInlineSchema` and `PageNumberInline` type to `schema/inline.ts`. The `InlineNodeSchema` discriminated union now includes `{ type: "pageNumber" }`.
- Added `"pageNumber"` to `LineSegment.kind` in `layout/types.ts`.
- Modified `measureParagraph` in `layout/measure.ts`: `pageNumber` children append `"0"` (single-digit placeholder) to `fullText` and track `pageNumberRanges`. `getSegmentKind` now accepts `pageNumberRanges` and returns `"pageNumber"` for matching segments. `wrapLines` and `createSourceSegments` thread `pageNumberRanges` through.
- Added `resolvePageNumbers(lines, pageNumber)` helper in `paginator.ts`: replaces segments with `kind: "pageNumber"` with the actual page number string and rebuilds the line's text.
- Applied `resolvePageNumbers` in `paginateParagraph` for both fast path and split path, using `current.pageIndex + 1` (1-based page number).
- Created 5 tests in `pageNumbers.test.ts`: "หน้า 1" on page 1, "หน้า 2" on page 2, multiple pageNumber nodes, prefix text preserved, standalone node.

Files changed:

- `packages/core/src/schema/inline.ts`
- `packages/core/src/layout/types.ts`
- `packages/core/src/layout/measure.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/pageNumbers.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 147 core + 8 app = 155 tests passed.

Notes:

- Layout width is measured using "0" (1 digit). Pages 10+ will have slight overflow at the measurement boundary. Acceptable for typical header/footer use.
- Total page count ("Page X of Y") deferred — requires two pagination passes.

---

### Add Repeating Table Headers

Goal: Make the first N rows of a table repeat at the top of each continuation page, matching standard document behavior for multi-page tables.

Completed:

- Added `headerRowCount?: number` to `TablePropsSchema` in `schema/table.ts`. Specifies how many rows from the top are header rows.
- Modified `paginateTable` in `paginator.ts`:
  - Slices `box.children.slice(0, headerRowCount)` as header boxes and computes `headerHeight`.
  - `placeHeaders(cursor)` helper pushes all header rows using `paginateTableRowFull`.
  - Each group is classified as `isHeaderGroup` (all row indices < headerRowCount) or content. Header groups are placed normally; content groups call `placeHeaders` after any page advance.
  - Single-row group page-fit check accounts for `reservedForHeaders` so content rows are not placed when they won't fit after headers.
- Added 5 tests in `tablePagination.test.ts`: baseline (no headers), header repeats on every page, header at contentTop, content below header, fragment order passes `assertPaginatedDocument`.

Files changed:

- `packages/core/src/schema/table.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 142 core + 8 app = 150 tests passed.

---

### Split Paragraphs Across Pages by Measured Lines

Goal: Make body-level paragraphs split at line boundaries across pages instead of overflowing as a single block.

Completed:

- Rewrote `paginateParagraph` in `paginator.ts`:
  - Fast path: `current.cursorY + totalHeight <= contentBottom` → push whole paragraph as one fragment (unchanged from before for short paragraphs).
  - Split loop: when the paragraph overflows, iterate remaining lines until all are placed. On each iteration, count lines that fit in the available space, push a fragment, advance cursor, and continue with remaining lines on the next page.
  - `spacingBefore` added only to the first fragment; `spacingAfter` added only to the last fragment.
  - If no lines fit and cursor is not at contentTop, advance to the next page and retry. If no lines fit even at contentTop (line taller than page), force 1 line to prevent infinite loops.
- Updated paginator.test.ts: replaced the old "paragraph moves whole to next page" test with a new test verifying split behavior. Added 8 new tests in a dedicated "paragraph split across pages" group.
- Key bug fixed during testing: the original fast-path check used `shouldMoveBlockToNextPage` which returns `false` at contentTop regardless of height. Changed to `cursorY + totalHeight <= contentBottom` to correctly identify when the whole paragraph actually fits.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/paginator.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 137 core + 8 app = 145 tests passed.

Notes:

- Paragraphs inside table cells were already split at line level (existing `pushCellFirstSlice`/`pushCellSecondSlice`). This change brings body-level paragraphs to the same level.
- Stack contents (paragraphs inside row/columns) use `pushStackContents` which does not split — that is acceptable for now since column content is bounded by the row height.

---

### Fix Too-Tall Rowspan Group Edge Case

Goal: Ensure rowspan groups taller than one content page start at contentTop of the next page, consistent with paragraph overflow behavior.

Completed:

- Fixed `paginateTable` in `paginator.ts`: removed the conditional that only advanced the page if the group fit. Now always calls `advancePage` when the group doesn't fit at the current cursor, matching how `paginateParagraph` handles tall blocks.
- Added 1 regression test in `tablePagination.test.ts`: a rowspan group taller than one page, placed after filler content, must start at `contentTop` (72pt) on the next page, not at a mid-page position. Both rows still land on the same page.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 129 core + 8 app = 137 tests passed.

---

### Refine Layout Span Follow-Up Checklist

Goal: Capture the remaining edge cases after reviewing the current rowspan-group pagination implementation.

Completed:

- Clarified that current rowspan behavior is approach B: linked rows stay together, and groups taller than one content page are documented overflow.
- Added a follow-up item for the too-tall rowspan group edge case: when such a group starts after earlier content, it should move to the next page's content top before overflowing.
- Refined the open table span question to distinguish resolved rowspan grouping from still-open split-at-row-boundary, colspan, and `allowBreak=true` interactions.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- The current implementation direction remains aligned with the conservative layout strategy. The added item is a narrow regression target, not a change in the overall table split policy.

---

### Stabilize Table Pagination — Rowspan Groups and Grid Invariants

Goal: Keep rowspan-linked table rows on the same page (approach B) and verify row/column operations preserve grid invariants.

Completed:

- Added `buildRowspanGroups(tableNode, rowBoxes)` to `paginator.ts` using union-find. Groups rows that share rowspan cells into `RowspanGroup[]` with `rowIndices` and `totalHeight`.
- Modified `paginateTable` to iterate over groups instead of rows:
  - Multi-row group: page-break decision based on `totalHeight`. If group doesn't fit, try next page; if still too tall, overflow (documented). Rows within the group are placed with `paginateTableRowFull` without individual page-break decisions.
  - Single-row group: existing behavior preserved (`allowBreak`, split, move-whole).
- Created `packages/core/src/pagination/__tests__/tablePagination.test.ts` with 14 tests:
  - No-rowspan baseline (existing behavior preserved).
  - 2-row rowspan group stays on same page.
  - 2-row rowspan group moves to next page as a unit.
  - 3-row rowspan group stays together.
  - Mixed groups (rowspan + independent rows).
  - `assertPaginatedDocument` passes for all rowspan scenarios.
  - `addTableRow`, `removeTableRow`, `addTableColumn`, `removeTableColumn` all pass `assertDocument` and `assertPaginatedDocument`.

Files changed:

- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/__tests__/tablePagination.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 128 core + 8 app = 136 tests passed.

Notes:

- Upgrade path to approach A (split within groups at row boundary) is easy: group detection is shared; A adds split-at-boundary logic within the multi-row group loop.
- rowspan/colspan in split scenarios (`allowBreak=true` on multi-row groups) deferred until approach A is needed.

---

### Make Editor Resize Preview Converge With Authoritative Pagination

Goal: Ensure resize interactions produce valid documents and converge to authoritative server pagination.

Completed:

- Added `Math.max(0.01, ...)` guard in `EditorShell.tsx` column resize commit to prevent widthShare from becoming 0 or negative due to floating-point rounding at the boundary (drag clamping already prevents this in practice, but the guard is now explicit).
- Created `packages/core/src/pagination/__tests__/resizeConvergence.test.ts` with 15 tests:
  - **Column resize** (6 tests): normal 30/70, 70/30, near-minimum 15/85, 85/15, minimum-clamp 0.01/99.99, and width sum verification.
  - **Row min-height** (5 tests): increase, natural content height, zero fallback, very large, and height = max(minHeight, naturalHeight) verification.
  - **Page margin** (4 tests): standard, large, asymmetric, and x-position after margin change.
- All tests pass `assertPaginatedDocument` with no violations.
- Documented that row min-height preview uses browser canvas measurer (acceptable drift, settles after server pagination).

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `packages/core/src/pagination/__tests__/resizeConvergence.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 115 core + 8 app = 123 tests passed.

---

### Stabilize Row and Stack Pagination Rules

Goal: Lock in row/stack layout semantics with tests and document multi-column overflow decision.

Completed:

- Created `packages/core/src/pagination/__tests__/rowStack.test.ts` with 12 tests covering:
  - **Min-height**: row height = max(minHeight, tallest-stack), all stacks share row height.
  - **Width distribution**: two/three-column stacks sum to contentBox.width, proportional to widthShare, contiguous x positions.
  - **Page-break**: row moves to next page as a whole unit (both stacks land together), very tall row stays at contentTop without crash.
  - `assertPaginatedDocument` passes for all valid row/stack documents.
- Confirmed from `flow.ts`: `rowHeight = max(node.props.minHeight, ...measuredHeights)` and each stack receives `stackRenderHeight = rowHeight` so all stacks grow to the tallest column.
- Multi-column overflow decision documented: whole row moves when possible; overflow without split is the current behavior for rows taller than one page.

Files changed:

- `packages/core/src/pagination/__tests__/rowStack.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 100 core + 8 app = 108 tests passed.

---

### Document DOCX Layout Limitations

Goal: Make DOCX renderer compromises explicit so future contributors know what is intentional and what is not.

Completed:

- Updated `docs/LAYOUT_ENGINE_CHECKLIST.md` with six documented DOCX limitations: pagination non-authoritativeness, font metric dependence on reader system, column layout as invisible-border tables, reader-controlled line breaking, spacing/border rounding, and the accepted exchange-format compromise.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

---

### Add Layout Assertion Helpers

Goal: Add reusable helpers that verify PaginatedDocument layout invariants, so pagination bugs are caught immediately in tests and development.

Completed:

- Created `packages/core/src/pagination/assertPaginated.ts` with `checkPaginatedDocument` and `assertPaginatedDocument`.
- `checkPaginatedDocument` returns `PaginationViolation[]` covering four rules:
  - `negative-height`: fragment.height < 0
  - `outside-content-box`: fragment x or x+width outside page content box (0.5pt epsilon for float rounding)
  - `wrong-y-order`: consecutive fragments on the same page have decreasing Y
  - `split-fragment-order`: fragments of the same nodeId appear on out-of-order pages
- `assertPaginatedDocument` throws a detailed multi-line error listing all violations.
- Exported from `packages/core/src/pagination/index.ts`.
- Created 17 tests in `assertPaginated.test.ts` covering: happy path for real paginated docs, each violation type with both positive and negative cases, epsilon tolerance, and assertPaginatedDocument throw behavior.

Files changed:

- `packages/core/src/pagination/assertPaginated.ts` (new)
- `packages/core/src/pagination/index.ts`
- `packages/core/src/pagination/__tests__/assertPaginated.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 88 core + 8 app = 96 tests passed.

Notes:

- Y overflow below contentBottom is intentionally not checked — whole-block move can overflow when a node is taller than one page (documented behavior).
- These helpers should be used in future pagination tests and can be added to the API route for dev-mode validation.

---

### Document Layout Page-Break Decisions

Goal: Record current page-break behavior and near-term layout split direction before changing the paginator.

Completed:

- Updated `docs/LAYOUT_ENGINE_CHECKLIST.md` to reflect current behavior verified in `packages/core/src/pagination/paginator.ts`.
- Documented spacer behavior as whole-block move with overflow only as an authored edge case.
- Documented row/stack behavior as atomic for now: rows move as a whole when possible; stacks do not split independently.
- Documented table row behavior as `allowBreak=false` whole-row move and `allowBreak=true` split.
- Documented TOC placeholder behavior as temporary fixed-height placement with post-processing and no repagination yet.
- Corrected paragraph behavior: paragraphs currently move as whole blocks and can overflow when taller than a page; line-level paragraph splitting is the next preferred layout split slice.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- The chosen direction is conservative: split paragraphs first because measured lines already exist, and defer row/stack splitting until paragraph pagination is stable.

---

### Add Pagination Golden Fixtures

Goal: Lock in paginator behavior with focused tests before making layout changes, covering geometry, page breaks, fragment relationships, and line metadata.

Completed:

- Created `packages/core/src/pagination/__tests__/paginator.test.ts` with 15 golden fixture tests.
- **Geometry group**: first paragraph at content box origin (x=72, y=72, width=451), height equals one line height, two paragraphs stacked vertically, spacer height/position.
- **Page break group**: single paragraph stays on one page, tall paragraph moves whole to next page (body-level paragraphs are not split line-by-line), spacer moves whole to next page, tall paragraph at page top stays without crash.
- **Fragment relationships group**: row.parentNodeId=bodyId, stack.parentNodeId=rowId, paragraph-in-stack.parentNodeId=stackId, two-column widths sum to contentBox.width.
- **Line metadata group**: hard-newline lines produce correct text per line, line x=fragment x, lines ordered top-to-bottom.
- Marked `Add pagination golden fixtures` complete in `docs/LAYOUT_ENGINE_CHECKLIST.md`.

Files changed:

- `packages/core/src/pagination/__tests__/paginator.test.ts` (new)
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 49 core + 8 app = 57 tests passed.

Notes:

- Body-level paragraphs and spacers are moved whole to the next page when they don't fit — no line-level splitting. Line-level splitting only happens for paragraphs inside table cells.
- All tests use `defaultTextMeasurer` and fixed IDs for stable, deterministic assertions.

---

### Add Layout Engine Checklist

Goal: Create a dedicated checklist for flow layout, pagination, page breaks, renderer layout output, and editor layout interactions.

Completed:

- Added `docs/LAYOUT_ENGINE_CHECKLIST.md`.
- Split layout work into current foundation, near-term checklist, design rules, later work, and open questions.
- Captured follow-up areas for pagination golden fixtures, renderer smoke tests, page-break rules, row/stack pagination, table pagination, paginated output assertions, and resize-preview convergence.
- Kept text caret/segment details in `docs/TEXT_ENGINE_CHECKLIST.md` and made the new checklist focus on shared layout behavior.

Files changed:

- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- This checklist should become the guide for future changes in `packages/core/src/layout`, `packages/core/src/pagination`, renderer layout consumption, and editor resize/page-preview behavior.

---

### Complete Drift Comparison Follow-Up Items

Goal: Close the four follow-up checklist items added after the initial drift comparison implementation.

Completed:

- **Split-page aggregation** (`comparePagination.ts`): `buildSnapshotMap` now aggregates line counts and heights across all fragments with the same `nodeId` (paragraph spanning multiple pages). `FragmentSnapshot` stores `pages: PageLocation[]` instead of a single `pageIndex`/`sectionIndex`. `pagesMatch` helper compares page lists for page-movement detection.
- **Page-break-only drift overlay** (`EditorCanvas.tsx`): drift overlay now shows purple fill + `"PG"` badge when `pageMovement` is true but `lineDelta === 0`. `FragmentDrift` type gains a `pageMovement: boolean` field.
- **`comparePagination` tests** (`src/app/editor/_components/__tests__/comparePagination.test.ts`): 8 focused tests covering no-drift, positive/negative line delta, page movement, split-page aggregation, non-paragraph ignored, and totalParagraphs count. Added root-level `vitest.config.ts` and `test:app` script.
- **Tracking reset on edit session end** (`EditorShell.tsx`): added `useEffect` that resets `prevLineCountRef` and `prevEditNodeIdRef` to `null` when `inlineEditNodeId` becomes `null`, preventing stale state on re-entry to the same paragraph.

Files changed:

- `src/app/editor/_components/comparePagination.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/__tests__/comparePagination.test.ts` (new)
- `vitest.config.ts` (new)
- `package.json`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34 core + 8 app = 42 tests passed.

---

### Refine Text Engine Follow-Up Checklist

Goal: Make the checklist capture the implementation gaps found while reviewing the current server-authoritative preview and drift tooling work.

Completed:

- Added follow-up items for split-across-page drift comparison.
- Added a checklist item for page-break-only drift overlay behavior.
- Added a checklist item for focused `comparePagination` tests.
- Added a checklist item to reset soft/hard line-count tracking for every inline edit session, including re-entering the same paragraph.

Files changed:

- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- The existing direction remains valid. These items make the next implementation slices more explicit and easier to verify.

---

### Add Soft/Hard Reflow Rules During Inline Editing

Goal: Eliminate the visual overlap between the active paragraph and surrounding content when a line wrap or unwrap occurs during typing.

Completed:

- Added `prevLineCountRef` and `prevEditNodeIdRef` to `EditorShell` to track the active paragraph's line count across keystrokes.
- Modified the local reflow effect to classify each text change as soft or hard:
  - **Soft** (line count unchanged): patch only the active paragraph's lines in the paginated state, leaving surrounding fragments untouched. Existing behavior, unchanged.
  - **Hard** (line count changed): dispatch a full browser pagination immediately (synchronous, 0ms) so all fragments below the active paragraph shift to their correct positions without waiting for the 200ms debounce.
- `prevLineCountRef` resets to `null` each time a new paragraph enters edit mode, so the first measurement never triggers a spurious hard event.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34/34 passed.

Notes:

- The 200ms debounce full pagination still fires after the hard-event pagination, which confirms the layout. This is harmless — it runs with the same browser measurer and produces the same result.
- Server authoritative pagination (500ms debounce) continues unchanged.

---

### Add Layout Drift Comparison

Goal: Measure how different browser pagination (Canvas measurer) is from server pagination (fontkit), so we can decide whether calibration or fontkit-in-browser is needed.

Completed:

- Created `src/app/editor/_components/comparePagination.ts` with `comparePagination(browser, server)` → `DriftReport`. Compares paragraph fragment line counts and page break positions between two `PaginatedDocument` results.
- Added `FragmentDrift` (per-fragment delta) and `DriftReport` (summary + `driftMap`) types.
- Modified `EditorShell.tsx`: added `showDrift` state, `driftReport` state, and `showDriftRef`. After each authoritative pagination response, runs `comparePagination(paginatedRef.current, paginated)` and stores the report. When drift overlay is active, logs a grouped console summary listing each drifted paragraph with browser/server line counts.
- Added "Drift" toolbar button — toggles the overlay, shows live count (`Drift 2/8`) when drift is detected.
- Modified `EditorCanvas.tsx` and `PageView`: added `showDrift` and `driftMap` props. When active, renders a semi-transparent orange (+lines) or blue (-lines) overlay on drifted paragraph fragments, with a small badge (e.g. "+1L") in the top-right corner.

Files changed:

- `src/app/editor/_components/comparePagination.ts` (new)
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34/34 passed.

Notes:

- Orange overlay = server wraps to more lines (PDF will be longer than preview).
- Blue overlay = server wraps to fewer lines (PDF will be shorter than preview).
- Console log fires only when Drift overlay is active and drift is detected, to avoid noise.
- Next step: observe real drift in practice, then decide between calibration factor or fontkit-in-browser.

---

### Reconcile Editor Preview To Server Pagination

Goal: Keep server/API pagination as the layout truth while preserving responsive browser-side editing.

Completed:

- Added an authoritative pagination path in `EditorShell` that posts the current preview document to `/api/paginate` after debounce.
- Kept browser pagination and paragraph-local reflow as the fast interactive preview path.
- Added version guarding so stale server pagination responses cannot overwrite newer document state.
- Deferred applying server pagination while inline editing is active, then settled the canvas back to the latest authoritative result after editing ends.
- Added a small layout status indicator for optimistic preview vs authoritative layout reconciliation.
- Updated the text engine checklist with the completed reconcile slice and the remaining drift/soft-reflow work.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` passed — 34/34 tests.

Notes:

- The first sandboxed test run failed with Vitest `spawn EPERM`; rerunning with approved escalation passed.
- This is the first implementation slice for the server-authoritative direction. The larger task remains open until browser/server drift is measured and wrap/page-break UX gets soft/hard reflow rules.

---

### Clarify Server Pagination As Layout Truth

Goal: Decide how to interpret "Keep server/export pagination authoritative while browser preview catches up" before changing editor reflow behavior.

Completed:

- Confirmed the intended model: `/api/paginate` and `/api/export` remain the layout truth because they use the server/export measurement path.
- Defined browser pagination, paragraph-local reflow, and future soft/hard reflow behavior as interaction preview only.
- Documented that browser/server differences should be measured as layout drift rather than accepted as a second source of truth.
- Added design rules to avoid letting browser canvas measurement become an independent authoritative layout engine.

Files changed:

- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- This decision leaves room for UX improvements such as freezing surrounding layout near wrap/page-break boundaries, while still reconciling back to server/API pagination after idle, blur, or export.

---

### Change Enter to Newline Within Paragraph

Goal: Enter key inserts `\n` within the same paragraph instead of splitting into a new paragraph node, to avoid excessive inter-paragraph spacing and feel more natural for form/document editing.

Completed:

- Modified `measureParagraph` in `packages/core/src/layout/measure.ts` to split `fullText` on `\n` before word-wrapping. Each hard line is wrapped separately and concatenated. Segment `start`/`end` offsets are adjusted by `globalOffset` so caret hit testing stays correct across hard breaks.
- Added `offsetBase` parameter to `createSourceSegments` and `wrapLines` (defaults to 0, fully backward-compatible).
- Removed Enter and Backspace-at-0 special handling from `ParagraphTextSurface.tsx` keyboard handler. Enter now falls through to default textarea behavior, inserting `\n` naturally.
- Fixed live text overlay comparison to strip `\n` before comparing with paginated text, preventing false overlay triggers on multi-line paragraphs.

Files changed:

- `packages/core/src/layout/measure.ts`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34/34 passed.

Notes:

- `onSplitParagraph` and `onMergeParagraph` remain in the `ParagraphTextSurface` props interface for potential future use (e.g., paragraph link / text frame threading feature).
- Paragraph split/merge operations remain in `packages/core/src/document/operations.ts` for when the paragraph link feature is built.
- Empty hard lines (from `\n\n`) produce a single empty `MeasuredLine` with height = lineHeight, giving visual blank line spacing that respects the paragraph's line height setting.

---

## 2026-05-07

### Merge Paragraph on Backspace at Start

Goal: When the user presses Backspace at position 0 of a paragraph, merge it with the paragraph above — the inverse of the Enter split.

Completed:

- Added `mergeParagraphWithPrevious(doc, nodeId)` to `packages/core/src/document/operations.ts`.
  Returns `{ doc, prevNodeId, caretIndex }` where `caretIndex` is the join point (length of previous paragraph text before merge), or `null` if no previous paragraph exists.
- Added `MERGE_PARAGRAPH` and `CLEAR_MERGE_RESULT` actions to `EditorState` reducer.
- Added `mergeResult: { prevNodeId, caretIndex } | null` field to `EditorState`.
- Added `handleMergeParagraph` callback and a `useEffect` in `EditorShell` that watches `mergeResult`, starts inline editing on the previous paragraph at the join point, then clears the field.
- Threaded `onMergeParagraph` prop down through `EditorCanvas` → `PageView` → `ParagraphTextSurface`.
- Handled `Backspace` at `selectionStart === 0` and `selectionEnd === 0` (no selection, cursor at very start) in `ParagraphTextSurface`: commits current text, then calls `onMergeParagraph`.

Files changed:

- `packages/core/src/document/operations.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34/34 passed.

Notes:

- Merge is only available when a previous paragraph sibling exists in the same parent (body/stack). Backspace at the first paragraph of a section is a no-op.
- Caret is placed at the exact join point so the user sees the cursor between the two merged texts.

### Split Paragraph on Enter Key

Goal: When the user presses Enter while editing a paragraph, split it at the cursor position — text before cursor stays in the current paragraph, text after cursor moves to a new paragraph below.

Completed:

- Added `splitParagraphAtIndex(doc, nodeId, splitIndex)` to `packages/core/src/document/operations.ts`.
  Returns `{ doc: DocumentNode, newNodeId: string }`. The new paragraph inherits all props (font, size, align, spacing) from the current paragraph.
- Added `SPLIT_PARAGRAPH` and `CLEAR_SPLIT_NODE_ID` actions to `EditorState` reducer.
- Added `lastSplitNodeId: string | null` field to `EditorState` to carry the new paragraph's ID out of the reducer.
- Added `handleSplitParagraph` callback and a `useEffect` in `EditorShell` that watches `lastSplitNodeId`, starts inline editing on the new paragraph at caret index 0, then clears the field.
- Threaded `onSplitParagraph` prop down through `EditorCanvas` → `PageView` → `ParagraphTextSurface`.
- Handled `Enter` key in `ParagraphTextSurface`: prevents default textarea newline, reads `selectionStart`, commits current text via `onChange` first, then calls `onSplitParagraph`.

Files changed:

- `packages/core/src/document/operations.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 34/34 passed.

Notes:

- `onChange` is called before `onSplitParagraph` so the split operation always sees the latest textarea content, not the last committed document state.
- Split is section-level only; paragraphs inside table cells are not yet split by Enter.

### Add Grapheme Boundary Snapping for Thai Caret

Goal: Prevent caret from landing inside Thai combining sequences like "งุ่" when the user clicks on text.

Completed:

- Added `snapToGraphemeBoundary(text, index)` to `packages/core/src/layout/measure.ts` and exported it.
  The function uses `Intl.Segmenter` with grapheme granularity to find the nearest grapheme cluster boundary to a given UTF-16 index.
- Applied snapping in `caretIndexFromSegments` in `EditorCanvas.tsx` — after computing the ratio-based index within a segment, the result is snapped before being returned.
- Imported `snapToGraphemeBoundary` from `@/layout` in `EditorCanvas.tsx`.
- Added 8 tests for `snapToGraphemeBoundary` covering: boundary edges, already-on-boundary index, inside "องุ่น" cluster, ASCII text, empty string, and "ก้" (consonant + tone mark).
- Decided and documented text offset encoding: segment `start/end` use UTF-16 indices matching the textarea; grapheme-aware navigation is enforced at the caret layer via `snapToGraphemeBoundary`.

Files changed:

- `packages/core/src/layout/measure.ts`
- `packages/core/src/layout/__tests__/measure.test.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 34/34 passed.
- `npm.cmd run type-check` passed.

Notes:

- Tie-breaking (distance to start = distance to end) snaps to the cluster start, which is the more natural choice for Thai — the user lands before the combined character rather than after.
- The fallback ratio path in `caretIndexFromPointer` (used when no segments exist) is not yet snapped, but segments are always populated for Thai paragraphs so this path is rarely hit.

### Add Paragraph-Local Reflow During Inline Editing

Goal: Make text line wrapping respond immediately as the user types, without waiting for full document pagination.

Completed:

- Added `measureParagraph` and `MeasuredParagraph` imports to `EditorShell`.
- Added four module-level helper functions:
  - `findParagraphNode` — locates a paragraph node in `previewDoc` by id.
  - `findParagraphFragment` — locates the paragraph's `PageFragment` in the current paginated state.
  - `buildLocalLines` — converts `MeasuredLine[]` to `PaginatedLine[]` using the fragment's existing x/y origin.
  - `replaceFragmentLines` — returns a new `PaginatedDocument` with only the active paragraph's lines and height replaced.
- Added a `paginatedRef` that tracks the latest `paginated` state without being a reactive dependency, so the local reflow effect can read it without creating a loop.
- Split the single pagination `useEffect` into two:
  - **Local reflow effect**: fires immediately on each `previewDoc` change while `inlineEditNodeId` is set; re-measures only the active paragraph and patches just that fragment in the paginated state.
  - **Full pagination effect**: debounced at 16ms when not editing, 200ms during inline editing; corrects page breaks and surrounding layout after the user pauses.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `npm.cmd run test` — 27/27 passed.

Notes:

- The local reflow updates only the active paragraph's `lines` and `height`. Surrounding fragments do not shift positions until full pagination completes (200ms after the last keystroke). This is acceptable because the active text is always correct and layout settles quickly after typing stops.
- `paginatedRef` is used (not `state.paginated`) inside the local reflow effect to avoid a re-render loop.

### Add measureParagraph Fixtures and Test Runner

Goal: Add the first test infrastructure to the project and lock in measureParagraph behavior with golden fixtures.

Completed:

- Installed Vitest as a root devDependency.
- Added `vitest.config.ts` to `packages/core` with node environment.
- Added `test` and `test:watch` scripts to `packages/core/package.json`.
- Added a root `test` script that delegates to the core workspace.
- Created `packages/core/src/layout/__tests__/measure.test.ts` with 27 fixture tests covering:
  - Empty text (produces a single empty line, correct totalHeight)
  - English: single word, word wrap, trailing space trimming, no leading space on new line
  - Numbers: digit strings, decimal numbers, number sequence wrap
  - Long unbroken text: grapheme fallback splitting, no line exceeds width, kind=grapheme
  - Thai text (mock word breaker): two words on one line, narrow-width break, Thai char widths
  - Mixed Thai/English (mock word breaker): correct wrap order, no line exceeds width
  - Spacing: spacingBefore/After added to totalHeight, mm→pt conversion
  - LineSegment metadata: no source offset gaps, x values non-decreasing, breakableAfter correct
  - fieldRef inline node: segment classified as kind=field
  - defaultWordBreaker integration: structural checks for English, Thai, and mixed text
- Marked the fixture checklist items as complete in `docs/TEXT_ENGINE_CHECKLIST.md`.

Files changed:

- `package.json`
- `packages/core/package.json`
- `packages/core/vitest.config.ts`
- `packages/core/src/layout/__tests__/measure.test.ts`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test` — 27 tests passed (0 failed).
- `npm.cmd run type-check` passed.

Notes:

- Thai and mixed tests use deterministic mock WordBreakers for exact golden checks. The `defaultWordBreaker` integration tests use structural assertions (width ≤ available, text preserved) to stay ICU-version-independent.
- The `spaceBreaker` mock splits on whitespace only and is the default for English/number/grapheme tests.

### Add Text Segment Debug Overlay

Goal: Make the editor show how the text engine sees paragraph line segments.

Completed:

- Added a `Segments` toolbar toggle.
- Passed the text segment debug setting through `EditorShell` and `EditorCanvas`.
- Rendered segment overlays on paragraph SVG text in both display and inline edit states.
- Used distinct colors for segment kinds: word, space, field, and grapheme fallback.
- Added SVG titles with segment kind, source offset range, and measured width.
- Marked the debug visualization checklist item as complete.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- Segment `x` values are interpreted relative to each visual line, so centered and right-aligned paragraphs can still display the overlay in the expected visual position.

### Clear Resize State On Pointer Release

Goal: Fix resize interactions staying active after releasing the pointer.

Completed:

- Cleared column resize state immediately after committing resized stack width shares.
- Cleared row min-height resize state immediately after committing the new minimum height.
- Cleared page margin resize state immediately after committing the new margins.
- Guarded column resize pointer movement so committed resize state cannot continue updating if it ever appears.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- This became more important after editor preview layout moved to immediate browser-side measurement; resize no longer needs to stay in a committed waiting state for server layout.

### Align Paragraph Edit And Display Rendering

Goal: Make paragraph text look the same when displayed normally and when entered for inline editing.

Completed:

- Added a browser canvas-based editor `TextMeasurer` so editor preview line breaking uses the same browser font metrics family as the inline editing surface.
- Switched editor preview pagination from the delayed server API path to immediate browser-side measurement for on-canvas editing.
- Kept the SVG-rendered paragraph lines visible while editing and made the textarea transparent so the visible text uses the same renderer in edit and display states.
- Updated the active edit fragment snapshot so its line data can refresh while preserving the maximum edit height.
- Updated the text engine checklist item for converging inline/display spacing.

Files changed:

- `src/app/editor/_components/browserTextMeasurer.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- Browser automation currently only exposed the Next Dev Tools button in its DOM snapshot, so visual confirmation in the in-app browser could not be completed from automation in this pass.
- Export still uses the server/API path; this change is focused on matching the editor display and inline edit surfaces.

### Populate Line Segments And Caret Hit Testing

Goal: Build the near-term text engine foundation for segment-aware wrapping and caret placement.

Completed:

- Populated `LineSegment` metadata from paragraph measurement.
- Preserved source offsets for measured segments using the current JavaScript/textarea index model.
- Classified measured segments as `word`, `space`, `field`, or `grapheme`.
- Added grapheme fallback for over-wide word segments so long unbroken text can wrap.
- Updated paragraph caret hit testing to prefer segment geometry before falling back to line-width ratios.
- Updated the text engine checklist to mark the completed near-term segment work.

Files changed:

- `packages/core/src/layout/measure.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- Segment `x` values are currently relative to the start of the visual line.
- The next useful step is focused wrapping fixtures/golden checks for Thai, English, mixed text, and long unbroken text.

### Add Text Engine Checklist

Goal: Capture what the text engine already has, what should be built soon, and what belongs to later phases.

Completed:

- Added `docs/TEXT_ENGINE_CHECKLIST.md`.
- Split text engine work into current foundation, near-term checklist, design rules, later work, and open questions.
- Noted that HarfBuzz/WASM should remain a future option after the current fontkit and segment contracts become limiting.

Files changed:

- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- This checklist should be updated when text measurement, line breaking, or editor reflow behavior changes.

### Scaffold Text Segment Reflow Plan

Goal: Establish the foundation for word/segment-aware line layout, caret mapping, and future resize reflow.

Completed:

- Added optional `LineSegment` metadata to measured lines.
- Added optional `segments` metadata to paginated lines.
- Passed measured line segments through pagination when present.
- Added `docs/TEXT_REFLOW_PLAN.md` to capture the three-level reflow model and staged implementation plan.

Files changed:

- `packages/core/src/layout/types.ts`
- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `docs/TEXT_REFLOW_PLAN.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.

Notes:

- Segment metadata is currently scaffolded but not populated by `measureParagraph` yet.
- Next step: populate segments from the current word breaker and add grapheme fallback for over-wide text segments.

### Align Paragraph Edit Surface Spacing

Goal: Make paragraph text look more consistent between inline editing and the engine-rendered display state.

Completed:

- Investigated why text spacing and word breaking differ between the textarea editing surface and SVG display output.
- Applied engine spacing (`spacingBefore` and `spacingAfter`) to the inline textarea.
- Removed textarea `break-word` behavior so long unbroken text is not split differently from the engine-rendered lines.

Files changed:

- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.

Notes:

- The editor still uses a native textarea while display uses engine-generated SVG lines, so perfect 1:1 wrapping will require a deeper custom editing surface or engine-driven line overlay.

### Clear Selection On Resize Start

Goal: Prevent selection or inline editing state from staying active when starting a resize interaction.

Completed:

- Updated column resize start to clear the selected node and close inline editing before resize begins.
- Updated row min-height resize start to clear the selected node and close inline editing before resize begins.
- Updated page margin resize start to clear the selected node and close inline editing before resize begins.
- Investigated the apparent early text wrapping / large blank area. The current document snapshot showed text inside multi-column rows, so the text wraps within its column while the rest of the row/page can still appear empty.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- The text wrapping observation should be revisited with a focused browser reproduction after the current in-app browser tab renders the editor normally again.

### Guard Invalid Stack Placement

Goal: Investigate and prevent invalid document states such as `body child must be paragraph, row, spacer, or table — got "stack"`.

Completed:

- Identified that `stack` nodes could be selected and dragged as standalone document sources even though stacks are structural row regions.
- Updated placement law to reject structural `stack` drag sources before creating placement operations.
- Added an editor-side validity guard so document operations that produce invalid documents are ignored instead of entering editor state.
- Fixed the `Columns` palette block to create an actual two-column row instead of falling back to a single-column row.

Files changed:

- `packages/core/src/placement/law.ts`
- `packages/core/src/document/operations.ts`
- `src/app/editor/_components/EditorShell.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check` passed.
- Reloaded `http://localhost:4000/editor` in the in-app browser and confirmed the editor renders without new browser errors.
- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.

Notes:

- This does not yet add fixture tests for placement operations; that remains a good next step for the B-track correctness work.

### Verify Node Upgrade And Browser Automation

Goal: Confirm the local Node upgrade works with the Codex in-app browser automation.

Completed:

- Confirmed `node -v` reports `v24.15.0`.
- Confirmed `npm.cmd -v` reports `11.12.1`.
- Restarted the FlowDocEditor dev server after the Node version change.
- Verified the editor route responds successfully.
- Verified Codex browser automation can inspect `http://localhost:4000/editor`.

Files changed:

- `docs/WORK_LOG.md`

Verification:

- `Invoke-WebRequest http://localhost:4000/editor` returned `200 OK`.
- Browser automation returned the editor DOM snapshot, including toolbar buttons, block palette, field palette, canvas, and outline.

Notes:

- Use `npm.cmd` in PowerShell if `npm.ps1` is blocked by execution policy.

### Resolve Dev Server Port Conflict

Goal: Fix `Failed to start server` / `EADDRINUSE` on port `4000`.

Completed:

- Confirmed port `4000` was already occupied by an existing Node/Next dev server for this same repository.
- Stopped the old process that was holding port `4000`.
- Restarted the FlowDocEditor dev server in the background.
- Reverted a temporary package script port change after confirming the real issue was a duplicate running server, not an incorrect port setting.

Files changed:

- `docs/WORK_LOG.md`

Verification:

- `npm run dev` initially reproduced `EADDRINUSE`.
- `netstat` showed port `4000` was occupied.
- `Invoke-WebRequest http://localhost:4000` returned `200 OK` after restart.

Notes:

- The app is currently available at `http://localhost:4000`.
- If this happens again, check for an already-running Next dev server before changing ports.

### Project Documentation Setup

Goal: Create a shared work log for tracking completed changes across future Codex sessions.

Completed:

- Added this work log under `docs/WORK_LOG.md`.
- Established a consistent entry format for future updates.

Files changed:

- `docs/WORK_LOG.md`

Verification:

- Documentation-only change; no code checks required.

Notes:

- Future implementation sessions should append a new entry after the work is complete.


---

### Recheck Addendum — Core/App Boundary Review

Goal: Convert implementation review findings into checklist items.

Added to `LAYOUT_ENGINE_CHECKLIST.md`:

- Assert paginated output at API/export boundaries.
- Make font asset resolution deterministic and observable.
- Expand drift comparison beyond paragraph fragments.
- Give table cells clearer fragment identity.
- Harden page-number measurement for page 10+ cases.
- Define TOC overflow policy.
- Add multi-page table-row split regression tests.
- Strengthen renderer contract tests.
- Keep checklist wording synchronized with implementation status.

Added to `TEXT_ENGINE_CHECKLIST.md`:

- Make server font loading observable.
- Add real-font drift fixtures for Thai and exact-boundary cases.
- Separate preview drift warnings from authoritative export failures.

Notes:

- The core direction remains aligned with the engineering principles.
- Most added items are correctness guards at boundaries, not architecture rewrites.

---

### Stabilize Long Inline Edit Height

Goal: Keep paragraph inline editing stable when a textarea grows past roughly 4-6 visual lines.

Completed:

- Added a temporary editor-preview geometry path for active inline edits.
- `ParagraphTextSurface` now reports the live textarea content height while typing.
- `EditorShell` applies that height to the active paragraph fragment and shifts later fragments on the same page by the height delta.
- Kept the active paragraph's text layout owned by the textarea during editing; full pagination still reconciles on edit end.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run type-check`
- `npm.cmd test`
- Browser-tested a paragraph by replacing it with a 5-6+ line probe, confirming lower fragments moved down during editing, then restored the original text.

Notes:

- The current saved browser document still triggers `/api/paginate` 500 and shows the layout-error badge; this appears separate from the inline edit height preview because the API receives only the document model, not the temporary edit geometry.
- Follow-up fix: converted the reported textarea height from screen pixels back into document units before updating the preview fragment. Without this, canvas scales above/below 1 could create a feedback loop where the paragraph grew downward while typing.
- Follow-up browser verification: a short Thai probe stayed at `20.07` before/after waiting, and a longer wrapped probe grew to `49` and stayed stable instead of continuing to expand.

---

### Harden Plain Textarea Inline Editing

Goal: Keep the temporary textarea editor stable while the WYSIWYG track is built in parallel.

Completed:

- Exported and reused a shared `isPlainTextParagraph` guard.
- Blocked textarea/property-panel text rewrites for mixed inline paragraphs.
- Keyed active inline textarea instances by page/fragment slice and continuation offset.
- Snapped split and selection-delete offsets to grapheme boundaries for the structural split helper.
- Let inline paragraph textareas keep native multiline Enter behavior and avoid body-paragraph merge at the true table-cell start.
- UX-smoke follow-up: structural merge now cancels stale blur finalization, refreshes pagination immediately, and keeps textarea text visible instead of reusing stale SVG snapshots.
- Changed textarea emergency wrapping from `anywhere` to `break-word` so long typing uses more natural browser line wrapping while the textarea bridge is active.
- Confirmed long active paragraph editing can move the textarea to a continuation slice on page 2 while keeping caret focus.
- Captured margin-resize-with-table UX risk: the table reflows when margins move, but transparent margin hit areas make the interaction hard to discover/control.

Files changed:

- `packages/core/src/document/operations.ts`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/PropertyPanel.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- Isolated Chromium CDP smoke: typed Thai/English paragraph text, verified plain Enter stays in the same paragraph as a newline, verified structural Backspace merge keeps visible edit text aligned with the merged textarea, then checked table-cell multiline Enter and true-start Backspace.
- Isolated Chromium CDP smoke follow-up: typed long text one character at a time until multiple wraps, inserted a newline with Enter, extended the paragraph across page 2, and dragged the left page margin with a table present.

---

### Restore Document-Rendered Inline Typing Visuals

Goal: Make active paragraph typing feel like editing the document text itself, not a detached textarea layout.

Completed:

- Reproduced the user-style long English typing case with isolated Chromium CDP by inserting characters one at a time until the paragraph wrapped.
- Confirmed the active editor was still showing native textarea text during typing while normal SVG/document text appeared only after blur.
- Removed the per-session visual lock that kept textarea glyphs visible after the first keyboard/input interaction.
- Changed inline edit preview pagination to run immediately while typing so fresh SVG lines can become the visible layer as soon as the active draft updates.
- Updated the inline edit contract so `fragment.lines` remains the visual truth during active typing, with textarea text only as a stale-frame or composition fallback.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- Isolated Chromium CDP smoke: typed continuous English characters one at a time until wrapping; active textarea text was transparent, active SVG lines matched the after-blur SVG lines, and Enter inserted a newline in the same paragraph while keeping renderer-visible text.

---

### Add Collapsed WYSIWYG Caret Foundation

Goal: Start the minimum viable WYSIWYG path by making the active caret come from
the same paginated SVG geometry as visible paragraph text.

Completed:

- Accepted the WYSIWYG plan direction: SVG text visual, custom collapsed caret,
  point-to-offset hit testing, textarea input fallback, and conservative
  IME/native fallback rules.
- Passed the browser text measurer into canvas paragraph surfaces so caret
  overlay placement can use the same measurement source as editor preview
  pagination.
- Rendered a custom SVG collapsed caret from
  `resolveCollapsedCaretOverlayInFragment(...)` when the active edit visual is
  fresh, the textarea selection is collapsed, and composition is inactive.
- Hid the native textarea caret only when a custom caret was successfully
  resolved; missing geometry, range selection, and composition fall back to the
  native textarea visual/caret path.
- Kept selection overlay, hidden input mode, and cross-page selection deferred.

Files changed:

- `src/app/editor/_components/EditorShell.tsx`
- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/ParagraphTextSurface.tsx`
- `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- Isolated Chromium CDP smoke: opened a plain paragraph, typed `abcd`, confirmed
  textarea glyphs and native caret were transparent, confirmed one
  `data-wysiwyg-caret` SVG line was present, then typed long continuous English
  text until wrapping and confirmed the custom caret followed the rendered last
  line.

Follow-up hardening:

- Passed the editor browser text measurer into point-to-offset hit testing in
  `EditorCanvas` so initial click-to-caret mapping uses the same measurement
  source as preview rendering and custom caret placement.
- Made missing custom-caret geometry fall back to visible textarea text/native
  caret instead of showing SVG text with no custom caret.
- Updated browser smoke docs to match the WYSIWYG-first direction: fresh drafts
  should return to SVG/custom-caret visuals, while stale geometry, range
  selection, and composition use native textarea fallback.
- Added a focused policy regression that keeps textarea text visible when the
  document visual layer is otherwise eligible but custom caret geometry is
  missing.

Follow-up verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`
- Isolated Chromium CDP smoke: opened a plain paragraph, typed `abcdef`, and
  confirmed the collapsed edit state used transparent textarea glyphs/native
  caret plus one SVG `data-wysiwyg-caret` line.

---

### Harden WYSIWYG Point-To-Offset Precision

Goal: Make click-to-caret mapping use measured caret candidates instead of
guessing offsets from segment-width ratios.

Completed:

- Changed `resolveCaretOffsetFromPointInFragment(...)` to build grapheme-safe
  caret candidates for the selected visual line, then choose the candidate with
  the nearest measured `x` position to the click point.
- Preserved the existing null fallback when line segment geometry is unavailable.
- Added a variable-width glyph regression where the old ratio approach would
  choose a deeper offset than the nearest measured candidate.
- Added an emoji ZWJ regression that keeps point-to-offset results on valid
  grapheme boundaries.
- Updated the WYSIWYG roadmap to make measured candidate-distance mapping the
  Stage 4 rule.

Files changed:

- `src/app/editor/_components/wysiwygCaretMapping.ts`
- `src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WORK_LOG.md`

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygCaretMapping.test.ts`
- `npm.cmd run type-check`
- `npm.cmd test`

---

### Make Package V2 The Default JSON Export

Goal: Finish the short package-v2 transition by making the visible JSON export
path write the same canonical package shape as localStorage.

Completed:

- Changed `CURRENT_PACKAGE_VERSION` to `2` and kept package v1 under an explicit
  legacy package constant/helper.
- Made `migratePersistedDocumentPackage(...)` return package v2 for legacy raw
  documents and package v1 input, while keeping `parsePersistedDocument(...)`
  parse-only so legacy/raw imports can still be identified by the editor.
- Changed the toolbar `Save JSON` action to write package v2 with the active
  field registry and removed the temporary visible `Save v2` action.
- Kept package v1 as import/migration compatibility only.
- Updated package contract, proposal, fixture, smoke, docs-index, and test
  strategy notes to describe package v2 as the current persisted/editor JSON
  format.
- Updated persistence tests so default JSON export, localStorage, migration,
  and field-registry-preserving export coverage all point at package v2.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run test:app`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/realFontDrift.test.ts`
- `npm.cmd run test:app`
- `npm.cmd run type-check`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check` passed with only LF-to-CRLF working-copy warnings.

---

### Harden Active Registry Field Placement

Goal: Improve the document/field placement foundation without adding publish,
reviewer, history, or registry-management workflows.

Completed:

- Changed the Field palette to read from the active package `FieldRegistryV1`
  instead of the static sample list.
- Kept the sample registry as the fallback for new documents and legacy/package
  v1 inputs.
- Passed the active registry into the property panel.
- Added property-panel fieldRef inspection for selected paragraphs and selected
  table cells, showing key, label, fallback, and registry status.
- Kept fieldRef details read-only so this does not become a registry editor yet.
- Extended editor smoke with a custom package v2 registry fixture to verify the
  Field palette and property-panel fieldRef details use the package registry.
- Updated architecture, field registry, fixture, smoke, package proposal, and
  test-strategy docs around active registry placement.

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check` passed with only LF-to-CRLF working-copy warnings.

---

### Add Document-Safe FieldRef Metadata Editing

Goal: Finish the small field authoring ergonomics slice before returning focus
to the main document editor experience.

Completed:

- Added `updateFieldRefInline(...)` to core document operations so inline
  fieldRef metadata edits pass through the same reducer/history path as other
  document mutations.
- Allowed property-panel edits for inline `fieldRef.label` and
  `fieldRef.fallback` in selected paragraphs and table-cell paragraphs.
- Kept fieldRef key and registry field type read-only to avoid premature key
  rename/type-change workflow decisions.
- Added focused core operation tests for body paragraphs, table-cell
  paragraphs, and clearing optional label/fallback.
- Extended editor smoke to edit fieldRef label/fallback and verify package v2
  autosaves the updated metadata.
- Updated field registry, package proposal, fixture, smoke, and test-strategy
  docs.

Verification:

- `npm.cmd run test -w packages/core -- src/document/operations.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check` passed with only LF-to-CRLF working-copy warnings.

Notes:

- The first app-suite run hit a 10-second Chromium launch timeout in
  `realFontDrift.test.ts`; the focused real-font test and the repeated app
  suite both passed.

---

### Persist Document-Bound Data Snapshots In Package V2

Goal: Keep the next layer focused on document creation and data placement by
restoring current Fill mode values without introducing history, reviewer, or
workflow state.

Completed:

- Added typed `data?: DataSnapshotV1` support to `FlowDocPackageV2`.
- Kept scalar snapshot values outside `DocumentNode`; binding still resolves a
  temporary preview/export document only.
- Saved localStorage package v2 with the active field registry and current Fill
  mode data snapshot.
- Exported `Save JSON` package v2 with the active field registry and current
  data snapshot.
- Restored package v2 `data` back into Fill mode when opening JSON or loading
  localStorage.
- Rejected structurally invalid package data snapshots while keeping readiness
  validation separate from package validity.
- Extended editor smoke to confirm filled values are autosaved under
  `data.values`.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run test:app`
- `npm.cmd test`
- `npm.cmd run smoke:editor`
- `git diff --check` passed with only LF-to-CRLF working-copy warnings.

---

### Align Package V2 And WYSIWYG Documentation Status

Goal: Remove stale wording that made package v2 look like a future proposal and
made the WYSIWYG default-editor status ambiguous.

Completed:

- Updated architecture docs to describe current editor JSON writes as
  `FlowDocPackage v2`, with legacy package v1/raw document import
  compatibility.
- Reframed the package v2 proposal doc as current v2 evolution notes plus
  deferred layers.
- Updated package/test/fixture wording so package v2 is the current persisted
  format and package v1 is legacy compatibility.
- Clarified the WYSIWYG roadmap: collapsed-caret and hit-testing foundations
  are enabled for default plain paragraph editing, but the track remains
  guarded/experimental until stability gates pass.

Verification:

- `git diff --check`

---

### Add WYSIWYG Stability Gate Smoke Coverage

Goal: Keep WYSIWYG inline editing guarded while expanding real browser evidence
for the fragile default-editor paths.

Completed:

- Added a WYSIWYG inline edit enablement guard that defaults on outside
  production and off by default in production unless explicitly enabled.
- Made new inline edit sessions start with stale visual freshness until browser
  pagination marks the current draft snapshot fresh.
- Kept composition fallback higher priority than stale visual fallback so IME
  states clearly use visible native textarea behavior.
- Extended automated editor smoke for Thai/composition fallback, fieldRef
  paragraph non-editability, table-cell boundary Backspace, continuation
  fragment editing, focus-preserving reflow, undo/redo, and continuation
  boundary Backspace.
- Updated smoke/test/fixture/WYSIWYG docs with the new stability gate coverage
  and current suite counts.

Verification:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/useInlineEditSession.test.ts src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts`
- `npm.cmd run smoke:editor`
- `npm.cmd test`
- `git diff --check`

---

### Tighten Experimental WYSIWYG Stability Gate

Goal: Treat the current WYSIWYG inline edit path as opt-in experimental and
expand browser/runtime evidence without adding selection, clipboard, hidden
input, or new WYSIWYG stages.

Completed:

- Changed `resolveWysiwygInlineEditEnabled(...)` so the experimental WYSIWYG
  path is disabled by default in every environment unless
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT` is explicitly enabled.
- Updated the automated editor smoke server to set
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT=1`, keeping WYSIWYG coverage
  deliberate instead of ambient dev behavior.
- Extended continuation smoke coverage to require a three-fragment paragraph,
  type from the first fragment until caret/page tracking relocates the active
  textarea to a continuation slice, preserve focus, and verify undo/redo as one
  edit session.
- Kept continuation click/edit and continuation-boundary Backspace as a
  separate browser fixture page so the smoke reports clearer gate failures.
- Added a compatibility comment to `inlineEditCaret.ts` clarifying that
  `wysiwygCaretMapping.ts` is the source of truth.
- Updated WYSIWYG, browser smoke, fixture catalog, and test-strategy docs to
  match the opt-in experimental status and current suite counts.

Verification:

- `npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygInlineEditConfig.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/inlineEditCaret.test.ts`
- `npm.cmd run smoke:editor`
- `npm.cmd run type-check`
- `npm.cmd test`
- `git diff --check`

Notes:

- A combined browser sequence that performed page-tracking undo/redo and then
  immediately re-entered a continuation fragment was not stable enough to use
  as a single smoke gate. The smoke now separates those checks, and that
  combined runtime scenario remains a follow-up before any production-stable
  WYSIWYG claim.
- Production-stable WYSIWYG remains deferred; selection overlay, clipboard
  model, real OS IME stress, accessibility hardening, and missing-geometry
  browser mutation checks are not implemented in this slice.
