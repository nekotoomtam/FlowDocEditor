# Editor vNext Runtime Bridge Plan

Status: Active Phase 11 design plan.

Use this document before connecting the current editor runtime to the vNext
core. The bridge must not make legacy/current runtime structures the vNext
source of truth.

## Goal

Connect the current editor environment to the extractable vNext core through an
explicit bridge so the editor can eventually consume vNext package parsing,
relationship graph, operations, measured pagination, renderer consumption, and
export readiness without reintroducing prototype compatibility into the vNext
core.

## Request To Plan Trace

```text
User request
  -> Node Model vNext Plan
    -> Phase 11: editor runtime bridge
      -> Job item: design bridge boundary before runtime edits
        -> Execution step: write this plan
```

Current position:

- Request: step back from the prototype and build a cleaner vNext core that can
  move to a new repository.
- Plan: Node Model vNext Plan.
- Phase: Phase 11, editor runtime bridge.
- Job item: first read-only generation diagnostic consumer.
- Status: done.
- Why this item is current: Phase 10 is closed for the vNext core
  pagination/export boundary in
  `vnext-workspace/docs/PHASE_10_CLOSE_AUDIT.md`. Direct editor runtime edits
  would be risky without a bridge boundary.
- Next transition: design the first mutating operation pilot without bypassing
  history or validation policy.

## Current Evidence

| Evidence | Meaning |
|---|---|
| `src/app/editor/_components/EditorShell.tsx` dispatch path calls `attachEditorOperationDocumentGraphRuntime(...)` before reducer commit. | The current editor can attach derived graph runtime metadata without flipping `EditorState.doc`. |
| `src/app/editor/_components/operations/editorOperationRuntime.ts` creates `document-v2` runtime graph snapshots from current `DocumentNode`. | Existing bridge style is derived runtime metadata, not authored source of truth. |
| `src/app/editor/_components/documentPersistence.ts` parses persisted DocumentNode v2 packages and adapts them back to current runtime shape. | Current editor still depends on current runtime compatibility after import. |
| `src/app/editor/_components/EditorCanvas.tsx`, `selectionContext.ts`, property panels, WYSIWYG controllers, and pagination controllers still read current `DocumentNode` and `PaginatedDocument`. | A full runtime flip would touch render, selection, inline edit, pagination, and export at once. |
| `vnext-workspace/README.md` says old document versions and prototype node names are rejected by the canonical vNext parser. | The bridge must not add legacy compatibility inside exported vNext core. |
| `vnext-workspace/docs/PHASE_10_CLOSE_AUDIT.md` closes core pagination/export truth around measured fragments and export readiness. | The editor bridge can use vNext measured pagination as derived truth once package/runtime boundaries are clear. |
| root `package.json` workspaces include `packages/*`, not `vnext-workspace`. | Importing vNext into the parent app needs an explicit temporary or final package boundary. |
| `src/app/api/paginate/route.ts` and `src/app/api/export/route.ts` accept current `DocumentNode` payloads. | Existing server preview/export routes are current-runtime generation endpoints, not final vNext package APIs. |
| `src/app/editor/_components/shell/useEditorPreviewDocumentController.ts` binds fill-mode data before pagination. | The current editor already separates authored template data from a bound preview document, but only in current runtime shape. |
| `src/app/editor/_components/vnextBridge/editorGenerationReadiness.ts` wraps the bridge host and reports read-only generation readiness without consuming data or producing artifacts. | Phase 11.5 has a parent-app consumer that exercises the bridge boundary without visible editor or API route mutation. |

## Design Rules

1. vNext authored document/package remains the source of truth for vNext paths.
2. Current editor `DocumentNode` may be reference evidence or compatibility
   input only outside exported vNext core.
3. Do not create a current-to-vNext converter inside exported vNext source.
4. Do not flip `EditorState.doc` to vNext in one patch.
5. Do not let renderer, selection, or export recompute vNext layout decisions.
6. Bridge snapshots must declare whether they are canonical vNext, current
   runtime compatibility, or derived preview state.
7. Every bridge consumer must state whether it is read-only, mutating,
   display-only, or history-affecting.

## Bridge Shape

Target bridge runtime:

```text
EditorVNextBridgeRuntime
  source: canonical-vnext-package | current-runtime-compat | fixture
  packageVersion/documentVersion
  vNextDocument
  relationshipGraph
  operationRuntime
  measuredPagination
  rendererConsumption
  exportReadiness
  diagnostics
```

Important:

- `canonical-vnext-package` is the desired source for new vNext editor work.
- `current-runtime-compat` may exist only as a migration/diagnostic bridge
  outside exported vNext core.
- A bridge runtime is derived runtime state. It must not be persisted as
  authored document JSON.

## Phase Map

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 11.0 | Bridge design boundary | Docs | Bridge rules, evidence, phases, stop conditions, and first implementation target are explicit | done | this document |
| 11.1 | Package/import boundary | Build/package docs/tests | Decide how the parent app imports vNext during the temporary repo phase without hiding the future extraction boundary | done | `docs/EDITOR_VNEXT_IMPORT_BOUNDARY_DECISION.md` |
| 11.2 | Read-only vNext bridge runtime | vNext workspace code/tests | A bridge runtime can parse a canonical vNext package, build graph, paginate, audit renderer consumption, and report export readiness without current editor input | done | `vnext-workspace/src/editorBridge/runtime.ts`; `vnext-workspace/tests/editorBridgeRuntime.test.ts` |
| 11.3 | Parent editor bridge host | Parent app bridge module/tests | Parent editor can request a vNext bridge snapshot behind an explicit feature/diagnostic boundary | done | `src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts`; `src/app/editor/_components/vnextBridge/__tests__/editorVNextBridgeHost.test.ts` |
| 11.4 | Compatibility reader map and generation boundary | Docs/tests | Current render, selection, WYSIWYG, property, pagination, export, and API generation readers are mapped to bridge-ready or current-only status | done | `docs/EDITOR_GENERATION_BOUNDARY_MAP.md` |
| 11.5 | First read-only UI/diagnostic consumer | Parent app or dev tool | One consumer displays or logs vNext bridge/generation readiness without mutating editor state/history | done | `src/app/editor/_components/vnextBridge/editorGenerationReadiness.ts`; `src/app/editor/_components/vnextBridge/__tests__/editorGenerationReadiness.test.ts` |
| 11.6 | First mutating operation pilot | Operation bridge/tests | One vNext operation can be planned/applied through bridge semantics without bypassing history or validation policy | next | pending |
| 11.7 | Runtime flip review gate | Review/browser smokes | Evidence exists before replacing current runtime source for any editor surface | pending | pending |

## Recommended First Implementation

Phase 11.2 started inside `vnext-workspace`, not parent editor runtime.

Reason:

- It keeps vNext source isolated while proving the bridge runtime shape.
- It avoids importing current editor/prototype code into exported vNext paths.
- It gives Phase 11 a stable test target before parent app integration.
- It avoids a premature decision about whether `vnext-workspace` becomes a root
  workspace package, a copied package, or a new repository.

Implemented first target:

```text
createVNextEditorBridgeRuntime(package)
  -> parse package v2/document v3
  -> build relationship graph
  -> paginate measured output
  -> build renderer consumption
  -> assess export readiness
  -> return one read-only bridge runtime object
```

No current `DocumentNode` input should be accepted by this first target.

Current implementation:

- `safeCreateVNextEditorBridgeRuntime(...)` returns structured success/failure
  without accepting raw/current runtime documents.
- `createVNextEditorBridgeRuntime(...)` throws on invalid input and returns the
  bridge runtime on success.
- The runtime includes package version, document version, relationship graph,
  measured pagination, renderer-consumption audit, export readiness, and
  supported vNext operation kinds.
- `tests/editorBridgeRuntime.test.ts` verifies the product fixture, rejection
  of non-package/raw input, rejection of non-document-v3 packages, and source
  isolation from parent runtime/old names.

## Phase 11.1 Import Boundary

Decision: keep `vnext-workspace` in this repository for now and do not add it
to root workspaces yet.

The parent editor may consume vNext only through one temporary host module in
Phase 11.3:

```text
src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts
```

That host may import only the vNext public entrypoint:

```text
vnext-workspace/src/index.ts
```

All other parent editor/runtime files must consume the host output instead of
importing vNext source directly.

See `docs/EDITOR_VNEXT_IMPORT_BOUNDARY_DECISION.md`.

## Phase 11.3 Parent Host

Implemented host:

```text
src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts
```

The host:

- imports only the vNext public entrypoint;
- accepts canonical vNext package input only;
- calls `safeCreateVNextEditorBridgeRuntime(...)`;
- returns a bounded read-only snapshot for diagnostics/readiness;
- does not expose full graph, pagination, renderer, or runtime objects;
- does not mutate editor state, history, pagination, reducer output, or visible
  canvas rendering.

Focused tests verify:

- canonical vNext fixture input returns a bounded snapshot;
- raw/current-document-shaped input is rejected;
- the parent app import boundary has only this host importing
  `vnext-workspace/src`.

## Phase 11.4 Generation Boundary

Implemented map:

```text
docs/EDITOR_GENERATION_BOUNDARY_MAP.md
```

The map locks the first product path as API-first document generation:

- the editor owns authored template/package state;
- generation requests own request data and output options;
- binding, pagination, renderer consumption, and export artifacts are derived
  runtime/output state;
- generated preview/export output is not a new authored document and must not
  replace editor state, selection, history, or saved template data;
- future form/slot/submission work is acknowledged as a later lane and is not
  part of Phase 11.

The map also records that current `/api/paginate` and `/api/export` routes
consume current `DocumentNode` payloads today, while the vNext bridge host and
vNext bridge runtime consume canonical vNext package input only.

## Phase 11.5 Generation Diagnostic Consumer

Implemented consumer:

```text
src/app/editor/_components/vnextBridge/editorGenerationReadiness.ts
```

The consumer:

- calls the Phase 11.3 bridge host only;
- accepts canonical vNext package input through the host boundary;
- returns a bounded read-only generation readiness snapshot;
- reports request data as `not-provided` or `provided-not-consumed`;
- reports that binding runtime view, output artifact, public generation API,
  and current API route replacement are not implemented;
- keeps editor state, history, selection, paginated preview, canvas rendering,
  and API routes as explicit `false` side effects.

Focused tests verify:

- canonical vNext package input returns a read-only generation readiness
  snapshot;
- optional data is recorded but not consumed;
- raw/current-document-shaped input remains blocked with no side effects;
- the parent app import guard still allows only the bridge host to import
  `vnext-workspace/src`.

## Stop Conditions

Stop for owner review before:

- adding `vnext-workspace` to root `package.json` workspaces;
- moving vNext source into `packages/core` or another app-consumed package;
- adding a current-runtime-to-vNext converter;
- changing `EditorState.doc`;
- changing reducer commit semantics, undo/redo semantics, or active inline edit
  lifecycle;
- wiring vNext measured pagination into visible editor rendering;
- claiming product-level editor stability from vNext bridge tests alone.

## Verification Plan

For docs-only Phase 11.0:

- `git diff --check`.

For vNext bridge runtime code:

- `npm.cmd --prefix vnext-workspace run check`;
- source guard against parent runtime imports and old node names;
- fixture-based tests using `product-report-vnext.flowdoc.json`.

For parent editor bridge host:

- focused app tests for the touched bridge/host modules;
- `npm.cmd run type-check`;
- `npm.cmd run test:app` when shared editor runtime paths change.

For visible editor integration:

- browser smoke targeted to the visible surface;
- explicit PASS/RISK/UNKNOWN review against `docs/agent/REVIEW_GATE.md`.

## Non-Goals

- Do not implement concrete PDF/DOCX renderers in this phase.
- Do not implement renderer-backed measurement profile as part of the bridge
  bootstrap.
- Do not support legacy/current document input in canonical vNext core.
- Do not migrate every editor reader in one pass.
- Do not remove existing DocumentNode v2 current-runtime compatibility until a
  separate replacement plan exists.

## Open Questions

- Should the temporary parent app import vNext through `vnext-workspace`, a new
  `packages/vnext-core`, or only after repository extraction?
- Should the first parent editor consumer be a hidden diagnostics panel,
  development console report, or test-only bridge host?
- Which mutating operation should be the first vNext operation pilot after
  read-only bridge runtime is proven?
