# FlowDoc Package V2 Proposal

This proposal describes the intended next package shape for FlowDocEditor. It
is a planning document, not the active runtime format.

Current runtime remains:

```txt
FlowDocPackage v1
  -> document: DocumentNode v1
```

Current implementation status:

- parser compatibility for proposal-aligned package v2 exists
- localStorage saves still write package v1
- JSON export still writes package v1
- package v2 migration is not yet the active default
- scalar data snapshot validation exists outside package persistence
- snapshot binding can resolve a temporary preview document from
  `DocumentNode + FieldRegistryV1 + DataSnapshotV1`
- Fill mode can surface non-blocking registry/snapshot readiness issues
- package v2 registry warnings appear in import success status

The proposed v2 direction adds package-level field registry support first, then
leaves persisted data snapshots and key history as explicit follow-up layers.

## Goals

Package v2 should make the document/key foundation strong enough for future
form-like document workflows.

It should support:

- stable field key identity
- package-level field registry
- validation between document `fieldRef.key` values and registry definitions
- a clear future place for data snapshots
- a clear future place for key history
- migration from document-only package v1

It should not turn the document model into workflow state.

## Non-Goals

This proposal does not implement:

- runtime migration to v2
- localStorage format changes
- editor import/export format changes
- submitted data storage
- key history UI
- reviewer comments
- repeat-region runtime behavior
- WYSIWYG caret or selection behavior

Those remain later phases.

## Proposed Shape

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
  data?: DataSnapshotV1
  history?: KeyHistoryV1
  migrations?: PackageMigrationRecord[]
}
```

Only `fields` is proposed as a required new v2 member. `data`, `history`, and
`migrations` are shown so the package has an agreed place for future layers,
but they should not be made mandatory in the first v2 migration.

## Field Registry

`fields` should use the contract in `docs/FIELD_REGISTRY_CONTRACT.md`.

```ts
interface FieldRegistryV1 {
  version: 1
  fields: FieldDefinitionV1[]
}
```

Package v2 parse/import should:

- require `fields.version === 1`
- require unique registry keys
- validate `document` fieldRefs against the registry
- treat missing registry definitions as warnings in early v2
- reject duplicate registry keys as invalid package structure
- reject inline fieldRefs targeting `image` or `collection`

The early-v2 missing-key policy should remain warning-level so older templates
or hand-authored files can still open. A later authoring mode may choose to block
publish/export when warnings remain.

## Data Snapshot Placeholder

Data snapshots should stay outside `DocumentNode`.

Detailed rules live in `docs/DATA_SNAPSHOT_CONTRACT.md`.

Proposed future shape:

```ts
type FieldScalarValue = string | number | boolean | null

interface DataSnapshotV1 {
  version: 1
  updatedAt: string
  values: Record<string, FieldScalarValue>
}
```

Rules:

- keys in `values` refer to registry keys
- missing values use `fieldRef.fallback`, field definition fallback, or empty
  string depending on the binding policy
- binding must produce a temporary resolved document
- binding must not mutate the template document
- values for `collection` fields need a later repeat-region design

Deferred:

- nested object snapshots
- collection item identity
- data-source metadata
- submitted attachment/image payloads
- per-field validation errors

## Key History Placeholder

Key history should track data identity, not visual position.

Proposed future shape:

```ts
interface KeyHistoryEntryV1 {
  key: string
  oldValue: FieldScalarValue
  newValue: FieldScalarValue
  changedAt: string
  actor?: string
  reason?: string
  documentNodeId?: string
  fieldRefId?: string
}

interface KeyHistoryV1 {
  version: 1
  entries: KeyHistoryEntryV1[]
}
```

Rules:

- `key` is the main identity
- `documentNodeId` and `fieldRefId` are context, not identity
- moving a fieldRef should not erase history
- key rename requires a migration or alias policy before implementation

Deferred:

- key aliases
- reviewer approval state
- comments
- diff grouping
- repeat-region history

## Identity Rules

For v2, keep the v1 identity rule:

- `package.id === package.document.document.id`

This avoids two competing ids while the package remains document-first.

Future workflow systems may introduce submission/review ids, but those should
not replace the package/document identity.

## Ownership

| Data | Owner |
|---|---|
| Package version, title, timestamps | `FlowDocPackage` |
| Field definitions | `FlowDocPackage.fields` |
| Authored sections, paragraphs, tables, fieldRefs | `DocumentNode` |
| Current field values | future `FlowDocPackage.data` |
| Key change log | future `FlowDocPackage.history` |
| Computed page/line geometry | `PaginatedDocument` |
| Selection, caret, hover, drag, undo stack | editor runtime state |
| PDF/DOCX bytes | export response, not package JSON |

## Migration Direction

The current migration path is:

```txt
unknown JSON
  -> parse JSON
  -> migrate package/raw document to current FlowDocPackage
  -> normalize document
  -> assert document
  -> editor receives DocumentNode
```

The proposed v2 migration path should become:

```txt
unknown JSON
  -> parse JSON
  -> migrate package/raw document to FlowDocPackage v2
  -> normalize document
  -> assert document
  -> validate field registry references
  -> editor receives DocumentNode plus package metadata layers
```

V1 to v2 migration should:

- preserve package/document id
- preserve document unchanged except normal existing document normalization
- create an empty registry: `{ version: 1, fields: [] }`
- collect fieldRefs and report missing definitions as warnings
- not invent field definitions silently from fieldRefs unless the user chooses
  an explicit import repair flow
- not add data or history

Legacy raw `DocumentNode v1` migration to v2 should:

- wrap the raw document as a package
- create v2 metadata
- create an empty registry
- preserve legacy document compatibility warnings

## Import And Export Policy

When v2 becomes active:

- new JSON exports should write package v2
- imports should accept v2, v1, and legacy raw `DocumentNode v1`
- v1 imports should migrate to v2 in memory
- localStorage migration should be explicit and tested
- export routes should still receive `DocumentNode`, not the package object
- PDF/DOCX export should not require package v2 unless it needs registry/data
  binding for a specific export mode

## Validation Levels

Early v2 should distinguish validity from readiness:

- Package validity: JSON shape, package version, identity, document validity,
  duplicate registry keys, invalid inline field targets
- Registry readiness: missing definitions for used fieldRefs, unused registry
  definitions
- Data readiness: required fields missing values, invalid value type
- Review readiness: unresolved key changes, missing reviewer approval

Only package validity should block opening a file. Readiness checks can block
publish/export later, but they should be visible and recoverable.

## Test Expectations

When implementation begins, v2 work should cover:

- parse package v2 success
- reject unsupported package versions
- reject duplicate registry keys
- reject inline image/collection fieldRef targets
- warn on missing registry definitions
- migrate v1 package to v2 with empty registry
- migrate legacy raw document to v2 with empty registry
- keep package/document id agreement
- preserve document fieldRefs through migration
- keep PDF/DOCX export routes receiving `DocumentNode`
- keep current binding behavior descriptive until strict readiness checks are
  intentionally enabled

## Open Decisions

These are intentionally deferred until the next phase needs them:

- whether v2 should immediately become the saved localStorage format
- whether export JSON should switch to v2 at the same time as localStorage
- whether missing registry definitions should remain warnings forever or become
  blocking in a template publish mode
- how to represent nested data and collection/repeat values
- how key rename aliases should be represented
- whether data snapshots and history belong in the same package file for every
  workflow, or only in review/submission packages

## Implementation Status And Next Phase

Phase C has started parser compatibility without migrating runtime storage.

Completed Phase C slice:

- add package-level v2 types near the persistence boundary
- add parser tests for package v2 shape
- keep export/localStorage writing v1
- use field registry validation helpers from Phase A

Recommended next implementation phase:

- decide whether to add an explicit package v1 -> v2 migration helper while
  still keeping save/export on v1
- keep export/localStorage writing v1 until migration behavior and UX messaging
  are fully tested

Still not done:

- runtime localStorage migration to v2
- JSON export switch to v2
- data snapshot package persistence
- key history implementation
