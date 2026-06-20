import type {
  AuthoredNodeVNext,
  ColumnNodeVNext,
  DocumentNodeVNext,
  DocumentSectionVNext,
  TableCellNodeVNext,
  TableNodeVNext,
  TableRowNodeVNext,
  TextBlockNodeVNext,
  ZoneNodeVNext,
} from "../schema"
import { DocumentNodeVNextSchema } from "../schema"
import { DocumentAssertionError } from "./assert"

export type NodeId = string
export type SectionId = string
export type NodeIdVNext = NodeId
export type SectionIdVNext = SectionId
export type DocumentVNextNodeType = AuthoredNodeVNext["type"]

export type NodeParentRefVNext =
  | { kind: "document"; childField: "sectionIds"; index: number }
  | { kind: "section"; sectionId: SectionId; childField: "zoneIds"; index: number }
  | { kind: "zone"; sectionId: SectionId; zoneId: NodeId; childField: "childIds"; index: number }
  | { kind: "columns"; columnsId: NodeId; childField: "columnIds"; index: number }
  | { kind: "column"; columnsId: NodeId; columnId: NodeId; childField: "childIds"; index: number }
  | { kind: "table"; tableId: NodeId; childField: "rowIds"; index: number }
  | { kind: "table-row"; tableId: NodeId; rowId: NodeId; childField: "cellIds"; index: number }
  | { kind: "table-cell"; tableId: NodeId; rowId: NodeId; cellId: NodeId; childField: "childIds"; index: number }

export type OperationSurfaceVNext =
  | "zone"
  | "text-block"
  | "columns"
  | "table"
  | "utility"
  | "generated"

export interface NodeCapabilitiesVNext {
  childrenField?: "childIds" | "columnIds" | "rowIds" | "cellIds"
  allowedChildTypes: readonly DocumentVNextNodeType[]
  operationSurface: OperationSurfaceVNext
  canContainText: boolean
  canSplitAcrossPages: boolean
  canBeDeleted: boolean
  canBeDuplicated: boolean
  canBeReordered: boolean
}

export interface NearestContextVNext {
  sectionId: SectionId
  zoneId: NodeId
  blockId: NodeId | null
  textBlockId: NodeId | null
  columnsId: NodeId | null
  columnId: NodeId | null
  tableId: NodeId | null
  tableRowId: NodeId | null
  tableCellId: NodeId | null
}

export type RelationshipGraphIssueSeverityVNext = "error" | "warning"

export type RelationshipGraphIssueCodeVNext =
  | "duplicate-id"
  | "missing-parent"
  | "multiple-parents"
  | "missing-child"
  | "invalid-child-type"
  | "cycle"
  | "orphan-node"
  | "invalid-zone-role"
  | "invalid-role-metadata"
  | "invalid-columns-width"
  | "invalid-table-grid"
  | "editor-state-persisted"
  | "schema-error"

export interface RelationshipGraphIssueVNext {
  severity: RelationshipGraphIssueSeverityVNext
  code: RelationshipGraphIssueCodeVNext
  nodeId?: NodeId
  parentId?: NodeId
  path: string
  message: string
}

export interface RelationshipGraphDiagnosticsVNext {
  issues: RelationshipGraphIssueVNext[]
}

export interface NodeRelationshipGraphVNext {
  document: DocumentNodeVNext
  nodesById: Map<NodeId, AuthoredNodeVNext>
  sectionsById: Map<SectionId, DocumentSectionVNext>
  zonesById: Map<NodeId, ZoneNodeVNext>
  sectionByNodeId: Map<NodeId, SectionId>
  zoneByNodeId: Map<NodeId, NodeId>
  parentByNodeId: Map<NodeId, NodeParentRefVNext>
  childrenByNodeId: Map<NodeId, readonly NodeId[]>
  nearestByNodeId: Map<NodeId, NearestContextVNext>
  capabilitiesByType: Record<DocumentVNextNodeType, NodeCapabilitiesVNext>
  diagnostics: RelationshipGraphDiagnosticsVNext
}

const BLOCK_CHILD_TYPES = ["text-block", "columns", "table", "toc", "page-break", "divider", "spacer"] as const
const TABLE_CELL_CHILD_TYPES = ["text-block", "toc", "page-break", "divider", "spacer"] as const

export const NODE_CAPABILITIES_VNEXT: Record<DocumentVNextNodeType, NodeCapabilitiesVNext> = {
  zone: {
    childrenField: "childIds",
    allowedChildTypes: BLOCK_CHILD_TYPES,
    operationSurface: "zone",
    canContainText: false,
    canSplitAcrossPages: false,
    canBeDeleted: false,
    canBeDuplicated: false,
    canBeReordered: false,
  },
  "text-block": {
    allowedChildTypes: [],
    operationSurface: "text-block",
    canContainText: true,
    canSplitAcrossPages: true,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  columns: {
    childrenField: "columnIds",
    allowedChildTypes: ["column"],
    operationSurface: "columns",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  column: {
    childrenField: "childIds",
    allowedChildTypes: BLOCK_CHILD_TYPES,
    operationSurface: "columns",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  table: {
    childrenField: "rowIds",
    allowedChildTypes: ["table-row"],
    operationSurface: "table",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  "table-row": {
    childrenField: "cellIds",
    allowedChildTypes: ["table-cell"],
    operationSurface: "table",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: false,
    canBeDuplicated: false,
    canBeReordered: false,
  },
  "table-cell": {
    childrenField: "childIds",
    allowedChildTypes: TABLE_CELL_CHILD_TYPES,
    operationSurface: "table",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: false,
    canBeDuplicated: false,
    canBeReordered: false,
  },
  toc: {
    allowedChildTypes: [],
    operationSurface: "generated",
    canContainText: false,
    canSplitAcrossPages: true,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  "page-break": {
    allowedChildTypes: [],
    operationSurface: "utility",
    canContainText: false,
    canSplitAcrossPages: false,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  divider: {
    allowedChildTypes: [],
    operationSurface: "utility",
    canContainText: false,
    canSplitAcrossPages: false,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
  spacer: {
    allowedChildTypes: [],
    operationSurface: "utility",
    canContainText: false,
    canSplitAcrossPages: false,
    canBeDeleted: true,
    canBeDuplicated: true,
    canBeReordered: true,
  },
}

const FORBIDDEN_PROTOTYPE_NODE_TYPES = new Set([
  "body",
  "paragraph",
  "row",
  "stack",
  "flow-row",
  "flow-stack",
  "flow-table",
  "flow-table-row",
  "flow-table-cell",
])

function schemaIssues(doc: unknown): RelationshipGraphIssueVNext[] {
  const result = DocumentNodeVNextSchema.safeParse(doc)
  if (result.success) return []
  return result.error.issues.map((issue) => ({
    severity: "error",
    code: "schema-error",
    path: issue.path.join("."),
    message: issue.message,
  }))
}

function pushIssue(
  issues: RelationshipGraphIssueVNext[],
  issue: RelationshipGraphIssueVNext,
): void {
  issues.push(issue)
}

function childIdsForNode(node: AuthoredNodeVNext): readonly string[] {
  if (node.type === "zone" || node.type === "column" || node.type === "table-cell") return node.childIds
  if (node.type === "columns") return node.columnIds
  if (node.type === "table") return node.rowIds
  if (node.type === "table-row") return node.cellIds
  return []
}

function parentRefForChild(
  parent: AuthoredNodeVNext,
  childIndex: number,
  context: NearestContextVNext,
): NodeParentRefVNext | null {
  if (parent.type === "zone") {
    return { kind: "zone", sectionId: context.sectionId, zoneId: parent.id, childField: "childIds", index: childIndex }
  }
  if (parent.type === "columns") {
    return { kind: "columns", columnsId: parent.id, childField: "columnIds", index: childIndex }
  }
  if (parent.type === "column") {
    if (context.columnsId == null) return null
    return {
      kind: "column",
      columnsId: context.columnsId,
      columnId: parent.id,
      childField: "childIds",
      index: childIndex,
    }
  }
  if (parent.type === "table") {
    return { kind: "table", tableId: parent.id, childField: "rowIds", index: childIndex }
  }
  if (parent.type === "table-row") {
    if (context.tableId == null) return null
    return {
      kind: "table-row",
      tableId: context.tableId,
      rowId: parent.id,
      childField: "cellIds",
      index: childIndex,
    }
  }
  if (parent.type === "table-cell") {
    if (context.tableId == null || context.tableRowId == null) return null
    return {
      kind: "table-cell",
      tableId: context.tableId,
      rowId: context.tableRowId,
      cellId: parent.id,
      childField: "childIds",
      index: childIndex,
    }
  }
  return null
}

function isBlockNode(node: AuthoredNodeVNext): boolean {
  return BLOCK_CHILD_TYPES.includes(node.type as (typeof BLOCK_CHILD_TYPES)[number])
}

function contextForNode(node: AuthoredNodeVNext, parentContext: NearestContextVNext): NearestContextVNext {
  const blockId = isBlockNode(node) ? node.id : parentContext.blockId
  return {
    ...parentContext,
    blockId,
    textBlockId: node.type === "text-block" ? node.id : parentContext.textBlockId,
    columnsId: node.type === "columns" ? node.id : parentContext.columnsId,
    columnId: node.type === "column" ? node.id : parentContext.columnId,
    tableId: node.type === "table" ? node.id : parentContext.tableId,
    tableRowId: node.type === "table-row" ? node.id : parentContext.tableRowId,
    tableCellId: node.type === "table-cell" ? node.id : parentContext.tableCellId,
  }
}

function assertColumnsWidth(
  section: DocumentSectionVNext,
  columns: AuthoredNodeVNext,
  issues: RelationshipGraphIssueVNext[],
  path: string,
): void {
  if (columns.type !== "columns") return
  let total = 0
  columns.columnIds.forEach((columnId, index) => {
    const column = section.nodes[columnId]
    if (column?.type !== "column") return
    const widthShare = column.props.widthShare
    if (typeof widthShare !== "number") {
      pushIssue(issues, {
        severity: "error",
        code: "invalid-columns-width",
        nodeId: columnId,
        parentId: columns.id,
        path: `${path}.columnIds[${index}]`,
        message: "column inside columns must have widthShare",
      })
      return
    }
    total += widthShare
  })
  const rounded = Number(total.toFixed(2))
  if (rounded !== 100) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid-columns-width",
      nodeId: columns.id,
      path: `${path}.columnIds`,
      message: `columns widthShare total must be 100.00, got ${rounded.toFixed(2)}`,
    })
  }
}

function assertTableGrid(
  table: TableNodeVNext,
  issues: RelationshipGraphIssueVNext[],
  path: string,
): void {
  if ((table.props.headerRowCount ?? 0) > table.rowIds.length) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid-table-grid",
      nodeId: table.id,
      path: `${path}.props.headerRowCount`,
      message: "headerRowCount cannot exceed table row count",
    })
  }
}

export function buildRelationshipGraphVNext(doc: DocumentNodeVNext): NodeRelationshipGraphVNext {
  const initialSchemaIssues = schemaIssues(doc)
  if (initialSchemaIssues.length > 0) {
    throw new DocumentAssertionError(initialSchemaIssues.map((issue) => ({ path: issue.path, message: issue.message })))
  }

  const issues: RelationshipGraphIssueVNext[] = []
  const graph: NodeRelationshipGraphVNext = {
    document: doc,
    nodesById: new Map(),
    sectionsById: new Map(),
    zonesById: new Map(),
    sectionByNodeId: new Map(),
    zoneByNodeId: new Map(),
    parentByNodeId: new Map(),
    childrenByNodeId: new Map(),
    nearestByNodeId: new Map(),
    capabilitiesByType: NODE_CAPABILITIES_VNEXT,
    diagnostics: { issues },
  }

  doc.document.sections.forEach((section, sectionIndex) => {
    const sectionPath = `document.sections[${sectionIndex}]`
    graph.sectionsById.set(section.id, section)

    Object.entries(section.nodes).forEach(([key, node]) => {
      const nodePath = `${sectionPath}.nodes.${key}`
      if (node.id !== key) {
        pushIssue(issues, {
          severity: "error",
          code: "schema-error",
          nodeId: node.id,
          path: nodePath,
          message: `node id "${node.id}" must match map key "${key}"`,
        })
      }
      if (graph.nodesById.has(node.id)) {
        pushIssue(issues, {
          severity: "error",
          code: "duplicate-id",
          nodeId: node.id,
          path: nodePath,
          message: `duplicate document node id "${node.id}"`,
        })
      }
      if (FORBIDDEN_PROTOTYPE_NODE_TYPES.has((node as { type: string }).type)) {
        pushIssue(issues, {
          severity: "error",
          code: "schema-error",
          nodeId: node.id,
          path: `${nodePath}.type`,
          message: `prototype node type "${(node as { type: string }).type}" is not allowed in vNext graph`,
        })
      }
      graph.nodesById.set(node.id, node)
      graph.sectionByNodeId.set(node.id, section.id)
      if (node.type === "zone") graph.zonesById.set(node.id, node)
    })

    const reachable = new Set<string>()
    const active = new Set<string>()

    const visit = (nodeId: string, path: string, context: NearestContextVNext): void => {
      const node = section.nodes[nodeId]
      if (node == null) {
        pushIssue(issues, {
          severity: "error",
          code: "missing-child",
          nodeId,
          path,
          message: `missing node "${nodeId}"`,
        })
        return
      }
      if (active.has(nodeId)) {
        pushIssue(issues, {
          severity: "error",
          code: "cycle",
          nodeId,
          path,
          message: `cycle detected at "${nodeId}"`,
        })
        return
      }

      reachable.add(nodeId)
      active.add(nodeId)

      const nodeContext = contextForNode(node, context)
      graph.nearestByNodeId.set(nodeId, nodeContext)
      graph.zoneByNodeId.set(nodeId, nodeContext.zoneId)

      const childIds = childIdsForNode(node)
      graph.childrenByNodeId.set(nodeId, childIds)
      if (node.type === "columns") assertColumnsWidth(section, node, issues, path)
      if (node.type === "table") assertTableGrid(node, issues, path)

      childIds.forEach((childId, childIndex) => {
        const child = section.nodes[childId]
        const childPath =
          node.type === "columns" ? `${path}.columnIds[${childIndex}]` :
          node.type === "table" ? `${path}.rowIds[${childIndex}]` :
          node.type === "table-row" ? `${path}.cellIds[${childIndex}]` :
          `${path}.childIds[${childIndex}]`

        if (child == null) {
          pushIssue(issues, {
            severity: "error",
            code: "missing-child",
            nodeId: childId,
            parentId: node.id,
            path: childPath,
            message: `missing child "${childId}"`,
          })
          return
        }

        const allowed = NODE_CAPABILITIES_VNEXT[node.type].allowedChildTypes
        if (!allowed.includes(child.type)) {
          pushIssue(issues, {
            severity: "error",
            code: "invalid-child-type",
            nodeId: child.id,
            parentId: node.id,
            path: childPath,
            message: `${node.type} child must be ${allowed.join(", ")}; got "${child.type}"`,
          })
        }

        if (graph.parentByNodeId.has(childId)) {
          pushIssue(issues, {
            severity: "error",
            code: "multiple-parents",
            nodeId: childId,
            parentId: node.id,
            path: childPath,
            message: `node "${childId}" has multiple parents`,
          })
        } else {
          const parentRef = parentRefForChild(node, childIndex, nodeContext)
          if (parentRef == null) {
            pushIssue(issues, {
              severity: "error",
              code: "missing-parent",
              nodeId: childId,
              parentId: node.id,
              path: childPath,
              message: `cannot derive parent ref for "${childId}"`,
            })
          } else {
            graph.parentByNodeId.set(childId, parentRef)
          }
        }

        visit(childId, `${sectionPath}.nodes.${childId}`, nodeContext)
      })

      active.delete(nodeId)
    }

    section.zoneIds.forEach((zoneId, zoneIndex) => {
      const zone = section.nodes[zoneId]
      const zonePath = `${sectionPath}.zoneIds[${zoneIndex}]`
      if (zone?.type !== "zone") {
        pushIssue(issues, {
          severity: "error",
          code: "invalid-zone-role",
          nodeId: zoneId,
          path: zonePath,
          message: `section zone id must reference zone; got "${zone?.type}"`,
        })
        return
      }
      if (graph.parentByNodeId.has(zoneId)) {
        pushIssue(issues, {
          severity: "error",
          code: "multiple-parents",
          nodeId: zoneId,
          path: zonePath,
          message: `zone "${zoneId}" has multiple parents`,
        })
      } else {
        graph.parentByNodeId.set(zoneId, { kind: "section", sectionId: section.id, childField: "zoneIds", index: zoneIndex })
      }
      const baseContext: NearestContextVNext = {
        sectionId: section.id,
        zoneId,
        blockId: null,
        textBlockId: null,
        columnsId: null,
        columnId: null,
        tableId: null,
        tableRowId: null,
        tableCellId: null,
      }
      visit(zoneId, `${sectionPath}.nodes.${zoneId}`, baseContext)
    })

    Object.keys(section.nodes).forEach((nodeId) => {
      if (!reachable.has(nodeId)) {
        pushIssue(issues, {
          severity: "error",
          code: "orphan-node",
          nodeId,
          path: `${sectionPath}.nodes.${nodeId}`,
          message: `orphan node "${nodeId}" is not reachable from any zone`,
        })
      }
    })
  })

  if (issues.some((issue) => issue.severity === "error")) {
    throw new DocumentAssertionError(issues.map((issue) => ({ path: issue.path, message: issue.message })))
  }

  return graph
}

export function assertDocumentVNext(doc: unknown): asserts doc is DocumentNodeVNext {
  buildRelationshipGraphVNext(doc as DocumentNodeVNext)
}

export function getTextBlockNodesVNext(graph: NodeRelationshipGraphVNext): TextBlockNodeVNext[] {
  return [...graph.nodesById.values()].filter((node): node is TextBlockNodeVNext => node.type === "text-block")
}

export function getZoneNodesVNext(graph: NodeRelationshipGraphVNext): ZoneNodeVNext[] {
  return [...graph.zonesById.values()]
}

export function getColumnNodesVNext(graph: NodeRelationshipGraphVNext): ColumnNodeVNext[] {
  return [...graph.nodesById.values()].filter((node): node is ColumnNodeVNext => node.type === "column")
}

export function getTableNodesVNext(graph: NodeRelationshipGraphVNext): TableNodeVNext[] {
  return [...graph.nodesById.values()].filter((node): node is TableNodeVNext => node.type === "table")
}

export function getTableRowsVNext(graph: NodeRelationshipGraphVNext): TableRowNodeVNext[] {
  return [...graph.nodesById.values()].filter((node): node is TableRowNodeVNext => node.type === "table-row")
}

export function getTableCellsVNext(graph: NodeRelationshipGraphVNext): TableCellNodeVNext[] {
  return [...graph.nodesById.values()].filter((node): node is TableCellNodeVNext => node.type === "table-cell")
}
