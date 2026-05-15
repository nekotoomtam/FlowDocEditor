# Flow Row / Flow Stack Spec

Status: Draft plus active implementation notes for the `0.5.0` milestone.
`flow-row` and `flow-stack` have an initial static implementation; live
cross-page WYSIWYG editing remains out of scope.

Implementation order and phase gates are tracked in
`docs/FLOW_ROW_STACK_ROADMAP.md`.

## Decision

FlowDocEditor will keep the existing `row` / `stack` behavior as the stable
atomic layout primitive and introduce a parallel primitive pair:

- `flow-row`
- `flow-stack`

The new pair is for long-form side-by-side content that can fragment across
pages. The old pair remains valid for form-like layout, fixed boxes, and
single-page atomic groups.

This avoids silently changing the meaning of existing documents while creating a
path toward multi-page row/column layout.

## Version Target

`0.5.0` is the first `flow-row` / `flow-stack` milestone.

The intended `0.5.0` target is static pagination and rendering:

- authored schema support for `flow-row` and `flow-stack`
- core pagination support for page slices
- editor preview rendering from the same paginated slices
- PDF rendering from the same paginated slices
- basic insertion/selection/property editing sufficient for manual validation
- focused tests for cross-page slices, parent/child relationships, and forced
  progress cases

Deferred past `0.5.0`:

- live WYSIWYG cross-page editing inside `flow-stack`
- nested `flow-row`
- mixing `flow-row` with old `stack`, or old `row` with `flow-stack`
- advanced table-like span behavior
- migration or deprecation of old `row` / `stack`

## Current Model

The current layout contract treats normal body paragraphs, row/stack paragraphs,
and table-cell paragraphs differently:

- body paragraphs may split by measured line boundaries;
- `row` / `stack` is atomic for now, and paragraphs inside stacks do not split
  independently;
- breakable table rows have their own row-slice loop.

`flow-row` / `flow-stack` should be a new fourth placement path, not a patch to
the existing atomic row/stack path.

## Goals

- Support long documents where side-by-side content can continue across pages.
- Preserve existing `row` / `stack` behavior for old documents.
- Keep authored documents layout-free: page assignment, geometry, continuation
  metadata, and slice identity belong to paginated output.
- Give renderers a single `PaginatedDocument` truth instead of requiring PDF,
  DOCX, or the editor to recompute row/column flow.
- Build a reusable parent/child slice model that may later inform table work,
  without merging table rules into this feature.
- Leave room for future add/remove/reorder/resize column workflows without
  redesigning the authored model or pagination contract.
- Keep the first implementation performance-conscious enough for long documents:
  pagination should do the expensive flow work once, and renderers should only
  consume the resulting fragments.

## Non-Goals

- Do not change existing `row` / `stack` semantics in the same milestone.
- Do not use `flow-row` as a replacement for tables.
- Do not support rowspan, colspan, repeated headers, or table borders here.
- Do not make browser/editor preview authoritative over core pagination.
- Do not implement live cross-page WYSIWYG editing before static pagination is
  stable.

## Extensibility Constraints

`0.5.0` may expose only a basic two-stack insertion path in the editor, but the
model and pagination design must not assume exactly two stacks.

Rules:

- Treat two stacks as the default inserted shape, not as a schema limit.
- Use ordered `childIds` and stack `widthShare` values instead of hard-coded
  left/right fields.
- Compute stack widths from all `flow-stack` children in the row, so adding a
  third or fourth stack later is a document operation plus repagination, not a
  layout rewrite.
- Keep add/remove/reorder/resize column behavior expressible as document
  operations on `flow-row.childIds` and `flow-stack.props`; future drag/drop UI
  should wrap those operations instead of creating a separate layout path.
- Row-level add-column should add one empty `flow-stack` and rebalance every
  direct child stack width share equally. Stack-level edge insertion should stay
  local and split only the selected stack's width share.
- Keep invalid mixes explicit: old `stack` must not become a silent alias for
  `flow-stack`, and old `row` must not gain partial flow behavior.
- Avoid fragment metadata that only works for two siblings. Parent/child
  traceability, continuation flags, and fragment ordering must work for any
  supported number of direct `flow-stack` children.

## Performance Constraints

The first implementation should favor correctness, but it should not create a
known performance dead end.

Rules:

- Core pagination owns flow measurement and split decisions for each
  `flow-row`; editor preview, PDF, and later renderers consume the resulting
  `PaginatedDocument` fragments.
- Renderers must not remeasure child paragraphs, recompute stack widths, or
  choose page breaks for `flow-row` output.
- Avoid algorithms that repeatedly remeasure unchanged stack content for every
  sibling, page slice, or renderer pass when cached measurement inputs are still
  valid.
- Pagination must make deterministic progress per slice and avoid emitting
  empty continuation slices, because empty slices are both correctness bugs and
  performance traps.
- Width/share edits may repaginate the affected `flow-row`, but should not force
  unrelated body content to take a separate renderer-side layout path.
- Performance tests do not need to be broad in the first patch, but the focused
  test set should include at least one long multi-page `flow-row` fixture before
  the feature is considered accepted for `0.5.0`.

## Authored Model Draft

Draft node types:

```ts
type FlowRowNode = {
  id: string
  type: "flow-row"
  props: {
    gap?: number
    minHeight?: number
  }
  childIds: string[] // flow-stack ids only in v1
}

type FlowStackNode = {
  id: string
  type: "flow-stack"
  props: {
    widthShare?: number
    minHeight?: number
  }
  childIds: string[] // paragraphs and spacers in v1
}
```

Draft v1 restrictions:

- `flow-row` may appear in the body flow.
- `flow-row.childIds` must resolve only to `flow-stack` nodes.
- `flow-stack` must be a direct child of `flow-row`.
- Old `row` cannot contain `flow-stack`.
- `flow-row` cannot contain old `stack`.
- Nested `flow-row` is deferred.
- Tables inside `flow-stack` are deferred unless a separate design accepts the
  additional split semantics.

## Pagination Model Draft

Pagination should create page slices from a single authored `flow-row`.

For an authored node:

```text
flow-row A
  flow-stack L
  flow-stack R
```

Pagination may emit:

```text
page 0:
  flow-row A slice 0
    flow-stack L slice 0
      paragraph fragments from L
    flow-stack R slice 0
      paragraph fragments from R

page 1:
  flow-row A slice 1
    flow-stack L slice 1
      continued paragraph fragments from L
    flow-stack R slice 1
      empty or continued slice, depending on remaining content
```

Each page slice should preserve parent/child traceability:

- child paragraph/spacer fragments have `parentNodeId` set to the owning
  `flow-stack`;
- each `flow-stack` slice has `parentNodeId` set to the owning `flow-row`;
- each `flow-row` slice has `parentNodeId` set to the containing body/root.
- every emitted `flow-row` slice includes a visual `flow-stack` fragment for
  each authored direct child stack, even when that stack has no content in the
  slice. Empty/inactive stacks remain selectable and visible as drop targets,
  but do not emit extra paragraph/spacer child fragments.

Continuation metadata should be explicit enough that renderers, drift reports,
and future caret/selection work do not infer slice identity from object order
alone.

Draft fragment metadata:

- `fragmentIndex` for each `flow-row` and `flow-stack` slice
- `continuesFrom` / `isContinued` for `flow-row` and `flow-stack`
- existing `lineStart` / `lineEnd` for split paragraph children

## Slice Height Rules Draft

Within a page slice:

- stack widths are distributed from `widthShare` and `gap`;
- each active `flow-stack` consumes its own child content independently;
- the `flow-row` slice height is the maximum consumed height among its stack
  slices;
- every visible `flow-stack` slice uses the same height as the row slice so
  backgrounds, selection rectangles, and resize handles align;
- if any stack has remaining content and uses all available vertical capacity,
  the current slice may fill to the page content bottom;
- the final slice may shrink to the tallest remaining stack content.

Open design question:

- Should `minHeight` apply only to the first slice, to every slice, or to the
  final visual row group? The conservative v1 default should be first-slice only
  unless tests show a better rule.

## Progress Rules Draft

Pagination must avoid infinite loops.

For each `flow-row` slice:

1. Try to place content for every `flow-stack` within the remaining page height.
2. If no stack can make progress and the row can move to a clean next page, move
   the slice before emitting it.
3. If no stack can make progress even at the top of a clean page, force one
   content unit forward and attach an explicit layout warning.
4. Never emit an empty continuation slice while all remaining content stays at
   the same split point.

This mirrors the table-row forced-progress principle without importing table
header/span behavior.

## Editor Behavior Draft

`0.5.0` should focus on settled/static behavior.

Expected editor behavior:

- palette can insert a basic two-stack `flow-row`;
- selection can target `flow-row` and `flow-stack` slices without mutating the
  authored document;
- width/share edits repaginate the whole `flow-row`;
- existing `row` / `stack` remains available and unchanged;
- inline editing inside `flow-stack` may commit text and then reconcile through
  normal pagination.

Deferred editor behavior:

- live WYSIWYG continuation while typing across `flow-row` slices;
- caret movement across flow-stack continuation slices;
- drag selection across multiple flow-stack slices;
- preserving active edit focus while a `flow-row` repaginates across pages.

## Renderer Behavior Draft

PDF/editor preview should consume the `PaginatedDocument` fragments directly.

Renderers must not recompute:

- stack widths
- row slice heights
- child continuation split points
- page breaks

DOCX remains an exchange format. If DOCX cannot preserve the exact visual
fragmentation, it should preserve useful structure and document the limitation
instead of inventing a second layout policy.

## Test Plan

Core pagination tests:

- one-page `flow-row` with two `flow-stack` children preserves widths,
  parent/child ids, and row/stack height alignment;
- one stack continues for three pages while the sibling stack finishes early;
- both stacks continue with independent paragraph line ranges;
- final slice shrinks to remaining content height when no stack continues;
- no empty continuation slice is emitted without content progress;
- too-tall content forces progress with an explicit warning;
- resizing width shares changes line breaks through repagination without invalid
  fragments;
- `assertPaginatedDocument` accepts valid flow-row output and rejects invalid
  parent/child slice relationships.

Renderer tests:

- PDF renders multi-page flow-row output without throwing;
- renderer smoke confirms page count matches pagination output;
- renderers do not merge or drop continuation fragments.

App/editor tests:

- schema/normalize accepts valid `flow-row` / `flow-stack` and rejects invalid
  mixes with old `row` / `stack`;
- editor helper tests can select inserted flow-row/flow-stack fragments;
- browser smoke is deferred until the first editor integration patch.

## Risk Map

High risks:

- infinite pagination loops if no stack makes progress;
- empty continuation slices that look valid but duplicate or skip content;
- sibling stack alignment drifting between editor, PDF, and server pagination;
- lineStart/lineEnd metadata becoming ambiguous across nested slices;
- selection/caret mapping relying on DOM order instead of fragment metadata;
- accidental semantic changes to old `row` / `stack`.

Mitigation:

- implement schema and pagination tests before editor UX;
- keep old and new primitives separate;
- keep renderer code `PaginatedDocument`-only;
- do not enable live cross-page WYSIWYG editing until static slices are stable.

## Open Questions

- Should flow-stack backgrounds/borders render on continuation pages after that
  stack's content has ended but a sibling stack continues?
- Should `gap` be a row prop only, or should stacks support padding before v1?
- Should `keepWithNext` work inside a flow-stack in the first milestone?
- Should flow-row have an `allowBreak` prop, or is breakability implied by the
  node type?
- Should future migration convert old `row` / `stack` to `flow-row` /
  `flow-stack`, or should both remain first-class forever?
