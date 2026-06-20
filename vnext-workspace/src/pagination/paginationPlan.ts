import type { AuthoredNode, DocumentNode, DocumentSection, UnitValue } from "../schema/document.js"
import type { NodeId, RelationshipGraph, SectionId } from "../graph/relationshipGraph.js"
import { buildRelationshipGraph } from "../graph/relationshipGraph.js"
import type { VNextOperationResult } from "../operations/documentOperations.js"

const A4_PORTRAIT_PT = {
  width: 595.28,
  height: 841.89,
} as const

export type VNextPaginationSplitPolicy =
  | "container"
  | "line"
  | "columns"
  | "table"
  | "table-row"
  | "table-cell"
  | "generated"
  | "forced-break"
  | "atomic"

export interface VNextPageBox {
  size: "A4"
  orientation: "portrait" | "landscape"
  widthPt: number
  heightPt: number
  marginPt: {
    top: number
    right: number
    bottom: number
    left: number
  }
  headerReservedPt: number
  footerReservedPt: number
  headerFooterHorizontalMode: "body" | "full"
  contentXPt: number
  contentYPt: number
  contentWidthPt: number
  contentHeightPt: number
}

export interface VNextPaginationSourceItem {
  id: string
  sectionId: SectionId
  zoneId: NodeId
  nodeId: NodeId
  nodeType: AuthoredNode["type"]
  parentNodeId: NodeId | null
  order: number
  depth: number
  operationSurface: string
  splitPolicy: VNextPaginationSplitPolicy
  nearest: {
    blockId: NodeId | null
    textBlockId: NodeId | null
    columnsId: NodeId | null
    columnId: NodeId | null
    tableId: NodeId | null
    tableRowId: NodeId | null
    tableCellId: NodeId | null
  }
}

export interface VNextZonePaginationPlan {
  zoneId: NodeId
  role: string
  sourceItemIds: string[]
}

export interface VNextSectionPaginationPlan {
  sectionId: SectionId
  pageBox: VNextPageBox
  zones: VNextZonePaginationPlan[]
}

export interface VNextPaginationPlan {
  documentId: string
  source: "vnext-document"
  status: "planning-only"
  measurementStatus: "not-measured"
  sections: VNextSectionPaginationPlan[]
  sourceItems: VNextPaginationSourceItem[]
  minimumPageCount: number
}

export interface VNextExportPlan {
  documentId: string
  source: "vnext-pagination-plan"
  status: "requires-measured-pagination"
  paginationPlan: VNextPaginationPlan
  rendererContract: {
    pdf: {
      consumes: "measured-pagination-output"
      mayRelayout: false
    }
    docx: {
      consumes: "measured-pagination-output"
      mayRelayout: false
      mayUseSourceDocumentForStructure: true
    }
  }
}

export interface VNextPaginationInvalidation {
  status: "stale" | "unchanged"
  sourceOperationKind: string
  affectedSectionIds: SectionId[]
  affectedNodeIds: NodeId[]
  affectedTableIds: NodeId[]
  affectedTextBlockIds: NodeId[]
  exportReadiness: "stale" | "unchanged"
  reason: string
}

function unitToPt(value: UnitValue): number {
  if (value.unit === "pt") return value.value
  return Number(((value.value * 72) / 25.4).toFixed(2))
}

function pageSizePt(section: DocumentSection): { width: number; height: number } {
  if (section.page.orientation === "landscape") {
    return { width: A4_PORTRAIT_PT.height, height: A4_PORTRAIT_PT.width }
  }

  return A4_PORTRAIT_PT
}

function buildPageBox(section: DocumentSection): VNextPageBox {
  const size = pageSizePt(section)
  const marginPt = {
    top: unitToPt(section.page.margin.top),
    right: unitToPt(section.page.margin.right),
    bottom: unitToPt(section.page.margin.bottom),
    left: unitToPt(section.page.margin.left),
  }
  const headerReservedPt = section.page.headerReserved ?? 0
  const footerReservedPt = section.page.footerReserved ?? 0
  const contentXPt = marginPt.left
  const contentYPt = marginPt.top + headerReservedPt
  const contentWidthPt = Math.max(0, Number((size.width - marginPt.left - marginPt.right).toFixed(2)))
  const contentHeightPt = Math.max(0, Number((size.height - marginPt.top - marginPt.bottom - headerReservedPt - footerReservedPt).toFixed(2)))

  return {
    size: section.page.size,
    orientation: section.page.orientation,
    widthPt: size.width,
    heightPt: size.height,
    marginPt,
    headerReservedPt,
    footerReservedPt,
    headerFooterHorizontalMode: section.page.headerFooterHorizontalMode ?? "body",
    contentXPt,
    contentYPt,
    contentWidthPt,
    contentHeightPt,
  }
}

function splitPolicyForNode(node: AuthoredNode): VNextPaginationSplitPolicy {
  if (node.type === "zone" || node.type === "column") return "container"
  if (node.type === "text-block") return "line"
  if (node.type === "columns") return "columns"
  if (node.type === "table") return "table"
  if (node.type === "table-row") return "table-row"
  if (node.type === "table-cell") return "table-cell"
  if (node.type === "toc") return "generated"
  if (node.type === "page-break") return "forced-break"
  return "atomic"
}

function parentNodeId(graph: RelationshipGraph, nodeId: NodeId): NodeId | null {
  const parent = graph.parentByNodeId.get(nodeId)
  if (parent == null || parent.kind === "section") return null
  if (parent.kind === "zone") return parent.zoneId
  if (parent.kind === "columns") return parent.columnsId
  if (parent.kind === "column") return parent.columnId
  if (parent.kind === "table") return parent.tableId
  if (parent.kind === "table-row") return parent.rowId
  return parent.cellId
}

function collectSourceItemsForZone(
  graph: RelationshipGraph,
  section: DocumentSection,
  zoneId: NodeId,
  orderRef: { value: number },
): VNextPaginationSourceItem[] {
  const result: VNextPaginationSourceItem[] = []
  const visit = (nodeId: NodeId, depth: number): void => {
    const node = section.nodes[nodeId]
    const nearest = graph.nearestByNodeId.get(nodeId)
    if (node == null || nearest == null) return

    result.push({
      id: `${section.id}:${nodeId}`,
      sectionId: section.id,
      zoneId,
      nodeId,
      nodeType: node.type,
      parentNodeId: parentNodeId(graph, nodeId),
      order: orderRef.value,
      depth,
      operationSurface: graph.capabilitiesByType[node.type].operationSurface,
      splitPolicy: splitPolicyForNode(node),
      nearest: {
        blockId: nearest.blockId,
        textBlockId: nearest.textBlockId,
        columnsId: nearest.columnsId,
        columnId: nearest.columnId,
        tableId: nearest.tableId,
        tableRowId: nearest.tableRowId,
        tableCellId: nearest.tableCellId,
      },
    })
    orderRef.value += 1

    graph.childrenByNodeId.get(nodeId)?.forEach((childId) => visit(childId, depth + 1))
  }

  visit(zoneId, 0)
  return result
}

export function buildVNextPaginationPlan(document: DocumentNode): VNextPaginationPlan {
  const graph = buildRelationshipGraph(document)
  const sourceItems: VNextPaginationSourceItem[] = []
  const orderRef = { value: 0 }

  const sections = document.document.sections.map((section) => {
    const zones = section.zoneIds.map((zoneId) => {
      const zone = section.nodes[zoneId]
      const zoneItems = collectSourceItemsForZone(graph, section, zoneId, orderRef)
      sourceItems.push(...zoneItems)

      return {
        zoneId,
        role: zone?.type === "zone" ? zone.role : "unknown",
        sourceItemIds: zoneItems.map((item) => item.id),
      }
    })

    return {
      sectionId: section.id,
      pageBox: buildPageBox(section),
      zones,
    }
  })

  return {
    documentId: document.document.id,
    source: "vnext-document",
    status: "planning-only",
    measurementStatus: "not-measured",
    sections,
    sourceItems,
    minimumPageCount: document.document.sections.length,
  }
}

export function buildVNextExportPlan(document: DocumentNode): VNextExportPlan {
  const paginationPlan = buildVNextPaginationPlan(document)

  return {
    documentId: document.document.id,
    source: "vnext-pagination-plan",
    status: "requires-measured-pagination",
    paginationPlan,
    rendererContract: {
      pdf: {
        consumes: "measured-pagination-output",
        mayRelayout: false,
      },
      docx: {
        consumes: "measured-pagination-output",
        mayRelayout: false,
        mayUseSourceDocumentForStructure: true,
      },
    },
  }
}

export function resolveVNextPaginationInvalidation(result: VNextOperationResult): VNextPaginationInvalidation {
  if (!result.ok) {
    return {
      status: "unchanged",
      sourceOperationKind: result.command.kind,
      affectedSectionIds: [],
      affectedNodeIds: [],
      affectedTableIds: [],
      affectedTextBlockIds: [],
      exportReadiness: "unchanged",
      reason: result.reason,
    }
  }

  return {
    status: "stale",
    sourceOperationKind: result.operation.kind,
    affectedSectionIds: result.operation.scope.sectionIds,
    affectedNodeIds: result.operation.scope.nodeIds,
    affectedTableIds: result.operation.scope.tableIds,
    affectedTextBlockIds: result.operation.scope.textBlockIds,
    exportReadiness: "stale",
    reason: result.operation.renderInvalidation.lane,
  }
}
