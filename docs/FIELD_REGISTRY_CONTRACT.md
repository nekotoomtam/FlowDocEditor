# Field Registry Contract

This contract defines the first stable meaning of field keys in FlowDocEditor.
It is the foundation for future data snapshots, key-based history, reviewer
views, and WYSIWYG editing rules that must preserve structured fields.

Use this document when changing field palettes, `fieldRef` behavior, binding,
package migration, data snapshots, or future key-history work.

## Decision

`fieldRef.key` is the authored document's reference to a package-level field
definition.

Current package v2 JSON persists `FieldRegistryV1` next to the document.
The editor treats that package registry as the active field source for authoring
and Fill mode. Legacy/package v1 inputs still fall back to the sample editor
registry so older fixtures can open.

## Shape

The registry contract is versioned separately from `DocumentNode`:

```ts
type FieldValueType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "enum"
  | "image"
  | "collection"

interface FieldDefinitionV1 {
  key: string
  fieldType: FieldValueType
  label?: string
  required?: boolean
  fallback?: string
  description?: string
  source?: string
  options?: { value: string; label?: string }[]
}

interface FieldRegistryV1 {
  version: 1
  fields: FieldDefinitionV1[]
}
```

Current implementation:

- `packages/core/src/fieldRegistry/index.ts`
- sample editor fallback data: `src/app/_lib/fieldRegistry.ts`
- active editor field palette: `src/app/editor/_components/FieldPalette.tsx`

## Key Rules

A field key is stable data identity, not a visual label or node id.

- Keys should be dotted paths such as `customer.name` or `invoice.total`.
- Keys must be unique within one registry.
- Labels may change without changing identity.
- Moving a `fieldRef` to another paragraph or table cell does not change the
  field identity.
- Renaming a key is a future migration/history event, not a plain text edit.

Deferred:

- key aliases
- key rename migrations
- scoped keys for repeat regions
- collection item identity

## Relationship To DocumentNode

`DocumentNode` keeps only authored document structure.

`fieldRef` remains small:

```ts
interface FieldRefInline {
  id: string
  type: "fieldRef"
  key: string
  label?: string
  fallback?: string
}
```

Do not add registry metadata, field values, history entries, validation status,
or rendered values into `fieldRef` nodes.

The field type belongs to the registry, not to the inline node.

## Inline Field Rules

Inline `fieldRef` may target scalar display fields:

- `text`
- `number`
- `date`
- `boolean`
- `enum`

Inline `fieldRef` must not target:

- `image`
- `collection`

Those field types need different authoring/rendering behavior and remain future
work. The placement law already prevents `image` and `collection` fields from
being inserted as inline text fields.

## Validation Policy

Registry validation is separate from binding.

Current binding remains descriptive and non-strict: a `fieldRef` can still
resolve from data even when the registry does not define the key. This preserves
existing preview/export behavior.

Validation helpers should report:

- duplicate registry keys as `error`
- `fieldRef` keys missing from the registry as `warning`
- inline `fieldRef` targets whose registry type is `image` or `collection` as
  `error`

Current implementation:

- `collectDocumentFieldRefs(...)`
- `validateFieldRegistryReferences(...)`
- `hasFieldRegistryErrors(...)`

## Authoring UX Rules

Field authoring should use the active package registry, not a hard-coded sample
list, once a package v2 registry is available.

The editor should:

- list active registry fields in the Field palette
- preserve the selected field key/label/fallback when a field is placed into a
  paragraph or table-cell paragraph
- show selected paragraph/table-cell `fieldRef` details in the property panel
- keep missing registry definitions as non-blocking readiness warnings for now
- avoid adding registry type, value, history, or validation state into
  `fieldRef`

This keeps the base document/data placement path open for future registry
management and publish validation without introducing those workflows now.

## Ownership

Future package versions may own:

- field registry version
- field definitions
- data snapshots
- key history
- migration metadata

`DocumentNode` owns:

- authored field references
- document structure
- table/text/layout props

Binding owns:

- temporary resolved documents for preview/export
- field value lookup
- fallback text behavior

Editor runtime owns:

- selection
- caret
- hover
- active edit state
- drag/resize previews

None of the editor runtime state belongs in the registry.

## Package Direction

`FlowDocPackage v1` intentionally remains document-first and does not persist the
registry.

The current package direction is:

```txt
FlowDocPackage v2
  -> package metadata
  -> document: DocumentNode
  -> fields: FieldRegistryV1
  -> data?: DataSnapshotV1
  -> key history (deferred)
```

Adding `fields` to a package is a package migration decision, not a
`DocumentNode` schema change.

The current package v2 contract makes package-level `fields` required and keeps
`data?: DataSnapshotV1` optional for document-bound value placement. Key history
remains deferred until its runtime and UX contract is ready.

Data snapshot value rules live in `docs/DATA_SNAPSHOT_CONTRACT.md`.

## Test Expectations

Field registry changes should cover:

- collecting fieldRefs from normal paragraphs
- collecting fieldRefs from table-cell paragraphs
- registered scalar inline fields pass without issues
- duplicate registry keys produce errors
- missing definitions produce warnings, not binding failures
- `image` and `collection` registry definitions cannot be inline field targets
- sample editor palette definitions stay compatible with the core registry
- readiness reports combine registry issues with document-scoped snapshot issues
  definition shape

Current coverage lives in:

- `packages/core/src/fieldRegistry/index.test.ts`
- `packages/core/src/binding/index.test.ts`
- `packages/core/src/document/operations.test.ts`
- `src/app/editor/_components/__tests__/documentPersistence.test.ts`

Run:

- Windows PowerShell:
  `npm.cmd run test -w packages/core -- src/fieldRegistry/index.test.ts`
- Non-Windows:
  `npm run test -w packages/core -- src/fieldRegistry/index.test.ts`
