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
- Production builds additionally require
  `NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE_PRODUCTION_ACK=1`; see
  `docs/WYSIWYG_PRODUCTION_GATE.md`.

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
- Hard-local edits render active draft lines and active paragraph chrome from
  canvas-owned draft visual geometry while deferring downstream movement to the
  settling lane.
- Hard-page-boundary edits render active draft fragments from a paragraph-only
  live visual preview that splits by direct line capacity, so only overflowing
  lines move to the next page during typing. Debounced draft pagination still
  settles the broader document preview, and server/API pagination remains the
  export truth.
- The active SVG layer now owns a hidden `contentEditable` input bridge for
  keypress input. The bridge adapts browser key/input events into FlowDoc draft
  operations; it does not own visible text, wrapping, caret geometry, or layout.
- The text-engine bridge uses one native event pipeline for keydown,
  beforeinput, input, clipboard, and composition events. React bridge handlers
  are not duplicated on top of the native adapter, keeping normal and shifted
  typing in the same deterministic path.
- A deterministic Stage 3 stress scenario is available in dev/test mode at
  `/editor?flowdocTestScenario=wysiwyg-stage3-boundary`. It seeds a target
  paragraph near a page boundary with dense downstream content so browser
  checks can exercise overflow, shrink-back, and undo/redo using real keypress
  events without relying on clipboard-backed `fill()` / `type()` automation.
- Plain body paragraph continuation fragments can stay on the text-engine path
  after exit/re-enter. Table-cell fragments still fail closed until their row
  and cell contracts are explicitly implemented.

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

Current implementation note:

- The first Stage 4B slice keeps selection as transient editor/session state in
  `useWysiwygTextSession`; it does not write selection, caret, or page geometry
  into `DocumentNode`.
- Shifted keyboard navigation preserves the original selection anchor and moves
  the focus endpoint by grapheme-aware offsets for ArrowLeft/ArrowRight and by
  paragraph offsets for Home/End.
- The text-engine layer can create same-fragment pointer selections through a
  transparent SVG hit area and renders selection highlights from
  `resolveSelectionOverlayRectsInFragment(...)`, keeping SVG line geometry as
  the visual truth.
- The Stage 3 boundary stress fixture now also covers deleting a selected
  overflow append and verifying the draft paginates back to one fragment.
- Same-fragment double-click word selection is handled inside the text-engine
  layer by resolving a word range from FlowDoc draft offsets and rendering the
  existing SVG selection overlay. The selection remains transient editor state
  and does not use textarea/browser-native visual selection.
- Cross-fragment same-paragraph selection now renders passive SVG selection
  overlays on non-active continuation fragments. The hidden input bridge still
  exists only on the active fragment, and selection remains full-paragraph
  offset state in the editor/session.
- Cross-fragment same-paragraph pointer drag selection now resolves pointer
  offsets against all target paragraph fragments across pages. During an active
  drag, a transparent document-level selection overlay keeps move/up events
  deterministic without making browser-native text selection the visual truth.
- Stage 4C adds explicit clipboard and IME handling to the hidden input bridge:
  paste reads plain text, normalizes CRLF to LF, and applies it as a FlowDoc
  draft replacement; copy/cut read the active FlowDoc selection offsets; cut
  deletes through the same draft operation path.
- Ctrl/Cmd+C/X/V have a Clipboard API fallback because the SVG selection is not
  a browser-native selection. The fallback writes or reads plain text and still
  keeps visible text, wrapping, caret, and selection owned by FlowDoc geometry.
- IME composition is guarded with composing/suppression state so intermediate
  composition input does not mutate the draft, while compositionend commits
  text once and suppresses duplicate final input events.
- Keyboard edit end now restores focus to the editor shell for keyboard exits,
  and undo/redo shortcut matching is case-insensitive.
- The text-engine session exposes a hidden live accessibility status derived
  from FlowDoc session state, and the active text-engine layer/input bridge
  references that status with `aria-describedby`.
- The text-engine draft-change handler now records `inline-edit-draft-update`
  perf events, and the Stage 4C smoke asserts that heavy text input does not
  trigger `browser-preview-pagination` in the immediate input lane. If a
  debounced browser preview pagination occurs, the smoke asserts it starts
  outside that immediate input lane.
- `npm.cmd run smoke:wysiwyg-stage4c` is the repeatable Stage 4C gate. It
  starts the flagged dev editor, runs heavy paste/copy/cut, keyboard undo/redo,
  focus restoration, page-boundary reflow, and synthetic duplicate-composition
  checks against the Stage 3 boundary scenario.
- The Stage 4C smoke can be run against installed browser channels with
  `SMOKE_BROWSER_CHANNEL=chrome` or `SMOKE_BROWSER_CHANNEL=msedge`; current
  Stage 4C+5 evidence is recorded in
  `docs/WYSIWYG_STAGE4C_IME_RESULTS.md`.
- `docs/WYSIWYG_STAGE4C_IME_MATRIX.md` is the real OS IME gate. It must be
  completed for Windows Chrome and Windows Edge with Thai IME before claiming
  high real-world IME confidence from Stage 4C.
- Full screen reader product validation, cross-fragment edit semantics beyond
  same-paragraph selection, and table-cell text-engine editing are still
  deferred Stage 4/5 work.
- Table-cell paragraphs remain a guarded decision gate for the text-engine lane:
  the current implementation keeps them out of text-engine eligibility and live
  draft visual preview so row/cell pagination constraints are not bypassed.
- Row-stack paragraphs remain eligible for the text-engine lane, but they are
  guarded out of the body-paragraph live split preview. Heavy stack edits must
  preserve the current atomic row contract: the edited paragraph stays one
  fragment inside its stack, sibling stack geometry stays aligned, and any
  independent row/column continuation remains a future design gate.

### Stage 5: Default Eligibility

The new lane can become default only when:

- `docs/WYSIWYG_PRODUCTION_GATE.md` is fully PASS for the target release.
- edit/show parity passes on body paragraphs, split paragraphs, table cells,
  Thai/mixed text, and long unbroken text.
- performance trace shows no full-document pagination on the critical keypress
  path.
- server/export reconciliation is unchanged.
- undo/redo remains one edit session.
- manual smoke checks find no visible mismatch between normal rendering and
  edit rendering.
