# Data Snapshot Contract

This contract defines the first stable shape for field values outside the
authored document.

Use this document when changing field value storage, filling behavior, binding
preview, package data payloads, or future key history.

## Decision

Field values belong outside `DocumentNode`.

`DocumentNode` stores authored structure and `fieldRef.key` references.
`DataSnapshot` stores current values for those keys. Binding combines a
template document and a data snapshot into a temporary resolved document for
preview/export.

The current package use is document-bound data placement only: save/open should
restore the current values into the same field keys. It is not a review,
submission, audit, or history layer.

## Shape

Phase D starts with scalar values only:

```ts
type FieldScalarValue = string | number | boolean | null

interface DataSnapshotV1 {
  version: 1
  updatedAt: string
  values: Record<string, FieldScalarValue>
}
```

Current implementation:

- `packages/core/src/dataSnapshot/index.ts`
- `src/app/editor/_components/documentPersistence.ts` for optional package v2
  persistence

## Ownership

| Data | Owner |
|---|---|
| Field references and document structure | `DocumentNode` |
| Field definitions and required/type rules | `FieldRegistryV1` |
| Current scalar field values | `DataSnapshotV1` |
| Temporary resolved text | binding output |
| Key change log | future key history |
| Selection/caret/hover/undo/drag | editor runtime |

Do not write resolved field values back into template paragraphs.

## Value Rules

Scalar snapshot values are validated against registry field types:

- `text`: string or null
- `number`: finite number or null
- `date`: string or null
- `boolean`: boolean or null
- `enum`: string or null, optionally checked against registry options

`image` and `collection` are not supported by scalar data snapshots yet. They
need separate payload/repeat-region contracts.

## Validation Policy

Data snapshot validation is a readiness check, not document validity.

Validation helpers should report:

- unknown snapshot keys as `warning`
- missing required values as `warning`
- invalid scalar value types as `error`
- enum values outside configured options as `error`
- `image` or `collection` values in scalar snapshots as `error`

Current implementation:

- `validateDataSnapshot(...)`
- `hasDataSnapshotErrors(...)`

## Package Direction

`FlowDocPackage v1` does not persist data snapshots.

`FlowDocPackage v2` may persist an optional `data?: DataSnapshotV1` member.
This stores the current scalar values needed to restore Fill mode and resolved
document preview for the same package.

This must stay narrow:

- persist only the current scalar snapshot
- keep values outside `DocumentNode`
- do not write resolved field values back into template paragraphs
- do not add key history, reviewer state, submissions, approvals, or actor
  identity in this layer

## Binding Direction

Binding now accepts:

```txt
DocumentNode template
  + FieldRegistryV1
  + DataSnapshotV1
  -> temporary resolved DocumentNode
```

Current implementation:

- `bindDocumentWithSnapshot(...)`
- `assessDocumentDataReadiness(...)`

The resolved document is for preview/export only. It must not replace the
template document in storage. The helper returns validation issues alongside
the resolved document so callers can decide whether a warning/error blocks an
action. Snapshot values with validation errors fall back instead of being
rendered into the resolved document.

## Deferred Work

- nested object values
- collection/repeat values
- image/blob payloads
- data-source metadata
- field-level validation messages in the editor UI
- key history entries from value changes
- submitted/reviewer data workflows

## Test Expectations

Data snapshot changes should cover:

- valid scalar values for text/number/date/boolean/enum
- missing required values as warnings
- unknown snapshot keys as warnings
- invalid value types as errors
- invalid enum options as errors
- unsupported image/collection values as errors
- snapshot binding from flat keys into normal paragraphs
- missing snapshot values using fieldRef or registry fallback text
- invalid snapshot values reporting issues and falling back
- document-scoped readiness so unused required registry fields do not warn
- package v2 save/load/export/import preserving `data?: DataSnapshotV1`
- invalid package data snapshot structure rejection

Current coverage lives in:

- `packages/core/src/binding/index.test.ts`
- `packages/core/src/dataSnapshot/index.test.ts`
- `packages/core/src/readiness/index.test.ts`

Run:

- Windows PowerShell:
  `npm.cmd run test -w packages/core -- src/binding/index.test.ts src/dataSnapshot/index.test.ts src/readiness/index.test.ts`
- Non-Windows:
  `npm run test -w packages/core -- src/binding/index.test.ts src/dataSnapshot/index.test.ts src/readiness/index.test.ts`
