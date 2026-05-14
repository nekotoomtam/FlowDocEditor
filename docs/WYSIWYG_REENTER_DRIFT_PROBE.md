# WYSIWYG Re-Enter Drift Probe

Date: 2026-05-14
Status: Diagnostic browser probe — baseline PASS on bundled Chromium, installed Chrome, and installed Edge

This probe captures the user-reported class of issues where a paragraph looks
different after leaving WYSIWYG edit mode and entering it again.

Run:

```powershell
npm.cmd run smoke:wysiwyg-reenter
```

Run headed:

```powershell
$env:HEADED="1"; npm.cmd run smoke:wysiwyg-reenter
```

Run the default-paragraph Thai repeated-key variant that mirrors the captured
manual report:

```powershell
npm.cmd run smoke:wysiwyg-thai-repeat
```

The probe starts a flagged Next dev server, opens
`/editor?flowdocTestScenario=wysiwyg-stage3-boundary`, runs multiple
keyboard-driven edit/re-enter variants, and compares DOM-rendered SVG line
snapshots.

Current variants:

- `page-boundary-bulk-keyboard-type`: long keyboard-typed payload that forces
  the target paragraph across a page boundary, then appends more text after
  re-enter.
- `gradual-word-wrap-then-line-insert`: types word chunks gradually until a
  new wrapped line appears by itself, exits edit, re-enters, presses Enter, and
  inserts a new line at the clicked caret.
- `repeated-key-wrap-then-line-insert`: sends repeated `A` key presses until a
  long typed run wraps to a new line, exits edit, re-enters, presses Enter, and
  inserts a new line at the clicked caret.

Companion Thai variant:

- `thai-repeat-default-paragraph-reenter`: loads a normal localStorage-backed
  default paragraph (`New paragraph`), types repeated Thai characters through
  keyboard events until wrapping occurs, exits edit, re-enters, presses Enter
  at the clicked caret, types another Thai run, and compares edit/show
  geometry. This guards the manual screenshot flow where an unflagged legacy
  textarea edit path wrapped differently from show mode.

## Compared Snapshots

The probe records:

- `preEditShow`
- `firstEditEntry`
- `firstEditAfterType`
- `postFirstExit`
- `secondEditEntry`
- `secondEditAfterType`
- `postSecondExit`

It then compares only equivalent text states:

| Comparison | Expected |
|---|---|
| show vs first edit entry | exact line text and geometry match |
| first edit draft vs post first exit | exact line text and geometry match |
| post first exit vs second edit entry | exact line text and geometry match |
| second edit draft vs post second exit | exact line text and geometry match |

The first insert must split the target paragraph across at least two page
fragments. If it does not, the probe fails because it did not exercise the
page-boundary re-entry path.

## Current Baseline

2026-05-14, headless, after matching draft preview splitting to paginator
widow/orphan behavior:

- `ok: true`
- variants passing: 3/3
- comparisons passing: 12/12
- console errors: 0
- page errors: 0
- active resource errors: 0

Browser runs observed:

- Bundled Chromium: PASS.
- Installed Chrome channel via `SMOKE_BROWSER_CHANNEL=chrome`: PASS.
- Installed Edge channel via `SMOKE_BROWSER_CHANNEL=msedge`: PASS.

Thai repeated-key companion runs observed:

- `npm.cmd run smoke:wysiwyg-thai-repeat`: PASS on bundled Chromium.
- `SMOKE_BROWSER_CHANNEL=chrome`: PASS on installed Chrome.
- `SMOKE_BROWSER_CHANNEL=msedge`: PASS on installed Edge.
- first Thai run length: 245 characters, wrapping 1 → 3 lines.
- second Thai run after re-enter: 45 characters, ending at 4 lines.
- all 4 equivalent edit/show/re-enter line-geometry comparisons matched.

The installed Chrome/Edge runs can report a favicon-only 404 console message
from the local Next app shell. The probe filters that as an ignored resource
condition and still fails on active console, page, or resource errors.

Observed counts:

- `page-boundary-bulk-keyboard-type`: first insert 1 → 2 fragments / 8 → 13
  lines; second insert stays 2 fragments / 16 lines.
- `gradual-word-wrap-then-line-insert`: first typing wraps 8 → 9 lines; the
  re-enter line insertion splits 1 → 2 fragments / 9 → 10 lines.
- `repeated-key-wrap-then-line-insert`: 50 repeated `A` key presses wrap 8 → 9
  lines; the re-enter line insertion splits 1 → 2 fragments / 9 → 10 lines.

Earlier in the same session, the two user-like variants failed at
`second edit draft vs post second exit`: live edit preview split the first
fragment at `lineEnd=9`, while post-exit pagination split at `lineEnd=8`.
Root cause: `splitWysiwygDraftVisualFragments(...)` did not apply the same
widow/orphan prevention as the paginator. The probe now guards that behavior.

## Interpretation

PASS here means the standard Stage 3 page-boundary fixture does not currently
reproduce edit/show or re-enter line-geometry drift under the three variants
above. It does **not** prove that every user document is drift-free.

If a real document still shows drift, capture the same lifecycle against that
document or add a narrower fixture that matches its paragraph width, font size,
Thai/Latin mix, whitespace, and page position. This probe is the reusable
comparison harness; the scenario payload may need to change to reproduce a
specific user symptom.

If the editor reports `data-wysiwyg-text-engine-enabled="false"`, the app is on
the legacy textarea edit path. That path is known to have different browser
wrapping behavior from the SVG/layout engine and is not accepted as WYSIWYG
parity evidence.

## Probe Knobs

```powershell
$env:REENTER_FIRST_INSERT_WORDS="120"; npm.cmd run smoke:wysiwyg-reenter
$env:REENTER_SECOND_INSERT_WORDS="60"; npm.cmd run smoke:wysiwyg-reenter
$env:REENTER_GRADUAL_MAX_WORDS="80"; npm.cmd run smoke:wysiwyg-reenter
$env:REENTER_REPEAT_MAX_PRESSES="400"; npm.cmd run smoke:wysiwyg-reenter
$env:REENTER_VERBOSE="1"; npm.cmd run smoke:wysiwyg-reenter
$env:SMOKE_BROWSER_CHANNEL="chrome"; npm.cmd run smoke:wysiwyg-reenter
$env:SMOKE_BROWSER_CHANNEL="msedge"; npm.cmd run smoke:wysiwyg-reenter
$env:THAI_REPEAT_A_COUNT="90"; npm.cmd run smoke:wysiwyg-thai-repeat
$env:THAI_REPEAT_SO_COUNT="120"; npm.cmd run smoke:wysiwyg-thai-repeat
$env:THAI_REPEAT_WO_COUNT="100"; npm.cmd run smoke:wysiwyg-thai-repeat
$env:THAI_REPEAT_KO_COUNT="60"; npm.cmd run smoke:wysiwyg-thai-repeat
```

Use larger insert counts when a suspected drift only appears after a longer
paragraph continuation. Use installed Chrome/Edge runs before treating this as
a broad browser acceptance signal. `REENTER_VERBOSE=1` prints full line text
and geometry snapshots; the default output keeps shorter per-fragment summaries.
