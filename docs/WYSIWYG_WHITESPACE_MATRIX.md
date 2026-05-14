# WYSIWYG Whitespace Matrix

Date: 2026-05-14
Status: Phase B authored-text baseline — verified by `whitespaceParity.test.ts`;
visual edge-space rows remain RISK under the current layout model

This matrix codifies the whitespace contract for the WYSIWYG text engine. The
top-line authored-text rule is **Preserve 1:1 (Word-like)** for every
whitespace category the user can type or paste, with one declared
transformation (Tab → 3 spaces on input) recorded below.

Read with:

- `docs/WYSIWYG_PARITY_PLAN.md` Phase B
- `docs/EDITOR_UX_CONTRACT.md` inline editing rules
- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`

## Top-Line Rules

- The text engine does not collapse, trim, or normalize whitespace in the
  authored paragraph string except where this matrix explicitly states a
  transformation.
- Line breaking may use whitespace as a wrap candidate, but the underlying
  paragraph text retains every whitespace codepoint at its original offset.
- Current measured line text preserves interior spaces, but does not render
  line-leading or line-trailing spaces. That is documented as visual RISK for
  rows 3-5, not as a completed visual-parity claim.
- Both browser preview and server pagination use the same word-breaker
  (`packages/core/src/layout/word-breaker.ts`) so wrap decisions stay
  consistent across edit and show.
- Transformations on input land inside
  `normalizeWysiwygPlainTextInput(...)` in
  `src/app/editor/_components/useWysiwygTextSession.ts` so every text
  ingress (paste, beforeinput, IME end) shares one normalization point.

## Matrix

| # | Scenario | Expected | Status |
|---|---|---|---|
| 1 | Single space between words (`"a b"`) | Preserved; wrap may use it as break candidate | PASS |
| 2 | Double space between words (`"a  b"`) | Both spaces preserved; visible width = 2× single space | PASS |
| 3 | Leading space at paragraph start (`"  a"`) | Authored offset preserved; current measured line text omits line-leading spaces | RISK |
| 4 | Trailing space at paragraph end (`"a  "`) | Authored offset preserved; current measured line text trims trailing spaces | RISK |
| 5 | Trailing space at wrap point | Authored offset preserved; whitespace acts as wrap candidate but is not rendered as a line suffix | RISK |
| 6 | Tab character (`"\t"`) | Converted to 3 spaces (`"   "`) at `normalizeWysiwygPlainTextInput`; downstream treated as ordinary space run | PASS |
| 7 | Mixed Thai + space + Latin (`"ไทย abc"`) | Space remains a wrap candidate; Thai cluster stays unbroken | PASS |
| 8 | Space inside ZWJ sequence (`"a‍b"` with surrounding spaces) | Spaces preserved; ZWJ cluster unbroken | PASS |
| 9 | Run of 5+ consecutive spaces (`"     "`) | All 5 preserved in paragraph offset | PASS |
| 10 | Newline (`"a\nb"`) | Inserts `\n` into paragraph text; paragraph stays one node (no structural split) | PASS |
| 11 | Paste text with CRLF (`"a\r\nb"`) | Normalized to LF (`"a\nb"`); offset count = LF length | PASS |
| 12 | Paste text with CR only (`"a\rb"`) | Normalized to LF (`"a\nb"`); legacy macOS line endings supported | PASS |

## Decision Record: Tab Character (Row 6)

Decision: **Tab characters convert to 3 spaces on input.**

Rationale:

- Pasting tab-separated data (Excel, Word tables) without spacing produces
  unreadable text runs; rejecting tabs surprises users.
- Rendering tabs as glyphs would require tab-stop semantics in the schema,
  paginator, and PDF/DOCX renderers — out of scope for Phase B.
- 3 spaces is closer to typical Thai authored-document indentation than the
  Western 4-space convention.
- Implementation lives in a single function so future revision (4 spaces, or
  tab-stop rendering) is a one-line change without schema impact.

Constant: `WYSIWYG_TAB_REPLACEMENT` in
`src/app/editor/_components/useWysiwygTextSession.ts`.

## Coverage

Automated coverage: `whitespaceParity.test.ts`.

Each matrix row above maps to at least one assertion in the test file. The test
also records the current visual edge-space policy for rows 3-5 through
`measureParagraph(...)` line-text assertions. A new matrix row must add a
corresponding assertion before being marked PASS.

## Visual Edge-Space Risk

Rows 3-5 are not yet closed as visual parity. The current layout implementation
uses line-edge whitespace as input text and wrap metadata, but line construction
omits leading spaces at the start of a measured line and trims trailing spaces
from measured line text. This keeps show/edit text-engine rendering consistent
with itself, but it is not the same as rendering every authored edge-space glyph
visibly.

Do not mark these rows PASS until a separate layout decision either:

- accepts the current line-edge whitespace policy as the product contract, or
- changes core measurement/rendering so line-edge spaces have explicit visual
  geometry across editor, PDF, DOCX, and pagination tests.

## Out of Scope

- Whitespace visualization UI (show pilcrow / dot markers) — separate UX
  feature.
- Keyboard Tab key behavior inside the active edit session — current
  behavior is the browser default (move focus). Revisit only if user
  feedback requests it; the clipboard/IME path is the dominant tab source.
- Non-breaking space (` `), zero-width space (`​`), and other
  exotic whitespace codepoints — preserved by default, not separately tested
  yet. Add a row if a regression is observed.

## Change Rule

If editor or paginator behavior changes the way any matrix row is handled:

- Update the corresponding row above and the test
- Update `docs/WORK_LOG.md`
- If the change adds a new transformation, record it under "Decision Record"
