# WYSIWYG Stage 4C Real IME Matrix

This matrix is the real-world verification gate for Stage 4C clipboard and IME
behavior. It complements `npm.cmd run smoke:wysiwyg-stage4c`, which protects the
synthetic browser event path, but it does not replace real OS input-method
testing.

## Status Terms

- `PASS`: The case was run exactly enough to prove the expected behavior.
- `FAIL / BLOCKER`: The case reproduces a user-visible mismatch, duplicate
  input, missing text, layout error, unexpected textarea visual truth, or broken
  undo/redo.
- `RISK`: The case passed with a caveat that should affect release confidence.
- `UNKNOWN`: The case was not run or the evidence was not strong enough.

Do not raise Stage 4C confidence to the 9.2-9.5 range from automation alone.
The minimum real-IME gate is Windows Chrome and Windows Edge with Thai IME.

## Scope

Covered:

- Hidden text-engine input bridge during real OS input.
- Thai IME composition and committed text.
- English control typing.
- Plain-text clipboard from outside the app.
- FlowDoc selection copy/cut.
- Escape commit, editor focus restoration, and keyboard undo/redo.
- Page-boundary reflow in the `wysiwyg-stage3-boundary` scenario.

Not covered:

- Accessibility announcements or screen reader behavior.
- Cross-fragment selection.
- Table-cell text-engine editing.
- Export/PDF/DOCX rendering.
- Mobile/browser virtual keyboards.

## Preflight

1. Confirm the automated Stage 4C gate passes:

   ```powershell
   npm.cmd run smoke:wysiwyg-stage4c
   ```

   When installed-browser evidence is needed, also run:

   ```powershell
   $env:SMOKE_BROWSER_CHANNEL="chrome"
   npm.cmd run smoke:wysiwyg-stage4c
   Remove-Item Env:SMOKE_BROWSER_CHANNEL

   $env:SMOKE_BROWSER_CHANNEL="msedge"
   npm.cmd run smoke:wysiwyg-stage4c
   Remove-Item Env:SMOKE_BROWSER_CHANNEL
   ```

   These browser-channel runs are still automation. They do not replace the
   manual Windows Thai IME rows below.

2. Stop other Next dev servers for this repo. Next dev holds a per-repo lock.

3. Start a flagged manual server:

   ```powershell
   $env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE="1"
   $env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT="1"
   $env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE="1"
   npm.cmd run dev
   ```

4. Open:

   ```text
   http://localhost:4000/editor?flowdocTestScenario=wysiwyg-stage3-boundary
   ```

5. Record browser, OS, keyboard, and input method details before testing.

Useful DevTools probes:

```js
document.querySelectorAll('textarea[data-inline-edit-node-id][data-wysiwyg-input-bridge="true"]').length
document.querySelectorAll('textarea[data-inline-edit-node-id]:not([data-wysiwyg-input-bridge="true"])').length
document.querySelectorAll('[data-wysiwyg-input-bridge="true"]').length
document.querySelectorAll('[data-testid="layout-error-badge"]').length
document.activeElement === document.querySelector('[data-testid="editor-shell"]')
```

## Required Environment Matrix

| Date | OS | Browser | Browser version | Input method | Automated gate | Manual result | Notes |
|---|---|---|---|---|---|---|---|
| YYYY-MM-DD | Windows | Chrome |  | English US | UNKNOWN | UNKNOWN | Control row |
| YYYY-MM-DD | Windows | Chrome |  | Thai Kedmanee or active Thai IME | UNKNOWN | UNKNOWN | Required real-IME row |
| YYYY-MM-DD | Windows | Edge |  | English US | UNKNOWN | UNKNOWN | Control row |
| YYYY-MM-DD | Windows | Edge |  | Thai Kedmanee or active Thai IME | UNKNOWN | UNKNOWN | Required real-IME row |

Optional rows:

- Thai Pattachote, if installed.
- Firefox, if WYSIWYG text-engine support is intentionally broadened.
- A non-Windows OS only after Windows Chrome/Edge pass.

## Case Set

Run every case in each required browser. Use the same document scenario unless a
case explicitly says to reset.

### Case 1: Edit Entry And Bridge Ownership

Steps:

1. Open the Stage 3 boundary scenario.
2. Confirm `stage3-boundary-target` starts as one fragment.
3. Click the target paragraph.
4. Check DevTools probes.

Expected:

- One hidden `data-wysiwyg-input-bridge="true"` exists.
- Non-bridge `textarea[data-inline-edit-node-id]` count is `0`.
- No layout error badge.
- Visible text remains SVG/document-rendered.

### Case 2: English Control Typing

Steps:

1. Press End.
2. Type ` EN4C-control-123`.
3. Press Escape.
4. Press Ctrl+Z, then Ctrl+Y.

Expected:

- Text appears once, with no duplicate or missing characters.
- Escape commits and returns focus to the editor shell.
- Ctrl+Z removes the typed text.
- Ctrl+Y restores it.
- No inline textarea appears and no layout error appears.

### Case 3: Thai IME Basic Commit

Steps:

1. Reset the scenario or undo back to the original target.
2. Click the target paragraph and press End.
3. Switch to the Thai IME.
4. Type a short committed phrase, for example `ทดสอบภาษาไทย`.
5. Watch composition and committed output while typing.
6. Press Escape, then Ctrl+Z and Ctrl+Y.

Expected:

- Intermediate composition does not create duplicated visible text.
- Final committed Thai text appears exactly once.
- No partial composition text remains in the hidden bridge.
- Escape/Undo/Redo behavior matches Case 2.
- No inline textarea appears and no layout error appears.

### Case 4: Thai Mixed Text And Punctuation

Steps:

1. Reset or undo to a clean target.
2. Type a mixed string with Thai, spaces, numbers, and punctuation, for example
   ` ราคา 1,234.50 บาท ทดสอบ-IME`.
3. Move with ArrowLeft/ArrowRight across the committed text.
4. Press Backspace once near Thai text.

Expected:

- Text order is correct.
- No duplicate digits, punctuation, or Thai clusters.
- Arrow movement does not corrupt selection or caret state.
- Backspace removes one expected grapheme/cluster, not a random code unit.

### Case 5: Heavy Plain-Text Paste From Outside The App

Steps:

1. Copy this payload from Notepad or another external app:

   ```text
   S4C_MANUAL_PASTE
   ภาษาไทย clipboard จริง
   English clipboard line
   layoutheavy4clayoutheavy4clayoutheavy4clayoutheavy4clayoutheavy4clayoutheavy4c
   CUTME4C
   ```

2. Click the target paragraph, press End, then Ctrl+V.
3. Confirm the target crosses from one fragment to at least two fragments.

Expected:

- All pasted lines appear in SVG text.
- Line breaks render as document line breaks.
- The target paginates to at least two fragments.
- No inline textarea appears and no layout error appears.

### Case 6: FlowDoc Selection Copy And Cut

Steps:

1. After Case 5, press End.
2. Select `CUTME4C` with Shift+ArrowLeft.
3. Press Ctrl+C.
4. Paste into Notepad and confirm the clipboard contains exactly `CUTME4C`.
5. Return to the editor and press Ctrl+X.
6. Paste into Notepad again and confirm the clipboard still contains exactly
   `CUTME4C`.

Expected:

- Copy does not remove the marker.
- Cut removes the marker from SVG text.
- Clipboard text is exactly the selected marker.
- The selection overlay collapses after cut.
- No inline textarea appears and no layout error appears.

### Case 7: Commit, Undo, Redo After Heavy Paste/Cut

Steps:

1. After Case 6, press Escape.
2. Confirm editor shell focus with the DevTools probe.
3. Press Ctrl+Z.
4. Press Ctrl+Y.

Expected:

- Undo removes the pasted payload and returns the target to one fragment.
- Redo restores the pasted payload and multi-fragment layout.
- Redo does not restore the previously cut `CUTME4C` marker.
- No inline textarea appears and no layout error appears.

### Case 8: Repeat Edit Lifecycle

Steps:

1. Enter edit, type a short English marker, Escape.
2. Enter edit again, type a short Thai marker through the Thai IME, Escape.
3. Undo twice, redo twice.

Expected:

- Each edit session is one undo history entry.
- Re-entering edit does not reuse stale hidden bridge text.
- Thai committed output does not duplicate across sessions.

## Current Editor Lifecycle Addendum

Run this addendum when a patch touches blur commit, structural Enter, list
level, table-cell editing, or Outline rendering/reorder behavior. These rows do
not replace the eight required Stage 4C cases above; they narrow the real-IME
UNKNOWNs for the current editor lifecycle risks.

### Addendum A: Stress Thai Paragraph Blur

Automated preflight:

```powershell
$env:FLOWDOC_PROBE_FILE="public/mock/flowdoc-stress-mock.flowdoc.json"
$env:PROBE_TARGET_NODE_ID="p_00104"
$env:PROBE_TARGET_PAGE_INDEX="12"
$env:PROBE_MODE="blur-handoff"
$env:PROBE_READY_TIMEOUT_MS="240000"
npm.cmd run smoke:wysiwyg-smoothness
```

Expected automated result:

- `ok=true`.
- `blurHandoff.appendedTextCommitted=true`.
- `console.errors` and `console.pageErrors` are empty.
- If Outline perf tracing is enabled, the largest Outline commit records
  `outlineVirtualized=true`, a high `outlineFlatRowCount`, and a much smaller
  `outlineRenderedRowCount`.

Manual real-IME follow-up:

1. Use the same flagged editor build.
2. Enter a large Thai document or the stress mock through the available local
   mock/document loader.
3. Edit a paragraph near a page boundary.
4. Type committed Thai text through the Windows Thai IME.
5. Click outside the paragraph.

Expected:

- The committed Thai text remains visible after blur.
- The hidden input bridge does not keep stale text after commit.
- Outline keeps the stable label while editing and updates after blur.
- No layout error, console error, or page error appears.

### Addendum B: Table Cell Thai Blur

Automated preflight:

```powershell
npm.cmd run smoke:wysiwyg-table-cell-boundary
```

Expected automated result:

- `ok=true`.
- The target cell paragraph splits across at least two pages/fragments.
- The active visual mode is `flowdoc-draft-editor-island` with exactly one
  hidden input bridge and no native or legacy textarea fallback.
- `console.errors` and `console.pageErrors` are empty.

Steps:

1. Open `/editor?flowdocTestScenario=wysiwyg-stage3-boundary`.
2. Edit `stage3-table-cell-target` inside the table cell.
3. Type Thai text through the Windows Thai IME.
4. Click outside the cell and then undo/redo once.

Expected:

- The cell paragraph commits the Thai text exactly once.
- The table cell remains the selection/property-panel owner.
- Undo/redo operates as one intentional edit entry.
- No body-paragraph page-boundary preview is used as table truth.

### Addendum C: List Level Thai Draft

Automated preflight:

```powershell
npm.cmd run smoke:wysiwyg-list-level-draft
npm.cmd test -- src/app/editor/_components/__tests__/wysiwygTextInteraction.test.ts src/app/editor/_components/__tests__/ListToolbar.test.ts src/app/editor/_components/__tests__/editorReducerRichText.test.ts
```

Expected automated result:

- Browser smoke starts an active rich draft on a list item, inserts text,
  changes list level through the toolbar, resumes editing, blurs, and verifies
  undo/redo around the post-level-change edit. It then resumes the same list
  draft and verifies `Shift+Tab` outdent plus `Tab` indent through the keyboard
  path, including no-op `Tab`/`Shift+Tab` cases at clamped list boundaries.
- Reducer coverage preserves latest draft text and caret through
  `CHANGE_LIST_ITEM_LEVEL`.
- Interaction coverage keeps Tab/native keyboard handling separate from
  explicit list-level commands.

Steps:

1. Create or select a list item in the active document.
2. Type Thai text through the Windows Thai IME without leaving edit mode.
3. Change level with the list indent/outdent command.
4. Continue typing, then blur.

Expected:

- Draft Thai text is preserved before and after the level change.
- The visible marker is derived from list metadata, not inserted into paragraph
  text.
- Refocus returns to the same logical list item with the expected caret.
- One level-change action does not duplicate undo history for the typed text.

### Addendum D: Outline Reorder After Edit

Automated preflight:

```powershell
npm.cmd run smoke:outline-panel
```

Expected automated result:

- `ok=true`.
- The stress Outline is virtualized and renders far fewer rows than the total
  row count.
- Reordering `cover_project` after `cover_note` updates persisted body order.
- `console.errors`, `console.pageErrors`, and resource errors are empty.

Steps:

1. Finish an active paragraph edit with Thai committed text.
2. Drag a direct body child in the Outline before or after another direct body
   child in the same body.
3. Undo and redo the reorder.

Expected:

- The active edit is finalized before reorder.
- The reorder request stays inside the same section/body.
- Self-drops or cross-body drops do nothing.
- Undo/redo restores document order and selection without changing paragraph
  text.

## Evidence Template

Use this block for each browser/input-method row:

```text
Date:
Commit:
OS:
Browser/version:
Input method:
Automated baseline command/result:
Case 1:
Case 2:
Case 3:
Case 4:
Case 5:
Case 6:
Case 7:
Case 8:
Screenshots/video:
Console/page errors:
Result: PASS / FAIL / BLOCKER / RISK / UNKNOWN
Notes:
Minimal next patch:
```

## Fail / Blocker Rules

Mark the row `FAIL / BLOCKER` if any of these happen:

- Visible text differs between normal view and edit view after layout settles.
- Thai composition commits duplicate text or drops committed text.
- Pasted text appears only in the hidden bridge or textarea instead of SVG text.
- An inline textarea becomes visible in the text-engine lane.
- `CUTME4C` copy/cut clipboard text is wrong.
- Ctrl+Z/Ctrl+Y does not operate after Escape commit.
- A layout error badge appears.
- Browser console/page errors appear during the case.

## Current Session Notes

- Chrome and Edge executables were found on this Windows machine.
- `Get-WinUserLanguageList` found Thai `041E:0000041E` and English US
  `0409:00000409` input methods installed.
- Stage 4C+3 automated evidence is recorded in
  `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`.
- Installed Chrome and Edge browser-channel automation is useful evidence, but
  the real OS IME rows remain `UNKNOWN` until a human or unrestricted desktop
  session records them.
- The automated Stage 4C smoke remains required before and after manual runs.
