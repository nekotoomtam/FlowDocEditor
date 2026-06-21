# Editor vNext Operation Commit Adapter Plan

Status: J4 design complete; J5 implementation complete for
`docs/EDITOR_VNEXT_USABLE_RUNTIME_LEDGER.md`.

Use this plan before turning vNext operation pilot output into any editor
commit behavior.

## Goal

Define the boundary between vNext operation history-ready metadata and current
editor session history so the project can move toward usable vNext operations
without silently writing incompatible history or replacing current editor state.

## Current Evidence

| Evidence | Meaning |
|---|---|
| `runEditorVNextTextReplaceOperationPilot(...)` returns a vNext history-ready record, validation policy, operation scope, and render invalidation, while `sideEffects.history` and `mutation.editorStateApplied` are `false`. | vNext can describe operation outcome, but it does not currently mutate editor state or current history. |
| `src/app/editor/_components/operations/editorOperationCommit.ts` commits current editor operations by accepting `DocumentNode`, `PaginatedDocument`, selection patches, and `HistoryEntry` values. | Current session history is current-runtime-shaped, not vNext-package-shaped. |
| `editorReducer.ts` defines `past` and `future` as `HistoryEntry[]` and undo/redo restore `doc` plus `paginated`. | A vNext durable history record cannot be pushed into current undo/redo without an accepted runtime/history design. |
| `docs/EDITOR_OPERATION_ARCHITECTURE.md` separates session history from future durable operation history. | vNext operation records should feed durable/audit semantics before they become current session history. |
| `docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md` blocks visible runtime flip and current history replacement. | The first adapter must be diagnostic/commit-readiness only. |

## History Boundary

There are three different concepts:

| Concept | Shape | Status |
|---|---|---|
| Current session history | `HistoryEntry` with current `DocumentNode` and `PaginatedDocument` snapshots | existing editor undo/redo truth |
| vNext operation history-ready record | vNext operation result metadata for audit/replay/debug evidence | exists in operation pilot |
| Future vNext session history | editor undo/redo once vNext is accepted as visible runtime source | not designed yet |

The first adapter must not convert a vNext history-ready record into current
`HistoryEntry`. That would require either a vNext-to-current document adapter
or a visible runtime flip, both outside this job item.

## Adapter Contract

Implement an adapter snapshot that answers:

- Is the vNext operation auditable?
- Did it commit or reject at the vNext operation layer?
- Does it carry validation policy, history intent, render invalidation, and
  operation scope?
- Is it eligible for current editor session history?
- If not, why not?
- Which side effects remain explicitly false?

The first adapter mode is:

```text
mode: "commit-readiness-diagnostic"
```

It may consume an `EditorVNextOperationPilotSnapshot`, but it must not:

- apply the vNext next document;
- return the vNext next document;
- push current editor `past` / `future`;
- mutate `EditorState.doc`;
- adopt `PaginatedDocument`;
- change selection;
- persist authored JSON;
- replace visible canvas rendering.

## First Implementation Slice

Add a parent-app adapter module near the vNext bridge:

```text
src/app/editor/_components/vnextBridge/editorVNextOperationCommitAdapter.ts
```

Candidate function:

```text
createEditorVNextOperationCommitReadinessSnapshot(operationPilotSnapshot)
```

Expected snapshot:

- `source: "editor-vnext-operation-commit-adapter"`;
- `mode: "commit-readiness-diagnostic"`;
- `operationStatus`;
- `durableHistoryRecordStatus`;
- `sessionHistoryEligibility`;
- validation, history intent, render invalidation, and scope summaries;
- side-effect flags, all `false`;
- blocker reason when current session history is not eligible.

For this slice, `sessionHistoryEligibility` should remain blocked with:

```text
reason: "current-editor-history-requires-current-document-snapshot"
```

That is a success state for J5, not a failure, because the adapter is proving
the boundary instead of pretending vNext can already write current history.

## Verification

Focused tests should verify:

- committed vNext pilot output becomes an auditable commit-readiness snapshot;
- rejected vNext pilot output stays auditable but is not session-history
  eligible;
- blocked bridge output is not session-history eligible;
- no current editor state/history/pagination/canvas/API side effects are
  declared;
- the adapter does not expose `document`, `runtime`, `pagination`, or
  `nextDocument`.

Implemented:

- `src/app/editor/_components/vnextBridge/editorVNextOperationCommitAdapter.ts`
  exposes `createEditorVNextOperationCommitReadinessSnapshot(...)`;
- `src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationCommitAdapter.test.ts`
  verifies committed, rejected, and bridge-blocked pilot outputs stay
  diagnostic-only and current-session-history ineligible.

## Stop Conditions

Stop before:

- writing to `EditorState.past` or `EditorState.future`;
- converting vNext records into current `HistoryEntry`;
- adding a current-runtime-to-vNext converter;
- returning full mutated vNext documents from the parent boundary;
- changing undo/redo behavior;
- treating the adapter as visible editor mutation readiness.

## Next Transition

If this design is accepted by code evidence and focused tests, continue to J5:
implement one diagnostic commit adapter slice.
