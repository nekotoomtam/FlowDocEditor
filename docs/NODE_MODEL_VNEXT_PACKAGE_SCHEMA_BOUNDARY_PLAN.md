# Node Model vNext Package/Schema Boundary Plan

Status: Phase 3 design baseline for Node Model vNext.

Use this document after `docs/NODE_MODEL_VNEXT_CONTRACT.md` and
`docs/NODE_RELATIONSHIP_GRAPH_VNEXT_PLAN.md` when deciding persisted schema
versioning, package envelope compatibility, migration APIs, fixture shape, and
adapter boundaries for vNext.

This is a boundary contract, not an implementation patch. It does not change
runtime save/load behavior by itself.

## Request

The owner accepted a semi-rebuild direction for the node model. Phase 1 locked
the vNext node vocabulary. Phase 2 locked the relationship graph. Phase 3
decides where that model sits relative to persisted packages and migration.

Request-to-plan trace:

```text
User request
  -> Node Model vNext Plan
    -> Phase 3: package/schema boundary and migration strategy
      -> Job item: decide document version, package version, migration inputs,
         and adapter stance
        -> Execution step: write this plan
```

Current position:

- Request: keep stepping back from the prototype before implementation.
- Plan: Node Model vNext Plan.
- Phase: Phase 3, package/schema boundary and migration strategy.
- Job item: define versioning and migration ownership.
- Status: done.
- Why this item is current: the node set and graph are explicit, but vNext
  needs a stable persisted boundary before adapters or implementation slices.
- Next transition: Phase 4, prototype adapter plan, captured in
  `docs/NODE_MODEL_VNEXT_PROTOTYPE_ADAPTER_PLAN.md`.

## Evidence

Current package contract:

- `docs/FLOWDOC_PACKAGE_CONTRACT.md` says `packageVersion` and
  `document.version` are separate migration axes.
- `docs/FLOWDOC_PACKAGE_CONTRACT.md` says valid `FlowDocPackage v2` may carry
  either `DocumentNode.version = 1` or `DocumentNode.version = 2` during the
  transition.
- `docs/FLOWDOC_PACKAGE_CONTRACT.md` says the package is an app/file boundary,
  not a layout engine input.

Current document v2 contract:

- `docs/DOCUMENT_MODEL_V2_CONTRACT.md` says Document Model v2 is a document
  schema migration, not a package-envelope redesign.
- `docs/DOCUMENT_MODEL_V2_CONTRACT.md` says `FlowDocPackage v3` is not
  required unless the package envelope itself changes.
- `docs/DOCUMENT_MODEL_V2_CONTRACT.md` lists package id semantics, `fields`,
  `data`, and package-level metadata shape as examples that would justify a
  package version bump.

Current implementation:

- `src/app/editor/_components/documentPersistence.ts` defines
  `CURRENT_DOCUMENT_VERSION = 1`, `NEXT_DOCUMENT_VERSION = 2`, and
  `CURRENT_PACKAGE_VERSION = 2`.
- `createAuthoredDocumentPackageV2(...)` writes a package v2 envelope while
  calling `migrateDocumentToV2(...)` for the document.
- `parsePackageV2DocumentV2MigrationValue(...)` accepts package v2 containing
  document v2.
- `parsePersistedDocumentV2RuntimeValue(...)` adapts document v2 back through
  `adaptDocumentV2ToCurrentDocument(...)` before editor runtime receives it.
- `packages/core/src/document/documentV2.ts` implements
  `migrateDocumentToV2(...)`, which normalizes the current document and returns
  `version: 2`.

Conclusion:

```text
The current project already supports independent package and document schema
versioning. vNext should continue that split instead of treating node-model
change as a package-envelope rewrite.
```

## Decision Baseline

vNext is a new authored document schema version.

Recommended target:

```ts
DocumentNode.version = 3
```

Rationale:

- vNext changes authored node semantics: `paragraph` becomes `text-block`,
  `flow-row` becomes `columns`, `flow-stack` becomes `column`, `flow-table`
  becomes `table`, and root-like body/header/footer containers become `zone`.
- vNext changes relationship semantics: zones, typed parents, typed selection,
  typed drop targets, graph scopes, and operation surfaces become first-class.
- These are document schema changes, not package envelope changes.

Package envelope should remain:

```ts
FlowDocPackage.packageVersion = 2
```

unless package-level fields change.

Valid transition shape:

```text
FlowDocPackage v2
  -> fields: FieldRegistryV1
  -> data?: DataSnapshotV1
  -> document: DocumentNode v1 | DocumentNode v2 | DocumentNode v3
```

`FlowDocPackage v3` should be reserved for package envelope changes, not node
renaming.

## Package Version Bump Rules

Do not bump `FlowDocPackage.packageVersion` when:

- changing authored node type names;
- changing authored containment rules;
- adding zones inside the document;
- adding graph-only concepts that are derived at runtime;
- changing operation planning;
- changing editor selection/drop state;
- changing pagination invalidation strategy;
- changing fixtures from v2 to vNext.

Bump `FlowDocPackage.packageVersion` only when the package envelope changes:

- package id semantics change;
- `kind` semantics change;
- `meta` shape changes incompatibly;
- `fields` is replaced or becomes a new major version;
- `data` is replaced or becomes a new major version;
- package-level `history` or `migrations` becomes normative with a fixed
  incompatible shape;
- non-document payloads become valid siblings of `document`.

## Document Version Bump Rules

Bump `document.version` when authored document JSON changes:

- node type set changes;
- parent/child fields change;
- section/zone ownership changes;
- table row/cell structure changes;
- inline node model changes;
- semantic roles move between node types and metadata;
- persisted validation invariants change.

For vNext, the target is document v3 because the authored model is no longer a
compatible extension of v2.

## Migration Inputs

vNext import should accept these inputs:

| Input | Role | Behavior |
|---|---|---|
| Raw `DocumentNode v1` | Legacy import | Parse, normalize, migrate to v3, surface warnings |
| `FlowDocPackage v1` with document v1 | Legacy package import | Convert package to v2 envelope, migrate document to v3 |
| `FlowDocPackage v2` with document v1 | Current compatibility input | Migrate document to v3 |
| `FlowDocPackage v2` with document v2 | Prototype evidence input | Migrate/adapt document to v3 |
| Raw `DocumentNode v2` | Fixture/prototype input | Migrate document to v3 through explicit migration API |
| `FlowDocPackage v2` with document v3 | Canonical vNext package | Parse and validate as vNext |

Unsupported inputs should fail with structured reasons, not silent repair.

## Migration API Direction

vNext should introduce explicit migration functions rather than extending the
v2 adapter invisibly.

Suggested API shape:

```ts
type DocumentMigrationIssue = {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

type DocumentVNextMigrationResult =
  | { ok: true; document: DocumentNodeVNext; issues: DocumentMigrationIssue[] }
  | { ok: false; reason: "unsupported-version" | "invalid-document"; issues: DocumentMigrationIssue[] };

function migrateDocumentToVNext(input: DocumentNode | DocumentNodeV2): DocumentVNextMigrationResult;
function assertDocumentVNext(input: unknown): asserts input is DocumentNodeVNext;
function buildRelationshipGraphVNext(document: DocumentNodeVNext): NodeRelationshipGraph;
```

The first implementation may use narrower names such as `DocumentNodeV3`, but
the boundary should remain "vNext document schema in, vNext graph out".

## Adapter Stance

Adapters are allowed during migration, but they must be named as adapters and
must not become the final source of truth.

Allowed:

- `migrateDocumentToVNext(...)` from v1/v2/prototype inputs.
- A temporary `adaptDocumentVNextToCurrentDocument(...)` only when the current
  runtime still cannot consume vNext directly.
- A read-only graph adapter that maps prototype nodes into vNext graph facts
  for comparison tests.

Not allowed as final architecture:

- saving vNext documents while the editor secretly edits v1 runtime state;
- exposing `paragraph`, `flow-row`, `flow-stack`, or `flow-table` as vNext
  concepts from graph queries;
- treating package metadata as layout/render/export truth;
- adding another adapter layer without an exit plan.

## Runtime Boundary

Final vNext target:

```text
persisted package v2
  -> document v3
    -> assertDocumentVNext
    -> buildRelationshipGraphVNext
      -> operation planning
      -> editor selection/drop
      -> history scope
      -> pagination/export invalidation
```

Temporary bridge target:

```text
persisted package v2
  -> document v3
    -> migrate/adapt for old runtime only where necessary
    -> compare against graph facts in tests
```

The bridge exists to reduce implementation risk. It is not the acceptance
target.

## History Boundary

The owner clarified that history matters beyond simple undo/redo.

Phase 3 does not define final history storage. It does define the boundary:

- authored document history scopes belong to document/graph/operation layers;
- package-level `history` remains optional/unknown unless a separate package
  envelope decision makes it normative;
- changing the package-level `history` shape is a package version decision;
- operation history entries should cite graph scope and migration version once
  vNext operations are implemented.

## Fixture Boundary

`product-report-v2` remains the product anchor until a vNext fixture exists.

Next fixture direction:

```text
public/mock/product-report-vnext.flowdoc.json
  packageVersion: 2
  document.version: 3
  fields: FieldRegistryV1
  data: DataSnapshotV1
```

The fixture should prove:

- zones for body/header/footer/first-page areas;
- text-block roles for paragraph, heading, list-item, label, caption, or note;
- columns/column summary layout;
- table/table-row/table-cell detail layout;
- inline field-ref and page-number;
- migration warnings are visible when generated from v1/v2 inputs.

## Tests And Gates

Phase 4 and later should add focused tests in this order:

1. vNext schema accepts a tiny document v3 package inside package v2.
2. vNext schema rejects prototype node names as final vNext nodes.
3. v1/v2 migration produces text-block, zone, columns, and table nodes.
4. relationship graph builds from the migrated vNext document.
5. package v2 with document v3 round-trips through parse/serialize helpers.
6. product-report-vNext fixture passes schema and graph assertions.

Browser smokes should wait until the editor has a real vNext runtime or a
clearly marked bridge path.

## Phase Map

Parent goal:

- Replace prototype-driven node architecture with a relationship-first node
  model without confusing document schema changes with package envelope changes.

Current job lane:

- Package/schema boundary design.

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Evidence check | Docs/code reading | Current package/document version split is verified | done | package contract, document v2 contract, `documentPersistence.ts` |
| 2 | Boundary decision | Docs | vNext target document version and package envelope rule are explicit | done | this document |
| 3 | Migration API plan | Docs | Migration inputs, output shape, adapter stance, and error surface are explicit | done | this document |
| 4 | Prototype adapter plan | Docs/tests | v2/current runtime adapters are mapped to vNext without leaking prototype names | done | `docs/NODE_MODEL_VNEXT_PROTOTYPE_ADAPTER_PLAN.md` |
| 5 | Schema skeleton | Core/tests | Minimal document v3 type/schema/assertion exists | done | `packages/core/src/schema/documentVNext.ts`; `packages/core/src/document/documentVNext.test.ts` |
| 5.5 | Extractable workspace | Repo structure/docs/tests | vNext package/schema work has a temporary standalone home | done | `vnext-workspace/README.md`; `vnext-workspace/src/persistence/package.ts`; `vnext-workspace/tests/packageFixture.test.ts` |
| 6 | Product fixture | Fixture/tests/smoke | Product-report vNext fixture exists and becomes the acceptance anchor | next | fixture and smoke evidence |
| 7 | Persistence parser slice | App/core tests | Package v2 with document v3 parses and serializes intentionally outside the app runtime first | pending | persistence tests |

## Stop Conditions

Stop for owner review before:

- implementing `DocumentNode.version = 3` in runtime code;
- changing `FlowDocPackage.packageVersion`;
- making package-level `history` normative;
- changing field registry or data snapshot major versions;
- removing v1/v2 import support;
- removing product-report-v2 coverage before product-report-vNext coverage
  exists;
- claiming editor runtime is vNext-native while it still depends on a current
  runtime adapter.

Continue autonomously when:

- refining the boundary doc;
- linking docs;
- drafting adapter plans;
- writing non-runtime schema examples;
- adding tests that assert docs-level fixture shape without changing runtime
  save/load behavior.

## Decision Rule

When a versioning choice is unclear, decide in this order:

1. authored document schema clarity;
2. package compatibility;
3. explicit migration diagnostics;
4. graph facts as runtime truth;
5. field/data continuity;
6. product-report workflow evidence;
7. adapter removability.

Do not create `FlowDocPackage v3` just because vNext changes node names.
