# Editor vNext SVG Preview Proof Plan

Status: complete for
`docs/EDITOR_VNEXT_SVG_PREVIEW_PROOF_LEDGER.md`.

## Goal

Turn the measured preview artifact into a bounded SVG preview proof. This is a
diagnostic renderer-consumption proof, not a visible editor integration and not
PDF/DOCX export.

## Selected Slice

Add a bridge helper:

```text
createEditorVNextSvgPreviewProofSnapshot(previewArtifact, options?)
```

The helper accepts the already-derived `EditorVNextPreviewArtifactSnapshot` and
renders a bounded page window into SVG strings.

## Input

```ts
type EditorVNextSvgPreviewProofOptions = {
  pageStart?: number;
  pageCount?: number;
  maxPages?: number;
  maxPageSvgBytes?: number;
  maxWindowSvgBytes?: number;
  maxCommandsPerPage?: number;
};
```

Rules:

- The input must be an `EditorVNextPreviewArtifactSnapshot`.
- The proof must not accept canonical package input directly.
- The proof must not import `vnext-workspace/src`.
- The proof must not expose full runtime, full pagination, current
  `PaginatedDocument`, PDF, DOCX, or generated document output.
- SVG output must consume command bounds and text as measured. It must not
  relayout, rewrap, remeasure, or infer page breaks.

## Response

```ts
type EditorVNextSvgPreviewProofSnapshot = {
  source: "editor-vnext-svg-preview-proof";
  mode: "svg-preview-proof";
  input: "editor-vnext-preview-artifact";
  status: "pass" | "risk" | "blocked";
  artifact: {
    sourceStatus: "ready" | "ready-with-warnings" | "blocked";
    commandCount: number;
    returnedCommandCount: number;
    truncated: boolean;
  };
  rendererContract: {
    consumes: "measured-pagination-fragments";
    mayRelayout: false;
    requiresAuthoredDocumentForLayout: false;
  };
  pageWindow: {
    pageStart: number;
    requestedPageCount: number;
    renderedPageCount: number;
    availablePageCount: number;
    clamped: boolean;
  };
  budgets: {
    maxPages: number;
    maxPageSvgBytes: number;
    maxWindowSvgBytes: number;
    maxCommandsPerPage: number;
  };
  metrics: {
    totalCommandCount: number;
    renderedCommandCount: number;
    totalSvgBytes: number;
    maxPageSvgBytes: number;
    renderMs: number;
  };
  pages: Array<{
    pageIndex: number;
    pageNumber: number;
    sectionId: string;
    widthPt: number;
    heightPt: number;
    commandCount: number;
    svgBytes: number;
    svg: string;
  }>;
};
```

## Gates

The proof returns:

- `pass` when the source artifact is ready, the selected page window renders,
  and byte/command budgets are inside limits.
- `risk` when the source has warnings, command output is truncated, the page
  window is clamped, or budgets are exceeded.
- `blocked` when the source artifact is blocked or no renderable page is
  selected.

## Non-Goals

- Do not add an API route for SVG proof in this lane.
- Do not wire SVG into `EditorCanvas`.
- Do not use SVG proof output as authored document state.
- Do not render PDF/DOCX.
- Do not add caching, sessions, or background jobs.

## Verification

Focused tests should verify:

- a canonical preview artifact can produce SVG pages with bound data text;
- the proof reports no side effects and no full runtime/pagination/document
  payload;
- page byte budgets produce `risk` instead of a silent pass;
- upstream truncation produces `risk`;
- blocked source artifacts produce `blocked`.

Implemented:

- `src/app/editor/_components/vnextBridge/editorVNextSvgPreviewProof.ts`;
- `src/app/editor/_components/vnextBridge/__tests__/editorVNextSvgPreviewProof.test.ts`.

## Next Transition

If the SVG proof verification passes, S5 closes this diagnostic lane. The next
lane should still be chosen separately: product SVG route/integration,
PDF/DOCX artifact rendering, operation/history integration, or extraction.
