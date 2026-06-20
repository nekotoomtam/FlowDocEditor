# Node Model vNext Prototype Adapter Plan

Status: Phase 4 design baseline for Node Model vNext.

Use this document after `docs/NODE_MODEL_VNEXT_PACKAGE_SCHEMA_BOUNDARY_PLAN.md`
when mapping current/prototype document shapes, graph facts, placement
operations, and editor operation commands into vNext without letting prototype
names become the final model.

This is a design plan. It does not implement a runtime adapter yet.

## Request

The owner wants to rebuild the node relationship model deliberately while
reusing useful prototype work where it helps. Phase 4 defines how current v1/v2
evidence can feed vNext implementation without dragging old semantics forward.

Request-to-plan trace:

```text
User request
  -> Node Model vNext Plan
    -> Phase 4: prototype adapter plan
      -> Job item: map prototype concepts to vNext concepts and define adapter
         exit rules
        -> Execution step: write this plan
```

Current position:

- Request: continue from package/schema boundary into adapter design.
- Plan: Node Model vNext Plan.
- Phase: Phase 5.5, extractable workspace.
- Job item: create a temporary vNext home that can move to a new repository.
- Status: done.
- Why this item is current: Phase 3 decided document v3 inside package v2; now
  vNext has an adapter strategy, a first schema/graph implementation slice, and
  a standalone workspace boundary for future repo extraction.
- Next transition: Phase 6, product fixture migration inside
  `vnext-workspace/`.

## Evidence

Useful prototype evidence:

- `packages/core/src/document/documentV2.ts` defines `DocumentGraphIndexV2`
  with node, section, parent, child, root, table descendant, row/cell, and
  capability indexes.
- `buildDocumentGraphIndexV2(...)` validates duplicate ids, child references,
  allowed child types, table grid shape, flow-row width totals, cycles, and
  orphan nodes.
- `NODE_CAPABILITIES_V2` proves the project already benefits from central
  capability data.
- `getDocumentGraphSiblingContextV2(...)` and
  `getDocumentGraphChildrenV2(...)` prove operation code should query graph
  facts instead of traversing each feature separately.

Prototype constraints that must not leak:

- `packages/core/src/schema/documentV2.ts` still includes final-looking v2 node
  names `body`, `flow-row`, `flow-stack`, `paragraph`, and `flow-table`.
- `NodeParentRole` in `documentV2.ts` still exposes `body`, `flow-row`,
  `flow-stack`, `flow-table`, `flow-table-row`, and `flow-table-cell`.
- `adaptDocumentV2ToCurrentDocument(...)` adapts v2 back to current runtime
  `version: 1`, including body roots to `stack` and flow-table descendants back
  into a nested compatibility table.
- `packages/core/src/placement/types.ts` has a useful drag/drop pipeline, but
  its operation container types are `body`, `stack`, and `flow-stack`.
- `src/app/editor/_components/operations/editorOperationTypes.ts` still has
  operation kinds and commands such as `paragraph.split`,
  `paragraph.merge`, `flow-row.structure.patch`, and
  `flow-row.layout.patch`.
- `src/app/editor/_components/operations/editorOperationFromAction.ts` states
  that the current mapper bridges legacy reducer actions into operation
  architecture.

Conclusion:

```text
The prototype has valuable graph, validation, placement, and operation lessons.
The adapter must translate those lessons into vNext terms and make old terms
unobservable from vNext graph/operation APIs.
```

## Adapter Principle

Adapters are migration tools, not architecture.

Allowed adapter lanes:

```text
Persisted v1/v2 input
  -> migrateDocumentToVNext
  -> DocumentNode.version = 3
  -> buildRelationshipGraphVNext
```

```text
DocumentNode.version = 3
  -> temporary compatibility adapter
  -> current runtime only where vNext-native code does not exist yet
```

```text
Current/v2 prototype graph
  -> graph-fact adapter
  -> vNext graph comparison tests
```

Not allowed:

```text
vNext API
  -> exposes paragraph/flow-row/flow-stack/body as final concepts
```

## Concept Mapping

| Prototype/current concept | vNext concept | Adapter rule |
|---|---|---|
| `DocumentNode.version = 1` | migration input | Parse only; never author new v1 from vNext |
| `DocumentNode.version = 2` | migration/prototype input | Convert to document v3 before graph ownership |
| section | section | Preserve id/page/meta where valid |
| `section.roots.body` | `zone role=body` | Create an explicit zone node |
| `section.roots.header` | `zone role=header` | Create an explicit zone node |
| `section.roots.headerFirstPage` | `zone role=first-page-header` | Create an explicit zone node |
| `section.roots.footer` | `zone role=footer` | Create an explicit zone node |
| `section.roots.footerFirstPage` | `zone role=first-page-footer` | Create an explicit zone node |
| `body` | zone container | Do not expose `body` as a block node |
| `stack` root | zone container or column input | Migrate by parent context |
| `row` | legacy layout input | Migrate to `columns` only when safe; otherwise emit warning/error |
| `paragraph` | `text-block` | Infer role from paragraph props |
| paragraph `headingLevel` | `text-block role=heading` | Move level into role metadata |
| paragraph list props | `text-block role=list-item` | Move list metadata into role metadata |
| paragraph normal text | `text-block role=paragraph` | Preserve inline children and style intent |
| `flow-row` | `columns` | Preserve gap/minHeight and convert child order to `columnIds` |
| `flow-stack` | `column` | Preserve width share and child order |
| `flow-table` | `table` | Preserve columns, props, row order, and table grid semantics |
| `flow-table-row` | `table-row` | Preserve row order and cell order |
| `flow-table-cell` | `table-cell` | Preserve span, merge, style, and block children |
| `toc` | `toc` | Keep authored config only |
| `page-break` | `page-break` | Preserve as utility block |
| `divider` | `divider` | Preserve as utility block |
| `spacer` | `spacer` | Preserve as utility block |
| current inline `fieldRef` | vNext `field-ref` | Preserve field key and fallback semantics |

## Text-Block Role Inference

`paragraph` migration should produce `text-block`, not a renamed paragraph.

Suggested inference:

```text
if paragraph.props.list exists
  -> text-block role=list-item
else if paragraph.props.headingLevel exists
  -> text-block role=heading(level)
else
  -> text-block role=paragraph
```

Rules:

- Preserve inline children in authored order.
- Preserve style references and overrides, but move role-owned fields out of
  generic style where vNext defines role metadata.
- Do not create separate `heading` or `list-item` node types.
- If a paragraph has conflicting heading and list metadata, migrate to
  `text-block role=list-item` and emit a warning unless owner decides a stricter
  error rule.

## Zone Migration

Current v2 roots are ids in `section.roots`. vNext should make zones explicit.

Suggested vNext section shape:

```ts
type SectionNodeVNext = {
  id: string;
  type: "section";
  page: PageSettings;
  zoneIds: string[];
};
```

Each zone owns:

```ts
type ZoneNode = {
  id: string;
  type: "zone";
  role:
    | "body"
    | "header"
    | "footer"
    | "first-page-header"
    | "first-page-footer";
  childIds: string[];
};
```

Adapter rules:

- Create one body zone per section.
- Create optional header/footer zones only when roots exist or document settings
  require an authored empty zone.
- Preserve existing root ids when they are valid and unambiguous, or create new
  zone ids with migration issues recording the source root.
- Do not represent zones as `stack`, `body`, or `flow-stack` in vNext graph
  output.

## Columns Migration

`flow-row` and `flow-stack` are the prototype proof for cross-page columns.
vNext should translate them into `columns` and `column`.

Adapter rules:

- `flow-row.childIds` becomes `columns.columnIds`.
- each `flow-stack` child becomes a `column`.
- `flow-stack.props.widthShare` becomes the column width policy or share.
- the sum-to-100 validation remains useful, but the vNext issue code should be
  `invalid-columns-width`, not `flow-row width`.
- `flow-stack.props.box` should be preserved only if vNext column styling
  explicitly accepts box styling; otherwise emit a warning and preserve it in a
  migration metadata path until the styling decision is made.
- nested columns should be rejected or warned in the first slice unless the
  product anchor needs them.

## Table Migration

The current flattened v2 table graph is good evidence. vNext should keep the
flattened relationship pattern while renaming concepts.

Adapter rules:

- `flow-table.rowIds` becomes `table.rowIds`.
- `flow-table-row.cellIds` becomes `table-row.cellIds`.
- `flow-table-cell.childIds` remains block child ownership.
- `tableByDescendantId` maps to nearest table context in the vNext graph.
- `rowByCellId` maps to nearest table-row context in the vNext graph.
- Existing table grid resolution may be reused behind a vNext wrapper if input
  and diagnostics are translated.
- vNext diagnostics must use `table`, `table-row`, and `table-cell` terms.

## Placement Adapter

The current placement pipeline is valuable:

```text
pointer -> geometry -> zone -> intent -> law -> operation -> transform
```

vNext should keep the pipeline but replace operation vocabulary.

Mapping direction:

| Current placement | vNext placement |
|---|---|
| `PlacementTarget.kind = "node"` | typed graph target |
| `row-outer-top/bottom` | columns boundary target |
| `row-stack-inner` | column inner target |
| `parentType: "body"` | parent ref kind `zone` |
| `parentType: "stack"` | legacy parent context only |
| `parentType: "flow-stack"` | parent ref kind `column` |
| `expand-row-left/right` | columns add-column or wrap operation |
| `insert-stacks-into-row` | columns insert-columns operation |
| `move-flow-stack-into-row` | move column operation |
| `wrap-in-row-left/right` | wrap block in columns operation |

Rules:

- The vNext drop result should return a graph parent ref, not a string
  `parentType`.
- Drop decisions should cite capability and invariant issue codes.
- UI hover geometry may still use similar zones, but semantic law must come
  from `NodeRelationshipGraph`.

## Operation Adapter

Current operation architecture is a useful migration shell, but vNext operation
names should not be `paragraph` or `flow-row`.

Suggested vNext operation groups:

| Current operation kind | vNext operation direction |
|---|---|
| `paragraph.split` | `text-block.split` |
| `paragraph.merge` | `text-block.merge` |
| `text.commit` | `text-block.text.commit` or `text.commit` targeting a text-block |
| `style.patch` paragraph variants | `text-block.style.patch` |
| `flow-row.structure.patch` | `columns.structure.patch` |
| `flow-row.layout.patch` | `columns.layout.patch` |
| `table.structure.patch` | `table.structure.patch` |
| `node.delete` | graph-backed `node.delete` |
| `node.duplicate` | graph-backed `node.duplicate` |
| `node.reorder` | graph-backed `node.reorder` |
| `drag.placement` | graph-backed `placement.commit` |
| `document.settings.patch` | `section.settings.patch` or `document.settings.patch` by scope |

Adapter rules:

- UI action snapshots may remain for compatibility, but vNext operation command
  must be semantic and graph-backed.
- Operation plans must carry graph source, parent ref, validation scope,
  history scope, render invalidation scope, and migration diagnostics.
- Reducer commit adapters may remain temporarily, but semantic validity must be
  decided before commit.
- Durable operation history should record vNext operation vocabulary, not
  compatibility action names.

## Graph Adapter

The v2 graph is a prototype index. vNext graph should be richer and differently
named.

Mapping direction:

| v2 graph fact | vNext graph fact |
|---|---|
| `nodeById` | `nodesById` |
| `sectionById` | `sectionByNodeId` |
| `parentById` | typed `parentByNodeId` |
| `childrenById` | `childrenByNodeId` |
| `rootBySectionAndRole` | `zonesById` plus section zone order |
| `tableByDescendantId` | nearest context `tableId` |
| `rowByCellId` | nearest context `tableRowId` |
| `capabilitiesByType` | vNext capabilities by final node type |

Adapter rules:

- Tests may compare v2 graph behavior to vNext graph behavior.
- vNext graph API must never return `NodeParentRole = "flow-row"` or
  `operationSurface = "flow-row"`.
- vNext graph diagnostics should use new issue codes:
  `invalid-zone-role`, `invalid-columns-width`, `invalid-table-grid`,
  `invalid-role-metadata`, and `editor-state-persisted`.

## Compatibility Bridge Exit Criteria

The compatibility bridge can exist only while these are true:

- vNext schema or graph implementation is incomplete;
- current runtime cannot yet edit vNext documents directly;
- behavior parity is being measured against existing product-report-v2 and
  focused operation tests;
- every bridge entrypoint is named as a compatibility adapter.

The bridge must be retired when:

- editor runtime can consume document v3 graph facts for the relevant operation
  group;
- product-report-vNext fixture exists for that operation group;
- tests prove vNext operation behavior without adapting back to v1 runtime.

## Tests And Gates

Phase 5 should start with tests that make the adapter boundary executable:

1. migrate a minimal v2 body root to vNext section plus body zone.
2. migrate paragraph heading/list/normal nodes to text-block roles.
3. migrate flow-row/flow-stack to columns/column.
4. migrate flow-table graph to table/table-row/table-cell.
5. build vNext graph facts without prototype node names.
6. reject or warn legacy row/stack inputs according to parent context.
7. prove operation command mapping from paragraph/flow-row names to text-block
   and columns vocabulary.

Browser smokes should wait until a real vNext runtime path exists.

## Phase Map

Parent goal:

- Reuse prototype lessons while preventing prototype node names and runtime
  compromises from becoming the vNext source of truth.

Current job lane:

- Prototype adapter design.

| Phase | Goal | Scope | Done criteria | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Evidence check | Docs/code reading | v2 graph, schema, placement, operation, and runtime adapter constraints are identified | done | this document |
| 2 | Concept mapping | Docs | Prototype-to-vNext concept mapping is explicit | done | this document |
| 3 | Adapter lane design | Docs | Import, runtime compatibility, graph comparison, placement, and operation adapters have boundaries | done | this document |
| 4 | Exit criteria | Docs | Conditions for retiring compatibility bridges are explicit | done | this document |
| 5 | First implementation slice | Core schema/graph/tests | Minimal vNext schema and graph tests prove zones/text-block/columns basics | done | `packages/core/src/schema/documentVNext.ts`; `packages/core/src/document/documentVNext.ts`; `packages/core/src/document/documentVNext.test.ts` |
| 5.5 | Extractable workspace | Repo structure/docs/tests | vNext has a temporary home that can move to a new repository | done | `vnext-workspace/README.md`; `vnext-workspace/docs/WORKSPACE_BOUNDARY.md`; `vnext-workspace/tests` |
| 6 | Product fixture migration | Fixture/tests/smoke | product-report-vNext becomes the product anchor | next | `vnext-workspace/fixtures/product-report-vnext-minimal.flowdoc.json` |

## Stop Conditions

Stop for owner review before:

- implementing broad runtime conversion;
- silently adapting vNext saves back to v1 as the primary authored truth;
- accepting legacy `row` / `stack` migration rules that lose structure;
- deciding column box styling or nested columns without product evidence;
- changing durable history semantics;
- changing package envelope version;
- deleting current v2/product-report-v2 coverage.

Continue autonomously when:

- adding narrow migration tests;
- drafting vNext schema skeletons;
- adding graph diagnostics tests;
- writing adapter comparison tests;
- linking docs and updating phase maps.

## Decision Rule

When reuse conflicts with model clarity, prefer:

1. vNext node vocabulary;
2. explicit graph facts;
3. migration diagnostics;
4. temporary compatibility with named exit criteria;
5. product anchor evidence;
6. old runtime convenience only behind adapters.

Do not call a prototype name "vNext" just because current code already supports
it.
