import type {
  DocumentNode,
  FlowTableCellNode,
  FlowTableNode,
  FlowTableRowNode,
  LayoutNode,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@/schema"

export type SelectionContextNode = LayoutNode | TableRowNode | TableCellNode | FlowTableRowNode | FlowTableCellNode

export interface SelectionContextItem {
  nodeId: string
  type: SelectionContextNode["type"]
  label: string
}

const NODE_LABELS: Record<SelectionContextNode["type"], string> = {
  body: "Body",
  paragraph: "Paragraph",
  spacer: "Spacer",
  row: "Row",
  stack: "Stack",
  "flow-row": "Row",
  "flow-stack": "Stack",
  table: "Table",
  "flow-table": "Flow table",
  "table-row": "Table row",
  "table-cell": "Table cell",
  "flow-table-row": "Flow table row",
  "flow-table-cell": "Flow table cell",
  toc: "Table of contents",
}

function hasChildIds(node: unknown): node is { childIds: string[] } {
  return typeof node === "object" &&
    node !== null &&
    Array.isArray((node as { childIds?: unknown }).childIds)
}

type TableLikeNode = TableNode | FlowTableNode

function isTableLikeNode(node: LayoutNode): node is LayoutNode & TableLikeNode {
  return node.type === "table" || node.type === "flow-table"
}

function isTableRowLikeNode(node: TableLikeNode["nodes"][string]): node is TableRowNode | FlowTableRowNode {
  return node.type === "table-row" || node.type === "flow-table-row"
}

export function findSelectionContextNode(doc: DocumentNode, nodeId: string): SelectionContextNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node) return node as SelectionContextNode

    for (const candidate of Object.values(section.nodes)) {
      if (!isTableLikeNode(candidate)) continue
      const table = candidate as unknown as TableLikeNode
      const inner = table.nodes[nodeId]
      if (inner) return inner as SelectionContextNode
    }
  }
  return null
}

function findSelectionContextParent(doc: DocumentNode, nodeId: string): { nodeId: string; node: SelectionContextNode } | null {
  for (const section of doc.document.sections) {
    for (const [candidateId, candidate] of Object.entries(section.nodes)) {
      if (hasChildIds(candidate) && candidate.childIds.includes(nodeId)) {
        return { nodeId: candidateId, node: candidate as SelectionContextNode }
      }

      if (!isTableLikeNode(candidate)) continue
      const table = candidate as unknown as TableLikeNode
      if (table.rowIds.includes(nodeId)) return { nodeId: candidateId, node: table as SelectionContextNode }

      for (const [innerId, inner] of Object.entries(table.nodes)) {
        if (isTableRowLikeNode(inner) && inner.cellIds.includes(nodeId)) {
          return { nodeId: innerId, node: inner }
        }
        if (hasChildIds(inner) && inner.childIds.includes(nodeId)) {
          return { nodeId: innerId, node: inner as SelectionContextNode }
        }
      }
    }
  }
  return null
}

function shouldShowContextNode(node: SelectionContextNode): boolean {
  return node.type !== "body"
}

function labelSelectionContextNode(node: SelectionContextNode): string {
  return NODE_LABELS[node.type] ?? node.type
}

export function buildSelectionContext(doc: DocumentNode, anchorNodeId: string | null | undefined): SelectionContextItem[] {
  if (!anchorNodeId) return []

  const chain: SelectionContextItem[] = []
  const seen = new Set<string>()
  let currentId: string | null = anchorNodeId

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId)
    const node = findSelectionContextNode(doc, currentId)
    if (!node) break

    if (shouldShowContextNode(node)) {
      chain.push({
        nodeId: currentId,
        type: node.type,
        label: labelSelectionContextNode(node),
      })
    }

    currentId = findSelectionContextParent(doc, currentId)?.nodeId ?? null
  }

  return chain.reverse()
}
