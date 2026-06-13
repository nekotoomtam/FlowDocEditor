import { buildStyleManagerState, resolveListMarkers } from "@/document"
import type { StyleManagerListGroupItem } from "@/document"
import type {
  DocumentNode,
  FlowTableCellNode,
  FlowTableNode,
  FlowTableRowNode,
  LayoutNode,
} from "@/schema"
import { buildOutlineModel, type OutlineSectionModel } from "./outlineModel"

export interface OutlinePanelModel {
  outlineSections: OutlineSectionModel[]
  listGroupState: StyleManagerListGroupItem[]
  markerTextByParagraphId: Map<string, string>
  labelByNodeId: Map<string, string>
}

export interface OutlinePanelModelCache {
  structureSignature: string
  outlineSections: OutlineSectionModel[]
  listGroupState: StyleManagerListGroupItem[]
  markerTextByParagraphId: Map<string, string>
  labelByNodeId: Map<string, string>
}

export type OutlineLabelUpdatePolicy =
  | { kind: "full" }
  | { kind: "frozen-active-edit" }
  | { kind: "single-node"; nodeId: string | null }

export interface OutlinePanelModelStats {
  structureCacheHit: boolean
  labelUpdatePolicy: OutlineLabelUpdatePolicy["kind"]
  labelSnapshotUsed: boolean
  singleLabelUpdated: boolean
  fullLabelRefresh: boolean
  labelNodeCount: number
  outlineSectionCount: number
  outlineItemCount: number
}

type OutlineNodeRecord = Record<string, LayoutNode | FlowTableRowNode | FlowTableCellNode>

function getParaText(node: LayoutNode): string {
  if (node.type !== "paragraph") return ""
  return node.children
    .filter((child) => child.type === "text")
    .map((child) => (child as { text: string }).text)
    .join("")
    .trim()
}

function labelForNode(node: LayoutNode | FlowTableNode | FlowTableRowNode | FlowTableCellNode): string | null {
  if (node.type === "paragraph") return getParaText(node as LayoutNode) || "(ว่าง)"
  if (node.type === "flow-table") return `Flow table ${node.rowIds.length}×${node.columns.length}`
  if (node.type === "row" || node.type === "flow-row") return `${node.childIds.length} คอลัมน์`
  return null
}

function appendStableRecordSignature(parts: string[], record: unknown): void {
  if (!record || typeof record !== "object") {
    parts.push(String(record))
    return
  }
  const entries = Object.entries(record as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  parts.push("{")
  for (const [key, value] of entries) {
    parts.push(key, ":")
    if (value && typeof value === "object") {
      appendStableRecordSignature(parts, value)
    } else {
      parts.push(String(value))
    }
    parts.push(";")
  }
  parts.push("}")
}

function appendNodeStructureSignature(
  parts: string[],
  nodes: OutlineNodeRecord,
  nodeId: string,
): void {
  const node = nodes[nodeId]
  if (!node) {
    parts.push("missing:", nodeId, "|")
    return
  }

  parts.push(node.id, ":", node.type, "|")

  if (node.type === "paragraph") {
    const list = node.props.list
    if (list) {
      parts.push(
        "list:",
        list.instanceId,
        ":",
        String(list.level),
        ":",
        list.itemId,
        ":",
        String(list.startAt ?? ""),
        "|",
      )
    }
    return
  }

  if (node.type === "body" || node.type === "stack" || node.type === "flow-stack") {
    parts.push("children:", node.childIds.join(","), "|")
    for (const childId of node.childIds) appendNodeStructureSignature(parts, nodes, childId)
    return
  }

  if (node.type === "row" || node.type === "flow-row") {
    parts.push("children:", node.childIds.join(","), "|")
    for (const childId of node.childIds) appendNodeStructureSignature(parts, nodes, childId)
    return
  }

  if (node.type === "flow-table") {
    const table = node as FlowTableNode
    parts.push("columns:", String(table.columns.length), "|rows:", table.rowIds.join(","), "|")
    for (const rowId of table.rowIds) appendNodeStructureSignature(parts, table.nodes as OutlineNodeRecord, rowId)
    return
  }

  if (node.type === "flow-table-row") {
    parts.push("cells:", node.cellIds.join(","), "|")
    for (const cellId of node.cellIds) appendNodeStructureSignature(parts, nodes, cellId)
    return
  }

  if (node.type === "flow-table-cell") {
    parts.push("children:", node.childIds.join(","), "|")
    for (const childId of node.childIds) appendNodeStructureSignature(parts, nodes, childId)
  }
}

export function buildOutlineStructureSignature(doc: DocumentNode): string {
  const parts: string[] = ["doc:"]
  appendStableRecordSignature(parts, doc.document.listInstances ?? {})
  appendStableRecordSignature(parts, doc.document.listStyles ?? {})
  for (const section of doc.document.sections) {
    parts.push("section:", section.id, ":", section.bodyRootId, "|")
    appendNodeStructureSignature(parts, section.nodes as OutlineNodeRecord, section.bodyRootId)
  }
  return parts.join("")
}

function addNodeLabels(
  labelByNodeId: Map<string, string>,
  nodes: OutlineNodeRecord,
  nodeId: string,
): void {
  const node = nodes[nodeId]
  if (!node) return

  if (node.type === "paragraph") {
    labelByNodeId.set(node.id, getParaText(node as LayoutNode) || "(ว่าง)")
    return
  }

  if (node.type === "flow-table") {
    const table = node as FlowTableNode
    labelByNodeId.set(table.id, `Flow table ${table.rowIds.length}×${table.columns.length}`)
    for (const rowId of table.rowIds) addNodeLabels(labelByNodeId, table.nodes as OutlineNodeRecord, rowId)
    return
  }

  if (node.type === "row" || node.type === "flow-row") {
    labelByNodeId.set(node.id, `${node.childIds.length} คอลัมน์`)
  }

  if (node.type === "body" || node.type === "stack" || node.type === "flow-stack") {
    for (const childId of node.childIds) addNodeLabels(labelByNodeId, nodes, childId)
    return
  }

  if (node.type === "row" || node.type === "flow-row") {
    for (const childId of node.childIds) addNodeLabels(labelByNodeId, nodes, childId)
    return
  }

  if (node.type === "flow-table-row") {
    for (const cellId of node.cellIds) addNodeLabels(labelByNodeId, nodes, cellId)
    return
  }

  if (node.type === "flow-table-cell") {
    for (const childId of node.childIds) addNodeLabels(labelByNodeId, nodes, childId)
  }
}

export function buildOutlineNodeLabelMap(doc: DocumentNode): Map<string, string> {
  const labelByNodeId = new Map<string, string>()
  for (const section of doc.document.sections) {
    addNodeLabels(labelByNodeId, section.nodes as OutlineNodeRecord, section.bodyRootId)
  }
  return labelByNodeId
}

function findOutlineNodeById(
  nodes: OutlineNodeRecord,
  nodeId: string,
): LayoutNode | FlowTableNode | FlowTableRowNode | FlowTableCellNode | null {
  const node = nodes[nodeId]
  if (!node) return null

  if (node.id === nodeId) return node

  if (node.type === "body" || node.type === "stack" || node.type === "flow-stack" || node.type === "row" || node.type === "flow-row") {
    for (const childId of node.childIds) {
      const found = findOutlineNodeById(nodes, childId)
      if (found) return found
    }
    return null
  }

  if (node.type === "flow-table") {
    const tableNodes = node.nodes as OutlineNodeRecord
    for (const rowId of node.rowIds) {
      const found = findOutlineNodeById(tableNodes, rowId)
      if (found) return found
    }
    return null
  }

  if (node.type === "flow-table-row") {
    for (const cellId of node.cellIds) {
      const found = findOutlineNodeById(nodes, cellId)
      if (found) return found
    }
    return null
  }

  if (node.type === "flow-table-cell") {
    for (const childId of node.childIds) {
      const found = findOutlineNodeById(nodes, childId)
      if (found) return found
    }
  }

  return null
}

function findDocumentNodeById(
  doc: DocumentNode,
  nodeId: string | null,
): LayoutNode | FlowTableNode | FlowTableRowNode | FlowTableCellNode | null {
  if (!nodeId) return null
  for (const section of doc.document.sections) {
    const found = findOutlineNodeById(section.nodes as OutlineNodeRecord, nodeId)
    if (found) return found
  }
  return null
}

function countOutlineItems(items: OutlineSectionModel["items"]): number {
  return items.reduce((total, item) => total + 1 + countOutlineItems(item.children), 0)
}

function buildFreshOutlineModel(
  doc: DocumentNode,
  structureSignature: string,
  labelByNodeId: Map<string, string>,
): OutlinePanelModelCache {
  const listGroupState = buildStyleManagerState(doc).listGroups.items
  const markerTextByParagraphId = new Map(
    Array.from(resolveListMarkers(doc).entries()).map(([paragraphId, marker]) => [paragraphId, marker.markerText]),
  )
  const outlineSections = buildOutlineModel(doc, {
    listGroupIds: listGroupState.map((group) => group.id),
  })

  return {
    structureSignature,
    outlineSections,
    listGroupState,
    markerTextByParagraphId,
    labelByNodeId,
  }
}

export function buildOutlinePanelModel(
  doc: DocumentNode,
  previousCache: OutlinePanelModelCache | null,
  options: { labelUpdatePolicy?: OutlineLabelUpdatePolicy } = {},
): { model: OutlinePanelModel; cache: OutlinePanelModelCache; stats: OutlinePanelModelStats } {
  const structureSignature = buildOutlineStructureSignature(doc)
  const structureCacheHit = previousCache?.structureSignature === structureSignature
  const labelUpdatePolicy = options.labelUpdatePolicy ?? { kind: "full" }

  let labelByNodeId: Map<string, string>
  let labelSnapshotUsed = false
  let singleLabelUpdated = false
  let fullLabelRefresh = false

  if (structureCacheHit && previousCache && labelUpdatePolicy.kind === "frozen-active-edit") {
    labelByNodeId = previousCache.labelByNodeId
    labelSnapshotUsed = true
  } else if (structureCacheHit && previousCache && labelUpdatePolicy.kind === "single-node") {
    const node = findDocumentNodeById(doc, labelUpdatePolicy.nodeId)
    const label = node ? labelForNode(node) : null
    if (node && label !== null) {
      labelByNodeId = new Map(previousCache.labelByNodeId)
      labelByNodeId.set(node.id, label)
      singleLabelUpdated = true
    } else {
      labelByNodeId = buildOutlineNodeLabelMap(doc)
      fullLabelRefresh = true
    }
  } else {
    labelByNodeId = buildOutlineNodeLabelMap(doc)
    fullLabelRefresh = true
  }

  const cache = structureCacheHit && previousCache
    ? (labelByNodeId === previousCache.labelByNodeId ? previousCache : { ...previousCache, labelByNodeId })
    : buildFreshOutlineModel(doc, structureSignature, labelByNodeId)

  return {
    cache,
    model: {
      outlineSections: cache.outlineSections,
      listGroupState: cache.listGroupState,
      markerTextByParagraphId: cache.markerTextByParagraphId,
      labelByNodeId: cache.labelByNodeId,
    },
    stats: {
      structureCacheHit: Boolean(structureCacheHit),
      labelUpdatePolicy: labelUpdatePolicy.kind,
      labelSnapshotUsed,
      singleLabelUpdated,
      fullLabelRefresh,
      labelNodeCount: cache.labelByNodeId.size,
      outlineSectionCount: cache.outlineSections.length,
      outlineItemCount: cache.outlineSections.reduce((total, section) => total + countOutlineItems(section.items), 0),
    },
  }
}
