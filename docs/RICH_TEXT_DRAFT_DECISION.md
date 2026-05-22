# Rich Text Draft Decision

Status: Accepted proof lane; flag-gated live bridge and basic toolbar/keyboard
commands are wired under the rich draft flag.
Date: 2026-05-22

## Decision

The current WYSIWYG lane keeps `draftText` as its input truth. Rich text editing
must not change that lane in-place.

For pending style, rich paste, and future inline-object editing, FlowDoc will
add a separate rich draft lane whose authoritative draft state is a paragraph
draft:

```ts
type RichTextDraftState = {
  paragraph: ParagraphNode
  selection: { anchorOffset: number; focusOffset: number }
  pendingStyle?: TextRunStyle
}
```

In that lane, `draftText` becomes a derived plain-text projection of the draft
paragraph, used only for layout bridges, accessibility labels, clipboard plain
text, and compatibility with existing tests.

## Editor Session Integration

The first editor integration must use a sibling rich draft session, not mutate
`WysiwygTextSessionState` in-place.

The sibling session owns:

- active `nodeId`
- active `pageIndex`
- rich draft paragraph state
- `dirtyVersion` / `layoutVersion` for paragraph or style changes

The existing text session projection is derived from the sibling session:

- `baseText` = plain text projection at session start
- `draftText` = current plain text projection
- `selection` = current rich draft selection
- `caretOffset` = rich draft selection focus offset
- `dirtyVersion` / `layoutVersion` = sibling version counters

This keeps the current WYSIWYG preview and selection pipeline usable while
preventing `draftText` from becoming the source of truth for rich runs.

## Why Not `draftText + pending commands`

`draftText + pending commands` is enough for a single collapsed bold insert, but
it becomes ambiguous for:

- rich paste with multiple styled runs
- pending style after caret movement or selection replacement
- preserving run ids during split/merge
- text around `fieldRef` and `pageNumber`
- undo/debug traces where text and style must move together

It would also force the editor to replay command logs during commit, which adds
a second source of truth while the user is typing.

## Why Not Replace The Existing Lane Immediately

The current editor already has a large WYSIWYG text-engine lane whose contract
says `draftText` is the active input truth. Replacing it now would touch input,
selection, IME, pagination preview, undo/redo, and export readiness at once.

This decision therefore adds a proof lane first:

1. Keep existing `draftText` behavior unchanged.
2. Prove rich draft operations in pure core tests.
3. Add an adapter later that derives `draftText` from rich draft paragraph state.
4. Commit rich draft paragraphs through document operations only after the
   adapter has focused app tests and browser smoke coverage.

## Operation Rules

- Selection offsets are paragraph-relative text offsets.
- Pending style applies only to collapsed selections.
- Inserting the first character with pending style clears `pendingStyle`; the
  next character can inherit the previous run style through the existing rich
  text engine boundary rule.
- Replacing a non-collapsed selection clears pending style.
- Rich paste proof accepts already-sanitized text fragments. HTML parsing and
  sanitization are separate future work.
- Inline objects are preserved by text-range operations. Rich draft v1 still
  does not target inline objects directly.

## Command Adapter Rules

The first command adapter is an app-layer adapter over the sibling rich draft
session. It is wired into the live editor bridge only when the rich draft flag
is enabled.

- Toolbar/keyboard style commands call the rich draft session adapter, not
  document operations directly.
- Toggle commands use explicit authored values:
  - bold: `bold` / `normal`
  - italic: `italic` / `normal`
  - underline: `underline` / `none`
  - strikethrough: `true` / `false`
- Mixed selected ranges toggle toward the active value first.
- Collapsed commands update `pendingStyle` and do not increment
  `dirtyVersion` until text is inserted.
- Keyboard shortcut resolution is limited to primary-key `B`, `I`, and `U`,
  and ignores composition and Alt-modified input.
- The WYSIWYG input bridge handles rich text shortcuts directly because its
  native keydown handler intentionally stops propagation before `EditorShell`.
- Collapsed toolbar/keyboard commands update pending style first; the next
  provable plain bridge insertion is adapted through the rich draft selection
  replacement path so the inserted text receives the pending style.

## Commit Planner Rules

The first rich commit planner is a sibling path beside the existing plain
`draftText` WYSIWYG commit path. It is not wired into the live editor bridge
yet.

- Plain `draftText` commit behavior remains unchanged.
- Rich commit input owns a complete `ParagraphNode`, not a text string.
- Style-only edits must commit even when plain paragraph text is unchanged.
- The target `nodeId` wins over any stale draft paragraph id.
- The replacement supports top-level paragraphs and paragraphs inside
  `flow-table` internals.
- The resulting document is normalized and validated before history changes.
- A successful rich commit records one history entry and clears redo history,
  matching the existing WYSIWYG text commit contract.

## Flag-Gated Live Bridge Rules

The first live bridge is hidden behind
`NEXT_PUBLIC_FLOWDOC_WYSIWYG_RICH_TEXT_DRAFT` and also requires the base
FlowDoc text engine flag to be enabled.

- Default behavior remains the existing plain `draftText` WYSIWYG lane.
- When enabled, `EditorShell` starts the sibling rich draft session instead of
  the plain text session, then projects it back to `WysiwygTextSessionState`.
- Canvas draft text, caret, selection, draft pagination, and accessibility use
  the projected plain-text session shape.
- Autosave/persistable snapshots use the rich draft paragraph while the rich
  session is active.
- Finalize commits through the rich paragraph commit path.
- Plain text bridge changes preserve existing rich runs through the core rich
  text replacement primitive.
- `npm run smoke:wysiwyg-rich-draft` is the browser gate for this flag-gated
  bridge. It starts a flagged editor, edits a styled paragraph and a styled
  `flow-table` paragraph, verifies commit/undo/redo preserve the authored rich
  runs, and proves keyboard/toolbar pending-style insertions create styled runs.
- Toolbar controls read the active rich draft paragraph. Collapsed selections
  display the effective style at the caret, while collapsed pending style wins
  when a toolbar or keyboard command has staged the next insertion style. When
  no rich session owns the selected node, toolbar commands keep the existing
  document-operation path.

## Gates Before Editor Wiring

- Pure core proof tests cover pending style insertion, selected-range style,
  rich fragment replacement, and inline-object preservation.
- The existing `draftText` commit path remains unchanged.
- No `DocumentNode` schema change.
- No pagination, PDF, DOCX, or WYSIWYG bridge behavior change.

## Deferred Decisions

- Whether the sibling rich draft session later replaces or merges into
  `useWysiwygTextSession` after live bridge proof.
- Live toolbar/keyboard wiring and focus/IME behavior for the sibling rich
  draft session beyond the basic bold/italic/underline and toolbar style patch
  proof.
- Rich HTML paste mapping rules.
- Direct editing semantics for `fieldRef`, `pageNumber`, and future `link`.
