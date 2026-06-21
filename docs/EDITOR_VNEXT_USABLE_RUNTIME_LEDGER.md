# Editor vNext Usable Runtime Ledger

Status: complete.

Use this active workflow ledger after Phase 11. Phase 11 proved the bridge
baseline. This job proves that vNext can become a usable runtime path before
repository extraction or visible editor runtime replacement.

This is the execution queue for the post-Phase-11 work. It is not a phase
ledger. Job items decide continuation.

## Goal

Make vNext usable enough to justify the next product step by proving a narrow,
testable path from canonical package truth to operation, readiness, generation
boundary, and editor integration evidence without making current runtime
structures the vNext source of truth.

## Definition Of Done

- A hidden or diagnostic vNext runtime surface can use canonical package input
  as its truth source without accepting current `DocumentNode` input.
- At least one operation path has explicit validation, history-ready metadata,
  render invalidation, and a clear boundary for whether it is applied to editor
  state.
- API-first generation shape is designed around package plus data input, not
  generated output as authored document state.
- Visible editor runtime flip remains blocked until the review gate blockers
  are resolved or intentionally deferred.
- Focused tests and docs evidence prove each completed job item.

## Scope

In scope:

- `docs/EDITOR_VNEXT_RUNTIME_BRIDGE_PLAN.md`
- `docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md`
- `docs/EDITOR_GENERATION_BOUNDARY_MAP.md`
- `docs/EDITOR_VNEXT_IMPORT_BOUNDARY_DECISION.md`
- `docs/DOCS_INDEX.md`
- `src/app/editor/_components/vnextBridge/**`
- `vnext-workspace/src/**`
- `vnext-workspace/tests/**`

Out of scope without a decision gate:

- changing `EditorState.doc`;
- changing undo/redo history shape;
- replacing `state.paginated`;
- wiring vNext output into the visible `EditorCanvas`;
- replacing `/api/paginate` or `/api/export`;
- moving `vnext-workspace` to a new repository or root workspace package;
- adding current-runtime-to-vNext compatibility inside exported vNext core.

## Current Position

- Request: make the redesigned vNext direction ready for real use before
  moving further.
- Plan: Editor vNext Usable Runtime.
- Work lane: Review gate.
- Phase or milestone: post-Phase-11.
- Job item: J8 re-run runtime flip review gate with post-Phase-11 evidence.
- Status: done.
- Why this item is current: the usable-runtime ledger has enough diagnostic
  evidence to choose the next lane without pretending visible runtime flip is
  ready.
- Next transition: choose a separate next lane: artifact generation,
  operation/history integration, controlled editor integration, or extraction.

## Work Lanes

| Lane | Purpose | Status | Evidence |
|---|---|---|---|
| Runtime truth | Prove a hidden/diagnostic surface can consume canonical vNext package truth. | done | `createEditorVNextHiddenRuntimeTruthSurfaceSnapshot(...)`; focused bridge tests passed. |
| Operation commit | Move from operation pilot metadata toward explicit editor-safe commit semantics. | done | `createEditorVNextOperationCommitReadinessSnapshot(...)`; focused adapter tests passed. |
| Generation/API | Design package plus data input for preview/export generation without treating generated output as authored state. | done | `src/app/api/vnext/generation/readiness/route.ts`; route tests passed. |
| Editor integration | Map current readers and add adapters only after hidden/runtime evidence exists. | blocked | Runtime flip gate still blocks visible runtime flip. |
| Extraction | Move to repository/package boundary only after runtime contracts stabilize. | pending | `vnext-workspace/docs/PHASE_LEDGER.md` keeps repository move as Phase 12 pending. |
| Verification | Keep focused tests and review gates tied to each job item. | done | Focused route/bridge tests and type-check passed. |

## Job Queue

| Job | Lane | Goal | Scope | Verification | Status | Evidence | Next action |
|---|---|---|---|---|---|---|---|
| J1 | Runtime truth | Establish this active workflow ledger and stop using project phases as the execution driver. | Docs | `git diff --check` | done | This document is linked from docs index and Phase 11 bridge plan. | Continue through J2/J3. |
| J2 | Runtime truth | Design the hidden vNext runtime truth surface. | Bridge docs, `src/app/editor/_components/vnextBridge/**`, vNext fixture/runtime tests | Design review plus focused import/read-only guard plan | done | `docs/EDITOR_VNEXT_HIDDEN_RUNTIME_SURFACE_PLAN.md` | Implement J3. |
| J3 | Runtime truth | Implement the smallest hidden runtime truth slice. | `src/app/editor/_components/vnextBridge/**`, focused tests | `npm.cmd run test:app` for bridge tests, `npm.cmd run type-check` | done | `src/app/editor/_components/vnextBridge/editorVNextHiddenRuntimeSurface.ts`; `editorVNextHiddenRuntimeSurface.test.ts` | Continue to J4. |
| J4 | Operation commit | Design vNext operation commit adapter semantics for editor history and validation. | Bridge host, operation pilot, current editor operation commit docs | Design review against history, validation, render invalidation, and side effects | done | `docs/EDITOR_VNEXT_OPERATION_COMMIT_ADAPTER_PLAN.md` | Implement J5. |
| J5 | Operation commit | Implement one editor-safe commit adapter slice without visible runtime flip. | Bridge host/tests; adapter module if needed | Focused app tests plus vNext workspace checks if core changes | done | `src/app/editor/_components/vnextBridge/editorVNextOperationCommitAdapter.ts`; `editorVNextOperationCommitAdapter.test.ts` | Continue to J6. |
| J6 | Generation/API | Design API-first generation route shape around canonical package plus data. | Generation boundary docs, route evidence, vNext export readiness | Review gate for authored template versus generated output truth | done | `docs/EDITOR_VNEXT_API_FIRST_GENERATION_PLAN.md` | Continue to J7 if route probe can stay diagnostic-only. |
| J7 | Generation/API | Implement the first non-visible generation diagnostic or route probe if accepted. | API or dev diagnostic surface, bridge host, tests | Focused route/app tests; no replacement of current routes | done | `src/app/api/vnext/generation/readiness/route.ts`; `vnextGenerationReadiness.test.ts` | Continue to J8. |
| J8 | Editor integration | Re-run runtime flip review gate with new evidence. | Review docs and touched tests | PASS/RISK/FAIL table | done | `docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md` | Visible runtime flip remains blocked; choose next lane separately. |

## Decision Gates

Codex must pause before:

- changing `EditorState.doc`;
- changing undo/redo history shape;
- replacing visible canvas input with vNext;
- replacing current pagination/export API routes;
- persisting vNext runtime state as authored document JSON;
- accepting current `DocumentNode` as canonical vNext input;
- moving vNext to a new repository or package;
- claiming product-level readiness from diagnostic tests alone.

## Evidence Ledger

| Evidence | Supports | Status |
|---|---|---|
| `docs/EDITOR_VNEXT_RUNTIME_BRIDGE_PLAN.md` | Phase 11 bridge baseline and post-Phase-11 transition rules. | verified |
| `docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md` | Visible runtime flip is blocked; hidden/diagnostic plan is the safe next lane. | verified |
| `docs/EDITOR_GENERATION_BOUNDARY_MAP.md` | Generated preview/export output must not replace authored template truth. | verified |
| `src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts` | Parent app has one bridge import boundary and operation pilot surface. | verified |
| `vnext-workspace/docs/PHASE_LEDGER.md` | Repository extraction remains pending after runtime evidence. | verified |
| `docs/EDITOR_VNEXT_HIDDEN_RUNTIME_SURFACE_PLAN.md` | Hidden surface contract and stop conditions for J3. | verified |
| `src/app/editor/_components/vnextBridge/editorVNextHiddenRuntimeSurface.ts` | J3 hidden surface snapshot with canonical-package truth and no visible side effects. | verified |
| `src/app/editor/_components/vnextBridge/__tests__/editorVNextHiddenRuntimeSurface.test.ts` | J3 canonical input, raw input block, bounded snapshot, and import guard coverage. | verified |
| `docs/EDITOR_VNEXT_OPERATION_COMMIT_ADAPTER_PLAN.md` | J4 history boundary and diagnostic adapter contract. | verified |
| `src/app/editor/_components/vnextBridge/editorVNextOperationCommitAdapter.ts` | J5 diagnostic adapter separates durable vNext operation metadata from current session history. | verified |
| `src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationCommitAdapter.test.ts` | J5 committed, rejected, and blocked pilot adapter coverage. | verified |
| `docs/EDITOR_VNEXT_API_FIRST_GENERATION_PLAN.md` | J6 readiness-only route shape and generation boundary. | verified |
| `src/app/api/vnext/generation/readiness/route.ts` | J7 readiness-only route probe for canonical package plus data input. | verified |
| `src/app/api/__tests__/vnextGenerationReadiness.test.ts` | J7 route coverage for canonical package, raw input rejection, invalid JSON, and missing package. | verified |
| `docs/EDITOR_VNEXT_RUNTIME_FLIP_REVIEW_GATE.md` | J8 review: diagnostic usable-runtime baseline passes, visible runtime flip remains blocked. | verified |

## Verification Ledger

| Check | Scope | Result | Notes |
|---|---|---|---|
| `git diff --check` | Docs/code whitespace and conflict markers | passed | Passed after J1/J2 docs updates. |
| `npm.cmd run type-check` | Parent app type safety | passed | Passed after J3, J5, and J7 implementation. |
| `npm.cmd run test:app -- src/app/api/__tests__/vnextGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextHiddenRuntimeSurface.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextBridgeHost.test.ts src/app/editor/_components/vnextBridge/__tests__/editorGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationPilot.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationCommitAdapter.test.ts` | Parent bridge and vNext generation readiness route behavior | passed | 6 files / 18 tests passed. |
| `npm.cmd --prefix vnext-workspace run check` | vNext core behavior | not-run | Required when vNext workspace code changes. |

## Risks And Unknowns

| Item | Type | Impact | Required next evidence |
|---|---|---|---|
| Hidden surface could become a second source of truth. | RISK | The app might drift between current editor state and vNext diagnostics. | J3 bounded snapshot and tests keep side effects false; recheck before any visible integration. |
| Operation pilot does not yet apply to current editor history. | RISK | vNext operation success could be mistaken for visible editor mutation readiness. | J5 keeps current session history ineligible until a separate runtime/history design exists. |
| API-first generation route is readiness-only. | RISK | Product generation path still cannot claim artifact output. | J7 route reports readiness only; artifact rendering requires a separate lane. |
| Repository extraction timing is still open. | UNKNOWN | Moving too early could freeze unstable contracts. | J8 should decide extraction only after runtime evidence. |

## Completion Handoff

- Files changed:
- Agent workflow docs, post-Phase-11 vNext docs, vNext bridge diagnostics, and
  a readiness-only vNext generation API route.
- Behavior changed:
- Added hidden vNext runtime diagnostics, diagnostic operation commit readiness,
  and `/api/vnext/generation/readiness`.
- Tests run:
- `npm.cmd run test:app -- src/app/api/__tests__/vnextGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextHiddenRuntimeSurface.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextBridgeHost.test.ts src/app/editor/_components/vnextBridge/__tests__/editorGenerationReadiness.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationPilot.test.ts src/app/editor/_components/vnextBridge/__tests__/editorVNextOperationCommitAdapter.test.ts`
- `npm.cmd run type-check`
- Risks left:
- Visible runtime flip remains blocked.
- vNext generation route is readiness-only and does not render artifacts.
- vNext operation adapter does not write current session history.
- Intentionally not changed:
- Current `/api/paginate`, `/api/export`, visible canvas, `EditorState.doc`,
  undo/redo history shape, and repository/package extraction.
- Job items completed:
- J1 through J8.
- Job items blocked:
- Visible runtime flip inside this ledger.
- Job items deferred:
- Artifact rendering, current undo/redo integration, visible editor
  integration, and repository extraction.
- Next job item:
- Choose the next active ledger lane.
- Minimal next patch: only if blocked or handing off.
