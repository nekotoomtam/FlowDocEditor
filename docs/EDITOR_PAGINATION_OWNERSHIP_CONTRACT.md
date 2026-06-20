# Editor Pagination Snapshot Identity Plan

Status: Complete Architecture Evolution Phase 3 plan.

Use this document when changing editor preview pagination, server pagination
reconciliation, WYSIWYG draft pagination, or export readiness.

## Parent Workflow

Architecture evolution Phase 3:

```text
Pagination snapshot identity
```

The goal is not to replace browser pagination, server pagination, or WYSIWYG
draft pagination. The goal is to make every pagination snapshot carry enough
identity metadata that the editor can decide whether that snapshot may update
display, readiness, history, export, or diagnostics.

## Current Position

- Parent plan: `docs/EDITOR_ARCHITECTURE_EVOLUTION_PLAN.md`.
- Previous lane: Phase 2, Operation command architecture, complete.
- Current lane: Phase 3, pagination snapshot identity.
- Current job item: complete.
- Status: complete.
- Next transition: return to the parent architecture evolution plan for Phase
  4, Long-document v2 stress harness.

## Goal

Make pagination snapshot ownership explicit enough that long-document editing
can stay stable while different pagination producers coexist.

The contract does not add another pagination path. It names which existing path
may own display, readiness, history, and diagnostics at each boundary.

## Problem Statement

The editor already has several freshness checks, but they do not share one
identity vocabulary:

- partial browser preview uses generation and request id
- full browser preview uses preview-settle generation and object references
- server pagination uses layout version and `serverCheckedPreviewDoc === previewDoc`
- WYSIWYG draft pagination uses draft pagination generation and source revision
- undo/redo history stores paired document and paginated snapshots

Each check can be correct locally while still being hard to reason about across
display, export readiness, history, and diagnostics. Phase 3 makes those local
checks explicit as pagination snapshot identity/adoption rules.

## Runtime Sources

| Source | Producer | May drive editor display? | May drive export readiness? | May enter undo/redo history? | Required freshness identity |
|---|---|---|---|---|---|
| Authoritative editor state | Reducer commits, operation commit adapter, optimistic structural commits, full browser preview adoption | yes, default | yes, after server check status confirms current preview | yes, paired with the matching document snapshot | document snapshot pairing |
| Full browser preview | Browser preview lifecycle full output | yes, after adoption into authoritative state | indirectly, by enabling server check | yes, only through reducer/history commit rules | preview generation and current document |
| Partial browser preview | Browser preview lifecycle visible-window partial output | yes, only while preview layout is `partial` and generation-matched | no | no | preview generation and request id |
| WYSIWYG draft pagination | WYSIWYG draft pagination controller and structural optimistic refocus | yes, only after routed through the editor preview/optimistic layout adoption path | no by itself | no by itself | draft generation, draft source revision, node id |
| Server `/api/paginate` | Server fontkit pagination route | no direct display override in current runtime | yes, warnings/drift/readiness only when current | no | layout version and current preview document |

## Display Priority

Editor canvas display uses `resolveEditorDisplayPagination(...)`.

Priority:

1. Use generation-matched partial browser preview only when
   `previewLayout.status === "partial"`.
2. Otherwise use the authoritative editor state paginated snapshot.
3. Ignore missing or stale partial preview snapshots.

The resolver returns both `source` and `reason` so tests can prove why a
snapshot is displayed, not only which object was returned.

## Freshness Rules

- Partial browser preview freshness is generation-based.
- Canvas render invalidation state is applied only when the plan or paginated
  object changes.
- Server pagination waits for full browser preview before requesting
  `/api/paginate`.
- Server pagination responses are ignored when aborted, superseded by a newer
  layout version, or cancelled by page transition.
- Server layout warnings update only when the warning summary structurally
  changes.
- Export readiness uses server-checked status for the current preview document;
  server output does not replace the current editor display snapshot.

## Target Identity Model

```text
PaginationSnapshotIdentity
  -> source
  -> generation/request/revision
  -> document identity
  -> freshness/adoption purpose
```

Identity fields should be small metadata. They must not persist paginated
output in document JSON and must not replace existing `PaginatedDocument`
shape.

An identity may contain:

- source: authoritative, full browser preview, partial browser preview,
  WYSIWYG draft, optimistic structural, server check
- generation, request id, layout version, or source revision where the producer
  already has one
- document id or current document reference check where that is the current
  freshness mechanism
- allowed adoption purpose: display, readiness, history, diagnostics

An identity must not contain:

- full `DocumentNode`
- full `PaginatedDocument`
- persisted package fields
- renderer-specific layout internals
- export artifacts

## Current Evidence

- Display resolution and shared snapshot identity:
  `src/app/editor/_components/editorPaginationOwnership.ts`
- Display compatibility wrapper: `src/app/editor/_components/editorPreviewDisplay.ts`
- Preview lifecycle guards:
  `src/app/editor/_components/shell/editorPreviewLifecycleGuards.ts`
- Server readiness guards:
  `src/app/editor/_components/shell/editorServerLayoutReadinessGuards.ts`
- Server reconciliation lifecycle:
  `src/app/editor/_components/shell/useEditorPaginationLifecycleController.ts`
- WYSIWYG draft pagination lifecycle:
  `src/app/editor/_components/shell/useWysiwygDraftPaginationController.ts`
- Server route: `src/app/api/paginate/route.ts`

## Phase Map

| Phase | Goal | Scope | Done criteria | Status |
|---|---|---|---|---|
| 0 | Design and audit | Docs plus current display/server/draft/history code evidence | Sources, freshness rules, and stop conditions are explicit | done |
| 1 | Identity type contract | `editorPaginationOwnership.ts`, display tests | Shared identity/adoption helper exists without behavior change | done |
| 2 | Display and partial preview adoption | Display resolver and preview lifecycle guards | Partial preview display still requires current generation, with identity diagnostics | done |
| 3 | Server readiness identity | Server readiness guards/lifecycle tests | Server result can affect readiness only when layout version and preview doc are current | done |
| 4 | WYSIWYG/optimistic/history audit | Draft pagination, structural optimistic, commit/history tests | Draft/optimistic/history snapshot adoption rules are documented or guarded | done |
| 5 | Verification and handoff | Tests/docs | Focused pagination tests, type-check, app test, diff check, and ledger pass | done |

## Stop Conditions

Stop for owner review before:

- changing persisted document/package shape
- changing `PaginatedDocument` schema
- changing export or server pagination semantics
- changing undo/redo history semantics
- replacing browser or server pagination implementations
- declaring long-document responsiveness improved without browser/probe evidence

Continue autonomously when:

- changes introduce identity metadata, helpers, tests, or docs only
- display/readiness/history/export behavior is unchanged or more strictly
  guarded by existing freshness evidence
- focused pagination tests and type-check pass

## Verification Plan

Focused checks first:

- `src/app/editor/_components/__tests__/editorPreviewDisplay.test.ts`
- `src/app/editor/_components/shell/__tests__/editorPreviewLifecycleGuards.test.ts`
- `src/app/editor/_components/shell/__tests__/editorServerLayoutReadinessGuards.test.ts`
- export readiness tests when server readiness identity changes

Broader checks when touching shell or shared pagination ownership:

- `npm.cmd run type-check`
- `npm.cmd run test:app -- src/app/editor/_components/__tests__/editorPreviewDisplay.test.ts src/app/editor/_components/shell/__tests__/editorPreviewLifecycleGuards.test.ts src/app/editor/_components/shell/__tests__/editorServerLayoutReadinessGuards.test.ts`
- `npm.cmd run test:app` before marking this phase complete

Browser smoke is deferred until Phase 4 long-document stress harness unless a
Phase 3 patch changes visible interaction behavior.

## Job Ledger

| Item | Status | Purpose | Verification | Notes |
|---|---|---|---|---|
| 0.1 | done | Reframe the existing pagination ownership contract as Architecture Evolution Phase 3. | Docs/code evidence. | No runtime behavior change. |
| 1.1 | done | Add shared pagination snapshot identity/adoption helpers. | Preview display tests and type-check passed. | `PaginatedDocument` shape unchanged. |
| 2.1 | done | Route display resolver and partial preview guard tests through identity metadata. | Preview display and lifecycle guard tests passed. | Partial preview remains display-only and generation-matched. |
| 3.1 | done | Add server readiness identity helpers around current layout version/doc checks. | Server readiness guard tests and type-check passed. | Server pagination remains readiness/drift only. |
| 4.1 | done | Audit WYSIWYG draft, optimistic structural, and history snapshot adoption. | `previewSettleBridge`, `editorOperationCommit`, and `wysiwygTextCommit` tests passed. | Existing guards already cover draft supersession and history pairing. |
| 5.1 | done | Final verification and handoff. | `npm.cmd run type-check`, `npm.cmd run test:app`, `git diff --check` passed. | Browser smoke not required because visible behavior is unchanged. |

## Out Of Scope

- Lazy pagination checkpointing.
- Replacing browser measurement or server measurement.
- Changing export renderers.
- Persisting paginated output in document JSON.
