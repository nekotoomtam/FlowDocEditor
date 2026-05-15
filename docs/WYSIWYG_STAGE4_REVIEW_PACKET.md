# WYSIWYG Stage 4 Review Packet

Date: 2026-05-13

This packet is the handoff for the current Option 1 WYSIWYG text-engine
baseline. It is intentionally a review baseline, not a claim that WYSIWYG is
product-complete.

## Scope

In scope:

- Body paragraph text-engine editing.
- Body paragraph page-boundary draft visual preview.
- Existing split body paragraph re-entry on the text-engine path.
- Same-paragraph selection, including cross-fragment selection overlays and
  pointer drag selection.
- Clipboard paste/copy/cut through FlowDoc paragraph offsets.
- Synthetic composition handling through the hidden input bridge.
- Accessibility status wiring for caret and selected-range state.
- Heavy row-stack paragraph coverage while preserving the current atomic row
  pagination contract.
- Read-only editor preview of resolved header/footer text from
  `PaginatedDocument` zone fragments.

Out of scope:

- Table-cell text-engine editing.
- Independent row/column continuation across pages.
- Human Windows Thai IME candidate-window validation.
- Full screen reader product validation.
- Schema/model/export changes.
- Header/footer authoring or inline editing.

## PASS

- Browser text measurement uses the same fontkit-on-`THSarabun.ttf` pipeline as
  the server (Phase A of `docs/WYSIWYG_PARITY_PLAN.md` complete 2026-05-14).
  Evidence: `src/app/editor/_components/browserFontkitMeasurer.ts`,
  `src/app/editor/_components/__tests__/fontMeasurerParity.test.ts` (exact
  width parity). If browser fontkit setup fails, `EditorShell` keeps the
  existing canvas measurer fallback instead of silently swapping to heuristic
  default measurement.
- Text-engine editing uses the FlowDoc visual layer and a hidden adapter bridge,
  not visible textarea layout. Evidence: `WysiwygTextLayer` in
  `src/app/editor/_components/ParagraphTextSurface.tsx`.
- Body page-boundary draft preview is canvas-owned and splits only the active
  body paragraph visual draft. Evidence: `buildWysiwygDraftVisualPreview` in
  `src/app/editor/_components/EditorCanvas.tsx` and
  `src/app/editor/_components/wysiwygDraftVisualPreview.ts`.
- Existing plain body split paragraphs can remain on the text-engine path after
  draft pagination. Evidence: `supportsPaginatedDraftLayout` in
  `src/app/editor/_components/ParagraphTextSurface.tsx`.
- Cross-fragment same-paragraph pointer selection is covered by fragment
  targets. Evidence: `wysiwygTextPointerFragments` in
  `src/app/editor/_components/EditorCanvas.tsx` and
  `resolveWysiwygTextPointerOffsetFromFragmentTargets` in
  `src/app/editor/_components/ParagraphTextSurface.tsx`.
- Clipboard and synthetic composition are routed through the FlowDoc draft
  operation path. Evidence: `useWysiwygTextSession` in
  `src/app/editor/_components/useWysiwygTextSession.ts` and the bridge handlers
  in `src/app/editor/_components/ParagraphTextSurface.tsx`.
- Row-stack paragraphs remain text-engine eligible without textarea fallback,
  but do not use the body paragraph live split preview. Evidence:
  `isParagraphInsideRowStack` / `isStackInsideRow` in
  `src/app/editor/_components/EditorCanvas.tsx` and the row-stack test in
  `src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts`.
- Header/footer preview content is visible in the editor without becoming an
  editable/selectable body fragment. Evidence: `ReadOnlyZoneFragments` in
  `src/app/editor/_components/EditorCanvas.tsx`,
  `src/app/editor/_components/__tests__/EditorCanvas.test.ts`, and
  `scripts/editor-smoke.mjs`.

## RISK

- User-perceived typing smoothness at page boundaries still needs manual review.
  The automated smoke protects structure, focus, text path, and overlap, but it
  cannot fully score perceived rhythm. Deferred polish: live preview currently
  mirrors settled widow/orphan splitting, which can pull one already-visible
  line down when the draft first crosses a page. The desired active-typing feel
  is to move only newly overflowing lines, then reconcile to settled
  widow/orphan pagination after debounce, blur, or edit exit.
- Real Windows Thai IME remains a manual gate. Automation covers synthetic
  composition duplicate suppression only.
- Row/stack content is still governed by the current atomic row contract. This
  prevents independent column splitting, by design, until a separate row/column
  continuation design is accepted.
- Table-cell text-engine editing remains closed because table row/cell
  pagination constraints need their own design gate.

## UNKNOWN

- Human screen reader behavior beyond DOM status wiring.
- Real OS IME candidate-window behavior in Chrome and Edge.
- Product acceptance for very large row/column content before independent
  row/column continuation exists.

## Verification

Reproducible non-browser review gate:

```powershell
npm.cmd run review:gate
npm.cmd run review:gate:full
```

`review:gate` includes type-check, core tests, app tests, and `review:build`.
`review:gate:full` first runs the review archive manifest check. These gates
must fail if `public/fonts/THSarabun.ttf` is missing.

Focused tests:

```powershell
npm.cmd run test:app -- src/app/editor/_components/__tests__/wysiwygStage3StressScenarios.test.ts src/app/editor/_components/__tests__/ParagraphTextSurface.test.ts src/app/editor/_components/__tests__/wysiwygDraftVisualPreview.test.ts
```

Static checks:

```powershell
node --check scripts/wysiwyg-stage4c-smoke.mjs
npm.cmd run type-check
```

Browser smoke on the already-running flagged local editor:

```powershell
$env:SMOKE_BASE_URL='http://localhost:4000/editor'; npm.cmd run smoke:wysiwyg-stage4c
$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='chrome'; npm.cmd run smoke:wysiwyg-stage4c
$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_BROWSER_CHANNEL='msedge'; npm.cmd run smoke:wysiwyg-stage4c
$env:SMOKE_BASE_URL='http://localhost:4000/editor'; $env:SMOKE_EXECUTABLE_PATH='C:\Path\To\chromium.exe'; npm.cmd run smoke:wysiwyg-stage4c
```

Reproducible browser review gate:

```powershell
npm.cmd run review:browser
npm.cmd run review:browser:install
$env:SMOKE_EXECUTABLE_PATH='C:\Path\To\chromium.exe'; npm.cmd run review:browser
```

`npm ci` installs Playwright's package dependency, but reviewers may still need
`npx playwright install chromium`, `review:browser:install`, or a system browser
path before running the browser gate.

Full suite:

```powershell
npm.cmd test
git diff --check
```

Latest observed automated counts:

- Core tests: 344 passed.
- App tests: 251 passed.
- `review:gate` passed on 2026-05-14 with type-check, full core/app tests,
  and `review:build`.
- `review:gate:full` previously passed on 2026-05-14 with archive manifest
  check, type-check, full core/app tests, and `review:build`.
- `review:browser` passed on 2026-05-14 on bundled Chromium; an earlier system
  Chrome run via `SMOKE_EXECUTABLE_PATH` also passed.
- Stage 4C smoke output reports the browser mode, channel, executable path, and
  headless setting.
- Missing bundled Chromium launch errors now print FlowDoc-specific install and
  system-browser guidance instead of only the generic Playwright message.
- Editor smoke passed with header/footer zone text coverage, Fill-mode export
  readiness coverage, and favicon-only resource filtering for system Chrome.
- The row-stack smoke inserted `STAGE4_STACK_MARKER` and observed
  `targetFragments: 1`, `pointerFragments: 1`, and `rowHeight: 571`.
- Follow-up `smoke:wysiwyg-stage4c` recheck passed on 2026-05-14 after the
  existing unflagged Next dev server was stopped and the smoke script could
  start its own flagged server.
- Follow-up `smoke:wysiwyg-reenter` passed on 2026-05-14 on bundled Chromium
  and installed Chrome/Edge channels: three keyboard-driven variants passed,
  including gradual word typing until natural wrap and repeated-key typing
  until wrap, followed by re-enter line insertion. All 12 equivalent
  edit/show/re-enter line-geometry comparisons matched in each browser run.
- Follow-up `smoke:wysiwyg-thai-repeat` passed on 2026-05-14 on bundled
  Chromium and installed Chrome/Edge channels. It mirrors the manual screenshot
  report on a normal default paragraph by typing repeated Thai characters until
  wrap, exiting, re-entering, pressing Enter at the clicked caret, typing
  another Thai run, and matching all 4 edit/show/re-enter line-geometry
  comparisons in each browser run.

## Reviewer Notes

- Review this as an Option 1 baseline for body/split text-engine behavior.
- The text engine remains experimental: production builds require both
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE` and
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE_PRODUCTION_ACK`, and
  `docs/WYSIWYG_PRODUCTION_GATE.md` must be PASS before default enablement.
- Do not interpret row-stack coverage as independent row/column continuation.
- Do not interpret synthetic IME coverage as real OS IME acceptance.
- If a review requests table-cell text-engine support or independent
  row/column continuation, treat that as a new design decision, not a small
  patch on this baseline.
