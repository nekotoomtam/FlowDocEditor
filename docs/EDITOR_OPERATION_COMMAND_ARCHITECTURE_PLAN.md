# Editor Operation Command Architecture Plan

Status: Active design gate for Architecture Evolution Phase 2.

Use this document when separating editor commands, runtime context, legacy UI
actions, operation plans, session history, and future AI/durable operation
history.

## Parent Workflow

Architecture evolution Phase 2:

```text
Operation command architecture as source of truth
```

The goal is not to remove `EditorAction` blindly. The goal is to define the
stable command surface that the editor, future AI callers, and operation
history can use without depending on a UI reducer action snapshot.

## Current Position

- Parent plan: `docs/EDITOR_ARCHITECTURE_EVOLUTION_PLAN.md`.
- Previous lane: Phase 1, Runtime Document Model v2 primary path, complete.
- Current lane: Phase 2, operation command architecture verification.
- Current job item: verification and handoff.
- Status: complete.
- Next transition: return to the parent architecture evolution plan.

## Problem Statement

`EditorOperationEnvelope.action` was intentionally useful for two reasons:

- It preserved lossless reducer compatibility during operation migration.
- It provided a future route where automation could invoke editor behavior
  without manually reproducing every low-level reducer detail.

The problem is that the role was not named precisely. Today the action snapshot
is carrying multiple meanings:

- UI event intent.
- Legacy reducer compatibility.
- Operation semantic input for some migrated groups.
- Lifecycle/session context such as history entries, precomputed docs,
  paginated snapshots, optimistic flags, and before/after edit state.
- A future AI-command-like surface.

Those are not the same contract. Keeping them combined makes Phase 2 easy to
misread as "delete `action`" instead of "define the real operation command
surface."

## Target Layer Model

```text
UI Action / External Intent
  -> Operation Command
  -> Runtime Context
  -> Operation Envelope
  -> Operation Plan / Commit Result
  -> Reducer Commit Adapter
```

| Layer | Role | Persistence | Examples |
|---|---|---|---|
| UI Action | Local React/editor event adapter. Can carry UI lifecycle snapshots while migration is active. | Not durable. | `EditorAction`, keyboard handlers, toolbar callbacks. |
| Operation Command | Stable semantic command. This is the future AI/external caller surface. | May later feed durable operation history, but is not persisted in FlowDoc packages today. | `node.delete`, `table.structure.patch`, `paragraph.split`. |
| Runtime Context | Non-serializable execution data that reduces work or preserves session behavior. | Never durable. | Document v2 graph index, precomputed docs, before/after paginated snapshots, optimistic flags. |
| Operation Envelope | Runtime wrapper that combines command, urgency, scope, source, compatibility snapshot, and runtime context. | Not a document/package artifact. | `EditorOperationEnvelope`. |
| Operation Plan / Commit Result | Validated execution result: mutation, validation policy, history policy, selection patch, paginated patch, diagnostics. | Session state only. | `EditorOperationCommitResult`. |
| Reducer Commit Adapter | Applies an accepted result to `EditorState`. | Session state only. | `commitEditorOperationResult(...)`. |

## Naming Contract

Current implementation uses `EditorOperationPayload` for what should become the
stable command body.

Target naming:

```text
EditorOperationCommand = semantic command body
EditorOperationActionSnapshot = optional legacy UI action snapshot
EditorOperationRuntimeContext = non-serializable execution context
EditorOperationEnvelope = command + runtime + compatibility wrapper
```

Migration rule:

- Keep `payload` as a compatibility field until call sites are migrated.
- Introduce command naming by alias or additive field first.
- Do not remove `action` until every non-legacy operation group has a command
  and tests prove mutated action snapshots do not affect semantic planning.

## Command Field Rules

An `EditorOperationCommand` may contain:

- operation kind and sub-kind
- target ids
- scalar edit values
- style/table/list settings
- deterministic optional ids needed for replay or external tooling
- user-facing operation options

An `EditorOperationCommand` must not contain:

- `DocumentNode`
- `PaginatedDocument`
- `HistoryEntry`
- `DocumentGraphIndexV2`
- React state, refs, events, or DOM data
- prevalidated documents
- transient browser preview output
- reducer-only fallback metadata

Those belong in runtime context, operation plan, or session history policy.

## Current Evidence

| Evidence | Meaning |
|---|---|
| `src/app/editor/_components/operations/editorOperationTypes.ts` `EditorOperationEnvelope` | Envelope still requires `action`, has optional `payload`, and stores runtime data separately. |
| `src/app/editor/_components/operations/editorOperationFromAction.ts` `createOperationCommandFromAction(...)` and `createEditorOperationFromCommand(...)` | UI actions now adapt into command/runtime envelopes, and command-first construction exists. |
| `src/app/editor/_components/editorReducer.ts` `reduceEditorOperation(...)` | Non-legacy operation kinds route before falling back to `reducer(state, operation.action)`. |
| `src/app/editor/_components/operations/editorParagraphOperationPlans.ts` | Paragraph split/merge operation paths read `operation.command`, with lifecycle data in runtime context. |
| `src/app/editor/_components/operations/editorListOperationPlans.ts` | List structure operation path reads `operation.command`, with caret/refocus/paragraph data in runtime context. |
| `src/app/editor/_components/operations/editorDragOperationPlans.ts` | Drag placement operation path reads `operation.command`; active drag source remains editor state/runtime context. |
| `src/app/editor/_components/operations/editorTextCommitPlans.ts` | Text draft, plain commit, inline commit, WYSIWYG text, and WYSIWYG rich text read command first; lifecycle snapshots are runtime context. |
| `src/app/editor/_components/operations/editorStructuralHandlers.ts` | Optimistic structural execution mirrors `isOptimistic` into runtime context; compatibility action mutation remains snapshot-only. |
| `src/app/editor/_components/operations/useDispatchEditorOperation.ts` | Compatibility helper still unwraps operation back to `operation.action`. |

## Current Readiness Classification

| Group | Status | Reason |
|---|---|---|
| Node delete/duplicate/reorder | command-ready | Operation planners read command first and retain payload as fallback. |
| Node props | command-ready | Planner reads command first and retains payload as fallback. |
| Field patch | command-ready | Planner reads command first and retains payload as fallback. |
| Text draft | command-ready | Planner reads command first and has command-vs-snapshot tests. |
| Plain `UPDATE_TEXT` commit | command-ready | Planner reads `text.commit` command first. |
| Flow-row structure/layout | command-ready | Planner reads command first and carries paginated preview only where currently needed. |
| Table structure | command-ready | Planner reads command for table id mutations, cell span, and delete-empty-cell paragraph. |
| Document settings | command-ready | Planner reads command first and retains payload as fallback. |
| Style patch | command-ready bridge | Planner reads command first, then adapts to action-shaped internal helper. Safe but still has an internal action-shaped adapter. |
| Paragraph split/merge | command-ready runtime bridge | Semantic fields are command-owned; history/paginated/precomputed/optimistic data are runtime context. |
| List structure | command-ready runtime bridge | List variants are command-owned; caret/refocus/paragraph data are runtime context. |
| Drag placement | command-ready interaction bridge | Placement command is command-owned; active drag source remains editor state/runtime context. |
| Inline/WYSIWYG text commit | command-ready runtime bridge | Semantic commit data is command-owned; before/after paginated snapshots and history entries are runtime context. |
| Delete empty table cell paragraph | command-ready runtime bridge | Command variant exists; history/paginated remain runtime context. |
| Legacy state actions | legacy/system | Selection, undo/redo, load document, set paginated, and state-only commands are not semantic document commands yet. |

## Remaining Compatibility Reads

The remaining `operation.action` reads are classified as compatibility bridges,
not semantic operation sources:

- `src/app/editor/_components/editorReducer.ts` falls back to
  `reducer(state, operation.action)` for legacy/system actions.
- `src/app/editor/_components/operations/useDispatchEditorOperation.ts`
  unwraps `operation.action` for the compatibility dispatch helper.
- `src/app/editor/_components/operations/editorStructuralHandlers.ts` writes
  `isOptimistic` to the action snapshot while also writing it to runtime
  context. Planning uses `operation.kind` and runtime context.

The remaining `operation.payload` reads are fallback-only. Operation planners
now read `operation.command` first, then fall back to deprecated `payload` while
the compatibility field exists.

## Phase Map

| Phase | Goal | Scope | Done criteria | Status |
|---|---|---|---|---|
| 0 | Design and audit | Docs plus operation code evidence | Command/action/runtime/plan roles are explicit | done |
| 1 | Type contract naming | `editorOperationTypes.ts`, tests | Command alias/field exists without behavior change; action snapshot is named as compatibility | done |
| 2 | Command factory boundary | `editorOperationFromAction.ts`, tests | UI actions adapt into commands; command-first construction is possible without UI action input | done |
| 3 | Migrate residual semantic action reads | Paragraph, list, drag, table edge, text lifecycle, structural handlers | Non-legacy operation planning reads command/runtime context before action snapshot | done |
| 4 | Runtime/session context separation | Operation runtime types and lifecycle planners | History/paginated/precomputed/optimistic data are runtime/session context, not command fields | done |
| 5 | Compatibility fallback audit | Reducer, `useDispatchEditorOperation`, legacy actions, payload fallback | Remaining `operation.action` reads are documented as legacy/system bridges and planners read command before payload | done |
| 6 | Verification and handoff | Tests/docs | Focused operation tests, type-check, app test, diff check, and owner-readable ledger pass | done |

## Migration Order

1. Introduce names without behavior change.
   - Add `EditorOperationCommand` as the semantic name for the current payload
     shape.
   - Keep `payload` as the field name until callers can migrate safely.
   - Add `legacyAction` or documented action-snapshot naming only after tests
     cover current behavior.

2. Add command-first construction.
   - Create a helper that can build an operation envelope from a command plus
     runtime classification/scope.
   - Keep `createEditorOperationFromAction(...)` as the UI adapter.
   - This is the gateway for AI/external callers.

3. Migrate action semantic readers by risk:
   - `paragraph.split` and `paragraph.merge`
   - `list.structure.patch`
   - `drag.placement`
   - `table.structure.patch` edge case: delete empty table-cell paragraph
   - inline/WYSIWYG text commit lifecycle commands
   - structural optimistic handler reads

4. Separate runtime/session fields:
   - Move or mirror `history`, `paginated`, `beforeDoc`, `beforePaginated`,
     `afterPaginated`, `precomputed`, `precomputedDocValidation`, and
     `isOptimistic` into runtime/session context where appropriate.
   - Keep document output and undo/redo semantics unchanged.

5. Audit remaining action usage.
   - Anything still reading `operation.action` must be classified as:
     `legacy reducer fallback`, `UI lifecycle bridge`, or `state-only action`.

## AI / External Caller Contract

Future AI or automation should call an operation command surface, not a reducer
action surface.

Allowed shape:

```text
runEditorCommand({
  kind: "node.delete",
  nodeId: "..."
})
```

Not allowed:

```text
dispatch({
  type: "DELETE_NODE",
  ...
})
```

Reason:

- reducer actions may contain local UI/session data
- commands are stable semantic operations
- runtime context can be attached by the editor shell
- graph and pagination context can be cached instead of recomputed by callers

## Stop Conditions

Stop for owner review before:

- removing `EditorOperationEnvelope.action`
- changing persisted package shape
- adding durable operation history persistence
- changing undo/redo history semantics
- changing pagination/export/render input shape
- making AI/external command APIs public/stable

Continue autonomously when:

- changes only introduce names, helpers, tests, or docs
- semantic behavior remains unchanged
- action snapshot compatibility remains intact
- focused operation parity tests pass

## Verification Plan

For Phase 2 patches:

- focused operation command/factory tests
- focused operation planner tests for each migrated group
- action-snapshot mutation tests proving command ownership
- `npm.cmd run type-check`
- `npm.cmd run test:app` after touching reducer, shell, shared operation types,
  or shared operation factory
- `git diff --check`

Browser smoke is not required for pure command contract work, but becomes
required before claiming long-document responsiveness or interaction stability.

## Job Ledger

| Item | Status | Purpose | Verification | Notes |
|---|---|---|---|---|
| 0.1 | done | Reframe Phase 2 from action removal to command architecture. | Docs/code evidence. | Design gate completed. |
| 0.2 | done | Link this command plan from docs index and parent architecture plan. | Docs diff check passed. | No runtime behavior change. |
| 1.1 | done | Add command naming contract in operation types without behavior change. | Focused operation factory/reducer/runtime tests and type-check passed. | `command` mirrors `payload`; action snapshot remains. |
| 2.1 | done | Add command-first envelope construction helper. | Operation factory tests, focused operation tests, and type-check passed. | Future AI/external caller gateway. |
| 3.1 | done | Migrate paragraph split/merge off semantic action reads. | Operation factory, paragraph, structural handler, operation directory tests, and type-check passed. | Lifecycle data moved through structural runtime context. |
| 3.2 | done | Migrate list structure off action selector. | Operation factory, list, operation directory tests, and type-check passed. | Caret/refocus/paragraph remain runtime/session context. |
| 3.3 | done | Migrate drag placement command surface. | Operation factory, drag, operation directory tests, and type-check passed. | Active drag source remains editor state/runtime context. |
| 3.4 | done | Migrate delete-empty-table-cell paragraph edge case. | Operation factory/table tests, operation directory tests, and type-check passed. | History/paginated remain runtime/session context. |
| 4.1 | done | Separate lifecycle runtime/session fields from command fields. | Operation factory/text/structural tests, operation directory tests, and type-check passed. | Undo/redo behavior unchanged; lifecycle runtime missing now fails read-only instead of action fallback. |
| 5.1 | done | Audit and document remaining action reads. | `rg operation.action` evidence plus focused tests. | Remaining action reads are reducer fallback, dispatch compatibility, and optimistic action snapshot mutation. |
| 5.2 | done | Migrate remaining payload-only planners to command-first fallback. | Focused command-vs-snapshot tests, operation directory tests, and type-check passed. | `payload` remains a deprecated compatibility fallback. |
| 6.1 | done | Final verification and parent-plan handoff. | Full app test, type-check, operation directory tests, and diff check passed. | No browser smoke required for pure operation contract work. |

## Current Position

- Request: make `operation.action` roles explicit because it was intended for
  performance and future AI invocation, not merely as a legacy snapshot.
- Plan: Operation Command Architecture Phase 2.
- Phase: 6, Verification and handoff.
- Job item: 6.1.
- Status: complete.
- Why this item is current: command/runtime ownership is implemented, final
  verification passed, and this phase can return to the parent architecture
  evolution plan.
- Next transition: continue from the parent architecture evolution plan with
  the next architecture item.
