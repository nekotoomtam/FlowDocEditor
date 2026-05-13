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
document.querySelectorAll('textarea[data-inline-edit-node-id]').length
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
- `textarea[data-inline-edit-node-id]` count is `0`.
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
- The active Windows input-method list could not be read reliably from the
  current sandboxed shell session; mark the real OS IME rows `UNKNOWN` until a
  human or unrestricted desktop session records them.
- The automated Stage 4C smoke remains required before and after manual runs.
