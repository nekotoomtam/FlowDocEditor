# FlowDoc vNext Workspace

This is the temporary extractable home for the FlowDoc vNext document model.
It lives inside the current repository only while the model, fixture, parser,
and operation boundaries are still being proven.

The target is to move this folder to a new repository once the vNext core can
stand on its own.

## Boundary

- This workspace must not import current editor runtime code.
- Legacy/current code may be referenced only from explicit migration or
  compatibility files.
- Tests must run from this folder without depending on the app runtime.
- Fixtures in this folder should use vNext shape and sanitized data.
- Package envelope compatibility stays explicit: package v2 may contain
  document v3.

## Local Commands

From this folder after dependencies are available:

```sh
npm run type-check
npm run test
npm run check
```

From the current parent repository without installing this folder separately:

```sh
../node_modules/.bin/tsc --noEmit -p tsconfig.json
../node_modules/.bin/vitest run --config vitest.config.ts
```

## Current Slice

- Document schema version: `3`
- Package envelope target: `FlowDocPackage.packageVersion = 2`
- Implemented baseline nodes: `zone`, `text-block`, `columns`, `column`,
  `table`, `table-row`, `table-cell`, `toc`, `page-break`, `divider`,
  `spacer`
- Implemented graph baseline: parent refs, child indexes, nearest context,
  capabilities, and relationship diagnostics

Not implemented yet:

- migration from document v1/v2 to v3;
- editor runtime integration;
- pagination/export integration;
- durable operation history;
- full product-report fixture acceptance.
