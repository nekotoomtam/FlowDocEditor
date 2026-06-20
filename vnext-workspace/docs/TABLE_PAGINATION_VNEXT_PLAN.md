# Table Pagination vNext Plan

This plan owns the vNext table pagination direction for Phase 10.4. Current
prototype/current table code is evidence only. The exported vNext workspace
must keep table layout, pagination, measurement, and renderer contracts inside
the vNext model.

## Decision

Use **B: Row-level pagination plus splittable cell text**.

The target is not a full table engine yet. The implementation should first
make row, cell, text, repeated-header, and continuation fragments reproducible.
Full colspan/rowspan layout, border-collapse behavior, complex spanning-row
splits, and target-specific export quirks belong to the deferred C path.

## Options

| Option | Scope | Strength | Risk | Decision |
|---|---|---|---|---|
| A | Row-atomic table. Rows move as a whole. Over-tall rows overflow with warnings. | Stable baseline and simple export contract. | Does not solve long cell content. | Use as the first sub-step only. |
| B | Row-level table plus splittable cell text when a row can break. | Handles long documents without giving renderers a second wrap truth. | Needs careful continuation metadata and no-empty-slice rules. | Selected. |
| C | Full table layout engine with spans, borders, row groups, and complete split policy. | Long-term ideal. | Too large for the current vNext extraction phase. | Deferred after B is stable. |

## Truth Ownership

- Authored table structure lives in the vNext document model.
- Text wrap truth comes from the vNext text measurement contract.
- Table placement truth comes from measured pagination output.
- Renderer and export code must consume table fragments and must not recompute
  row breaks, cell text line breaks, repeated headers, or page slices.

## Row Height Semantics

`table-row.props.height`, if kept in the wire schema, must behave as
**minimum row height**.

Reason:

- fixed height conflicts with long editable cell content;
- B needs rows to grow from measured cell content;
- over-tall rows need split or explicit overflow policy instead of hidden
  clipping;
- export must not need to guess whether content should clip or expand.

Before repository extraction, prefer renaming this field to `minHeight` unless
there is a strong compatibility reason to keep `height`. If `height` remains,
tests and docs must keep saying it is minimum height, not fixed height.

## Fragment Shape

Table pagination output should emit this hierarchy per page segment:

```text
table segment fragment
  -> table-row fragment
    -> table-cell fragment
      -> cell child fragments
```

Required traceability:

- every fragment keeps the authored source `nodeId`;
- repeated headers keep the same source row/cell ids and set
  `isRepeatedHeader=true`;
- split rows keep the same source row/cell ids and expose continuation metadata;
- cell text fragments keep measurement cache/profile metadata and line ranges.

## Phase 10.4 Sub-Plan

### 10.4.1 Geometry Contract

Status: draft implemented.

Define:

- table content box;
- scaled column widths from authored `table.columns[].width`;
- row y/height;
- cell x/y/width/height;
- cell content inset used for measurement;
- fragment metadata for table id, row id, cell id, row index, cell index, and
  column index.

Acceptance:

- table/cell/text fragments use the same column widths;
- row/cell/text fragment geometry is deterministic;
- no renderer needs authored table input to recompute cell positions.

### 10.4.2 Row Measurement

Status: draft implemented for non-spanning rows.

Define row height as:

```text
max(row minHeight, tallest measured cell content + vertical cell inset)
```

Acceptance:

- explicit row height is treated as minimum height;
- measured cell text can make a row taller;
- row height uses the same measurement profile and cache as body text;
- table row height cannot be inferred separately by renderer/export.

### 10.4.3 Row-Level Pagination

Status: draft implemented.

Rules:

- rows are the first page-break unit;
- if a row fits on the next page, move it instead of overflowing;
- if a row is taller than a full page and cannot split yet, place it at the
  page top and emit an explicit warning;
- pagination must always make progress.

Acceptance:

- no empty page loop;
- row fragments appear on the pages where pagination placed them;
- table segment fragments report row counts per page segment.

### 10.4.4 Repeating Headers

Status: draft implemented.

Rules:

- `headerRowCount` identifies authored header rows;
- `repeatHeaderRows=true` repeats those rows on continuation pages;
- omitted `repeatHeaderRows` should be treated as true before the API is
  declared final;
- repeated rows consume page height before data rows.

Acceptance:

- repeated header fragments trace to the authored header row and cells;
- repeated header fragments carry `isRepeatedHeader=true`;
- repeated headers do not create authored nodes or history entries.

### 10.4.5 Splittable Cell Text

Status: draft implemented for span-free rows whose cell children are
`text-block` nodes.

Rules:

- a row may split only when `row.props.allowBreak !== false`;
- row split uses measured line boxes from the text measurement contract;
- each split slice must place at least one remaining content unit unless the
  explicit forced-overflow fallback is used;
- shorter sibling cells render their content only once and keep empty cell
  continuation boxes only when needed for table chrome;
- split fragments expose continuation metadata for row, cell, and text child
  fragments.

Acceptance:

- an over-tall text cell splits across pages by measured line boundaries;
- source and continuation slices keep the same authored cell and text node ids;
- renderers can draw borders/chrome from fragment metadata without deciding
  split points;
- no slice with zero progress is emitted.

### 10.4.6 Cell Block Policy

Status: draft implemented for explicit text, spacer, divider, TOC, and
page-break behavior.

Initial policy:

- `text-block`: splittable by measured lines.
- `spacer`: atomic unless it is the only remaining content and must force
  progress with warning.
- `divider`: atomic.
- `toc`: generated/atomic inside table cells for this phase.
- `page-break`: ignored inside table cells with warning.

Acceptance:

- every cell child type has explicit split/atomic/warning behavior;
- unsupported combinations fail visibly through warnings, not silent clipping.

### 10.4.7 Spans

Status: deferred to C path unless needed to unblock B fixtures.

Initial B policy:

- span-free tables are the primary supported case;
- `colspan` may be added before rowspan if it is needed for product fixtures;
- `rowspan` split behavior is deferred until the row-group algorithm exists.

Acceptance before enabling spans:

- grid resolver exists;
- covered slots are explicit;
- spanning cell fragments keep logical source cell identity;
- row operations and pagination use the same grid truth.

### 10.4.8 Renderer/Export Gate

Status: renderer consumption contract and readiness gate implemented for
measured fragments; PDF/DOCX renderer implementations are still not
implemented.

Rules:

- PDF/DOCX consume measured table fragments;
- renderers must not recompute row breaks, repeated headers, or cell text wraps;
- missing geometry is a pagination output bug, not a renderer layout feature.

Acceptance:

- test renderer can list table fragments without using authored table structure;
- export plan marks table output as ready only when blocking warnings are absent;
- table split warnings are surfaced as export readiness signals.

## Current Draft Audit

The current 10.4 working tree has:

- table segment fragments;
- row fragments;
- cell fragments;
- measured cell text fragments;
- row-level page breaks;
- repeated header fragments.
- over-tall breakable text-cell rows split by measured line ranges.
- table cell child fragments expose `cellChildPolicy` metadata for measured
  text, atomic blocks, generated TOC, and ignored page breaks.
- measured pagination export readiness reports ready, ready-with-warnings, or
  blocked from pagination warnings without renderer relayout.
- renderer-consumption audit converts measured fragments into renderer commands
  without authored document input and blocks export when table geometry,
  hierarchy, line ranges, or metadata would require renderer-side inference.

It does not yet have:

- row minHeight rename or explicit schema migration;
- splitting for non-text cell children;
- colspan/rowspan support;
- concrete PDF/DOCX renderer implementations.

## Stop Conditions

Stop for owner review before:

- changing persisted schema field names such as `height` to `minHeight`;
- enabling colspan/rowspan pagination;
- changing `allowBreak` default semantics;
- declaring table pagination export-ready;
- adding a renderer-backed measurement profile.
