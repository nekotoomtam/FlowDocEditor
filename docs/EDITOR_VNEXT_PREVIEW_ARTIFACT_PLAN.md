# Editor vNext Preview Artifact Plan

Status: A2 design complete; A3 implementation complete for
`docs/EDITOR_VNEXT_ARTIFACT_GENERATION_LEDGER.md`.

## Goal

Return the first vNext generation artifact as a bounded measured preview
artifact. The artifact is renderer-consumption output, not current
`PaginatedDocument`, not PDF/DOCX, and not authored document JSON.

## Selected Slice

Add:

```text
POST /api/vnext/generation/preview
```

The route accepts canonical vNext package input and optional primitive request
data. It returns pages and measured render commands derived from vNext
renderer consumption.

## Request Shape

```ts
type VNextPreviewArtifactRequest = {
  template: {
    package: unknown;
  };
  data?: Record<string, string | number | boolean | null>;
  output?: {
    kind?: "preview";
    measurementProfileId?: string;
    maxCommands?: number;
  };
  requestId?: string;
};
```

Rules:

- `template.package` must be canonical vNext package v2/document v3.
- Current `DocumentNode` input must be rejected.
- `data` is consumed by vNext measured pagination only when it is a primitive
  key/value object.
- `maxCommands` bounds response size and defaults to a conservative value.

## Response Shape

```ts
type VNextPreviewArtifactResponse = {
  source: "vnext-preview-artifact-api";
  mode: "measured-preview-artifact";
  status: "ready" | "ready-with-warnings" | "blocked";
  artifact: {
    kind: "preview";
    format: "measured-render-commands";
    commandCount: number;
    returnedCommandCount: number;
    truncated: boolean;
    generatedDocumentReturned: false;
    paginatedDocumentReturned: false;
    pdfRendered: false;
    docxRendered: false;
  };
  rendererContract: {
    consumes: "measured-pagination-fragments";
    mayRelayout: false;
    requiresAuthoredDocumentForLayout: false;
  };
  pages: Array<{ pageIndex: number; pageNumber: number; sectionId: string }>;
  commands: measured render commands;
};
```

## Non-Goals

- Do not render PDF/DOCX.
- Do not expose full vNext runtime.
- Do not expose full measured pagination.
- Do not expose current `PaginatedDocument`.
- Do not wire the preview artifact into visible canvas.
- Do not replace current API routes.

## Verification

Focused tests should verify:

- canonical package request returns a preview artifact with measured commands;
- primitive data is consumed by measured text output;
- raw/current document-shaped package is rejected;
- command output is bounded and reports truncation;
- no `document`, `runtime`, `pagination`, `paginated`, `pdf`, or `docx`
  payload is returned.

Implemented:

- `createEditorVNextPreviewArtifactSnapshot(...)` in
  `src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts`;
- `src/app/api/vnext/generation/preview/route.ts`;
- `src/app/api/__tests__/vnextGenerationPreviewArtifact.test.ts`.

## Next Transition

If the preview artifact route passes, A4 reviews whether the next lane should
be PDF/DOCX artifact rendering, operation/history integration, controlled
editor integration, or extraction.
