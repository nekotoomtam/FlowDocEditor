# Editor vNext Import Boundary Decision

Status: Phase 11.1 accepted direction.

Use this document before adding any parent editor import of the vNext core.

## Decision

Do not move vNext to a new repository yet.

Do not add `vnext-workspace` to the root `package.json` workspaces yet.

During the temporary in-repo phase, the parent editor may consume vNext only
through one explicit bridge host module. No other parent editor/runtime file
should import vNext source directly.

## Selected Temporary Boundary

The Phase 11.3 parent bridge host should be the only allowed parent-app import
site for vNext:

```text
src/app/editor/_components/vnextBridge/
  editorVNextBridgeHost.ts
  __tests__/editorVNextBridgeHost.test.ts
```

The host may import the vNext public entrypoint during the temporary phase:

```text
vnext-workspace/src/index.ts
```

It must not import vNext internals such as:

```text
vnext-workspace/src/pagination/measuredPagination.ts
vnext-workspace/src/persistence/package.ts
vnext-workspace/src/editorBridge/runtime.ts
```

When the new repository or package exists, only this host import should need to
change, for example:

```text
@flowdoc/vnext-core
```

## Parent Host Contract

The parent bridge host should be read-only at first.

Allowed:

- accept canonical vNext package v2/document v3 input;
- call `safeCreateVNextEditorBridgeRuntime(...)`;
- return a bounded diagnostic/readiness snapshot for editor UI, tests, or
  developer diagnostics;
- expose `ready`, `ready-with-warnings`, or `blocked` state;
- include page count, graph counts, renderer-consumption counts, and export
  readiness counts.

Not allowed:

- accept current editor `DocumentNode` input;
- convert current runtime documents into vNext inside parent editor code;
- mutate `EditorState.doc`;
- write history entries;
- replace current `PaginatedDocument`;
- drive visible canvas rendering;
- import vNext internal modules directly;
- create vNext compatibility inside exported vNext core.

## Why Not Move Repo Now

Phase 11 still needs to prove the parent bridge API shape. Moving to a new repo
before the host shape is known would add dependency, publishing/linking, CI, and
sync overhead before the contract is stable.

Keeping `vnext-workspace` in-repo for Phase 11.3 lets the editor host prove the
API while preserving the future extraction boundary.

## Import Rules

| Location | May import vNext? | Rule |
|---|---:|---|
| `vnext-workspace/src/**` | yes | Only through local vNext public/internal modules; never parent app/runtime code. |
| `src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts` | yes | Temporary parent host may import the vNext public entrypoint only. |
| Other `src/app/**` files | no | Must consume host output, not vNext source. |
| `packages/core/**` | no | Do not mix prototype/current core with extractable vNext workspace. |
| Tests for the host | yes | May import host module and fixture/package values needed for verification. |

## Verification

For 11.1 docs-only decision:

- `git diff --check`.

For 11.3 parent host implementation:

- focused host tests;
- `npm.cmd run type-check`;
- import guard check that only the host imports `vnext-workspace/src/index`;
- no changes to reducer, `EditorState.doc`, undo/redo, active inline edit, or
  visible pagination/rendering.

## Current Phase 11 Position

Phase 11.3 implemented the parent bridge host:

```text
src/app/editor/_components/vnextBridge/editorVNextBridgeHost.ts
```

Phase 11.4 then mapped current compatibility readers and the API-first
generation boundary:

```text
docs/EDITOR_GENERATION_BOUNDARY_MAP.md
```

Phase 11.5 implemented the first read-only generation diagnostic consumer:

```text
src/app/editor/_components/vnextBridge/editorGenerationReadiness.ts
```

Next step: proceed to Phase 11.6 with a first mutating operation pilot design.
Do not wire vNext into visible editor rendering or replace `/api/export` /
`/api/paginate` before the later runtime flip review gate.

Original Phase 11.3 target:

```text
Parent editor bridge host
  -> one read-only module
  -> imports vNext public entrypoint
  -> returns bounded diagnostics/readiness snapshot
  -> no editor state mutation
```
