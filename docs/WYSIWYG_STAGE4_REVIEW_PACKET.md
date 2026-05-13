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

Out of scope:

- Table-cell text-engine editing.
- Independent row/column continuation across pages.
- Human Windows Thai IME candidate-window validation.
- Full screen reader product validation.
- Schema/model/export changes.

## PASS

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

## RISK

- User-perceived typing smoothness at page boundaries still needs manual review.
  The automated smoke protects structure, focus, text path, and overlap, but it
  cannot fully score perceived rhythm.
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
```

Full suite:

```powershell
npm.cmd test
git diff --check
```

Latest observed automated counts:

- Core tests: 324 passed.
- App tests: 205 passed.
- Stage 4C smoke passed on bundled Chromium, installed Chrome, and installed
  Edge.
- The row-stack smoke inserted `STAGE4_STACK_MARKER` and observed
  `targetFragments: 1`, `pointerFragments: 1`, and `rowHeight: 571`.

## Reviewer Notes

- Review this as an Option 1 baseline for body/split text-engine behavior.
- Do not interpret row-stack coverage as independent row/column continuation.
- Do not interpret synthetic IME coverage as real OS IME acceptance.
- If a review requests table-cell text-engine support or independent
  row/column continuation, treat that as a new design decision, not a small
  patch on this baseline.
