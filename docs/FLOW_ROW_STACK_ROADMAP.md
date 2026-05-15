# Flow Row / Flow Stack Roadmap

Status: Active implementation roadmap for the `0.5.0` milestone.

This roadmap is governed by `docs/FLOW_ROW_STACK_SPEC.md`. If this roadmap and
the spec disagree, update the spec first or record the deliberate decision here.

## Implementation Progress

Last checked: 2026-05-15.

- Phase 0: complete.
- Phase 1: complete for authored schema/defaults/normalize/assert.
- Phase 2: complete for static measurement.
- Phase 3: complete for deterministic static pagination slices.
- Phase 4: complete for PDF/DOCX smoke coverage; DOCX exact column fidelity is
  still deferred.
- Phase 5: complete for static editor preview/selection/drift tracking.
- Phase 6: initial insertion/property/delete support complete for default
  two-stack `flow-columns`; add-stack and sibling-safe resize controls remain
  follow-up work.
- Phase 7: complete for focused long-document pagination stability and DOCX
  duplicate-text smoke coverage; no broad benchmark framework was added.
- Phase 8: accepted for `0.5.0` after focused schema/layout/pagination/
  renderer/editor tests and version consistency checks. Browser/manual smoke
  remains a follow-up risk, not a blocker for the static milestone.

## Intent

Build `flow-row` / `flow-stack` as a parallel long-form layout primitive while
leaving existing `row` / `stack` behavior unchanged.

The milestone target is static, deterministic, resource-conscious cross-page
row/column flow. Live cross-page WYSIWYG editing is intentionally out of scope
until static pagination and rendering are stable.

## Autonomy Rules

Implementers may proceed through the phases in this roadmap without asking for a
new product decision when the change:

- matches `docs/FLOW_ROW_STACK_SPEC.md`;
- preserves old `row` / `stack` semantics;
- keeps authored documents layout-free;
- uses `PaginatedDocument` as the renderer-facing truth;
- is covered by focused tests for the touched layer;
- avoids broad rewrites outside the phase scope.

Pause and ask for a new decision before:

- changing existing `row` / `stack` meaning;
- allowing old `stack` inside `flow-row` or `flow-stack` inside old `row`;
- adding nested `flow-row`;
- adding live cross-page WYSIWYG behavior;
- changing package/document version semantics;
- changing production defaults or feature gates;
- rewriting table pagination to share implementation before `flow-row` is
  accepted;
- adding table-like spans, repeated headers, or column spanning to `flow-row`.

## Conservative Defaults

Use these defaults unless a later decision updates the spec:

- `flow-row` breakability is implied by the node type. Do not add an
  `allowBreak` prop in `0.5.0`.
- `flow-row.props.gap` owns column gap in `0.5.0`. Do not add
  `flow-stack` padding unless a focused design accepts it.
- `flow-row.props.minHeight` applies to the first slice only in `0.5.0`.
- `flow-stack.props.minHeight` participates in first-slice visual height only.
- `keepWithNext` inside `flow-stack` is deferred unless a later pagination patch
  explicitly designs and tests it.
- `flow-row` / `flow-stack` styling props such as borders and backgrounds are
  deferred. Editor selection chrome may visualize fragments, but authored visual
  styling is not part of this milestone.
- DOCX should not invent a separate layout policy. If exact DOCX fidelity is not
  practical in `0.5.0`, preserve useful structure and document the limitation.

## Definition Of Done For 0.5.0

`0.5.0` is acceptable when:

- schema, normalization, and document assertions support valid
  `flow-row` / `flow-stack` documents;
- invalid mixes with old `row` / `stack` are rejected;
- core pagination emits deterministic `flow-row` and `flow-stack` page slices;
- page slices preserve `parentNodeId`, `fragmentIndex`, continuation metadata,
  and paragraph `lineStart` / `lineEnd`;
- no empty continuation slice is emitted without content progress;
- forced progress emits an explicit warning;
- editor preview and PDF consume the same `PaginatedDocument` fragments;
- old `row` / `stack`, table, body paragraph, TOC, page number, and WYSIWYG
  baseline tests still pass;
- at least one focused long multi-page `flow-row` fixture is covered by tests.

## Phase 0 - Design Lock And Reading Set

Goal: make sure implementation starts from the current contracts.

Required reading before code changes:

- `AGENTS.md`
- `docs/DOCS_INDEX.md`
- `docs/agent/CODEX_ROLES.md`
- `docs/agent/REVIEW_GATE.md`
- `docs/FLOW_ROW_STACK_SPEC.md`
- `docs/FLOW_ROW_STACK_ROADMAP.md`
- `docs/LAYOUT_ENGINE_SPEC.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/TEST_STRATEGY.md`

Exit criteria:

- open questions needed for the next phase are either resolved in this roadmap
  or explicitly marked as deferred;
- no runtime code has changed without a phase target.

## Phase 1 - Authored Model Foundation

Goal: introduce `flow-row` / `flow-stack` as valid authored nodes without
changing pagination behavior.

Primary files:

- `packages/core/src/schema/block.ts`
- `packages/core/src/document/assert.ts`
- `packages/core/src/document/normalize.ts`
- `packages/core/src/document/defaults.ts`
- `packages/core/src/document/operations.ts` only if generic tree helpers need
  to recognize the new container types

Tasks:

- Add `FlowRowPropsSchema` and `FlowStackPropsSchema`.
- Add `FlowRowNodeSchema` and `FlowStackNodeSchema`.
- Add both nodes to `LayoutNodeSchema`.
- Export `FlowRowNode`, `FlowStackNode`, and props types.
- Update graph assertions:
  - body may contain `flow-row`;
  - `flow-row` may contain only `flow-stack`;
  - `flow-stack` may contain only paragraph and spacer in `0.5.0`;
  - `flow-stack` inside `flow-row` must have `widthShare`;
  - `flow-row` width shares must total `100.00`;
  - old `row` still accepts only old `stack`;
  - old `stack` does not accept `flow-row` in this phase unless the spec is
    updated.
- Add default factories:
  - `createFlowStackNode`;
  - `createFlowRowNode`;
  - `createFlowColumnsSubtree(columnCount = 2)`.
- Keep two-stack insertion as a default shape only, not a model limit.

Tests:

- valid body-level `flow-row` with two `flow-stack` children passes
  `assertDocument`;
- valid three-stack `flow-row` passes `assertDocument`;
- `flow-row` containing old `stack` fails;
- old `row` containing `flow-stack` fails;
- `flow-stack` outside `flow-row` fails through orphan or tree-law validation;
- missing or invalid `widthShare` fails;
- width share sum not equal to `100.00` fails;
- normalization preserves valid `flow-row` / `flow-stack` props and child order.

Exit criteria:

- schema and document assertion tests pass;
- old row/stack tests remain unchanged;
- no pagination or renderer behavior is changed yet.

## Phase 2 - Flow Measurement Support

Goal: let the layout flow layer measure `flow-row` / `flow-stack` trees without
making page-break decisions.

Primary files:

- `packages/core/src/layout/types.ts`
- `packages/core/src/layout/flow.ts`
- `packages/core/src/layout/measure.ts` only if node-specific measurement needs
  a small extension

Tasks:

- Add `flow-row` and `flow-stack` to `FlowBox.nodeType`.
- Generalize row width distribution so old `row` and new `flow-row` can share
  proportional width math without sharing semantics.
- Add `flowVerticalContainer` support for `flow-stack` child measurement.
- Add `flowFlowRow` or equivalent dedicated function.
- Preserve existing `flowRow` atomic behavior for old `row`.
- Do not compute page slices in this layer.

Tests:

- measured `flow-row` distributes two stack widths correctly;
- measured `flow-row` distributes three stack widths correctly;
- gap is subtracted from available width;
- child `flow-stack` x positions are contiguous with gap;
- measurement does not mutate authored nodes;
- old row/stack measurement tests still pass.

Exit criteria:

- flow measurement can produce a `FlowBox` tree for valid `flow-row`;
- no `PaginatedDocument` output uses `flow-row` yet unless Phase 3 has started.

## Phase 3 - Static Pagination Slices

Goal: emit deterministic cross-page `flow-row` / `flow-stack` fragments from
core pagination.

Primary files:

- `packages/core/src/pagination/types.ts`
- `packages/core/src/pagination/paginator.ts`
- `packages/core/src/pagination/assertPaginated.ts`
- `packages/core/src/pagination/warnings.ts` if warning collection needs updates

Tasks:

- Add `flow-row` and `flow-stack` to `PageFragment.nodeType`.
- Add warning code `forced-flow-row-split-overflow`.
- Add a dedicated `paginateFlowRow` path in `paginateFlowBox`.
- Track per-stack split points:
  - child index;
  - line index for paragraph children.
- Emit one `flow-row` fragment per page slice.
- Emit one visible `flow-stack` fragment per active sibling slice.
- Emit paragraph and spacer fragments as children of the owning `flow-stack`.
- Set `flow-stack.parentNodeId` to the owning `flow-row`.
- Set child paragraph/spacer `parentNodeId` to the owning `flow-stack`.
- Set `fragmentIndex`, `continuesFrom`, and `isContinued` on `flow-row` and
  `flow-stack` fragments.
- Preserve paragraph `lineStart`, `lineEnd`, `continuesFrom`, and
  `isContinued`.
- Prevent empty continuation slices that make no content progress.
- Move to a clean next page when no stack can progress in the remaining space.
- Force one content unit with warning only when a clean page still cannot make
  normal progress.

Tests:

- one-page two-stack `flow-row` emits row, stack, and child fragments;
- one-page three-stack `flow-row` keeps width math general;
- one stack continues for three pages while a sibling ends early;
- both stacks continue independently with different line ranges;
- final slice shrinks to remaining content height;
- no empty continuation slice is emitted;
- forced progress emits `forced-flow-row-split-overflow`;
- `assertPaginatedDocument` accepts valid flow-row output;
- invalid parent/child flow-row fragment relationships are rejected or reported
  if assertion support is added;
- page-number fields inside `flow-stack` paragraphs resolve correctly.

Exit criteria:

- core pagination tests pass;
- no renderer recomputes flow-row layout;
- old paragraph, row/stack, table, TOC, and page-number pagination tests pass.

## Phase 4 - Renderer Integration

Goal: make renderers consume the new fragments without a second layout policy.

Primary files:

- `packages/core/src/renderer/pdf/index.ts`
- `packages/core/src/renderer/docx/index.ts`
- renderer tests under `packages/core/src/renderer/__tests__`

Tasks:

- Confirm PDF draws paragraph/toc children from `flow-stack` fragments without
  needing to draw container text.
- Add any needed container chrome only if renderer contract already supports it.
- Add DOCX grouping support for `flow-row` / `flow-stack`, or document a
  structure-preserving limitation if exact fidelity is deferred.
- Do not make PDF or DOCX choose page breaks.

Tests:

- PDF renders multi-page flow-row output without throwing;
- PDF page count matches pagination output;
- flow-row paragraph text appears once and is not duplicated;
- DOCX renderer does not crash on flow-row documents, even if exact visual
  fidelity is documented as limited.

Exit criteria:

- renderer smoke tests pass;
- renderers consume `PaginatedDocument` fragments directly.

## Phase 5 - Editor Static Preview

Goal: display and select static `flow-row` / `flow-stack` fragments in the
editor from paginated output.

Primary files:

- `src/app/editor/_components/EditorCanvas.tsx`
- `src/app/editor/_components/comparePagination.ts`
- `src/app/editor/_components/PropertyPanel.tsx`
- editor tests under `src/app/editor/_components/__tests__`

Tasks:

- Add visual colors/chrome for `flow-row` and `flow-stack` fragments.
- Make `flow-row` and `flow-stack` selectable.
- Keep drag behavior conservative; static selection comes before drag/drop.
- Add drift tracking for `flow-row` and `flow-stack`.
- Add basic property editing:
  - `flow-row.gap`;
  - `flow-row.minHeight`;
  - `flow-stack.widthShare`;
  - `flow-stack.minHeight`.
- Ensure property changes repaginate through the normal document path.
- Keep inline live cross-page WYSIWYG deferred.

Tests:

- editor renders flow-row fragments from a paginated fixture;
- selecting a flow-row selects the authored node;
- selecting a flow-stack selects the authored node;
- changing widthShare updates document props and repaginates;
- old row/stack selection and resize behavior still works.

Exit criteria:

- static preview is usable for manual validation;
- no active typing remount/focus guarantees are claimed for flow-stack yet.

## Phase 6 - Basic Insertion And Operations

Goal: make users able to create and adjust a simple flow-row document.

Primary files:

- `packages/core/src/placement/types.ts`
- `packages/core/src/placement/geometry.ts`
- `packages/core/src/placement/law.ts`
- `packages/core/src/document/operations.ts`
- relevant editor palette files

Tasks:

- Add palette block type for `flow-row` or `flow-columns`.
- Insert default two-stack `flow-row`.
- Add explicit operation for adding a `flow-stack` to an existing `flow-row`
  through property panel or controlled command.
- Keep drag/drop addition deferred unless the static operation is stable.
- Add remove/reorder only if the operation can preserve width shares and
  undo/redo semantics cleanly.
- Keep old `columns` palette behavior mapped to old row/stack unless product
  direction explicitly changes.

Tests:

- insert default flow-row creates valid document;
- add flow-stack redistributes width shares and passes `assertDocument`;
- remove flow-stack transfers or redistributes width shares and passes
  `assertDocument`;
- undo/redo creates expected document states if editor history is touched.

Exit criteria:

- manual creation path exists;
- advanced drag/drop is still optional after `0.5.0`.

## Phase 7 - Long Document And Performance Hardening

Goal: ensure the feature can handle real long documents without obvious resource
traps.

Primary files:

- pagination tests and fixtures;
- performance or smoke scripts if the project already has a suitable pattern.

Tasks:

- Add one long multi-page flow-row fixture.
- Verify pagination completes in a reasonable time for repeated runs.
- Check that page count and fragment count are stable.
- Check that renderer output does not duplicate text.
- Avoid adding broad benchmark infrastructure unless a focused test is not
  enough.

Tests:

- long two-stack fixture;
- long three-stack fixture if cheap;
- forced-progress edge fixture;
- widthShare change repaginates without invalid fragments.

Exit criteria:

- no obvious O(pages * stacks * renderers) recompute trap is introduced;
- focused long-document tests pass.

## Phase 8 - Acceptance Review And Version Bump

Goal: decide whether the milestone is acceptable as `0.5.0`.

Tasks:

- Run focused core tests for schema, pagination, renderer, and editor.
- Run `type-check`.
- Run relevant browser/manual smoke only after static editor integration exists.
- Update `docs/WORK_LOG.md` or recent work log with accepted behavior and
  known risks.
- Update `package.json` to `0.5.0` only after the Definition Of Done is met.

Acceptance review output:

- PASS items with file/function evidence;
- FAIL / BLOCKER items with reproducible scenarios;
- RISK items that are accepted for `0.5.x`;
- UNKNOWN items that are not verified;
- Minimal next patch list for `0.5.x`.

## Work Not In 0.5.0

- live cross-page WYSIWYG inside `flow-stack`;
- caret movement across flow-stack continuation slices;
- drag selection across multiple flow-stack slices;
- nested `flow-row`;
- old row/stack migration;
- table-like span behavior;
- repeated headers;
- flow-stack background/border authoring;
- production default changes.

## Recommended Patch Order

1. Schema and assertions.
2. Defaults and normalization.
3. Flow measurement.
4. Pagination type additions and one-page flow-row output.
5. Multi-page flow-row slicing.
6. Forced-progress and empty-slice guards.
7. Renderer smoke.
8. Editor static preview.
9. Basic insertion/property operations.
10. Long-document hardening.
11. Acceptance review and version bump.
