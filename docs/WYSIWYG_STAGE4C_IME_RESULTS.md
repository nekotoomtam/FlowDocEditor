# WYSIWYG Stage 4C+5 Evidence

Date: 2026-05-13

This records the Stage 4C evidence checkpoint for clipboard, synthetic IME,
selection, DOM accessibility status, and performance-trace behavior in the
FlowDoc-owned WYSIWYG text engine. It is intentionally split from
`docs/WYSIWYG_STAGE4C_IME_MATRIX.md`: this file records what was actually run,
while the matrix remains the required real OS IME gate.

## Scope

Covered:

- Automated Stage 4C clipboard and synthetic composition smoke.
- Same-fragment double-click word selection through FlowDoc selection offsets.
- Cross-fragment same-paragraph selection overlays on active and continuation
  fragments.
- Cross-fragment same-paragraph pointer drag selection across active and
  continuation fragments.
- DOM live accessibility status for caret and selected-range state.
- Performance trace separation between immediate text input and browser preview
  pagination.
- Live page-boundary continuation preview with downstream overlap assertions.
- Heavy row-stack paragraph editing with text-engine eligibility, no textarea
  fallback, one target fragment, one pointer fragment, and row/stack geometry
  alignment.
- Installed Chrome browser-channel run through Playwright for the Stage 4C+4
  gate.
- Installed Edge browser-channel run through Playwright for the Stage 4C+4
  gate.
- Local Windows browser and input-method inventory.

Not covered:

- Human Thai IME typing through the Windows language switcher.
- Human-perceived composition candidate window behavior.
- Full screen reader product validation beyond DOM status wiring.
- Cross-fragment edit semantics beyond automated same-paragraph selection.
- Table-cell text-engine editing or export.
- Independent row/column continuation across pages.

## Environment

- OS: Windows local desktop session.
- Culture: `en-US`.
- UI culture: `en-US`.
- Installed input methods found with `Get-WinUserLanguageList`:
  - Thai: `th`, input method `041E:0000041E`.
  - English US: `en-US`, input method `0409:00000409`.
- Installed Chrome: `148.0.7778.97`.
- Installed Edge: `148.0.3967.54`.
- Historical baseline before Stage 4C evidence logging: `2a5d32a Add WYSIWYG Stage 4C IME matrix`.

## Commands Run

The latest browser smoke runs used the already-running flagged local dev server
at `http://localhost:4000/editor`. Starting an isolated smoke server without
`SMOKE_BASE_URL` was blocked by the Next dev-server lock for this repo because
that server was already active.

```powershell
$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c
```

Result: `PASS`.

Observed output included:

- `browser.channel`: `bundled-chromium`.
- `performanceTrace.draftUpdates`: `1`.
- `performanceTrace.browserPreviewPaginations`: `0` for the immediate heavy
  input check.
- `doubleClickSelection.selectionOverlay`: `visible`.
- `clipboard.pasteMarker`: `S4C_AUTOMATED_PASTE`.
- `clipboard.crlfMarker`: `S4C_AUTOMATED_CRLF`.
- `clipboard.cutMarker`: `CUTME4C`.
- `clipboard.pointerDragSelection`: `multiple-pages`.
- `composition.compositionMarker`: `IME4Cทดสอบ`.
- `stackParagraph.marker`: `STAGE4_STACK_MARKER`.
- `stackParagraph.targetFragments`: `1`.
- `stackParagraph.pointerFragments`: `1`.
- `stackParagraph.rowHeight`: `571`.

```powershell
$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c
```

Result: `PASS`.

Observed output included:

- `browser.channel`: `chrome`.
- `performanceTrace.draftUpdates`: `1`.
- `performanceTrace.browserPreviewPaginations`: `0` for the immediate heavy
  input check.
- `doubleClickSelection.selectionOverlay`: `visible`.
- Clipboard, pointer drag selection, and synthetic composition markers matched
  the bundled Chromium run.
- Row-stack paragraph marker, fragment count, pointer-fragment count, and
  row-height result matched the bundled Chromium run.
- One ignored browser-generated console message for
  `http://localhost:4000/favicon.ico`. No editor, API, layout, or page error was
  reported.

```powershell
$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c
```

Result: `PASS`.

Observed output included:

- `browser.channel`: `msedge`.
- `performanceTrace.draftUpdates`: `1`.
- `performanceTrace.browserPreviewPaginations`: `0` for the immediate heavy
  input check.
- `doubleClickSelection.selectionOverlay`: `visible`.
- Clipboard, pointer drag selection, and synthetic composition markers matched
  the bundled Chromium run.
- Row-stack paragraph marker, fragment count, pointer-fragment count, and
  row-height result matched the bundled Chromium run.
- One ignored browser-generated console message for
  `http://localhost:4000/favicon.ico`. No editor, API, layout, or page error was
  reported.

## Result Matrix

| Environment | Automated result | Manual real-IME result | Status |
|---|---:|---:|---|
| Bundled Chromium, Stage 4C+5 automated gate | PASS | N/A | PASS |
| Windows Chrome 148, Stage 4C+5 browser automation | PASS | UNKNOWN | RISK |
| Windows Chrome 148, Thai IME | Synthetic composition PASS | UNKNOWN | UNKNOWN |
| Windows Edge 148, Stage 4C+5 browser automation | PASS | UNKNOWN | RISK |
| Windows Edge 148, Thai IME | Synthetic composition PASS | UNKNOWN | UNKNOWN |

## Review Terms

PASS:

- The repeatable Stage 4C+5 smoke now passes on bundled Chromium, installed
  Chrome, and installed Edge with perf/accessibility coverage.
- The smoke covers heavy plain-text paste, CRLF normalization, FlowDoc selection
  copy/cut, Escape commit, editor-shell focus restoration, keyboard undo/redo,
  page-boundary reflow, same-fragment double-click selection, cross-fragment
  selection overlays, same-paragraph cross-fragment pointer drag selection,
  live continuation overlap protection, heavy row-stack paragraph editing that
  stays one fragment inside the atomic row, DOM accessibility status updates,
  perf trace critical-lane separation, no inline textarea, no layout error, and
  synthetic IME duplicate suppression.

RISK:

- Chrome and Edge automatically request `/favicon.ico`; the script ignores only
  that browser-generated 404 console message. Any other console, page, 4xx, or
  5xx error still fails the smoke.
- Browser-channel automation proves the installed browser engines can run the
  Stage 4C path, but it does not prove human OS IME candidate-window behavior.
- Installed Chrome and Edge rows should be rerun after any future smoke-gate
  behavior change before using this file as release evidence for those channels.

UNKNOWN:

- Real Windows Thai IME rows remain `UNKNOWN` until a human types through the
  Windows Thai input method in Chrome and Edge and records the matrix cases.
- This checkpoint should not raise Stage 4C confidence into the 9.2-9.5 range
  by itself.

## Minimal Next Patch

Run the manual matrix in `docs/WYSIWYG_STAGE4C_IME_MATRIX.md` for Windows Chrome
and Windows Edge with the Thai input method active. Record the browser versions,
input method, all eight case results, console/page errors, and any screenshots
or video if a mismatch appears.
