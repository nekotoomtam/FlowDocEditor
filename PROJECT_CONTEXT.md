# FlowDocEditor Project Context

## Product Direction

FlowDocEditor is intended to become a real document automation system, not only a layout prototype.

The product should cover three main use cases:

1. Create document structures/templates.
2. Define variables and place them into documents.
3. Expose completed templates through an API so other systems can render documents.

The target pipeline is:

```txt
Template Editor
  -> DocumentNode template with fieldRef placeholders
  -> Binding data
  -> Shared layout/text engine
  -> PaginatedDocument
  -> Editor preview / PDF / DOCX / external API output
```

## Core Principle

The system should have one shared core engine, not separate frontend and backend engines.

The core engine owns:

- document schema and invariants
- normalization and assertion
- text measurement and line breaking contracts
- flow layout
- pagination
- renderer-facing layout output

Runtime-specific code should live in adapters:

- server adapter: loads fonts from disk/storage and renders authoritative PDF/DOCX/API output
- editor adapter: runs layout in the browser, ideally in a Web Worker, for low-latency preview
- API adapter: validates input, binds data, paginates, and returns PDF/DOCX or layout data

The adapter can differ by runtime, but layout rules and document semantics should remain shared.

## 1:1 Layout Goal

The editor preview and rendered output should be as close to 1:1 as possible.

The project intentionally does not rely on CSS layout as the source of truth. The editor should render from the engine output, such as `PaginatedDocument`, rather than letting DOM/CSS independently flow text.

The long-term goal is:

```txt
same document
+ same bound data
+ same font files
+ same text/layout engine
= same page structure across editor, PDF, DOCX, and API output
```

Some small runtime differences may exist during interactive editing, but the shared core should make drift measurable and controllable.

## Text Engine Direction

Text layout is a first-class part of the engine.

Near-term direction:

- use `Intl.Segmenter` for word segmentation during the current phase
- use project-controlled TTF font bytes and fontkit-based measurement where possible
- treat `public/fonts/THSarabun.ttf` as the current default font through the shared font registry
- keep `TextMeasurer` and `WordBreaker` as injectable contracts
- make server/export output authoritative
- move browser/editor layout toward the same measurement path, preferably through a Web Worker

The current browser path may use a faster preview measurer, but the target is to use the same font-aware measurement approach in both editor and server runtime.

Future text engine concerns may include:

- shaped runs instead of plain measured lines
- baseline, ascender, and descender metrics
- per-run fonts and fallback fonts
- glyph or cluster positions for selection/caret behavior
- paragraph alignment, indent, and spacing as explicit layout data

## API And Template Model

The system should support templates as stable assets.

Expected concepts:

- template/document versioning
- field registry or field schema
- `fieldRef` inline nodes for variables
- binding validation before render
- clear API errors when required data is missing
- render endpoints that accept template id plus data

Example future flow:

```txt
POST /v1/templates/:id/render
  body: { data, format }

server:
  load template
  assert/normalize document
  bind data into fieldRef nodes
  paginate with shared core
  render PDF/DOCX
```

## Current Architectural Notes

The project currently has a good foundation:

- `packages/core` contains the main engine pieces.
- `paginateDocument` is shared core logic.
- layout and pagination are already separated from renderer output.
- API routes already act as early server adapters.
- `fieldRef` exists and can become the basis of the binding system.

Known areas to strengthen:

- `assertDocument` should validate more invariants, especially table internals.
- table layout needs more complete handling for colspan/rowspan/page breaks.
- tests and golden fixtures are needed for layout and pagination stability.
- API routes should validate/normalize input before pagination/export.
- editor-specific state should stay out of core.

## Implementation Preference

Stay with TypeScript for now.

The current hard problems are document invariants, text layout correctness, pagination behavior, renderer consistency, and tests. Moving the core to C++ too early would add build, binding, PDF/DOCX, font, and runtime complexity before the engine contract is stable.

If performance becomes a proven bottleneck later, consider moving only specific hot paths to WASM/native while preserving the same JSON contracts and tests.
