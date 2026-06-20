# Workspace Boundary

Status: active boundary for the temporary vNext home.

This folder is designed to be moved to a separate repository. Treat it as a
future project root, not as a submodule of the current editor implementation.

## Allowed Dependencies

- `zod` for schema validation.
- Node/Vitest/TypeScript dev tooling.
- Self-contained source files under `src/`.

## Disallowed Dependencies

- Direct imports from `../packages/core`.
- Direct imports from `../src/app`.
- Direct imports from editor reducer, renderer, pagination, or persistence
  runtime paths.
- Current/prototype node names as vNext public API or accepted canonical input.

## Prototype Cutoff Rule

Current/prototype structures are reference evidence only. They must not enter
the exported vNext source path, package parser, fixture contract, or required
test suite as supported input.

The canonical vNext input is:

```text
FlowDocPackage.packageVersion = 2
  -> document.version = 3
```

Old document versions and prototype node names should be rejected by canonical
vNext parsers. If the project ever needs a one-off converter, keep it outside
exported core and outside required vNext checks.

## Extraction Rule

Before this workspace moves to a new repository, it should have:

- package-local type-check;
- package-local tests;
- vNext product fixture;
- package v2/document v3 parser and serializer tests;
- no exported migration or compatibility adapter for old document shapes;
- no imports from the parent app runtime.
