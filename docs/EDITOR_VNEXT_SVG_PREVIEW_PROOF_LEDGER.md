# Editor vNext SVG Preview Proof Ledger

Status: complete.

This active workflow ledger continues after
`docs/EDITOR_VNEXT_ARTIFACT_GENERATION_LEDGER.md`. The previous ledger proved a
bounded measured preview artifact route. This ledger proves whether that
artifact can be turned into a bounded SVG preview snapshot without changing the
visible editor canvas or export routes.

## Goal

Produce the first SVG preview proof from vNext measured preview artifact
commands, with explicit metrics and budget gates.

## Definition Of Done

- A proof contract exists for SVG preview snapshots.
- The proof consumes `EditorVNextPreviewArtifactSnapshot`, not canonical package
  input and not full runtime/pagination objects.
- The proof renders a bounded page window to SVG strings without relayout.
- The proof reports page/command/byte metrics and risk/blocking issues.
- Focused bridge tests, type-check, and diff hygiene pass.

## Scope

In scope:

- `docs/EDITOR_VNEXT_SVG_PREVIEW_PROOF_LEDGER.md`
- `docs/EDITOR_VNEXT_SVG_PREVIEW_PROOF_PLAN.md`
- `docs/DOCS_INDEX.md`
- `docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md`
- `src/app/editor/_components/vnextBridge/**`
- focused app tests

Out of scope:

- wiring SVG output into `EditorCanvas`;
- replacing current `/api/paginate` or `/api/export`;
- rendering PDF/DOCX;
- changing saved package/document schema;
- changing editor state, history, selection, persistence, or undo/redo;
- adding transport/session/cache behavior.

## Current Position

- Request: continue the generation path without letting transport/cache worries
  derail the plan.
- Plan: Editor vNext SVG Preview Proof.
- Work lane: SVG preview proof.
- Phase or milestone: post-artifact-generation.
- Job item: S5 proof review and verification.
- Status: done.
- Why this item is current: the SVG proof lane has passed focused regression,
  type-check, and diff hygiene.
- Next transition: choose the next active lane separately: product SVG
  route/integration, PDF/DOCX artifact rendering, operation/history
  integration, or extraction.

## Work Lanes

| Lane | Purpose | Status | Evidence |
|---|---|---|---|
| SVG proof | Convert measured commands into bounded SVG preview output. | done | `editorVNextSvgPreviewProof.ts`; focused test. |
| Verification | Prove the proof remains non-mutating and budgeted. | done | Focused regression, type-check, and diff hygiene passed. |

## Job Queue

| Job | Lane | Goal | Scope | Verification | Status | Evidence | Next action |
|---|---|---|---|---|---|---|---|
| S1 | SVG proof | Establish active ledger and plan. | Docs | `git diff --check` | done | This document. | Continue to S2. |
| S2 | SVG proof | Define proof snapshot contract, metrics, budgets, and gates. | Docs, bridge types | Design review | done | `docs/EDITOR_VNEXT_SVG_PREVIEW_PROOF_PLAN.md` | Implement S3. |
| S3 | SVG proof | Implement non-UI SVG proof harness from preview artifact commands. | `vnextBridge` | Focused tests, type-check | done | `src/app/editor/_components/vnextBridge/editorVNextSvgPreviewProof.ts` | Continue to S4. |
| S4 | Verification | Add focused tests for pass/risk/blocked paths. | App tests | `npm.cmd run test:app -- ...` | done | `editorVNextSvgPreviewProof.test.ts` passed 4 tests. | Continue to S5. |
| S5 | Review | Update review gate and verify the lane. | Docs/tests | Review gate table, type-check, diff hygiene | done | `docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md`; verification ledger below. | Complete ledger. |

## Decision Gates

Codex must pause before:

- exposing the SVG proof through a product route;
- wiring SVG output into the visible editor canvas;
- treating SVG proof output as PDF/DOCX or export parity;
- replacing current pagination/export APIs;
- changing the canonical package/document schema;
- adding caching, transport sessions, or background jobs as required behavior.

## Evidence Ledger

| Evidence | Supports | Status |
|---|---|---|
| `docs/EDITOR_VNEXT_ARTIFACT_GENERATION_LEDGER.md` | Measured preview artifact route is complete and bounded. | verified |
| `src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts` | Parent bridge host exposes page metadata and measured render commands without full runtime/pagination objects. | verified |
| `docs/EDITOR_GENERATION_BOUNDARY_MAP.md` | Preview/export output is derived generation state and must not mutate authored editor truth. | verified |
| `docs/EXPORT_RENDERER_CONTRACT.md` | Renderers consume measured layout output and must not make layout decisions. | verified |
| `src/app/editor/_components/vnextBridge/editorVNextSvgPreviewProof.ts` | SVG proof consumes measured preview artifact commands without vNext core import or editor side effects. | verified |
| `docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md` | SVG proof is recorded as diagnostic PASS while product SVG/canvas/export integration remains outside the runtime flip. | verified |

## Verification Ledger

| Check | Scope | Result | Notes |
|---|---|---|---|
| `npm.cmd run test:app -- src/app/editor/_components/vnextBridge/__tests__/editorVNextSvgPreviewProof.test.ts` | SVG proof pass/risk/blocked behavior | passed | 1 file / 4 tests passed. |
| `npm.cmd run test:app -- src/app/api/__tests__/vnextGenerationPreviewArtifact.test.ts src/app/api/__tests__/vnextGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextHiddenRuntimeSurface.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextBridgeHost.test.ts src/app/editor/_components/vnextBridge/__tests__/editorGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationPilot.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationCommitAdapter.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextSvgPreviewProof.test.ts` | Preview artifact, readiness, bridge, operation, commit adapter, and SVG proof regression | passed | 8 files / 27 tests passed. |
| `npm.cmd run type-check` | Parent app type safety | passed | `tsc --noEmit` completed. |
| `git diff --check` | Whitespace/conflict markers | passed | Exit 0; Git reported CRLF warnings only. |

## Risks And Unknowns

| Item | Type | Impact | Required next evidence |
|---|---|---|---|
| SVG proof is not the product renderer. | RISK | It proves command consumption, not final canvas/PDF/DOCX parity. | Keep gate wording explicit. |
| SVG payloads can grow with long documents. | RISK | A large page window can be too heavy for API/UI usage. | Page-window and byte budgets. |
| Preview commands may be truncated upstream. | RISK | SVG proof may not represent the full document. | Surface a `source-artifact-truncated` issue. |

## Completion Handoff

- Files changed:
- Added `docs/EDITOR_VNEXT_SVG_PREVIEW_PROOF_LEDGER.md`,
  `docs/EDITOR_VNEXT_SVG_PREVIEW_PROOF_PLAN.md`,
  `src/app/editor/_components/vnextBridge/editorVNextSvgPreviewProof.ts`, and
  `src/app/editor/_components/vnextBridge/__tests__/editorVNextSvgPreviewProof.test.ts`.
- Updated `docs/DOCS_INDEX.md` and
  `docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md`.
- Behavior changed:
- Added a diagnostic SVG preview proof that consumes measured preview artifact
  commands, renders a bounded SVG page window, and reports metrics, budgets,
  risk issues, and blocking issues.
- Tests run:
- `npm.cmd run test:app -- src/app/editor/_components/vnextBridge/__tests__/editorVNextSvgPreviewProof.test.ts`
- `npm.cmd run test:app -- src/app/api/__tests__/vnextGenerationPreviewArtifact.test.ts src/app/api/__tests__/vnextGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextHiddenRuntimeSurface.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextBridgeHost.test.ts src/app/editor/_components/vnextBridge/__tests__/editorGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationPilot.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationCommitAdapter.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextSvgPreviewProof.test.ts`
- `npm.cmd run type-check`
- `git diff --check`
- Risks left:
- SVG proof is diagnostic only and not product canvas, public route, PDF, or
  DOCX parity.
- Large-document product payload strategy still needs a separate lane if SVG is
  exposed beyond diagnostics.
- Intentionally not changed:
- Current `EditorCanvas`, reducer state/history, current `/api/paginate`,
  current `/api/export`, saved schema, persistence, and repository extraction.
- Job items completed:
- S1 through S5.
- Job items blocked:
- None inside this ledger.
- Job items deferred:
- Product SVG route/integration, PDF/DOCX artifact rendering,
  operation/history integration, transport/session/cache design, and
  extraction.
- Next job item:
- Choose the next active lane separately.
- Minimal next patch: none.
