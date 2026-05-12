# WYSIWYG Text Engine Plan

This is the active plan for the FlowDoc-owned text editing lane. It supersedes
additional textarea-hybrid polishing for the goal of edit/show visual parity,
but it does not remove the current hybrid path until the new lane passes its
gates.

## Decision

- `PaginatedLine` and `LineSegment` are the only visual geometry truth for
  paragraph text in show and edit modes.
- `draftText` is the input truth while an edit session is active.
- A native input bridge may exist only as an input adapter. It must not own
  visible text, line wrapping, caret geometry, selection geometry, or fallback
  visual rendering.
- Full-document pagination must not be on the critical keypress-to-paint path.
- Server/API pagination remains authoritative for settled layout and export.
- The first implementation runs behind `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE`
  and is disabled by default.

## Non-Goals For The First Lane

- Do not change `DocumentNode` schema.
- Do not change export, PDF, DOCX, or server pagination semantics.
- Do not introduce a second document layout model inside React components.
- Do not re-enable the removed hard-line head/tail local reflow path as-is.
- Do not make a big-bang replacement of all inline editing behavior.

## Required Performance Contract

Each keypress must be split into two lanes:

1. Critical interactive lane:
   - update the active edit session draft
   - update caret/selection state
   - measure only the active paragraph or the true visual-line tail
   - draw SVG text/caret/selection from FlowDoc geometry

2. Settling lane:
   - run incremental reflow from the changed block when geometry changes
   - run full browser/server pagination after debounce, blur, idle, or export
   - compare and report drift instead of treating browser preview as a second
     source of truth

The critical lane must not synchronously paginate the full document.

## Instrumentation

The initial baseline is controlled by `NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE`
and is disabled by default. When enabled, editor code appends events to
`window.__flowDocWysiwygPerfEvents`.

Tracked event kinds:

- `inline-edit-draft-update`
- `active-paragraph-measure`
- `browser-preview-pagination`
- `inline-edit-exit-pagination`

These events are diagnostic only. They must not alter document state, history,
pagination output, or renderer behavior.

## Implementation Stages

### Stage 0: Contract And Baseline

- Add this plan and keep the legacy WYSIWYG roadmap as historical/contextual
  guidance for the textarea-assisted path.
- Add feature flags for the new lane and perf trace.
- Add instrumentation around the current path so regressions are visible before
  behavior changes.

Gate:

- type-check and focused tests pass.
- flag defaults are off.
- instrumentation is inert unless explicitly enabled.

### Stage 1: Edit-Enter Parity Skeleton

- Add `useWysiwygTextSession` without committing it as default behavior.
- Add a `WysiwygTextLayer` that can draw the active paragraph from existing
  `fragment.lines` and caret overlay geometry.
- Entering edit with the new flag must not change paragraph wrapping, text
  positions, fragment height, or page placement.

Gate:

- edit-enter adds caret/selection chrome only.
- no `<textarea>` text rendering is used by the new lane.
- undo/redo and commit behavior stay on the existing transaction model.

### Stage 2: Local Paragraph Draft Layout

- Route typing into `draftText` in the new session.
- Rebuild measured lines only for the active paragraph at first.
- Patch only the active paragraph visual output when line count and fragment
  boundaries are unchanged.

Gate:

- no full `paginateDocument(...)` call is required before the next visual paint
  after a normal keypress.
- active paragraph SVG text, caret, and selection use the same geometry source.

### Stage 3: True Incremental Reflow

- Replace hard-line tail reflow with a visual-line-aware reflow contract or a
  safe paragraph-level fallback.
- Classify edits as soft or hard:
  - soft: line count and fragment boundary unchanged; patch active lines only
  - hard: line count or boundary changed; queue forward reflow from the changed
    block and stop when downstream geometry stabilizes

Gate:

- split paragraphs do not collapse all lines into one fragment.
- table-cell paragraphs do not bypass row/stack geometry constraints.
- long Thai and long unbroken text fixtures remain stable.

Current implementation note:

- The first Stage 3 slice classifies soft, hard-local, and hard-page-boundary
  edits for the flagged text-engine lane.
- Hard-local edits patch active paragraph height and shift later same-page
  fragments only when the draft still fits the current page content box.
- Hard-page-boundary edits queue debounced draft pagination against a normalized
  preview document, then render draft fragments from the same paginated geometry
  source instead of falling back to a textarea.
- The active SVG layer now owns a hidden `contentEditable` input bridge for
  keypress input. The bridge adapts browser key/input events into FlowDoc draft
  operations; it does not own visible text, wrapping, caret geometry, or layout.
- A deterministic Stage 3 stress scenario is available in dev/test mode at
  `/editor?flowdocTestScenario=wysiwyg-stage3-boundary`. It seeds a target
  paragraph near a page boundary with dense downstream content so browser
  checks can exercise overflow, shrink-back, and undo/redo using real keypress
  events without relying on clipboard-backed `fill()` / `type()` automation.
- Split and table-cell fragments fail closed to the existing path until their
  continuation and row/stack contracts are explicitly implemented.

Stage 3 closure evidence:

- Focused app and core tests cover the stress fixture, hard-page-boundary draft
  preview, shrink-back, active input bridge behavior, and pagination invariants.
- Browser smoke on the dev/test stress scenario confirmed real keypress input
  can push the active paragraph from one fragment to two across a page boundary,
  then Backspace can shrink it back to one fragment, without mounting an inline
  textarea or showing a layout error.
- Browser smoke also confirmed commit, undo, and redo preserve the typed marker
  and return layout without an inline textarea.

### Stage 4: Selection, Clipboard, IME, Accessibility

- Draw selection from FlowDoc overlay rectangles.
- Convert keyboard, paste, and composition events into draft operations.
- If a native input bridge is needed, keep it hidden and adapter-only.

Gate:

- composition never makes textarea/browser layout the visual truth.
- clipboard operations preserve paragraph offsets and undo boundaries.
- unsupported states fail closed to the old flagged path, not to a new visual
  mismatch inside the text-engine lane.

### Stage 5: Default Eligibility

The new lane can become default only when:

- edit/show parity passes on body paragraphs, split paragraphs, table cells,
  Thai/mixed text, and long unbroken text.
- performance trace shows no full-document pagination on the critical keypress
  path.
- server/export reconciliation is unchanged.
- undo/redo remains one edit session.
- manual smoke checks find no visible mismatch between normal rendering and
  edit rendering.
