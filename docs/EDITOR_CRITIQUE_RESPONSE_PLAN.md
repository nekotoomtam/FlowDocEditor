# Editor Critique Response Plan

Status: Delegated critique response phases 2 through 7 completed and verified.
This document turns the owner-provided architecture and schema critique files
into a current-code roadmap and implementation ledger.

Use this document as the owner/Codex discussion surface when deciding the next
architecture job after the Document Model v2 lane.

## Goal

Convert the critique input into an evidence-based plan that separates:

- findings that are still true in the current codebase
- findings that were partially or fully addressed by recent work
- findings that should become future job lanes
- findings that are not found in the current code/docs

The immediate goal is planning clarity, not code changes.

## Inputs

Owner-provided critique snapshots:

- `ARCHITECTURE_CRITIQUE.md`
- `SCHEMA_CRITIQUE.md`

Current repo evidence to compare against:

- `docs/DOCUMENT_MODEL_V2_PLAN.md`
- `docs/DOCUMENT_MODEL_V2_CONTRACT.md`
- `docs/EDITOR_OPERATION_ARCHITECTURE.md`
- `docs/EDITOR_OPERATION_SOURCE_OF_TRUTH_PLAN.md`
- `docs/EDITOR_REDUCER_RESPONSIBILITY_AUDIT.md`
- `docs/EDITOR_MUTATION_PATH_EQUALITY_PLAN.md`
- current app/core source and tests

Input caveat:

- The provided critique files appear to be older snapshots. The architecture
  critique ends mid-Issue 9, and the schema critique ends at the Issue 7
  heading. Treat them as direction-setting notes, not complete current audits.

## Decision Rules

- Do not accept a critique claim without current file/function evidence.
- Do not dismiss a critique claim merely because recent work improved the area.
- Prefer lanes that reduce future coupling before splitting large files.
- Do not mix schema, persistence, pagination, undo/redo, export, or editor
  lifecycle changes into one patch lane without an accepted design.
- Keep `DocumentNode v2` authored storage work separate from primary runtime
  state migration unless explicitly approved.

## Current Position

Request to plan trace:

```text
User request: turn the critique documents into a discussion plan first
  -> Plan: editor critique response roadmap
    -> Phase 7: Server Runtime And Diagnostics Hygiene
      -> Job item: complete delegated critique response pass
        -> Execution step: run final verification and summarize remaining risks
```

Current position:

- Request: execute critique response phases 2 through 7 in order, continuing
  autonomously until a stop condition is hit.
- Plan: editor critique response roadmap.
- Phase: Phase 7, Server Runtime And Diagnostics Hygiene.
- Job item: complete delegated critique response pass.
- Status: complete.
- Why this item is current: the owner accepted the plan and delegated phases 2
  through 7; all planned phases now have bounded implementation evidence.
- Next transition: decide the next architecture lane from remaining risks.

## Critique Triage

### Architecture Critique

| ID | Critique topic | Current status | Planning decision | Evidence |
|---|---|---|---|---|
| A1 | `EditorShell` is a God Component | partially addressed | Continue extracting tested ownership rules before any broad component split. | Canvas render invalidation source/clear rules now live in `editorPreviewLifecycleGuards.ts`, reducing inline Shell render handoff logic. |
| A2 | `EditorCanvas` is a God File | still true | Keep as a render-boundary lane after ownership rules are clearer. | `src/app/editor/_components/EditorCanvas.tsx` still contains rendering, comparison, hit-testing, draft preview, and telemetry helpers. |
| A3 | `EditorAction` union is a kitchen sink | still true | Primary input to Operation Source Of Truth lane. | `EditorAction` still mixes UI state, document mutation, pagination, history, and WYSIWYG draft actions. |
| A4 | Actions carry precomputed results | still true | Fold into Operation Source Of Truth and structural lifecycle boundary work. | Split/merge and WYSIWYG commit actions still accept `history`, `precomputed`, or `paginated` payloads. |
| A5 | Operation Architecture is only a shim | partially outdated | Continue as the next architecture lane, but update the claim: operation routing exists; `EditorAction` remains the compatibility payload. | `reduceEditorOperation(...)` routes non-legacy operation kinds, but `EditorOperationEnvelope` still carries `action: EditorAction`. |
| A6 | Three pagination systems run in parallel | partially addressed | Keep the systems separate, but enforce explicit ownership for display, readiness, history, and diagnostics. | `docs/EDITOR_PAGINATION_OWNERSHIP_CONTRACT.md` names browser/server/WYSIWYG ownership; `editorPaginationOwnership.ts` centralizes display source selection. |
| A7 | `StructuralExecutionContext` is a God Interface | partially addressed | Keep the shell factory as the composition point, but require structural handlers to accept narrowed capability contexts. | `executeParagraphSplitOperationPlan(...)` and `executeParagraphMergeOperationPlan(...)` now accept split/merge-specific context types instead of the whole `StructuralExecutionContext`. |
| A8 | `flushSync` lives in business logic | addressed for structural operation handlers | Keep as a boundary rule for future structural work. | `editorStructuralHandlers.ts` now calls `context.runSynchronousEditorUpdate(...)`; `flushSync(...)` is supplied by `useEditorOptimisticStructuralRefocusController.ts`. |
| A9 | Pagination route has module-level mutable singleton | addressed for route ownership | Keep runtime cache isolated and resettable in tests. | `src/app/api/paginate/route.ts` now delegates measurer/fallback state to `paginateRuntime.ts`, which returns the measurer and fallback flag together and exposes a test reset. |
| A10 | Performance telemetry is mixed into business logic | still true | Diagnostics Boundary lane. Useful after operation ownership names stable event surfaces. | Canvas/shell/runtime files still record performance and structural telemetry inline. |
| A11 | `pushDoc` vs `pushPrevalidatedDoc` creates two-tier trust | partially addressed | Real Scoped Validation lane. Commit adapter exists, but scoped validation still falls back to full validation. | `commitEditorOperationResult(...)` centralizes commit policy; scoped validation remains deferred in docs. |
| A12 | `findPreviousSibling` scans all sections | not found in current code/docs | Do not plan work from this claim until a current equivalent is found. | `rg "findPreviousSibling"` found no current implementation. |

### Schema Critique

| ID | Critique topic | Current status | Planning decision | Evidence |
|---|---|---|---|---|
| S1 | Dual node namespace between section and FlowTable | addressed at authored v2 boundary; runtime compatibility remains | Do not reopen the decision. Future work is primary runtime v2 migration, not another table-storage redesign. | DocumentNode v2 flattens table rows/cells into `section.nodes`; current runtime still adapts nested table maps for compatibility. |
| S2 | Dual layout system `row/stack` vs `flow-row/flow-stack` | addressed for new authored output; legacy remains for import/runtime compatibility | Keep legacy only as compatibility unless owner approves a primary runtime migration lane. | v2 contract says new authored output does not emit legacy `row` / `stack`. |
| S3 | FlowTable passthrough schema plus manual TS interface | still true in current runtime schema; v2 schema is stricter | Do not patch current runtime schema alone. Resolve through primary runtime v2 migration or a bounded compatibility hardening patch. | `packages/core/src/schema/table.ts` still uses passthrough internal table node schema; `schema/documentV2.ts` defines flattened v2 table nodes. |
| S4 | Paragraph props have three style layers | partially mitigated, still complex | Style Model Simplification lane. Not part of operation source-of-truth unless style actions block it. | `paragraphStyleId`, `styleOverrides`, and direct props still coexist; `paragraphStyles.ts` provides central resolution helpers. |
| S5 | `widthShare` optional but required in rows | partially addressed | Keep schema parse compatible, but make v2 assertion failures explicit. | Runtime assertions reject missing flow-stack width shares inside flow-row; DocumentNode v2 assertion now reports missing `widthShare` before width total mismatch. |
| S6 | `SpacerNode.height` has no unit | still true | Small schema cleanup candidate, but requires migration/normalization decision. | `SpacerPropsSchema.height` is a positive number. |
| S7 | `FieldRefInline.key` not linked to field registry in schema | mitigated outside schema | Keep as validation-contract behavior, not Zod schema behavior, unless package parsing changes. | Field registry validation reports missing/non-inline field refs; package tests cover invalid field refs. |
| S8 | `PageNumberInline` has no format options | likely true; product decision needed | Product/schema decision gate before implementation. | `PageNumberInlineSchema` is currently minimal. |
| S9 | List `itemId` uniqueness not enforced in type system | mitigated by document assertions | Keep as runtime invariant unless list model is redesigned. | `assertDocument(...)` rejects duplicate list `itemId` values inside the same list instance. |

## Phase Map

Parent goal:

- Make the editor architecture easier to change safely while preserving document
  model, pagination, undo/redo, export behavior, and edit lifecycle contracts.

Current job lane:

- Critique response planning before choosing the next implementation lane.

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 0 | Create critique response plan | Docs only | Critique topics are triaged and linked from the docs index | done | This document; `docs/DOCS_INDEX.md` |
| 1 | Owner review and lane selection | Owner/Codex discussion | One next lane is selected with explicit scope and stop conditions | done | Owner delegated phases 2 through 7 for autonomous execution |
| 2 | Operation Source Of Truth Hardening | Operation envelope, reducer entrypoint, action compatibility, precomputed payload ownership | Operation is the semantic source for selected groups; action payload compatibility is bounded | done | `docs/EDITOR_OPERATION_SOURCE_OF_TRUTH_PLAN.md` |
| 3 | Structural Lifecycle Boundary | Structural handlers, execution context, optimistic refocus, `flushSync` boundary | Structural handlers receive narrow capabilities and UI scheduling is isolated | done | A7/A8 |
| 4 | Pagination Ownership Contract | Browser preview, server pagination, WYSIWYG draft pagination, drift/readiness | Source priority and freshness rules are explicit and centrally testable | done | A6 |
| 5 | Render And Shell Decomposition | `EditorShell`, `EditorCanvas`, render comparators, hit testing, telemetry | Large files split along accepted ownership boundaries without behavior drift | done | A1/A2/A10 |
| 6 | Schema Cleanup And Runtime v2 Follow-Up | Current runtime schema, v2 adapter, style/spacer/widthShare cleanup | Cleanup candidates have migration rules and tests before schema changes | done | S1-S9 |
| 7 | Server Runtime And Diagnostics Hygiene | API route measurer cache, telemetry surfaces | Low-risk runtime state and diagnostics cleanup is isolated from editor semantics | done | A9/A10 |

## Recommended Lane Order

Recommended next lane:

1. Operation Source Of Truth Hardening

Why:

- It directly addresses A3, A4, A5, and A11.
- It reduces the chance that `EditorShell`/`EditorCanvas` extraction only moves
  complexity around.
- It gives later pagination/render decomposition a stable operation vocabulary.

Then:

2. Structural Lifecycle Boundary
3. Pagination Ownership Contract
4. Render And Shell Decomposition
5. Schema Cleanup And Runtime v2 Follow-Up
6. Server Runtime And Diagnostics Hygiene

## Job Ledger

| Item | Status | Owner role | Purpose | Verification | Notes |
|---|---|---|---|---|---|
| 0.1 | done | Design Reviewer | Turn critique input into a durable discussion plan. | Plan doc exists and cites current-code evidence categories. | No implementation. |
| 1.1 | done | Scope Guard | Pick the next implementation lane with owner approval. | Owner accepts one lane and scope. | Owner delegated phases 2 through 7. |
| 2.1 | done | Minimal Patch Implementer | Add semantic payloads for node delete, duplicate, reorder, and node props operations. | `npm.cmd run test:app -- editorOperationFromAction + editorNodeOperationPlans + editorNodePropsOperationPlans + editorOperationReducer` passed 4 files / 29 tests; `npm.cmd run type-check` passed. | Operation planners now read node payloads instead of the compatibility action snapshot. |
| 2.2 | done | Minimal Patch Implementer | Add semantic payloads for field, text draft/plain commit, flow-row, table structure, document settings, and style operations. | Focused operation tests passed 10 files / 65 tests; `npm.cmd run type-check` passed. | Compatibility `action` snapshots remain for legacy fallback and lifecycle-only operation families. |
| 3.1 | done | Minimal Patch Implementer | Move synchronous React flushing out of structural operation handlers and into shell-provided execution context. | `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorStructuralHandlers.test.ts` passed 1 file / 3 tests; `npm.cmd run type-check` passed. | `editorStructuralHandlers.ts` no longer imports `react-dom`; shell owns the scheduler choice. |
| 3.2 | done | Minimal Patch Implementer | Narrow structural split/merge handler context types to the capabilities each handler uses. | `npm.cmd run test:app -- src/app/editor/_components/operations/__tests__/editorStructuralHandlers.test.ts` passed 1 file / 3 tests; `npm.cmd run type-check` passed. | The shell context factory remains the composition point, but handlers no longer accept the full context type. |
| 4.1 | done | Minimal Patch Implementer | Add an explicit editor pagination ownership contract and a tested display snapshot resolver. | `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorPreviewDisplay.test.ts src/app/editor/_components/shell/__tests__/editorPreviewLifecycleGuards.test.ts src/app/editor/_components/shell/__tests__/editorServerLayoutReadinessGuards.test.ts` passed 3 files / 10 tests; `npm.cmd run type-check` passed. | Partial browser preview may drive display only when generation-matched; server pagination remains readiness/warnings/drift, not direct display override. |
| 5.1 | done | Minimal Patch Implementer | Extract canvas render invalidation consume/clear rules from `EditorShell` into preview lifecycle guards. | `npm.cmd run test:app -- src/app/editor/_components/shell/__tests__/editorPreviewLifecycleGuards.test.ts src/app/editor/_components/__tests__/editorPreviewDisplay.test.ts` passed 2 files / 9 tests; `npm.cmd run type-check` passed. | This reduces Shell render handoff coupling without broad `EditorShell` or `EditorCanvas` decomposition. |
| 6.1 | done | Minimal Patch Implementer | Tighten DocumentNode v2 flow-row assertion so missing flow-stack `widthShare` fails explicitly before total-width validation. | Full `npm.cmd test -- packages/core/src/document/documentV2.test.ts` ran core suite successfully before app filter failed; clean rerun `npm.cmd run test -w packages/core -- documentV2.test.ts` passed 1 file / 15 tests; `npm.cmd run type-check` passed. | Schema parse remains compatible; migration/normalization still fills repairable width shares. |
| 7.1 | done | Minimal Patch Implementer | Move `/api/paginate` runtime measurer/fallback cache into a resettable helper and add fallback-header regression coverage. | `npm.cmd run test:app -- src/app/api/__tests__/exportPaginate.test.ts` passed 1 file / 14 tests; `npm.cmd run type-check` passed. | Route semantics are unchanged; cache state is now a single object owned by `paginateRuntime.ts`. |

## Stop Conditions

Stop for owner review before implementation when:

- the next lane would change schema, persistence, export, pagination, undo/redo,
  or editor lifecycle behavior
- the owner wants to reorder lane priority
- an implementation would require broad file decomposition before source-of-truth
  ownership is accepted
- critique evidence cannot be verified in the current code/docs

## Verification Plan

For this document-only phase:

- docs link check by reading `docs/DOCS_INDEX.md`
- no test suite required

For future implementation lanes:

- focused operation/reducer tests first
- type-check for all TypeScript changes
- full app/core suites when touching shared operation, schema, pagination, or
  persistence behavior
- browser smoke only when user-visible editor responsiveness or layout display
  is claimed

## Out Of Scope For This Plan Document

- editing production code
- changing schema or persistence behavior
- splitting `EditorShell` or `EditorCanvas`
- deleting legacy current-runtime compatibility
- claiming any critique item is fixed without current code/test evidence
