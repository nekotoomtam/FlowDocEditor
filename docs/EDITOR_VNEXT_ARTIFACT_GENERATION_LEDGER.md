# Editor vNext Artifact Generation Ledger

Status: complete.

This active workflow ledger continues after
`docs/EDITOR_VNEXT_USABLE_RUNTIME_LEDGER.md`. The usable-runtime ledger proved
readiness diagnostics, a hidden runtime surface, an operation commit-readiness
adapter, and a readiness-only API route. This ledger starts the artifact lane.

## Goal

Produce the first vNext generation artifact without replacing current editor
runtime, current `/api/paginate`, current `/api/export`, undo/redo, or visible
canvas behavior.

## Definition Of Done

- A first artifact route exists outside current `/api/paginate` and
  `/api/export`.
- The route consumes canonical vNext package input and optional primitive
  request data.
- The route returns measured preview artifact commands, not current
  `PaginatedDocument`, PDF, DOCX, full runtime, or authored document JSON.
- The artifact contract states that renderers consume measured output and must
  not relayout.
- Focused route and bridge tests pass.

## Scope

In scope:

- `docs/EDITOR_VNEXT_ARTIFACT_GENERATION_LEDGER.md`
- `docs/EDITOR_VNEXT_PREVIEW_ARTIFACT_PLAN.md`
- `docs/DOCS_INDEX.md`
- `src/app/editor/_components/vnextBridge/**`
- `src/app/api/vnext/generation/**`
- focused app tests

Out of scope:

- replacing `/api/paginate`;
- replacing `/api/export`;
- rendering PDF/DOCX;
- returning current `PaginatedDocument`;
- mutating editor state/history/selection/canvas;
- repository extraction.

## Current Position

- Request: continue from the completed usable-runtime ledger toward a usable
  generation path.
- Plan: Editor vNext Artifact Generation.
- Work lane: Preview artifact.
- Phase or milestone: post-usable-runtime.
- Job item: A4 artifact lane review.
- Status: done.
- Why this item is current: the measured preview artifact route is implemented
  and verified. The remaining decision is which lane should follow without
  overstating PDF/DOCX/export parity.
- Next transition: choose PDF/DOCX artifact rendering, operation/history
  integration, controlled editor integration, or extraction as a separate
  active ledger.

## Job Queue

| Job | Lane | Goal | Scope | Verification | Status | Evidence | Next action |
|---|---|---|---|---|---|---|---|
| A1 | Preview artifact | Establish the artifact generation ledger. | Docs | `git diff --check` | done | This document. | Continue to A2/A3. |
| A2 | Preview artifact | Design measured preview artifact boundary. | Docs, vNext renderer consumption evidence | Design review | done | `docs/EDITOR_VNEXT_PREVIEW_ARTIFACT_PLAN.md` | Implement A3. |
| A3 | Preview artifact | Implement measured preview artifact route. | Bridge host, `/api/vnext/generation/preview`, focused tests | Route tests, bridge tests, type-check | done | `src/app/api/vnext/generation/preview/route.ts`; `vnextGenerationPreviewArtifact.test.ts` | Continue to A4. |
| A4 | Review | Review artifact lane and choose next lane. | Docs/tests | PASS/RISK/FAIL table | done | This ledger; runtime flip gate update. | Choose PDF/DOCX artifact, operation/history, editor integration, or extraction. |

## Decision Gates

Codex must pause before:

- returning PDF/DOCX artifacts;
- returning current `PaginatedDocument`;
- making preview artifact output visible in `EditorCanvas`;
- persisting generated preview output as authored document state;
- replacing current API routes;
- claiming export parity.

## Evidence Ledger

| Evidence | Supports | Status |
|---|---|---|
| `vnext-workspace/src/pagination/rendererConsumption.ts` | vNext can build renderer commands from measured pagination and declares no relayout. | verified |
| `vnext-workspace/src/editorBridge/runtime.ts` | Bridge runtime already exposes measured pagination, renderer consumption, and export readiness from canonical package input. | verified |
| `docs/EDITOR_VNEXT_API_FIRST_GENERATION_PLAN.md` | Existing generation route is readiness-only; artifact work must be separate. | verified |
| `src/app/api/vnext/generation/preview/route.ts` | A3 measured preview artifact route returns pages and bounded render commands. | verified |
| `src/app/api/__tests__/vnextGenerationPreviewArtifact.test.ts` | A3 route coverage for canonical package, data binding, bounded commands, raw input rejection, invalid data, invalid JSON, output kind, and import guard. | verified |

## Verification Ledger

| Check | Scope | Result | Notes |
|---|---|---|---|
| `npm.cmd run test:app -- src/app/api/__tests__/vnextGenerationPreviewArtifact.test.ts src/app/api/__tests__/vnextGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextHiddenRuntimeSurface.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextBridgeHost.test.ts src/app/editor/_components/vnextBridge/__tests__/editorGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationPilot.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationCommitAdapter.test.ts` | Preview route and bridge behavior | passed | 7 files / 23 tests passed. |
| `npm.cmd run type-check` | Parent app type safety | passed | Passed after A3. |
| `git diff --check` | Whitespace/conflict markers | pending | Run before handoff. |

## Risks And Unknowns

| Item | Type | Impact | Required next evidence |
|---|---|---|---|
| Preview artifact is not final PDF/DOCX. | RISK | Product export readiness is still incomplete. | A4 keeps export parity out of PASS. |
| Command payloads can be large. | RISK | Long documents could return too much JSON. | A3 bounds commands and reports truncation. |
| Primitive data binding only. | RISK | Complex data/form use cases remain unsupported. | Future binding lane. |

## Completion Handoff

- Files changed:
- Added measured preview artifact docs, bridge host snapshot, preview route,
  and focused tests.
- Behavior changed:
- Added `/api/vnext/generation/preview`, returning bounded measured render
  commands from canonical vNext package input.
- Tests run:
- `npm.cmd run test:app -- src/app/api/__tests__/vnextGenerationPreviewArtifact.test.ts src/app/api/__tests__/vnextGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextHiddenRuntimeSurface.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextBridgeHost.test.ts src/app/editor/_components/vnextBridge/__tests__/editorGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationPilot.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationCommitAdapter.test.ts`
- `npm.cmd run type-check`
- Risks left:
- PDF/DOCX artifact rendering and export parity are still not implemented.
- Preview artifact is not wired into the visible canvas.
- Intentionally not changed:
- Current `/api/paginate`, current `/api/export`, visible editor canvas,
  editor state/history, and repository extraction.
- Job items completed:
- A1 through A4.
- Job items blocked:
- None inside this ledger.
- Job items deferred:
- PDF/DOCX artifact rendering, visible editor integration, operation/history
  integration, and extraction.
- Next job item:
- Choose the next active ledger lane.
- Minimal next patch: only if blocked or handing off.
