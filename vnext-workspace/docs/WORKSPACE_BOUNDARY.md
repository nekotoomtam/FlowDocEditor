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
- Current/prototype node names as vNext public API.

## Legacy Access Rule

Legacy/current structures may enter this workspace only through files named
with one of these terms:

- `legacy`
- `compat`
- `migration`

Those files must document their exit criteria.

## Extraction Rule

Before this workspace moves to a new repository, it should have:

- package-local type-check;
- package-local tests;
- vNext product fixture;
- package v2/document v3 parser tests;
- migration diagnostics for supported legacy inputs;
- no imports from the parent app runtime.
