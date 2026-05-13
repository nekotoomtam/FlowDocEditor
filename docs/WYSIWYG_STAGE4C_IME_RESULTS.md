# WYSIWYG Stage 4C+3 IME Evidence

Date: 2026-05-13

This records the Stage 4C+3 evidence checkpoint for clipboard and IME behavior
in the FlowDoc-owned WYSIWYG text engine. It is intentionally split from
`docs/WYSIWYG_STAGE4C_IME_MATRIX.md`: this file records what was actually run,
while the matrix remains the required real OS IME gate.

## Scope

Covered:

- Automated Stage 4C clipboard and synthetic composition smoke.
- Installed Chrome browser-channel run through Playwright.
- Installed Edge browser-channel run through Playwright.
- Local Windows browser and input-method inventory.

Not covered:

- Human Thai IME typing through the Windows language switcher.
- Human-perceived composition candidate window behavior.
- Accessibility announcements, table-cell text-engine editing, export, or
  cross-fragment selection.

## Environment

- OS: Windows local desktop session.
- Culture: `en-US`.
- UI culture: `en-US`.
- Installed input methods found with `Get-WinUserLanguageList`:
  - Thai: `th`, input method `041E:0000041E`.
  - English US: `en-US`, input method `0409:00000409`.
- Installed Chrome: `148.0.7778.97`.
- Installed Edge: `148.0.3967.54`.
- Base commit before this evidence patch: `2a5d32a Add WYSIWYG Stage 4C IME matrix`.

## Commands Run

```powershell
npm.cmd run smoke:wysiwyg-stage4c
```

Result: `PASS`.

Observed output included:

- `browser.channel`: `bundled-chromium`.
- `clipboard.pasteMarker`: `S4C_AUTOMATED_PASTE`.
- `clipboard.crlfMarker`: `S4C_AUTOMATED_CRLF`.
- `clipboard.cutMarker`: `CUTME4C`.
- `composition.compositionMarker`: `IME4Cทดสอบ`.

```powershell
$env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c; $code=$LASTEXITCODE; Remove-Item Env:SMOKE_BROWSER_CHANNEL; exit $code
```

Result: `PASS`.

Observed output included:

- `browser.channel`: `chrome`.
- Clipboard and synthetic composition markers matched the bundled Chromium run.
- One ignored browser-generated console message for
  `http://localhost:4016/favicon.ico`. No editor, API, layout, or page error was
  reported.

```powershell
$env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c; $code=$LASTEXITCODE; Remove-Item Env:SMOKE_BROWSER_CHANNEL; exit $code
```

Result: `PASS`.

Observed output included:

- `browser.channel`: `msedge`.
- Clipboard and synthetic composition markers matched the bundled Chromium run.
- One ignored browser-generated console message for
  `http://localhost:4016/favicon.ico`. No editor, API, layout, or page error was
  reported.

## Result Matrix

| Environment | Automated result | Manual real-IME result | Status |
|---|---:|---:|---|
| Bundled Chromium, synthetic composition | PASS | N/A | PASS |
| Windows Chrome 148, English/browser automation | PASS | UNKNOWN | RISK |
| Windows Chrome 148, Thai IME | Synthetic composition PASS | UNKNOWN | UNKNOWN |
| Windows Edge 148, English/browser automation | PASS | UNKNOWN | RISK |
| Windows Edge 148, Thai IME | Synthetic composition PASS | UNKNOWN | UNKNOWN |

## Review Terms

PASS:

- The repeatable Stage 4C smoke now passes on bundled Chromium, installed
  Chrome, and installed Edge.
- The smoke covers heavy plain-text paste, CRLF normalization, FlowDoc selection
  copy/cut, Escape commit, editor-shell focus restoration, keyboard undo/redo,
  page-boundary reflow, no inline textarea, no layout error, and synthetic IME
  duplicate suppression.

RISK:

- Chrome and Edge automatically request `/favicon.ico`; the script ignores only
  that browser-generated 404 console message. Any other console, page, 4xx, or
  5xx error still fails the smoke.
- Browser-channel automation proves the installed browser engines can run the
  Stage 4C path, but it does not prove human OS IME candidate-window behavior.

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
