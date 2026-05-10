# Cross-Page Behavior Contract

This document is the source of truth for how FlowDoc handles content that meets
a page boundary. It describes current behavior, accepted overflow cases, and
deferred work so pagination, editor preview, PDF, DOCX, and tests speak the same
language.

## Ownership

- `packages/core` owns page-break decisions and continuation boundaries.
- `PaginatedDocument` is the renderer-facing contract.
- Renderers draw or serialize the fragments they receive; they must not recompute
  page breaks.
- The editor may show local geometry previews during interaction, but it must
  reconcile back to authoritative pagination.
- Authored document data must stay layout-free. Page assignment, fragment
  geometry, line positions, and continuation metadata belong to paginated output.

Table authoring, cell selection, and row/column operation rules are documented in
`docs/TABLE_EDITING_CONTRACT.md`. Cross-page table work should preserve that
contract while changing pagination behavior.

## Table Authoring Preconditions For Cross-Page Work

Before changing table page-boundary behavior, these authored-table rules should
remain true:

- Table row and column operations preserve `assertDocument` and
  `assertPaginatedDocument`.
- Adding a column preserves total table width by splitting a target or nearest
  column width.
- Removing a column preserves total table width by transferring the removed width
  to a neighboring column.
- `headerRowCount` and `allowBreak` are authored properties, not renderer-only
  switches.
- Editor selection may select a `table-cell` from rendered cell text, but
  pagination still receives the same authored table model.

## Current Behavior Matrix

| Structure | Current page-boundary behavior | Tests |
|---|---|---|
| Body paragraph | Splits by measured line boundaries across any number of pages. `spacingBefore` applies only to the first fragment; `spacingAfter` applies only to the last fragment. Widow/orphan and `keepWithNext` rules are applied by pagination. | `paginator.test.ts`, `fragmentMeta.test.ts`, `widowOrphan.test.ts`, `keepWithNext.test.ts` |
| Stack/column paragraph | Does not split independently today. The containing row is atomic; paragraph content is placed as one fragment inside the row's allocated height. If the row is taller than one content page, overflow is documented. | `rowStack.test.ts` |
| Row/stack group | Moves as a whole row when it fits on the next page. Very tall rows stay at page content top and may overflow to force progress. | `rowStack.test.ts`, `resizeConvergence.test.ts` |
| Table row with `allowBreak=false` | Moves as a whole row when possible. Too-tall rows may overflow according to the documented forced-progress policy. | `tablePagination.test.ts` |
| Table row with `allowBreak=true` or omitted | A single-row group may split across pages. Cell paragraphs split by measured line boundaries through the table row split loop. Shorter cells render only once and are not duplicated on continuation pages. | `tablePagination.test.ts` |
| Rowspan-linked table rows | Rowspan-linked rows stay together as an atomic group. If the group does not fit, it moves to the next page as a unit. Split-at-row-boundary inside a rowspan group is deferred. | `tablePagination.test.ts` |
| Repeating table headers | The first `headerRowCount` rows repeat at the top of continuation pages where table body rows continue. | `tablePagination.test.ts` |
| Header/footer page numbers | Header and footer fragments are cloned per page and inline page-number fields resolve using physical or section-local display page numbers. | `sectionPageNumbers.test.ts`, `tablePagination.test.ts`, `multiSection.test.ts` |
| TOC placeholder | Pass 1 estimates height and collects entries. If generated TOC content exceeds the placeholder, pass 2 repaginates with corrected height before rendering TOC lines. | `tocOverflow.test.ts`, `multiSection.test.ts` |

## Fragment Contract

Split fragments must remain traceable to the authored source node.

Paragraph fragments currently expose:

- `nodeId`
- `pageIndex`
- `fragmentIndex`
- `lineStart`
- `lineEnd`
- `continuesFrom`
- `isContinued`

These fields describe the line slice that pagination placed on a page. Renderers
and drift reporting should use these fields instead of inferring continuation
from object order alone.

Table-cell paragraphs expose `lineStart`, `lineEnd`, `continuesFrom`, and
`isContinued` in both full-row placement and breakable-row continuation. For
split rows, continuation follows the table row split loop, and these fields let
renderers and drift tools identify the source line slice. Table-cell paragraphs
do not yet expose `fragmentIndex`; explicit stable fragment identity is still
deferred.

## Overflow Policy

Overflow is allowed only as an explicit fallback.

- If a block fits on the next page, pagination should move it instead of
  overflowing the current page.
- If a structure is taller than one content page and does not have a split policy
  yet, pagination may place it at the page content top and allow overflow.
- A too-tall single paragraph line must force progress instead of causing an
  infinite loop.
- Tests should cover every accepted overflow case so future changes do not turn
  accidental clipping into silent behavior.

## Deferred Work

- Split-at-row-boundary inside rowspan-linked table groups.
- Colspan-specific split behavior and more complex table span interactions.
- Independent row/column paragraph continuation across pages.
- List marker and indentation rules on continuation fragments.
- Stable explicit fragment ids for future selection, annotations, comments, or
  collaborative cursors.
- Visual regression tests for PDF/editor parity and product page-count golden
  fixtures.
- Further inline editing hardening for continuation paragraph fragments.

## Change Rule

Any change to page-boundary behavior should update this document, add or adjust a
focused fixture, and keep the full test suite green. High-risk areas are body
paragraph splitting, widow/orphan rules, `keepWithNext`, table row splitting,
rowspan groups, repeating headers, page numbers, and TOC repagination.
