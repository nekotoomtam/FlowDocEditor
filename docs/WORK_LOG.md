# Work Log

This document tracks completed work on FlowDocEditor so future sessions can quickly see what changed, what was verified, and what remains open.

## Log Format

Each entry should include:

- Date/time
- Goal
- Summary of completed work
- Files changed
- Verification performed
- Notes or follow-ups

---

## 2026-05-08

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
