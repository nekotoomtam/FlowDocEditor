# Engineering Principles

This document is the decision guide for FlowDocEditor. It should help us choose
where code belongs, what owns a behavior, and what tradeoff to prefer when a
feature can be implemented in more than one way.

The goal is not to make perfect rules. The goal is to keep the project from
quietly turning into several incompatible document engines.

## 1. Core Is The Source Of Truth

`packages/core` owns document semantics.

Core owns:

- schema and invariants
- normalization and assertion
- document operations
- binding contracts
- text measurement contracts
- flow layout
- pagination
- renderer-facing layout output

Application/runtime code may adapt core behavior to a browser, server, API, or
worker environment, but it should not redefine document semantics.

Do:

- keep shared rules in `packages/core`
- pass runtime services into core through contracts, such as `TextMeasurer` and
  `WordBreaker`
- make editor, API, PDF, and DOCX consume the same document contracts

Avoid:

- duplicating layout rules in React/CSS
- putting editor-only state into core types
- making API/export behavior diverge from editor preview behavior

## 2. Document Data Must Stay Layout-Free

`DocumentNode` is an authored document model, not a render result.

Do:

- store structure, text, field references, and authored properties
- let the layout engine compute `x`, `y`, `width`, and `height`
- treat `PaginatedDocument` as the renderer-facing output

Avoid:

- storing computed layout positions in the document model
- using DOM/CSS layout as the document source of truth
- mixing temporary editor geometry into persisted document data

## 3. Normalize Is Not A Repair Tool

`normalizeDocument` turns incomplete valid-ish input into canonical shape. It
should not silently repair broken tree structure.

Do:

- fill missing defaults
- clamp invalid scalar values when a safe default exists
- keep normalization deterministic and idempotent

Avoid:

- creating missing structural nodes during normalize
- fixing invalid parent/child relationships silently
- hiding data corruption that `assertDocument` should catch

## 4. Assert Owns Invariants

`assertDocument` is the gatekeeper for document validity.

Do:

- validate tree laws
- detect cycles, orphan nodes, duplicate ids, and multiple parents
- validate table internals and grid consistency
- return clear errors that point to the broken path

Avoid:

- relying on renderers to fail later
- allowing editor operations to create invalid documents
- using assertions only at export time

## 5. Operations Must Preserve Validity

Document operations should produce a valid document or no-op. They should not
leave cleanup work for the UI.

Do:

- keep operations deterministic
- preserve parent/child laws
- update related structural data together, such as row width shares or table
  cells
- prefer explicit failure/no-op over partial mutation

Avoid:

- mutating document objects in place
- letting UI components manually patch tree structure
- creating documents that only become valid after a later unrelated step

## 6. Editor State Is Not Document State

The editor is an adapter and authoring surface. It may hold interaction state,
but that state is not part of the document.

Editor state may include:

- selection
- drag preview
- resize preview
- inline edit geometry
- temporary filling data
- loading and debounce state

Document state should include:

- authored structure
- authored text and inline field references
- authored layout properties such as margins, font size, spacing, and table
  settings

Avoid:

- saving selection, drag state, caret state, or temporary overlay geometry into
  `DocumentNode`
- using React component state as a second document model

## 7. Binding Produces Resolved Documents

Templates and filling data are separate assets.

Do:

- store `fieldRef` nodes in templates
- store field values in filling/submission data
- bind template + data into a temporary resolved document for preview/export
- validate required data before authoritative render

Avoid:

- replacing template field references with real data during filling
- editing static text/layout in filling mode
- treating submitted field data as template history

Rule of thumb:

```txt
Template history = structure + fieldRef
Submission history = field values
Render output = template + data + pagination + renderer
```

## 8. Pagination Is Authoritative

The editor should render from `PaginatedDocument` whenever possible.

Do:

- keep server/export pagination authoritative for now
- reduce drift between browser preview and server output
- make layout differences measurable and intentional
- debounce interactive preview updates instead of running conflicting layout
  engines at the same time

Avoid:

- letting browser CSS decide document flow
- rendering once with a client approximation and then visibly replacing it with
  a different authoritative layout unless the UX intentionally accounts for it
- hiding pagination drift as a UI issue

## 9. Renderers Consume Layout Output

PDF, DOCX, and editor preview should consume layout output. They should not own
document layout rules.

Do:

- feed renderers `PaginatedDocument`
- keep renderer-specific differences isolated
- make renderer limitations explicit, especially DOCX pagination behavior

Avoid:

- reflowing paragraphs independently inside renderers
- adding document semantics only in one renderer
- making PDF and editor use different rules for the same document property

## 10. Text Layout Is A First-Class Problem

Text measurement, line breaking, baseline behavior, and caret behavior are part
of the engine problem, not incidental UI details.

Do:

- keep `TextMeasurer` and `WordBreaker` injectable
- prefer project-controlled fonts
- move browser/editor measurement toward the server/export path
- isolate paragraph editing behind components that can evolve toward a custom
  editor

Avoid:

- assuming textarea wrapping equals engine wrapping
- treating Thai line breaking as plain whitespace splitting
- spreading text positioning math across unrelated components

## 11. Tables Have Their Own Law

Tables are not just nested rows and stacks. They have grid invariants.

Do:

- validate colspan and rowspan against table columns/rows
- keep table internals inside table nodes
- update cells, rows, columns, and child content together
- test table operations with spans and page breaks

Avoid:

- using array index as column position when colspan exists
- deleting rows/columns without considering rowspan/colspan
- allowing table mutations that assert will reject later

## 12. Add Features In Stable Slices

Prefer small usable slices that strengthen the product direction.

Do:

- build the simplest version that proves the contract
- defer features whose correctness depends on missing foundations
- document temporary deferrals, such as TOC waiting for stable binding and
  pagination

Avoid:

- adding feature-specific shortcuts that bypass core contracts
- implementing advanced UI before the underlying model is stable
- expanding node types without deciding whether they are layout nodes,
  template-control nodes, or runtime controls

## 13. Tests Protect Behavior

Layout bugs are often visual and easy to miss. Tests and fixtures should protect
the engine as it grows.

Required soon:

- schema/assert fixtures
- normalization fixtures
- binding fixtures
- pagination golden fixtures
- table operation fixtures
- PDF/DOCX smoke tests

Rule of thumb:

- small UI-only change: type-check may be enough
- core schema/operation change: add or update fixtures
- layout/pagination/table change: add or update golden behavior checks
- renderer change: include at least a smoke test or manual artifact check

## 14. Commit Checklist

Before committing, check the scope deliberately.

Checklist:

- The change belongs in the layer where it was implemented.
- `DocumentNode` remains free of computed layout data.
- Editor-only state stays in the editor.
- Template data and filling data stay separate.
- API/export boundaries are explicit: callers send a valid document, editor
  preview performs binding before route calls, and routes assert before
  paginating/exporting.
- Table changes preserve table invariants.
- Text/layout changes do not introduce a second source of truth.
- `npm run type-check` passes, unless there is a documented reason it cannot run.
- The commit message describes the behavior, not just the files changed.

## 15. When Unsure

Choose the path that keeps the engine contract clearer.

Prefer:

- explicit contracts over implicit coupling
- no-op/fail-fast over silent repair
- shared core rules over duplicated adapter rules
- stable JSON contracts over runtime-specific cleverness
- measurable drift over hidden drift

If a shortcut feels useful but weakens the core/editor/API boundary, document the
shortcut and plan its removal before relying on it.
