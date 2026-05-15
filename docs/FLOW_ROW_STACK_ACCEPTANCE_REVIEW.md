# Flow Row / Flow Stack 0.5.0 Acceptance Review

Date: 2026-05-15

Verdict: PASS for the static `0.5.0` milestone with accepted `0.5.x` risks.

## PASS

- Authored model support exists for `flow-row` and `flow-stack` in
  `packages/core/src/schema/block.ts`, with validation coverage in
  `packages/core/src/document/assert.test.ts`.
- Normalization preserves and repairs flow widths through
  `normalizeFlowRowNode` and `normalizeFlowRowWidthShares` in
  `packages/core/src/document/normalize.ts`.
- Static measurement supports the new node pair through `flowFlowRow` and
  `flowFlowStack` in `packages/core/src/layout/flow.ts`.
- Pagination emits deterministic `flow-row` / `flow-stack` slices through
  `paginateFlowRow` in `packages/core/src/pagination/paginator.ts`.
- Forced-progress overflow is explicit through
  `forced-flow-row-split-overflow` in `packages/core/src/pagination/types.ts`.
- Renderer smoke coverage includes PDF/DOCX flow-row paths in
  `packages/core/src/renderer/__tests__/renderer.test.ts`.
- Editor static preview can select/render flow fragments through
  `src/app/editor/_components/EditorCanvas.tsx` and
  `src/app/editor/_components/__tests__/EditorCanvas.test.ts`.
- Basic insertion exists through the `flow-columns` palette path in
  `packages/core/src/document/operations.ts` and
  `src/app/editor/_components/EditorPalette.tsx`.
- Long-document stability coverage exists in
  `packages/core/src/pagination/__tests__/flowRowStack.test.ts`.

## FAIL / BLOCKER

- None found in the verified static milestone scope.

## RISK

- DOCX exact visual column fidelity is not accepted yet; current coverage is
  smoke and duplicate-text protection.
- Browser/manual smoke for the new static flow-row path was not run in this
  acceptance pass.
- Sibling-safe width resize controls and add-flow-stack controls are deferred.
- Live cross-page WYSIWYG inside `flow-stack` remains out of scope.

## UNKNOWN

- Very large real-world documents beyond the focused long fixtures may still
  need profiling.
- PDF duplicate-text verification was not extracted from rendered PDF bytes;
  pagination line integrity and DOCX XML markers cover the current smoke path.

## Minimal Next Patch

- Add a controlled add-flow-stack operation that redistributes width shares.
- Add sibling-safe resize controls for flow-stack widths.
- Add browser/manual smoke for palette insertion and static selection.
- Decide whether DOCX should preserve visual columns or continue as a
  structure-preserving export path for `0.5.x`.
