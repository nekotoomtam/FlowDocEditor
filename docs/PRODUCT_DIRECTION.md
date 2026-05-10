# Product Direction

FlowDocEditor starts from document generation, but it is not meant to stay only
as a document generator.

The long-term direction is a workflow-ready document editor for structured Thai
documents: users should be able to design, fill, review, adjust, and export
documents while trusting that the layout will stay stable.

## North Star

FlowDocEditor should feel like an editor that happens to have strong document
generation and export capabilities, not a generator with a fragile editing UI.

The product should help users:

- build reusable document templates
- bind real workflow data into those templates
- edit the resulting document when the workflow needs human adjustment
- keep table, text, page-break, and page-number behavior predictable
- export authoritative PDF output
- produce useful DOCX exchange output when needed

## What This Means

The editor experience matters as much as the engine result.

A feature is not done just because the model can represent it or export can
serialize it. It should also be possible for a user to interact with it without
feeling that the document is unstable.

Important qualities:

- click targets should select the structure users expect
- text editing should not visibly jump, blink, or lose trust
- undo/redo should map to human editing intent
- table operations should preserve grid and width expectations
- page-break behavior should be documented before being made clever
- browser preview may be temporary, but it should reconcile predictably
- export should consume the same authoritative layout contract as the editor

## Current Product Shape

The current implementation is still closer to a document-generation editor than
a full word processor. That is acceptable as long as new work moves toward the
editor direction instead of hardening generator-only shortcuts.

Accepted today:

- PDF is the primary authoritative output.
- DOCX is an exchange format and may reflow in Word/LibreOffice.
- Browser preview can temporarily differ from server/export pagination during
  active editing, but drift should be measurable and should settle.
- Advanced editing behaviors can be delivered in stable slices.

Not acceptable as long-term direction:

- treating editor UX as a debug surface only
- letting React/CSS become a second layout engine
- adding export-only behavior that users cannot inspect or adjust in the editor
- letting table or page-break behavior remain implicit after implementation
- accepting flicker, jumps, or surprising selection as normal for core workflows

## Decision Bias

When there is a tradeoff, prefer the option that makes FlowDocEditor more like a
trustworthy workflow editor:

1. preserve valid authored document structure
2. keep layout rules centralized in core
3. make editor interactions feel stable and unsurprising
4. keep PDF output authoritative
5. document temporary limitations clearly
6. add tests for behaviors that could regress silently

## Relationship To Other Docs

- `docs/DOCS_INDEX.md` is the entry point for deciding which documentation to
  read for a given task.
- `docs/PRODUCT_SCENARIOS.md` turns this direction into concrete Thai document
  scenarios and fixtures.
- `docs/ENGINEERING_PRINCIPLES.md` explains how to keep implementation choices
  aligned with this direction.
- `docs/AGENT_WORKFLOW.md` defines the expected collaborator/session workflow:
  what to read, when to update docs, how to verify, and when to write the work
  log.
- `docs/ARCHITECTURE_OVERVIEW.md` explains how the app, core, API routes,
  pagination, and renderers connect.
- `docs/EDITOR_UX_CONTRACT.md` defines editor interaction expectations.
- `docs/TEST_STRATEGY.md` defines which tests, fixtures, and browser checks
  should protect each kind of change.
- `docs/BROWSER_SMOKE_CHECKLIST.md` defines focused browser checks for
  interaction changes.
- `docs/EXPORT_RENDERER_CONTRACT.md` defines API/export/PDF/DOCX responsibilities
  and accepted fidelity limits.
- `docs/FIXTURE_CATALOG.md` maps current product fixtures and test files.
- `docs/LAYOUT_ENGINE_SPEC.md` defines shared layout and pagination contracts.
- `docs/CROSS_PAGE_BEHAVIOR.md` defines page-boundary behavior.
- `docs/TABLE_EDITING_CONTRACT.md` defines table authoring and editor operation
  rules.
