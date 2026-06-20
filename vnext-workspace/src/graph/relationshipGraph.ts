import type {
  AuthoredNode,
  ColumnNode,
  DocumentNode,
  DocumentSection,
  TableCellNode,
  TableNode,
  TableRowNode,
  TextBlockNode,
  ZoneNode,
} from "../schema/document.js"
import { DocumentNodeSchema } from "../schema/document.js"
import { DocumentAssertionError } from "../errors.js"

export type NodeId = string
export type SectionId = string
export type NodeType = AuthoredNode["type"]

export type ParentRef =
  | { kind: "section"; sectionId: SectionId; childField: "zoneIds"; index: number }
  | { kind: "zone"; sectionId: SectionId; zoneId: NodeId; childField: "childIds"; index: number }
  | { kind: "columns"; columnsId: NodeId; childField: "columnIds"; index: number }
  | { kind: "column"; columnsId: NodeId; columnId: NodeId; childField: "childIds"; index: number }
  | { kind: "table"; tableId: NodeId; childField: "rowIds"; index: number }
  | { kind: "table-row"; tableId: NodeId; rowId: NodeId; childField: "cellIds"; index: number }
  | { kind: "table-cell"; tableId: NodeId; rowId: NodeId; cellId: NodeId; childField: "childIds"; index: number }

export type OperationSurface =
  | "zone"
  | "text-block"
  | "columns"
  | "table"
  | "utility"
  | "generated"

export interface NodeCapabilities {
  childrenField?: "childIds" | "columnIds" | "rowIds" | "cellIds"
  allowedChildTypes: readonly NodeType[]
  operationSurface: OperationSurface
  canContainText: boolean
  canSplitAcrossPages: boolean
  canBeDeleted: boolean
  canBeDuplicated: boolean
  canBeReordered: boolean
}

export interface NearestContext {
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

export type GraphIssueCode =
  | "duplicate-id"
  | "missing-parent"
  | "multiple-parents"
  | "missing-child"
  | "invalid-child-type"
  | "cycle"
  | "orphan-node"
  | "invalid-zone-role"
  | "invalid-columns-width"
  | "invalid-table-grid"
  | "schema-error"

export interface GraphIssue {
  severity: "error" | "warning"
  code: GraphIssueCode
  nodeId?: NodeId
  parentId?: NodeId
  path: string
  message: string
}

export interface RelationshipGraph {
  document: DocumentNode
  nodesById: Map<NodeId, AuthoredNode>
  sectionsById: Map<SectionId, DocumentSection>
  zonesById: Map<NodeId, ZoneNode>
  sectionByNodeId: Map<NodeId, SectionId>
  zoneByNodeId: Map<NodeId, NodeId>
  parentByNodeId: Map<NodeId, ParentRef>
  childrenByNodeId: Map<NodeId, readonly NodeId[]>
  nearestByNodeId: Map<NodeId, NearestContext>
  capabilitiesByType: Record<NodeType, NodeCapabilities>
  diagnostics: { issues: GraphIssue[] }
}

const BLOCK_CHILD_TYPES = ["text-block", "columns", "table", "toc", "page-break", "divider", "spacer"] as const
const TABLE_CELL_CHILD_TYPES = ["text-block", "toc", "page-break", "divider", "spacer"] as const

export const NODE_CAPABILITIES: Record<NodeType, NodeCapabilities> = {
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

function childIdsForNode(node: AuthoredNode): readonly string[] {
  if (node.type === "zone" || node.type === "column" || node.type === "table-cell") return node.childIds
  if (node.type === "columns") return node.columnIds
  if (node.type === "table") return node.rowIds
  if (node.type === "table-row") return node.cellIds
  return []
}

function isBlockNode(node: AuthoredNode): boolean {
  return BLOCK_CHILD_TYPES.includes(node.type as (typeof BLOCK_CHILD_TYPES)[number])
}

function contextForNode(node: AuthoredNode, parentContext: NearestContext): NearestContext {
  return {
    ...parentContext,
    blockId: isBlockNode(node) ? node.id : parentContext.blockId,
    textBlockId: node.type === "text-block" ? node.id : parentContext.textBlockId,
    columnsId: node.type === "columns" ? node.id : parentContext.columnsId,
    columnId: node.type === "column" ? node.id : parentContext.columnId,
    tableId: node.type === "table" ? node.id : parentContext.tableId,
    tableRowId: node.type === "table-row" ? node.id : parentContext.tableRowId,
    tableCellId: node.type === "table-cell" ? node.id : parentContext.tableCellId,
  }
}

function parentRefForChild(parent: AuthoredNode, childIndex: number, context: NearestContext): ParentRef | null {
  if (parent.type === "zone") {
    return { kind: "zone", sectionId: context.sectionId, zoneId: parent.id, childField: "childIds", index: childIndex }
  }
  if (parent.type === "columns") {
    return { kind: "columns", columnsId: parent.id, childField: "columnIds", index: childIndex }
  }
  if (parent.type === "column" && context.columnsId != null) {
    return { kind: "column", columnsId: context.columnsId, columnId: parent.id, childField: "childIds", index: childIndex }
  }
  if (parent.type === "table") {
    return { kind: "table", tableId: parent.id, childField: "rowIds", index: childIndex }
  }
  if (parent.type === "table-row" && context.tableId != null) {
    return { kind: "table-row", tableId: context.tableId, rowId: parent.id, childField: "cellIds", index: childIndex }
  }
  if (parent.type === "table-cell" && context.tableId != null && context.tableRowId != null) {
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

function assertColumnsWidth(section: DocumentSection, columns: AuthoredNode, issues: GraphIssue[], path: string): void {
  if (columns.type !== "columns") return
  let total = 0
  columns.columnIds.forEach((columnId, index) => {
    const column = section.nodes[columnId]
    if (column?.type !== "column") return
    const widthShare = column.props.widthShare
    if (typeof widthShare !== "number") {
      issues.push({
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
    issues.push({
      severity: "error",
      code: "invalid-columns-width",
      nodeId: columns.id,
      path: `${path}.columnIds`,
      message: `columns widthShare total must be 100.00, got ${rounded.toFixed(2)}`,
    })
  }
}

function assertTableGrid(table: TableNode, issues: GraphIssue[], path: string): void {
  if ((table.props.headerRowCount ?? 0) > table.rowIds.length) {
    issues.push({
      severity: "error",
      code: "invalid-table-grid",
      nodeId: table.id,
      path: `${path}.props.headerRowCount`,
      message: "headerRowCount cannot exceed table row count",
    })
  }
}

function schemaIssues(doc: unknown): GraphIssue[] {
  const result = DocumentNodeSchema.safeParse(doc)
  if (result.success) return []
  return result.error.issues.map((issue) => ({
    severity: "error",
    code: "schema-error",
    path: issue.path.join("."),
    message: issue.message,
  }))
}

export function buildRelationshipGraph(doc: DocumentNode): RelationshipGraph {
  const initialSchemaIssues = schemaIssues(doc)
  if (initialSchemaIssues.length > 0) {
    throw new DocumentAssertionError(initialSchemaIssues.map((issue) => ({ path: issue.path, message: issue.message })))
  }

  const issues: GraphIssue[] = []
  const graph: RelationshipGraph = {
    document: doc,
    nodesById: new Map(),
    sectionsById: new Map(),
    zonesById: new Map(),
    sectionByNodeId: new Map(),
    zoneByNodeId: new Map(),
    parentByNodeId: new Map(),
    childrenByNodeId: new Map(),
    nearestByNodeId: new Map(),
    capabilitiesByType: NODE_CAPABILITIES,
    diagnostics: { issues },
  }

  doc.document.sections.forEach((section, sectionIndex) => {
    const sectionPath = `document.sections[${sectionIndex}]`
    graph.sectionsById.set(section.id, section)

    Object.entries(section.nodes).forEach(([key, node]) => {
      const nodePath = `${sectionPath}.nodes.${key}`
      if (node.id !== key) {
        issues.push({
          severity: "error",
          code: "schema-error",
          nodeId: node.id,
          path: nodePath,
          message: `node id "${node.id}" must match map key "${key}"`,
        })
      }
      if (graph.nodesById.has(node.id)) {
        issues.push({
          severity: "error",
          code: "duplicate-id",
          nodeId: node.id,
          path: nodePath,
          message: `duplicate document node id "${node.id}"`,
        })
      }
      graph.nodesById.set(node.id, node)
      graph.sectionByNodeId.set(node.id, section.id)
      if (node.type === "zone") graph.zonesById.set(node.id, node)
    })

    const reachable = new Set<string>()
    const active = new Set<string>()

    const visit = (nodeId: string, path: string, context: NearestContext): void => {
      const node = section.nodes[nodeId]
      if (node == null) {
        issues.push({ severity: "error", code: "missing-child", nodeId, path, message: `missing node "${nodeId}"` })
        return
      }
      if (active.has(nodeId)) {
        issues.push({ severity: "error", code: "cycle", nodeId, path, message: `cycle detected at "${nodeId}"` })
        return
      }

      reachable.add(nodeId)
      active.add(nodeId)

      const nodeContext = contextForNode(node, context)
      graph.nearestByNodeId.set(nodeId, nodeContext)
      graph.zoneByNodeId.set(nodeId, nodeContext.zoneId)

      const childIds = childIdsForNode(node)
      graph.childrenByNodeId.set(nodeId, childIds)
      assertColumnsWidth(section, node, issues, path)
      if (node.type === "table") assertTableGrid(node, issues, path)

      childIds.forEach((childId, childIndex) => {
        const child = section.nodes[childId]
        const childPath =
          node.type === "columns" ? `${path}.columnIds[${childIndex}]` :
          node.type === "table" ? `${path}.rowIds[${childIndex}]` :
          node.type === "table-row" ? `${path}.cellIds[${childIndex}]` :
          `${path}.childIds[${childIndex}]`

        if (child == null) {
          issues.push({
            severity: "error",
            code: "missing-child",
            nodeId: childId,
            parentId: node.id,
            path: childPath,
            message: `missing child "${childId}"`,
          })
          return
        }

        const allowed = NODE_CAPABILITIES[node.type].allowedChildTypes
        if (!allowed.includes(child.type)) {
          issues.push({
            severity: "error",
            code: "invalid-child-type",
            nodeId: child.id,
            parentId: node.id,
            path: childPath,
            message: `${node.type} child must be ${allowed.join(", ")}; got "${child.type}"`,
          })
        }

        if (graph.parentByNodeId.has(childId)) {
          issues.push({
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
            issues.push({
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
        issues.push({
          severity: "error",
          code: "invalid-zone-role",
          nodeId: zoneId,
          path: zonePath,
          message: `section zone id must reference zone; got "${zone?.type}"`,
        })
        return
      }
      graph.parentByNodeId.set(zoneId, { kind: "section", sectionId: section.id, childField: "zoneIds", index: zoneIndex })
      const baseContext: NearestContext = {
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
        issues.push({
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

export function assertDocument(doc: unknown): asserts doc is DocumentNode {
  buildRelationshipGraph(doc as DocumentNode)
}

export function getTextBlocks(graph: RelationshipGraph): TextBlockNode[] {
  return [...graph.nodesById.values()].filter((node): node is TextBlockNode => node.type === "text-block")
}

export function getZones(graph: RelationshipGraph): ZoneNode[] {
  return [...graph.zonesById.values()]
}

export function getColumns(graph: RelationshipGraph): ColumnNode[] {
  return [...graph.nodesById.values()].filter((node): node is ColumnNode => node.type === "column")
}

export function getTables(graph: RelationshipGraph): TableNode[] {
  return [...graph.nodesById.values()].filter((node): node is TableNode => node.type === "table")
}

export function getTableRows(graph: RelationshipGraph): TableRowNode[] {
  return [...graph.nodesById.values()].filter((node): node is TableRowNode => node.type === "table-row")
}

export function getTableCells(graph: RelationshipGraph): TableCellNode[] {
  return [...graph.nodesById.values()].filter((node): node is TableCellNode => node.type === "table-cell")
}
