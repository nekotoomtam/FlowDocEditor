import type { AuthoredNode, DocumentNode, DocumentSection, InlineNode, TableCellNode, TableRowNode, TextBlockNode, UnitValue } from "../schema/document.js"
import type { NodeId, ParentRef, RelationshipGraph, SectionId } from "../graph/relationshipGraph.js"
import { buildRelationshipGraph } from "../graph/relationshipGraph.js"
import { DocumentAssertionError } from "../errors.js"

export type VNextOperationSource = "user" | "automation" | "system"

export type VNextOperationCommand =
  | { kind: "node.delete"; source?: VNextOperationSource; nodeId: NodeId }
  | { kind: "node.duplicate"; source?: VNextOperationSource; nodeId: NodeId }
  | { kind: "node.reorder"; source?: VNextOperationSource; nodeId: NodeId; toIndex: number }
  | { kind: "columns.insert"; source?: VNextOperationSource; parentNodeId: NodeId; index: number; columnsId?: NodeId; columnCount: number }
  | { kind: "columns.layout.patch"; source?: VNextOperationSource; columnsId: NodeId; widthShares: number[] }
  | { kind: "text-block.insert"; source?: VNextOperationSource; parentNodeId: NodeId; index: number; node: TextBlockNode }
  | { kind: "text-block.text.replace"; source?: VNextOperationSource; nodeId: NodeId; children: InlineNode[] }
  | { kind: "table.row.insert"; source?: VNextOperationSource; tableId: NodeId; index: number; rowId?: NodeId }
  | { kind: "table.row.delete"; source?: VNextOperationSource; rowId: NodeId }
  | { kind: "table.column.insert"; source?: VNextOperationSource; tableId: NodeId; index: number; width?: UnitValue }
  | { kind: "table.column.delete"; source?: VNextOperationSource; tableId: NodeId; index: number }

export type VNextOperationKind = VNextOperationCommand["kind"]
export type VNextOperationFailureReason =
  | "invalid-command"
  | "invalid-document"
  | "target-not-found"
  | "unsupported-target"
  | "validation-failed"

export interface VNextOperationIssue {
  severity: "error" | "warning" | "info"
  code: string
  path: string
  nodeId?: NodeId
  message: string
}

export interface VNextOperationScope {
  sectionIds: SectionId[]
  zoneIds: NodeId[]
  nodeIds: NodeId[]
  parentNodeIds: NodeId[]
  tableIds: NodeId[]
  textBlockIds: NodeId[]
}

export interface VNextOperationRenderInvalidation {
  lane: "node-structure" | "node-layout" | "text-content"
  affectedNodeIds: NodeId[]
  affectedSectionIds: SectionId[]
  pageScope: { kind: "unknown"; reason: "pagination-not-integrated" }
}

export interface VNextOperationHistoryPolicy {
  kind: "single-entry"
  durableIntent: "structure" | "layout" | "content"
  summary: string
}

export interface VNextOperationCommitMetadata {
  kind: VNextOperationKind
  source: VNextOperationSource
  targetNodeIds: NodeId[]
  validationPolicy: "full"
  historyPolicy: VNextOperationHistoryPolicy
  renderInvalidation: VNextOperationRenderInvalidation
  scope: VNextOperationScope
}

export type VNextOperationResult =
  | {
      ok: true
      command: VNextOperationCommand
      document: DocumentNode
      operation: VNextOperationCommitMetadata
      issues: VNextOperationIssue[]
    }
  | {
      ok: false
      command: VNextOperationCommand
      document: DocumentNode
      reason: VNextOperationFailureReason
      issues: VNextOperationIssue[]
    }

export interface VNextOperationHistoryRecord {
  schemaVersion: 1
  status: "committed" | "rejected"
  operationKind: VNextOperationKind
  source: VNextOperationSource
  command: VNextOperationCommand
  targetNodeIds: NodeId[]
  scope: VNextOperationScope | null
  historyIntent: VNextOperationHistoryPolicy["durableIntent"] | null
  validationPolicy: VNextOperationCommitMetadata["validationPolicy"] | null
  renderInvalidation: VNextOperationRenderInvalidation | null
  failureReason?: VNextOperationFailureReason
  issues: VNextOperationIssue[]
}

export type VNextOperationHistoryReplayResult =
  | {
      ok: true
      document: DocumentNode
      replayedCount: number
      skippedRejectedCount: number
      issues: VNextOperationIssue[]
    }
  | {
      ok: false
      document: DocumentNode
      failedRecord: VNextOperationHistoryRecord
      failedResult: VNextOperationResult
      replayedCount: number
      skippedRejectedCount: number
      issues: VNextOperationIssue[]
    }

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function commandTargetNodeIds(command: VNextOperationCommand): NodeId[] {
  if (command.kind === "node.delete" || command.kind === "node.duplicate" || command.kind === "node.reorder") {
    return [command.nodeId]
  }
  if (command.kind === "columns.insert") {
    return command.columnsId == null ? [command.parentNodeId] : [command.parentNodeId, command.columnsId]
  }
  if (command.kind === "columns.layout.patch") {
    return [command.columnsId]
  }
  if (command.kind === "text-block.insert") {
    return [command.parentNodeId, command.node.id]
  }
  if (command.kind === "text-block.text.replace") {
    return [command.nodeId]
  }
  if (command.kind === "table.row.insert") {
    return command.rowId == null ? [command.tableId] : [command.tableId, command.rowId]
  }
  if (command.kind === "table.row.delete") {
    return [command.rowId]
  }
  return [command.tableId]
}

export function createVNextOperationHistoryRecord(result: VNextOperationResult): VNextOperationHistoryRecord {
  if (result.ok) {
    return {
      schemaVersion: 1,
      status: "committed",
      operationKind: result.operation.kind,
      source: result.operation.source,
      command: cloneJson(result.command),
      targetNodeIds: result.operation.targetNodeIds,
      scope: result.operation.scope,
      historyIntent: result.operation.historyPolicy.durableIntent,
      validationPolicy: result.operation.validationPolicy,
      renderInvalidation: result.operation.renderInvalidation,
      issues: result.issues,
    }
  }

  return {
    schemaVersion: 1,
    status: "rejected",
    operationKind: result.command.kind,
    source: result.command.source ?? "user",
    command: cloneJson(result.command),
    targetNodeIds: commandTargetNodeIds(result.command),
    scope: null,
    historyIntent: null,
    validationPolicy: null,
    renderInvalidation: null,
    failureReason: result.reason,
    issues: result.issues,
  }
}

export function appendVNextOperationHistoryRecord(
  records: readonly VNextOperationHistoryRecord[],
  record: VNextOperationHistoryRecord,
): VNextOperationHistoryRecord[] {
  return [...records.map((item) => cloneJson(item)), cloneJson(record)]
}

export function replayVNextOperationHistory(
  initialDocument: DocumentNode,
  records: readonly VNextOperationHistoryRecord[],
): VNextOperationHistoryReplayResult {
  let document = cloneJson(initialDocument)
  let replayedCount = 0
  let skippedRejectedCount = 0

  for (const record of records) {
    if (record.status === "rejected") {
      skippedRejectedCount += 1
      continue
    }

    const result = runVNextOperation(document, record.command)
    if (!result.ok) {
      return {
        ok: false,
        document,
        failedRecord: record,
        failedResult: result,
        replayedCount,
        skippedRejectedCount,
        issues: result.issues,
      }
    }

    document = result.document
    replayedCount += 1
  }

  return {
    ok: true,
    document,
    replayedCount,
    skippedRejectedCount,
    issues: [],
  }
}

function issue(
  code: string,
  message: string,
  options: { path?: string; nodeId?: NodeId; severity?: VNextOperationIssue["severity"] } = {},
): VNextOperationIssue {
  return {
    severity: options.severity ?? "error",
    code,
    path: options.path ?? "",
    nodeId: options.nodeId,
    message,
  }
}

function issuesFromUnknownError(error: unknown): VNextOperationIssue[] {
  if (error instanceof DocumentAssertionError) {
    return error.issues.map((documentIssue) => issue("document-invalid", documentIssue.message, {
      path: documentIssue.path,
    }))
  }

  if (error instanceof Error) {
    return [issue("unexpected-error", error.message)]
  }

  return [issue("unexpected-error", "unknown operation error")]
}

function graphOrFailure(command: VNextOperationCommand, document: DocumentNode): RelationshipGraph | VNextOperationResult {
  try {
    return buildRelationshipGraph(document)
  } catch (error) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: issuesFromUnknownError(error),
    }
  }
}

function sectionForNode(document: DocumentNode, graph: RelationshipGraph, nodeId: NodeId): DocumentSection | null {
  const sectionId = graph.sectionByNodeId.get(nodeId)
  if (sectionId == null) return null
  return document.document.sections.find((section) => section.id === sectionId) ?? null
}

function parentNodeId(parent: ParentRef): NodeId | null {
  if (parent.kind === "section") return null
  if (parent.kind === "zone") return parent.zoneId
  if (parent.kind === "columns") return parent.columnsId
  if (parent.kind === "column") return parent.columnId
  if (parent.kind === "table") return parent.tableId
  if (parent.kind === "table-row") return parent.rowId
  return parent.cellId
}

function childListForParent(section: DocumentSection, parent: ParentRef): string[] | null {
  if (parent.kind === "section") {
    return section.zoneIds
  }

  const ownerId = parentNodeId(parent)
  if (ownerId == null) return null
  const owner = section.nodes[ownerId]

  if (parent.kind === "zone" && owner?.type === "zone") return owner.childIds
  if (parent.kind === "columns" && owner?.type === "columns") return owner.columnIds
  if (parent.kind === "column" && owner?.type === "column") return owner.childIds
  if (parent.kind === "table" && owner?.type === "table") return owner.rowIds
  if (parent.kind === "table-row" && owner?.type === "table-row") return owner.cellIds
  if (parent.kind === "table-cell" && owner?.type === "table-cell") return owner.childIds

  return null
}

function childListForOwnerNode(node: AuthoredNode): string[] | null {
  if (node.type === "zone" || node.type === "column" || node.type === "table-cell") return node.childIds
  if (node.type === "columns") return node.columnIds
  if (node.type === "table") return node.rowIds
  if (node.type === "table-row") return node.cellIds
  return null
}

function collectDocumentNodeIds(document: DocumentNode): Set<NodeId> {
  return new Set(document.document.sections.flatMap((section) => Object.keys(section.nodes)))
}

function uniqueNodeId(baseId: NodeId, usedIds: Set<NodeId>): NodeId {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId)
    return baseId
  }

  let suffix = 2
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1
  }

  const id = `${baseId}-${suffix}`
  usedIds.add(id)
  return id
}

function duplicateInlineChildren(nodeId: NodeId, children: InlineNode[]): InlineNode[] {
  return children.map((child, index) => ({ ...cloneJson(child), id: `${nodeId}-inline-${index + 1}` }))
}

function columnWidthShares(columnCount: number): number[] {
  const shares: number[] = []
  let total = 0

  for (let index = 0; index < columnCount; index += 1) {
    const share = index === columnCount - 1 ? Number((100 - total).toFixed(2)) : Number((100 / columnCount).toFixed(2))
    shares.push(share)
    total += share
  }

  return shares
}

function rewriteNodeIds(node: AuthoredNode, idMap: Map<NodeId, NodeId>): AuthoredNode {
  const clone = cloneJson(node)
  clone.id = idMap.get(node.id) ?? node.id

  if (clone.type === "zone" || clone.type === "column" || clone.type === "table-cell") {
    clone.childIds = clone.childIds.map((childId) => idMap.get(childId) ?? childId)
  } else if (clone.type === "columns") {
    clone.columnIds = clone.columnIds.map((childId) => idMap.get(childId) ?? childId)
  } else if (clone.type === "table") {
    clone.rowIds = clone.rowIds.map((childId) => idMap.get(childId) ?? childId)
  } else if (clone.type === "table-row") {
    clone.cellIds = clone.cellIds.map((childId) => idMap.get(childId) ?? childId)
  } else if (clone.type === "text-block") {
    clone.children = duplicateInlineChildren(clone.id, clone.children)
  }

  return clone
}

function successFromValidatedDocument(
  command: VNextOperationCommand,
  originalDocument: DocumentNode,
  mutatedDocument: DocumentNode,
  metadataFromGraph: (graph: RelationshipGraph) => Omit<VNextOperationCommitMetadata, "source">,
): VNextOperationResult {
  try {
    const graph = buildRelationshipGraph(mutatedDocument)
    return {
      ok: true,
      command,
      document: mutatedDocument,
      operation: {
        ...metadataFromGraph(graph),
        source: command.source ?? "user",
      },
      issues: [],
    }
  } catch (error) {
    return {
      ok: false,
      command,
      document: originalDocument,
      reason: "validation-failed",
      issues: issuesFromUnknownError(error),
    }
  }
}

function collectDescendantIds(graph: RelationshipGraph, nodeId: NodeId): NodeId[] {
  const result: NodeId[] = []
  const visit = (currentId: NodeId): void => {
    result.push(currentId)
    graph.childrenByNodeId.get(currentId)?.forEach(visit)
  }

  visit(nodeId)
  return result
}

function scopeFromNodes(graph: RelationshipGraph, nodeIds: NodeId[], parentIds: NodeId[] = []): VNextOperationScope {
  const sectionIds = new Set<SectionId>()
  const zoneIds = new Set<NodeId>()
  const tableIds = new Set<NodeId>()
  const textBlockIds = new Set<NodeId>()

  nodeIds.forEach((nodeId) => {
    const sectionId = graph.sectionByNodeId.get(nodeId)
    const nearest = graph.nearestByNodeId.get(nodeId)
    if (sectionId != null) sectionIds.add(sectionId)
    if (nearest?.zoneId != null) zoneIds.add(nearest.zoneId)
    if (nearest?.tableId != null) tableIds.add(nearest.tableId)
    if (nearest?.textBlockId != null) textBlockIds.add(nearest.textBlockId)
  })

  return {
    sectionIds: [...sectionIds],
    zoneIds: [...zoneIds],
    nodeIds: [...new Set(nodeIds)],
    parentNodeIds: [...new Set(parentIds)],
    tableIds: [...tableIds],
    textBlockIds: [...textBlockIds],
  }
}

function renderInvalidation(
  lane: VNextOperationRenderInvalidation["lane"],
  scope: VNextOperationScope,
): VNextOperationRenderInvalidation {
  return {
    lane,
    affectedNodeIds: scope.nodeIds,
    affectedSectionIds: scope.sectionIds,
    pageScope: { kind: "unknown", reason: "pagination-not-integrated" },
  }
}

function commitMutatedDocument(
  command: VNextOperationCommand,
  originalDocument: DocumentNode,
  mutatedDocument: DocumentNode,
  metadata: Omit<VNextOperationCommitMetadata, "source">,
): VNextOperationResult {
  try {
    buildRelationshipGraph(mutatedDocument)
  } catch (error) {
    return {
      ok: false,
      command,
      document: originalDocument,
      reason: "validation-failed",
      issues: issuesFromUnknownError(error),
    }
  }

  return {
    ok: true,
    command,
    document: mutatedDocument,
    operation: {
      ...metadata,
      source: command.source ?? "user",
    },
    issues: [],
  }
}

function deleteNode(document: DocumentNode, command: Extract<VNextOperationCommand, { kind: "node.delete" }>): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const node = graph.nodesById.get(command.nodeId)
  if (node == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `node "${command.nodeId}" was not found`, { nodeId: command.nodeId })],
    }
  }

  if (!graph.capabilitiesByType[node.type].canBeDeleted) {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("cannot-delete", `${node.type} cannot be deleted by node.delete`, { nodeId: node.id })],
    }
  }

  const parent = graph.parentByNodeId.get(node.id)
  if (parent == null) {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("missing-parent", `node "${node.id}" has no parent ref`, { nodeId: node.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, node.id)
  if (section == null) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("missing-section", `node "${node.id}" has no section`, { nodeId: node.id })],
    }
  }

  const childList = childListForParent(section, parent)
  if (childList == null) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("invalid-parent", `node "${node.id}" parent list could not be resolved`, { nodeId: node.id })],
    }
  }

  const deleteIds = collectDescendantIds(graph, node.id)
  childList.splice(parent.index, 1)
  deleteIds.forEach((deleteId) => {
    delete section.nodes[deleteId]
  })

  const parentId = parentNodeId(parent)
  const scope = scopeFromNodes(graph, deleteIds, parentId == null ? [] : [parentId])

  return commitMutatedDocument(command, document, mutated, {
    kind: command.kind,
    targetNodeIds: [node.id],
    validationPolicy: "full",
    historyPolicy: {
      kind: "single-entry",
      durableIntent: "structure",
      summary: `delete ${node.type} ${node.id}`,
    },
    renderInvalidation: renderInvalidation("node-structure", scope),
    scope,
  })
}

function duplicateNode(document: DocumentNode, command: Extract<VNextOperationCommand, { kind: "node.duplicate" }>): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const node = graph.nodesById.get(command.nodeId)
  if (node == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `node "${command.nodeId}" was not found`, { nodeId: command.nodeId })],
    }
  }

  if (!graph.capabilitiesByType[node.type].canBeDuplicated) {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("cannot-duplicate", `${node.type} cannot be duplicated by node.duplicate`, { nodeId: node.id })],
    }
  }

  const parent = graph.parentByNodeId.get(node.id)
  if (parent == null) {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("missing-parent", `node "${node.id}" has no parent ref`, { nodeId: node.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, node.id)
  if (section == null) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("missing-section", `node "${node.id}" has no section`, { nodeId: node.id })],
    }
  }

  const childList = childListForParent(section, parent)
  if (childList == null) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("invalid-parent", `node "${node.id}" parent list could not be resolved`, { nodeId: node.id })],
    }
  }

  const duplicateIds = collectDescendantIds(graph, node.id)
  const usedIds = collectDocumentNodeIds(mutated)
  const idMap = new Map<NodeId, NodeId>()
  duplicateIds.forEach((sourceId) => {
    idMap.set(sourceId, uniqueNodeId(`${sourceId}-copy`, usedIds))
  })

  duplicateIds.forEach((sourceId) => {
    const sourceNode = graph.nodesById.get(sourceId)
    if (sourceNode != null) {
      const duplicated = rewriteNodeIds(sourceNode, idMap)
      section.nodes[duplicated.id] = duplicated
    }
  })

  const duplicatedRootId = idMap.get(node.id)
  if (duplicatedRootId == null) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("duplicate-failed", `node "${node.id}" could not be duplicated`, { nodeId: node.id })],
    }
  }

  childList.splice(parent.index + 1, 0, duplicatedRootId)
  const parentId = parentNodeId(parent)
  const affectedIds = [node.id, ...idMap.values()]

  return successFromValidatedDocument(command, document, mutated, (finalGraph) => {
    const scope = scopeFromNodes(finalGraph, affectedIds, parentId == null ? [] : [parentId])
    return {
      kind: command.kind,
      targetNodeIds: [node.id, duplicatedRootId],
      validationPolicy: "full",
      historyPolicy: {
        kind: "single-entry",
        durableIntent: "structure",
        summary: `duplicate ${node.type} ${node.id}`,
      },
      renderInvalidation: renderInvalidation("node-structure", scope),
      scope,
    }
  })
}

function reorderNode(document: DocumentNode, command: Extract<VNextOperationCommand, { kind: "node.reorder" }>): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const node = graph.nodesById.get(command.nodeId)
  if (node == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `node "${command.nodeId}" was not found`, { nodeId: command.nodeId })],
    }
  }

  if (!Number.isInteger(command.toIndex) || command.toIndex < 0) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-index", `toIndex must be a non-negative integer`, { nodeId: node.id })],
    }
  }

  if (!graph.capabilitiesByType[node.type].canBeReordered) {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("cannot-reorder", `${node.type} cannot be reordered by node.reorder`, { nodeId: node.id })],
    }
  }

  const parent = graph.parentByNodeId.get(node.id)
  if (parent == null) {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("missing-parent", `node "${node.id}" has no parent ref`, { nodeId: node.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, node.id)
  if (section == null) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("missing-section", `node "${node.id}" has no section`, { nodeId: node.id })],
    }
  }

  const childList = childListForParent(section, parent)
  if (childList == null) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("invalid-parent", `node "${node.id}" parent list could not be resolved`, { nodeId: node.id })],
    }
  }

  if (command.toIndex >= childList.length) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-index", `toIndex must be less than sibling count ${childList.length}`, { nodeId: node.id })],
    }
  }

  childList.splice(parent.index, 1)
  childList.splice(command.toIndex, 0, node.id)

  const parentId = parentNodeId(parent)
  const scope = scopeFromNodes(graph, [node.id], parentId == null ? [] : [parentId])

  return commitMutatedDocument(command, document, mutated, {
    kind: command.kind,
    targetNodeIds: [node.id],
    validationPolicy: "full",
    historyPolicy: {
      kind: "single-entry",
      durableIntent: "structure",
      summary: `reorder ${node.type} ${node.id}`,
    },
    renderInvalidation: renderInvalidation("node-structure", scope),
    scope,
  })
}

function insertColumns(document: DocumentNode, command: Extract<VNextOperationCommand, { kind: "columns.insert" }>): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const parentNode = graph.nodesById.get(command.parentNodeId)
  if (parentNode == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `parent node "${command.parentNodeId}" was not found`, { nodeId: command.parentNodeId })],
    }
  }

  if (!Number.isInteger(command.index) || command.index < 0) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-index", "index must be a non-negative integer", { nodeId: parentNode.id })],
    }
  }

  if (!Number.isInteger(command.columnCount) || command.columnCount < 1 || command.columnCount > 6) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-column-count", "columnCount must be an integer from 1 to 6", { nodeId: parentNode.id })],
    }
  }

  if (!graph.capabilitiesByType[parentNode.type].allowedChildTypes.includes("columns")) {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("cannot-insert-columns", `${parentNode.type} cannot contain columns children`, { nodeId: parentNode.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, parentNode.id)
  const mutatedParent = section?.nodes[parentNode.id]
  const childList = mutatedParent == null ? null : childListForOwnerNode(mutatedParent)

  if (section == null || mutatedParent == null || childList == null) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("invalid-parent", `parent node "${parentNode.id}" child list could not be resolved`, { nodeId: parentNode.id })],
    }
  }

  if (command.index > childList.length) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-index", `index must be at most child count ${childList.length}`, { nodeId: parentNode.id })],
    }
  }

  const usedIds = collectDocumentNodeIds(mutated)
  if (command.columnsId != null && usedIds.has(command.columnsId)) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("duplicate-id", `columns id "${command.columnsId}" already exists`, { nodeId: command.columnsId })],
    }
  }

  const columnsId = command.columnsId ?? uniqueNodeId(`${parentNode.id}-columns-${childList.length + 1}`, usedIds)
  if (command.columnsId != null) usedIds.add(command.columnsId)
  const widthShares = columnWidthShares(command.columnCount)
  const columnIds = widthShares.map((_, index) => uniqueNodeId(`${columnsId}-column-${index + 1}`, usedIds))

  section.nodes[columnsId] = {
    id: columnsId,
    type: "columns",
    props: {},
    columnIds,
  }
  columnIds.forEach((columnId, index) => {
    section.nodes[columnId] = {
      id: columnId,
      type: "column",
      props: { widthShare: widthShares[index] },
      childIds: [],
    }
  })
  childList.splice(command.index, 0, columnsId)

  const affectedIds = [columnsId, ...columnIds]

  return successFromValidatedDocument(command, document, mutated, (finalGraph) => {
    const scope = scopeFromNodes(finalGraph, affectedIds, [parentNode.id])
    return {
      kind: command.kind,
      targetNodeIds: [columnsId],
      validationPolicy: "full",
      historyPolicy: {
        kind: "single-entry",
        durableIntent: "structure",
        summary: `insert columns ${columnsId}`,
      },
      renderInvalidation: renderInvalidation("node-structure", scope),
      scope,
    }
  })
}

function patchColumnsLayout(
  document: DocumentNode,
  command: Extract<VNextOperationCommand, { kind: "columns.layout.patch" }>,
): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const columns = graph.nodesById.get(command.columnsId)
  if (columns == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `columns "${command.columnsId}" was not found`, { nodeId: command.columnsId })],
    }
  }

  if (columns.type !== "columns") {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("not-columns", `columns layout patch requires a columns target; got ${columns.type}`, { nodeId: columns.id })],
    }
  }

  if (command.widthShares.length !== columns.columnIds.length) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-width-count", `widthShares length must equal column count ${columns.columnIds.length}`, { nodeId: columns.id })],
    }
  }

  if (command.widthShares.some((share) => typeof share !== "number" || share <= 0 || share > 100)) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-width-share", "each width share must be a positive number at most 100", { nodeId: columns.id })],
    }
  }

  const total = Number(command.widthShares.reduce((sum, share) => sum + share, 0).toFixed(2))
  if (total !== 100) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-width-total", `widthShares total must be 100.00, got ${total.toFixed(2)}`, { nodeId: columns.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, columns.id)

  if (section == null) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("missing-section", `columns "${columns.id}" has no section`, { nodeId: columns.id })],
    }
  }

  columns.columnIds.forEach((columnId, index) => {
    const column = section.nodes[columnId]
    if (column?.type === "column") {
      column.props.widthShare = command.widthShares[index]
    }
  })

  const affectedIds = [columns.id, ...columns.columnIds]

  return successFromValidatedDocument(command, document, mutated, (finalGraph) => {
    const scope = scopeFromNodes(finalGraph, affectedIds)
    return {
      kind: command.kind,
      targetNodeIds: [columns.id],
      validationPolicy: "full",
      historyPolicy: {
        kind: "single-entry",
        durableIntent: "layout",
        summary: `patch columns layout ${columns.id}`,
      },
      renderInvalidation: renderInvalidation("node-layout", scope),
      scope,
    }
  })
}

function insertTextBlock(document: DocumentNode, command: Extract<VNextOperationCommand, { kind: "text-block.insert" }>): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const parentNode = graph.nodesById.get(command.parentNodeId)
  if (parentNode == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `parent node "${command.parentNodeId}" was not found`, { nodeId: command.parentNodeId })],
    }
  }

  if (!Number.isInteger(command.index) || command.index < 0) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-index", "index must be a non-negative integer", { nodeId: parentNode.id })],
    }
  }

  if (!graph.capabilitiesByType[parentNode.type].allowedChildTypes.includes("text-block")) {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("cannot-insert-text-block", `${parentNode.type} cannot contain text-block children`, { nodeId: parentNode.id })],
    }
  }

  if (graph.nodesById.has(command.node.id)) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("duplicate-id", `node id "${command.node.id}" already exists`, { nodeId: command.node.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, parentNode.id)
  const mutatedParent = section?.nodes[parentNode.id]
  const childList = mutatedParent == null ? null : childListForOwnerNode(mutatedParent)

  if (section == null || mutatedParent == null || childList == null) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("invalid-parent", `parent node "${parentNode.id}" child list could not be resolved`, { nodeId: parentNode.id })],
    }
  }

  if (command.index > childList.length) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-index", `index must be at most child count ${childList.length}`, { nodeId: parentNode.id })],
    }
  }

  section.nodes[command.node.id] = cloneJson(command.node)
  childList.splice(command.index, 0, command.node.id)

  return successFromValidatedDocument(command, document, mutated, (finalGraph) => {
    const scope = scopeFromNodes(finalGraph, [command.node.id], [parentNode.id])
    return {
      kind: command.kind,
      targetNodeIds: [command.node.id],
      validationPolicy: "full",
      historyPolicy: {
        kind: "single-entry",
        durableIntent: "structure",
        summary: `insert text-block ${command.node.id}`,
      },
      renderInvalidation: renderInvalidation("node-structure", scope),
      scope,
    }
  })
}

function replaceTextBlockChildren(
  document: DocumentNode,
  command: Extract<VNextOperationCommand, { kind: "text-block.text.replace" }>,
): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const node = graph.nodesById.get(command.nodeId)
  if (node == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `node "${command.nodeId}" was not found`, { nodeId: command.nodeId })],
    }
  }

  if (node.type !== "text-block") {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("not-text-block", `text replace requires a text-block target; got ${node.type}`, { nodeId: node.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, node.id)
  const mutatedNode = section?.nodes[node.id]
  if (section == null || mutatedNode?.type !== "text-block") {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("missing-text-block", `text-block "${node.id}" could not be resolved`, { nodeId: node.id })],
    }
  }

  mutatedNode.children = cloneJson(command.children)

  const scope = scopeFromNodes(graph, [node.id])

  return commitMutatedDocument(command, document, mutated, {
    kind: command.kind,
    targetNodeIds: [node.id],
    validationPolicy: "full",
    historyPolicy: {
      kind: "single-entry",
      durableIntent: "content",
      summary: `replace text-block children ${node.id}`,
    },
    renderInvalidation: renderInvalidation("text-content", scope),
    scope,
  })
}

function tableRowInsert(document: DocumentNode, command: Extract<VNextOperationCommand, { kind: "table.row.insert" }>): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const table = graph.nodesById.get(command.tableId)
  if (table == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `table "${command.tableId}" was not found`, { nodeId: command.tableId })],
    }
  }

  if (table.type !== "table") {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("not-table", `table row insert requires a table target; got ${table.type}`, { nodeId: table.id })],
    }
  }

  if (!Number.isInteger(command.index) || command.index < 0 || command.index > table.rowIds.length) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-index", `index must be between 0 and row count ${table.rowIds.length}`, { nodeId: table.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, table.id)
  const mutatedTable = section?.nodes[table.id]

  if (section == null || mutatedTable?.type !== "table") {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("missing-table", `table "${table.id}" could not be resolved`, { nodeId: table.id })],
    }
  }

  const usedIds = collectDocumentNodeIds(mutated)
  if (command.rowId != null && usedIds.has(command.rowId)) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("duplicate-id", `row id "${command.rowId}" already exists`, { nodeId: command.rowId })],
    }
  }

  const rowId = command.rowId ?? uniqueNodeId(`${table.id}-row-${table.rowIds.length + 1}`, usedIds)
  if (command.rowId != null) usedIds.add(command.rowId)

  const cellNodes: TableCellNode[] = table.columns.map((_, index) => {
    const cellId = uniqueNodeId(`${rowId}-cell-${index + 1}`, usedIds)
    return {
      id: cellId,
      type: "table-cell",
      props: {},
      childIds: [uniqueNodeId(`${cellId}-text`, usedIds)],
    }
  })
  const textBlocks: TextBlockNode[] = cellNodes.map((cell) => ({
    id: cell.childIds[0],
    type: "text-block",
    role: { role: "paragraph" },
    props: {},
    children: [{ id: `${cell.childIds[0]}-inline-1`, type: "text", text: "" }],
  }))
  const row: TableRowNode = {
    id: rowId,
    type: "table-row",
    props: {},
    cellIds: cellNodes.map((cell) => cell.id),
  }

  mutatedTable.rowIds.splice(command.index, 0, row.id)
  section.nodes[row.id] = row
  cellNodes.forEach((cell) => {
    section.nodes[cell.id] = cell
  })
  textBlocks.forEach((textBlock) => {
    section.nodes[textBlock.id] = textBlock
  })

  const affectedIds = [table.id, row.id, ...cellNodes.map((cell) => cell.id), ...textBlocks.map((textBlock) => textBlock.id)]

  return successFromValidatedDocument(command, document, mutated, (finalGraph) => {
    const scope = scopeFromNodes(finalGraph, affectedIds, [table.id])
    return {
      kind: command.kind,
      targetNodeIds: [table.id, row.id],
      validationPolicy: "full",
      historyPolicy: {
        kind: "single-entry",
        durableIntent: "structure",
        summary: `insert table row ${row.id}`,
      },
      renderInvalidation: renderInvalidation("node-structure", scope),
      scope,
    }
  })
}

function tableRowDelete(document: DocumentNode, command: Extract<VNextOperationCommand, { kind: "table.row.delete" }>): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const row = graph.nodesById.get(command.rowId)
  if (row == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `table row "${command.rowId}" was not found`, { nodeId: command.rowId })],
    }
  }

  if (row.type !== "table-row") {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("not-table-row", `table row delete requires a table-row target; got ${row.type}`, { nodeId: row.id })],
    }
  }

  const parent = graph.parentByNodeId.get(row.id)
  if (parent?.kind !== "table") {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("invalid-parent", `table row "${row.id}" parent table could not be resolved`, { nodeId: row.id })],
    }
  }

  const table = graph.nodesById.get(parent.tableId)
  if (table?.type !== "table") {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("missing-table", `table "${parent.tableId}" could not be resolved`, { nodeId: parent.tableId })],
    }
  }

  if (table.rowIds.length <= 1) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("cannot-delete-last-row", "table.row.delete cannot remove the last table row", { nodeId: row.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, row.id)
  const mutatedTable = section?.nodes[table.id]

  if (section == null || mutatedTable?.type !== "table") {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("missing-table", `table "${table.id}" could not be resolved`, { nodeId: table.id })],
    }
  }

  const deleteIds = collectDescendantIds(graph, row.id)
  mutatedTable.rowIds.splice(parent.index, 1)
  deleteIds.forEach((deleteId) => {
    delete section.nodes[deleteId]
  })

  const affectedIds = [table.id, ...deleteIds]
  const scope = scopeFromNodes(graph, affectedIds, [table.id])

  return commitMutatedDocument(command, document, mutated, {
    kind: command.kind,
    targetNodeIds: [table.id, row.id],
    validationPolicy: "full",
    historyPolicy: {
      kind: "single-entry",
      durableIntent: "structure",
      summary: `delete table row ${row.id}`,
    },
    renderInvalidation: renderInvalidation("node-structure", scope),
    scope,
  })
}

function insertedTableColumnWidth(tableColumns: { width: UnitValue }[], index: number, width?: UnitValue): UnitValue {
  if (width != null) return cloneJson(width)
  return cloneJson(tableColumns[index]?.width ?? tableColumns[index - 1]?.width ?? { value: 100, unit: "pt" })
}

function tableColumnInsert(
  document: DocumentNode,
  command: Extract<VNextOperationCommand, { kind: "table.column.insert" }>,
): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const table = graph.nodesById.get(command.tableId)
  if (table == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `table "${command.tableId}" was not found`, { nodeId: command.tableId })],
    }
  }

  if (table.type !== "table") {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("not-table", `table column insert requires a table target; got ${table.type}`, { nodeId: table.id })],
    }
  }

  if (!Number.isInteger(command.index) || command.index < 0 || command.index > table.columns.length) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-index", `index must be between 0 and column count ${table.columns.length}`, { nodeId: table.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, table.id)
  const mutatedTable = section?.nodes[table.id]

  if (section == null || mutatedTable?.type !== "table") {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("missing-table", `table "${table.id}" could not be resolved`, { nodeId: table.id })],
    }
  }

  const usedIds = collectDocumentNodeIds(mutated)
  const cellNodes: TableCellNode[] = []
  const textBlocks: TextBlockNode[] = []

  table.rowIds.forEach((rowId) => {
    const row = section.nodes[rowId]
    if (row?.type !== "table-row") return

    const cellId = uniqueNodeId(`${rowId}-cell-${command.index + 1}`, usedIds)
    const textBlockId = uniqueNodeId(`${cellId}-text`, usedIds)
    const cell: TableCellNode = {
      id: cellId,
      type: "table-cell",
      props: {},
      childIds: [textBlockId],
    }
    const textBlock: TextBlockNode = {
      id: textBlockId,
      type: "text-block",
      role: { role: "paragraph" },
      props: {},
      children: [{ id: `${textBlockId}-inline-1`, type: "text", text: "" }],
    }
    row.cellIds.splice(command.index, 0, cell.id)
    section.nodes[cell.id] = cell
    section.nodes[textBlock.id] = textBlock
    cellNodes.push(cell)
    textBlocks.push(textBlock)
  })

  mutatedTable.columns.splice(command.index, 0, { width: insertedTableColumnWidth(table.columns, command.index, command.width) })

  const affectedIds = [table.id, ...cellNodes.map((cell) => cell.id), ...textBlocks.map((textBlock) => textBlock.id)]

  return successFromValidatedDocument(command, document, mutated, (finalGraph) => {
    const scope = scopeFromNodes(finalGraph, affectedIds, [table.id])
    return {
      kind: command.kind,
      targetNodeIds: [table.id],
      validationPolicy: "full",
      historyPolicy: {
        kind: "single-entry",
        durableIntent: "structure",
        summary: `insert table column ${table.id}[${command.index}]`,
      },
      renderInvalidation: renderInvalidation("node-structure", scope),
      scope,
    }
  })
}

function tableColumnDelete(
  document: DocumentNode,
  command: Extract<VNextOperationCommand, { kind: "table.column.delete" }>,
): VNextOperationResult {
  const graph = graphOrFailure(command, document)
  if ("ok" in graph) return graph

  const table = graph.nodesById.get(command.tableId)
  if (table == null) {
    return {
      ok: false,
      command,
      document,
      reason: "target-not-found",
      issues: [issue("target-not-found", `table "${command.tableId}" was not found`, { nodeId: command.tableId })],
    }
  }

  if (table.type !== "table") {
    return {
      ok: false,
      command,
      document,
      reason: "unsupported-target",
      issues: [issue("not-table", `table column delete requires a table target; got ${table.type}`, { nodeId: table.id })],
    }
  }

  if (!Number.isInteger(command.index) || command.index < 0 || command.index >= table.columns.length) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("invalid-index", `index must be between 0 and column count ${table.columns.length - 1}`, { nodeId: table.id })],
    }
  }

  if (table.columns.length <= 1) {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-command",
      issues: [issue("cannot-delete-last-column", "table.column.delete cannot remove the last table column", { nodeId: table.id })],
    }
  }

  const mutated = cloneJson(document)
  const section = sectionForNode(mutated, graph, table.id)
  const mutatedTable = section?.nodes[table.id]

  if (section == null || mutatedTable?.type !== "table") {
    return {
      ok: false,
      command,
      document,
      reason: "invalid-document",
      issues: [issue("missing-table", `table "${table.id}" could not be resolved`, { nodeId: table.id })],
    }
  }

  const deleteIds: NodeId[] = []
  table.rowIds.forEach((rowId) => {
    const row = section.nodes[rowId]
    if (row?.type !== "table-row") return
    const cellId = row.cellIds[command.index]
    if (cellId == null) return

    row.cellIds.splice(command.index, 1)
    collectDescendantIds(graph, cellId).forEach((deleteId) => {
      deleteIds.push(deleteId)
      delete section.nodes[deleteId]
    })
  })
  mutatedTable.columns.splice(command.index, 1)

  const affectedIds = [table.id, ...deleteIds]
  const scope = scopeFromNodes(graph, affectedIds, [table.id])

  return commitMutatedDocument(command, document, mutated, {
    kind: command.kind,
    targetNodeIds: [table.id],
    validationPolicy: "full",
    historyPolicy: {
      kind: "single-entry",
      durableIntent: "structure",
      summary: `delete table column ${table.id}[${command.index}]`,
    },
    renderInvalidation: renderInvalidation("node-structure", scope),
    scope,
  })
}

export function runVNextOperation(document: DocumentNode, command: VNextOperationCommand): VNextOperationResult {
  if (command.kind === "node.delete") return deleteNode(document, command)
  if (command.kind === "node.duplicate") return duplicateNode(document, command)
  if (command.kind === "node.reorder") return reorderNode(document, command)
  if (command.kind === "columns.insert") return insertColumns(document, command)
  if (command.kind === "columns.layout.patch") return patchColumnsLayout(document, command)
  if (command.kind === "text-block.insert") return insertTextBlock(document, command)
  if (command.kind === "text-block.text.replace") return replaceTextBlockChildren(document, command)
  if (command.kind === "table.row.insert") return tableRowInsert(document, command)
  if (command.kind === "table.row.delete") return tableRowDelete(document, command)
  if (command.kind === "table.column.insert") return tableColumnInsert(document, command)
  return tableColumnDelete(document, command)
}
