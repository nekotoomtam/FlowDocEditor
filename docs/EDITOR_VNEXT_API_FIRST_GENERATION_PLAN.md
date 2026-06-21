# Editor vNext API-First Generation Plan

Status: J6 design complete; J7 readiness route probe complete for
`docs/EDITOR_VNEXT_USABLE_RUNTIME_LEDGER.md`.

Use this plan before adding any vNext generation route, preview route, export
route, or API-facing document generation behavior.

## Goal

Design an API-first generation boundary that accepts canonical vNext package
truth plus request data and output options without replacing current
`/api/paginate`, replacing current `/api/export`, or treating generated output
as authored editor state.

## Current Evidence

| Evidence | Meaning |
|---|---|
| `src/app/api/paginate/route.ts` parses the request body as a current `DocumentNode`, asserts it, paginates it with the current layout engine, and returns `PaginatedDocument`. | Current pagination API is current-runtime-shaped and should not be treated as final vNext generation shape. |
| `src/app/api/export/route.ts` accepts `{ doc, format }`, asserts current `DocumentNode`, paginates, checks layout warnings, and renders PDF/DOCX. | Current export API combines current document input, pagination, readiness, and artifact rendering. |
| `docs/EDITOR_GENERATION_BOUNDARY_MAP.md` separates authored template package, request data, bound runtime view, measured pagination, renderer consumption, and output artifacts. | New generation API must preserve this separation. |
| `vnext-workspace/src/pagination/exportReadiness.ts` declares PDF/DOCX consume measured pagination output and must not relayout. | vNext generation/export should be measured-output-first, not renderer-reflow-first. |
| `createEditorVNextHiddenRuntimeTruthSurfaceSnapshot(...)` proves canonical-package diagnostics without current editor side effects. | The first API probe can reuse this boundary concept without replacing editor routes. |

## Route Strategy

Do not replace existing routes in this lane:

- keep `/api/paginate` current-runtime-shaped;
- keep `/api/export` current-runtime-shaped;
- add any vNext generation route under a separate path or feature boundary.

Preferred first route shape for J7:

```text
POST /api/vnext/generation/readiness
```

This route is diagnostic/readiness-only. It should not render PDF/DOCX, return
a file artifact, write editor state, or replace current preview/export routes.

## Request Shape

```ts
type VNextGenerationReadinessRequest = {
  template: {
    package: unknown;
  };
  data?: unknown;
  output?: {
    kind?: "preview" | "pdf" | "docx";
    measurementProfileId?: string;
  };
  requestId?: string;
};
```

Rules:

- `template.package` must be canonical `FlowDocPackage.packageVersion = 2` with
  `document.version = 3`.
- Current `DocumentNode` payloads must be rejected.
- `data` may be accepted and recorded, but until binding exists it must be
  reported as provided-not-consumed.
- `output.kind` selects the intended output lane, not an actual artifact in
  the first route.
- `requestId` is caller metadata only in the first route; it must not become
  editor state.

## Response Shape

```ts
type VNextGenerationReadinessResponse = {
  source: "vnext-generation-readiness-api";
  mode: "readiness-diagnostic";
  requestId?: string;
  status: "ready" | "ready-with-warnings" | "blocked";
  template: {
    input: "canonical-vnext-package";
    documentId: string | null;
    packageVersion: 2 | null;
    documentVersion: 3 | null;
  };
  generation: {
    requestData: "not-provided" | "provided-not-consumed";
    requestDataConsumed: false;
    bindingRuntimeView: "not-materialized";
    outputArtifact: "not-rendered";
    currentApiRoutes: "not-replaced";
  };
  bridge: {
    pageCount: number;
    graphNodeCount: number;
    rendererConsumptionStatus: "consumable" | "blocked";
    exportReadinessStatus: "ready" | "ready-with-warnings" | "blocked";
  };
  sideEffects: {
    editorState: false;
    history: false;
    selection: false;
    paginatedPreview: false;
    canvasRendering: false;
    persistence: false;
    apiRoutesReplaced: false;
  };
  issues: Array<{ code: string; path: string; message: string }>;
};
```

## Output Ownership

This first API lane may report readiness only.

It must not:

- return generated document JSON as authored truth;
- return current `PaginatedDocument`;
- render PDF/DOCX;
- update editor preview state;
- persist request data;
- mutate a template package;
- call current `/api/export` or `/api/paginate` internally as the vNext truth.

Later lanes may add:

- data binding runtime view;
- measured preview payload;
- artifact rendering from measured pagination;
- route-level caching and idempotency;
- PDF/DOCX artifact responses.

Those are intentionally outside J6/J7 unless accepted separately.

## Verification

For J7, focused route tests should verify:

- canonical package request returns readiness JSON;
- raw/current document-shaped request is rejected;
- optional `data` is reported as provided-not-consumed;
- no current API route is replaced;
- no artifact is rendered;
- no `document`, `runtime`, `pagination`, or `PaginatedDocument` output is
  exposed.

Implemented:

- `src/app/api/vnext/generation/readiness/route.ts` adds a readiness-only
  vNext generation route probe;
- `src/app/api/__tests__/vnextGenerationReadiness.test.ts` verifies canonical
  package requests, raw document-shaped rejection, invalid JSON, missing
  package, false side effects, no artifact rendering, and no paginated output.

## Stop Conditions

Stop before:

- changing `/api/paginate`;
- changing `/api/export`;
- rendering PDF/DOCX from the new route;
- treating request data as durable authored template data;
- returning generated output as saved editor state;
- adding public API compatibility guarantees before route shape is accepted.

## Next Transition

If this design is accepted, continue to J7 with a readiness-only route probe or
defer J7 if the owner wants operation/history integration first.
