import type {
  BodyNode,
  DocumentNode,
  DocumentNodeV2,
  DocumentSection,
  DocumentSectionV2,
  FlowRowNode,
  FlowStackNode,
  FlowTableCellNode,
  FlowTableNode,
  FlowTableNodeV2,
  FlowTableRowNode,
  LayoutNode,
  LayoutNodeV2,
  ParagraphNode,
  SectionRootsV2,
  SpacerNode,
} from "../schema"
import { DocumentNodeV2Schema } from "../schema"
import { getPageMetrics } from "../pagination/metrics"
import { DocumentAssertionError } from "./assert"
import { FlowTableGridError, resolveFlowTableGrid } from "./flowTableGrid"
import { normalizeDocument } from "./normalize"
import {
  addFlowTableColumnToTable,
  addFlowTableRowToTable,
  deleteEmptyFlowTableCellParagraphInTable,
  fitFlowTableColumnsToWidth,
  removeFlowTableColumnFromTable,
  removeFlowTableRowFromTable,
  resizeFlowTableColumnPairInTable,
  updateFlowTableCellSpanInTable,
  type FlowTableCellSpanChanges,
} from "./operations"

export type DocumentV2NodeType = LayoutNodeV2["type"]
export type SectionId = string
export type NodeId = string

export type NodeParentRef =
  | { kind: "section-root"; sectionId: SectionId; root: keyof SectionRootsV2 }
  | { kind: "childIds"; sectionId: SectionId; parentId: NodeId; index: number }
  | { kind: "rowIds"; sectionId: SectionId; tableId: NodeId; index: number }
  | { kind: "cellIds"; sectionId: SectionId; tableId: NodeId; rowId: NodeId; index: number }

export type NodeParentRole =
  | "section-root"
  | "body"
  | "flow-row"
  | "flow-stack"
  | "flow-table"
  | "flow-table-row"
  | "flow-table-cell"

export interface NodeCapabilitiesV2 {
  childrenField?: "childIds" | "rowIds" | "cellIds"
  allowedChildTypes: readonly DocumentV2NodeType[]
  parentRoles: readonly NodeParentRole[]
  layoutRole:
    | "section-root"
    | "block"
    | "flow-row"
    | "flow-stack"
    | "table"
    | "table-row"
    | "table-cell"
    | "generated-block"
  operationSurface: "document" | "flow-row" | "table" | "inline"
  canContainText: boolean
  canSplitAcrossPages: boolean
  canBeDeleted: boolean
  canBeDuplicated: boolean
  canBeReordered: boolean
}

export interface DocumentGraphIndexV2 {
  nodeById: Map<NodeId, LayoutNodeV2>
  sectionById: Map<NodeId, SectionId>
  parentById: Map<NodeId, NodeParentRef>
  childrenById: Map<NodeId, readonly NodeId[]>
  rootBySectionAndRole: Map<string, NodeId>
  tableByDescendantId: Map<NodeId, NodeId>
  rowByCellId: Map<NodeId, NodeId>
  capabilitiesByType: Record<DocumentV2NodeType, NodeCapabilitiesV2>
}

export interface DocumentGraphSiblingContextV2 {
  parent: NodeParentRef
  siblingIds: readonly NodeId[]
}

export const NODE_CAPABILITIES_V2: Record<DocumentV2NodeType, NodeCapabilitiesV2> = {
  body: {
    childrenField: "childIds",
    allowedChildTypes: ["paragraph", "spacer", "divider", "page-break", "toc", "flow-row", "flow-table"],
    parentRoles: ["section-root"],
    layoutRole: "section-root",
    operationSurface: "document",
    canContainText: false,
    canSplitAcrossPages: false,
    canBeDeleted: false,
    canBeDuplicated: false,
    canBeReordered: false,
  },
  "flow-row": {
    childrenField: "childIds",
    allowedChildTypes: ["flow-stack"],
    parentRoles: ["body"],
    layoutRole: "flow-row",
    operationSurface: "flow-row",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  "flow-stack": {
    childrenField: "childIds",
    allowedChildTypes: ["paragraph", "spacer", "divider"],
    parentRoles: ["flow-row"],
    layoutRole: "flow-stack",
    operationSurface: "flow-row",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  "flow-table": {
    childrenField: "rowIds",
    allowedChildTypes: ["flow-table-row"],
    parentRoles: ["body"],
    layoutRole: "table",
    operationSurface: "table",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  "flow-table-row": {
    childrenField: "cellIds",
    allowedChildTypes: ["flow-table-cell"],
    parentRoles: ["flow-table"],
    layoutRole: "table-row",
    operationSurface: "table",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: false,
    canBeDuplicated: false,
    canBeReordered: false,
  },
  "flow-table-cell": {
    childrenField: "childIds",
    allowedChildTypes: ["paragraph", "spacer"],
    parentRoles: ["flow-table-row"],
    layoutRole: "table-cell",
    operationSurface: "table",
    canContainText: true,
    canSplitAcrossPages: true,
    canBeDeleted: false,
    canBeDuplicated: false,
    canBeReordered: false,
  },
  paragraph: {
    allowedChildTypes: [],
    parentRoles: ["body", "flow-stack", "flow-table-cell"],
    layoutRole: "block",
    operationSurface: "inline",
    canContainText: true,
    canSplitAcrossPages: true,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  spacer: {
    allowedChildTypes: [],
    parentRoles: ["body", "flow-stack", "flow-table-cell"],
    layoutRole: "block",
    operationSurface: "document",
    canContainText: false,
    canSplitAcrossPages: false,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  divider: {
    allowedChildTypes: [],
    parentRoles: ["body", "flow-stack"],
    layoutRole: "block",
    operationSurface: "document",
    canContainText: false,
    canSplitAcrossPages: false,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  "page-break": {
    allowedChildTypes: [],
    parentRoles: ["body"],
    layoutRole: "block",
    operationSurface: "document",
    canContainText: false,
    canSplitAcrossPages: false,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  toc: {
    allowedChildTypes: [],
    parentRoles: ["body"],
    layoutRole: "generated-block",
    operationSurface: "document",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
}

type MigrationTableMaps = Map<string, Map<string, string>>

function fail(path: string, message: string): never {
  throw new DocumentAssertionError([{ path, message }])
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function makeUniqueId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId)
    return baseId
  }

  let index = 1
  while (usedIds.has(`${baseId}__v2_${index}`)) index += 1
  const nextId = `${baseId}__v2_${index}`
  usedIds.add(nextId)
  return nextId
}

function isFlowTableNode(node: LayoutNode): node is LayoutNode & FlowTableNode {
  return node.type === "flow-table"
}

function migrateRootStackToBody(node: Extract<LayoutNode, { type: "stack" }>, id: string): BodyNode {
  return {
    id,
    type: "body",
    props: {
      gap: node.props.gap,
      padding: node.props.padding,
      minHeight: node.props.minHeight,
      alignX: node.props.alignX,
    },
    childIds: [...node.childIds],
  }
}

function migrateRowToFlowRow(node: Extract<LayoutNode, { type: "row" }>, id: string): FlowRowNode {
  return {
    id,
    type: "flow-row",
    props: {
      gap: node.props.gap,
      minHeight: node.props.minHeight,
    },
    childIds: [...node.childIds],
  }
}

function migrateStackToFlowStack(node: Extract<LayoutNode, { type: "stack" }>, id: string): FlowStackNode {
  return {
    id,
    type: "flow-stack",
    props: {
      widthShare: node.props.widthShare,
      minHeight: node.props.minHeight,
    },
    childIds: [...node.childIds],
  }
}

function migrateFlowTableNode(node: FlowTableNode, id: string): FlowTableNodeV2 {
  return {
    id,
    type: "flow-table",
    props: clone(node.props),
    columns: clone(node.columns),
    rowIds: [...node.rowIds],
  }
}

function mapIds(ids: readonly string[], idMap: Map<string, string>): string[] {
  return ids.map((id) => idMap.get(id) ?? id)
}

function rewriteMergeMap(
  mergeMap: FlowTableCellNode["props"]["mergeMap"],
  idMap: Map<string, string>,
): FlowTableCellNode["props"]["mergeMap"] {
  if (mergeMap == null) return undefined
  return {
    version: 1,
    entries: mergeMap.entries.map((entry) => ({
      rowOffset: entry.rowOffset,
      colOffset: entry.colOffset,
      childIds: mapIds(entry.childIds, idMap),
    })),
  }
}

function rewriteV2NodeReferences(
  node: LayoutNodeV2,
  sectionMap: Map<string, string>,
  tableMaps: MigrationTableMaps,
  tableSourceId?: string,
): LayoutNodeV2 {
  if (node.type === "body" || node.type === "flow-row" || node.type === "flow-stack") {
    return { ...node, childIds: mapIds(node.childIds, sectionMap) } as LayoutNodeV2
  }

  if (node.type === "flow-table") {
    const tableMap = tableMaps.get(tableSourceId ?? node.id) ?? new Map()
    return { ...node, rowIds: mapIds(node.rowIds, tableMap) }
  }

  if (tableSourceId != null && node.type === "flow-table-row") {
    const tableMap = tableMaps.get(tableSourceId) ?? new Map()
    return { ...node, cellIds: mapIds(node.cellIds, tableMap) }
  }

  if (tableSourceId != null && node.type === "flow-table-cell") {
    const tableMap = tableMaps.get(tableSourceId) ?? new Map()
    return {
      ...node,
      childIds: mapIds(node.childIds, tableMap),
      props: {
        ...node.props,
        ...(node.props.mergeMap ? { mergeMap: rewriteMergeMap(node.props.mergeMap, tableMap) } : {}),
      },
    }
  }

  return node
}

function migrateSectionLevelNode(
  node: LayoutNode,
  id: string,
  rootStackIds: Set<string>,
): LayoutNodeV2 {
  if (node.type === "row") return migrateRowToFlowRow(node, id)
  if (node.type === "stack") {
    return rootStackIds.has(node.id)
      ? migrateRootStackToBody(node, id)
      : migrateStackToFlowStack(node, id)
  }
  if (isFlowTableNode(node)) return migrateFlowTableNode(node, id)
  return { ...clone(node), id } as LayoutNodeV2
}

function migrateTableInternalNode(
  node: FlowTableNode["nodes"][string],
  id: string,
): LayoutNodeV2 {
  return { ...clone(node), id } as LayoutNodeV2
}

function migrateSectionToV2(section: DocumentSection, usedIds: Set<string>): DocumentSectionV2 {
  const rootStackIds = new Set(
    [
      section.headerRootId,
      section.headerFirstPageRootId,
      section.footerRootId,
      section.footerFirstPageRootId,
    ].filter((id): id is string => typeof id === "string" && section.nodes[id]?.type === "stack"),
  )

  const sectionMap = new Map<string, string>()
  const tableMaps: MigrationTableMaps = new Map()

  Object.values(section.nodes).forEach((node) => {
    sectionMap.set(node.id, makeUniqueId(node.id, usedIds))
  })

  Object.values(section.nodes).forEach((node) => {
    if (!isFlowTableNode(node)) return
    const tableMap = new Map<string, string>()
    Object.values(node.nodes).forEach((inner) => {
      tableMap.set(inner.id, makeUniqueId(inner.id, usedIds))
    })
    tableMaps.set(node.id, tableMap)
  })

  const nodes: Record<string, LayoutNodeV2> = {}

  Object.values(section.nodes).forEach((node) => {
    const nextId = sectionMap.get(node.id) ?? node.id
    const migrated = migrateSectionLevelNode(node, nextId, rootStackIds)
    nodes[nextId] = rewriteV2NodeReferences(migrated, sectionMap, tableMaps, node.id)

    if (!isFlowTableNode(node)) return
    const tableMap = tableMaps.get(node.id) ?? new Map()
    Object.values(node.nodes).forEach((inner) => {
      const innerId = tableMap.get(inner.id) ?? inner.id
      const migratedInner = migrateTableInternalNode(inner, innerId)
      nodes[innerId] = rewriteV2NodeReferences(migratedInner, sectionMap, tableMaps, node.id)
    })
  })

  const roots: SectionRootsV2 = {
    body: sectionMap.get(section.bodyRootId) ?? section.bodyRootId,
  }
  if (section.headerRootId != null) roots.header = sectionMap.get(section.headerRootId) ?? section.headerRootId
  if (section.headerFirstPageRootId != null) {
    roots.headerFirstPage = sectionMap.get(section.headerFirstPageRootId) ?? section.headerFirstPageRootId
  }
  if (section.footerRootId != null) roots.footer = sectionMap.get(section.footerRootId) ?? section.footerRootId
  if (section.footerFirstPageRootId != null) {
    roots.footerFirstPage = sectionMap.get(section.footerFirstPageRootId) ?? section.footerFirstPageRootId
  }

  return {
    id: section.id,
    type: "section",
    page: clone(section.page),
    roots,
    nodes,
  }
}

export function migrateDocumentToV2(doc: DocumentNode): DocumentNodeV2 {
  const normalized = normalizeDocument(doc)
  const usedIds = new Set<string>()
  return {
    version: 2,
    document: {
      id: normalized.document.id,
      ...(normalized.document.meta ? { meta: clone(normalized.document.meta) } : {}),
      ...(normalized.document.styles ? { styles: clone(normalized.document.styles) } : {}),
      ...(normalized.document.listStyles ? { listStyles: clone(normalized.document.listStyles) } : {}),
      ...(normalized.document.listInstances ? { listInstances: clone(normalized.document.listInstances) } : {}),
      sections: normalized.document.sections.map((section) => migrateSectionToV2(section, usedIds)),
    },
  }
}

function assertSchemaV2(doc: unknown): asserts doc is DocumentNodeV2 {
  const result = DocumentNodeV2Schema.safeParse(doc)
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }))
    throw new DocumentAssertionError(errors)
  }
}

const FORBIDDEN_LAYOUT_KEYS = ["x", "y", "width", "height"] as const

function assertNoLayoutKeys(node: object, path: string): void {
  FORBIDDEN_LAYOUT_KEYS.forEach((key) => {
    if (key in node) fail(path, `"${key}" is not allowed in document model`)
  })
}

function childIdsFor(node: LayoutNodeV2): readonly string[] {
  if (node.type === "body" || node.type === "flow-row" || node.type === "flow-stack" || node.type === "flow-table-cell") {
    return node.childIds
  }
  if (node.type === "flow-table") return node.rowIds
  if (node.type === "flow-table-row") return node.cellIds
  return []
}

function childParentRef(
  parent: LayoutNodeV2,
  sectionId: string,
  childIndex: number,
  tableId: string | null,
): NodeParentRef {
  if (parent.type === "flow-table") return { kind: "rowIds", sectionId, tableId: parent.id, index: childIndex }
  if (parent.type === "flow-table-row") return { kind: "cellIds", sectionId, tableId: tableId ?? "", rowId: parent.id, index: childIndex }
  return { kind: "childIds", sectionId, parentId: parent.id, index: childIndex }
}

function assertAllowedChild(parent: LayoutNodeV2, child: LayoutNodeV2, path: string): void {
  const allowed = NODE_CAPABILITIES_V2[parent.type].allowedChildTypes
  if (!allowed.includes(child.type)) {
    fail(path, `${parent.type} child must be ${allowed.join(", ")} — got "${child.type}"`)
  }
}

function assertFlowRowWidthShare(section: DocumentSectionV2, row: FlowRowNode, path: string): void {
  row.childIds.forEach((childId, childIndex) => {
    const child = section.nodes[childId]
    if (child?.type === "flow-stack" && typeof child.props.widthShare !== "number") {
      fail(`${path}.childIds[${childIndex}]`, "flow-stack inside flow-row must have widthShare")
    }
  })
  const total = Number(
    row.childIds
      .reduce((sum, childId) => {
        const child = section.nodes[childId]
        return sum + (child?.type === "flow-stack" ? child.props.widthShare ?? 0 : 0)
      }, 0)
      .toFixed(2),
  )
  if (total !== 100) fail(`${path}.childIds`, `flow-row stack widths must total exactly 100.00, got ${total.toFixed(2)}`)
}

function buildCompatFlowTable(table: FlowTableNodeV2, section: DocumentSectionV2): FlowTableNode {
  const nodes: FlowTableNode["nodes"] = {}

  table.rowIds.forEach((rowId) => {
    const row = section.nodes[rowId]
    if (row?.type !== "flow-table-row") return
    nodes[row.id] = row
    row.cellIds.forEach((cellId) => {
      const cell = section.nodes[cellId]
      if (cell?.type !== "flow-table-cell") return
      nodes[cell.id] = cell
      cell.childIds.forEach((childId) => {
        const child = section.nodes[childId]
        if (child?.type === "paragraph" || child?.type === "spacer") {
          nodes[child.id] = child as ParagraphNode | SpacerNode
        }
      })
    })
  })

  return {
    id: table.id,
    type: "flow-table",
    props: table.props,
    columns: table.columns,
    rowIds: table.rowIds,
    nodes,
  }
}

export function resolveFlowTableFromSectionGraphV2(
  section: DocumentSectionV2,
  tableId: NodeId,
): FlowTableNode | null {
  const table = section.nodes[tableId]
  return table?.type === "flow-table" ? buildCompatFlowTable(table, section) : null
}

function assertFlowTableV2(table: FlowTableNodeV2, section: DocumentSectionV2, path: string): void {
  if ((table.props.headerRowCount ?? 0) > table.rowIds.length) {
    fail(`${path}.props.headerRowCount`, "headerRowCount cannot exceed flow-table row count")
  }

  table.rowIds.forEach((rowId, rowIndex) => {
    const row = section.nodes[rowId]
    if (row?.type !== "flow-table-row") {
      fail(`${path}.rowIds[${rowIndex}]`, `flow-table row id must reference flow-table-row — got "${row?.type}"`)
    }
    row.cellIds.forEach((cellId, cellIndex) => {
      const cell = section.nodes[cellId]
      if (cell?.type !== "flow-table-cell") {
        fail(`document.sections.${section.id}.nodes.${rowId}.cellIds[${cellIndex}]`, `flow-table row child must be flow-table-cell — got "${cell?.type}"`)
      }
      const rowspan = cell.props.rowspan ?? 1
      const colspan = cell.props.colspan ?? 1
      const cellChildren = new Set(cell.childIds)
      cell.props.mergeMap?.entries.forEach((entry, entryIndex) => {
        const entryPath = `document.sections.${section.id}.nodes.${cellId}.props.mergeMap.entries[${entryIndex}]`
        if (entry.rowOffset >= rowspan) fail(`${entryPath}.rowOffset`, `mergeMap rowOffset must be within cell rowspan ${rowspan}`)
        if (entry.colOffset >= colspan) fail(`${entryPath}.colOffset`, `mergeMap colOffset must be within cell colspan ${colspan}`)
        entry.childIds.forEach((childId, childIndex) => {
          if (!cellChildren.has(childId)) fail(`${entryPath}.childIds[${childIndex}]`, `mergeMap child "${childId}" must be in the cell childIds`)
        })
      })
    })
  })

  try {
    resolveFlowTableGrid(buildCompatFlowTable(table, section))
  } catch (error) {
    if (error instanceof FlowTableGridError) fail(`${path}.rowIds`, error.message)
    throw error
  }
}

export function buildDocumentGraphIndexV2(doc: DocumentNodeV2): DocumentGraphIndexV2 {
  assertSchemaV2(doc)

  const index: DocumentGraphIndexV2 = {
    nodeById: new Map(),
    sectionById: new Map(),
    parentById: new Map(),
    childrenById: new Map(),
    rootBySectionAndRole: new Map(),
    tableByDescendantId: new Map(),
    rowByCellId: new Map(),
    capabilitiesByType: NODE_CAPABILITIES_V2,
  }

  doc.document.sections.forEach((section, sectionIndex) => {
    const sectionPath = `document.sections[${sectionIndex}]`
    Object.entries(section.nodes).forEach(([key, node]) => {
      if (node.id !== key) fail(`${sectionPath}.nodes.${key}`, `node id "${node.id}" must match map key "${key}"`)
      if (index.nodeById.has(node.id)) fail(`${sectionPath}.nodes.${key}`, `duplicate document node id "${node.id}"`)
      index.nodeById.set(node.id, node)
      index.sectionById.set(node.id, section.id)
      assertNoLayoutKeys(node, `${sectionPath}.nodes.${key}`)
      if ("nodes" in node) fail(`${sectionPath}.nodes.${key}.nodes`, "nested node maps are not allowed in DocumentNode v2")
    })

    const reachable = new Set<string>()
    const active = new Set<string>()

    const visit = (nodeId: string, path: string, tableId: string | null): void => {
      const node = section.nodes[nodeId]
      if (node == null) fail(path, `missing node "${nodeId}"`)
      if (active.has(nodeId)) fail(path, `cycle detected at "${nodeId}"`)
      reachable.add(nodeId)
      active.add(nodeId)

      const children = childIdsFor(node)
      index.childrenById.set(nodeId, children)

      if (node.type === "flow-table") assertFlowTableV2(node, section, path)
      if (node.type === "flow-row") assertFlowRowWidthShare(section, node, path)
      if (tableId != null || node.type === "flow-table") {
        index.tableByDescendantId.set(node.id, node.type === "flow-table" ? node.id : tableId!)
      }

      children.forEach((childId, childIndex) => {
        const child = section.nodes[childId]
        const childPath =
          node.type === "flow-table" ? `${path}.rowIds[${childIndex}]` :
          node.type === "flow-table-row" ? `${path}.cellIds[${childIndex}]` :
          `${path}.childIds[${childIndex}]`
        if (child == null) fail(childPath, `missing child "${childId}"`)
        assertAllowedChild(node, child, childPath)
        if (index.parentById.has(childId)) fail(childPath, `node "${childId}" has multiple parents`)
        const parentRef = childParentRef(node, section.id, childIndex, tableId)
        index.parentById.set(childId, parentRef)
        if (node.type === "flow-table-row") index.rowByCellId.set(childId, node.id)
        visit(childId, `${sectionPath}.nodes.${childId}`, node.type === "flow-table" ? node.id : tableId)
      })

      active.delete(nodeId)
    }

    Object.entries(section.roots).forEach(([root, nodeId]) => {
      if (nodeId == null) return
      const node = section.nodes[nodeId]
      if (node?.type !== "body") fail(`${sectionPath}.roots.${root}`, `expected "${nodeId}" to be body — got "${node?.type}"`)
      const rootKey = `${section.id}:${root}`
      index.rootBySectionAndRole.set(rootKey, nodeId)
      index.parentById.set(nodeId, { kind: "section-root", sectionId: section.id, root: root as keyof SectionRootsV2 })
      visit(nodeId, `${sectionPath}.nodes.${nodeId}`, null)
    })

    Object.keys(section.nodes).forEach((nodeId) => {
      if (!reachable.has(nodeId)) fail(`${sectionPath}.nodes.${nodeId}`, "orphan node — not reachable from any root")
    })
  })

  return index
}

export function assertDocumentV2(doc: unknown): asserts doc is DocumentNodeV2 {
  buildDocumentGraphIndexV2(doc as DocumentNodeV2)
}

function buildSingleSectionDocumentV2(section: DocumentSectionV2): DocumentNodeV2 {
  return {
    version: 2,
    document: {
      id: `section:${section.id}`,
      sections: [section],
    },
  }
}

function siblingIdsForParentV2(index: DocumentGraphIndexV2, parent: NodeParentRef): readonly NodeId[] {
  if (parent.kind === "section-root") {
    const rootId = index.rootBySectionAndRole.get(`${parent.sectionId}:${parent.root}`)
    return rootId == null ? [] : [rootId]
  }

  if (parent.kind === "childIds") return index.childrenById.get(parent.parentId) ?? []
  if (parent.kind === "rowIds") return index.childrenById.get(parent.tableId) ?? []
  return index.childrenById.get(parent.rowId) ?? []
}

export function getDocumentGraphSiblingContextV2(
  index: DocumentGraphIndexV2,
  nodeId: NodeId,
): DocumentGraphSiblingContextV2 | null {
  const parent = index.parentById.get(nodeId)
  if (parent == null) return null
  return {
    parent,
    siblingIds: siblingIdsForParentV2(index, parent),
  }
}

export function getDocumentGraphChildrenV2(
  index: DocumentGraphIndexV2,
  nodeId: NodeId,
): readonly LayoutNodeV2[] {
  const childIds = index.childrenById.get(nodeId) ?? []
  return childIds.map((childId) => {
    const child = index.nodeById.get(childId)
    if (child == null) fail(`documentGraph.childrenById.${nodeId}`, `missing indexed child "${childId}"`)
    return child
  })
}

function tableDescendantIdsForSectionV2(
  index: DocumentGraphIndexV2,
  sectionId: SectionId,
  tableId: NodeId,
): NodeId[] {
  const descendants: NodeId[] = []
  index.tableByDescendantId.forEach((ownerTableId, nodeId) => {
    if (ownerTableId === tableId && nodeId !== tableId && index.sectionById.get(nodeId) === sectionId) {
      descendants.push(nodeId)
    }
  })
  return descendants
}

function flowTableNodeFromCompatV2(table: FlowTableNode): FlowTableNodeV2 {
  return {
    id: table.id,
    type: "flow-table",
    props: clone(table.props),
    columns: clone(table.columns),
    rowIds: [...table.rowIds],
  }
}

function writeCompatFlowTableToSectionGraphV2(
  section: DocumentSectionV2,
  table: FlowTableNode,
  descendantIds: readonly NodeId[],
): DocumentSectionV2 {
  const nodes: Record<string, LayoutNodeV2> = { ...section.nodes }
  descendantIds.forEach((nodeId) => {
    delete nodes[nodeId]
  })
  nodes[table.id] = flowTableNodeFromCompatV2(table)
  Object.values(table.nodes).forEach((node) => {
    nodes[node.id] = clone(node) as LayoutNodeV2
  })
  return { ...section, nodes }
}

function updateFlowTableInDocumentV2(
  doc: DocumentNodeV2,
  tableId: NodeId,
  updater: (table: FlowTableNode, section: DocumentSectionV2) => FlowTableNode,
): DocumentNodeV2 {
  const index = buildDocumentGraphIndexV2(doc)
  const sectionId = index.sectionById.get(tableId)
  if (sectionId == null) return doc
  const sectionIndex = doc.document.sections.findIndex((section) => section.id === sectionId)
  if (sectionIndex < 0) return doc
  const section = doc.document.sections[sectionIndex]
  const table = resolveFlowTableFromSectionGraphV2(section, tableId)
  if (table == null) return doc

  const nextTable = updater(table, section)
  if (nextTable === table) return doc

  const descendantIds = tableDescendantIdsForSectionV2(index, section.id, tableId)
  const nextSection = writeCompatFlowTableToSectionGraphV2(section, nextTable, descendantIds)
  const sections = doc.document.sections.map((current, index) =>
    index === sectionIndex ? nextSection : current,
  )
  return { ...doc, document: { ...doc.document, sections } }
}

export function addFlowTableRowV2(doc: DocumentNodeV2, tableId: NodeId, afterIndex?: number): DocumentNodeV2 {
  return updateFlowTableInDocumentV2(doc, tableId, (table) => addFlowTableRowToTable(table, afterIndex))
}

export function removeFlowTableRowV2(doc: DocumentNodeV2, tableId: NodeId, rowIndex: number): DocumentNodeV2 {
  return updateFlowTableInDocumentV2(doc, tableId, (table) => removeFlowTableRowFromTable(table, rowIndex))
}

export function addFlowTableColumnV2(doc: DocumentNodeV2, tableId: NodeId, afterColIndex?: number): DocumentNodeV2 {
  return updateFlowTableInDocumentV2(doc, tableId, (table) => addFlowTableColumnToTable(table, afterColIndex))
}

export function removeFlowTableColumnV2(doc: DocumentNodeV2, tableId: NodeId, colIndex: number): DocumentNodeV2 {
  return updateFlowTableInDocumentV2(doc, tableId, (table) => removeFlowTableColumnFromTable(table, colIndex))
}

export function resizeFlowTableColumnPairV2(
  doc: DocumentNodeV2,
  tableId: NodeId,
  leftColIndex: number,
  leftWidthPt: number,
  rightWidthPt: number,
): DocumentNodeV2 {
  return updateFlowTableInDocumentV2(
    doc,
    tableId,
    (table) => resizeFlowTableColumnPairInTable(table, leftColIndex, leftWidthPt, rightWidthPt),
  )
}

export function fitFlowTableToSectionWidthV2(doc: DocumentNodeV2, tableId: NodeId): DocumentNodeV2 {
  return updateFlowTableInDocumentV2(doc, tableId, (table, section) =>
    fitFlowTableColumnsToWidth(table, getPageMetrics(section.page).contentBox.width),
  )
}

export function updateFlowTableCellSpanV2(
  doc: DocumentNodeV2,
  cellId: NodeId,
  changes: FlowTableCellSpanChanges,
): DocumentNodeV2 {
  const index = buildDocumentGraphIndexV2(doc)
  const tableId = index.tableByDescendantId.get(cellId)
  if (tableId == null) return doc
  return updateFlowTableInDocumentV2(doc, tableId, (table) => updateFlowTableCellSpanInTable(table, cellId, changes))
}

export function deleteEmptyFlowTableCellParagraphV2(
  doc: DocumentNodeV2,
  nodeId: NodeId,
): { doc: DocumentNodeV2; prevNodeId: NodeId; caretIndex: number } | null {
  const index = buildDocumentGraphIndexV2(doc)
  const tableId = index.tableByDescendantId.get(nodeId)
  if (tableId == null) return null

  const sectionId = index.sectionById.get(tableId)
  if (sectionId == null) return null
  const sectionIndex = doc.document.sections.findIndex((section) => section.id === sectionId)
  if (sectionIndex < 0) return null
  const section = doc.document.sections[sectionIndex]
  const table = resolveFlowTableFromSectionGraphV2(section, tableId)
  if (table == null) return null

  const result = deleteEmptyFlowTableCellParagraphInTable(table, nodeId)
  if (result == null) return null

  const descendantIds = tableDescendantIdsForSectionV2(index, section.id, tableId)
  const nextSection = writeCompatFlowTableToSectionGraphV2(section, result.table, descendantIds)
  const sections = doc.document.sections.map((current, index) =>
    index === sectionIndex ? nextSection : current,
  )

  return {
    doc: { ...doc, document: { ...doc.document, sections } },
    prevNodeId: result.prevNodeId,
    caretIndex: result.caretIndex,
  }
}

function collectParagraphsFromRootV2(
  index: DocumentGraphIndexV2,
  rootId: NodeId,
  paragraphs: ParagraphNode[],
): void {
  const visit = (nodeId: NodeId): void => {
    const node = index.nodeById.get(nodeId)
    if (node == null) fail(`documentGraph.nodeById.${nodeId}`, `missing indexed node "${nodeId}"`)
    if (node.type === "paragraph") {
      paragraphs.push(node)
      return
    }
    const childIds = index.childrenById.get(nodeId) ?? []
    childIds.forEach(visit)
  }

  visit(rootId)
}

export function orderedSectionParagraphsV2(section: DocumentSectionV2): ParagraphNode[] {
  const doc = buildSingleSectionDocumentV2(section)
  const index = buildDocumentGraphIndexV2(doc)
  const paragraphs: ParagraphNode[] = []
  collectParagraphsFromRootV2(index, section.roots.body, paragraphs)
  return paragraphs
}

function adaptV2NodeToCurrentRuntimeNode(
  node: LayoutNodeV2,
  zoneRootIds: Set<NodeId>,
): LayoutNode {
  if (zoneRootIds.has(node.id) && node.type === "body") {
    return {
      id: node.id,
      type: "stack",
      props: clone(node.props),
      childIds: [...node.childIds],
    }
  }

  return clone(node) as LayoutNode
}

function adaptV2TableToCurrentRuntimeTable(
  table: FlowTableNodeV2,
  section: DocumentSectionV2,
  index: DocumentGraphIndexV2,
): FlowTableNode {
  const nodes: FlowTableNode["nodes"] = {}

  index.tableByDescendantId.forEach((tableId, nodeId) => {
    if (tableId !== table.id || nodeId === table.id) return
    if (index.sectionById.get(nodeId) !== section.id) return
    const node = section.nodes[nodeId]
    if (node == null) return
    nodes[node.id] = clone(node) as FlowTableNode["nodes"][string]
  })

  return {
    id: table.id,
    type: "flow-table",
    props: clone(table.props),
    columns: clone(table.columns),
    rowIds: [...table.rowIds],
    nodes,
  }
}

export function adaptDocumentV2ToCurrentDocument(doc: DocumentNodeV2): DocumentNode {
  const index = buildDocumentGraphIndexV2(doc)

  return {
    version: 1,
    document: {
      id: doc.document.id,
      ...(doc.document.meta ? { meta: clone(doc.document.meta) } : {}),
      ...(doc.document.styles ? { styles: clone(doc.document.styles) } : {}),
      ...(doc.document.listStyles ? { listStyles: clone(doc.document.listStyles) } : {}),
      ...(doc.document.listInstances ? { listInstances: clone(doc.document.listInstances) } : {}),
      sections: doc.document.sections.map((section) => {
        const zoneRootIds = new Set<NodeId>(
          [
            section.roots.header,
            section.roots.headerFirstPage,
            section.roots.footer,
            section.roots.footerFirstPage,
          ].filter((id): id is string => typeof id === "string"),
        )
        const nodes: Record<string, LayoutNode> = {}

        Object.values(section.nodes).forEach((node) => {
          const owningTableId = index.tableByDescendantId.get(node.id)
          if (owningTableId != null && owningTableId !== node.id) return

          if (node.type === "flow-table") {
            nodes[node.id] = adaptV2TableToCurrentRuntimeTable(node, section, index) as unknown as LayoutNode
            return
          }

          nodes[node.id] = adaptV2NodeToCurrentRuntimeNode(node, zoneRootIds)
        })

        return {
          id: section.id,
          type: "section",
          page: clone(section.page),
          bodyRootId: section.roots.body,
          ...(section.roots.header ? { headerRootId: section.roots.header } : {}),
          ...(section.roots.headerFirstPage ? { headerFirstPageRootId: section.roots.headerFirstPage } : {}),
          ...(section.roots.footer ? { footerRootId: section.roots.footer } : {}),
          ...(section.roots.footerFirstPage ? { footerFirstPageRootId: section.roots.footerFirstPage } : {}),
          nodes,
        }
      }),
    },
  }
}

export function orderedDocumentParagraphsV2(doc: DocumentNodeV2): ParagraphNode[] {
  const index = buildDocumentGraphIndexV2(doc)
  const paragraphs: ParagraphNode[] = []
  doc.document.sections.forEach((section) => {
    collectParagraphsFromRootV2(index, section.roots.body, paragraphs)
  })
  return paragraphs
}
