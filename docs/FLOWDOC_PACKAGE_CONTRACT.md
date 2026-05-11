# FlowDoc Package Contract

This contract defines the persisted/editor JSON package boundary for
FlowDocEditor.

Use this document when changing localStorage, JSON import/export, future
migrations, template persistence, or document package metadata.

For field-key identity and registry validation rules, also read
`docs/FIELD_REGISTRY_CONTRACT.md`.

For the proposed next package shape, read
`docs/FLOWDOC_PACKAGE_V2_PROPOSAL.md`.

## Decision

FlowDocEditor uses a document-first package envelope for persisted editor JSON.
The current canonical write format is `FlowDocPackage v2`:

```txt
FlowDocPackage v2
  -> package metadata
  -> fields: FieldRegistryV1
  -> document: DocumentNode v1
```

Core layout, pagination, API export, and renderers still consume `DocumentNode`
or `PaginatedDocument`. The package is an app/file boundary, not a layout engine
input.

Current write behavior:

- localStorage autosave writes `FlowDocPackage v2`
- default JSON export writes `FlowDocPackage v2`
- package v1 remains an import/migration compatibility format only

The parser accepts `FlowDocPackage v2`, `FlowDocPackage v1`, and legacy raw
`DocumentNode v1`.

## Shape

`FlowDocPackage v2` contains document-layer data plus the field registry needed
to understand inline `fieldRef` keys:

```ts
interface FlowDocPackageV2 {
  packageVersion: 2
  kind: "document"
  id: string
  meta: {
    title: string
    createdAt: string
    updatedAt: string
  }
  document: DocumentNode
  fields: FieldRegistryV1
  data?: unknown
  history?: unknown
  migrations?: unknown
}
```

Current implementation:

- `src/app/editor/_components/documentPersistence.ts`
- storage key: `flowdoc_document`
- localStorage package version: `2`
- default JSON export package version: `2`
- JSON export extension: `.flowdoc.json`

## Identity Rules

For `FlowDocPackage v1`, the package identity is the document identity:

- `package.id` must equal `package.document.document.id`
- `package.kind` must be `"document"`
- `package.packageVersion` is separate from `document.version`
- `packageVersion` controls file/app migration
- `document.version` controls authored document schema migration

This intentionally avoids two conflicting ids while the package remains
document-first.

## Parse Rules

Persistence/import must:

- accept `FlowDocPackage v1`
- accept proposal-aligned `FlowDocPackage v2` for parser compatibility
- accept legacy raw `DocumentNode v1`
- normalize the document before editor state receives it
- validate the normalized document with `assertDocument`
- reject invalid JSON
- reject unsupported package versions
- reject unsupported document versions
- reject invalid package identity or shape
- reject invalid document structure

Legacy raw `DocumentNode v1` and `FlowDocPackage v1` import exist for
compatibility with older saved files and test fixtures. New localStorage saves
and JSON exports should write `FlowDocPackage v2`.

## Ownership

`FlowDocPackage` may own app/file metadata:

- file/package version
- package kind
- stable package/document id
- title
- creation/update timestamps
- future migration metadata

`DocumentNode` owns authored document content:

- sections
- page settings
- document nodes
- text and inline field references
- table structure
- authored layout props

`PaginatedDocument` owns computed layout:

- page fragments
- line positions
- measured geometry
- resolved page context

## Forbidden In Package Persistence

Do not store these in `FlowDocPackage`:

- `PaginatedDocument`
- page fragments or line geometry
- browser/server drift reports
- selection, caret, focus, hover, drag, or resize state
- undo/redo stacks
- inline edit drafts
- transient preview geometry
- API response status
- rendered PDF/DOCX bytes

Do not store these yet:

- submitted field data
- data versions
- key-based history
- reviewer comments or workflow state
- repeat-region runtime data

Those are higher layers. They can be added around the package foundation after
the document/editor base is stable.

## Export Rules

Default JSON export from the editor writes `FlowDocPackage v2` with the active
field registry. Package v1 JSON export is no longer exposed in the toolbar.

The editor should:

- use the `.flowdoc.json` extension for package downloads
- derive a safe filename from the document title
- show concise import/export status in the toolbar
- report invalid JSON, unsupported versions, invalid packages, and invalid
  documents as distinct import failures
- surface package v2 registry readiness warnings in the import success status
  without blocking the file from opening

PDF/DOCX export still sends a valid `DocumentNode` through:

```txt
DocumentNode
  -> assertDocument
  -> paginateDocument
  -> assertPaginatedDocument
  -> renderer
```

The package must not make export routes accept computed layout or app state.

## Migration Direction

Package migration should use a single entrypoint, not scattered version checks.

Current direction:

```txt
unknown JSON
  -> parse JSON
  -> migrate package/raw document to current FlowDocPackage
  -> normalize document
  -> assert document
  -> editor receives DocumentNode
```

Current implementation:

- `migratePersistedDocumentPackage(...)`
- migrates legacy raw `DocumentNode v1` into `FlowDocPackage v2` for the
  generic migration path
- migrates `FlowDocPackage v1` into `FlowDocPackage v2`
- parses proposal-aligned `FlowDocPackage v2`
- stays idempotent for existing `FlowDocPackage v2`
- `migratePersistedDocumentPackageToV2(...)`
- migrates legacy raw documents and package v1 into an in-memory
  `FlowDocPackage v2` with an empty `FieldRegistryV1`
- reports missing field definitions as registry warnings during that in-memory
  v2 migration
- keeps existing package v2 input idempotent while preserving optional
  `data`, `history`, and `migrations` members

Runtime localStorage autosave and default JSON export now use package v2 and
preserve the active field registry.

The field registry contract already exists for validation and package planning.
Persisting a registry in JSON is part of the current package v2 baseline.

The current v2 proposal recommends adding required package-level `fields` first,
while leaving `data` and `history` as optional/deferred layers.

## Test Expectations

Persistence/package changes should cover:

- package parse success
- package v2 parse success
- package v2 registry warning propagation
- package v2 registry warning import status
- package v2 registry hard-error rejection
- legacy raw document import
- package serialize/export shape
- localStorage package v2 save/load
- localStorage package v2 field registry preservation
- default package v2 JSON export with field registry preservation
- legacy raw document -> package migration
- package v1 idempotent migration
- legacy raw document -> package v2 in-memory migration
- package v1 -> package v2 in-memory migration
- package v2 migration idempotence
- localStorage save/load
- safe JSON export filename generation
- inline `fieldRef` preservation through package export/import
- import success/failure status messages
- normalize before editor state
- invalid JSON
- unsupported package version
- unsupported document version
- invalid package identity
- invalid document structure

Current coverage lives in:

- `src/app/editor/_components/__tests__/documentPersistence.test.ts`

Run:

- Windows PowerShell: `npm.cmd run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
- Non-Windows: `npm run test:app -- src/app/editor/_components/__tests__/documentPersistence.test.ts`
