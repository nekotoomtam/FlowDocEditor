# Editor vNext Runtime Flip Review Gate

Status: Phase 11.7 review gate, refreshed after post-Phase-11 usable runtime,
artifact, and SVG preview proof evidence.

Use this document before replacing any visible editor surface, reducer state,
history lane, pagination lane, or export/API lane with vNext as source of
truth.

## Gate Outcome

FAIL / BLOCKER for visible runtime flip.

PASS for the Phase 11 bridge baseline.

PASS for the post-Phase-11 diagnostic usable-runtime baseline.

The vNext bridge can parse canonical package input, create read-only readiness
snapshots, run a bounded generation diagnostic, and run one `text-block`
operation pilot with history-ready metadata. That is enough to close Phase 11
as a bridge readiness slice. It is not enough to replace the current editor
runtime source of truth.

The post-Phase-11 ledger adds a hidden runtime truth surface, a diagnostic
operation commit adapter, and a readiness-only generation route. These prove a
usable diagnostic path from canonical package input to readiness and operation
metadata. They still do not resolve visible editor state, undo/redo,
WYSIWYG/canvas, or artifact export ownership.

The artifact lane adds measured preview artifact output, and the SVG proof lane
shows that bounded measured commands can be consumed into SVG strings with
metrics and budget gates. This is still diagnostic output, not a visible canvas
or product export flip.

## Request To Plan Trace

```text
User request
  -> Node Model vNext Plan
    -> Phase 11: editor runtime bridge
      -> Phase 11.7: runtime flip review gate
        -> Review output: bridge baseline passes, visible runtime flip blocked
```

Current position:

- Request: step back from the prototype and build a cleaner vNext core that can
  later become the editor/runtime source.
- Active ledger: `docs/EDITOR_VNEXT_SVG_PREVIEW_PROOF_LEDGER.md`.
- Job item: S5 SVG proof review with post-artifact evidence.
- Status: refreshed.
- Next transition: do not flip visible editor runtime yet. Choose a separate
  next lane for artifact generation, operation/history integration, controlled
  editor integration, or repository extraction.

## PASS

| Gate | Evidence | Result |
|---|---|---|
| Canonical vNext package boundary exists | `vnext-workspace/src/persistence/package.ts`; `vnext-workspace/tests/packageFixture.test.ts`; `vnext-workspace/README.md` | PASS |
| vNext bridge runtime is read-only and canonical-only | `vnext-workspace/src/editorBridge/runtime.ts`; `vnext-workspace/tests/editorBridgeRuntime.test.ts` | PASS |
| Parent import boundary is isolated to one host | `src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts`; import guard in `src/app/editor/_components/vnextBridge/__tests__/editorVNextBridgeHost.test.ts` | PASS |
| Parent bridge host does not expose full runtime/pagination objects | `createEditorVNextBridgeHostSnapshot(...)`; `editorVNextBridgeHost.test.ts` asserts no `runtime` or `pagination` fields on the snapshot | PASS |
| Generation diagnostic is read-only | `src/app/editor/_components/vnextBridge/editorGenerationReadiness.ts`; `editorGenerationReadiness.test.ts` asserts request data is not consumed and side effects are false | PASS |
| First mutating pilot carries operation metadata | `runEditorVNextTextReplaceOperationPilot(...)`; `editorVNextOperationPilot.test.ts` asserts validation policy, history intent, render invalidation, operation scope, and history-ready records | PASS |
| Rejected pilot operations remain auditable | `editorVNextOperationPilot.test.ts` asserts rejected operations create rejected history-ready records | PASS |
| Hidden runtime truth surface is bounded and non-visible | `createEditorVNextHiddenRuntimeTruthSurfaceSnapshot(...)`; `editorVNextHiddenRuntimeSurface.test.ts` asserts canonical package truth, raw input blocking, no full runtime/document/pagination exposure, and false side effects | PASS |
| Operation commit adapter separates vNext durable metadata from current session history | `createEditorVNextOperationCommitReadinessSnapshot(...)`; `editorVNextOperationCommitAdapter.test.ts` asserts committed, rejected, and blocked pilot outputs remain current-session-history ineligible | PASS |
| API-first generation readiness route exists without replacing current routes | `src/app/api/vnext/generation/readiness/route.ts`; `vnextGenerationReadiness.test.ts` asserts canonical package plus data readiness, raw input rejection, no artifact rendering, and no paginated output | PASS |
| Measured preview artifact route exists without replacing current routes | `src/app/api/vnext/generation/preview/route.ts`; `vnextGenerationPreviewArtifact.test.ts` asserts canonical package plus data preview commands, bounded command output, raw input rejection, no PDF/DOCX rendering, and no current `PaginatedDocument` output | PASS |
| SVG preview proof consumes measured artifact commands without replacing visible canvas | `src/app/editor/_components/vnextBridge/editorVNextSvgPreviewProof.ts`; `editorVNextSvgPreviewProof.test.ts` asserts SVG output, budget risk, source truncation risk, blocked source handling, no PDF/DOCX output, and false editor/canvas side effects | PASS |
| vNext core checks still pass independently | `npm.cmd --prefix vnext-workspace run check` | PASS |

## FAIL / BLOCKER

| Blocker | Evidence | Why It Blocks Runtime Flip |
|---|---|---|
| Current editor state is still `DocumentNode` plus current `PaginatedDocument` | `src/app/editor/_components/editorReducer.ts` `EditorState` has `doc: DocumentNode`, `paginated: PaginatedDocument`, `past`, and `future`; `UNDO`/`REDO` restore both doc and paginated snapshots | Replacing `EditorState.doc` would affect reducer, history, preview, selection, and undo/redo at once. |
| Visible canvas is current-shape and paginated-shape dependent | `src/app/editor/_components/EditorCanvas.tsx` uses `DocumentNode`, `PaginatedDocument`, `findParagraphNode(...)`, `resolveSelectedTableId(...)`, `isTableCellId(...)`, and paginated fragments | vNext document/pagination cannot be dropped in without a canvas adapter and parity tests. |
| Selection context is current document lookup based | `src/app/editor/_components/selectionContext.ts` uses `DocumentNode` in `findSelectionContextNode(...)`, `findSelectionContextParent(...)`, and `buildSelectionContext(...)` | A runtime flip would risk wrong selection, outline, and property context. |
| WYSIWYG and inline edit depend on current paragraph and paginated fragments | `EditorCanvas.tsx` `findParagraphNode(...)`, `canInlineEditParagraph(...)`, `countParagraphFragments(...)`; shell inline edit controllers use `DocumentNode` and `PaginatedDocument` | A flip can break typing, caret mapping, split/merge, and IME lifecycle unless a vNext text edit adapter exists. |
| Preview pagination remains current-runtime based | `src/app/editor/_components/shell/useEditorPreviewDocumentController.ts` `resolvePreviewDoc(...)` returns `DocumentNode`; `paginatePreviewDoc(...)` calls current `paginateDocument(...)` | vNext measured pagination has not been wired to the preview lifecycle or stale-response guards. |
| Server pagination/export routes are current document APIs | `src/app/api/paginate/route.ts` asserts current documents and calls current `paginateDocument(...)`; `src/app/api/export/route.ts` asserts current documents, paginates, checks warnings, and renders | Replacing them requires a separate API-first generation plan and compatibility decision. |
| Export controller posts current preview doc | `src/app/editor/_components/shell/useEditorExportController.ts` accepts `docRef: MutableRefObject<DocumentNode>`, calls `resolvePreviewDoc(...)`, and posts `{ doc, format }` to `/api/export` | vNext export cannot be claimed until export request shape and readiness source are redesigned. |
| The operation pilot does not apply to current editor history | `runEditorVNextTextReplaceOperationPilot(...)` returns `sideEffects.history: false` and `mutation.editorStateApplied: false` | This is intentional, but it means visible editor mutation is not integrated yet. |
| The operation commit adapter blocks current session history | `createEditorVNextOperationCommitReadinessSnapshot(...)` reports `currentSessionHistoryReady: false` and `sessionHistory.eligible: false` | This proves the boundary, but it also confirms undo/redo is not vNext-backed yet. |
| The vNext generation route is readiness-only | `/api/vnext/generation/readiness` returns JSON diagnostics and `artifactRendered: false` | This proves request shape, not preview/PDF/DOCX artifact parity. |

## RISK

| Risk | Evidence | Required Before Flip |
|---|---|---|
| Current compatibility readers are numerous | `rg` evidence in `src/app/editor/_components/shell/**` shows many `DocumentNode` and `PaginatedDocument` readers across rails, toolbar, navigation, pagination, export, inline edit, and canvas controllers | Build an explicit reader-by-reader adapter or migration checklist. |
| vNext pagination is measured but not renderer-product complete | `vnext-workspace/docs/PHASE_10_CLOSE_AUDIT.md` defers concrete PDF/DOCX renderers, renderer-backed measurement profile, final TOC page resolution, and richer table splitting | Keep visible export/API migration separate from editor runtime bridge. |
| `text-block.text.replace` proves one content operation only | `editorVNextOperationPilot.test.ts` covers one operation kind | Add pilots for structure, layout, table, and rejected validation cases before editor mutation routing. |
| Runtime flip could mix template truth and generated output truth | `docs/EDITOR_GENERATION_BOUNDARY_MAP.md` separates authored template, request data, bound runtime view, measured pagination, renderer plan, and output artifact | Preserve this separation before any preview/export integration. |

## UNKNOWN

| Unknown | Why Unknown | Required Evidence |
|---|---|---|
| Browser UX smoothness with vNext as visible source | No browser smoke uses vNext as the visible canvas input. | A targeted browser smoke that opens a vNext-backed diagnostic/integration surface and measures typing/navigation impact. |
| vNext selection/property parity | Current selection/property panels have not consumed vNext graph output. | Focused tests for selection context, property routing, table cell selection, and outline navigation from vNext graph facts. |
| vNext PDF/DOCX artifact parity | The preview route returns measured render commands only; no vNext route renders concrete PDF/DOCX artifacts through the app export path. | Separate PDF/DOCX artifact lane, artifact tests, and export readiness parity tests. |
| Product SVG preview integration | The SVG proof returns diagnostic SVG strings only; no route or visible editor surface consumes it yet. | Separate product SVG route or controlled integration lane with browser/user-facing evidence. |
| Undo/redo integration semantics | vNext history-ready records are not wired into current `past`/`future` history entries. | A commit adapter design that maps vNext operation records to editor history without stale paginated snapshots. |

## Minimal Next Patch

None inside Phase 11.

Phase 11 bridge readiness and the post-Phase-11 diagnostic usable-runtime
baseline are complete. The next work should be a separate lane, not an
implicit visible runtime flip.

Recommended next plans:

1. vNext PDF/DOCX artifact generation lane for concrete export output.
2. vNext operation/history integration lane for undo/redo semantics.
3. Controlled editor integration lane starting with a non-canvas or
   reader-adapter surface.
4. vNext repository/package extraction plan after the chosen runtime contracts
   stabilize.

## Stop Conditions

Stop for owner review before:

- changing `EditorState.doc`;
- changing undo/redo history shape;
- replacing `state.paginated` with vNext measured pagination;
- wiring vNext output into `EditorCanvas`;
- replacing `/api/paginate` or `/api/export`;
- treating vNext operation pilot output as a current editor mutation;
- claiming product-level editor stability from bridge tests alone.
