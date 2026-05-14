# WYSIWYG Edit/Show Parity Plan

Date: 2026-05-14
Status: Draft — pending owner approval
Owner: TBD (multi-agent handoff)

This document is the active end-to-end plan for closing edit/show visual
parity in FlowDocEditor's WYSIWYG path. It is intentionally scoped larger than
one run; expect it to be implemented across multiple sessions and possibly
multiple agents/teams.

Read together with:

- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md` (active text engine plan)
- `docs/WYSIWYG_EDITOR_ROADMAP.md` (legacy hybrid roadmap)
- `docs/WYSIWYG_PRODUCTION_GATE.md` (production enablement gate)
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md` (current Stage 4 baseline)
- `docs/EDITOR_UX_CONTRACT.md` (editor interaction contract)
- `docs/ARCHITECTURE_OVERVIEW.md` (layer map and runtime flow)

## Goal

A user typing into the editor must see exactly the same visual layout as the
rendered/exported document — including line wrap points, whitespace, caret
position, and page-boundary behavior.

Concretely:

- Word A wraps at the same x-position whether the user is typing or just
  viewing the document.
- Inserting/removing a space never causes a layout shift between edit-time and
  show-time.
- Caret pixel position equals the glyph edge measured by the same source the
  renderer uses.
- Page-break decisions during draft typing match the server's authoritative
  pagination after reconcile.

## Non-Goals

- Do not change `DocumentNode` schema.
- Do not change server pagination semantics, export, PDF, or DOCX renderers.
- Do not introduce a second document layout model.
- Do not change whitespace semantics — current behavior is "preserve 1:1
  (Word-like)" and stays that way.
- Do not redesign table-cell editing in this plan (deferred — see Phase C
  decision gate).
- Do not couple this work to the FlowDoc Package v2 migration.

## Decision Summary

| Decision | Value | Rationale |
|---|---|---|
| Authoritative text metric | fontkit reading `THSarabun.ttf` | Already authoritative on server; same algorithm gives true parity |
| Browser measurement runtime | fontkit (port to browser) | Removes Canvas/fontkit drift entirely |
| Whitespace policy | Preserve 1:1 (no collapse, no trim) | Confirmed product decision; existing word-breaker already preserves |
| Roll-out flag | `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE` (existing) | Reuse current production gate flag |
| Default flip target | After Phase D PASS | Production acknowledgement separately gated |

## Problem Statement

Two divergence sources exist today:

1. **Measurement drift** — `src/app/editor/_components/browserTextMeasurer.ts`
   uses Canvas `measureText()` against a CSS font family name, while
   `src/app/api/runtimeFont.ts` uses fontkit against the loaded `.ttf` bytes.
   The wrapping algorithm in `packages/core/src/layout/*` is shared, but the
   per-glyph widths come from different sources. Result: line wrap can shift
   by 1 word at edge cases, caret can be off by sub-pixel-to-pixel amounts.
   Evidence: `src/app/editor/_components/__tests__/realFontDrift.test.ts`
   currently tolerates 0.05pt drift.

2. **Stage 4 residual RISK** — per
   `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md` the Stage 4 baseline still carries
   manual-gate RISK for page-boundary smoothness, real Windows Thai IME, and
   table-cell text-engine eligibility.

Whitespace handling is already correct (preserve-by-design) but is unverified
across the full matrix (leading, trailing, double, tab, wrap-edge, mixed Thai).

## Phase Overview

```text
Phase A: Unify measurement (browser fontkit)        ~3-5 days
   |
Phase B: Whitespace verification matrix             ~1-2 days
   |
Phase C: Close Stage 4 RISK                         ~1 day manual + fixes
   |
Phase D: Default enablement                         ~0.5 day
```

Phases A, B, C may be parallelized across agents. Phase D blocks on all three.

---

## Phase A: Unify Text Measurement — COMPLETE 2026-05-14

### A.1 Goal

Replace `createBrowserTextMeasurer()` with a fontkit-based measurer that
reads the same `THSarabun.ttf` bytes the server reads. Both runtimes call
identical glyph-width logic.

### A.2 Scope

Files to add:

- `src/app/editor/_components/browserFontkitMeasurer.ts`
- `src/app/editor/_components/__tests__/browserFontkitMeasurer.test.ts`
- `src/app/editor/_components/__tests__/fontMeasurerParity.test.ts` (or
  extend `realFontDrift.test.ts`)

Files to modify:

- `src/app/editor/_components/EditorShell.tsx` — swap measurer construction
  (search `createBrowserTextMeasurer`, replace with the new factory and
  thread the loaded font through context)
- `src/app/editor/_components/browserTextMeasurer.ts` — keep as fallback when
  font is still loading; do not delete in Phase A

Files to inspect (no change expected):

- `src/app/api/runtimeFont.ts` — confirm fontkit construction pattern, reuse
  the same code structure
- `packages/core/src/layout/font-measurer.ts` — confirm `TextMeasurer`
  interface contract
- `packages/core/src/layout/measure.ts` — confirm caller assumptions about
  measurer purity

### A.3 Out of Scope

- Do not change server `runtimeFont.ts`.
- Do not change `TextMeasurer` interface in core.
- Do not modify any document operations, paginator, or renderer.
- Do not delete legacy `browserTextMeasurer.ts` in this phase (used as
  fallback during font load).

### A.4 Design Notes

Font loading lifecycle:

1. On editor mount, `EditorShell` triggers `fetch('/fonts/THSarabun.ttf')`
2. Buffer is passed to `fontkit.create()` and held in a ref/context
3. Until font resolves, measurer falls back to existing canvas measurer
4. After font resolves, measurer swaps to fontkit-backed implementation
5. Any active draft pagination re-runs once on swap to settle layout

The fontkit measurer must:

- Match the `TextMeasurer` interface in `packages/core/src/layout/types.ts`
- Cache per-glyph widths keyed by `(codepoint, fontSize)` for performance
- Return the same `measureLineHeight()` rule as server (currently
  `fontSize * lineHeightRatio`)
- Be deterministic — no async inside `measureText()`

Bundle strategy:

- Code-split: import fontkit only in editor route, not in render-only routes
- Use `import()` dynamic import inside `EditorShell` mount
- Acceptable budget: +400KB gzipped to editor route

### A.5 Gates

- `realFontDrift.test.ts` reports drift = 0 (was ≤0.05pt)
- New `fontMeasurerParity.test.ts`: representative mixed Latin/Thai/
  whitespace strings return exact browser/server fontkit width parity
- `npm.cmd run review:gate` PASS
- `npm.cmd run smoke:wysiwyg-stage4c` PASS (bundled + Chrome + Edge channels)
- Manual: type into editor, observe no wrap-point flicker between draft and
  post-reconcile view on a multi-paragraph fixture

### A.6 Risks

| Risk | Mitigation |
|---|---|
| Bundle size regression on editor route | Lazy import; measure with `next build` bundle analyzer; treat >450KB delta as blocker |
| Font load failure | Keep the existing canvas measurer fallback; never silently swap to heuristic default measurement |
| First-paint measurement using canvas, then swap | Re-run preview pagination once after fontkit ready; trigger via existing reconcile path |
| fontkit version drift between server and browser | Pin exact version in root `package.json`; add CI check |
| `Intl.Segmenter` behavior differs across Node/Chrome | Already abstracted in core word-breaker; verify same input/output on cross-runtime test |

### A.7 Handoff Checklist (Phase A)

- [x] Read `runtimeFont.ts` and `font-measurer.ts` end-to-end
- [x] Add `browserFontkitMeasurer.ts` mirroring server construction
- [x] Wire into `EditorShell` with fallback
- [x] Add focused unit + parity tests
- [ ] Update `realFontDrift.test.ts` tolerance to 0 — deferred; that test
      covers the legacy canvas path drift, not the new fontkit path. The new
      `fontMeasurerParity.test.ts` asserts exact equality (0 delta) for the
      fontkit path. Decide in a follow-up whether to retire or repurpose the
      legacy drift test once Phase D flips the default.
- [x] Run `review:gate` (PASS: type-check, core 344/344, app 235/235, build)
- [x] Run `smoke:wysiwyg-stage4c` (PASS: bundled-chromium, 0 console errors,
      0 resource errors, all clipboard/IME/selection/stack scenarios)
- [x] Append entry to `docs/WORK_LOG.md`
- [x] Update `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md` "PASS" section
- [x] **Phase A COMPLETE — 2026-05-14**; ready to hand off to Phase B

---

## Phase B: Whitespace Verification Matrix — AUTHORED BASELINE COMPLETE / VISUAL EDGE-SPACE RISK 2026-05-14

### B.1 Goal

Verify that the existing authored-text preserve-1:1 whitespace contract holds
across realistic edit-time scenarios, and codify the current visual
edge-space policy so regressions and remaining risks are visible.

### B.2 Scope

Files to add:

- `docs/WYSIWYG_WHITESPACE_MATRIX.md` — readable matrix mirroring
  `WYSIWYG_STAGE4C_IME_MATRIX.md` structure
- `src/app/editor/_components/__tests__/whitespaceParity.test.ts` —
  automated coverage of every matrix row

Files to inspect:

- `packages/core/src/layout/word-breaker.ts` — confirm whitespace preservation
- `packages/core/src/layout/types.ts:107-108` — preservation contract comment
- `src/app/editor/_components/wysiwygTextCommit.ts` — confirm no trim in
  commit path
- `src/app/editor/_components/useWysiwygTextSession.ts` — confirm draft
  text mutation paths preserve whitespace

### B.3 Matrix Rows (Required Coverage)

| # | Scenario | Expected |
|---|---|---|
| 1 | Single space between words | Preserved; wrap may use it as break |
| 2 | Double space between words | Both preserved; visible width = 2× |
| 3 | Leading space at paragraph start | Authored offset preserved; current measured line text omits line-leading spaces |
| 4 | Trailing space at paragraph end | Authored offset preserved; current measured line text trims trailing spaces |
| 5 | Trailing space at wrap point | Authored offset preserved; whitespace is a wrap candidate but not rendered as a line suffix |
| 6 | Tab character (\t) | Decision needed: render as glyph or convert to N spaces |
| 7 | Mixed Thai + space + Latin | Wrap point uses space; Thai cluster unbroken |
| 8 | Space inside ZWJ sequence | ZWJ cluster unbroken; surrounding spaces preserved |
| 9 | Run of 5+ consecutive spaces | All 5 preserved across edit/show |
| 10 | Newline (Enter) inside paragraph | Inserts \n in paragraph text (current behavior — verify) |
| 11 | Paste text with CRLF | Normalized to LF (current Stage 4C behavior) |
| 12 | Paste text with CR only | Normalized to LF (legacy macOS line endings supported) |

For each row: assert that the paragraph offset string and the committed
`DocumentNode` text agree. For rows 3-5, also assert the current measured-line
policy so the visual edge-space limitation remains explicit instead of hidden
behind a broad PASS claim.

### B.4 Out of Scope

- Do not change whitespace semantics. If a row reveals a mismatch, file a
  separate decision task — do not silently change behavior.
- Do not add whitespace visualization UI (separate feature).

### B.5 Decision Gate: Tab Character

Row 6 product decision:

- **Option B6-a**: Tab renders as a glyph using font's tab advance
- **Option B6-b**: Tab converts to N spaces on input — **accepted as 3 spaces**
- **Option B6-c**: Tab is rejected by input bridge (current de-facto?)

Decision: B6-b, with `WYSIWYG_TAB_REPLACEMENT = "   "`. Keyboard Tab focus
behavior remains out of scope; this decision covers text input/paste
normalization only.

### B.6 Gates

- All 12 matrix rows have an automated authored-text test row that passes
- Rows 3-5 have measured-line assertions documenting the current visual
  edge-space policy and remain visual RISK until a product/layout decision
- Matrix doc lists every row with current status
- `review:gate` PASS
- Smoke check: type/paste each row's input manually once, confirm visual

### B.7 Handoff Checklist (Phase B)

- [x] Draft `WYSIWYG_WHITESPACE_MATRIX.md`
- [x] Resolve Tab decision gate (B.5) — decision: convert Tab to 3 spaces
      at `normalizeWysiwygPlainTextInput`; constant exported as
      `WYSIWYG_TAB_REPLACEMENT`
- [x] Add `whitespaceParity.test.ts` — 16 assertions covering all 12 matrix
      rows, two composition checks, and two measured-line edge-space policy
      checks
- [x] Run `review:gate` — PASS (core 344/344, app 251/251, build OK)
- [x] Update `WORK_LOG.md`
- [x] **Phase B authored baseline complete — 2026-05-14**; visual edge-space
      rows 3-5 remain RISK and are not a Phase D default-flip blocker unless
      product requires visible edge-space glyph parity

---

## Phase C: Close Stage 4 Residual RISK

### C.1 Goal

Convert the three open RISK items in
`docs/WYSIWYG_STAGE4_REVIEW_PACKET.md` into PASS or accepted-limitation
status, so the text engine can be considered production-quality on body
paragraphs.

### C.2 Open Items

1. **Page-boundary typing smoothness** — manual review only; the automated
   smoke covers structure but not perceived rhythm.
2. **Real Windows Thai IME** — `WYSIWYG_STAGE4C_IME_MATRIX.md` rows for
   Windows Chrome and Edge with Thai IME still need human verification.
3. **Table-cell text-engine eligibility** — closed by decision; needs an
   explicit decision record (accept as limitation OR open a separate design
   gate task).

### C.3 Scope

Files to update:

- `docs/WYSIWYG_STAGE4C_IME_MATRIX.md` — fill rows with evidence
- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md` — append session evidence
- `docs/WYSIWYG_PRODUCTION_GATE.md` — flip checklist rows to PASS as
  evidence arrives
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md` — move closed RISK to PASS section,
  mark accepted limitations clearly

Files to inspect (only if smoothness fails):

- `src/app/editor/_components/wysiwygDraftVisualPreview.ts`
- `src/app/editor/_components/EditorCanvas.tsx` page-boundary path

### C.4 Out of Scope

- Do not start table-cell text-engine implementation in this phase. If the
  decision is "implement", that is a separate design task.
- Do not change row-stack continuation policy.

### C.5 Gates

- Page-Boundary Smoothness Checklist in `WYSIWYG_PRODUCTION_GATE.md`:
  manual PASS on Windows Chrome and Edge
- Both IME matrix rows: real Thai IME PASS
- Decision record: table-cell limitation accepted or new task filed

### C.6 Handoff Checklist (Phase C)

- [ ] Run page-boundary checklist on Windows Chrome
- [ ] Run page-boundary checklist on Windows Edge
- [ ] Run Thai IME matrix rows on Chrome
- [ ] Run Thai IME matrix rows on Edge
- [ ] File or close table-cell decision
- [ ] Update production gate checklist
- [ ] Update Stage 4 review packet
- [ ] Hand off to Phase D

---

## Phase D: Default Enablement

### D.1 Goal

Flip the WYSIWYG text engine from opt-in flag to default behavior, with
production acknowledgement.

### D.2 Pre-conditions

All of:

- Phase A PASS (measurement parity)
- Phase B authored whitespace baseline complete, with visual edge-space rows
  either resolved or explicitly accepted as the product contract
- Phase C PASS (Stage 4 RISK closed)
- `WYSIWYG_PRODUCTION_GATE.md` checklist all PASS
- No new RISK opened by other in-flight work

### D.3 Changes

- Flip default of `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE` from off to on
  (locate flag handler — currently in `wysiwygTextEligibility.ts` or similar)
- Set `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE_PRODUCTION_ACK=1` in the
  release environment (NOT in source control; deploy-time only)
- Keep fallback path (`canvas` measurer + textarea hybrid) intact behind an
  explicit `=off` override for emergency rollback
- Update README/release notes

### D.4 Rollback Plan

If user-reported regressions appear post-launch:

```powershell
$env:NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE="off"
```

The legacy textarea path must still work. Verify with a smoke run before
release.

### D.5 Gates

- All Phase A/B/C gates still PASS at the time of flip
- `review:gate:full` PASS
- `review:browser` PASS on bundled + Chrome + Edge
- Release notes drafted
- Rollback verified once in staging

### D.6 Handoff Checklist (Phase D)

- [ ] Verify all upstream phase gates still PASS
- [ ] Flip default flag
- [ ] Verify rollback works
- [ ] Release notes
- [ ] Update `WYSIWYG_PRODUCTION_GATE.md` to "PRODUCTION ENABLED"
- [ ] Archive this plan into `docs/archive/` once stable for one release

---

## Risk Register

| ID | Risk | Phase | Severity | Mitigation |
|---|---|---|---|---|
| R1 | fontkit bundle bloats editor route | A | High | Lazy import, measure, gate at +450KB |
| R2 | Font fetch fails on user network | A | Medium | Canvas fallback + visible status |
| R3 | fontkit/server version drift | A | Medium | Lock version, CI check |
| R4 | Whitespace matrix reveals real mismatch | B | Medium | File decision, do not silently change |
| R5 | Manual IME testing not reproducible | C | Low | Record screen capture in results doc |
| R6 | Table-cell users blocked by limitation | C | Low | Document clearly; existing textarea still works |
| R7 | Default flip surfaces regression in field | D | High | Rollback flag tested in staging first |

## Multi-Agent Coordination Notes

This plan is sized for handoff. Suggested division:

- **Phase A**: one implementer agent + one reviewer agent; ~3-5 sessions
- **Phase B**: one implementer agent (single session for matrix doc, second
  session for tests); reviewer optional
- **Phase C**: one human + one agent pair for manual gates; agent records
  evidence
- **Phase D**: lead engineer + reviewer; single session

Each session should:

1. Read this plan plus the phase-specific checklist
2. Read the source-of-truth contract for any file it touches
3. Update the checklist in this doc as items complete
4. Append to `docs/WORK_LOG.md` per session

When a phase is fully complete:

- Move its handoff checklist into "DONE" form
- Update the phase header to "COMPLETE — YYYY-MM-DD"
- Hand the doc forward unchanged for the next phase

## Definition Of Done (Overall)

This parity plan is fully done when:

- Phases A, B, C, D all marked complete in this doc
- `WYSIWYG_PRODUCTION_GATE.md` shows all rows PASS with current evidence
- Edit/show parity test fixtures (drift = 0, authored whitespace rows green,
  and visual edge-space policy resolved or accepted) green for three
  consecutive `review:gate:full` runs
- One real user-facing release ships with the text engine as default and no
  parity-related regression in the first follow-up review window
- This plan is archived to `docs/archive/` and replaced (if needed) by a
  much shorter ongoing-maintenance note in the relevant active contract

## Related Docs

- `docs/WYSIWYG_TEXT_ENGINE_PLAN.md`
- `docs/WYSIWYG_EDITOR_ROADMAP.md`
- `docs/WYSIWYG_PRODUCTION_GATE.md`
- `docs/WYSIWYG_STAGE4_REVIEW_PACKET.md`
- `docs/WYSIWYG_STAGE4C_IME_MATRIX.md`
- `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/TEST_STRATEGY.md`
- `docs/BROWSER_SMOKE_CHECKLIST.md`
