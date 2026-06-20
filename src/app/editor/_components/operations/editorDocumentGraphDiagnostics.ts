import {
  buildDocumentGraphIndexV2,
  getDocumentGraphSiblingContextV2,
  type DocumentGraphIndexV2,
  type NodeParentRef,
} from "@/document"
import type { DocumentNode, DocumentNodeV2, FlowTableNode, LayoutNode } from "@/schema"
import type { EditorState } from "../editorReducer"
import type { EditorOperationEnvelope } from "./editorOperationTypes"

type CurrentGraphParentKind = "section-root" | "childIds" | "rowIds" | "cellIds" | "missing"
type CurrentGraphOperationSurface = "document" | "flow-row" | "table" | "inline" | "unknown"

export interface EditorDocumentGraphTargetContext {
  nodeId: string
  sectionId?: string
  nodeType?: string
  parentKind: CurrentGraphParentKind
  parentId?: string
  parentType?: string
  tableId?: string
  siblingIndex?: number
  siblingCount?: number
  operationSurface: CurrentGraphOperationSurface
  canDelete?: boolean
  canDuplicate?: boolean
  canReorder?: boolean
}

export interface EditorDocumentGraphDiagnostics {
  graphSourceModel: "current-document" | "document-v2"
  graphContextResolved: boolean
  graphTargetContexts: EditorDocumentGraphTargetContext[]
}

const CURRENT_NODE_OPERATION_SURFACE: Record<string, CurrentGraphOperationSurface> = {
  body: "document",
  stack: "flow-row",
  row: "flow-row",
  "flow-row": "flow-row",
  "flow-stack": "flow-row",
  "flow-table": "table",
  "flow-table-row": "table",
  "flow-table-cell": "table",
  paragraph: "inline",
  spacer: "document",
  divider: "document",
  "page-break": "document",
  toc: "document",
}

const CURRENT_NODE_MUTATION_CAPABILITIES: Record<string, Pick<EditorDocumentGraphTargetContext, "canDelete" | "canDuplicate" | "canReorder">> = {
  body: { canDelete: false, canDuplicate: false, canReorder: false },
  "flow-table-row": { canDelete: false, canDuplicate: false, canReorder: false },
  "flow-table-cell": { canDelete: false, canDuplicate: false, canReorder: false },
}

function childIdsForCurrentNode(node: LayoutNode | FlowTableNode["nodes"][string]): readonly string[] {
  return "childIds" in node && Array.isArray(node.childIds) ? node.childIds : []
}

function currentNodeSurface(nodeType: string | undefined): CurrentGraphOperationSurface {
  if (nodeType == null) return "unknown"
  return CURRENT_NODE_OPERATION_SURFACE[nodeType] ?? "unknown"
}

function currentNodeCapabilities(nodeType: string | undefined): Pick<EditorDocumentGraphTargetContext, "canDelete" | "canDuplicate" | "canReorder"> {
  if (nodeType == null) return {}
  return CURRENT_NODE_MUTATION_CAPABILITIES[nodeType] ?? { canDelete: true, canDuplicate: true, canReorder: true }
}

function createCurrentGraphTargetContext(options: Omit<EditorDocumentGraphTargetContext, "operationSurface" | "canDelete" | "canDuplicate" | "canReorder">): EditorDocumentGraphTargetContext {
  return {
    ...options,
    operationSurface: currentNodeSurface(options.nodeType),
    ...currentNodeCapabilities(options.nodeType),
  }
}

function sectionRootEntries(section: DocumentNode["document"]["sections"][number]): Array<[string, string | null | undefined]> {
  return [
    ["body", section.bodyRootId],
    ["header", section.headerRootId],
    ["headerFirstPage", section.headerFirstPageRootId],
    ["footer", section.footerRootId],
    ["footerFirstPage", section.footerFirstPageRootId],
  ]
}

function findSectionNodeParent(
  section: DocumentNode["document"]["sections"][number],
  nodeId: string,
): EditorDocumentGraphTargetContext | null {
  for (const [root, rootId] of sectionRootEntries(section)) {
    if (rootId === nodeId) {
      const node = section.nodes[nodeId]
      return createCurrentGraphTargetContext({
        nodeId,
        sectionId: section.id,
        nodeType: node?.type,
        parentKind: "section-root",
        parentId: root,
        siblingIndex: 0,
        siblingCount: 1,
      })
    }
  }

  const node = section.nodes[nodeId]
  if (node == null) return null

  for (const parent of Object.values(section.nodes)) {
    const siblingIds = childIdsForCurrentNode(parent)
    const siblingIndex = siblingIds.indexOf(nodeId)
    if (siblingIndex >= 0) {
      return createCurrentGraphTargetContext({
        nodeId,
        sectionId: section.id,
        nodeType: node.type,
        parentKind: "childIds",
        parentId: parent.id,
        parentType: parent.type,
        siblingIndex,
        siblingCount: siblingIds.length,
      })
    }
  }

  return createCurrentGraphTargetContext({
    nodeId,
    sectionId: section.id,
    nodeType: node.type,
    parentKind: "missing",
  })
}

function findFlowTableInternalNodeParent(
  section: DocumentNode["document"]["sections"][number],
  table: FlowTableNode,
  nodeId: string,
): EditorDocumentGraphTargetContext | null {
  const node = table.nodes[nodeId]
  if (node == null) return null

  const rowIndex = table.rowIds.indexOf(nodeId)
  if (rowIndex >= 0) {
    return createCurrentGraphTargetContext({
      nodeId,
      sectionId: section.id,
      nodeType: node.type,
      parentKind: "rowIds",
      parentId: table.id,
      parentType: table.type,
      tableId: table.id,
      siblingIndex: rowIndex,
      siblingCount: table.rowIds.length,
    })
  }

  for (const rowId of table.rowIds) {
    const row = table.nodes[rowId]
    if (row?.type !== "flow-table-row") continue
    const cellIndex = row.cellIds.indexOf(nodeId)
    if (cellIndex >= 0) {
      return createCurrentGraphTargetContext({
        nodeId,
        sectionId: section.id,
        nodeType: node.type,
        parentKind: "cellIds",
        parentId: row.id,
        parentType: row.type,
        tableId: table.id,
        siblingIndex: cellIndex,
        siblingCount: row.cellIds.length,
      })
    }
  }

  for (const candidate of Object.values(table.nodes)) {
    const siblingIds = childIdsForCurrentNode(candidate)
    const siblingIndex = siblingIds.indexOf(nodeId)
    if (siblingIndex >= 0) {
      return createCurrentGraphTargetContext({
        nodeId,
        sectionId: section.id,
        nodeType: node.type,
        parentKind: "childIds",
        parentId: candidate.id,
        parentType: candidate.type,
        tableId: table.id,
        siblingIndex,
        siblingCount: siblingIds.length,
      })
    }
  }

  return createCurrentGraphTargetContext({
    nodeId,
    sectionId: section.id,
    nodeType: node.type,
    parentKind: "missing",
    tableId: table.id,
  })
}

function resolveCurrentGraphTargetContext(doc: DocumentNode, nodeId: string): EditorDocumentGraphTargetContext {
  for (const section of doc.document.sections) {
    const sectionNodeContext = findSectionNodeParent(section, nodeId)
    if (sectionNodeContext != null) return sectionNodeContext

    for (const node of Object.values(section.nodes)) {
      if (node.type !== "flow-table") continue
      const tableContext = findFlowTableInternalNodeParent(section, node as unknown as FlowTableNode, nodeId)
      if (tableContext != null) return tableContext
    }
  }

  return createCurrentGraphTargetContext({
    nodeId,
    parentKind: "missing",
  })
}

function parentIdForV2(parent: NodeParentRef | undefined): string | undefined {
  if (parent == null) return undefined
  if (parent.kind === "section-root") return parent.root
  if (parent.kind === "childIds") return parent.parentId
  if (parent.kind === "rowIds") return parent.tableId
  return parent.rowId
}

function parentTypeForV2(index: DocumentGraphIndexV2, parent: NodeParentRef | undefined): string | undefined {
  if (parent == null || parent.kind === "section-root") return undefined
  const parentId = parent.kind === "childIds"
    ? parent.parentId
    : parent.kind === "rowIds"
      ? parent.tableId
      : parent.rowId
  return index.nodeById.get(parentId)?.type
}

function siblingIndexForV2(parent: NodeParentRef | undefined): number | undefined {
  if (parent == null) return undefined
  return parent.kind === "section-root" ? 0 : parent.index
}

function resolveDocumentV2GraphTargetContext(
  index: DocumentGraphIndexV2,
  nodeId: string,
): EditorDocumentGraphTargetContext {
  const node = index.nodeById.get(nodeId)
  const siblingContext = getDocumentGraphSiblingContextV2(index, nodeId)
  const parent = siblingContext?.parent
  const capabilities = node == null ? undefined : index.capabilitiesByType[node.type]

  return {
    nodeId,
    sectionId: index.sectionById.get(nodeId),
    nodeType: node?.type,
    parentKind: parent?.kind ?? "missing",
    parentId: parentIdForV2(parent),
    parentType: parentTypeForV2(index, parent),
    tableId: index.tableByDescendantId.get(nodeId),
    siblingIndex: siblingIndexForV2(parent),
    siblingCount: siblingContext?.siblingIds.length,
    operationSurface: capabilities?.operationSurface ?? "unknown",
    canDelete: capabilities?.canBeDeleted,
    canDuplicate: capabilities?.canBeDuplicated,
    canReorder: capabilities?.canBeReordered,
  }
}

export function createDocumentGraphDiagnostics(state: EditorState, nodeIds: readonly string[]): EditorDocumentGraphDiagnostics {
  const contexts = nodeIds.map((nodeId) => resolveCurrentGraphTargetContext(state.doc, nodeId))
  return {
    graphSourceModel: "current-document",
    graphContextResolved: contexts.every((context) => context.nodeType != null && context.parentKind !== "missing"),
    graphTargetContexts: contexts,
  }
}

export function createDocumentGraphDiagnosticsFromV2(
  doc: DocumentNodeV2,
  nodeIds: readonly string[],
  index: DocumentGraphIndexV2 = buildDocumentGraphIndexV2(doc),
): EditorDocumentGraphDiagnostics {
  const contexts = nodeIds.map((nodeId) => resolveDocumentV2GraphTargetContext(index, nodeId))
  return {
    graphSourceModel: "document-v2",
    graphContextResolved: contexts.every((context) => context.nodeType != null && context.parentKind !== "missing"),
    graphTargetContexts: contexts,
  }
}

export function createOperationDocumentGraphDiagnostics(
  state: EditorState,
  operation: EditorOperationEnvelope | undefined,
  nodeIds: readonly string[],
): EditorDocumentGraphDiagnostics {
  if (operation?.runtime?.documentGraph?.sourceModel === "document-v2") {
    return createDocumentGraphDiagnosticsFromV2(
      operation.runtime.documentGraph.document,
      nodeIds,
      operation.runtime.documentGraph.index,
    )
  }

  return createDocumentGraphDiagnostics(state, nodeIds)
}
