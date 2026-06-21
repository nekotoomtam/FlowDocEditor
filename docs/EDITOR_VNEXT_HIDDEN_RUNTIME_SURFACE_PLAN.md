# Editor vNext Hidden Runtime Surface Plan

Status: J2 design complete; J3 implementation complete for
`docs/EDITOR_VNEXT_USABLE_RUNTIME_LEDGER.md`.

Use this plan before implementing the first post-Phase-11 hidden vNext runtime
surface.

## Goal

Expose one parent-app diagnostic surface that treats canonical vNext package
input as runtime truth while keeping all visible editor state, history,
selection, pagination, canvas rendering, persistence, and API routes unchanged.

This surface is the first usable-runtime proof after Phase 11. It is not a
visible editor runtime flip.

## Current Evidence

| Evidence | Meaning |
|---|---|
| `createEditorVNextBridgeHostSnapshot(...)` returns bounded bridge facts and rejects raw document-shaped input. | The parent app already has a safe canonical-package boundary. |
| `createEditorGenerationReadinessSnapshot(...)` reports generation readiness without consuming request data or producing artifacts. | The parent app can expose read-only generation state without side effects. |
| `runEditorVNextTextReplaceOperationPilot(...)` returns validation, history-ready, scope, and render invalidation metadata without applying editor state. | The operation lane has usable metadata, but not editor commit semantics. |
| `docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md` blocks visible runtime replacement. | The hidden surface must stay diagnostic/non-visible unless a later review gate changes that. |

## Surface Contract

Implement a parent bridge function with this shape:

```text
createEditorVNextHiddenRuntimeTruthSurfaceSnapshot(package, options)
  -> call bridge host snapshot
  -> call generation readiness snapshot
  -> return bounded hidden-surface facts
  -> no editor state/history/selection/pagination/canvas/API side effects
```

The returned snapshot should declare:

- `source: "editor-vnext-hidden-runtime-truth-surface"`;
- `mode: "hidden-diagnostic"`;
- `truthSource: "canonical-vnext-package"`;
- bridge status, document id, package/document version, page count, graph
  counts, renderer-consumption status, export-readiness status, and supported
  operation kinds;
- generation readiness summary;
- operation capability summary;
- explicit side-effect flags, all `false`;
- issues from bridge/readiness.

The returned snapshot must not include:

- authored `document`;
- full bridge `runtime`;
- measured `pagination`;
- renderer commands;
- next mutated document;
- current editor state;
- current editor history entry;
- persisted JSON.

## Read/Write Boundary

Allowed:

- read canonical vNext package input;
- derive bounded runtime facts;
- derive readiness and operation capability facts;
- return a hidden diagnostic snapshot to tests/dev tooling.

Not allowed:

- accept current runtime `DocumentNode` as canonical input;
- mutate `EditorState.doc`;
- write editor history or undo/redo entries;
- replace `state.paginated`;
- render through `EditorCanvas`;
- replace `/api/paginate` or `/api/export`;
- persist the hidden surface as authored document state.

## First Implementation Slice

Implement only the hidden surface snapshot function and focused tests.

Recommended code:

- add `createEditorVNextHiddenRuntimeTruthSurfaceSnapshot(...)` as a sibling
  module under `src/app/editor/_components/vnextBridge/`;
- keep `editorVNextBridgeHost.ts` as the only parent app file that imports
  `vnext-workspace/src`;
- add focused tests in
  `src/app/editor/_components/vnextBridge/__tests__/editorVNextHiddenRuntimeSurface.test.ts`.

Test expectations:

- canonical package input returns a hidden diagnostic snapshot with bridge,
  generation, and operation capability facts;
- raw/current document-shaped input is blocked before any hidden truth surface
  can claim readiness;
- snapshot does not expose `document`, `runtime`, `pagination`, or
  `nextDocument`;
- all side-effect flags remain `false`;
- import guard still allows only `editorVNextBridgeHost.ts` to import
  `vnext-workspace/src`.

Implemented:

- `src/app/editor/_components/vnextBridge/editorVNextHiddenRuntimeSurface.ts`
  exposes `createEditorVNextHiddenRuntimeTruthSurfaceSnapshot(...)`;
- `src/app/editor/_components/vnextBridge/__tests__/editorVNextHiddenRuntimeSurface.test.ts`
  verifies canonical package input, raw input blocking, bounded snapshot shape,
  false side effects, and the parent import guard.

## Stop Conditions

Stop before:

- applying hidden surface output to visible editor state;
- wiring hidden surface output into canvas rendering;
- routing operation pilot output into current history;
- returning full vNext runtime objects from the parent app boundary;
- changing API routes or export behavior.

## Next Transition

If this design is accepted by code evidence and focused tests, continue to J3:
implement the smallest hidden runtime truth slice.
