# Layout Engine Specification

This is a living specification for the FlowDoc layout engine. It collects the
engine-level rules that should stay true while implementation details continue to
evolve.

The goal is not to freeze every internal type too early. The goal is to make the
engine's intended behavior explicit enough that future code changes, renderer
changes, and refactors do not quietly create a second layout engine.

Use this document for rules, contracts, policies, and definitions. Use checklist
documents for execution status and implementation tasks.

For the product-level direction behind the engine, see
`docs/PRODUCT_DIRECTION.md`.

For the current page-boundary support matrix, overflow fallbacks, and deferred
cross-page behavior, see `docs/CROSS_PAGE_BEHAVIOR.md`.

For table authoring, editor selection, and row/column operation rules, see
`docs/TABLE_EDITING_CONTRACT.md`.

For export/API/PDF/DOCX expectations, see
`docs/EXPORT_RENDERER_CONTRACT.md`.

## 1. Engine Invariants

Engine invariants are rules that should remain true across editor preview,
authoritative pagination, export, and future renderers.

A change that breaks an invariant is a behavior regression unless the spec is
updated intentionally.

### 1.1 Core Owns Document Semantics

`packages/core` is the source of truth for document semantics, layout behavior,
pagination decisions, and renderer-facing layout output.

Application code may provide runtime services, such as font measurement, word
breaking, data binding, network APIs, or UI interaction state. It must not invent
separate document rules.

Do:

- keep shared layout behavior in core
- inject runtime-specific services through contracts
- make preview, PDF, DOCX, and future renderers consume the same layout result

Avoid:

- duplicating flow layout rules in React, CSS, API routes, or export code
- allowing a renderer to decide document flow independently
- letting editor-only interaction state become document semantics

### 1.2 Authored Document Data Is Layout-Free

The authored document model describes structure and intent. It is not the layout
result.

Authored document data may contain:

- nodes and hierarchy
- text and field references
- authored properties such as spacing, margins, font size, column shares, table
  settings, and page settings

Authored document data must not store computed values such as:

- fragment `x` / `y`
- measured line positions
- page assignment
- renderer-specific geometry
- temporary editor overlay state

Computed layout belongs to measured and paginated output.

### 1.3 Pagination Is Authoritative

Pagination decides page placement, split points, overflow behavior, and the
renderer-facing fragment tree.

Renderers may translate layout output into their target format, but they must not
recompute flow layout.

If browser preview and server/export pagination disagree, the server/export
result is authoritative until the project explicitly changes that ownership.

### 1.4 Determinism Is Required

For the same document input, page settings, font metrics, text measurer, word
breaker, and layout options, pagination should produce the same output.

This includes:

- page count
- fragment order
- fragment geometry
- line break decisions
- continuation boundaries
- generated page-number text

A nondeterministic layout result is a bug unless explicitly documented as an
allowed runtime limitation.

### 1.5 Renderers Consume Layout Output

PDF, DOCX, editor preview, and future renderers should consume
`PaginatedDocument` or an equivalent renderer-facing layout result.

Renderer responsibilities:

- draw fragments at the positions provided by pagination
- apply target-format conversion, such as PDF units or DOCX structures
- expose unsupported fidelity clearly

Renderer non-responsibilities:

- deciding page breaks
- recomputing paragraph wrapping
- reordering layout fragments
- applying document semantics that core does not know about

DOCX is the exception only in the sense that Word/LibreOffice may reflow content
after export. FlowDoc should still export the intended structure and document the
fidelity limitation.

## 2. Layer Boundaries

The layout system should stay split into clear layers so future refactors do not
merge responsibilities accidentally.

### 2.1 Authored Model Layer

Owns document structure and author intent.

Examples:

- `DocumentNode`
- page settings
- text nodes
- field references
- row / stack / table structure
- authored spacing and size properties

This layer should be serializable and stable enough for persistence, history,
import/export, and future workflow features.

### 2.2 Binding / Resolution Layer

Turns template data plus filling data into a resolved document for preview and
export.

Current support is scalar `fieldRef` resolution only. Repeat regions and nested
repeat behavior are draft/deferred; do not add them while fixing unrelated
layout, editor, or renderer issues.

Rules:

- templates keep field references
- filling data stores submitted values
- rendering uses a resolved temporary document
- binding should not mutate the original template structure

### 2.3 Measurement Layer

Measures text and exposes line-level information needed by pagination.

The measurement layer may use runtime services such as:

- `TextMeasurer`
- `WordBreaker`
- font providers
- server fontkit measurement
- browser canvas measurement

Measurement must not decide page breaks. It gives pagination enough information
to decide them.

### 2.4 Pagination Layer

Owns flow layout, page placement, continuation, split policy, and overflow
policy.

Pagination consumes authored/resolved data plus measurement results. It produces
a renderer-facing paginated output.

### 2.5 Renderer Layer

Consumes paginated output and draws or serializes it.

Renderer output may differ because target formats have different capabilities,
but any difference should be explicit and measurable.

### 2.6 Editor Layer

Owns interaction state and authoring UX.

Examples:

- selection
- resize preview
- drag preview
- inline edit state
- focus / caret state
- debounce and loading state

The editor may preview layout, but it should converge back to authoritative
pagination.

## 3. Document Model Rules

The document model should remain stable enough to support layout, validation,
history, binding, and future editing workflows.

### 3.1 Node Identity

Each authored node must have stable identity.

Stable identity is required for:

- operations
- validation
- pagination comparison
- renderer output mapping
- future comments / annotations
- future history and diff

Avoid generating identity from runtime object order or render order.

### 3.2 Tree Validity

The document tree should preserve core structural rules:

- no duplicate node ids
- no cycles
- no orphan children
- no multiple parents for one child
- valid parent/child combinations
- valid table grid and cell relationships

`assertDocument` should own hard validity failures. `normalizeDocument` should
only canonicalize safe incomplete input, not hide broken structure.

### 3.3 Source Node vs Layout Fragment

A source node is authored document data. A layout fragment is computed output.

One source node may produce:

- one fragment on one page
- multiple fragments across pages
- nested fragments, such as table / row / cell / paragraph relationships
- no visible fragment in future conditional-rendering cases

Fragments should remain traceable to their source node.

### 3.4 Placeholder and Generated Content

Placeholders, page numbers, TOC entries, and generated content must have clear
ownership.

Rules:

- authored placeholders belong to the document model
- resolved generated text belongs to the binding/pagination/render pipeline
- page-number resolution must happen where page context is known
- renderers should receive resolved content or explicit rendering instructions

Page-number resolution is a cross-cutting concern. Every code path that builds
paragraph line fragments and assigns a `pageIndex` must call the page-number
resolver before pushing the fragment. This applies to:

- body-level paragraph fragments (`paginateParagraph`)
- stack / column paragraph fragments (`pushStackContents`)
- table cell paragraph fragments (`pushTableCellContents`, `pushCellSlice`)

Omitting this call in any path is a bug: the page-number placeholder string will
appear in the rendered output instead of the resolved number.

Generated content that can change page count, such as a full TOC, must have a
clear repagination policy before it is treated as complete. The current TOC
policy is two-pass pagination: pass 1 collects entries and detects overflow;
pass 2 runs only when the generated TOC needs more height.

### 3.5 Table Authoring And Operations

Tables have their own authored grid law. A table operation is incomplete if it
only changes visible UI and leaves the model in a shape that `assertDocument`
would reject.

Rules:

- table rows, cells, columns, spans, and cell child content must be updated as
  one structural unit
- table column insertion should preserve total table width by splitting a target
  or nearest column width
- table column deletion should preserve total table width by transferring the
  removed width to a neighboring column
- adding or deleting a column is not an implicit resize of the whole table
- editor selection may target a `table-cell` even when the pointer lands on an
  inner paragraph fragment, but this must remain editor interaction state and
  must not change the authored model
- pagination-related authored props such as `headerRowCount` and `allowBreak`
  should be edited as schema-valid props, not as renderer-only flags

Detailed table editor rules live in `docs/TABLE_EDITING_CONTRACT.md`.

## 4. Pagination Rules

Pagination is where document flow becomes pages. It should be deterministic,
measurable, and renderer-independent.

### 4.1 Page Content Box

Pagination places content inside the page content box after applying page size,
margin, header, footer, and template constraints.

Fragments should not escape the content box unless the node's overflow policy
allows it or a forced-progress edge case is documented.

### 4.2 Node Break Policy

Each node type needs an explicit page-break policy.

Current policy direction:

- paragraph: may split by measured line boundaries
- spacer: atomic whole-block move
- row / stack: atomic for now; paragraphs inside stacks are bounded by the row
  height and do not split independently
- table row: single-row groups split by default; `allowBreak=false` keeps a row
  together when possible; rowspan-linked groups move as a unit until
  split-at-row-boundary rules are explicit
- table cell content: splits by the same measured line boundaries as body
  paragraphs, but only within a row that permits splitting; see 4.3
- TOC placeholder: estimated-height placeholder in pass 1; if generated TOC
  content is taller than the placeholder, pass 2 repaginates with the corrected
  height before rendering TOC lines

A node type without a defined split policy should move as a whole block or use a
documented overflow fallback.

There are currently three distinct code paths for placing paragraph fragments:

1. **Body-level paragraph** — `paginateParagraph` runs a full split loop and
   may produce multiple fragments across any number of pages.
2. **Stack / column paragraph** — `pushStackContents` places the paragraph as a
   single fragment within the row's allocated height. No line-level split occurs;
   the row height bounds the content.
3. **Table cell paragraph** — `pushCellSlice` places lines from a given split
   point to a given end point. The row split loop calls this once per page slice,
   so the paragraph may continue across pages when the row is breakable.

All three paths must call `resolvePageNumbers` after building lines so that
inline page-number nodes are resolved to the actual page number.

### 4.3 Paragraph Line Splitting

Paragraphs may continue across pages by splitting at measured line boundaries.

Rules:

- measurement exposes line boxes before pagination
- pagination chooses the split point
- renderers must not recompute line breaks
- source paragraph identity must be preserved across continuation fragments
- `spacingBefore` applies to the first fragment
- `spacingAfter` applies to the last fragment
- continuation fragments must not double-apply paragraph spacing
- a too-tall single line must force progress instead of creating an infinite loop

Table cell paragraphs follow the same line-boundary split rules as body
paragraphs, but the split is driven by the row split loop rather than by the
paragraph paginator directly. Single-row table groups are breakable by default;
`allowBreak=false` keeps a row together when possible. Rowspan-linked rows are
still kept together as a unit at this stage.

Future hardening:

- list-item continuation policy
- split-at-row-boundary within rowspan groups
- explicit stable fragment ids only when future selection, annotations, comments,
  or collaboration require an identity beyond current fragment metadata

### 4.4 Fragment Identity

Split fragments need deterministic ordering and traceability.

Current implicit identity:

- source node id
- page index
- fragment order

Current paragraph fragment metadata:

- `fragmentIndex`
- `lineStart`
- `lineEnd`
- `continuesFrom`
- `isContinued`

If explicit `fragmentId` is introduced, it must be stable and deterministic. It
should not depend on runtime object creation order.

### 4.5 Overflow Policy

Overflow should be intentional, not accidental.

Rules:

- if content fits on the next page, move it rather than overflow the current page
- if content is taller than one content page and cannot split yet, force progress
  and document the overflow
- avoid infinite loops even when input is impossible to lay out cleanly
- record forced-progress behavior in tests or debug traces

### 4.6 Keep Rules

Keep rules should be conservative because they can fight normal pagination.

Current rules:

- `keepWithNext`: implemented for paragraphs and useful for headings and short
  labels
- widow / orphan: implemented for body-level paragraphs with impossible-case
  fallback
- `keepTogether`: deferred; useful for small groups, dangerous for long content

Keep rules should never create infinite pagination loops.

## 5. Renderer Contract

The renderer contract protects parity across editor preview, PDF, DOCX, and
future output targets.

### 5.1 Renderer Must Not Relayout

Renderers must not decide:

- line breaks
- page breaks
- paragraph continuation boundaries
- row / stack / table placement
- header / footer page context

Renderers may adapt drawing details to the target format, but layout decisions
come from pagination.

### 5.2 Renderer Must Preserve Fragment Order

Renderers should draw fragments in the order provided by pagination unless the
format requires a clearly documented structural conversion.

Any conversion should preserve the visual and semantic intent of the paginated
output.

### 5.3 Unsupported Fidelity Must Be Explicit

When a renderer cannot guarantee exact output, the limitation should be written
down.

Known DOCX limitation:

- Word/LibreOffice owns final text reflow after opening the file
- installed fonts can change line breaks
- DOCX should target structural correctness, not pixel-perfect parity

PDF and editor preview should aim for stronger visual parity because they can
consume FlowDoc's measured layout more directly.

## 6. State Lifecycle

State should be classified so cache invalidation, history, preview, and export do
not become tangled.

### 6.1 Source State

Source state is authored and should be persisted.

Examples:

- document tree
- template structure
- authored text
- field references
- page settings
- row / table structure

### 6.2 Resolved State

Resolved state is produced by binding source state with data.

Examples:

- field values inserted for preview/export
- generated page-number placeholders before final page context
- temporary resolved document tree

Resolved state may be cached, but it should be rebuildable from source state and
input data.

### 6.3 Measured State

Measured state is derived from text, style, width, font metrics, and word breaker
behavior.

It should be invalidated when any measurement input changes.

Examples:

- line boxes
- text widths
- paragraph natural height
- baseline information

### 6.4 Paginated State

Paginated state is derived from resolved document data, measurement, and page
settings.

Examples:

- pages
- fragments
- fragment geometry
- continuation boundaries
- page-context generated text

Paginated state is renderer-facing output, not authored state.

### 6.5 Render State

Render state belongs to a specific output target.

Examples:

- PDF drawing commands
- DOCX XML structures
- React render tree
- canvas draw calls

Render state should be disposable and reproducible from paginated state.

### 6.6 Ephemeral Editor State

Ephemeral state supports interaction and should not be treated as document truth.

Examples:

- selection
- hover
- drag preview
- resize preview
- caret position
- local debounce status

## 7. Observability and Debugging

Layout bugs are often silent drift rather than hard crashes. The engine should
make layout decisions inspectable.

### 7.1 Pagination Trace

A pagination trace should explain why a fragment landed on a page.

Useful fields:

- node id
- node type
- available height
- measured height
- chosen split point
- forced-progress flag
- page index before and after placement
- continuation metadata

### 7.2 Measurement Trace

A measurement trace should explain text layout decisions.

Useful fields:

- text style
- width constraint
- font source
- word breaker used
- line count
- line widths
- paragraph height
- fallback font flag

### 7.3 Drift Report

A drift report should make differences between two pagination results readable.

It should support:

- page count changes
- fragment page movement
- geometry changes
- paragraph line count changes
- continuation boundary changes
- renderer-relevant differences

Paragraph line drift can stay paragraph-specific, but page/geometry drift should
cover all layout-owned fragment types.

### 7.4 Debug Output Should Not Become Semantics

Trace data is for diagnosis. It should not become required authored state unless
promoted intentionally.

## 8. Test Strategy

Tests should freeze intended behavior without making implementation refactors
impossible.

### 8.1 Golden Pagination Fixtures

Golden fixtures should cover behavior the engine promises to keep stable.

Important cases:

- simple paragraph
- multi-page paragraph
- paragraph after split paragraph
- row / stack layout
- table row movement
- table row split policy
- header / footer / page number behavior
- TOC placeholder behavior
- too-tall content forced-progress cases

### 8.2 Renderer Contract Tests

Renderer tests should verify that renderers consume layout output rather than
inventing new layout.

Useful checks:

- PDF receives/draws split paragraph fragments
- DOCX preserves intended structure while documenting fidelity limits
- editor preview uses paginated fragment geometry
- renderers do not merge or drop continuation fragments

### 8.3 Drift Tests

Drift tests should compare browser-like and server-like measurement behavior.

Useful checks:

- same short text gives same pagination
- metric changes can shift line breaks
- drift reports are readable
- non-paragraph fragment movement is detected
- paragraph line-count drift remains paragraph-specific

### 8.4 Invariant Tests

Invariant tests should assert things that must never silently break.

Examples:

- fragments are ordered top-to-bottom within a page
- split fragments for the same source node are ordered by page
- fragment geometry stays inside content bounds unless overflow is documented
- no negative fragment height
- table parent/child relationships remain valid after pagination

### 8.5 Regression Definition

A layout regression is not only a crash.

These are also regressions:

- page count changes without an intentional spec update
- split point changes without updated fixtures
- renderer output diverges from paginated output
- cache returns stale measurement
- document model stores computed layout accidentally
- editor preview becomes a second source of layout truth

## 9. Open Decisions

These are intentionally not fully locked yet.

- How should list markers behave across continuation fragments?
- How should advanced table-cell/table span split behavior work beyond the
  current single-row breakable policy?
- Should TOC generation ever need more than the current two-pass overflow
  correction, or should very rare second-order TOC growth stay documented as a
  limitation?
- Which debug traces should be persisted in test snapshots versus emitted only on demand?
- When should browser preview become authoritative enough to remove server-settling UX?

Resolved decisions that used to be open:

- Paragraph fragment identity stays implicit for now (`nodeId`, page index, and
  `fragmentIndex` / line metadata). Explicit stable `fragmentId` is deferred
  until selection, annotation, comments, or collaboration require it.
- Widow/orphan policy is implemented for body-level paragraphs and covered by
  fixtures.
- Basic table-cell text continuation is implemented for breakable single-row
  table groups through the table row split loop.

## 10. Related Documents

- `docs/AGENT_WORKFLOW.md`
- `docs/ARCHITECTURE_OVERVIEW.md`
- `docs/CROSS_PAGE_BEHAVIOR.md`
- `docs/DOCS_INDEX.md`
- `docs/EDITOR_UX_CONTRACT.md`
- `docs/ENGINEERING_PRINCIPLES.md`
- `docs/EXPORT_RENDERER_CONTRACT.md`
- `docs/FIXTURE_CATALOG.md`
- `docs/LAYOUT_ENGINE_CHECKLIST.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/PRODUCT_SCENARIOS.md`
- `docs/TABLE_EDITING_CONTRACT.md`
- `docs/TEST_STRATEGY.md`
- `docs/TEXT_ENGINE_CHECKLIST.md`
- `docs/TEXT_REFLOW_PLAN.md`
- `docs/WORK_LOG.md`
