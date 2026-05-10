# Page Fragmentation Model

This document describes FlowDoc's current page fragmentation model. It is a
contract for current behavior and vocabulary, not a promise that all structures
will eventually use the same fragmentation strategy.

## Summary

FlowDoc currently uses a natural-flow-first, policy-based fragmentation model.

The flow layer measures natural document flow before page breaks. The pagination
layer owns page breaks and converts flow output into `PaginatedDocument` /
`PageFragment` output. Renderers consume paginated fragments and must not
independently compute page breaks or reflow content.

## Layers

### Natural Flow Layer

The natural flow layer measures and places authored nodes as if the document had
one long continuous page.

It answers questions such as:

- natural `x` / `y` / `width` / `height` for a node
- paragraph height from measured lines
- spacer height
- row height from child stacks
- table row and cell heights before pagination

This layer does not decide final page breaks. Table cells currently use
stack-like `FlowBox.nodeType="stack"` container semantics during flow
measurement. Pagination later emits those cells as
`PageFragment.nodeType="table-cell"` for renderer, drift/debug, and editor
identity.

### Pagination Layer

The pagination layer owns page placement, split points, continuation metadata,
overflow policy, and page-number context.

It consumes authored or resolved document data plus natural flow output and
emits `PaginatedDocument`. Each `PageFragment` describes the portion of a source
node placed on a page.

Different structures intentionally use different page-boundary policies today.
This is a policy matrix, not a unified generic fragmenter architecture.

### Renderer Layer

Renderers consume `PaginatedDocument` and serialize or draw the fragments they
receive.

Renderers must not decide:

- page breaks
- line breaks
- paragraph continuation boundaries
- table row split boundaries
- repeated table header placement
- page-number context

If renderer output needs information not present on `PaginatedDocument`, enrich
pagination output or shared renderer metadata instead of re-computing layout in
the renderer.

## Fragmentation Policies

| Structure | Current policy | Break unit | Continuation state |
|---|---|---|---|
| Paragraph | Line fragmentation | measured line | `lineStart` / `lineEnd`, continuation flags, `fragmentIndex` where available |
| Spacer | Atomic block | none | none |
| Row/stack | Atomic for now | none | none |
| Table row `allowBreak=false` | Atomic row | none | none |
| Table row `allowBreak=true` or omitted (default breakable) | Sliced row | per-cell child/line slice | cell split state |
| Rowspan group | Atomic group | none | none |
| TOC | Two-pass block | corrected generated height after pass 1 | TOC height override and repagination |

## Table Row Split Model

Breakable single-row table groups use the most complex current policy.

The row loop is height/slice-driven:

- natural flow computes the row's total height
- pagination compares the remaining page space with the remaining row height
- each page receives a row slice with a slice height
- continuation pages may first place repeated table headers

Cell continuation is tracked independently per cell:

- each cell keeps a child/line split state
- paragraphs inside cells split by measured line ranges
- spacer and empty-cell handling must not duplicate or skip content
- short cells may finish before sibling cells and should not repeat on later
  slices

This means table row splitting has two states that must stay consistent: the
height-driven row slice loop and the per-cell content continuation state. Tests
for this area should focus on accounting invariants:

- no missing content
- no duplicated lines or spacers
- contiguous `lineStart` / `lineEnd` ranges
- fragment order remains stable by page
- `assertPaginatedDocument` still passes

## Deferred Policies

These are intentionally deferred and should not be implemented opportunistically:

- independent splitting inside row/stack layouts
- split-at-row-boundary or split-inside behavior for rowspan-linked groups
- generic fragmenter or unified policy refactor
- richer stable fragment identity for selection, comments, annotations, or
  collaboration
- visual regression tests for editor/PDF parity

## Agent Guardrails

- Do not make frontend/browser preview the source of layout truth.
- Do not make renderers compute page breaks or line breaks.
- Do not change cross-page behavior without focused tests.
- Prefer invariant/accounting tests before refactoring pagination code.
- **Do not unify fragmentation policies opportunistically.** Different
  structures intentionally use different page-boundary policies today. Any
  unification or generic fragmenter refactor must be backed by focused
  regression tests and an explicit task.
- Keep this document descriptive of the current model. Put future plans in an
  explicit plan/checklist section instead of making them look like current
  behavior.
