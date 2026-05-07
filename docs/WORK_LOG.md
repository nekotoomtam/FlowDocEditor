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

## 2026-05-07

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
