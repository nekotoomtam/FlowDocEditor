# Editor / Generation Boundary Map

Status: Phase 11.4 baseline map for API-first document generation.

Use this document before wiring vNext bridge output into editor preview,
export, renderer jobs, or public generation APIs.

## Decision

The first product path is document generation, not a form-slot authoring
system.

The editor owns authored template creation. The generation path owns binding a
template plus request data into derived preview/export output. The generated
output is not a new authored document, and it must not replace editor state,
history, selection, or saved template data.

Future form-like data entry over a document can exist later, but it is outside
this phase. Do not design slot layout, submission state, or editable form
runtime in Phase 11.

## Request To Plan Trace

```text
User request
  -> Node Model vNext Plan
    -> Phase 11: editor runtime bridge
      -> Phase 11.4: editor/generation boundary map
        -> Job item: separate editor template truth from generation output truth
```

Current position:

- Request: step back from the prototype and build a cleaner vNext architecture.
- Product path: editor-authored template, then API-first document generation.
- Phase: Phase 11.4.
- Status: done as the Phase 11.4 baseline; owner can revise before runtime
  implementation.
- Next transition: choose the first read-only generation diagnostic consumer.

## Boundary Summary

| Boundary | Owns | Must Not Own |
|---|---|---|
| Editor authoring | Authored template/package, node operations, selection, undo/redo, style and field registry editing | Final export artifact, API request data truth, renderer relayout decisions |
| Template/package contract | Durable authored structure, field references, package version, document version | Runtime selection, preview pagination snapshots, generated artifacts |
| Generation request | Template identity or package, request data snapshot, format/profile options, idempotency/cache metadata | Authored template mutation, editor history entries |
| Binding/runtime view | Resolved field values and derived render input for one request | Durable authored document truth |
| vNext core | Canonical package parsing, relationship graph, operations, measured pagination, renderer consumption, export readiness | Legacy/current document compatibility, UI state, API transport policy |
| Preview/export renderer | Fragment/output consumption from measured pagination | Recomputing layout truth from authored nodes |
| Future form/submission lane | Potential slot metadata, form state, user submissions, constrained layout entry | Phase 11 generation bridge scope |

## Runtime Truths

| Truth | Durable? | Owner | Notes |
|---|---:|---|---|
| Authored template package | yes | Editor/template storage | The saved user-authored contract. |
| Field registry | yes | Template/package | Field keys are authored references, not resolved values. |
| Request data snapshot | request-durable | Generation API caller | Data used for one preview/export request. |
| Bound runtime view | no | Generation runtime | Derived from template plus request data. |
| Measured pagination | no | vNext pagination runtime | Derived layout snapshot for one template/data/profile input. |
| Renderer consumption plan | no | vNext renderer boundary | Derived commands. Renderers must not relayout. |
| PDF/DOCX/preview output | output artifact | Generation/export service | Final artifact or preview response. |
| Editor selection/history | session-durable | Editor runtime | Must not be changed by generation output. |

## Pipeline Shape

```text
Editor authoring
  -> save/publish template package
  -> generation request(template/package ref, data snapshot, output options)
  -> validate package and data
  -> bind data into a runtime view
  -> build relationship graph
  -> measure and paginate
  -> build renderer consumption plan
  -> assess export readiness
  -> render preview/export artifact
```

Important rules:

1. The editor may call this same pipeline for preview, but preview is still a
   generation consumer.
2. The output of binding/pagination/rendering is derived state, not authored
   template state.
3. Generation readiness can block export without mutating the editor document.
4. Renderer jobs can be chunked or cached by measured pagination units, but
   chunking must not create a second layout truth.
5. The vNext core should stay canonical-only. Any current-runtime adapter must
   stay outside exported vNext source.

## Current Code Evidence

| Evidence | Meaning |
|---|---|
| `src/app/editor/_components/documentPersistence.ts` `createAuthoredDocumentPackageV2(...)` serializes current editor documents by migrating them into DocumentNode v2 packages. | Current editor save/export package code is still a compatibility bridge from current runtime shape. |
| `src/app/editor/_components/documentPersistence.ts` `parsePersistedDocumentV2RuntimeValue(...)` adapts v2 packages back to current runtime shape. | Current editor runtime remains current-shape after import. This is not the vNext source of truth. |
| `src/app/editor/_components/documentPersistence.ts` `serializeDocumentPackage(...)` takes a current `DocumentNode`. | Current package serialization is editor-runtime-first, not vNext-generation-first. |
| `src/app/editor/_components/shell/useEditorPreviewDocumentController.ts` `resolvePreviewDoc(...)` binds data snapshots for fill mode and `paginatePreviewDoc(...)` paginates current `DocumentNode`. | Existing preview already has a template-versus-bound-preview distinction, but it is current-runtime-only. |
| `src/app/editor/_components/shell/useEditorExportReadiness.ts` computes readiness from preview layout status, server checks, data readiness, drift, font fallback, and layout warnings. | Export readiness is already a derived gate, not authored document data. |
| `src/app/editor/_components/shell/useEditorExportController.ts` posts `{ doc, format }` to `/api/export`. | Current export API consumes a full current runtime document payload. |
| `src/app/api/paginate/route.ts` asserts current `DocumentNode`, paginates, and returns `PaginatedDocument`. | Existing server pagination route is current-runtime-shaped. |
| `src/app/api/export/route.ts` asserts current `DocumentNode`, paginates, checks blocking layout warnings, and renders PDF/DOCX. | Existing export route combines generation, pagination, readiness, and rendering around current document input. |
| `src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts` accepts canonical vNext package input only and returns bounded diagnostics/readiness snapshots. | Phase 11.3 provides the safe parent-app bridge point for future generation diagnostics. |
| `vnext-workspace/src/editorBridge/runtime.ts` builds graph, measured pagination, renderer-consumption audit, export readiness, and operation-kind diagnostics from canonical vNext package input. | vNext already has the internal read-only generation readiness ingredients without importing parent runtime. |

## Compatibility Reader Map

| Reader | Current input | Bridge status | Decision |
|---|---|---|---|
| Editor canvas/render tree | Current `DocumentNode` plus `PaginatedDocument` | current-only | Do not wire vNext directly into visible canvas in Phase 11.4. |
| Selection, drag/drop, property panels | Current node ids and current runtime lookup helpers | current-only | Needs a separate vNext selection/property bridge before mutation. |
| WYSIWYG inline edit | Current text nodes plus current paginated fragments | current-only | High risk. Keep out of first generation diagnostic. |
| Local preview document controller | Current `DocumentNode`, field registry, data snapshot | candidate | Good evidence for template versus bound runtime view, but do not reuse as vNext truth. |
| Export readiness hook | Current preview/server readiness state | candidate | Good shape for a read-only generation readiness consumer. |
| `/api/paginate` | Current `DocumentNode` request body | current-only | Future vNext generation route should not accept this as canonical input. |
| `/api/export` | `{ doc, format }` current document payload | current-only | Future route should accept template/package plus data/options. |
| vNext bridge host | Canonical vNext package | bridge-ready | Safe first parent app entrypoint for diagnostic generation snapshots. |
| vNext core runtime | Canonical package v2/document v3 | bridge-ready | Keep as source of truth for vNext generation readiness. |

## API-First Generation Contract Direction

Future generation APIs should be shaped around template/package input, not
editor runtime state.

Suggested request shape for design discussion only:

```ts
type GenerateDocumentRequest = {
  template: {
    packageId?: string;
    package?: unknown;
    version?: string;
  };
  data?: unknown;
  output: {
    kind: "preview" | "pdf" | "docx";
    measurementProfileId?: string;
  };
};
```

Phase 11.4 does not implement this API. It only records the boundary so the
next work does not accidentally keep `/api/export` as the final architecture.

## First Read-Only Consumer

Phase 11.5 starts with a read-only generation diagnostic, not visible editor
rendering.

Implemented shape:

```text
createEditorGenerationReadinessSnapshot(package, data?, options?)
  -> calls the Phase 11.3 vNext bridge host
  -> reports package/document version, page count, graph issue count,
     renderer-consumption status, export readiness, and bounded issues
  -> does not mutate editor state/history/pagination/canvas
```

Implementation:

```text
src/app/editor/_components/vnextBridge/editorGenerationReadiness.ts
src/app/editor/_components/vnextBridge/__tests__/editorGenerationReadiness.test.ts
```

The first consumer is test/dev-facing only. It records optional request data as
provided but not consumed, and it does not materialize a bound runtime view,
render an output artifact, implement a public generation API, or replace
current `/api/export` / `/api/paginate`.

## Non-Goals

- Do not implement a public generation API in Phase 11.4 or 11.5.
- Do not implement form slots or submission state in Phase 11.4 or 11.5.
- Do not render PDF/DOCX from vNext in Phase 11.4 or 11.5.
- Do not migrate `/api/export` or `/api/paginate` to vNext in Phase 11.4 or
  11.5.
- Do not wire vNext pagination into the visible editor canvas in Phase 11.4 or
  11.5.
- Do not convert current `DocumentNode` into canonical vNext inside exported
  vNext core.

## Stop Conditions

Stop for owner review before:

- changing public API request shape;
- changing saved template/package version;
- replacing `/api/export` or `/api/paginate`;
- letting generation output update editor history or selection;
- treating bound/generated output as authored template data;
- starting form-slot or submission-system design.
