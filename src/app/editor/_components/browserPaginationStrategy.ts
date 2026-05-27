import type { DocumentNode, LayoutNode } from "@/schema"

export const BACKGROUND_BROWSER_PAGINATION_WEIGHT_THRESHOLD = 220

function layoutNodeWeight(node: LayoutNode | undefined): number {
  if (!node) return 0
  switch (node.type) {
    case "paragraph":
    case "spacer":
    case "divider":
    case "page-break":
    case "toc":
      return 1
    case "body":
    case "stack":
    case "row":
    case "flow-row":
    case "flow-stack":
      return 1
    case "flow-table": {
      const cellContentWeight = Object.values(node.nodes).reduce((sum, child) => {
        if (child.type === "paragraph" || child.type === "spacer") return sum + 1
        if (child.type === "flow-table-cell") {
          const childIds = (child as { childIds?: unknown }).childIds
          return sum + (Array.isArray(childIds) ? childIds.length : 0)
        }
        if (child.type === "flow-table-row") {
          const cellIds = (child as { cellIds?: unknown }).cellIds
          return sum + (Array.isArray(cellIds) ? cellIds.length : 0)
        }
        return sum
      }, 0)
      return 1 + node.rowIds.length + node.columns.length + cellContentWeight
    }
  }
}

export function estimateDocumentPaginationWeight(doc: DocumentNode): number {
  return doc.document.sections.reduce((total, section) => (
    total + Object.values(section.nodes).reduce((sum, node) => sum + layoutNodeWeight(node), 0)
  ), 0)
}

export function shouldUseBackgroundBrowserPagination(input: {
  doc: DocumentNode
  canUseWorker: boolean
  inlineEditNodeId: string | null
}): boolean {
  if (!input.canUseWorker) return false
  if (input.inlineEditNodeId !== null) return false
  return estimateDocumentPaginationWeight(input.doc) >= BACKGROUND_BROWSER_PAGINATION_WEIGHT_THRESHOLD
}
